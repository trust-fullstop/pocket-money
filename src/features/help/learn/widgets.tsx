// Money school widgets: try-it tools inside lessons. Everything is in the family currency, nothing is saved.
import { useId, useState, type ReactNode } from 'react';
import { AmountInput, Chip, Icon, cx } from '../../../components/ui';
import { addDays, formatDate, plural } from '../../../lib/format';
import { useApp } from '../../../lib/session';
import { bonusOn, pctMonthOf } from './lessons';
import { exampleCents, familyYearPct, growBank, growFamilyBonus, growNoInterest, loanTotals, pct, perMonth, splitJars, weeksToGoal } from './math';
import { EXAMPLE_LOAN } from './seriesLessons';
import type { Block, LessonCtx } from './types';
import { MarkIcon, RadioCards, type Mark } from './ui';

type WidgetKind = Extract<Block, { kind: 'widget' }>['widget'];

export function Widget({ kind, ctx }: { kind: WidgetKind; ctx: LessonCtx }) {
  switch (kind) {
    case 'interest': return <InterestWidget ctx={ctx} />;
    case 'jars': return <JarsWidget ctx={ctx} />;
    case 'goal': return <GoalWidget ctx={ctx} />;
    case 'needs-wants': return <NeedsWantsWidget />;
    case 'loan': return <LoanWidget ctx={ctx} />;
  }
}

function WidgetBox({ emoji, title, children }: { emoji: string; title: string; children: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="space-y-4 rounded-2xl border-2 border-accent/30 bg-surface p-4">
      <h3 id={id} className="flex items-center gap-2 text-lg font-bold">
        <span aria-hidden="true">{emoji}</span>{title}
      </h3>
      {children}
    </section>
  );
}

// ---------------------------------------------------------------- interest

const WEEK_CHOICES = [4, 12, 26, 52];
const MAX_CENTS = 100_000_000;

function InterestWidget({ ctx }: { ctx: LessonCtx }) {
  const { m } = ctx;
  const [start, setStart] = useState<number | null>(10000);
  const [weekly, setWeekly] = useState<number | null>(1000);
  const [weeks, setWeeks] = useState(52);
  const weeksLabel = useId();
  const g = { startCents: start ?? 0, weeklyCents: weekly ?? 0, weeks };
  const plain = growNoInterest(g);
  const bonus = bonusOn(ctx);
  const pm = pctMonthOf(ctx);
  const family = bonus ? growFamilyBonus(g, pm) : null;
  const bank = growBank(g, 5);

  return (
    <WidgetBox emoji="🧮" title="Watch it grow">
      <AmountInput kind="money" label="Start with" value={start} onChange={setStart} max={MAX_CENTS} />
      <AmountInput kind="money" label="Add every week" value={weekly} onChange={setWeekly} max={MAX_CENTS} />
      <div>
        <p id={weeksLabel} className="mb-2 font-semibold">For how many weeks?</p>
        <div role="group" aria-labelledby={weeksLabel} className="flex flex-wrap gap-2">
          {WEEK_CHOICES.map((w) => (
            <Chip key={w} selected={weeks === w} onClick={() => setWeeks(w)}>
              {w === 52 ? '52 weeks (1 year)' : `${w} weeks`}
            </Chip>
          ))}
        </div>
      </div>

      <div aria-live="polite" className="space-y-2">
        <p className="font-semibold">After {weeks} weeks you’d have:</p>
        <div className={cx('grid gap-2', family != null ? 'grid-cols-3' : 'grid-cols-2')}>
          <Result emoji="🧦" label="No interest" value={m(plain)} />
          {family != null && (
            <Result
              emoji="🐷" label="Our family savings bonus" value={m(family)} extra={`+${m(family - plain)}`}
              note={`${pct(pm)} a month ≈ ${Math.round(familyYearPct(pm))}% a year`} highlight
            />
          )}
          <Result emoji="🏦" label="A real bank at 5% a year (example)" value={m(bank)} extra={`+${m(bank - plain)}`} />
        </div>
      </div>

      <p className="text-[15px] leading-relaxed text-muted">
        {bonus
          ? 'Our family savings bonus is paid by your parents to reward saving. It’s much higher than a real bank, which pays a few percent a year.'
          : 'Our family doesn’t use a savings bonus right now. Real banks pay a few percent a year: ask a parent what yours pays.'}
      </p>
    </WidgetBox>
  );
}

