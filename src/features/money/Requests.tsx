// Requests: kids ask to spend, take money out of savings or use time; managers say yes or no.
// RequestCard is shared by the wallet ("Waiting") and /money/requests.
import { useState } from 'react';
import {
  Avatar, Badge, Button, Card, EmptyState, LinkButton, PageHeader, Segmented, Sheet, Textarea, cx, useToast, type BadgeTone,
} from '../../components/ui';
import { api } from '../../lib/api';
import { minutes, money, timeAgo } from '../../lib/format';
import { useApp } from '../../lib/session';
import type { Balances, MoneyRequest } from '../../lib/types';
import { clip, isStale, moneyError, useData, useDelayed } from './moneyUtils';
import { LoadFailed, QuickChips, SheetActions, SkeletonRows } from './parts';
import { timeLabelWords } from './txMeta';

const KIND_EMOJI: Record<MoneyRequest['kind'], string> = { spend: '🛍️', withdraw: '🏦', time: '⏳' };

const STATUS: Record<MoneyRequest['status'], { emoji: string; label: string; tone: BadgeTone }> = {
  pending: { emoji: '⏳', label: 'Waiting', tone: 'warn' },
  approved: { emoji: '✅', label: 'Yes', tone: 'good' },
  declined: { emoji: '❌', label: 'Not this time', tone: 'neutral' },
  cancelled: { emoji: '⚪', label: 'Cancelled', tone: 'neutral' },
};

const amountText = (r: MoneyRequest, cur: string) => (r.kind === 'time' ? minutes(r.amount) : money(r.amount, cur));

/** "wants to buy Lego · €12.00" etc. (`who` = "You asked" / "Sam wants"). */
function Sentence({ r, cur, self }: { r: MoneyRequest; cur: string; self: boolean }) {
  const amt = <strong className="tabular-nums">{amountText(r, cur)}</strong>;
  if (r.kind === 'spend') {
    return <>{self ? 'You asked to buy' : 'Wants to buy'} <strong>{r.label || 'something'}</strong> · {amt}</>;
  }
  if (r.kind === 'withdraw') {
    return <>{self ? 'You asked for' : 'Wants'} {amt} from Savings{r.label ? <> for <strong>{r.label}</strong></> : null}</>;
  }
  return <>{self ? 'You asked for' : 'Wants'} {amt} {timeLabelWords(r.label)}</>;
}

/** What approving does, in one line, for the manager. */
function effectLine(r: MoneyRequest, name: string, cur: string): string {
  if (r.kind === 'spend') return `Approving takes ${money(r.amount, cur)} from ${name}’s spending. Pay ${name} in real life.`;
  if (r.kind === 'withdraw') return `Approving moves ${money(r.amount, cur)} from ${name}’s savings to spending.`;
  return `Approving takes ${minutes(r.amount)} off ${name}’s time.`;
}

/** Warning when the pot no longer covers the request (the server would say "insufficient"). */
function shortLine(r: MoneyRequest, b: Balances | undefined, name: string, cur: string): string | null {
  if (!b) return null;
  const have = r.kind === 'spend' ? b.spending : r.kind === 'withdraw' ? b.savings : b.time;
  if (have >= r.amount) return null;
  const left = r.kind === 'time' ? minutes(Math.max(0, have)) : money(Math.max(0, have), cur);
  const pot = r.kind === 'spend' ? 'to spend' : r.kind === 'withdraw' ? 'in savings' : 'of time';
  return `${name} only has ${left} ${pot} now. Say no or wait.`;
}

export interface RequestCardProps {
  req: MoneyRequest;
  cur: string;
  /** Show the asker's avatar + name (manager lists). */
  showWho?: boolean;
  /** Fresh balances of the asker (wallet); otherwise taken from the app state. */
  balances?: Balances;
  onChanged: () => Promise<void>;
}

