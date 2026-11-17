// Real bank balance (feature 'bank'): what a real bank account (e.g. Revolut) says, typed in by the account owner or a
// parent. Information only — it never moves app money. BankCard (inside the wallet) and BankSheet (Update balance).
import { useId, useState } from 'react';
import {
  AmountInput, Button, Card, Chip, EmptyState, FxNote, Icon, IconButton, Input, Segmented, Sheet, Spinner, Textarea, Toggle, cx, useConfirm,
  useToast,
} from '../../components/ui';
import { api } from '../../lib/api';
import { toAppError } from '../../lib/errors';
import { addDays, currencySymbol, formatDate, money, todayISO } from '../../lib/format';
import { currencyWord, spendCurrencyOf } from '../../lib/fx';
import { useApp } from '../../lib/session';
import type { BankBalance, Member } from '../../lib/types';
import { clip, isFeatureOff, isStale, moneyError, useData } from './moneyUtils';
import { CardTitle, SheetActions } from './parts';

const HISTORY_MAX = 20;
const DEFAULT_LABEL = 'Bank';
const SUGGESTED = ['Revolut'];
const MAX_CENTS = 1_000_000_000;
const MAX_OVERDRAWN_CENTS = 10_000_000;

const labelKey = (s: string) => s.trim().toLowerCase();
/** One account = a name + a currency (a Revolut in euro and a Revolut in rand are two accounts). */
const accountKey = (b: Pick<BankBalance, 'label' | 'currency'>) => `${labelKey(b.label)}|${b.currency}`;