function Result({ emoji, label, value, extra, note, highlight }: {
  emoji: string; label: string; value: string; extra?: string; note?: string; highlight?: boolean;
}) {
  return (
    <div className={cx('flex min-w-0 flex-col rounded-xl border p-2.5', highlight ? 'border-accent bg-accent-soft' : 'border-line bg-surface-2')}>
      <span className="text-xl" aria-hidden="true">{emoji}</span>
      <span className="text-[13px] font-semibold leading-tight text-muted">{label}</span>
      <span className="mt-auto break-words pt-1.5 text-[16px] font-bold tabular-nums leading-tight">{value}</span>
      {extra && <span className="text-[13px] font-semibold tabular-nums text-good">{extra}</span>}
      {note && <span className="text-[12px] leading-tight text-accent-ink">{note}</span>}
    </div>
  );
}

// ---------------------------------------------------------------- jars

function JarsWidget({ ctx }: { ctx: LessonCtx }) {
  const { m } = ctx;
  const faith = ctx.on('faith');
  const own = ctx.allowanceCents > 0;
  const [amount, setAmount] = useState<number | null>(own ? ctx.allowanceCents : 10000);
  const [save, setSave] = useState(20);
  const [give, setGive] = useState(faith ? 10 : 0);
  const per = ctx.allowancePeriod === 'month' ? 'month' : 'week';
  const times = per === 'month' ? 12 : 52;
  const cents = amount ?? 0;
  const split = splitJars(cents, save, give);
  const spendPct = 100 - save - give;

  const jars = [
    { key: 'spend', emoji: '👛', label: 'Spend', pct: spendPct, cents: split.spend, bar: 'bg-accent' },
    { key: 'save', emoji: '🐷', label: 'Save', pct: save, cents: split.save, bar: 'bg-good' },
    { key: 'give', emoji: '🎁', label: 'Give', pct: give, cents: split.give, bar: 'bg-warn' },
  ];

  return (
    <WidgetBox emoji="💰" title="Spend, save, give">
      <AmountInput kind="money" label={own ? `Your pocket money (a ${per})` : `Money you get (a ${per})`} value={amount} onChange={setAmount} max={MAX_CENTS} />

      <div className="space-y-2">
        <Stepper label="Save" emoji="🐷" value={save} onChange={setSave} max={100 - give} />
        <Stepper label="Give" emoji="🎁" value={give} onChange={setGive} max={100 - save} />
        <p className="px-1 text-[15px] text-muted">Spend gets the rest: <strong className="text-ink">{spendPct}%</strong></p>
      </div>

      <div className="flex h-4 overflow-hidden rounded-full bg-surface-2" aria-hidden="true">
        {jars.map((j) => j.pct > 0 && <div key={j.key} className={j.bar} style={{ width: `${j.pct}%` }} />)}
      </div>

      <ul className="grid grid-cols-3 gap-2">
        {jars.map((j) => (
          <li key={j.key} className="min-w-0 rounded-xl border border-line bg-surface-2 p-2.5">
            <p className="text-[14px] font-semibold text-muted"><span aria-hidden="true">{j.emoji} </span>{j.label} {j.pct}%</p>
            <p className="break-words text-[16px] font-bold tabular-nums">{m(j.cents)}</p>
            <p className="text-[13px] leading-tight text-muted"><span className="tabular-nums">{m(j.cents * times)}</span> in a year</p>
          </li>
        ))}
      </ul>
      <p className="sr-only" aria-live="polite">
        Spend {m(split.spend)}, save {m(split.save)}, give {m(split.give)} every {per}.
      </p>

      <p className="text-[15px] leading-relaxed text-muted">
        This is a learning tool only. In the app you have two pots: Wallet and Savings. Giving you do in real life.
      </p>
    </WidgetBox>
  );
}

