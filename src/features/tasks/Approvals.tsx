// Approvals queue: finished tasks waiting for me to check (managers' tab, kids'/grandparents' "to check" page).
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { Avatar, Button, Card, EmptyState, LinkButton } from '../../components/ui';
import { api } from '../../lib/api';
import { friendlyError } from '../../lib/errors';
import type { TaskInstance } from '../../lib/types';
import { SendBackSheet } from './decide';
import { useDelayed, useFetch, useOnline, useTaskActions, useTaskCtx } from './hooks';
import { byDueAsc, whenText } from './lib';
import { BackHeader, ChallengesOff, EvidencePhotos, LoadError, OfflineNote, RewardChips, SkeletonRows } from './parts';

/** The list of submitted tasks I can check, with one-tap Approve and a Send back sheet. */
export function ApprovalsList({ big }: { big?: boolean }) {
  const { state, feat } = useTaskCtx();
  // Re-loads quietly whenever the app state refreshes (after any change, or when coming back to the app).
  const q = useFetch(() => api.listApprovals(), ['approvals'], state);
  const { reload, setData } = q;
  const online = useOnline();
  const skeleton = useDelayed(q.loading);
  const [sendBack, setSendBack] = useState<TaskInstance | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const emptyRef = useRef<HTMLDivElement>(null);
  const focusAfter = useRef<string | null | undefined>(undefined);

  const items = q.data
    ? q.data
      .filter((i) => feat.challenges || i.kind !== 'challenge')
      .sort((a, b) => (a.submitted_at ?? a.due_at).localeCompare(b.submitted_at ?? b.due_at) || byDueAsc(a, b))
    : [];

  // Keep keyboard / screen-reader focus on the next card after one disappears.
  useEffect(() => {
    if (focusAfter.current === undefined) return;
    const next = focusAfter.current;
    focusAfter.current = undefined;
    const el = next ? listRef.current?.querySelector<HTMLElement>(`[data-card="${next}"] a`) : emptyRef.current;
    el?.focus();
  });

  const done = (id: string) => {
    const idx = items.findIndex((x) => x.id === id);
    focusAfter.current = items[idx + 1]?.id ?? items[idx - 1]?.id ?? null;
    setData((d) => d?.filter((x) => x.id !== id));
  };

  if (q.error && !q.data) return <LoadError message={friendlyError(q.error)} onRetry={reload} />;
  if (q.loading) return skeleton ? <SkeletonRows rows={2} big={big} /> : null;

  return (
    <div className="space-y-3">
      {!online && <OfflineNote />}
      {items.length === 0 ? (
        <div ref={emptyRef} tabIndex={-1} className="outline-none">
          <EmptyState emoji="🎉" title="All checked!" message="Nothing is waiting for you." />
        </div>
      ) : (
        <ul ref={listRef} className="space-y-3" aria-label="Waiting to be checked">
          {items.map((i) => (
            <ApprovalCard key={i.id} inst={i} big={big} online={online} onSendBack={() => setSendBack(i)} onDone={() => done(i.id)} onChanged={reload} />
          ))}
        </ul>
      )}
      <SendBackSheet
        inst={sendBack} onClose={() => setSendBack(null)}
        onDone={() => { if (sendBack) done(sendBack.id); void reload(); }}
      />
    </div>
  );
}

function ApprovalCard({ inst, big, online, onSendBack, onDone, onChanged }: {
  inst: TaskInstance; big?: boolean; online: boolean; onSendBack: () => void; onDone: () => void; onChanged: () => void;
}) {
  const { membersById, tz, now, isKid } = useTaskCtx();
  const actions = useTaskActions(onChanged);
  const [busy, setBusy] = useState(false);
  const who = membersById[inst.assignee_id];
  const name = who?.display_name ?? 'Someone';

  const approve = async () => {
    if (busy) return;
    setBusy(true);
    const ok = await actions.approve(inst);
    setBusy(false);
    if (ok) onDone();
  };

  return (
    <li data-card={inst.id}>
      <Card className="space-y-3">
        <div className="flex items-center gap-3">
          <Avatar member={who} size={big ? 'md' : 'sm'} name="" />
          <div className="min-w-0 flex-1">
            <p className={big ? 'text-[17px] font-bold' : 'font-bold'}>{name}</p>
            {inst.submitted_at && <p className="text-sm text-muted">Sent {whenText(inst.submitted_at, tz, now())}</p>}
          </div>
        </div>
        <Link
          to={`/tasks/${inst.id}`}
          className="flex min-h-11 items-center gap-2 rounded-xl text-left font-bold hover:underline focus-visible:outline-3 focus-visible:outline-accent"
        >
          <span aria-hidden="true" className="text-2xl">{inst.emoji}</span>
          <span className={big ? 'text-lg' : 'text-[17px]'}>{inst.title}<span className="sr-only"> by {name} — open</span></span>
        </Link>
        <EvidencePhotos inst={inst} who={name} />
        {inst.note && (
          <p className="line-clamp-2 rounded-xl bg-surface-2 px-3 py-2 text-[15px]">
            <span className="sr-only">{name}'s note: </span>
            <span aria-hidden="true">💬 </span>{inst.note}
          </p>
        )}
        <RewardChips inst={inst} big={big} hidePenalty />
        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" size={big ? 'lg' : 'md'} disabled={busy || !online} onClick={onSendBack}>
            Send back<span className="sr-only">: {inst.title} by {name}</span>
          </Button>
          <Button className="flex-1" size={big ? 'lg' : 'md'} loading={busy} disabled={!online} onClick={() => void approve()}>
            {isKid ? 'Yes, done!' : 'Approve'} <span aria-hidden="true">✅</span><span className="sr-only">: {inst.title} by {name}</span>
          </Button>
        </div>
      </Card>
    </li>
  );
}

/** /tasks/approvals — the queue as its own page (kids' and grandparents' challenges to check; works for everyone). */
export function ApprovalsPage() {
  const { isKid, isManager, approvalsCount, feat } = useTaskCtx();
  // Kids and grandparents only ever check challenges they set.
  const off = !isManager && !feat.challenges;
  return (
    <div className="space-y-4 pb-4">
      <BackHeader
        title={isManager ? 'Approvals' : 'To check'}
        subtitle={approvalsCount && !off ? `${approvalsCount} waiting for you` : undefined}
      />
      {off ? <ChallengesOff /> : (
        <>
          {!isManager && (
            <p className={isKid ? 'text-[17px] text-muted' : 'text-[15px] text-muted'}>
              Someone finished a challenge you set. Did they do it?
            </p>
          )}
          <ApprovalsList big={isKid} />
        </>
      )}
      <div className="pt-2">
        <LinkButton to="/tasks" variant="ghost" icon="tasks" size={isKid ? 'lg' : 'md'}>All tasks</LinkButton>
      </div>
    </div>
  );
}