/** Newest entry per account (the list is newest first). */
function latestPerLabel(list: BankBalance[]): BankBalance[] {
  const seen = new Set<string>();
  return list.filter((b) => {
    const k = accountKey(b);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** "today", "yesterday" or "on Mon 16 Nov". */
function onDay(date: string, today: string): string {
  if (date === today) return 'today';
  if (date === addDays(today, -1)) return 'yesterday';
  return `on ${formatDate(date)}`;
}

/** "you", "Dad" or "someone" (a member who left). */
function byName(id: string | null, membersById: Record<string, Member>, meId: string | undefined): string {
  if (!id) return 'someone';
  if (id === meId) return 'you';
  return membersById[id]?.display_name ?? 'someone';
}

function BankAmount({ cents, cur, className }: { cents: number; cur: string; className?: string }) {
  return (
    <span className={cx('whitespace-nowrap font-extrabold tabular-nums', cents < 0 ? 'text-bad' : 'text-ink', className)}>
      <span aria-hidden="true">{money(cents, cur)}</span>
      <span className="sr-only">{cents < 0 ? `minus ${money(-cents, cur)} (overdrawn)` : money(cents, cur)}</span>
    </span>
  );
}

export interface BankCardProps {
  memberId: string;
  /** The viewer owns the account. */
  self: boolean;
  /** Account owner's name ("Sam"). */
  name: string;
  /** May add balances (self, or a parent for a kid). Others only look. */
  canEdit: boolean;
  cur: string;
  /** The server said the part is switched off: reload the app so the card disappears. */
  onFeatureOff: () => Promise<void>;
}

/** "🏦 Real bank account": latest balance per account, a clear "not the app wallet" note, Update balance and History. */
export function BankCard({ memberId, self, name, canEdit, cur, onFeatureOff }: BankCardProps) {
  const { me, family, membersById, now } = useApp();
  const toast = useToast();
  const confirm = useConfirm();
  const titleId = useId();
  const historyId = useId();
  const data = useData(() => api.listBankBalances(memberId, 50), [memberId]);
  const [sheet, setSheet] = useState(false);
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  if (data.code === 'not_allowed') return null;
  const tz = family?.timezone ?? 'UTC';
  const today = todayISO(tz, now());
  const list = data.data ?? [];
  const latest = latestPerLabel(list);
  const history = list.slice(0, HISTORY_MAX);
  const by = (id: string | null) => byName(id, membersById, me?.id);
  // Account currencies on offer: the family currency, the one the kids spend in, and any already used.
  const currencies = [...new Set([cur, spendCurrencyOf(family), ...list.map((b) => b.currency)].filter((x): x is string => !!x))];

  const remove = async (b: BankBalance) => {
    const ok = await confirm({
      title: `Delete this ${b.label} balance?`,
      message: `${money(b.amount_cents, b.currency)} ${onDay(b.as_of, today)}. This only removes it from the app — the real bank account doesn’t change.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    setDeleting(b.id);
    try {
      await api.deleteBankBalance(b.id);
      toast.show('Deleted', 'success');
      await data.reload();
    } catch (e) {
      toast.show(moneyError(e), 'error');
      if (isStale(e)) await data.reload();
    } finally {
      setDeleting(null);
    }
  };

  const update = canEdit ? (
    <Button size="sm" variant="secondary" icon="edit" onClick={() => setSheet(true)}>Update balance</Button>
  ) : undefined;

  return (
    <Card role="region" aria-labelledby={titleId}>
      <CardTitle id={titleId} right={list.length > 0 ? update : undefined}>
        <span aria-hidden="true">🏦 </span>Real bank account
      </CardTitle>
      <p className="flex gap-2 rounded-xl bg-surface-2 px-3 py-2 text-[14px]">
        <Icon name="info" size={18} className="mt-0.5 shrink-0 text-muted" />
        <span>{self ? 'This is your real bank account — not your app wallet.' : `This is ${name}’s real bank account — not the app wallet.`}</span>
      </p>

      {data.loading ? (
        <div className="flex items-center gap-3 py-4 text-muted"><Spinner /> Loading…</div>
      ) : data.error && !data.data ? (
        <div className="space-y-2 py-3" role="alert">
          <p className="text-[15px]">We couldn’t load the bank balance. {data.error}</p>
          <Button size="sm" variant="secondary" icon="reset" onClick={() => void data.reload()}>Try again</Button>
        </div>
      ) : list.length === 0 ? (
        <EmptyState
          className="!py-5" emoji="🏦" title="No bank balance yet"
          message={canEdit ? 'Add it after you check the banking app.' : undefined}
          action={canEdit ? <Button icon="plus" onClick={() => setSheet(true)}>Update balance</Button> : undefined}
        />
      ) : (
        <>
          <ul className="mt-1 divide-y divide-line">
            {latest.map((b) => (
              <li key={b.id} className="flex items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold">{b.label}</p>
                  <p className="text-[14px] text-muted">{onDay(b.as_of, today)} · by {by(b.created_by)}</p>
                  {b.note && <p className="break-words text-[14px]">{b.note}</p>}
                </div>
                <div className="shrink-0 text-right">
                  <BankAmount cents={b.amount_cents} cur={b.currency} className="block text-lg" />
                  {b.amount_cents !== 0 && <FxNote cents={Math.abs(b.amount_cents)} currency={b.currency} suffix="today" className="block text-[14px]" />}
                </div>
              </li>
            ))}
          </ul>

          <div className="mt-1 border-t border-line pt-1">
            <button
              type="button" aria-expanded={open} aria-controls={historyId} onClick={() => setOpen((o) => !o)}
              className="-mx-1 flex min-h-11 w-[calc(100%+0.5rem)] items-center justify-between gap-2 rounded-lg px-1 font-semibold text-accent-ink hover:bg-surface-2"
            >
              <span>History ({history.length})</span>
              <Icon name="chevron-down" size={20} className={cx('shrink-0 transition', open && 'rotate-180')} />
            </button>
            {open && (
              <ul id={historyId} className="divide-y divide-line">
                {history.map((b) => (
                  <li key={b.id} className="flex items-center gap-2 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-baseline gap-x-2">
                        <span className="font-semibold">{b.label}</span>
                        <BankAmount cents={b.amount_cents} cur={b.currency} className="text-[15px]" />
                      </p>
                      <p className="text-[13px] text-muted">{onDay(b.as_of, today)} · by {by(b.created_by)}</p>
                      {b.note && <p className="break-words text-[14px]">{b.note}</p>}
                    </div>
                    {b.can_delete && (
                      <IconButton
                        icon="trash" className="!text-bad" disabled={deleting === b.id} onClick={() => void remove(b)}
                        label={`Delete ${b.label} ${money(b.amount_cents, b.currency)} ${onDay(b.as_of, today)}`}
                      />
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}

      {sheet && canEdit && (
        <BankSheet
          memberId={memberId} self={self} name={name} cur={cur} today={today} currencies={currencies}
          accounts={latest} last={list[0] ?? null}
          onClose={() => setSheet(false)} onSaved={async () => { setOpen(false); await data.reload(); }} onFeatureOff={onFeatureOff}
        />
      )}
    </Card>
  );
}

/** Update balance: amount (with an overdrawn switch), account name, the day it was checked and a note. */
function BankSheet({ memberId, self, name, cur, today, currencies, accounts, last, onClose, onSaved, onFeatureOff }: {
  memberId: string; self: boolean; name: string; cur: string; today: string; currencies: string[];
  accounts: BankBalance[]; last: BankBalance | null;
  onClose: () => void; onSaved: () => Promise<void>; onFeatureOff: () => Promise<void>;
}) {
  const toast = useToast();
  const [cents, setCents] = useState<number | null>(null);
  const [negative, setNegative] = useState(false);
  const [label, setLabel] = useState(last?.label ?? DEFAULT_LABEL);
  const [currency, setCurrency] = useState(last && currencies.includes(last.currency) ? last.currency : cur);
  const [asOf, setAsOf] = useState(today);
  const [note, setNote] = useState('');
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dateServerErr, setDateServerErr] = useState<string | null>(null);

  const minDate = addDays(today, -366);
  const pickLabel = (c: string) => {
    setLabel(c);
    setError(null);
    const acc = accounts.find((b) => labelKey(b.label) === labelKey(c));
    if (acc && currencies.includes(acc.currency)) setCurrency(acc.currency);
  };
  const chips = [...accounts.map((b) => b.label), ...SUGGESTED].filter((l, i, all) => all.findIndex((x) => labelKey(x) === labelKey(l)) === i);
  const signed = cents == null ? null : negative ? -cents : cents;
  const amountErr = !tried ? undefined
    : cents == null ? 'Type the balance you see in the banking app.'
      : negative && cents > MAX_OVERDRAWN_CENTS ? `That’s more than ${money(MAX_OVERDRAWN_CENTS, currency, { whole: true })} overdrawn. Check the number.`
        : undefined;
  const labelErr = tried && !label.trim() ? 'Give the account a name, e.g. Revolut.' : undefined;
  const dateErr = dateServerErr ?? (!tried ? undefined
    : !asOf ? 'Pick the day you checked.'
      : asOf > today ? 'That’s in the future. Pick today or earlier.'
        : asOf < minDate ? 'Pick a day in the last year.'
          : undefined);

  const save = async () => {
    setTried(true);
    setError(null);
    const badDate = !asOf || asOf > today || asOf < minDate;
    if (cents == null || (negative && cents > MAX_OVERDRAWN_CENTS) || !label.trim() || badDate || signed == null) return;
    setBusy(true);
    try {
      const b = await api.setBankBalance(memberId, signed, clip(label, 40), asOf, note.trim() ? clip(note, 200) : null, currency);
      toast.show(`${b?.label ?? clip(label, 40)}: ${money(signed, currency)} saved 🏦`, 'success');
      await onSaved();
      onClose();
    } catch (e) {
      if (isFeatureOff(e)) {
        toast.show(moneyError(e), 'error');
        onClose();
        await onFeatureOff();
        return;
      }
      const a = toAppError(e);
      if (a.code === 'invalid' && a.detail === 'as_of') setDateServerErr('Pick a day in the last year, not in the future.');
      else if (a.code === 'invalid' && a.detail === 'currency') setError('That currency isn’t available any more. Pick another one.');
      else if (a.code === 'too_many_attempts') setError('That’s a lot of updates today. Try again tomorrow.');
      else setError(moneyError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open onClose={onClose} title="Update bank balance 🏦"
      description={self ? 'Type what your banking app says right now.' : `Type what ${name}’s banking app says right now.`}
      footer={
        <SheetActions onCancel={onClose}>
          <Button size="lg" icon="check" loading={busy} onClick={save}>Save</Button>
        </SheetActions>
      }
    >
      <div className="space-y-4">
        {currencies.length > 1 && (
          <div className="space-y-2">
            <p className="text-[15px] font-semibold" aria-hidden="true">Money in this account</p>
            <Segmented<string>
              label="Money in this account" value={currency} onChange={(v) => { setCurrency(v); setError(null); }}
              options={currencies.map((c) => ({ value: c, label: `${currencySymbol(c)} ${currencyWord(c)}` }))}
            />
          </div>
        )}
        <AmountInput
          kind="money" label="Balance" value={cents} error={amountErr} chips={[]} currency={currency}
          max={negative ? MAX_OVERDRAWN_CENTS : MAX_CENTS} onChange={(v) => { setCents(v); setError(null); }}
        />
        <Toggle
          checked={negative} onChange={(v) => { setNegative(v); setError(null); }}
          label="Overdrawn (negative)" description="Switch on when the banking app shows a minus."
        />
        <div className="space-y-2">
          <Input
            label="Account name" value={label} maxLength={40} placeholder="Revolut" autoComplete="off" error={labelErr}
            onChange={(e) => { setLabel(e.target.value); setError(null); }}
          />
          <div role="group" aria-label="Account names" className="flex flex-wrap gap-2">
            {chips.map((c) => (
              <Chip key={c} selected={labelKey(label) === labelKey(c)} onClick={() => pickLabel(c)}>{c}</Chip>
            ))}
          </div>
        </div>
        <Input
          type="date" label="Checked on" value={asOf} min={minDate} max={today} error={dateErr}
          onChange={(e) => { setAsOf(e.target.value); setDateServerErr(null); setError(null); }}
        />
        <Textarea label="Note" optional rows={2} maxLength={200} value={note} placeholder="After buying shoes" onChange={(e) => setNote(e.target.value)} />
        {signed != null && label.trim() && (
          <p className="rounded-xl bg-surface-2 px-3 py-2.5 text-[15px]" aria-live="polite">
            Saves <strong>{clip(label, 40)}</strong>: <BankAmount cents={signed} cur={currency} /> {asOf ? onDay(asOf, today) : ''}
          </p>
        )}
        <p className="text-[14px] text-muted">Only for looking. It doesn’t change {self ? 'your' : `${name}’s`} app wallet.</p>
        {error && <p role="alert" className="rounded-xl bg-bad-soft px-3 py-2 text-[15px] font-semibold text-bad">{error}</p>}
      </div>
    </Sheet>
  );
}
