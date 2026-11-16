// /tasks/new (chore or challenge) and /tasks/edit/:groupId (also /tasks/new?edit=:id).
import { useId, useState, type ReactNode } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import {
  AmountInput, Badge, Button, Card, Chip, EmojiGrid, EmptyState, Input, LinkButton, MemberPicker, Segmented, Sheet,
  Textarea, Toggle, cx, useConfirm, useToast,
} from '../../components/ui';
import { api } from '../../lib/api';
import { friendlyError, toAppError } from '../../lib/errors';
import { addDays, formatTime } from '../../lib/format';
import type { Evidence, Member, Repeat, Task, TaskInput, TaskKind, TimeLabel } from '../../lib/types';
import { useDelayed, useFetch, useLeaveGuard, useOnline, useTaskCtx } from './hooks';
import {
  DAY_SHORT, EVIDENCE, TASK_EMOJIS, TIME_LABELS, dayWord, joinWords, penaltyParts, repeatText, rewardParts,
} from './lib';
import { AmountPill, BackHeader, Disclosure, LoadError, NotForYou, OfflineNote, SkeletonRows, StickyBar } from './parts';

const TITLE_MAX = 60;
const DETAILS_MAX = 500;
const REWARD_TEXT_MAX = 120;

interface Values {
  kind: TaskKind;
  /** Manager form: everyone who gets it. Simple (kid/grandparent) form: everyone except me. */
  assignees: string[];
  /** Simple form: "I'll do it too". */
  meToo: boolean;
  emoji: string;
  title: string;
  details: string;
  reward_cents: number | null;
  reward_minutes: number | null;
  time_label: TimeLabel;
  reward_points: number | null;
  reward_text: string;
  penalty_cents: number | null;
  penalty_minutes: number | null;
  penalty_points: number | null;
  repeat: Repeat;
  repeat_days: number[];
  start_on: string;
  end_on: string;
  due_time: string;
  evidence: Evidence;
}

type FieldKey = 'who' | 'title' | 'points' | 'days' | 'start' | 'end' | 'due';
const FIELD_ID: Record<FieldKey, string> = {
  who: 'tf-who', title: 'tf-title', points: 'tf-points', days: 'tf-days', start: 'tf-start', end: 'tf-end', due: 'tf-due',
};
const FIELD_ORDER: FieldKey[] = ['who', 'title', 'points', 'days', 'start', 'due', 'end'];

const REPEATS: { value: Repeat; label: string }[] = [
  { value: 'once', label: 'Once' },
  { value: 'daily', label: 'Every day' },
  { value: 'weekdays', label: 'Weekdays' },
  { value: 'weekly', label: 'Every week' },
  { value: 'days', label: 'Choose days' },
];
const SIMPLE_REPEATS: Repeat[] = ['once', 'daily', 'weekly'];

const defaultEmoji = (kind: TaskKind) => (kind === 'chore' ? '🧹' : '🏆');
const n0 = (v: number | null) => v ?? 0;

// ---------------------------------------------------------------- routes
/** Picks create or edit mode from the URL. */
export default function TaskFormPage() {
  const { groupId } = useParams();
  const [params] = useSearchParams();
  const editId = groupId ?? params.get('edit');
  if (editId) return <EditLoader key={editId} id={editId} />;
  return <TaskForm preset={params.get('person')} />;
}

function EditLoader({ id }: { id: string }) {
  const { me, isManager } = useTaskCtx();
  const q = useFetch(() => api.listTasks(), ['tasks-for-edit', id]);
  const skeleton = useDelayed(q.loading);
  if (q.error && !q.data) {
    return (
      <div className="space-y-4">
        <BackHeader title="Edit task" />
        <LoadError message={friendlyError(q.error)} onRetry={q.reload} />
      </div>
    );
  }
  if (!q.data) {
    return (
      <div className="space-y-4">
        <BackHeader title="Edit task" />
        {skeleton && <SkeletonRows rows={4} />}
      </div>
    );
  }
  const first = q.data.find((t) => t.group_id === id || t.id === id);
  const rows = first ? q.data.filter((t) => t.group_id === first.group_id) : [];
  if (!first) {
    return (
      <div className="space-y-4">
        <BackHeader title="Edit task" />
        <EmptyState
          emoji="🔍" title="We couldn't find that task" message="It may have been stopped or removed."
          action={<LinkButton to="/tasks" icon="tasks">All tasks</LinkButton>}
        />
      </div>
    );
  }
  if (!isManager && first.created_by !== me?.id) {
    return (
      <div className="space-y-4">
        <BackHeader title="Edit task" />
        <NotForYou />
      </div>
    );
  }
  return <TaskForm edit={rows} />;
}