export function RequestCard({ req, cur, showWho, balances, onChanged }: RequestCardProps) {
  const { me, membersById, balancesOf, now } = useApp();
  const toast = useToast();
  const [sheet, setSheet] = useState<'approve' | 'decline' | null>(null);
  const [busy, setBusy] = useState<'approve' | 'cancel' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const self = req.member_id === me?.id;
  const asker = membersById[req.member_id];
  const name = asker?.display_name ?? 'They';
  const st = STATUS[req.status];
  const pending = req.status === 'pending';
  const decider = req.decided_by ? (req.decided_by === me?.id ? 'You' : membersById[req.decided_by]?.display_name ?? 'A grown-up') : null;
  const short = pending && req.can_decide ? shortLine(req, balances ?? balancesOf(req.member_id), name, cur) : null;

  const fail = async (e: unknown) => {
    const msg = moneyError(e);
    setError(msg);
    toast.show(msg, 'error');
    if (isStale(e)) await onChanged();
  };

  const approve = async () => {
    setBusy('approve');
    setError(null);
    try {
      await api.decideRequest(req.id, true);
      toast.show(req.kind === 'spend' ? `Approved. Pay ${name} ${money(req.amount, cur)} in real life.` : `Approved for ${name} ✅`, 'success');
      setSheet(null);
      await onChanged();
    } catch (e) {
      setSheet(null);
      await fail(e);
    } finally {
      setBusy(null);
    }
  };

  const cancel = async () => {
    setBusy('cancel');
    setError(null);
    try {
      await api.cancelRequest(req.id);
      toast.show('Request cancelled', 'success');
      await onChanged();
    } catch (e) {
      await fail(e);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card className="space-y-2" padded>
      <div className="flex items-start gap-3">
        {showWho && asker ? <Avatar member={asker} size="md" /> : (
          <span className="grid size-11 shrink-0 place-items-center rounded-full bg-surface-2 text-xl" aria-hidden="true">{KIND_EMOJI[req.kind]}</span>
        )}
        <div className="min-w-0 flex-1">
          {showWho && <p className="font-bold">{self ? 'You' : name} <span aria-hidden="true">{KIND_EMOJI[req.kind]}</span></p>}
          <p className="text-[16px] leading-snug [overflow-wrap:anywhere]"><Sentence r={req} cur={cur} self={self} /></p>
          {req.note && <p className="mt-1 text-[15px] italic text-muted [overflow-wrap:anywhere]">“{req.note}”</p>}
          <p className="mt-1 flex flex-wrap items-center gap-2 text-[13px] text-muted">
            <Badge tone={st.tone}><span aria-hidden="true">{st.emoji}</span>{st.label}</Badge>
            <span>Asked {timeAgo(req.created_at, now())}</span>
            {decider && req.decided_at && req.status !== 'cancelled' && (
              <span>· {decider} {req.status === 'approved' ? 'said yes' : 'said no'} {timeAgo(req.decided_at, now())}</span>
            )}
          </p>
          {req.decision_note && <p className="mt-1 rounded-xl bg-surface-2 px-3 py-2 text-[15px] [overflow-wrap:anywhere]"><span aria-hidden="true">💬 </span>{req.decision_note}</p>}
        </div>
      </div>

      {pending && req.can_decide && (
        <>
          <p className="rounded-xl bg-surface-2 px-3 py-2 text-[15px]"><span aria-hidden="true">ℹ️ </span>{effectLine(req, name, cur)}</p>
          {short && <p className="rounded-xl bg-warn-soft px-3 py-2 text-[15px] font-semibold text-warn"><span aria-hidden="true">⚠️ </span>{short}</p>}
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setSheet('decline')} disabled={busy != null}>Say no</Button>
            <Button
              className="flex-1" icon="check" loading={busy === 'approve' && sheet == null}
              onClick={() => (req.kind === 'time' ? approve() : setSheet('approve'))} disabled={busy != null}
            >
              Approve
            </Button>
          </div>
        </>
      )}
      {pending && !req.can_decide && !self && <p className="text-[14px] text-muted">Another grown-up decides this one.</p>}
      {pending && req.can_cancel && (
        <Button variant="secondary" size="sm" icon="close" loading={busy === 'cancel'} onClick={cancel}>Cancel request</Button>
      )}
      {error && <p role="alert" className="text-[15px] font-semibold text-bad">{error}</p>}

      {sheet === 'approve' && (
        <Sheet
          open onClose={() => setSheet(null)} title={`Approve for ${name}?`}
          footer={
            <SheetActions onCancel={() => setSheet(null)}>
              <Button size="lg" icon="check" loading={busy === 'approve'} onClick={approve}>Approve</Button>
            </SheetActions>
          }
        >
          <div className="space-y-3 text-[16px]">
            <p className="rounded-2xl bg-surface-2 px-4 py-3"><span aria-hidden="true">{KIND_EMOJI[req.kind]} </span><Sentence r={req} cur={cur} self={false} /></p>
            <p className="font-semibold">{effectLine(req, name, cur)}</p>
            {short && <p className="rounded-xl bg-warn-soft px-3 py-2 font-semibold text-warn"><span aria-hidden="true">⚠️ </span>{short}</p>}
          </div>
        </Sheet>
      )}
      {sheet === 'decline' && <DeclineSheet req={req} name={name} cur={cur} onClose={() => setSheet(null)} onChanged={onChanged} />}
    </Card>
  );
}

