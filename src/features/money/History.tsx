// "What happened": the ledger rows of one wallet — emoji per kind, signed amounts, reason, who and when.
// Filters (All · Money · Time · Points), "Show older" paging, a detail sheet and (managers) "Undo this".
import { useCallback, useEffect, useRef, useState } from 'react';
import { Badge, Button, Chip, EmptyState, Sheet, Textarea, cx, useToast } from '../../components/ui';
import { api } from '../../lib/api';
import { useFeatures } from '../../lib/features';
import { formatWhen } from '../../lib/format';
import { useApp } from '../../lib/session';
import type { Currency, Transaction } from '../../lib/types';
import { clip, isStale, moneyError, useDelayed, whenText, whoName } from './moneyUtils';
import { Delta, PhotoSheet, QuickChips, SheetActions, SkeletonRows, TxPhoto } from './parts';
import { CURRENCY_META, POTS, TONE_SOFT, labelMeta, txMeta, txTone } from './txMeta';

export const HISTORY_PAGE = 50;

type Filter = 'all' | Currency;
const FILTERS: { value: Filter; label: string; emoji?: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'money', label: 'Money', emoji: CURRENCY_META.money.emoji },
  { value: 'time', label: 'Time', emoji: CURRENCY_META.time.emoji },
  { value: 'points', label: 'Points', emoji: CURRENCY_META.points.emoji },
];

/** A label badge only when it adds information (e.g. "🎮 Game", "🙌 Extra"; not "Pocket money" on pocket money). */
function extraLabel(tx: Pick<Transaction, 'kind' | 'label'>) {
  const g = labelMeta(tx.label);
  if (!g) return null;
  if ((tx.kind === 'task_reward' && tx.label === 'reward') || (tx.kind === 'allowance' && tx.label === 'pocket') || tx.kind === tx.label) return null;
  return g;
}

const hasReason = (tx: Pick<Transaction, 'reason' | 'kind' | 'masked'>) =>
  !!tx.reason && tx.reason !== tx.kind && !tx.masked;

/** Kind meta for one row: a loan repayment seen by someone outside the kid and the parents reads "Pocket money adjustment". */
const rowMeta = (tx: Pick<Transaction, 'kind' | 'masked'>) =>
  tx.masked ? { emoji: '👛', label: 'Pocket money adjustment', tone: 'neutral' as const } : txMeta(tx.kind);

export interface TxRowProps {
  tx: Transaction;
  /** Family currency (ISO). */
  cur: string;
  /** Rows created by this member read "You". */
  viewerId: string | null;
  onOpen?: () => void;
  /** Preview only: a local image URL instead of tx.photo_path. */
  photoSrc?: string | null;
  className?: string;
}

/** One ledger row as the wallet owner sees it. */
export function TxRow({ tx, cur, viewerId, onOpen, photoSrc, className }: TxRowProps) {
  const { membersById, family, now } = useApp();
  const tz = family?.timezone ?? 'UTC';
  const meta = rowMeta(tx);
  const tone = txTone(tx.kind, tx.amount);
  const lbl = extraLabel(tx);
  const reversed = !!tx.reversed_by;
  const pot = POTS[tx.pot];
  const hasPhoto = !!(photoSrc || tx.photo_path);
  const body = (
    <>
      <span className={cx('grid size-11 shrink-0 place-items-center rounded-full text-[1.35rem]', TONE_SOFT[tone])} aria-hidden="true">{meta.emoji}</span>
      <span className="min-w-0 flex-1 text-left">
        <span className="flex items-start justify-between gap-2">
          <span className="font-bold leading-snug">{meta.label}</span>
          <Delta currency={tx.currency} value={tx.amount} cur={cur} tone={tone} struck={reversed} className="text-[17px]" />
        </span>
        {hasReason(tx) && <span className="block text-[15px] leading-snug [overflow-wrap:anywhere]">{tx.reason}</span>}
        <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted">
          <span>{whoName(tx.created_by, membersById, viewerId)} · {whenText(tx.effective_at, tz, now())}</span>
          {pot && <Badge><span aria-hidden="true">{pot.emoji}</span>{pot.label}</Badge>}
          {lbl && <Badge><span aria-hidden="true">{lbl.emoji}</span>{lbl.label}</Badge>}
          {reversed && <Badge tone="neutral" icon="reset">Undone</Badge>}
        </span>
      </span>
      {hasPhoto && <TxPhoto path={tx.photo_path} src={photoSrc} alt={`Photo: ${tx.reason}`} className="size-14 shrink-0" />}
    </>
  );
  const cls = cx('flex w-full items-start gap-3 px-4 py-3', onOpen && 'transition hover:bg-surface-2 active:bg-surface-2', className);
  if (onOpen) return <button type="button" onClick={onOpen} className={cls}>{body}</button>;
  return <div className={cls}>{body}</div>;
}