function Stepper({ label, emoji, value, onChange, max }: {
  label: string; emoji: string; value: number; onChange: (v: number) => void; max: number;
}) {
  const step = 5;
  const btn = 'grid size-11 shrink-0 place-items-center rounded-full border border-line bg-surface text-ink transition hover:bg-surface-2 disabled:opacity-40';
  return (
    <div className="flex items-center gap-3 rounded-xl bg-surface-2 px-3 py-1.5">
      <span className="min-w-0 flex-1 font-semibold"><span aria-hidden="true">{emoji} </span>{label}</span>
      <button type="button" className={btn} onClick={() => onChange(Math.max(0, value - step))} disabled={value <= 0} aria-label={`Less to ${label}`}>
        <Icon name="minus" size={20} />
      </button>
      <span className="w-12 text-center text-lg font-bold tabular-nums">{value}%</span>
      <button type="button" className={btn} onClick={() => onChange(Math.min(max, value + step))} disabled={value + step > max} aria-label={`More to ${label}`}>
        <Icon name="plus" size={20} />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------- goal

function GoalWidget({ ctx }: { ctx: LessonCtx }) {
  const { m } = ctx;
  const { state } = useApp();
  const [price, setPrice] = useState<number | null>(50000);
  const [saved, setSaved] = useState<number | null>(10000);
  const [perWeek, setPerWeek] = useState<number | null>(2000);
  const left = Math.max(0, (price ?? 0) - (saved ?? 0));
  const n = weeksToGoal(price ?? 0, saved ?? 0, perWeek ?? 0);

  let result: ReactNode;
  if (!price) result = 'Type the price of your goal.';
  else if (n === 0) result = <>🎉 You already have enough!</>;
  else if (n == null) result = <>Save a little every week to get there. Even a small amount helps!</>;
  else {
    result = (
      <>
        About <strong className="text-accent-ink">{n} {n === 1 ? 'week' : 'weeks'}</strong>
        {state?.today && <> (until {formatDate(addDays(state.today, n * 7), { long: true })})</>}
      </>
    );
  }

  return (
    <WidgetBox emoji="🎯" title="How long until I have it?">
      <AmountInput kind="money" label="Price" value={price} onChange={setPrice} max={MAX_CENTS} />
      <AmountInput kind="money" label="Already saved" value={saved} onChange={setSaved} max={MAX_CENTS} />
      <AmountInput kind="money" label="I can save every week" value={perWeek} onChange={setPerWeek} max={MAX_CENTS} />
      <div aria-live="polite" className="rounded-xl bg-accent-soft px-4 py-3">
        <p className="text-[17px] font-semibold">{result}</p>
        {price != null && price > 0 && left > 0 && <p className="text-[15px] text-muted">Still to save: {m(left)}</p>}
      </div>
    </WidgetBox>
  );
}

// ---------------------------------------------------------------- needs & wants

type NW = 'need' | 'want';
const ITEMS: { id: string; emoji: string; label: string; answer: NW | 'depends'; why: string }[] = [
  { id: 'food', emoji: '🍞', label: 'Food', answer: 'need', why: 'Everyone needs to eat to stay healthy.' },
  { id: 'shoes', emoji: '👟', label: 'School shoes', answer: 'need', why: 'You need shoes that fit to go to school.' },
  { id: 'data', emoji: '📱', label: 'Phone data', answer: 'depends', why: 'Data for homework or to reach your family can be a need. Data for videos and games is a want.' },
  { id: 'game', emoji: '🎮', label: 'A new game', answer: 'want', why: 'Fun, but you can live without it.' },
  { id: 'sweets', emoji: '🍬', label: 'Sweets', answer: 'want', why: 'Tasty, but not something you need.' },
  { id: 'bus', emoji: '🚌', label: 'Bus fare', answer: 'need', why: 'You need to get to school and back safely.' },
  { id: 'cap', emoji: '🧢', label: 'A designer cap', answer: 'want', why: 'A cap for the sun can be useful, but the designer label is a want.' },
  { id: 'gift', emoji: '🎁', label: 'A birthday gift for a friend', answer: 'depends', why: 'Being kind to friends matters. A small or homemade gift shows you care just as much as an expensive one.' },
];

function NeedsWantsWidget() {
  const [picks, setPicks] = useState<Record<string, NW>>({});
  const answered = ITEMS.filter((i) => picks[i.id]);
  const clear = ITEMS.filter((i) => i.answer !== 'depends');
  const right = clear.filter((i) => picks[i.id] === i.answer).length;
  const all = answered.length === ITEMS.length;

  return (
    <WidgetBox emoji="🤔" title="Need or want?">
      <p className="text-[15px] text-muted">Tap Need or Want for each one.</p>
      <ul className="space-y-4">
        {ITEMS.map((item) => {
          const pick = picks[item.id] ?? null;
          const mark: Mark | undefined = pick ? (item.answer === 'depends' ? 'maybe' : pick === item.answer ? 'right' : 'wrong') : undefined;
          const fbId = `nw-${item.id}`;
          return (
            <li key={item.id}>
              <RadioCards<NW>
                legend={<><span aria-hidden="true">{item.emoji} </span>{item.label}</>}
                columns={2} value={pick} onChange={(v) => setPicks((p) => ({ ...p, [item.id]: v }))}
                describedBy={mark ? fbId : undefined}
                options={[
                  { value: 'need', label: 'Need', mark: pick === 'need' ? mark : undefined },
                  { value: 'want', label: 'Want', mark: pick === 'want' ? mark : undefined },
                ]}
              />
              <div aria-live="polite">
                {mark && (
                  <p id={fbId} className="mt-2 flex gap-2 text-[15px] leading-snug">
                    <MarkIcon mark={mark} />
                    <span>
                      <strong>
                        {mark === 'maybe' ? 'It depends! ' : mark === 'right' ? 'Right! ' : `Not quite: it’s a ${item.answer}. `}
                      </strong>
                      {item.why}
                    </span>
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <div aria-live="polite">
        {all && (
          <p className="rounded-xl bg-accent-soft px-4 py-3 text-[16px] font-semibold">
            You got {right} of {clear.length} clear ones right.{' '}
            {ITEMS.length - clear.length} were “it depends”: sometimes there isn’t one right answer, so think about why you want it.
          </p>
        )}
      </div>
    </WidgetBox>
  );
}

// ---------------------------------------------------------------- loan

const MONTH_CHOICES = [12, 24, 36];

function LoanWidget({ ctx }: { ctx: LessonCtx }) {
  const { m } = ctx;
  // Starts with the lesson's example loan, so the numbers match the text above it.
  const [amount, setAmount] = useState<number | null>(() => exampleCents(ctx.currency, EXAMPLE_LOAN.randCents));
  const [rate, setRate] = useState(EXAMPLE_LOAN.pct);
  const [months, setMonths] = useState(12);
  const cents = amount ?? 0;
  const t = loanTotals(cents, rate, months);
  const pocket = ctx.allowanceCents > 0 ? perMonth(ctx.allowanceCents, ctx.allowancePeriod) : 0;
  const share = pocket > 0 ? t.installment / pocket : 0;

  let fit: ReactNode = null;
  if (pocket > 0 && cents > 0) {
    const of = <>about <strong className="tabular-nums">{Math.round(share * 100)}%</strong> of your pocket money (about {m(pocket)} a month)</>;
    fit = share <= 0.25
      ? <>That’s {of}. It fits the quarter rule. 👍</>
      : share <= 1
        ? <>That’s {of}. More than a quarter: it would squeeze everything else. 😬</>
        : <>That’s more than all your pocket money every month ({m(pocket)}). 🛑</>;
  }

  return (
    <WidgetBox emoji="📅" title="What does a loan cost?">
      <AmountInput kind="money" label="Amount you borrow" value={amount} onChange={setAmount} max={MAX_CENTS} />
      <RangeField label="Interest a year" value={rate} onChange={setRate} min={0} max={30} step={0.5} format={pct} />
      <RangeField
        label="Pay back over" value={months} onChange={setMonths} min={1} max={60} step={1}
        format={(v) => plural(v, 'month')} quick={MONTH_CHOICES}
      />

      <div aria-live="polite" className="space-y-2">
        {cents > 0 ? (
          <>
            {/* One row per result, the amount on the right and never wrapped: big loans have long numbers. */}
            <div className="space-y-2">
              <LoanResult
                emoji="📅" label="Every month" value={m(t.installment)} highlight
                note={t.months > 1 && t.last !== t.installment ? <>last one <span className="whitespace-nowrap">{m(t.last)}</span></> : undefined}
              />
              <LoanResult emoji="💸" label="Total paid" value={m(t.total)} />
              <LoanResult emoji="📈" label="Total interest" value={m(t.interest)} />
            </div>
            {fit && (
              <p className={cx('rounded-xl px-4 py-3 text-[16px] leading-snug', share <= 0.25 ? 'bg-good-soft' : 'bg-warn-soft')}>{fit}</p>
            )}
          </>
        ) : (
          <p className="text-[16px] font-semibold">Type an amount to see the payments.</p>
        )}
      </div>

      <p className="text-[14px] leading-snug text-muted">Fixed monthly payments, yearly rate ÷ 12, no fees.</p>
    </WidgetBox>
  );
}

function LoanResult({ emoji, label, value, note, highlight }: {
  emoji: string; label: string; value: string; note?: ReactNode; highlight?: boolean;
}) {
  return (
    <div className={cx('flex items-center gap-3 rounded-xl border px-3 py-2.5', highlight ? 'border-accent bg-accent-soft' : 'border-line bg-surface-2')}>
      <span className="text-xl" aria-hidden="true">{emoji}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-semibold leading-tight text-muted">{label}</span>
        {note && <span className="block text-[12px] leading-tight text-accent-ink">{note}</span>}
      </span>
      <span className="shrink-0 whitespace-nowrap text-[17px] font-bold tabular-nums">{value}</span>
    </div>
  );
}

/** A number with a slider and − / + buttons (big enough to tap), plus optional quick picks. */
function RangeField({ label, value, onChange, min, max, step, format, quick }: {
  label: string; value: number; onChange: (v: number) => void; min: number; max: number; step: number;
  format: (v: number) => string; quick?: number[];
}) {
  const id = useId();
  const clamp = (v: number) => Math.min(max, Math.max(min, Number((Math.round(v / step) * step).toFixed(2))));
  const btn = 'grid size-11 shrink-0 place-items-center rounded-full border border-line bg-surface text-ink transition hover:bg-surface-2 disabled:opacity-40';
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="font-semibold">{label}</label>
        <span className="text-lg font-bold tabular-nums">{format(value)}</span>
      </div>
      <div className="flex items-center gap-2">
        <button type="button" className={btn} onClick={() => onChange(clamp(value - step))} disabled={value <= min} aria-label={`Less: ${label}`}>
          <Icon name="minus" size={20} />
        </button>
        <input
          id={id} type="range" min={min} max={max} step={step} value={value} aria-valuetext={format(value)}
          onChange={(e) => onChange(clamp(Number(e.target.value)))}
          className="h-11 min-w-0 flex-1 cursor-pointer accent-[var(--color-accent-strong)]"
        />
        <button type="button" className={btn} onClick={() => onChange(clamp(value + step))} disabled={value >= max} aria-label={`More: ${label}`}>
          <Icon name="plus" size={20} />
        </button>
      </div>
      {quick && (
        <div role="group" aria-label={`${label}: quick picks`} className="flex flex-wrap gap-2 pt-1">
          {quick.map((q) => (
            <Chip key={q} selected={value === q} onClick={() => onChange(q)}>{format(q)}</Chip>
          ))}
        </div>
      )}
    </div>
  );
}