const NO_REASONS = ['Not this week', 'Let’s talk about it', 'Save a bit more first'];

function DeclineSheet({ req, name, cur, onClose, onChanged }: { req: MoneyRequest; name: string; cur: string; onClose: () => void; onChanged: () => Promise<void> }) {
  const toast = useToast();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.decideRequest(req.id, false, note.trim() ? clip(note, 200) : null);
      toast.show(`Told ${name} “not this time”.`, 'success');
      await onChanged();
      onClose();
    } catch (e) {
      const msg = moneyError(e);
      setError(msg);
      if (isStale(e)) { toast.show(msg, 'error'); await onChanged(); onClose(); }
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet
      open onClose={onClose} title="Say no?" description={`${name} will see “Not this time” and your note. Nothing changes in the wallet.`}
      footer={
        <SheetActions onCancel={onClose}>
          <Button size="lg" loading={busy} onClick={run}>Say no</Button>
        </SheetActions>
      }
    >
      <div className="space-y-3">
        <p className="rounded-2xl bg-surface-2 px-4 py-3 text-[16px]"><span aria-hidden="true">{KIND_EMOJI[req.kind]} </span><Sentence r={req} cur={cur} self={false} /></p>
        <Textarea label="A note for them" optional rows={2} maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} error={error ?? undefined} />
        <QuickChips label="Quick notes" options={NO_REASONS} value={note} onPick={setNote} />
      </div>
    </Sheet>
  );
}

/** /money/requests — managers: everything waiting in the family; others: their own requests. */
export function RequestsPage() {
  const { me, isManager, refresh, family, state } = useApp();
  const [view, setView] = useState<'pending' | 'all'>('pending');
  const list = useData(() => api.listRequests(view), [view]);
  const skeleton = useDelayed(list.loading);
  const cur = family?.currency ?? 'EUR';
  const changed = async () => { await Promise.all([refresh(), list.reload()]); };
  const rows = list.data ?? [];
  const shown = view === 'all' ? rows.filter((r) => r.status !== 'pending' || !isManager) : rows;
  const waitingAll = view === 'all' && isManager ? rows.filter((r) => r.status === 'pending').length : 0;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Requests" back="/money"
        subtitle={isManager ? 'Say yes or no. Spending money is paid in real life.' : 'What you asked for, and what the grown-ups said.'}
      />
      <Segmented<'pending' | 'all'>
        label="Show" value={view} onChange={setView}
        options={[
          { value: 'pending', label: isManager ? `Waiting${state && state.counts.requests > 0 ? ` (${state.counts.requests})` : ''}` : 'Waiting' },
          { value: 'all', label: isManager ? 'Earlier' : 'All' },
        ]}
      />
      {list.loading ? (skeleton ? <SkeletonRows rows={3} /> : <div className="h-40" aria-hidden="true" />) : list.error && !list.data ? (
        <LoadFailed message={list.error} onRetry={list.reload} />
      ) : shown.length === 0 ? (
        <Card>
          <EmptyState
            emoji={view === 'pending' ? (isManager ? '🎉' : '📭') : '🗂️'}
            title={view === 'pending' ? (isManager ? 'No requests' : 'No requests yet') : 'Nothing earlier'}
            message={view === 'pending'
              ? (isManager ? 'Nothing is waiting.' : 'Ask for something from your wallet.')
              : 'Decided requests from the last 60 days show up here.'}
            action={!isManager && me ? <LinkButton to={`/money/${me.id}`} icon="money">Open my wallet</LinkButton> : undefined}
          />
        </Card>
      ) : (
        <ul className={cx('space-y-3', list.refreshing && 'opacity-80')} aria-busy={list.refreshing || undefined}>
          {shown.map((r) => <li key={r.id}><RequestCard req={r} cur={cur} showWho={isManager} onChanged={changed} /></li>)}
        </ul>
      )}
      {waitingAll > 0 && (
        <p className="text-center text-[14px] text-muted">{waitingAll} still waiting — see “Waiting”.</p>
      )}
      <div className="h-16" aria-hidden="true" />
    </div>
  );
}
