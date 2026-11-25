// Wallet action sheets: Move money, Ask to spend, Ask to take out savings, Use time (pocket money: AllowanceEditor.tsx).
import { useState } from 'react';
import { AmountInput, Button, Chip, Input, Segmented, Sheet, Textarea, useToast } from '../../components/ui';
import { api } from '../../lib/api';
import { useFeatures } from '../../lib/features';
import { minutes, money } from '../../lib/format';
import type { Balances, TimeLabel } from '../../lib/types';
import { clip, isFeatureOff, moneyError } from './moneyUtils';
import { SheetActions } from './parts';
import { POTS, TIME_LABELS, timeLabelWords } from './txMeta';

interface BaseProps {
  memberId: string;
  /** Wallet owner's name ("Sam"). */
  name: string;
  /** The viewer owns the wallet. */
  self: boolean;
  balances: Balances;
  cur: string;
  onClose: () => void;
  onChanged: () => Promise<void>;
}

type Toast = ReturnType<typeof useToast>;

/** The part was switched off meanwhile (server said `feature_off`): say so, close and reload so it disappears. */
async function closedIfOff(e: unknown, toast: Toast, onClose: () => void, onChanged: () => Promise<void>): Promise<boolean> {
  if (!isFeatureOff(e)) return false;
  toast.show(moneyError(e), 'error');
  onClose();
  await onChanged();
  return true;
}

export function ErrorLine({ error }: { error: string | null }) {
  if (!error) return null;
  return <p role="alert" className="rounded-xl bg-bad-soft px-3 py-2 text-[15px] font-semibold text-bad">{error}</p>;
}

/** Inline "not enough" message in the warning style (the button is disabled meanwhile). */
export function OverLine({ text }: { text: string | null }) {
  if (!text) return null;
  return <p className="rounded-xl bg-warn-soft px-3 py-2 text-[15px] font-semibold text-warn" aria-live="polite"><span aria-hidden="true">⚠️ </span>{text}</p>;
}

