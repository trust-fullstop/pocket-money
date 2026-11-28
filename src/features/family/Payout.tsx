// "💸 Pay-out" (managers): the parent who is "the bank" pays each child's wallet into the child's real bank account.
// Per child: how the wallet was built up since the last pay-out (pocket money, rewards, consequences, loan
// repayments, spends), how much more or less that is than the normal pocket money, and "Paid ✅", which empties the
// wallet in the app (undo in the child's history). With a second currency (family rule "Also show money in") the
// estimate in that currency is shown just as large, because that is what the parent types into the banking app; the
// note on the pay-out keeps the estimate and the rate. The family currency stays the real amount.
// Loans: a "🤝 Loan" panel per child (what was lent, paid back, still to go, and what the next pocket money will
// repay), loan requests waiting for an answer, "Record a loan", and in the top card what is still owed in total.
// The loan list is loaded next to the summary; without it the page falls back to the summary's loan fields.
// Money school rewards (one per lesson a child finished) have their own line, and a nudge shows lessons that never got
// one (set a value / reward them in Family rules → 🎓 Money school reward). The Bible time surprise (once a day a kid
// opened the Bible App from Sow & Grow) has its own line too.
// Outstanding debt is never part of the wallet breakdown:
// start + allowance + rewards + consequences + loan + lessons + bible + other = wallet.
import { useRef, useState } from 'react';
import {
  Avatar, Button, Card, EmptyState, Icon, IconButton, LinkButton, PageHeader, ProgressBar, Sheet, Spinner, cx, useToast,
} from '../../components/ui';
import { api } from '../../lib/api';
import { friendlyError, toAppError } from '../../lib/errors';
import { useFeatures } from '../../lib/features';
import { FX_ENTRY_MAX_AGE_MS, approxMoney, currencyWord, rateHeadline, toQuote, useFx, type Fx, type FxRate } from '../../lib/fx';
import { addDays, dateInTz, formatDate, money, nextPayDate, todayISO } from '../../lib/format';
import { useApp, useLoad } from '../../lib/session';
import type { Loan, Member, PayoutRow } from '../../lib/types';
import { lessonRewardOf } from '../../lib/types';
import { isOpenLoan } from '../money/moneyUtils';

const CHANGED = 'The amount just changed. Here’s the new amount.';

/** "R 245" (no ".00" on whole amounts). */
const whole = (cents: number, cur: string) => money(cents, cur, { whole: true });
const signed = (cents: number, cur: string) => money(cents, cur, { whole: true, sign: true });
const rateSource = (r: FxRate) => (r.source === 'ECB' ? 'European Central Bank rate' : 'Exchange rate');
/** "For your 3 children." / "For 2 of your 3 children." */
const forWhom = (payable: number, kids: number) =>
  kids === 1 ? 'For your child.' : payable === kids ? `For your ${kids} children.` : `For ${payable} of your ${kids} children.`;
/** "20 Nov 2026" for the pay-out note (a lasting record, so always with the year). */
const longDate = (date: string) => {
  const [y, m, d] = date.split('-').map(Number);
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' })
    .format(new Date(Date.UTC(y, m - 1, d, 12)));
};

