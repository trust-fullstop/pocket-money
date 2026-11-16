// /tasks/:instanceId — one task: status, rewards, the "Do it" flow, evidence, timeline and the approver actions.
import { useRef, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router';
import {
  Avatar, Button, Card, EmptyState, IconButton, Input, LinkButton, PhotoCapture, Sheet, Textarea, cx, useConfirm, useToast,
} from '../../components/ui';
import { api } from '../../lib/api';
import { friendlyError, toAppError } from '../../lib/errors';
import { uploadPhoto } from '../../lib/photos';
import type { Member, TaskInstance } from '../../lib/types';
import { isManager as isManagerRole } from '../../lib/types';
import { ExcuseSheet, SendBackSheet } from './decide';
import { useDelayed, useFetch, useOnline, useTaskActions, useTaskCtx } from './hooks';
import {
  EVIDENCE, dueLong, hasMoneyOrTimeReward, isLate, isSentBack, joinWords, whenText,
} from './lib';
import {
  AmountPill, BackHeader, ChallengeTag, ChallengesOff, EvidencePhotos, LoadError, Note, NotForYou, OfflineNote, Refreshing,
  SkeletonRows, StatusBadge, StickyBar,
} from './parts';

export default function TaskDetail() {
  const { instanceId = '' } = useParams();
  const { state, feat } = useTaskCtx();
  const q = useFetch(() => api.getInstance(instanceId), ['instance', instanceId], state);
  const skeleton = useDelayed(q.loading);

  if (q.error && !q.data) {
    if (q.error.code === 'not_found') {
      return (
        <div className="space-y-4">
          <BackHeader title="Task" />
          <EmptyState
            emoji="🔍" title="We couldn't find that task" message="It may have been stopped or removed."
            action={<LinkButton to="/tasks" icon="tasks">All tasks</LinkButton>}
          />
        </div>
      );
    }
    if (q.error.code === 'not_allowed') {
      return <div className="space-y-4"><BackHeader title="Task" /><NotForYou /></div>;
    }
    return (
      <div className="space-y-4">
        <BackHeader title="Task" />
        <LoadError message={friendlyError(q.error)} onRetry={q.reload} />
      </div>
    );
  }
  if (!q.data) {
    return <div className="space-y-4"><BackHeader title="Task" />{skeleton && <SkeletonRows rows={3} />}</div>;
  }
  if (q.data.kind === 'challenge' && !feat.challenges) {
    return (
      <div className="space-y-4">
        <BackHeader title="Challenge" />
        <ChallengesOff action={<LinkButton to="/tasks" icon="tasks">All tasks</LinkButton>} />
      </div>
    );
  }
  return <Detail key={q.data.id} inst={q.data} reload={q.reload} refreshing={q.refreshing} />;
}

// ---------------------------------------------------------------- page
function Detail({ inst, reload, refreshing }: { inst: TaskInstance; reload: () => Promise<void>; refreshing: boolean }) {
  const { me, membersById, isManager, isKid, tz, now, nameOf, refresh, rewardsOf, penaltiesOf } = useTaskCtx();
  const navigate = useNavigate();
  const online = useOnline();
  const [justSent, setJustSent] = useState(false);
  const [sendBack, setSendBack] = useState<TaskInstance | null>(null);
  const [excuse, setExcuse] = useState<TaskInstance | null>(null);
  const [menu, setMenu] = useState(false);

  const meId = me?.id;
  const mine = inst.assignee_id === meId;
  const big = isKid;
  const assignee = membersById[inst.assignee_id];
  const who = mine ? 'you' : assignee?.display_name ?? 'Someone';
  const nowDate = now();
  const rewards = rewardsOf(inst);
  const penalties = penaltiesOf(inst);
  const dueTime = dueLong(inst, tz, nowDate).replace(/^(Was due|Due) /, '');
  const canEdit = inst.status !== 'cancelled' && (isManager || inst.created_by === meId);
  const showDecide = inst.can_decide && inst.status === 'submitted';
  const queuePath = isManager ? '/tasks?tab=approvals' : '/tasks/approvals';

  const afterDecision = () => { void reload(); };
  const goQueue = () => navigate(queuePath, { replace: true });

  return (
    <div className={cx('space-y-5', big && 'text-[17px]')}>
      <BackHeader
        title={inst.kind === 'challenge' ? 'Challenge' : 'Task'}
        right={(
          <>
            <Refreshing on={refreshing} />
            {canEdit && <IconButton icon="settings" label="Task options" onClick={() => setMenu(true)} />}
          </>
        )}
      />
      {!online && <OfflineNote />}

      {/* Hero */}
      <Card className="space-y-3">
        <div className="flex items-start gap-4">
          <span className="grid size-20 shrink-0 place-items-center rounded-3xl bg-surface-2 text-5xl" aria-hidden="true">{inst.emoji}</span>
          <div className="min-w-0 flex-1 space-y-2">
            <h2 className={cx('font-extrabold leading-tight', big ? 'text-2xl' : 'text-xl')}>{inst.title}</h2>
            <div className="flex flex-wrap gap-1.5">
              <StatusBadge inst={inst} />
              <ChallengeTag inst={inst} />
            </div>
          </div>
        </div>
        <ul className={cx('space-y-1.5 text-muted', big ? 'text-[17px]' : 'text-[15px]')}>
          <li><span aria-hidden="true">🕖 </span>{dueLong(inst, tz, nowDate)}</li>
          {!mine && assignee && (
            <li className="flex items-center gap-2">
              <Avatar member={assignee} size="xs" name="" />
              <span>For <strong className="text-ink">{assignee.display_name}</strong></span>
            </li>
          )}
          <li><span aria-hidden="true">✍️ </span>Set by {inst.created_by === meId ? 'you' : nameOf(inst.created_by)}</li>
        </ul>
      </Card>

      {/* Sent back */}
      {isSentBack(inst) && (
        <Card tone="warn" className="space-y-1" role={mine ? 'status' : undefined}>
          <p className={cx('font-bold', big ? 'text-xl' : 'text-lg')}><span aria-hidden="true">🔁 </span>{nameOf(inst.decided_by)} sent it back</p>
          <p className={big ? 'text-lg' : 'text-[17px]'}>{nameOf(inst.decided_by)} says: “{inst.decision_note}”</p>
          {mine && <p className="font-semibold">Try again! <span aria-hidden="true">💪</span></p>}
        </Card>
      )}

      {/* Nice note on an approved task */}
      {inst.status === 'approved' && inst.decision_note && (
        <Note tone="good" emoji="💬" big={big}>
          <strong>{nameOf(inst.decided_by)} says:</strong> “{inst.decision_note}”
        </Note>
      )}

      {/* Late */}
      {inst.can_submit && isLate(inst, nowDate.getTime()) && (
        <Note emoji="⏰" big={big}><strong>Late</strong> — it might still count. Do it now!</Note>
      )}

      {justSent && inst.status === 'submitted' && <SentCard inst={inst} big={big} />}

      {/* Together */}
      {inst.partners.length > 0 && <Together inst={inst} big={big} />}

      {/* Details */}
      {inst.details && (
        <section className="space-y-1" aria-labelledby="td-details">
          <h2 id="td-details" className="text-lg font-bold">Details</h2>
          <p className="whitespace-pre-line">{inst.details}</p>
        </section>
      )}

      {/* Rewards & consequence */}
      <section className="space-y-3" aria-labelledby="td-rewards">
        <h2 id="td-rewards" className="text-lg font-bold">{mine ? 'You get' : `${who} gets`}</h2>
        {rewards.length
          ? <div className="flex flex-wrap gap-1.5">{rewards.map((p) => <AmountPill key={p.key} part={p} tone="plus" big />)}</div>
          : <p className="text-muted">A big thank-you <span aria-hidden="true">🙌</span></p>}
        {penalties.length > 0 && (
          <div className="space-y-1.5">
            <p className="font-semibold text-warn">If this isn’t done by {dueTime}:</p>
            <div className="flex flex-wrap gap-1.5">{penalties.map((p) => <AmountPill key={p.key} part={p} tone="minus" big />)}</div>
          </div>
        )}
        <p className="text-muted"><span aria-hidden="true">{EVIDENCE[inst.evidence].emoji} </span>{EVIDENCE[inst.evidence].line}</p>
      </section>

      {/* Do it */}
      {inst.can_submit && (
        <DoIt
          inst={inst} big={big} online={online}
          onSent={async () => {
            setJustSent(true);
            await refresh().catch(() => undefined);
            await reload();
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          onStale={() => void reload()}
        />
      )}

      {/* Evidence */}
      {(inst.status === 'submitted' || inst.status === 'approved' || inst.before_path || inst.after_path || (inst.note && inst.status !== 'open')) && (
        <section className="space-y-2" aria-labelledby="td-evidence">
          <h2 id="td-evidence" className="text-lg font-bold">{mine ? 'What you sent' : `What ${who} sent`}</h2>
          <EvidencePhotos inst={inst} who={assignee?.display_name ?? 'them'} />
          {inst.note && (
            <p className="rounded-xl bg-surface-2 px-3 py-2">
              <span aria-hidden="true">💬 </span><span className="sr-only">Note: </span>{inst.note}
            </p>
          )}
        </section>
      )}

      <Timeline inst={inst} big={big} />

      {inst.can_excuse && (
        <div className="border-t border-line pt-4">
          <Button variant="ghost" icon="heart" onClick={() => setExcuse(inst)} disabled={!online}>Excuse</Button>
          <p className="mt-1 text-sm text-muted">
            {inst.status === 'missed' && penalties.length ? 'Give back what was taken away — e.g. if they were ill.' : 'It won’t count as not done.'}
          </p>
        </div>
      )}

      {showDecide && (
        <DecideBar
          inst={inst} big={big} online={online} kidCopy={isKid}
          onSendBack={() => setSendBack(inst)} onApproved={goQueue} onStale={afterDecision}
        />
      )}

      <SendBackSheet inst={sendBack} onClose={() => setSendBack(null)} onDone={goQueue} />
      <ExcuseSheet inst={excuse} onClose={() => setExcuse(null)} onDone={afterDecision} />
      {canEdit && <OptionsSheet inst={inst} open={menu} onClose={() => setMenu(false)} />}
    </div>
  );
}

// ---------------------------------------------------------------- pieces
/** Who will check it: the challenge-setter, or the grown-ups ("Mum or Dad"). */
function useCheckerText(inst: TaskInstance): string {
  const { members, membersById, me } = useTaskCtx();
  const creator = membersById[inst.created_by];
  if (creator && creator.id !== inst.assignee_id && !isManagerRole(creator.role) && !hasMoneyOrTimeReward(inst)) {
    return creator.id === me?.id ? 'you' : creator.display_name;
  }
  const grownUps = members.filter((m) => isManagerRole(m.role) && m.id !== inst.assignee_id).map((m) => m.display_name);
  if (grownUps.length >= 1 && grownUps.length <= 2) return grownUps.join(' or ');
  return 'a grown-up';
}

function SentCard({ inst, big }: { inst: TaskInstance; big?: boolean }) {
  const { rewardsOf } = useTaskCtx();
  const checker = useCheckerText(inst);
  const worth = rewardsOf(inst);
  return (
    <Card tone="good" role="status" className="space-y-2 text-center">
      <p className="text-5xl" aria-hidden="true">🎉</p>
      <p className={cx('font-extrabold', big ? 'text-2xl' : 'text-xl')}>Nice one!</p>
      <p className={big ? 'text-lg' : 'text-[17px]'}>Waiting for {checker} to check.</p>
      {worth.length > 0 && (
        <p className="font-semibold text-good">Worth {worth.map((p) => (p.key === 'text' ? p.prose : p.text)).join(' · ')}</p>
      )}
    </Card>
  );
}

/** "🤝 Doing this with Dad" + how far each partner is (when I'm allowed to see their task). */
function Together({ inst, big }: { inst: TaskInstance; big?: boolean }) {
  const { membersById, me, state } = useTaskCtx();
  const q = useFetch(() => api.listInstances(inst.occurs_on, inst.occurs_on, null), ['partners', inst.group_id, inst.occurs_on], state);
  const partners = inst.partners.map((id) => membersById[id]).filter((m): m is Member => !!m);
  const theirs = (id: string) => q.data?.find((x) => x.group_id === inst.group_id && x.assignee_id === id);
  const mine = inst.assignee_id === me?.id;
  const names = joinWords(partners.map((m) => (m.id === me?.id ? 'you' : m.display_name)));
  return (
    <section className="space-y-2" aria-labelledby="td-together">
      <h2 id="td-together" className="text-lg font-bold"><span aria-hidden="true">🤝 </span>{mine ? `Doing this with ${names}` : `Together with ${names}`}</h2>
      <ul className="space-y-2">
        {partners.map((m) => {
          const t = theirs(m.id);
          return (
            <li key={m.id} className="flex items-center gap-3 rounded-2xl bg-surface-2 px-3 py-2">
              <Avatar member={m} size="sm" name="" />
              <span className={cx('min-w-0 flex-1 font-semibold', big && 'text-lg')}>{m.id === me?.id ? 'You' : m.display_name}</span>
              {t && <StatusBadge inst={t} />}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Before / After photos + note, then "I did it!". Uploaded photos are remembered so a retry never uploads twice. */
function DoIt({ inst, big, online, onSent, onStale }: {
  inst: TaskInstance; big?: boolean; online: boolean; onSent: () => Promise<void>; onStale: () => void;
}) {
  const { family, me, refresh } = useTaskCtx();
  const [before, setBefore] = useState<Blob | null>(null);
  const [after, setAfter] = useState<Blob | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failed, setFailed] = useState<'before' | 'after' | null>(null);
  const uploaded = useRef(new Map<Blob, string>());

  const hasPhoto = !!(before || after);
  const valid = inst.evidence === 'photo' ? hasPhoto : inst.evidence === 'photo_or_note' ? hasPhoto || !!note.trim() : true;
  const missing = valid ? null : inst.evidence === 'photo' ? 'Add a photo to finish' : 'Add a photo or a note to finish';
  const helper = !online ? 'No connection — try again when you’re online.' : missing;

  const upload = async (blob: Blob, which: 'before' | 'after') => {
    const hit = uploaded.current.get(blob);
    if (hit) return hit;
    try {
      const path = await uploadPhoto(family?.id ?? '', me?.id ?? '', blob);
      uploaded.current.set(blob, path);
      return path;
    } catch (e) {
      setFailed(which);
      throw e;
    }
  };

  const submit = async () => {
    if (!valid || busy || !online) return;
    setBusy(true);
    setError(null);
    setFailed(null);
    let b: string | null = null;
    let a: string | null = null;
    try {
      if (before) b = await upload(before, 'before');
      if (after) a = await upload(after, 'after');
    } catch {
      setError('Photo didn’t send. Try again.');
      setBusy(false);
      return;
    }
    try {
      await api.submitTask(inst.id, b, a, note.trim() || null);
    } catch (e) {
      const err = toAppError(e);
      if (err.code === 'wrong_status') {
        setError('This task was already handled.');
        onStale();
      } else if (err.code === 'feature_off') {
        setError(friendlyError(e));
        void refresh().catch(() => undefined);
      } else if (err.code === 'invalid' && err.detail === 'photo_required') {
        setError('Add a photo to finish.');
      } else if (err.code === 'invalid' && err.detail === 'evidence_required') {
        setError('Add a photo or a note to finish.');
      } else {
        setError(friendlyError(e));
      }
      setBusy(false);
      return;
    }
    setBusy(false);
    await onSent();
  };

  const photoHint = inst.evidence === 'photo' ? 'Add at least one photo.' : 'Optional';
  return (
    <Card tone="accent" className="space-y-4">
      <h2 className={cx('font-extrabold', big ? 'text-2xl' : 'text-xl')}>Done it? <span aria-hidden="true">💪</span></h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <PhotoCapture
          label="1 · Before photo" value={before} disabled={busy}
          onChange={(x) => { setBefore(x); setFailed(null); setError(null); }}
          hint={photoHint} error={failed === 'before' ? 'Photo didn’t send. Try again.' : undefined}
        />
        <PhotoCapture
          label="2 · After photo" value={after} disabled={busy}
          onChange={(x) => { setAfter(x); setFailed(null); setError(null); }}
          hint={photoHint} error={failed === 'after' ? 'Photo didn’t send. Try again.' : undefined}
        />
      </div>
      <Textarea
        label="3 · Tell us how it went" optional={inst.evidence !== 'photo_or_note' || hasPhoto} value={note} maxLength={500} rows={2}
        onChange={(e) => { setNote(e.target.value); setError(null); }} disabled={busy}
      />
      {error && <p role="alert" className="rounded-xl bg-bad-soft px-3 py-2 font-semibold text-bad">{error}</p>}
      <div>
        <Button size="lg" block loading={busy} disabled={!valid || !online} onClick={() => void submit()} aria-describedby={helper ? 'td-doit-help' : undefined}>
          I did it! <span aria-hidden="true">✅</span>
        </Button>
        {helper && <p id="td-doit-help" className="mt-1.5 text-center text-[15px] text-muted">{helper}</p>}
      </div>
    </Card>
  );
}

interface Step { key: string; emoji: string; text: ReactNode; when?: string | null; note?: string | null; extra?: ReactNode }

function Timeline({ inst, big }: { inst: TaskInstance; big?: boolean }) {
  const { me, nameOf, tz, now, isKid, rewardsOf, penaltiesOf } = useTaskCtx();
  const nowDate = now();
  const meId = me?.id;
  const person = (id: string | null) => (id === meId ? 'you' : nameOf(id));
  const steps: Step[] = [];
  steps.push({ key: 'set', emoji: '📝', text: `Set by ${person(inst.created_by)} · ${dueLong(inst, tz, nowDate).replace(/^D/, 'd').replace(/^Was due/, 'was due')}` });
  // A decision on a task that is open (sent back) or submitted again = it was sent back earlier.
  if (inst.decided_by && inst.decided_at && (inst.status === 'open' || inst.status === 'submitted')) {
    steps.push({ key: 'back', emoji: '↩️', text: `Sent back by ${person(inst.decided_by)}`, when: inst.decided_at, note: inst.decision_note });
  }
  if (inst.submitted_at) {
    const bits = [inst.before_path || inst.after_path ? 'photos' : null, inst.note ? 'a note' : null].filter(Boolean) as string[];
    steps.push({
      key: 'sent', emoji: '⏳',
      text: `${inst.assignee_id === meId ? 'You sent it' : `${nameOf(inst.assignee_id)} sent it`}${bits.length ? ` with ${joinWords(bits)}` : ''}`,
      when: inst.submitted_at,
    });
  }
  if (inst.status === 'approved') {
    const paid = rewardsOf(inst);
    steps.push({
      key: 'ok', emoji: '✅', text: isKid ? `Done! Checked by ${person(inst.decided_by)}` : `Approved by ${person(inst.decided_by)}`, when: inst.decided_at, note: inst.decision_note,
      extra: paid.length ? <div className="flex flex-wrap gap-1.5">{paid.map((p) => <AmountPill key={p.key} part={p} tone="plus" />)}</div> : null,
    });
  } else if (inst.status === 'missed') {
    const lost = penaltiesOf(inst);
    steps.push({
      key: 'missed', emoji: '⏰', text: lost.length ? `Not done in time — ${lost.map((p) => p.text).join(' ')}` : 'Not done in time',
      when: inst.due_at,
    });
  } else if (inst.status === 'excused') {
    const had = penaltiesOf(inst).length > 0;
    steps.push({
      key: 'excused', emoji: '🤝', text: `Excused by ${person(inst.decided_by)}${had ? ' — nothing taken away' : ''}`,
      when: inst.decided_at, note: inst.decision_note,
    });
  } else if (inst.status === 'cancelled') {
    steps.push({ key: 'cancelled', emoji: '✖️', text: 'Cancelled — this task was stopped' });
  } else if (inst.status === 'submitted') {
    steps.push({ key: 'wait', emoji: '👀', text: 'Waiting to be checked' });
  }

  return (
    <section className="space-y-2" aria-labelledby="td-timeline">
      <h2 id="td-timeline" className="text-lg font-bold">What happened</h2>
      <ol className="relative space-y-3 border-l-2 border-line pl-5">
        {steps.map((s) => (
          <li key={s.key} className="relative">
            <span aria-hidden="true" className="absolute -left-[2.15rem] grid size-7 place-items-center rounded-full bg-surface text-base ring-2 ring-line">{s.emoji}</span>
            <p className={cx('font-semibold', big && 'text-[17px]')}>{s.text}</p>
            {s.when && <p className="text-sm text-muted">{whenText(s.when, tz, nowDate)}</p>}
            {s.note && <p className="mt-1 text-[15px] italic">“{s.note}”</p>}
            {s.extra && <div className="mt-1">{s.extra}</div>}
          </li>
        ))}
      </ol>
    </section>
  );
}

/** Sticky "Send back · Approve ✅" with an optional nice note. */
function DecideBar({ inst, big, online, kidCopy, onSendBack, onApproved, onStale }: {
  inst: TaskInstance; big?: boolean; online: boolean; kidCopy: boolean;
  onSendBack: () => void; onApproved: () => void; onStale: () => void;
}) {
  const actions = useTaskActions(onStale);
  const [busy, setBusy] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState('');
  const approve = async () => {
    if (busy) return;
    setBusy(true);
    const ok = await actions.approve(inst, note);
    setBusy(false);
    if (ok) onApproved();
  };
  return (
    <StickyBar className="-mb-10 space-y-2">
      {noteOpen ? (
        <Input label="Say something nice" optional value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder="Great job! 🌟" autoFocus />
      ) : (
        <button type="button" onClick={() => setNoteOpen(true)} className="min-h-11 text-[15px] font-semibold text-accent-ink underline-offset-2 hover:underline">
          <span aria-hidden="true">💬 </span>Say something nice
        </button>
      )}
      <div className="flex gap-2">
        <Button variant="secondary" className="flex-1" size={big ? 'lg' : 'md'} disabled={busy || !online} onClick={onSendBack}>Send back</Button>
        <Button className="flex-1" size={big ? 'lg' : 'md'} loading={busy} disabled={!online} onClick={() => void approve()}>
          {kidCopy ? 'Yes, done!' : 'Approve'} <span aria-hidden="true">✅</span>
        </Button>
      </div>
    </StickyBar>
  );
}

/** Header options: edit, stop. */
function OptionsSheet({ inst, open, onClose }: { inst: TaskInstance; open: boolean; onClose: () => void }) {
  const { refresh } = useTaskCtx();
  const confirm = useConfirm();
  const toast = useToast();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const stop = async () => {
    onClose();
    const ok = await confirm({
      title: 'Stop this task?',
      message: 'It won’t come back, and open ones from today are removed. Finished ones stay in the history.',
      confirmLabel: 'Stop task', cancelLabel: 'Keep it', danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await api.archiveTask(inst.group_id);
      toast.show('Task stopped', 'success');
      await refresh().catch(() => undefined);
      navigate('/tasks', { replace: true });
    } catch (e) {
      toast.show(friendlyError(e), 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet open={open} onClose={onClose} title={inst.title}>
      <div className="space-y-2 pb-2">
        <LinkButton to={`/tasks/edit/${inst.group_id}`} variant="secondary" icon="edit" block>Edit task</LinkButton>
        <Button variant="danger" icon="trash" block loading={busy} onClick={() => void stop()}>Stop this task</Button>
      </div>
    </Sheet>
  );
}
