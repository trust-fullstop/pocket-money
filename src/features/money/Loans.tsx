// Loans: a kid borrows from a parent ("the bank") and picks how to pay it back. Repayments come off the pocket money
// (the real money is given in cash or by bank; the app keeps track of what is still owed). Shown on the kid's money
// page (LoansSection + AskLoanSheet) and on Requests for the parents (LoanRequestCard).
import { useState } from 'react';
import { AmountInput, Avatar, Badge, Button, Card, Chip, FxNote, Input, ProgressBar, Segmented, Sheet, Textarea, useToast, type BadgeTone } from '../../components/ui';
import { api } from '../../lib/api';
import { useFeatures } from '../../lib/features';
import { addDays, formatDate, money, nextPayDate, plural, timeAgo, todayISO } from '../../lib/format';
import { useApp } from '../../lib/session';
import type { Loan, LoanPlan, Member } from '../../lib/types';
import { clip, closedIfOff, isOpenLoan, isStale, moneyError } from './moneyUtils';
import { QuickChips, SheetActions } from './parts';
import { ErrorLine, OverLine } from './WalletSheets';

const STATUS: Record<Loan['status'], { label: string; tone: BadgeTone }> = {
  requested: { label: 'Waiting', tone: 'warn' },
  offered: { label: 'Offer', tone: 'warn' },
  active: { label: 'Paying back', tone: 'neutral' },
  repaid: { label: 'Paid back ✓', tone: 'good' },
  forgiven: { label: 'Forgiven', tone: 'good' },
  declined: { label: 'Not this time', tone: 'neutral' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
};

const TIP = 'Borrowing means less money later. Only borrow for something you really need.';

/** "1 Dec" (adds the year when it isn't this year). */
function shortDate(date: string): string {
  const [y, m, d] = date.slice(0, 10).split('-').map(Number);
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC', day: 'numeric', month: 'short', ...(y !== new Date().getFullYear() ? { year: 'numeric' } : {}),
  }).format(new Date(Date.UTC(y, m - 1, d, 12)));
}

function addMonths(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + n, d)).toISOString().slice(0, 10);
}

interface Estimate { allowance: number; next: string; payoff: string; days: number; full: number; rest: number }

/**
 * What a plan means for the pocket money: the next pay day strictly after today (same rule as the server), how many
 * pay days it takes and the last one. Null without pocket money.
 */
function estimate(member: Member, allowanceOn: boolean, today: string, amount: number, installment: number): Estimate | null {
  const allowance = member.allowance_cents ?? 0;
  if (!allowanceOn || allowance <= 0 || amount <= 0 || installment <= 0) return null;
  const from = member.allowance_since && member.allowance_since > addDays(today, 1) ? member.allowance_since : addDays(today, 1);
  const next = nextPayDate(member.allowance_period, member.allowance_day, from);
  const days = Math.ceil(amount / installment);
  const payoff = member.allowance_period === 'month' ? addMonths(next, days - 1) : addDays(next, 7 * (days - 1));
  return { allowance, next, payoff, days, full: Math.floor(amount / installment), rest: amount % installment };
}

/** "€5 from each pocket money" / "All from the next pocket money". */
function planText(plan: LoanPlan, installment: number, cur: string) {
  return plan === 'next_pay' ? 'All from the next pocket money' : `${money(installment, cur)} from each pocket money`;
}

// ---------------------------------------------------------------- the kid's money page

export interface LoansSectionProps {
  loans: Loan[];
  member: Member;
  /** The viewer is this kid. */
  self: boolean;
  cur: string;
  /** Wallet balance (cents): the most "Pay back now" can take. */
  spending: number;
  onChanged: () => Promise<void>;
}

