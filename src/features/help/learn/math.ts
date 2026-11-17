// Money school maths (lessons + widgets). Pure: cents in, cents out.

/** Guards against float noise like 59.999999 before rounding down. */
const EPS = 1e-9;

/** Default % a month when the family never set one (same default as the server). */
export const DEFAULT_PCT_MONTH = 2;

/** The family savings bonus for one week: the server's exact rule (weekly tick: interest). */
export function weeklyBonus(savingsCents: number, pctMonth: number): number {
  return Math.floor((Math.max(0, savingsCents) * pctMonth * 12) / (100 * 52) + EPS);
}

export interface Growth { startCents: number; weeklyCents: number; weeks: number }

/** Start + everything added, nothing extra. */
export function growNoInterest({ startCents, weeklyCents, weeks }: Growth): number {
  return startCents + weeklyCents * weeks;
}

/** Our family savings bonus: each week the addition goes in, then the bonus is paid on the total (compounds weekly). */
export function growFamilyBonus({ startCents, weeklyCents, weeks }: Growth, pctMonth: number): number {
  let s = startCents;
  for (let w = 0; w < weeks; w++) {
    s += weeklyCents;
    s += weeklyBonus(s, pctMonth);
  }
  return s;
}

/** A bank paying `pctYear` a year, compounded monthly (a month ≈ 52/12 weeks). */
export function growBank({ startCents, weeklyCents, weeks }: Growth, pctYear = 5): number {
  let s = startCents;
  let months = 0;
  for (let w = 1; w <= weeks; w++) {
    s += weeklyCents;
    const due = Math.floor((w * 12) / 52 + EPS);
    while (months < due) {
      s += Math.floor((s * pctYear) / 1200 + EPS);
      months++;
    }
  }
  return s;
}

/** What the weekly family bonus adds up to over a year, in % (compounded weekly). */
export function familyYearPct(pctMonth: number): number {
  return (Math.pow(1 + (pctMonth * 12) / 5200, 52) - 1) * 100;
}

/** Simple interest: the balance after year 1…n (interest only on the start). */
export function simpleYears(startCents: number, pctYear: number, years: number): number[] {
  return Array.from({ length: years }, (_, i) => Math.round(startCents + (startCents * pctYear * (i + 1)) / 100));
}

/** Compound interest once a year: the balance after year 1…n (interest on the interest too). */
export function compoundYears(startCents: number, pctYear: number, years: number): number[] {
  const out: number[] = [];
  let s = startCents;
  for (let i = 0; i < years; i++) {
    s = Math.round(s * (1 + pctYear / 100));
    out.push(s);
  }
  return out;
}

/** Owing `cents` at `pctYear` a year, compounded monthly, after `months` with nothing paid back. */
export function owedAfter(cents: number, pctYear: number, months: number): number {
  return Math.round(cents * Math.pow(1 + pctYear / 1200, months));
}

/** Weeks to reach a price: 0 = already there, null = never (nothing saved per week). */
export function weeksToGoal(priceCents: number, savedCents: number, perWeekCents: number): number | null {
  const left = priceCents - savedCents;
  if (left <= 0) return 0;
  if (perWeekCents <= 0) return null;
  return Math.ceil(left / perWeekCents);
}

/** Split an amount into Spend / Save / Give by percentages (Spend gets what's left, so it always adds up). */
export function splitJars(amountCents: number, savePct: number, givePct: number): { spend: number; save: number; give: number } {
  const save = Math.round((amountCents * savePct) / 100);
  const give = Math.round((amountCents * givePct) / 100);
  return { spend: amountCents - save - give, save, give };
}

/** "2%", "1.5%" */
export function pct(n: number): string {
  return `${Number(n.toFixed(1)).toLocaleString('en-GB')}%`;
}
