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

const loanArgs = (principalCents: number, pctYear: number, months: number) => ({
  p: Math.max(0, Math.round(principalCents || 0)),
  r: Math.max(0, pctYear || 0) / 1200,
  n: Math.max(1, Math.round(months || 1)),
});

/**
 * The fixed monthly installment (in cents) for a loan: yearly rate ÷ 12 each month, no fees, paid off in `months`.
 * 0% → amount ÷ months. Rounded to the cent; the last payment of loanTotals() absorbs the rounding.
 */
export function installment(principalCents: number, pctYear: number, months: number): number {
  const { p, r, n } = loanArgs(principalCents, pctYear, months);
  if (r === 0) return Math.round(p / n);
  return Math.round((p * r) / (1 - Math.pow(1 + r, -n)));
}

export interface LoanMonth {
  /** What is paid this month. */
  pay: number;
  /** The part of it that is interest (on what was still owed). */
  interest: number;
  /** The part of it that pays back the capital. */
  capital: number;
  /** Still owed afterwards. */
  owed: number;
}

export interface LoanTotals {
  installment: number;
  /** The last payment (the installment ± the rounding). */
  last: number;
  months: number;
  /** Everything paid: exactly the sum of the payments. */
  total: number;
  /** total − the amount borrowed. */
  interest: number;
  schedule: LoanMonth[];
}

/**
 * A loan month by month: each month's interest is charged on what is still owed (rounded to the cent), the installment
 * pays that interest first and the rest pays back capital. The last payment clears whatever is left.
 */
export function loanTotals(principalCents: number, pctYear: number, months: number): LoanTotals {
  const { p, r, n } = loanArgs(principalCents, pctYear, months);
  const inst = installment(p, pctYear, n);
  const schedule: LoanMonth[] = [];
  let owed = p;
  for (let i = 1; i <= n; i++) {
    const interest = Math.round(owed * r);
    const pay = i === n ? owed + interest : Math.max(0, Math.min(inst, owed + interest));
    const capital = pay - interest;
    owed -= capital;
    schedule.push({ pay, interest, capital, owed });
  }
  const total = schedule.reduce((s, x) => s + x.pay, 0);
  return { installment: inst, last: schedule[n - 1].pay, months: n, total, interest: total - p, schedule };
}

/** An amount per week or per month, as about-per-month (a month = 52/12 weeks). */
export function perMonth(cents: number, period: 'week' | 'month' | null): number {
  return period === 'week' ? Math.round((cents * 52) / 12) : cents;
}

/**
 * A fixed real-world example amount (a phone, a laptop, a salary), written in rand cents, in the family's currency:
 * as is for ZAR, a tenth for every other currency (a €500 phone, not a €5,000 one), rounded to whole units.
 * Not for the family's own numbers (pocket money): those are real already.
 */
export function exampleCents(currency: string, randCents: number): number {
  return currency === 'ZAR' ? randCents : Math.round(randCents / 1000) * 100;
}

/** "2%", "1.5%" */
export function pct(n: number): string {
  return `${Number(n.toFixed(1)).toLocaleString('en-GB')}%`;
}
