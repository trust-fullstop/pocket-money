// "💸 Pay-out" (managers): the parent who is "the bank" pays each child's wallet into the child's real bank account.
// Per child: how the wallet was built up since the last pay-out (pocket money, rewards, consequences, spends), how
// much more or less that is than the normal pocket money, and "Paid ✅", which empties the wallet in the app (undo
// in the child's history). With a second currency (family rule "Also show money in") the estimate in that currency
// is shown just as large, because that is what the parent types into the banking app; the note on the pay-out keeps
// the estimate and the rate. The family currency stays the real amount.
import { useRef, useState } from 'react';
import {
  Avatar, Button, Card, EmptyState, Icon, IconButton, LinkButton, PageHeader, Sheet, Spinner, cx, useToast,
} from '../../components/ui';
import { api } from '../../lib/api';
import { friendlyError, toAppError } from '../../lib/errors';
import { useFeatures } from '../../lib/features';
import { FX_ENTRY_MAX_AGE_MS, approxMoney, currencyWord, rateHeadline, toQuote, useFx, type Fx, type FxRate } from '../../lib/fx';
import { addDays, dateInTz, formatDate, money, nextPayDate, todayISO } from '../../lib/format';
import { useApp, useLoad } from '../../lib/session';
import type { Member, PayoutRow } from '../../lib/types';

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
  const q = useLoad(() => api.payoutSummary(), []);
  const { fx, second, stale } = useSecond();
  const [paying, setPaying] = useState<PayoutRow | null>(null);

  const rows = (q.data ?? []).filter((r) => membersById[r.member_id]);
  const total = rows.reduce((s, r) => s + r.to_pay_cents, 0);
  const totalSecond = second ? rows.reduce((s, r) => s + second.cents(r.to_pay_cents), 0) : 0;
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
            total={total} totalSecond={totalSecond} cur={cur} fx={fx} second={second} stale={stale}
            kids={rows.length} payable={rows.filter((r) => r.to_pay_cents > 0).length}
          />
          {rows.map((r) => (
            <KidCard
              key={r.member_id} row={r} kid={membersById[r.member_id]} cur={cur} tz={tz} today={today} second={second}
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

function TopCard({ total, totalSecond, cur, fx, second, stale, kids, payable }: {
  total: number; totalSecond: number; cur: string; fx: Fx | null; second: Second | null; stale: boolean; kids: number; payable: number;
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

function Line({ label, cents, cur, strong }: { label: string; cents: number; cur: string; strong?: boolean }) {
  return (
    <div className={cx('flex items-baseline justify-between gap-3', strong && 'font-bold')}>
      <dt className="min-w-0">{label}</dt>
      <dd className="whitespace-nowrap tabular-nums">{signed(cents, cur)}</dd>
    </div>
  );
}

function KidCard({ row, kid, cur, tz, today, second, onPay }: {
  row: PayoutRow; kid: Member; cur: string; tz: string; today: string; second: Second | null; onPay: () => void;
}) {
  const features = useFeatures();
  const name = kid.display_name;
  const titleId = `payout-${row.member_id}`;
  const extra = row.rewards_cents + row.consequences_cents + row.loan_cents + row.other_cents;
  const hasSchedule = features.on('allowance') && (row.allowance_cents_per_period ?? 0) > 0;
  const next = hasSchedule ? nextPayDate(row.allowance_period, row.allowance_day, addDays(today, 1)) : null;
  const since = row.last_payout_at ? `Since the last pay-out on ${formatDate(dateInTz(row.last_payout_at, tz))}` : 'Since joining';

  const why = [
    row.rewards_cents !== 0 && 'rewards',
    row.consequences_cents !== 0 && 'consequences',
    row.loan_cents !== 0 && 'a loan repayment',
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
        {row.loan_cents !== 0 && <Line label="Loan repayment" cents={row.loan_cents} cur={cur} />}
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
      {row.loan_outstanding_cents != null && row.loan_outstanding_cents > 0 && (
        <p className="mt-1 text-[14px] font-semibold [overflow-wrap:anywhere]">
          <span aria-hidden="true">🤝 </span>Loan: {whole(row.loan_outstanding_cents, cur)} still to go{row.loan_purpose ? ` (${row.loan_purpose})` : ''}
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
      </div>
    </Card>
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