/** The open loan (or a 🎉 when the last one was just paid back) and, folded away, the earlier loans. */
export function LoansSection({ loans, member, self, cur, spending, onChanged }: LoansSectionProps) {
  const { now } = useApp();
  const features = useFeatures();
  const open = loans.find(isOpenLoan) ?? null;
  const past = loans.filter((l) => !isOpenLoan(l));
  const latest = past[0];
  const celebrate = !open && latest?.status === 'repaid' && !!latest.ended_at
    && now().getTime() - Date.parse(latest.ended_at) < 14 * 86_400_000;
  if (!open && !(features.on('loans') && past.length > 0)) return null;
  const name = member.display_name;

  return (
    <section aria-labelledby="loans-title" className="space-y-2">
      <h2 id="loans-title" className="flex min-h-11 items-center px-1 text-sm font-bold uppercase tracking-wide text-muted">
        <span aria-hidden="true">🤝&nbsp;</span>{open ? 'Loan' : 'Loans'}
      </h2>
      {open && <LoanCard loan={open} member={member} self={self} name={name} cur={cur} spending={spending} onChanged={onChanged} />}
      {celebrate && latest && (
        <Card tone="good" role="status">
          <p className="text-lg font-extrabold"><span aria-hidden="true">🎉 </span>All paid back!</p>
          <p className="mt-0.5 text-[15px]">
            {self ? 'You' : name} paid back {money(latest.repaid_cents, cur)} for “{latest.purpose}”. That’s grown-up money skills.
          </p>
        </Card>
      )}
      {past.length > 0 && (
        <details className="group rounded-2xl border border-line bg-surface">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-2xl px-4 font-semibold [&::-webkit-details-marker]:hidden">
            <span>{open ? 'Earlier loans' : 'Loans'} ({past.length})</span>
            <span aria-hidden="true" className="text-muted transition group-open:rotate-180">▾</span>
          </summary>
          <ul className="divide-y divide-line border-t border-line">
            {past.map((l) => (
              <li key={l.id} className="flex items-start justify-between gap-3 px-4 py-3">
                <span className="min-w-0">
                  <span className="block font-semibold [overflow-wrap:anywhere]">{l.purpose}</span>
                  <span className="block text-[13px] text-muted">
                    {money(l.amount_cents, cur)}{l.fee_cents > 0 ? ` + ${money(l.fee_cents, cur)} fee` : ''}
                    {' · '}{formatDate((l.ended_at ?? l.decided_at ?? l.created_at).slice(0, 10))}
                    {l.forgiven_cents > 0 && ` · ${money(l.forgiven_cents, cur)} forgiven`}
                  </span>
                </span>
                <Badge tone={STATUS[l.status].tone}>{STATUS[l.status].label}</Badge>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

function LoanCard({ loan, member, self, name, cur, spending, onChanged }: {
  loan: Loan; member: Member; self: boolean; name: string; cur: string; spending: number; onChanged: () => Promise<void>;
}) {
  const { membersById } = useApp();
  const toast = useToast();
  const [sheet, setSheet] = useState<'repay' | 'forgive' | null>(null);
  const [busy, setBusy] = useState<'cancel' | 'yes' | 'no' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const st = STATUS[loan.status];
  const yourPm = self ? 'your pocket money' : `${name}’s pocket money`;
  const decider = loan.decided_by ? membersById[loan.decided_by]?.display_name ?? 'A grown-up' : 'A grown-up';

  const act = async (kind: 'cancel' | 'yes' | 'no') => {
    setBusy(kind);
    setError(null);
    try {
      if (kind === 'cancel') await api.cancelLoan(loan.id);
      else await api.acceptLoanOffer(loan.id, kind === 'yes');
      toast.show(kind === 'cancel' ? 'Request cancelled' : kind === 'yes' ? 'Deal! The loan has started.' : 'OK, no loan this time.', 'success');
      await onChanged();
    } catch (e) {
      const msg = moneyError(e);
      setError(msg);
      toast.show(msg, 'error');
      if (isStale(e)) await onChanged();
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card tone={loan.status === 'active' ? 'default' : 'warn'} className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-lg font-extrabold leading-snug [overflow-wrap:anywhere]">{loan.purpose}</p>
          <p className="text-[15px] text-muted">
            {money(loan.amount_cents, cur)} loan{loan.fee_cents > 0 ? ` + ${money(loan.fee_cents, cur)} fee` : ''}
            {' · '}{planText(loan.plan, loan.installment_cents, cur)}
          </p>
        </div>
        <Badge tone={st.tone}>{st.label}</Badge>
      </div>

      {loan.status === 'active' && (
        <>
          <ProgressBar
            value={loan.repaid_cents} max={loan.total_cents} tone="good" label="Paid back"
            valueText={`${money(loan.repaid_cents, cur)} of ${money(loan.total_cents, cur)} paid back`}
          />
          <p className="font-semibold">
            <span className="tabular-nums">{money(loan.repaid_cents, cur)}</span> of <span className="tabular-nums">{money(loan.total_cents, cur)}</span> paid back
            <span className="font-normal text-muted"> · {money(loan.outstanding_cents, cur)} to go <FxNote cents={loan.outstanding_cents} currency={cur} /></span>
          </p>
          {loan.next_pay_on && loan.next_amount_cents ? (
            <ul className="space-y-1 text-[15px]">
              <li><span aria-hidden="true">📅 </span>Next: {money(loan.next_amount_cents, cur)} from {yourPm} on {shortDate(loan.next_pay_on)}</li>
              {loan.payoff_on && loan.pay_days_left != null && (
                <li>
                  <span aria-hidden="true">🏁 </span>Paid off around {shortDate(loan.payoff_on)}
                  {' '}({plural(loan.pay_days_left, 'more pocket money day')})
                </li>
              )}
            </ul>
          ) : (
            <p className="rounded-xl bg-surface-2 px-3 py-2 text-[15px]">No pocket money set — repay with “Pay back now”.</p>
          )}
          {(loan.can_repay || loan.can_forgive) && (
            <div className="flex flex-wrap gap-2">
              {loan.can_repay && (
                <Button onClick={() => setSheet('repay')} disabled={spending <= 0} className="flex-1">Pay back now</Button>
              )}
              {loan.can_forgive && !self && (
                <Button variant="secondary" icon="heart" onClick={() => setSheet('forgive')} className="flex-1">Forgive</Button>
              )}
            </div>
          )}
          {loan.can_repay && spending <= 0 && (
            <p className="text-[14px] text-muted">{self ? 'Your wallet is empty' : `${name}’s wallet is empty`}, so paying back early isn’t possible right now.</p>
          )}
        </>
      )}

      {loan.status === 'requested' && (
        <>
          <p className="text-[15px]"><span aria-hidden="true">⏳ </span>{self ? 'Waiting for a grown-up to say yes or no.' : `${name} asked ${timeAgo(loan.created_at)}.`}</p>
          {loan.can_decide && <LoanDecideButtons loan={loan} name={name} cur={cur} member={member} onChanged={onChanged} />}
          {loan.can_cancel && (
            <Button variant="secondary" icon="close" loading={busy === 'cancel'} onClick={() => act('cancel')} block>Cancel my request</Button>
          )}
        </>
      )}

      {loan.status === 'offered' && (
        <>
          <p className="text-[15px]">
            {self ? `${decider} says yes — with a ${money(loan.fee_cents, cur)} fee, like interest at a bank. ` : `Waiting for ${name} to say yes to the ${money(loan.fee_cents, cur)} fee. `}
            {self ? 'You' : name} would pay back <strong>{money(loan.total_cents, cur)}</strong> in total
            {loan.pay_days_left != null && member.allowance_cents ? `: ${plural(loan.pay_days_left, 'pocket money day')}` : ''}.
          </p>
          {loan.can_accept && (
            <>
              <p className="rounded-xl bg-surface-2 px-3 py-2 text-[14px]"><span aria-hidden="true">💡 </span>{TIP}</p>
              <div className="flex gap-2">
                <Button variant="secondary" loading={busy === 'no'} onClick={() => act('no')} className="flex-1">No thanks</Button>
                <Button icon="check" loading={busy === 'yes'} onClick={() => act('yes')} className="flex-1">Yes, deal</Button>
              </div>
            </>
          )}
          {loan.can_cancel && !loan.can_accept && (
            <Button variant="secondary" icon="close" loading={busy === 'cancel'} onClick={() => act('cancel')} block>Cancel</Button>
          )}
        </>
      )}

      {loan.decision_note && (
        <p className="text-[14px] text-muted [overflow-wrap:anywhere]">{decider}: “{loan.decision_note}”</p>
      )}
      <ErrorLine error={error} />

      {sheet === 'repay' && (
        <RepaySheet loan={loan} self={self} name={name} cur={cur} spending={spending} onClose={() => setSheet(null)} onChanged={onChanged} />
      )}
      {sheet === 'forgive' && <ForgiveSheet loan={loan} name={name} cur={cur} onClose={() => setSheet(null)} onChanged={onChanged} />}
    </Card>
  );
}

function RepaySheet({ loan, self, name, cur, spending, onClose, onChanged }: {
  loan: Loan; self: boolean; name: string; cur: string; spending: number; onClose: () => void; onChanged: () => Promise<void>;
}) {
  const toast = useToast();
  const [requestId] = useState(() => crypto.randomUUID());
  const max = Math.max(0, Math.min(spending, loan.outstanding_cents));
  const [cents, setCents] = useState<number | null>(Math.min(loan.installment_cents, max) || null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const over = cents != null && cents > max;
  const ok = !!cents && cents > 0 && !over;
  const overText = over
    ? (spending < loan.outstanding_cents
      ? `${self ? 'You only have' : `${name} only has`} ${money(spending, cur)} in the wallet.`
      : `Only ${money(loan.outstanding_cents, cur)} is still to pay.`)
    : null;
  const chips = [...new Set([Math.min(loan.installment_cents, max), max])].filter((v) => v > 0);

  const run = async () => {
    if (!ok || !cents) return;
    setBusy(true);
    setError(null);
    try {
      const l = await api.repayLoanNow(loan.id, cents, requestId);
      toast.show(l.status === 'repaid' ? 'All paid back! 🎉' : `Paid back ${money(cents, cur)}`, 'success');
      await onChanged();
      onClose();
    } catch (e) {
      setError(moneyError(e, `${self ? 'You only have' : `${name} only has`} ${money(spending, cur)} in the wallet.`));
      if (isStale(e)) await onChanged();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open onClose={onClose} title="Pay back now"
      description={`${money(loan.outstanding_cents, cur)} still to go for “${loan.purpose}”. It comes out of ${self ? 'your' : `${name}’s`} wallet.`}
      footer={
        <SheetActions onCancel={onClose}>
          <Button size="lg" icon="check" loading={busy} disabled={!ok} onClick={run}>Pay back {cents && ok ? money(cents, cur) : ''}</Button>
        </SheetActions>
      }
    >
      <div className="space-y-4">
        <AmountInput kind="money" label="How much?" value={cents} onChange={(v) => { setCents(v); setError(null); }} max={10_000_000} />
        <div role="group" aria-label="Quick amounts" className="flex flex-wrap gap-2">
          {chips.map((v) => (
            <Chip key={v} selected={cents === v} onClick={() => { setCents(v); setError(null); }}>
              {v === loan.outstanding_cents ? `Everything (${money(v, cur)})` : v === max ? `All I have (${money(v, cur)})` : money(v, cur)}
            </Chip>
          ))}
        </div>
        <OverLine text={overText} />
        <p className="text-[14px] text-muted">Paying back early means the loan is gone sooner, and less comes off the pocket money later.</p>
        <ErrorLine error={error} />
      </div>
    </Sheet>
  );
}

function ForgiveSheet({ loan, name, cur, onClose, onChanged }: {
  loan: Loan; name: string; cur: string; onClose: () => void; onChanged: () => Promise<void>;
}) {
  const toast = useToast();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.forgiveLoan(loan.id, clip(note, 200) || null);
      toast.show(`Forgiven. ${name} doesn’t owe anything any more.`, 'success');
      await onChanged();
      onClose();
    } catch (e) {
      setError(moneyError(e));
      if (isStale(e)) await onChanged();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open onClose={onClose} title="Forgive the rest?"
      description={`${name} won’t pay back the last ${money(loan.outstanding_cents, cur)} for “${loan.purpose}”. The loan closes, and this can’t be undone.`}
      footer={
        <SheetActions onCancel={onClose}>
          <Button size="lg" icon="heart" loading={busy} onClick={run}>Forgive {money(loan.outstanding_cents, cur)}</Button>
        </SheetActions>
      }
    >
      <div className="space-y-4">
        <Textarea label="A note for the child" optional value={note} maxLength={200} rows={2} onChange={(e) => setNote(e.target.value)} />
        <QuickChips label="Quick notes" options={['A birthday present', 'You worked really hard', 'Let’s start fresh']} value={note} onPick={setNote} />
        <ErrorLine error={error} />
      </div>
    </Sheet>
  );
}

// ---------------------------------------------------------------- ask / record

/** A kid asks for a loan (mode 'ask'), or a parent writes down a loan already given (mode 'record' → active at once). */
export function AskLoanSheet({ member, mode, cur, onClose, onChanged }: {
  member: Member; mode: 'ask' | 'record'; cur: string; onClose: () => void; onChanged: () => Promise<void>;
}) {
  const { family, now } = useApp();
  const features = useFeatures();
  const toast = useToast();
  const name = member.display_name;
  const ask = mode === 'ask';
  const today = todayISO(family?.timezone ?? 'UTC', now());
  const allowanceOn = features.on('allowance');
  const allowance = allowanceOn ? member.allowance_cents ?? 0 : 0;
  const [amount, setAmount] = useState<number | null>(null);
  const [purpose, setPurpose] = useState('');
  const [plan, setPlan] = useState<LoanPlan>('per_pay');
  const [installment, setInstallment] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const amt = amount ?? 0;
  const inst = plan === 'next_pay' ? amt : installment ?? 0;
  const tooBigInst = plan === 'per_pay' && inst > amt && amt > 0;
  const overPm = allowance > 0 && inst > allowance && !tooBigInst;
  const est = !tooBigInst && amt > 0 && inst > 0 ? estimate(member, allowanceOn, today, amt, inst) : null;
  const ok = amt > 0 && amt <= 10_000_000 && purpose.trim().length > 0 && inst > 0 && !tooBigInst && !(ask && overPm);
  const quarter = Math.floor(allowance / 4);
  const half = Math.floor(allowance / 2);

  const impact = (() => {
    if (!est) return null;
    const left = (n: number) => (allowance - n <= 0 ? 'nothing' : money(allowance - n, cur));
    const get = ask ? 'You’ll get' : `${name} gets`;
    const first = est.full === 1 && est.rest === 0
      ? `${get} ${left(inst)} instead of ${money(allowance, cur)} on the next pocket money day (${shortDate(est.next)}).`
      : `${get} ${left(inst)} instead of ${money(allowance, cur)} on ${plural(est.full, 'pocket money day')}${est.rest > 0 ? `, then ${left(est.rest)} once` : ''}.`;
    return `${first} Paid off around ${shortDate(est.payoff)}.`;
  })();

  const run = async () => {
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      await api.requestLoan({ member: member.id, amount: amt, purpose: clip(purpose, 80), plan, installment: plan === 'per_pay' ? inst : null });
      toast.show(ask ? 'Asked! A grown-up will look at it.' : `Written down. ${name} pays it back from the pocket money.`, 'success');
      await onChanged();
      onClose();
    } catch (e) {
      if (await closedIfOff(e, toast, onClose, onChanged)) return;
      setError(moneyError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open onClose={onClose} title={ask ? 'Ask for a loan 🤝' : `Record a loan for ${name}`}
      description={ask
        ? 'Borrow from a grown-up now, and pay it back from your pocket money.'
        : `You already gave ${name} the money (cash or bank). The app keeps track of what’s still to pay back.`}
      footer={
        <SheetActions onCancel={onClose} note={!ok && amt > 0 && purpose.trim() === '' ? 'Say what it’s for first.' : undefined}>
          <Button size="lg" icon={ask ? 'check' : 'plus'} loading={busy} disabled={!ok} onClick={run}>{ask ? 'Ask' : 'Record the loan'}</Button>
        </SheetActions>
      }
    >
      <div className="space-y-4">
        <AmountInput
          kind="money" label={ask ? 'How much do you want to borrow?' : 'How much did you lend?'} value={amount} fxEntry
          onChange={(v) => { setAmount(v); setError(null); }} max={10_000_000}
        />
        <Input
          label="What is it for?" value={purpose} maxLength={80} placeholder="A school trip"
          onChange={(e) => { setPurpose(e.target.value); setError(null); }}
        />
        <div className="space-y-2">
          <p className="font-semibold">{ask ? 'How will you pay it back?' : 'How does it get paid back?'}</p>
          <Segmented<LoanPlan>
            label="How to pay it back" value={plan} onChange={(v) => { setPlan(v); setError(null); }}
            options={[{ value: 'per_pay', label: 'A bit from each pocket money' }, { value: 'next_pay', label: 'All from the next pocket money' }]}
          />
        </div>
        {plan === 'per_pay' && (
          <div className="space-y-2">
            <AmountInput
              kind="money" label="How much from each pocket money?" value={installment}
              onChange={(v) => { setInstallment(v); setError(null); }} max={10_000_000}
              error={tooBigInst ? 'That’s more than the loan.' : undefined}
            />
            {allowance > 0 && quarter > 0 && (
              <div role="group" aria-label="Part of the pocket money" className="flex flex-wrap gap-2">
                <Chip selected={installment === quarter} onClick={() => setInstallment(quarter)}>¼ ({money(quarter, cur)})</Chip>
                {half > quarter && <Chip selected={installment === half} onClick={() => setInstallment(half)}>½ ({money(half, cur)})</Chip>}
              </div>
            )}
          </div>
        )}
        {overPm && <OverLine text={`That’s more than ${ask ? 'your' : `${name}’s`} pocket money (${money(allowance, cur)}) — pick a smaller amount${plan === 'next_pay' ? ' or “A bit from each pocket money”' : ''}.`} />}
        {impact ? (
          <p className="rounded-xl bg-accent-soft px-3 py-2 text-[15px] font-semibold" aria-live="polite"><span aria-hidden="true">📅 </span>{impact}</p>
        ) : allowance <= 0 ? (
          <p className="rounded-xl bg-surface-2 px-3 py-2 text-[15px]">No pocket money set — {ask ? 'you' : name} can pay it back with “Pay back now”.</p>
        ) : null}
        {ask && (
          <>
            <p className="text-[14px] text-muted">A grown-up may add a small fee, like interest at a bank. Then you choose: yes or no.</p>
            <p className="rounded-xl bg-surface-2 px-3 py-2 text-[14px]"><span aria-hidden="true">💡 </span>{TIP}</p>
          </>
        )}
        <ErrorLine error={error} />
      </div>
    </Sheet>
  );
}

// ---------------------------------------------------------------- parents decide

/** Say no · Yes · Yes, with a fee — on the kid's loan card and on the Requests page. */
export function LoanDecideButtons({ loan, name, cur, member, onChanged }: {
  loan: Loan; name: string; cur: string; member: Member | undefined; onChanged: () => Promise<void>;
}) {
  const [sheet, setSheet] = useState<'yes' | 'fee' | 'no' | null>(null);
  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" icon="close" onClick={() => setSheet('no')}>Say no</Button>
        <Button icon="check" onClick={() => setSheet('yes')}>Yes</Button>
        <Button variant="ghost" onClick={() => setSheet('fee')} className="col-span-2">Yes, with a fee</Button>
      </div>
      {sheet && <DecideSheet mode={sheet} loan={loan} name={name} cur={cur} member={member} onClose={() => setSheet(null)} onChanged={onChanged} />}
    </>
  );
}

function DecideSheet({ mode, loan, name, cur, member, onClose, onChanged }: {
  mode: 'yes' | 'fee' | 'no'; loan: Loan; name: string; cur: string; member: Member | undefined; onClose: () => void; onChanged: () => Promise<void>;
}) {
  const toast = useToast();
  const [note, setNote] = useState('');
  const [fee, setFee] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const feeOk = mode !== 'fee' || (!!fee && fee > 0 && fee <= 10_000_000);
  const total = loan.amount_cents + (mode === 'fee' ? fee ?? 0 : 0);
  const days = Math.ceil(total / loan.installment_cents);
  const pctChip = (p: number) => Math.max(1, Math.round((loan.amount_cents * p) / 100));
  const hasPm = (member?.allowance_cents ?? 0) > 0;

  const run = async () => {
    if (!feeOk) return;
    setBusy(true);
    setError(null);
    try {
      await api.decideLoan(loan.id, mode !== 'no', clip(note, 200) || null, mode === 'fee' ? fee ?? 0 : 0);
      toast.show(mode === 'no' ? 'Said no' : mode === 'fee' ? `Offer sent. ${name} decides.` : `Yes! Now give ${name} the money.`, 'success');
      await onChanged();
      onClose();
    } catch (e) {
      const msg = moneyError(e);
      setError(msg);
      if (isStale(e)) await onChanged();
    } finally {
      setBusy(false);
    }
  };

  const title = mode === 'no' ? `Say no to ${name}?` : mode === 'fee' ? 'Yes, with a fee' : `Lend ${name} ${money(loan.amount_cents, cur)}?`;
  return (
    <Sheet
      open onClose={onClose} title={title}
      description={mode === 'no' ? `“${loan.purpose}” · ${money(loan.amount_cents, cur)}` : `Give ${name} the money in real life (cash or bank). The app takes it off the pocket money.`}
      footer={
        <SheetActions onCancel={onClose}>
          <Button size="lg" variant={mode === 'no' ? 'danger' : 'primary'} icon={mode === 'no' ? 'close' : 'check'} loading={busy} disabled={!feeOk} onClick={run}>
            {mode === 'no' ? 'Say no' : mode === 'fee' ? 'Send the offer' : 'Yes, lend it'}
          </Button>
        </SheetActions>
      }
    >
      <div className="space-y-4">
        {mode !== 'no' && (
          <p className="rounded-xl bg-surface-2 px-3 py-2 text-[15px]">
            “{loan.purpose}” · {planText(loan.plan, loan.installment_cents, cur)}
            {hasPm ? ` · ${plural(days, 'pocket money day')}` : ''}
          </p>
        )}
        {mode === 'fee' && (
          <>
            <AmountInput
              kind="money" label="Fee (one time)" value={fee} onChange={(v) => { setFee(v); setError(null); }} max={10_000_000}
              hint={`Like interest at a bank: ${name} pays back ${money(total, cur)} instead of ${money(loan.amount_cents, cur)}.`}
            />
            <div role="group" aria-label="Quick fees" className="flex flex-wrap gap-2">
              {[5, 10].map((p) => (
                <Chip key={p} selected={fee === pctChip(p)} onClick={() => setFee(pctChip(p))}>{p}% ({money(pctChip(p), cur)})</Chip>
              ))}
            </div>
            <p className="text-[14px] text-muted">{name} must say yes to the fee first. The same amount comes off each pocket money, so it just takes a bit longer.</p>
          </>
        )}
        <Textarea
          label={mode === 'no' ? 'Why not?' : `A note for ${name}`} optional value={note} maxLength={200} rows={2}
          onChange={(e) => { setNote(e.target.value); setError(null); }}
        />
        {mode === 'no' && (
          <QuickChips label="Quick reasons" options={['Not this time', 'Let’s save up for it', 'Let’s talk about it']} value={note} onPick={setNote} />
        )}
        <ErrorLine error={error} />
      </div>
    </Sheet>
  );
}

/** One loan request on the Requests page (managers). */
export function LoanRequestCard({ loan, cur, onChanged }: { loan: Loan; cur: string; onChanged: () => Promise<void> }) {
  const { membersById, family, now } = useApp();
  const features = useFeatures();
  const kid = membersById[loan.member_id];
  const name = kid?.display_name ?? 'A child';
  const today = todayISO(family?.timezone ?? 'UTC', now());
  const est = kid ? estimate(kid, features.on('allowance'), today, loan.total_cents, loan.installment_cents) : null;
  return (
    <Card className="space-y-3">
      <div className="flex items-start gap-3">
        {kid && <Avatar member={kid} size="sm" />}
        <div className="min-w-0 flex-1">
          <p className="font-bold leading-snug">
            {name} wants to borrow <span className="tabular-nums">{money(loan.amount_cents, cur)}</span> <FxNote cents={loan.amount_cents} currency={cur} />
          </p>
          <p className="text-[15px] [overflow-wrap:anywhere]">For “{loan.purpose}”</p>
          <p className="mt-1 text-[14px] text-muted">
            {planText(loan.plan, loan.installment_cents, cur)}
            {est ? ` · paid off around ${shortDate(est.payoff)}` : ' · no pocket money set'}
            {' · '}{timeAgo(loan.created_at)}
          </p>
        </div>
      </div>
      <LoanDecideButtons loan={loan} name={name} cur={cur} member={kid} onChanged={onChanged} />
    </Card>
  );
}

/** The 🤝 section at the top of Requests: loan requests waiting for a parent. */
export function LoanRequestsSection({ loans, cur, onChanged }: { loans: Loan[]; cur: string; onChanged: () => Promise<void> }) {
  if (loans.length === 0) return null;
  return (
    <section aria-labelledby="loan-requests-title" className="space-y-2">
      <h2 id="loan-requests-title" className="flex min-h-11 items-center px-1 text-sm font-bold uppercase tracking-wide text-muted">
        <span aria-hidden="true">🤝&nbsp;</span>Loan requests ({loans.length})
      </h2>
      <ul className="space-y-3">
        {loans.map((l) => <li key={l.id}><LoanRequestCard loan={l} cur={cur} onChanged={onChanged} /></li>)}
      </ul>
    </section>
  );
}