export interface HistorySectionProps {
  memberId: string;
  /** First page from api.wallet (newest first). */
  initial: Transaction[];
  ownerName: string;
  /** The viewer owns this wallet. */
  self: boolean;
  cur: string;
  /** Called after a reversal so the wallet and app state reload. */
  onChanged: () => Promise<void>;
}

export function HistorySection({ memberId, initial, ownerName, self, cur, onChanged }: HistorySectionProps) {
  const { me } = useApp();
  const features = useFeatures();
  const [filter, setFilter] = useState<Filter>('all');
  // Time / Points filters only when that part is switched on (old rows still show under "All").
  const filters = FILTERS.filter((x) => x.value === 'all' || x.value === 'money' || x.value === filter || features.on(x.value));
  const [rows, setRows] = useState<Transaction[]>(initial);
  const [more, setMore] = useState(initial.length >= HISTORY_PAGE);
  const [busy, setBusy] = useState<'filter' | 'more' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Transaction | null>(null);
  const [undo, setUndo] = useState<Transaction | null>(null);
  const [photo, setPhoto] = useState<Transaction | null>(null);
  const seq = useRef(0);
  const showSkeleton = useDelayed(busy === 'filter');

  const loadFilter = useCallback(async (f: Filter) => {
    const id = ++seq.current;
    setError(null);
    if (f === 'all') { setRows(initial); setMore(initial.length >= HISTORY_PAGE); setBusy(null); return; }
    setBusy('filter');
    try {
      const page = await api.history(memberId, { currency: f, limit: HISTORY_PAGE });
      if (id !== seq.current) return;
      setRows(page);
      setMore(page.length >= HISTORY_PAGE);
    } catch (e) {
      if (id === seq.current) setError(moneyError(e));
    } finally {
      if (id === seq.current) setBusy(null);
    }
  }, [initial, memberId]);

  // A fresh first page (after any change) resets the list but keeps the chosen filter.
  const [base, setBase] = useState(initial);
  if (base !== initial) {
    setBase(initial);
    setBusy(null);
    if (filter === 'all') { setRows(initial); setMore(initial.length >= HISTORY_PAGE); }
  }
  useEffect(() => {
    const id = ++seq.current;
    if (filter === 'all') return;
    api.history(memberId, { currency: filter, limit: HISTORY_PAGE }).then((page) => {
      if (id !== seq.current) return;
      setRows(page);
      setMore(page.length >= HISTORY_PAGE);
    }).catch((e: unknown) => { if (id === seq.current) setError(moneyError(e)); });
  }, [initial]); // eslint-disable-line react-hooks/exhaustive-deps

  const pick = (f: Filter) => { setFilter(f); loadFilter(f); };

  const loadMore = async () => {
    const last = rows[rows.length - 1];
    if (!last) return;
    const id = ++seq.current;
    setBusy('more');
    setError(null);
    const currency = filter === 'all' ? null : filter;
    try {
      // Rows of one action share a timestamp: ask from just after the last one and drop the ones we have.
      const justAfter = new Date(Date.parse(last.effective_at) + 1).toISOString();
      let page = await api.history(memberId, { currency, before: justAfter, limit: HISTORY_PAGE });
      const have = new Set(rows.map((r) => r.id));
      let fresh = page.filter((r) => !have.has(r.id));
      if (fresh.length === 0 && page.length >= HISTORY_PAGE) {
        page = await api.history(memberId, { currency, before: last.effective_at, limit: HISTORY_PAGE });
        fresh = page.filter((r) => !have.has(r.id));
      }
      if (id !== seq.current) return;
      setRows((r) => [...r, ...fresh]);
      setMore(page.length >= HISTORY_PAGE && fresh.length > 0);
    } catch (e) {
      if (id === seq.current) setError(moneyError(e));
    } finally {
      if (id === seq.current) setBusy(null);
    }
  };

  const viewerId = me?.id ?? null;
  return (
    <section aria-labelledby="history-title" className="space-y-2">
      <h2 id="history-title" className="px-1 text-sm font-bold uppercase tracking-wide text-muted">What happened</h2>
      {filters.length > 2 && (
        <div role="group" aria-label="Show" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
          {filters.map((f) => (
            <Chip key={f.value} selected={filter === f.value} emoji={f.emoji} onClick={() => pick(f.value)}>{f.label}</Chip>
          ))}
        </div>
      )}

      {error && <p role="alert" className="rounded-xl bg-bad-soft px-3 py-2 text-[15px] font-semibold text-bad">{error}</p>}

      {busy === 'filter' ? (showSkeleton ? <SkeletonRows rows={4} /> : <div className="h-40" aria-hidden="true" />) : rows.length === 0 ? (
        <div className="rounded-2xl border border-line/70 bg-surface">
          <EmptyState
            emoji="🌱" title={filter === 'all' ? 'Nothing yet' : 'Nothing here yet'}
            message={self ? 'Do a task and it shows up here.' : `When ${ownerName} ${features.on('savings') ? 'earns, saves or spends' : 'earns or spends'}, it shows up here.`}
          />
        </div>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line/70 bg-surface shadow-sm" aria-busy={busy === 'more' || undefined}>
          {rows.map((tx) => (
            <li key={tx.id}><TxRow tx={tx} cur={cur} viewerId={viewerId} onOpen={() => setOpen(tx)} /></li>
          ))}
        </ul>
      )}

      {more && busy !== 'filter' && rows.length > 0 && (
        <Button variant="secondary" block loading={busy === 'more'} onClick={loadMore} icon="chevron-down">Show older</Button>
      )}

      {open && (
        <TxDetailSheet
          tx={open} cur={cur} viewerId={viewerId} ownerName={ownerName}
          onClose={() => setOpen(null)}
          onUndo={() => { setUndo(open); setOpen(null); }}
          onPhoto={() => setPhoto(open)}
        />
      )}
      {undo && <ReverseSheet tx={undo} cur={cur} ownerName={ownerName} onClose={() => setUndo(null)} onChanged={onChanged} />}
      {photo?.photo_path && <PhotoSheet path={photo.photo_path} alt={`Photo: ${photo.reason}`} onClose={() => setPhoto(null)} />}
    </section>
  );
}