/** Move money between the Wallet and Savings. Kids: to savings only; managers may choose the direction. */
export function MoveSheet({ memberId, name, self, balances, cur, onClose, onChanged, canToSpending, initialTo = 'savings' }: BaseProps & {
  canToSpending: boolean; initialTo?: 'savings' | 'spending';
}) {
  const toast = useToast();
  const features = useFeatures();
  const [to, setTo] = useState<'savings' | 'spending'>(canToSpending ? initialTo : 'savings');
  const [cents, setCents] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const from = Math.max(0, to === 'savings' ? balances.spending : balances.savings);
  const fromWord = to === 'savings' ? 'to spend' : 'in savings';
  const over = cents != null && cents > from;
  const overText = from <= 0
    ? (self ? `You have nothing ${fromWord} right now.` : `${name} has nothing ${fromWord} right now.`)
    : over ? (self ? `You only have ${money(from, cur)} to move.` : `${name} only has ${money(from, cur)} to move.`) : null;
  const ok = !!cents && cents > 0 && !over;
  const quick = [
    { label: money(100, cur, { whole: true }), v: 100 },
    { label: money(500, cur, { whole: true }), v: 500 },
    { label: 'Half', v: Math.floor(from / 2) },
    { label: 'All', v: from },
  ];

  const run = async () => {
    if (!ok || !cents) return;
    setBusy(true);
    setError(null);
    try {
      await api.transfer(memberId, cents, to);
      toast.show(`Moved ${money(cents, cur)} to ${POTS[to].label} ${POTS[to].emoji}`, 'success');
      await onChanged();
      onClose();
    } catch (e) {
      if (await closedIfOff(e, toast, onClose, onChanged)) return;
      setError(moneyError(e, self ? `You only have ${money(from, cur)} to move.` : `${name} only has ${money(from, cur)} to move.`));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open onClose={onClose} title={canToSpending ? 'Move money' : 'Move to savings 🐷'}
      description={self ? `You have ${money(from, cur)} ${fromWord}.` : `${name} has ${money(from, cur)} ${fromWord}.`}
      footer={
        <SheetActions onCancel={onClose}>
          <Button size="lg" icon="swap" loading={busy} disabled={!ok} onClick={run}>Move it</Button>
        </SheetActions>
      }
    >
      <div className="space-y-4">
        {canToSpending && (
          <Segmented<'savings' | 'spending'>
            label="Where to" value={to} onChange={(v) => { setTo(v); setError(null); }}
            options={[{ value: 'savings', label: '👛 → 🐷 To savings' }, { value: 'spending', label: '🐷 → 👛 To wallet' }]}
          />
        )}
        <AmountInput kind="money" label="How much?" value={cents} onChange={(v) => { setCents(v); setError(null); }} max={10_000_000} />
        <div role="group" aria-label="Quick amounts" className="flex flex-wrap gap-2">
          {quick.map((q) => (
            <Chip key={q.label} selected={cents === q.v && q.v > 0} disabled={q.v <= 0 || q.v > from} onClick={() => { setCents(q.v); setError(null); }}>
              {q.label}{(q.label === 'Half' || q.label === 'All') && q.v > 0 ? ` (${money(q.v, cur)})` : ''}
            </Chip>
          ))}
        </div>
        <OverLine text={overText} />
        {to === 'savings' && self && (
          <p className="text-[14px] text-muted">
            {features.on('interest') ? 'Savings grow over time. ' : ''}
            {features.on('requests') ? 'To take money out later, you ask a grown-up.' : 'A grown-up can move it back to your wallet later.'}
          </p>
        )}
        <ErrorLine error={error} />
      </div>
    </Sheet>
  );
}

/** Ask to spend money from the Wallet (a grown-up approves and pays in real life). */
export function AskSpendSheet({ balances, cur, onClose, onChanged }: BaseProps) {
  const toast = useToast();
  const [label, setLabel] = useState('');
  const [cents, setCents] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const have = Math.max(0, balances.spending);
  const tooMuch = have <= 0 || (cents != null && cents > have);
  const overText = tooMuch ? `You have ${money(have, cur)}. Save up or earn more first.` : null;
  const labelErr = tried && !label.trim() ? 'Say what you want to buy.' : undefined;
  const amountErr = tried && !(cents && cents > 0) ? 'How much does it cost?' : undefined;

  const run = async () => {
    setTried(true);
    if (!label.trim() || !(cents && cents > 0) || tooMuch) return;
    setBusy(true);
    setError(null);
    try {
      await api.createRequest('spend', cents, clip(label, 60), note.trim() ? clip(note, 200) : null);
      toast.show('Asked! A grown-up will say yes or no.', 'success');
      await onChanged();
      onClose();
    } catch (e) {
      if (await closedIfOff(e, toast, onClose, onChanged)) return;
      setError(moneyError(e, `You have ${money(have, cur)}. Save up or earn more first.`));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open onClose={onClose} title="Ask to spend 🛍️" description={`You have ${money(have, cur)} to spend.`}
      footer={
        <SheetActions onCancel={onClose}>
          <Button size="lg" icon="check" loading={busy} disabled={tooMuch} onClick={run}>Ask</Button>
        </SheetActions>
      }
    >
      <div className="space-y-4">
        <Input label="What do you want to buy?" value={label} maxLength={60} placeholder="Lego set" onChange={(e) => setLabel(e.target.value)} error={labelErr} autoComplete="off" />
        <AmountInput kind="money" label="It costs" value={cents} onChange={setCents} max={10_000_000} error={amountErr} fxEntry />
        <OverLine text={overText} />
        <Textarea label="Why?" optional rows={2} maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />
        <p className="text-[14px] text-muted">A grown-up says yes or no. If yes, it comes off your Wallet and they pay in real life.</p>
        <ErrorLine error={error} />
      </div>
    </Sheet>
  );
}

/** Ask to take money out of Savings (moves to the Wallet once approved). */
export function WithdrawSheet({ balances, cur, onClose, onChanged }: BaseProps) {
  const toast = useToast();
  const [cents, setCents] = useState<number | null>(null);
  const [label, setLabel] = useState('');
  const [note, setNote] = useState('');
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const have = Math.max(0, balances.savings);
  const tooMuch = have <= 0 || (cents != null && cents > have);
  const overText = have <= 0 ? 'Your savings are empty right now.' : tooMuch ? `You have ${money(have, cur)} in savings.` : null;
  const amountErr = tried && !(cents && cents > 0) ? 'How much do you want to take out?' : undefined;

  const run = async () => {
    setTried(true);
    if (!(cents && cents > 0) || tooMuch) return;
    setBusy(true);
    setError(null);
    try {
      await api.createRequest('withdraw', cents, label.trim() ? clip(label, 60) : null, note.trim() ? clip(note, 200) : null);
      toast.show('Asked! A grown-up will say yes or no.', 'success');
      await onChanged();
      onClose();
    } catch (e) {
      if (await closedIfOff(e, toast, onClose, onChanged)) return;
      setError(moneyError(e, `You have ${money(have, cur)} in savings.`));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open onClose={onClose} title="Ask to take out savings 🏦" description="Your savings stay safe until a grown-up says yes."
      footer={
        <SheetActions onCancel={onClose}>
          <Button size="lg" icon="check" loading={busy} disabled={tooMuch} onClick={run}>Ask</Button>
        </SheetActions>
      }
    >
      <div className="space-y-4">
        <AmountInput kind="money" label={`How much? (you have ${money(have, cur)})`} value={cents} onChange={setCents} max={10_000_000} error={amountErr} fxEntry />
        <OverLine text={overText} />
        <Input label="What for?" optional value={label} maxLength={60} placeholder="A new bike" onChange={(e) => setLabel(e.target.value)} autoComplete="off" />
        <Textarea label="Anything else?" optional rows={2} maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />
        <p className="text-[14px] text-muted">If a grown-up says yes, the money moves from Savings 🐷 to your Wallet 👛.</p>
        <ErrorLine error={error} />
      </div>
    </Sheet>
  );
}

/** Ask to use time (Wi-Fi / Game / Fun). */
export function UseTimeSheet({ balances, onClose, onChanged }: BaseProps) {
  const toast = useToast();
  const [mins, setMins] = useState<number | null>(null);
  const [label, setLabel] = useState<TimeLabel>('game');
  const [note, setNote] = useState('');
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const have = Math.max(0, balances.time);
  const tooMuch = have <= 0 || (mins != null && mins > have);
  const overText = have <= 0 ? 'You have no time saved up yet. Do a task to earn some!' : tooMuch ? `You have ${minutes(have)}.` : null;
  const amountErr = tried && !(mins && mins > 0) ? 'How many minutes?' : undefined;

  const run = async () => {
    setTried(true);
    if (!(mins && mins > 0) || tooMuch) return;
    setBusy(true);
    setError(null);
    try {
      await api.createRequest('time', mins, label, note.trim() ? clip(note, 200) : null);
      toast.show(`Asked for ${minutes(mins)} of ${timeLabelWords(label)}.`, 'success');
      await onChanged();
      onClose();
    } catch (e) {
      if (await closedIfOff(e, toast, onClose, onChanged)) return;
      setError(moneyError(e, `You have ${minutes(have)}.`));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open onClose={onClose} title="Use time ⏳" description={`You have ${minutes(have)}.`}
      footer={
        <SheetActions onCancel={onClose}>
          <Button size="lg" icon="check" loading={busy} disabled={tooMuch} onClick={run}>Ask</Button>
        </SheetActions>
      }
    >
      <div className="space-y-4">
        <AmountInput kind="time" label="How long?" value={mins} onChange={setMins} max={1440} chips={[15, 30, 60].filter((c) => c <= Math.max(have, 15))} error={amountErr} />
        <OverLine text={overText} />
        <Segmented<TimeLabel>
          label="For what?" value={label} onChange={setLabel}
          options={(Object.keys(TIME_LABELS) as TimeLabel[]).map((k) => ({ value: k, label: `${TIME_LABELS[k].emoji} ${TIME_LABELS[k].label}` }))}
        />
        <Textarea label="Note" optional rows={2} maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />
        <ErrorLine error={error} />
      </div>
    </Sheet>
  );
}