// ---------------------------------------------------------------- form
function TaskForm({ preset, edit }: { preset?: string | null; edit?: Task[] }) {
  const { me, family, members, membersById, isManager, isKid, today, tz, now, refresh } = useTaskCtx();
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const online = useOnline();
  const meId = me?.id ?? '';
  const simple = !isManager;
  const editing = !!edit?.length;
  const base = edit?.[0];
  const cap = family?.settings.challenge_points_cap ?? 50;
  const grace = family?.settings.late_grace_minutes ?? 60;

  const [initial] = useState<Values>(() => {
    if (base && edit) {
      const ids = edit.map((t) => t.assignee_id);
      return {
        kind: base.kind,
        assignees: simple ? ids.filter((x) => x !== meId) : ids,
        meToo: simple && ids.includes(meId),
        emoji: base.emoji, title: base.title, details: base.details ?? '',
        reward_cents: base.reward_cents || null, reward_minutes: base.reward_minutes || null, time_label: base.time_label,
        reward_points: base.reward_points || null, reward_text: base.reward_text ?? '',
        penalty_cents: base.penalty_cents || null, penalty_minutes: base.penalty_minutes || null, penalty_points: base.penalty_points || null,
        repeat: base.repeat, repeat_days: [...base.repeat_days], start_on: base.start_on, end_on: base.end_on ?? '',
        due_time: base.due_time.slice(0, 5), evidence: base.evidence,
      };
    }
    const presetMember = preset ? membersById[preset] : undefined;
    const kind: TaskKind = simple || (presetMember && presetMember.role !== 'kid') ? 'challenge' : 'chore';
    const assignees = presetMember && (!simple || presetMember.id !== meId) ? [presetMember.id] : [];
    return {
      kind, assignees, meToo: false, emoji: defaultEmoji(kind), title: '', details: '',
      reward_cents: null, reward_minutes: null, time_label: 'game', reward_points: Math.min(10, simple ? cap : 10) || null, reward_text: '',
      penalty_cents: null, penalty_minutes: null, penalty_points: null,
      repeat: 'once', repeat_days: [], start_on: today, end_on: '', due_time: '19:00',
      evidence: family?.settings.default_evidence ?? 'photo',
    };
  });
  const [v, setV] = useState<Values>(initial);
  const [emojiTouched, setEmojiTouched] = useState(editing);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [serverErr, setServerErr] = useState<{ field: FieldKey | null; msg: string } | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const formId = useId();

  const dirty = JSON.stringify(v) !== JSON.stringify(initial);
  const guard = useLeaveGuard(dirty && !done);
  const set = <K extends keyof Values>(k: K, val: Values[K]) => {
    setV((s) => ({ ...s, [k]: val }));
    setServerErr(null);
  };

  // ------------------------------------------------ derived
  const allIds = simple ? [...v.assignees, ...(v.meToo ? [meId] : [])] : v.assignees;
  const together = allIds.length > 1;
  const people = allIds.map((id) => membersById[id]).filter((m): m is Member => !!m);
  const kids = members.filter((m) => m.role === 'kid');
  const nowHHMM = formatTime(now().toISOString(), tz);
  const isChallenge = simple || v.kind === 'challenge';
  const showEnd = v.repeat !== 'once';

  // ------------------------------------------------ validation
  const errors: Partial<Record<FieldKey, ReactNode>> = {};
  if (!editing && v.assignees.length === 0) errors.who = simple ? 'Pick who gets the challenge.' : 'Pick who does it.';
  if (!v.title.trim()) errors.title = 'Give it a name.';
  if (simple && n0(v.reward_points) > cap) errors.points = `You can promise up to ${cap} points.`;
  if (!editing && v.repeat === 'days' && v.repeat_days.length === 0) errors.days = 'Pick at least one day.';
  if (!editing && (!v.start_on || v.start_on < today)) errors.start = 'Pick today or a later day.';
  if (!/^\d{2}:\d{2}$/.test(v.due_time)) errors.due = 'Pick a time.';
  const timePassed = !editing && v.repeat === 'once' && v.start_on === today && /^\d{2}:\d{2}$/.test(v.due_time) && v.due_time <= nowHHMM;
  if (timePassed) errors.due = 'That time has passed.';
  if (showEnd && v.end_on && v.end_on < v.start_on) errors.end = 'This has to be on or after the start day.';
  if (serverErr?.field) errors[serverErr.field] = serverErr.msg;

  const firstError = FIELD_ORDER.find((k) => errors[k]);
  // Errors for fields people haven't reached yet only show after pressing the button.
  const shown = (k: FieldKey) => (tried || (k !== 'who' && k !== 'title') ? errors[k] : undefined);

  const missing: string[] = [];
  if (!v.title.trim()) missing.push('a name');
  if (!editing && v.assignees.length === 0) missing.push('who it’s for');
  const blocked = missing.length > 0 || !online || (editing && !dirty);
  const helper = !online ? 'No connection — try again when you’re online.'
    : editing && !dirty ? 'No changes yet.'
    : missing.length ? `Add ${joinWords(missing)} to continue.`
    : firstError ? 'Fix the marked field first.' : null;

  // ------------------------------------------------ submit
  const toInput = (): TaskInput => {
    const input: TaskInput = {
      kind: isChallenge ? 'challenge' : 'chore',
      title: v.title.trim(),
      details: v.details.trim() || null,
      emoji: v.emoji,
      assignees: allIds,
      reward_points: n0(v.reward_points),
      reward_text: v.reward_text.trim() || null,
      repeat: v.repeat,
      start_on: v.start_on,
      due_time: v.due_time,
    };
    if (v.repeat === 'days') input.repeat_days = [...v.repeat_days].sort((a, b) => a - b);
    if (showEnd && v.end_on) input.end_on = v.end_on;
    if (!simple) {
      Object.assign(input, {
        reward_cents: n0(v.reward_cents), reward_minutes: n0(v.reward_minutes), time_label: v.time_label,
        penalty_cents: n0(v.penalty_cents), penalty_minutes: n0(v.penalty_minutes), penalty_points: n0(v.penalty_points),
        evidence: v.evidence,
      });
    }
    return input;
  };

  const toPatch = (): Partial<TaskInput> => {
    const patch: Partial<TaskInput> = {
      title: v.title.trim(), details: v.details.trim() || null, emoji: v.emoji,
      reward_points: n0(v.reward_points), reward_text: v.reward_text.trim() || null, due_time: v.due_time,
    };
    if (showEnd) patch.end_on = v.end_on || null;
    if (!simple) {
      Object.assign(patch, {
        reward_cents: n0(v.reward_cents), reward_minutes: n0(v.reward_minutes), time_label: v.time_label,
        penalty_cents: n0(v.penalty_cents), penalty_minutes: n0(v.penalty_minutes), penalty_points: n0(v.penalty_points),
        evidence: v.evidence,
      });
    }
    return patch;
  };

  const focusField = (k: FieldKey) => {
    window.requestAnimationFrame(() => {
      const el = document.getElementById(FIELD_ID[k]);
      el?.focus();
      el?.scrollIntoView({ block: 'center' });
    });
  };

  const serverError = (e: unknown) => {
    const err = toAppError(e);
    const map: Record<string, [FieldKey | null, string]> = {
      due_in_past: ['due', 'That time has passed — pick a later time or another day.'],
      title: ['title', 'Give it a name.'],
      assignees: ['who', 'Pick who does it.'],
      repeat_days: ['days', 'Pick at least one day.'],
      start_on: ['start', 'Pick a day within the next year.'],
      end_on: ['end', 'This has to be on or after the start day.'],
      due_time: ['due', 'Pick a time.'],
      self_only: ['who', 'Pick someone else too — a challenge can’t be just for you.'],
      money_or_time: [null, 'Only parents can give money or time.'],
    };
    const hit = err.detail ? map[err.detail] : undefined;
    if ((err.code === 'invalid' || err.code === 'not_allowed') && hit) {
      setServerErr({ field: hit[0], msg: hit[1] });
      if (hit[0]) focusField(hit[0]);
    } else {
      setServerErr({ field: null, msg: friendlyError(e) });
    }
  };

  const submit = async () => {
    setTried(true);
    if (blocked || busy) return;
    if (firstError) { focusField(firstError); return; }
    setBusy(true);
    setServerErr(null);
    try {
      if (editing && base) {
        await api.updateTask(base.group_id, toPatch());
        toast.show('Saved ✅', 'success');
      } else {
        await api.createTask(toInput());
        const names = joinWords(people.map((m) => (m.id === meId ? 'you' : m.display_name)));
        toast.show(isChallenge ? `Challenge sent to ${names} 🎉` : `Task sent to ${names} 🎉`, 'success');
      }
      setDone(true);
      await refresh().catch(() => undefined);
      if (editing && (window.history.state as { idx?: number } | null)?.idx) navigate(-1);
      else navigate('/tasks', { replace: true });
    } catch (e) {
      serverError(e);
    } finally {
      setBusy(false);
    }
  };

  const stopTask = async () => {
    if (!base) return;
    const ok = await confirm({
      title: 'Stop this task?',
      message: base.repeat === 'once'
        ? 'It will be removed if it isn’t done yet. Finished ones stay in the history.'
        : 'It won’t repeat any more, and open ones from today are removed. Finished ones stay in the history.',
      confirmLabel: 'Stop task', cancelLabel: 'Keep it', danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await api.archiveTask(base.group_id);
      setDone(true);
      toast.show('Task stopped', 'success');
      await refresh().catch(() => undefined);
      navigate('/tasks', { replace: true });
    } catch (e) {
      toast.show(friendlyError(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  // ------------------------------------------------ pieces
  const setKind = (k: TaskKind) => {
    setV((s) => ({
      ...s, kind: k,
      assignees: k === 'chore' ? s.assignees.filter((id) => membersById[id]?.role === 'kid') : s.assignees,
      emoji: emojiTouched ? s.emoji : defaultEmoji(k),
    }));
  };

  const big = isKid;
  const title = editing ? (isChallenge ? 'Edit challenge' : 'Edit task') : simple ? 'New challenge' : 'New task';
  const label = (text: string) => <h2 className={cx('font-bold', big ? 'text-xl' : 'text-lg')}>{text}</h2>;

  const whoBlock = editing ? (
    <Card className="space-y-2">
      {label('Who?')}
      <div className="flex flex-wrap items-center gap-2">
        {people.map((m) => <Badge key={m.id} tone="neutral">{m.avatar} {m.id === meId ? 'You' : m.display_name}</Badge>)}
        {together && <Badge tone="accent"><span aria-hidden="true">🤝</span>Together</Badge>}
      </div>
      <p className="text-sm text-muted">To change who does it or when it repeats, stop this task and make a new one.</p>
    </Card>
  ) : (
    <section className="space-y-3" aria-labelledby={`${formId}-who`}>
      <div className="flex items-center gap-2">
        <h2 id={`${formId}-who`} className={cx('font-bold', big ? 'text-xl' : 'text-lg')}>Who?</h2>
        {together && <Badge tone="accent"><span aria-hidden="true">🤝</span>Together</Badge>}
      </div>
      <div id={FIELD_ID.who} tabIndex={-1} className="rounded-2xl outline-none focus-visible:ring-3 focus-visible:ring-accent" aria-describedby={shown('who') ? `${FIELD_ID.who}-err` : undefined}>
        {!simple && v.kind === 'chore' && kids.length === 0 ? (
          <p className="text-[15px] text-muted">There are no kids in the family yet. Switch to Challenge, or add a kid in Family first.</p>
        ) : simple ? (
          <MemberPicker multiple label="Who gets the challenge?" value={v.assignees} onChange={(ids) => set('assignees', ids)} exclude={[meId]} showRole={false} />
        ) : (
          <MemberPicker
            multiple label="Who does it?" value={v.assignees} onChange={(ids) => set('assignees', ids)}
            roles={v.kind === 'chore' ? ['kid'] : undefined}
          />
        )}
      </div>
      {shown('who') && <FieldError id={`${FIELD_ID.who}-err`}>{shown('who')}</FieldError>}
      {simple && (
        <Toggle checked={v.meToo} onChange={(c) => set('meToo', c)} label="I’ll do it too 🤝" description="You both get the challenge." />
      )}
      {together && (
        <p className="text-[15px] text-muted">Everyone gets this task. Each person earns the reward when they finish theirs.</p>
      )}
    </section>
  );

  const whatBlock = (
    <section className="space-y-3" aria-labelledby={`${formId}-what`}>
      <h2 id={`${formId}-what`} className={cx('font-bold', big ? 'text-xl' : 'text-lg')}>What?</h2>
      <div className="flex items-start gap-3">
        <div className="shrink-0">
          <span className="mb-1.5 block text-[15px] font-semibold" aria-hidden="true">Emoji</span>
          <button
            type="button" onClick={() => setEmojiOpen(true)} aria-label={`Emoji: ${v.emoji}. Change emoji`}
            className="grid size-14 place-items-center rounded-2xl border border-line bg-surface text-3xl hover:bg-surface-2"
          >
            {v.emoji}
          </button>
        </div>
        <Input
          id={FIELD_ID.title} wrapperClassName="min-w-0 flex-1" label={isChallenge ? 'Challenge' : 'Task'}
          value={v.title} maxLength={Math.max(TITLE_MAX, initial.title.length)} autoComplete="off"
          placeholder={isChallenge ? 'Read for 20 minutes' : 'Make your bed'}
          onChange={(e) => set('title', e.target.value)} error={shown('title')}
        />
      </div>
      <Textarea label="Details" optional value={v.details} maxLength={DETAILS_MAX} rows={2} onChange={(e) => set('details', e.target.value)} />
    </section>
  );

  const rewardBlock = (
    <Card className="space-y-4">
      {label(simple ? 'What do they get?' : 'Reward')}
      {!simple && (
        <>
          <AmountInput kind="money" label="Money" optional value={v.reward_cents} onChange={(x) => set('reward_cents', x)} max={100000} chips={[50, 100, 200]} />
          <AmountInput kind="time" label="Screen time" optional value={v.reward_minutes} onChange={(x) => set('reward_minutes', x)} max={1440} />
        </>
      )}
      {!simple && (n0(v.reward_minutes) > 0 || n0(v.penalty_minutes) > 0) && <TimeLabelPicker value={v.time_label} onChange={(x) => set('time_label', x)} />}
      <AmountInput
        id={FIELD_ID.points} kind="points" label="Points" optional value={v.reward_points}
        onChange={(x) => set('reward_points', x)} max={simple ? undefined : 10000} chips={simple ? [5, 10, 20].filter((c) => c <= cap) : [5, 10, 20]}
        hint={simple ? `Up to ${cap} points.` : undefined} error={shown('points')}
      />
      <Input
        label={simple ? 'A reward in words' : 'Or a reward in words'} optional value={v.reward_text} maxLength={REWARD_TEXT_MAX}
        placeholder={simple ? 'I’ll make you breakfast' : 'Pizza night'} onChange={(e) => set('reward_text', e.target.value)}
      />
    </Card>
  );

  const penalties = penaltyParts({
    penalty_cents: n0(v.penalty_cents), penalty_minutes: n0(v.penalty_minutes), penalty_points: n0(v.penalty_points), time_label: v.time_label,
  }, family?.currency ?? 'EUR');

  const penaltyBlock = simple ? null : (
    <Card>
      <Disclosure
        title="If it’s not done" defaultOpen={penalties.length > 0}
        summary={penalties.length ? penalties.map((p) => p.text).join('  ') : 'No consequence'}
      >
        <div className="space-y-4">
          <p className="text-sm text-muted">Only counts if it’s still open at {v.due_time || '19:00'} + {grace} min.</p>
          <AmountInput kind="money" label="Take away money" optional value={v.penalty_cents} onChange={(x) => set('penalty_cents', x)} max={100000} chips={[50, 100]} />
          <AmountInput kind="time" label="Take away screen time" optional value={v.penalty_minutes} onChange={(x) => set('penalty_minutes', x)} max={1440} />
          <AmountInput kind="points" label="Take away points" optional value={v.penalty_points} onChange={(x) => set('penalty_points', x)} max={10000} chips={[5, 10]} />
        </div>
      </Disclosure>
    </Card>
  );

  const repeatOptions = REPEATS.filter((r) => !simple || SIMPLE_REPEATS.includes(r.value));
  const whenBlock = (
    <section className="space-y-4" aria-labelledby={`${formId}-when`}>
      <h2 id={`${formId}-when`} className={cx('font-bold', big ? 'text-xl' : 'text-lg')}>When?</h2>
      {editing ? (
        <p className="rounded-2xl bg-surface-2 px-3 py-2.5 text-[15px]">
          <span aria-hidden="true">🔁 </span>{repeatText(v.repeat, v.repeat_days, v.start_on, tz, now())}
          {v.repeat !== 'once' && <> · from {dayWord(v.start_on, tz, now(), true)}</>}
        </p>
      ) : (
        <>
          <div className="space-y-2">
            <span className="block text-[15px] font-semibold" id={`${formId}-repeat`}>Repeat</span>
            <div role="group" aria-labelledby={`${formId}-repeat`} className="flex flex-wrap gap-2">
              {repeatOptions.map((r) => (
                <Chip key={r.value} selected={v.repeat === r.value} onClick={() => set('repeat', r.value)}>{r.label}</Chip>
              ))}
            </div>
            {v.repeat === 'weekly' && <p className="text-sm text-muted">{repeatText('weekly', [], v.start_on || today, tz, now())} (the day it starts).</p>}
          </div>
          {v.repeat === 'days' && (
            <div className="space-y-2">
              <span className="block text-[15px] font-semibold" id={`${formId}-days`}>Days</span>
              <div
                id={FIELD_ID.days} tabIndex={-1} role="group" aria-labelledby={`${formId}-days`}
                aria-describedby={shown('days') ? `${FIELD_ID.days}-err` : undefined}
                className="flex flex-wrap gap-2 rounded-2xl outline-none focus-visible:ring-3 focus-visible:ring-accent"
              >
                {DAY_SHORT.map((d, idx) => {
                  const iso = idx + 1;
                  const on = v.repeat_days.includes(iso);
                  return (
                    <Chip key={d} selected={on} className="!px-3" onClick={() => set('repeat_days', on ? v.repeat_days.filter((x) => x !== iso) : [...v.repeat_days, iso])}>
                      {d}
                    </Chip>
                  );
                })}
              </div>
              {shown('days') && <FieldError id={`${FIELD_ID.days}-err`}>{shown('days')}</FieldError>}
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Input
              id={FIELD_ID.start} type="date" label={v.repeat === 'once' ? 'Day' : 'Starts'} value={v.start_on} min={today}
              max={addDays(today, 366)} onChange={(e) => set('start_on', e.target.value)} error={shown('start')}
            />
            <Input
              id={FIELD_ID.due} type="time" label="Do it by" value={v.due_time}
              onChange={(e) => set('due_time', e.target.value)} error={shown('due')}
            />
          </div>
          {timePassed && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[15px] text-muted">Pick a later time, or</span>
              <Button size="sm" variant="secondary" onClick={() => set('start_on', addDays(today, 1))}>Start tomorrow instead</Button>
            </div>
          )}
        </>
      )}
      {editing && (
        <div className="max-w-[12rem]">
          <Input id={FIELD_ID.due} type="time" label="Do it by" value={v.due_time} onChange={(e) => set('due_time', e.target.value)} error={shown('due')} />
        </div>
      )}
      {showEnd && (
        <Disclosure title="More" summary={v.end_on ? `Stops after ${dayWord(v.end_on, tz, now(), true)}` : 'Keeps repeating'} defaultOpen={!!v.end_on}>
          <div className="max-w-[14rem]">
            <Input
              id={FIELD_ID.end} type="date" label="Stop repeating on" optional value={v.end_on} min={v.start_on || today}
              onChange={(e) => set('end_on', e.target.value)} error={shown('end')}
            />
          </div>
        </Disclosure>
      )}
    </section>
  );

  const proofBlock = simple ? null : (
    <section className="space-y-2" aria-labelledby={`${formId}-proof`}>
      <h2 id={`${formId}-proof`} className="text-lg font-bold">Proof</h2>
      <Segmented<Evidence>
        label="Proof" value={v.evidence} onChange={(x) => set('evidence', x)}
        options={[{ value: 'photo', label: 'Photo' }, { value: 'photo_or_note', label: 'Photo or note' }, { value: 'none', label: 'Nothing' }]}
      />
      <p className="text-sm text-muted"><span aria-hidden="true">{EVIDENCE[v.evidence].emoji} </span>{EVIDENCE[v.evidence].line}</p>
    </section>
  );

  const submitLabel = editing ? 'Save changes' : isChallenge ? 'Send challenge' : 'Give task';

  return (
    <div className={cx('space-y-6', big && 'text-[17px]')}>
      <BackHeader title={title} onBack={guard} />
      {!online && <OfflineNote />}
      {!simple && !editing && (
        <section className="space-y-2" aria-label="Kind of task">
          <Segmented<TaskKind>
            label="Chore or challenge" value={v.kind} onChange={setKind}
            options={[{ value: 'chore', label: '🧹 Chore' }, { value: 'challenge', label: '🏆 Challenge' }]}
          />
          <p className="px-1 text-sm text-muted">{v.kind === 'chore' ? 'A regular job.' : 'A fun goal — can be for anyone.'}</p>
        </section>
      )}
      <form id={formId} noValidate className="space-y-6" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        {whoBlock}
        {whatBlock}
        {rewardBlock}
        {penaltyBlock}
        {whenBlock}
        {proofBlock}
        <Preview values={v} people={people} meId={meId} />
        {editing && (
          <div className="border-t border-line pt-4">
            <Button variant="danger" icon="trash" onClick={() => void stopTask()} disabled={busy || !online}>Stop this task</Button>
          </div>
        )}
      </form>
      <StickyBar className="-mb-10">
        {serverErr && !serverErr.field && (
          <p role="alert" className="mb-2 rounded-xl bg-bad-soft px-3 py-2 text-[15px] font-semibold text-bad">{serverErr.msg}</p>
        )}
        <Button type="submit" form={formId} size="lg" block loading={busy} disabled={blocked} aria-describedby={helper ? `${formId}-help` : undefined}>
          {submitLabel}
        </Button>
        {helper && <p id={`${formId}-help`} className="mt-1.5 text-center text-sm text-muted">{helper}</p>}
        {!helper && !editing && isChallenge && simple && (
          <p className="mt-1.5 text-center text-sm text-muted">
            You’ll check it when they’re done.{v.meToo ? ' A grown-up checks yours.' : ''}
          </p>
        )}
      </StickyBar>
      <Sheet open={emojiOpen} onClose={() => setEmojiOpen(false)} title="Pick an emoji">
        <EmojiGrid
          label="Emoji" value={v.emoji}
          options={TASK_EMOJIS.includes(v.emoji) ? TASK_EMOJIS : [v.emoji, ...TASK_EMOJIS]}
          onChange={(x) => { set('emoji', x); setEmojiTouched(true); setEmojiOpen(false); }}
        />
      </Sheet>
    </div>
  );
}

function FieldError({ id, children }: { id: string; children: ReactNode }) {
  return (
    <div id={id} className="flex items-start gap-1.5 px-1 text-[15px] font-semibold text-bad">
      <span aria-hidden="true">⚠️</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function TimeLabelPicker({ value, onChange }: { value: TimeLabel; onChange: (v: TimeLabel) => void }) {
  return (
    <div className="space-y-1.5">
      <span className="block text-[15px] font-semibold" aria-hidden="true">Time for</span>
      <Segmented<TimeLabel>
        label="Screen time for" value={value} onChange={onChange}
        options={(Object.keys(TIME_LABELS) as TimeLabel[]).map((k) => ({ value: k, label: `${TIME_LABELS[k].emoji} ${TIME_LABELS[k].label}` }))}
      />
    </div>
  );
}

/** "What Sam will see" + the live sentence "Sam gets +€1.00 +10 XP when done. If not done by 19:00: −€0.50." */
function Preview({ values: v, people, meId }: { values: Values; people: Member[]; meId: string }) {
  const { currency, tz, now } = useTaskCtx();
  const rewards = rewardParts({
    reward_cents: n0(v.reward_cents), reward_minutes: n0(v.reward_minutes), reward_points: n0(v.reward_points),
    reward_text: v.reward_text.trim() || null, time_label: v.time_label,
  }, currency);
  const penalties = penaltyParts({
    penalty_cents: n0(v.penalty_cents), penalty_minutes: n0(v.penalty_minutes), penalty_points: n0(v.penalty_points), time_label: v.time_label,
  }, currency);
  const names = people.map((m) => (m.id === meId ? 'you' : m.display_name));
  const subject = names.length ? joinWords(names) : 'They';
  const verb = names.length > 1 ? 'each get' : names.length === 1 && names[0] === 'you' ? 'get' : 'gets';
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  const time = v.due_time || '19:00';
  const sentence = [
    rewards.length
      ? `${cap(subject)} ${verb} ${rewards.map((p) => (p.key === 'text' ? p.prose : p.text)).join(' ')} when done.`
      : `${cap(subject)} ${verb} a big thank-you when done.`,
    penalties.length ? `If not done by ${time}: ${penalties.map((p) => p.text).join(' ')}.` : '',
  ].filter(Boolean).join(' ');
  const who = people.length === 1 ? (people[0].id === meId ? 'you' : people[0].display_name) : 'they';

  return (
    <section aria-labelledby="tf-preview" className="space-y-2">
      <h2 id="tf-preview" className="text-lg font-bold">What {who} will see</h2>
      <Card tone="accent" className="space-y-3">
        <div className="flex items-start gap-3 rounded-2xl bg-surface p-3">
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-surface-2 text-3xl" aria-hidden="true">{v.emoji}</span>
          <div className="min-w-0 flex-1 space-y-1">
            <p className="font-bold">{v.title.trim() || <span className="text-muted">Your task name</span>}</p>
            <p className="text-sm text-muted">
              Do it by {time}
              {v.repeat !== 'once' && <> · {repeatText(v.repeat, v.repeat_days, v.start_on || now().toISOString().slice(0, 10), tz, now())}</>}
            </p>
            {rewards.length > 0 && (
              <div className="flex flex-wrap gap-1.5">{rewards.map((p) => <AmountPill key={p.key} part={p} tone="plus" />)}</div>
            )}
            {penalties.length > 0 && (
              <p className="flex flex-wrap items-center gap-1.5 text-sm font-semibold text-warn">
                If not done: {penalties.map((p) => <AmountPill key={p.key} part={p} tone="minus" />)}
              </p>
            )}
          </div>
        </div>
        <p className="text-[15px] font-semibold">{sentence}</p>
      </Card>
    </section>
  );
}