function TxDetailSheet({ tx, cur, viewerId, ownerName, onClose, onUndo, onPhoto }: {
  tx: Transaction; cur: string; viewerId: string | null; ownerName: string; onClose: () => void; onUndo: () => void; onPhoto: () => void;
}) {
  const { membersById, family, now } = useApp();
  const tz = family?.timezone ?? 'UTC';
  const meta = rowMeta(tx);
  const tone = txTone(tx.kind, tx.amount);
  const pot = POTS[tx.pot];
  const lbl = labelMeta(tx.label);
  return (
    <Sheet
      open onClose={onClose} title={<><span aria-hidden="true">{meta.emoji} </span>{meta.label}</>}
      footer={tx.can_reverse ? (
        <SheetActions onCancel={onClose} cancelLabel="Close">
          <Button size="lg" variant="secondary" icon="reset" onClick={onUndo}>Undo this</Button>
        </SheetActions>
      ) : <Button block size="lg" variant="secondary" onClick={onClose}>Close</Button>}
    >
      <div className="space-y-4">
        <div className="text-center">
          <Delta currency={tx.currency} value={tx.amount} cur={cur} tone={tone} struck={!!tx.reversed_by} className="text-4xl" />
          {pot && <p className="mt-1 text-[15px] text-muted"><span aria-hidden="true">{pot.emoji} </span>{pot.label}{lbl ? ` · ${lbl.label}` : ''}</p>}
        </div>
        {hasReason(tx) && <p className="rounded-2xl bg-surface-2 px-4 py-3 text-lg leading-snug [overflow-wrap:anywhere]">{tx.reason}</p>}
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[15px]">
          <dt className="font-semibold text-muted">Who</dt>
          <dd>{whoName(tx.created_by, membersById, viewerId)}{!tx.created_by && ' (the app’s weekly rules)'}</dd>
          <dt className="font-semibold text-muted">When</dt>
          <dd>{formatWhen(tx.effective_at, tz, now())}</dd>
          <dt className="font-semibold text-muted">Whose</dt>
          <dd>{ownerName}</dd>
        </dl>
        {tx.reversed_by && (
          <p className="rounded-2xl bg-surface-2 px-4 py-3 text-[15px]">↩️ This was undone. It stays here so everyone can see what happened.</p>
        )}
        {tx.kind === 'reversal' && (
          <p className="rounded-2xl bg-surface-2 px-4 py-3 text-[15px]">↩️ This undid an earlier change.</p>
        )}
        {tx.kind === 'loan_repayment' && !tx.masked && (
          <p className="rounded-2xl bg-surface-2 px-4 py-3 text-[15px]">
            🤝 This paid back part of a loan. {tx.created_by ? 'It was an extra payment.' : 'It came off the pocket money.'}
          </p>
        )}
        {tx.photo_path && (
          <TxPhoto path={tx.photo_path} alt={`Photo: ${tx.reason}`} className="max-h-72 w-full" onOpen={onPhoto} />
        )}
      </div>
    </Sheet>
  );
}

