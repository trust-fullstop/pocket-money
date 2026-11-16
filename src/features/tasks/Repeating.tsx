// Managers' "Repeating" tab on /tasks: the repeating task definitions (list_tasks) by person, with Edit, Stop and Copy to….
import { useId, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import {
  Avatar, Badge, Button, Card, EmptyState, LinkButton, MemberPicker, Sheet, cx, useConfirm, useToast,
} from '../../components/ui';
import { api } from '../../lib/api';
import { friendlyError, toAppError } from '../../lib/errors';
import { addDays, formatTime, isoWeekday, plural } from '../../lib/format';
import type { Member, Task, TaskInput } from '../../lib/types';
import { useDelayed, useFetch, useOnline, useTaskCtx } from './hooks';
import { dayWord, joinWords, kidsFirst, nextDueDay, repeatSummary, repeatText, type Shown } from './lib';
import { LoadError, OfflineNote, PersonFilter, RewardChips, SkeletonRows } from './parts';

/** First day of a copy: today (or the original's later start), moved to the same weekday for "every week". */
function copyStart(t: Task, today: string): string {
  const start = t.start_on > today ? t.start_on : today;
  return t.repeat === 'weekly' ? addDays(start, (isoWeekday(t.start_on) - isoWeekday(start) + 7) % 7) : start;
}

/** The same task for someone else (switched-off amounts are left out so the server doesn't refuse it). */
function copyInput(t: Task, assignee: string, start: string, shown: Shown): TaskInput {
  const input: TaskInput = {
    kind: t.kind, title: t.title, details: t.details, emoji: t.emoji, assignees: [assignee],
    reward_cents: t.reward_cents, reward_text: t.reward_text, penalty_cents: t.penalty_cents,
    repeat: t.repeat, start_on: start, end_on: t.end_on && t.end_on >= start ? t.end_on : null,
    due_time: t.due_time.slice(0, 5), evidence: t.evidence,
  };
  if (t.repeat === 'days') input.repeat_days = [...t.repeat_days];
  if (shown.time) Object.assign(input, { reward_minutes: t.reward_minutes, penalty_minutes: t.penalty_minutes, time_label: t.time_label });
  if (shown.points) Object.assign(input, { reward_points: t.reward_points, penalty_points: t.penalty_points });
  return input;
}

export function RepeatingList() {
  const { state, members, today, tz, now, feat, me } = useTaskCtx();
  const q = useFetch(() => api.listTasks(), ['tasks'], state);
  const { setData, reload } = q;
  const online = useOnline();
  const skeleton = useDelayed(q.loading);
  const [params, setParams] = useSearchParams();
  const [copy, setCopy] = useState<Task | null>(null);
  const topRef = useRef<HTMLDivElement>(null);

  if (q.error && !q.data) return <LoadError message={friendlyError(q.error)} onRetry={reload} />;
  if (!q.data) return skeleton ? <SkeletonRows rows={3} /> : null;

  const all = q.data.filter((t) => t.repeat !== 'once' && (feat.challenges || t.kind !== 'challenge'));
  if (all.length === 0) {
    return (
      <EmptyState
        emoji="🔁" title="No repeating tasks yet"
        message="Set up a chore once — pick “Every day” or the days you want — and it comes back by itself."
        action={<LinkButton to="/tasks/new" icon="plus">New task</LinkButton>}
      />
    );
  }

  const nowHHMM = formatTime(now().toISOString(), tz);
  const people = kidsFirst(members).filter((m) => all.some((t) => t.assignee_id === m.id));
  const personParam = params.get('person');
  const person = personParam && people.some((m) => m.id === personParam) ? personParam : null;
  const setPerson = (id: string | null) => setParams((p) => {
    const n = new URLSearchParams(p);
    if (id) n.set('person', id); else n.delete('person');
    return n;
  }, { replace: true });

  const groups = people
    .filter((m) => !person || m.id === person)
    .map((m) => ({
      member: m,
      rows: all
        .filter((t) => t.assignee_id === m.id)
        .map((t) => ({ task: t, next: nextDueDay(t, today, nowHHMM) }))
        .sort((a, b) => (a.next ?? '9999').localeCompare(b.next ?? '9999') || a.task.due_time.localeCompare(b.task.due_time)
          || a.task.title.localeCompare(b.task.title)),
    }));

  const stopped = (groupId: string) => {
    setData((d) => d?.filter((t) => t.group_id !== groupId));
    topRef.current?.focus();
  };

  return (
    <div ref={topRef} tabIndex={-1} className="space-y-4 outline-none">
      {!online && <OfflineNote />}
      <p className="px-1 text-[15px] text-muted">These come back by themselves. Changes count from now on — finished ones stay as they were.</p>
      {people.length > 1 && <PersonFilter members={people} value={person} onChange={setPerson} label="Show repeating tasks for" />}
      <div className="space-y-5">
        {groups.map(({ member, rows }) => (
          <section key={member.id} className="space-y-2" aria-labelledby={`rep-${member.id}`}>
            <div className="flex items-center gap-2 px-1">
              <Avatar member={member} size="sm" name="" />
              <h2 id={`rep-${member.id}`} className="min-w-0 flex-1 truncate text-lg font-bold">
                {member.id === me?.id ? `${member.display_name} (me)` : member.display_name}
              </h2>
              <span className="shrink-0 text-sm font-semibold text-muted">{plural(rows.length, 'task')}</span>
            </div>
            <Card padded={false} className="overflow-hidden">
              <ul className="divide-y divide-line">
                {rows.map(({ task, next }) => (
                  <RepeatingRow
                    key={task.id} task={task} next={next} online={online}
                    mates={all.filter((x) => x.group_id === task.group_id && x.id !== task.id).map((x) => x.assignee_id)}
                    onCopy={() => setCopy(task)} onStopped={() => stopped(task.group_id)} onStale={() => void reload()}
                  />
                ))}
              </ul>
            </Card>
          </section>
        ))}
      </div>
      <CopySheet task={copy} groupIds={copy ? q.data.filter((t) => t.group_id === copy.group_id).map((t) => t.assignee_id) : []} onClose={() => setCopy(null)} />
    </div>
  );
}

function RepeatingRow({ task, next, mates, online, onCopy, onStopped, onStale }: {
  task: Task; next: string | null; mates: string[]; online: boolean;
  onCopy: () => void; onStopped: () => void; onStale: () => void;
}) {
  const { tz, now, nameOf, me, membersById, refresh } = useTaskCtx();
  const confirm = useConfirm();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const nowDate = now();
  const due = task.due_time.slice(0, 5);
  const who = membersById[task.assignee_id]?.display_name ?? 'them';
  const person = (id: string) => (id === me?.id ? 'you' : nameOf(id));

  const stop = async () => {
    const ok = await confirm({
      title: `Stop “${task.title}”?`,
      message: `It won’t repeat any more for ${joinWords([task.assignee_id, ...mates].map(person))}, and open ones from today are removed. Finished ones stay in the history.`,
      confirmLabel: 'Stop task', cancelLabel: 'Keep it', danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await api.archiveTask(task.group_id);
      toast.show('Task stopped', 'success');
      onStopped();
      await refresh().catch(() => undefined);
    } catch (e) {
      toast.show(friendlyError(e), 'error');
      const code = toAppError(e).code;
      if (code === 'not_found' || code === 'feature_off') {
        onStale();
        void refresh().catch(() => undefined);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="space-y-2.5 px-3.5 py-3">
      <div className="flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-surface-2 text-2xl" aria-hidden="true">{task.emoji}</span>
        <div className="min-w-0 flex-1 space-y-1">
          <h3 className="font-bold leading-snug [overflow-wrap:anywhere]">{task.title}</h3>
          <p className="text-sm text-muted">
            <span aria-hidden="true">🔁 </span>{repeatText(task.repeat, task.repeat_days, task.start_on, tz, nowDate)} · by {due}
            {task.end_on && <> · until {dayWord(task.end_on, tz, nowDate, true)}</>}
          </p>
          <p className={cx('text-sm font-semibold', next ? 'text-ink' : 'text-muted')}>
            {next
              ? <>Next: {dayWord(next, tz, nowDate)} at {due}</>
              : task.end_on ? <>Ended — the last day was {dayWord(task.end_on, tz, nowDate, true)}</> : <>Nothing coming up</>}
          </p>
          {(task.kind === 'challenge' || mates.length > 0) && (
            <div className="flex flex-wrap gap-1.5">
              {task.kind === 'challenge' && <Badge tone="accent"><span aria-hidden="true">🏆</span>Challenge</Badge>}
              {mates.length > 0 && <Badge tone="neutral"><span aria-hidden="true">🤝</span>With {joinWords(mates.map(person))}</Badge>}
            </div>
          )}
          <RewardChips inst={task} />
        </div>
      </div>
      <div className="flex flex-wrap gap-2 pl-14">
        <LinkButton to={`/tasks/edit/${task.group_id}`} size="sm" variant="secondary" icon="edit">
          Edit<span className="sr-only">: {task.title} for {who}</span>
        </LinkButton>
        <Button size="sm" variant="secondary" icon="plus" disabled={!online || busy} onClick={onCopy}>
          Copy to…<span className="sr-only"> ({task.title})</span>
        </Button>
        <Button size="sm" variant="ghost" icon="trash" loading={busy} disabled={!online} onClick={() => void stop()}>
          Stop<span className="sr-only">: {task.title} for {who}</span>
        </Button>
      </div>
    </li>
  );
}

// ---------------------------------------------------------------- copy to…
/** "Copy to…": the same task (rewards, times, how often) for other people — each gets their own, starting today. */
function CopySheet(props: { task: Task | null; groupIds: string[]; onClose: () => void }) {
  return <CopyBody key={props.task?.id ?? ''} {...props} />;
}

function CopyBody({ task, groupIds, onClose }: { task: Task | null; groupIds: string[]; onClose: () => void }) {
  const { members, today, tz, now, nameOf, refresh, shown } = useTaskCtx();
  const toast = useToast();
  const online = useOnline();
  const [ids, setIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const formId = useId();

  const start = task ? copyStart(task, today) : today;
  const eligible: Member[] = task
    ? kidsFirst(members.filter((m) => !groupIds.includes(m.id) && (task.kind === 'challenge' || m.role === 'kid')))
    : [];

  const submit = async () => {
    if (!task) return;
    setTried(true);
    if (!ids.length || busy || !online) return;
    setBusy(true);
    setError(null);
    const failed: string[] = [];
    let firstError: unknown = null;
    for (const id of ids) {
      try {
        await api.createTask(copyInput(task, id, start, shown));
      } catch (e) {
        failed.push(id);
        firstError ??= e;
      }
    }
    const done = ids.filter((id) => !failed.includes(id));
    if (done.length) toast.show(`Copied to ${joinWords(done.map(nameOf))} 🎉`, 'success');
    if (done.length || toAppError(firstError).code === 'feature_off') await refresh().catch(() => undefined);
    setBusy(false);
    if (!failed.length) { onClose(); return; }
    setIds(failed);
    setError(`${done.length ? `Couldn’t copy it for ${joinWords(failed.map(nameOf))}. ` : ''}${friendlyError(firstError)}`);
  };

  const summary = task
    ? repeatSummary({ ...task, start_on: start, end_on: task.end_on && task.end_on >= start ? task.end_on : null }, today, tz, now())
    : '';

  return (
    <Sheet
      open={!!task} onClose={onClose} title="Copy to…"
      description={task ? 'Same task, rewards and times. Each person gets their own.' : undefined}
      footer={(
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onClose} className="flex-1">Cancel</Button>
          <Button type="submit" form={formId} loading={busy} disabled={!online || eligible.length === 0} className="flex-1">
            {ids.length > 1 ? `Copy for ${ids.length}` : 'Copy'}
          </Button>
        </div>
      )}
    >
      {task && (
        <form id={formId} noValidate className="space-y-4" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
          <div className="flex items-start gap-3 rounded-2xl bg-surface-2 p-3">
            <span className="text-3xl" aria-hidden="true">{task.emoji}</span>
            <div className="min-w-0 flex-1 space-y-1">
              <p className="font-bold [overflow-wrap:anywhere]">{task.title}</p>
              <p className="text-sm text-muted"><span aria-hidden="true">🔁 </span>{summary}</p>
              <RewardChips inst={task} />
            </div>
          </div>
          {eligible.length === 0 ? (
            <p className="text-[15px] text-muted">
              {task.kind === 'chore' ? 'There’s no other kid to copy it to. Add one in Family first.' : 'There’s nobody else to copy it to.'}
            </p>
          ) : (
            <MemberPicker multiple showLabel label="Who else gets it?" members={eligible} value={ids} onChange={(x) => { setIds(x); setError(null); }} />
          )}
          {tried && !ids.length && eligible.length > 0 && (
            <p className="px-1 text-[15px] font-semibold text-bad"><span aria-hidden="true">⚠️ </span>Pick who gets it.</p>
          )}
          {error && <p role="alert" className="rounded-xl bg-bad-soft px-3 py-2 text-[15px] font-semibold text-bad">{error}</p>}
          {!online && <p className="text-[15px] text-muted">No connection — try again when you’re online.</p>}
        </form>
      )}
    </Sheet>
  );
}