function uuid(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** The second currency, when there is one and a rate: amounts in it, the rate line and the note for the ledger. */
interface Second {
  fx: Fx;
  rate: FxRate;
  /** Family-currency cents → second-currency cents. */
  cents: (base: number) => number;
  /** "€13.13" (about). */
  text: (base: number) => string;
  /** "≈ €13.13 at €1 = R 18.66 (ECB, 20 Nov 2026)". */
  note: (base: number) => string;
}

const DAY_MS = 86_400_000;

/** The pay-out rows, and every kid's loans (null when the list couldn't be loaded: then the rows' loan fields are used). */
interface PayoutData { rows: PayoutRow[]; loans: Loan[] | null }

const activeLoanOf = (loans: Loan[], memberId: string) => loans.find((l) => l.member_id === memberId && l.status === 'active');

async function loadPayout(): Promise<PayoutData> {
  const [rows, first] = await Promise.all([api.payoutSummary(), api.listLoans().catch(() => null)]);
  // payout_summary catches up first (pocket money and its loan repayment), so a list read at the same moment can
  // be a step behind: read it once more when the two disagree.
  const agrees = (list: Loan[]) =>
    rows.every((r) => (activeLoanOf(list, r.member_id)?.outstanding_cents ?? 0) === (r.loan_outstanding_cents ?? 0));
  const loans = first && !agrees(first) ? await api.listLoans().catch(() => null) : first;
  return { rows, loans };
}

function useSecond(): { fx: Fx | null; second: Second | null; stale: boolean } {
  const fx = useFx();
  const r = fx?.rate ?? null;
  // Real-world time (rates are real-world), read once when the page opens.
  const [opened] = useState(() => ({ ms: Date.now(), day: new Date().toISOString().slice(0, 10) }));
  const stale = !!fx && (fx.failed || (!!r && (
    opened.ms - r.fetchedAt > FX_ENTRY_MAX_AGE_MS || Date.parse(opened.day) - Date.parse(r.date) > 3 * DAY_MS
  )));
  if (!fx || !r) return { fx, second: null, stale };
  const cents = (base: number) => toQuote(base, r.rate);
  const text = (base: number) => approxMoney(cents(base), fx.quote);
  return {
    fx,
    stale,
    second: {
      fx, rate: r, cents, text,
      note: (base) => `≈ ${text(base)} at ${rateHeadline(fx.base, fx.quote, r.rate)} (${r.source}, ${longDate(r.date)})`,
    },
  };
}

export default function Payout() {
  const { membersById, family, now, refresh } = useApp();
  const cur = family?.currency ?? 'EUR';
  const tz = family?.timezone ?? 'UTC';
  const q = useLoad(loadPayout, []);
  const { fx, second, stale } = useSecond();
  const [paying, setPaying] = useState<PayoutRow | null>(null);

  const rows = (q.data?.rows ?? []).filter((r) => membersById[r.member_id]);
  const loans = q.data?.loans ?? null;
  const total = rows.reduce((s, r) => s + r.to_pay_cents, 0);
  const totalSecond = second ? rows.reduce((s, r) => s + second.cents(r.to_pay_cents), 0) : 0;
  const owed = rows.reduce((s, r) => s + (loans ? (activeLoanOf(loans, r.member_id)?.outstanding_cents ?? 0) : (r.loan_outstanding_cents ?? 0)), 0);
  const today = todayISO(tz, now());

  return (
    <>
      <PageHeader title="💸 Pay-out" subtitle="What to pay each child" back="/family" />

      {q.error && !q.data ? (
        <Card className="text-center">
          <p className="font-semibold">We couldn’t load the pay-out.</p>
          <p className="mt-1 text-muted">{q.error}</p>
          <Button variant="secondary" className="mt-3" onClick={() => void q.reload()}>Try again</Button>
        </Card>
      ) : !q.data ? (
        <p className="flex items-center gap-3 px-1 py-6 text-muted"><Spinner /> Working out the wallets…</p>
      ) : rows.length === 0 ? (
        <EmptyState
          emoji="🧒"
          title="No children yet"
          message="Add a child to the family first. Their wallet shows up here."
          action={<LinkButton to="/family" icon="family">Go to Family</LinkButton>}
        />
      ) : (
        <div className="space-y-4">
          <TopCard
            total={total} totalSecond={totalSecond} owed={owed} cur={cur} fx={fx} second={second} stale={stale}
            kids={rows.length} payable={rows.filter((r) => r.to_pay_cents > 0).length}
          />
          {rows.map((r) => (
            <KidCard
              key={r.member_id} row={r} kid={membersById[r.member_id]} cur={cur} tz={tz} today={today} second={second}
              loans={loans && loans.filter((l) => l.member_id === r.member_id)}
              onPay={() => setPaying(r)}
            />
          ))}
          <p className="px-1 text-[14px] text-muted">
            “Paid ✅” always pays the whole wallet. Savings stay in the app. The amounts in {currencyWord(cur)} are the real ones
            {fx ? `; ${currencyWord(fx.quote)} is an estimate at today’s rate, and your bank may use a slightly different one` : ''}.
          </p>
        </div>
      )}

      {paying && membersById[paying.member_id] && (
        <PaySheet
          row={paying} kid={membersById[paying.member_id]} cur={cur} second={second}
          onClose={() => setPaying(null)}
          onDone={() => { setPaying(null); void q.reload(); void refresh(); }}
        />
      )}
    </>
  );
}

function TopCard({ total, totalSecond, owed, cur, fx, second, stale, kids, payable }: {
  total: number; totalSecond: number; owed: number; cur: string; fx: Fx | null; second: Second | null; stale: boolean; kids: number; payable: number;
}) {
  return (
    <Card tone="accent" role="region" aria-labelledby="payout-total">
      <h2 id="payout-total" className="text-[15px] font-bold text-muted">To pay over now</h2>
      <p className="mt-1 flex flex-wrap items-baseline gap-x-2 text-3xl font-extrabold leading-tight tabular-nums">
        <span>{whole(total, cur)}</span>
        {second && total > 0 && (
          <span>
            <span className="text-xl font-bold text-muted">· about </span>{approxMoney(totalSecond, second.fx.quote)}
          </span>
        )}
      </p>
      <p className="mt-1 text-[14px] text-muted">
        {total > 0 ? forWhom(payable, kids) : 'Nothing to pay over right now.'}
      </p>
      {owed > 0 && (
        <p className="mt-2 text-base font-semibold">
          <span aria-hidden="true">🤝 </span>Still owed to you in loans: <span className="tabular-nums">{whole(owed, cur)}</span>
          {second && (
            <span className="font-normal text-muted tabular-nums">
              {' '}(<span aria-hidden="true">≈ </span><span className="sr-only">about </span>{second.text(owed)})
            </span>
          )}
        </p>
      )}

      {fx && (
        <div className="mt-3 flex items-center gap-2 border-t border-accent/20 pt-3">
          <div className="min-w-0 flex-1 text-[15px]">
            {second ? (
              <>
                <p className="font-bold tabular-nums">{rateHeadline(fx.base, fx.quote, second.rate.rate)}</p>
                <p className="text-[14px] text-muted">{rateSource(second.rate)} of {formatDate(second.rate.date)}{fx.loading ? ' · checking…' : ''}</p>
              </>
            ) : fx.loading ? (
              <p className="flex items-center gap-2 text-muted"><Spinner size={16} /> Checking today’s rate…</p>
            ) : (
              <p>We couldn’t get today’s rate, so there’s no {currencyWord(fx.quote)} amount yet.</p>
            )}
            {stale && (
              <p role="alert" className="mt-1 flex items-center gap-1.5 font-semibold text-warn">
                <Icon name="alert" size={16} className="shrink-0" />Rate may be out of date — tap ↻
              </p>
            )}
          </div>
          <IconButton icon="reset" label="Check the rate again" disabled={fx.loading} onClick={fx.refresh} />
        </div>
      )}
    </Card>
  );
}

function Line({ label, cents, cur, strong, emoji }: { label: string; cents: number; cur: string; strong?: boolean; emoji?: string }) {
  return (
    <div className={cx('flex items-baseline justify-between gap-3', strong && 'font-bold')}>
      <dt className="min-w-0">{emoji && <span aria-hidden="true">{emoji} </span>}{label}</dt>
      <dd className="whitespace-nowrap tabular-nums">{signed(cents, cur)}</dd>
    </div>
  );
}

/** "Money school (3 lessons × €2)" when every lesson got the same amount, else "Money school (3 lessons)". */
function lessonsLabel(row: PayoutRow, cur: string): string {
  const n = row.lessons_count;
  if (n <= 0) return 'Money school';
  const what = `${n} lesson${n === 1 ? '' : 's'}`;
  return row.lessons_each_cents != null ? `Money school (${what} × ${whole(row.lessons_each_cents, cur)})` : `Money school (${what})`;
}

/** "Bible time (5 days × €0.50)" when every day got the same amount, else "Bible time (5 days)". */
function bibleLabel(row: PayoutRow, cur: string): string {
  const n = row.bible_days;
  if (n <= 0) return 'Bible time';
  const what = `${n} day${n === 1 ? '' : 's'}`;
  return row.bible_each_cents != null ? `Bible time (${what} × ${whole(row.bible_each_cents, cur)})` : `Bible time (${what})`;
}

/** Lessons this child finished that never got the Money school reward: set a value, or reward them (Family rules). */
function LessonNudge({ name, count, reward, cur }: { name: string; count: number; reward: number; cur: string }) {
  const what = `${count} lesson${count === 1 ? '' : 's'}`;
  return (
    <div className="mt-3 rounded-2xl bg-accent-soft px-3 pt-2 text-base">
      <p className="[overflow-wrap:anywhere]">
        <span aria-hidden="true">🎓 </span>
        {reward > 0
          ? `${count} earlier ${count === 1 ? 'lesson' : 'lessons'} not rewarded yet (${whole(reward, cur)} each).`
          : `${name} finished ${what}. Set a reward per lesson in Family rules.`}
      </p>
      <LinkButton to="/family/settings#lesson-reward" variant="ghost" size="sm" className="-ml-3.5">
        {reward > 0 ? 'Reward them' : 'Set a reward'}<span className="sr-only"> for Money school lessons</span>
      </LinkButton>
    </div>
  );
}

function KidCard({ row, kid, cur, tz, today, second, loans, onPay }: {
  row: PayoutRow; kid: Member; cur: string; tz: string; today: string; second: Second | null;
  /** This kid's loans (null: the list couldn't be loaded). */
  loans: Loan[] | null;
  onPay: () => void;
}) {
  const features = useFeatures();
  const { family } = useApp();
  const lessonReward = lessonRewardOf(family?.settings);
  const name = kid.display_name;
  const titleId = `payout-${row.member_id}`;
  const extra = row.rewards_cents + row.consequences_cents + row.loan_cents + row.lessons_cents + row.bible_cents + row.other_cents;
  const hasSchedule = features.on('allowance') && (row.allowance_cents_per_period ?? 0) > 0;
  const next = hasSchedule ? nextPayDate(row.allowance_period, row.allowance_day, addDays(today, 1)) : null;
  const since = row.last_payout_at ? `Since the last pay-out on ${formatDate(dateInTz(row.last_payout_at, tz))}` : 'Since joining';
  const open = loans?.find(isOpenLoan) ?? null;
  const active = open?.status === 'active' ? open : null;
  const justRepaid = loans && !open
    ? loans.find((l) => l.status === 'repaid' && !!l.ended_at && Date.parse(l.ended_at) > Date.parse(row.since)) ?? null
    : null;

  const why = [
    row.rewards_cents !== 0 && 'rewards',
    row.consequences_cents !== 0 && 'consequences',
    row.loan_cents < 0 && 'a loan repayment',
    row.loan_cents > 0 && 'an undone loan repayment',
    row.lessons_cents !== 0 && 'Money school lessons',
    row.bible_cents !== 0 && 'Bible time',
    row.other_cents !== 0 && 'spending',
  ].filter((w): w is string => !!w);
  const because = why.length ? `, because of ${why.length > 1 ? `${why.slice(0, -1).join(', ')} and ${why[why.length - 1]}` : why[0]}` : '';
  const versus = extra > 0
    ? { text: `${whole(extra, cur)} more than the normal pocket money${because}`, tone: 'text-good' }
    : extra < 0
      ? { text: `${whole(-extra, cur)} less than the normal pocket money${because}`, tone: 'text-warn' }
      : row.allowance_cents > 0 ? { text: 'Just the normal pocket money', tone: 'text-muted' } : null;

  const pocket = [
    row.last_allowance_on ? `Includes pocket money up to ${formatDate(row.last_allowance_on)}.` : hasSchedule ? 'No pocket money paid yet.' : null,
    next ? `Next pocket money: ${formatDate(next)}.` : null,
  ].filter(Boolean).join(' ');

  return (
    <Card role="region" aria-labelledby={titleId}>
      <div className="flex items-center gap-3">
        <Avatar member={kid} size="md" name="" />
        <div className="min-w-0 flex-1">
          <h2 id={titleId} className="truncate text-lg font-bold leading-tight">{name}</h2>
          <p className="text-[14px] text-muted">{since}</p>
        </div>
      </div>

      <dl className="mt-3 space-y-1 text-[15px]">
        {row.start_cents !== 0 && <Line label="Carried over" cents={row.start_cents} cur={cur} />}
        <Line label="Pocket money" cents={row.allowance_cents} cur={cur} />
        <Line label="Rewards and tasks" cents={row.rewards_cents} cur={cur} />
        <Line label="Consequences" cents={row.consequences_cents} cur={cur} />
        {row.loan_cents !== 0 && <Line label={row.loan_cents > 0 ? 'Loan repayment undone' : 'Loan repayment'} cents={row.loan_cents} cur={cur} />}
        {(row.lessons_cents !== 0 || row.lessons_count > 0) && (
          <Line emoji="🎓" label={lessonsLabel(row, cur)} cents={row.lessons_cents} cur={cur} />
        )}
        {(row.bible_cents !== 0 || row.bible_days > 0) && (
          <Line emoji="📖" label={bibleLabel(row, cur)} cents={row.bible_cents} cur={cur} />
        )}
        {row.other_cents !== 0 && <Line label="Spent with OK / moved to savings" cents={row.other_cents} cur={cur} />}
        <div className="!mt-2 flex flex-wrap items-baseline justify-between gap-x-3 border-t border-line pt-2">
          <dt className="font-bold">In the wallet now</dt>
          <dd className="ml-auto whitespace-nowrap text-right tabular-nums">
            <strong className="text-xl">{whole(row.wallet_cents, cur)}</strong>
            {second && row.wallet_cents !== 0 && (
              <strong className="ml-2 text-xl text-accent-ink">
                <span aria-hidden="true">≈ </span><span className="sr-only">about </span>{second.text(row.wallet_cents)}
              </strong>
            )}
          </dd>
        </div>
      </dl>

      {versus && <p className={cx('mt-1 text-[15px] font-semibold', versus.tone)}>{versus.text}</p>}
      {pocket && <p className="mt-1 text-[14px] text-muted">{pocket}</p>}
      {features.on('learn') && (lessonReward > 0
        ? row.lessons_unrewarded > 0 && <LessonNudge name={name} count={row.lessons_unrewarded} reward={lessonReward} cur={cur} />
        : row.lessons_finished > 0 && <LessonNudge name={name} count={row.lessons_finished} reward={0} cur={cur} />)}

      {active ? (
        <LoanPanel loan={active} row={row} name={name} cur={cur} tz={tz} second={second} />
      ) : !loans && row.loan_outstanding_cents != null && row.loan_outstanding_cents > 0 ? (
        <LoanPanelFallback row={row} outstanding={row.loan_outstanding_cents} cur={cur} second={second} />
      ) : null}
      {open?.status === 'requested' && (
        <div className="mt-3 rounded-2xl bg-warn-soft px-3 pt-2 text-base">
          <p className="[overflow-wrap:anywhere]">
            <span aria-hidden="true">⏳ </span>{name} asked to borrow {whole(open.amount_cents, cur)} for “{open.purpose}”
          </p>
          {features.on('loans') ? (
            <LinkButton to="/money/requests" variant="ghost" size="sm" className="-ml-3.5">
              See requests<span className="sr-only"> from {name}</span>
            </LinkButton>
          ) : <div className="h-2" />}
        </div>
      )}
      {open?.status === 'offered' && (
        <p className="mt-3 rounded-2xl bg-warn-soft px-3 py-2 text-base [overflow-wrap:anywhere]">
          <span aria-hidden="true">⏳ </span>Waiting for {name} to accept the {whole(open.fee_cents, cur)} fee on {whole(open.amount_cents, cur)} for “{open.purpose}”
        </p>
      )}
      {justRepaid && (
        <p className="mt-3 text-[15px] font-semibold text-good [overflow-wrap:anywhere]">
          <span aria-hidden="true">🎉 </span>Loan paid back: “{justRepaid.purpose}”
        </p>
      )}

      <div className="mt-3 space-y-1">
        {row.to_pay_cents > 0 ? (
          <Button block size="lg" onClick={onPay}>
            Paid ✅ {second ? `${second.text(row.to_pay_cents)} (${whole(row.to_pay_cents, cur)})` : whole(row.to_pay_cents, cur)}
            <span className="sr-only"> to {name}</span>
          </Button>
        ) : (
          <p className="rounded-xl bg-surface-2 px-3 py-3 text-center font-semibold">
            {row.owes_cents > 0 ? `Owes ${whole(row.owes_cents, cur)}, it comes off next time` : 'Nothing to pay'}
          </p>
        )}
        <LinkButton to={`/money/${row.member_id}`} variant="ghost" size="sm" block>{name}’s history</LinkButton>
        {loans && !open && features.on('loans') && (
          <LinkButton to={`/money/${row.member_id}?loan=1`} variant="ghost" size="sm" block>
            <span aria-hidden="true">🤝</span> Record a loan<span className="sr-only"> for {name}</span>
          </LinkButton>
        )}
      </div>
    </Card>
  );
}

/** "−R 50" for the eye, "R 50" for the ear (the sentence says what the minus means). */
const ear = (cents: number, cur: string) => whole(Math.abs(cents), cur);

/** The open loan: what was lent, paid back so far, what is still to go, and what the next pocket money repays. */
function LoanPanel({ loan, row, name, cur, tz, second }: {
  loan: Loan; row: PayoutRow; name: string; cur: string; tz: string; second: Second | null;
}) {
  const id = `payout-loan-${loan.id}`;
  const allowance = row.allowance_cents_per_period ?? 0;
  const nextAmount = loan.next_amount_cents ?? 0;
  const day = loan.next_pay_on ? formatDate(loan.next_pay_on) : null;
  // The repayment is capped by what is in the wallet then (now + the pocket money), so it is only a plan.
  const capped = row.wallet_cents + allowance < nextAmount;
  const left = allowance - nextAmount;
  const paidText = `${whole(loan.repaid_cents, cur)} of ${whole(loan.total_cents, cur)} paid back`;

  return (
    <section aria-labelledby={id} className="mt-3 space-y-2 rounded-2xl border border-accent/30 bg-accent-soft/40 p-3 text-base">
      <h3 id={id} className="font-bold"><span aria-hidden="true">🤝 </span>Loan</h3>
      <p className="font-semibold [overflow-wrap:anywhere]">“{loan.purpose}”</p>
      {loan.started_at && (
        <p>
          Lent on {formatDate(dateInTz(loan.started_at, tz))}: <span className="tabular-nums">{whole(loan.amount_cents, cur)}</span>
          {loan.fee_cents > 0 && <> + <span className="tabular-nums">{whole(loan.fee_cents, cur)}</span> fee</>}
        </p>
      )}
      <div>
        <ProgressBar value={loan.repaid_cents} max={loan.total_cents} tone="good" label={`${name}’s loan paid back`} valueText={paidText} />
        <p className="mt-1 tabular-nums" aria-hidden="true">{paidText}</p>
      </div>
      <p className="font-bold tabular-nums">
        Still to go: {whole(loan.outstanding_cents, cur)}
        {second && (
          <span className="ml-2 text-accent-ink">
            <span aria-hidden="true">≈ </span><span className="sr-only">about </span>{second.text(loan.outstanding_cents)}
          </span>
        )}
      </p>
      {day && nextAmount > 0 ? (
        <>
          <p>
            <span aria-hidden="true">
              Planned: {capped ? 'up to ' : ''}<span className="tabular-nums">{signed(-nextAmount, cur)}</span> off the pocket money on {day}
              {capped ? ' — no more than is in the wallet then' : ''}
            </span>
            <span className="sr-only">
              Planned: {capped ? 'up to ' : ''}{ear(nextAmount, cur)} comes off the pocket money on {day}{capped ? ', no more than is in the wallet then' : ''}
            </span>
          </p>
          {allowance > 0 && (
            <p className="rounded-xl bg-surface px-3 py-2 text-base tabular-nums">
              <span aria-hidden="true">
                {day}: {signed(allowance, cur)} pocket money − {capped ? 'up to ' : ''}{whole(nextAmount, cur)} loan
                {left <= 0 ? ': the loan takes the whole pocket money' : capped ? '' : <> = <strong>{signed(left, cur)}</strong> into the wallet</>}
              </span>
              <span className="sr-only">
                On {day}: {ear(allowance, cur)} pocket money, minus {capped ? 'up to ' : ''}{ear(nextAmount, cur)} for the loan
                {left <= 0 ? ': the loan takes the whole pocket money' : capped ? '' : `, leaves ${ear(left, cur)} for the wallet`}
              </span>
            </p>
          )}
        </>
      ) : (
        <p>No pocket money set — it’s paid back with “Pay back now”.</p>
      )}
    </section>
  );
}

/** Without the loan list: just what the pay-out summary knows (the purpose and what is still to go). */
function LoanPanelFallback({ row, outstanding, cur, second }: { row: PayoutRow; outstanding: number; cur: string; second: Second | null }) {
  const id = `payout-loan-${row.member_id}`;
  return (
    <section aria-labelledby={id} className="mt-3 space-y-1 rounded-2xl border border-accent/30 bg-accent-soft/40 p-3 text-base">
      <h3 id={id} className="font-bold"><span aria-hidden="true">🤝 </span>Loan</h3>
      {row.loan_purpose && <p className="font-semibold [overflow-wrap:anywhere]">“{row.loan_purpose}”</p>}
      <p className="font-bold tabular-nums">
        Still to go: {whole(outstanding, cur)}
        {second && (
          <span className="ml-2 text-accent-ink">
            <span aria-hidden="true">≈ </span><span className="sr-only">about </span>{second.text(outstanding)}
          </span>
        )}
      </p>
    </section>
  );
}

function PaySheet({ row, kid, cur, second, onClose, onDone }: {
  row: PayoutRow; kid: Member; cur: string; second: Second | null; onClose: () => void; onDone: () => void;
}) {
  const toast = useToast();
  // One request id per open sheet: a retry after a network hiccup can never pay twice.
  const [requestId] = useState(uuid);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sending = useRef(false);
  const name = kid.display_name;
  const amount = row.to_pay_cents;
  const both = second ? `about ${second.text(amount)} (${whole(amount, cur)})` : whole(amount, cur);

  const pay = async () => {
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    setError(null);
    try {
      await api.recordPayout(row.member_id, amount, requestId, second ? second.note(amount) : null);
      toast.show(`Paid out ${whole(amount, cur)} to ${name} ✅`, 'success');
      onDone();
    } catch (e) {
      const err = toAppError(e);
      if (err.code === 'wrong_status' || (err.code === 'invalid' && err.detail === 'nothing_to_pay')) {
        toast.show(CHANGED, 'info');
        onDone();
      } else {
        setError(friendlyError(e));
      }
    } finally {
      sending.current = false;
      setBusy(false);
    }
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={`Did you pay ${both} into ${name}’s bank account?`}
      description={`${name}’s wallet goes back to ${whole(0, cur)}. You can undo this in ${name}’s history.`}
      footer={
        <div className="space-y-2">
          <Button size="lg" block loading={busy} onClick={() => void pay()}>Yes, I paid {second ? second.text(amount) : whole(amount, cur)}</Button>
          <Button variant="secondary" block onClick={onClose} disabled={busy}>Not yet</Button>
        </div>
      }
    >
      <div className="space-y-3 pt-1 text-[15px]">
        {second && (
          <p className="rounded-xl bg-surface-2 p-3">
            At {rateHeadline(second.fx.base, second.fx.quote, second.rate.rate)} ({rateSource(second.rate)} of {formatDate(second.rate.date)}).
            We keep the {currencyWord(second.fx.quote)} amount and the rate with the pay-out. The app counts {whole(amount, cur)}.
          </p>
        )}
        {error && (
          <p role="alert" className="flex items-start gap-2 rounded-xl bg-bad-soft p-3 text-bad">
            <Icon name="alert" size={18} className="mt-0.5 shrink-0" />{error}
          </p>
        )}
      </div>
    </Sheet>
  );
}