const UNDO_REASONS = ['Our mistake', 'Wrong child', 'Wrong amount', 'We talked it through'];

function ReverseSheet({ tx, cur, ownerName, onClose, onChanged }: {
  tx: Transaction; cur: string; ownerName: string; onClose: () => void; onChanged: () => Promise<void>;
}) {
  const toast = useToast();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const meta = rowMeta(tx);
  const ok = reason.trim().length > 0;
  const loan = tx.kind === 'loan_repayment';

  const run = async () => {
    if (!ok) { setError('Say why, so everyone understands.'); return; }
    setBusy(true);
    setError(null);
    try {
      if (loan) await api.reverseLoanRepayment(tx.id, clip(reason, 180));
      else await api.reverseTransaction(tx.id, clip(reason, 180));
      toast.show('Undone. It stays in the list so everyone can see.', 'success');
      await onChanged();
      onClose();
    } catch (e) {
      const msg = moneyError(e);
      setError(msg);
      toast.show(msg, 'error');
      if (isStale(e)) await onChanged();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open onClose={onClose} title="Undo this?"
      description={`${ownerName} will see a new “Undone” row with your reason.`}
      footer={
        <SheetActions onCancel={onClose} note={!ok ? 'Say why first.' : undefined}>
          <Button size="lg" variant="danger" icon="reset" loading={busy} disabled={!ok} onClick={run}>Undo “{meta.label}”</Button>
        </SheetActions>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center gap-3 rounded-2xl bg-surface-2 px-4 py-3">
          <span className="text-2xl" aria-hidden="true">{meta.emoji}</span>
          <div className="min-w-0 flex-1">
            <p className="font-bold">{meta.label}</p>
            {hasReason(tx) && <p className="text-[15px] text-muted [overflow-wrap:anywhere]">{tx.reason}</p>}
          </div>
          <Delta currency={tx.currency} value={tx.amount} cur={cur} tone={txTone(tx.kind, tx.amount)} />
        </div>
        <p className="text-[15px]">
          This adds <Delta currency={tx.currency} value={-tx.amount} cur={cur} tone="neutral" /> to {ownerName}’s {POTS[tx.pot]?.label.toLowerCase() ?? 'wallet'}. The old row stays in the list, marked “Undone”.
          {loan && ' The loan owes this amount again.'}
        </p>
        <Textarea
          label="Why?" value={reason} maxLength={180} rows={2}
          onChange={(e) => { setReason(e.target.value); setError(null); }}
          error={error ?? undefined} hint={`${ownerName} will read this.`}
        />
        <QuickChips label="Quick reasons" options={UNDO_REASONS} value={reason} onPick={(v) => { setReason(v); setError(null); }} />
      </div>
    </Sheet>
  );
}
