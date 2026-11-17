// /tasks — kid: Today · Upcoming · Done; manager: By person · Repeating · Approvals; grandparent: My challenges · Kids' tasks.
import type { ReactNode } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router';
import {
  Avatar, Button, Card, Chip, EmptyState, LinkButton, PageHeader, ProgressBar, Section, cx,
} from '../../components/ui';
import { api } from '../../lib/api';
import { friendlyError } from '../../lib/errors';
import { addDays, plural } from '../../lib/format';
import type { Member, TaskInstance } from '../../lib/types';
import { VerseLine } from '../faith/VerseCard';
import { ApprovalsList } from './Approvals';
import { useDelayed, useFetch, useTaskCtx } from './hooks';
import { byDueAsc, byDueDesc, byUrgency, dayWord, isActive, isFinished, joinWords, kidsFirst, weekEnd } from './lib';
import { ChallengesOff, ChipGroup, LoadError, PersonFilter, Refreshing, SkeletonRows, TabPanel, Tabs, TaskList } from './parts';
import { RepeatingList } from './Repeating';

const PAST_DAYS = 14;
const AHEAD_DAYS = 14;

export default function TasksHome() {
  const { isManager, isGrandparent } = useTaskCtx();
  const [params] = useSearchParams();
  if (!isManager && params.get('tab') === 'approvals') return <Navigate to="/tasks/approvals" replace />;
  if (isManager) return <ManagerHome />;
  if (isGrandparent) return <GrandparentHome />;
  return <KidHome />;
}

// ---------------------------------------------------------------- shared
/** All instances from 14 days ago to 14 days ahead (the server makes them up to a week ahead); no challenges while they're switched off. */
function useRangeInstances() {
  const { today, state, feat } = useTaskCtx();
  const from = addDays(today, -PAST_DAYS);
  const to = addDays(today, AHEAD_DAYS);
  const q = useFetch(() => api.listInstances(from, to, null), ['instances', from, to], state);
  const data = q.data && !feat.challenges ? q.data.filter((i) => i.kind !== 'challenge') : q.data;
  return { ...q, data };
}

/** Read/write one URL search param (history replace, so Back leaves the page). */
function useParam<T extends string>(name: string, allowed: readonly T[], fallback: T): [T, (v: T) => void] {
  const [params, setParams] = useSearchParams();
  const raw = params.get(name) as T | null;
  const value = raw && allowed.includes(raw) ? raw : fallback;
  const set = (v: T) => setParams((p) => {
    const n = new URLSearchParams(p);
    if (v === fallback) n.delete(name); else n.set(name, v);
    return n;
  }, { replace: true });
  return [value, set];
}

function Loading({ big }: { big?: boolean }) {
  const show = useDelayed(true);
  return show ? <SkeletonRows rows={3} big={big} /> : null;
}

/** Colossians 3:23 at the bottom of a calm list: not next to missed tasks and what they cost ("Earlier", "Not done").
 *  mb: when scrolled to the end, it sits above the floating Spotted button, not next to it. */
function WorkVerse({ show = true }: { show?: boolean }) {
  const [params] = useSearchParams();
  const outcomes = params.get('time') === 'earlier' || (params.get('status') ?? '').split(',').includes('notdone');
  if (!show || outcomes) return null;
  return <VerseLine id="work-heartily" className="mb-8 mt-8 border-t border-line px-1 pt-4" />;
}

/** Amber card "Dad did your challenge!" → the "to check" list (kids and grandparents). */
function ChallengesToCheck({ big }: { big?: boolean }) {
  const { approvalsCount, state, membersById, feat } = useTaskCtx();
  const on = feat.challenges && approvalsCount > 0;
  const q = useFetch(() => (on ? api.listApprovals() : Promise.resolve([])), ['to-check', on], state);
  if (!on) return null;
  const names = [...new Set((q.data ?? []).map((i) => membersById[i.assignee_id]?.display_name).filter((n): n is string => !!n))];
  const title = names.length
    ? `${joinWords(names)} did your ${approvalsCount > 1 ? 'challenges' : 'challenge'}!`
    : approvalsCount > 1 ? `${approvalsCount} challenges are done!` : 'Someone did your challenge!';
  return (
    <Card tone="warn" className="relative flex items-center gap-3 !py-3">
      <span aria-hidden="true" className="text-3xl">🏆</span>
      <div className="min-w-0 flex-1">
        <Link
          to="/tasks/approvals"
          className={cx('block font-bold after:absolute after:inset-0 after:rounded-3xl after:content-[""] focus-visible:outline-none focus-visible:after:outline focus-visible:after:outline-3 focus-visible:after:outline-accent', big ? 'text-lg' : 'text-base')}
        >
          {title}
        </Link>
        <p className={cx('text-muted', big ? 'text-[15px]' : 'text-sm')}>Check it and say if it's done.</p>
      </div>
      <span aria-hidden="true" className="shrink-0 rounded-full bg-surface px-3 py-1.5 text-sm font-bold text-ink">Check</span>
    </Card>
  );
}

function DayGroups({ items, big, showAssignee }: { items: TaskInstance[]; big?: boolean; showAssignee?: boolean }) {
  const { tz, now } = useTaskCtx();
  const days = [...new Set(items.map((i) => i.occurs_on))].sort();
  return (
    <div className="space-y-4">
      {days.map((d) => (
        <Section key={d} title={dayWord(d, tz, now())}>
          <TaskList items={items.filter((i) => i.occurs_on === d).sort(byDueAsc)} big={big} showAssignee={showAssignee} />
        </Section>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- kid
const KID_TABS = ['today', 'upcoming', 'done'] as const;
type KidTab = (typeof KID_TABS)[number];

function KidHome() {
  const { me, today, feat } = useTaskCtx();
  const q = useRangeInstances();
  const [tab, setTab] = useParam<KidTab>('tab', KID_TABS, 'today');
  const meId = me?.id;

  const all = q.data ?? [];
  const mine = all.filter((i) => i.assignee_id === meId);
  const setByMe = feat.challenges ? all.filter((i) => i.assignee_id !== meId && i.created_by === meId) : [];
  const isNow = (i: TaskInstance) => i.occurs_on === today || (i.occurs_on < today && isActive(i));

  const todayMine = mine.filter(isNow).sort(byUrgency);
  const todaySet = setByMe.filter(isNow).sort(byUrgency);
  const countable = mine.filter((i) => i.occurs_on === today && i.status !== 'excused');
  const doneCount = countable.filter((i) => i.status === 'approved' || i.status === 'submitted').length;
  const upcomingMine = mine.filter((i) => i.occurs_on > today && i.status === 'open');
  const upcomingSet = setByMe.filter((i) => i.occurs_on > today && i.status === 'open');
  const finished = [...mine, ...setByMe].filter((i) => isFinished(i) && i.occurs_on <= today).sort(byDueDesc);

  let body: ReactNode;
  if (q.error && !q.data) body = <LoadError message={friendlyError(q.error)} onRetry={q.reload} />;
  else if (!q.data) body = <Loading big />;
  else if (tab === 'today') {
    body = todayMine.length === 0 && todaySet.length === 0
      ? <EmptyState emoji="🎈" title="No tasks today" message="Enjoy your free time!" />
      : (
        <div className="space-y-5">
          {countable.length > 0 && (
            <div className="space-y-2 px-1">
              <p className="text-lg font-bold">
                {doneCount === countable.length ? `All done today! 🌟` : `${doneCount} of ${countable.length} done`}
              </p>
              <ProgressBar value={doneCount} max={countable.length} label="Done today" tone="good" valueText={`${doneCount} of ${countable.length} done`} />
            </div>
          )}
          {todayMine.length > 0 && <TaskList items={todayMine} big />}
          {todaySet.length > 0 && (
            <Section title="Challenges you set">
              <TaskList items={todaySet} big showAssignee />
            </Section>
          )}
        </div>
      );
  } else if (tab === 'upcoming') {
    body = upcomingMine.length === 0 && upcomingSet.length === 0
      ? <EmptyState emoji="🗓️" title="Nothing coming up" message="New tasks show up here." />
      : (
        <div className="space-y-5">
          <DayGroups items={upcomingMine} big />
          {upcomingSet.length > 0 && (
            <Section title="Challenges you set">
              <TaskList items={upcomingSet.sort(byDueAsc)} big showAssignee />
            </Section>
          )}
        </div>
      );
  } else {
    body = finished.length === 0
      ? <EmptyState emoji="🌟" title="Nothing here yet" message="Do a task and it shows up here." />
      : <TaskList items={finished} big outcome showAssignee={setByMe.length > 0} />;
  }

  return (
    <div className="space-y-4 pb-4">
      <PageHeader
        title="My tasks"
        right={(
          <>
            <Refreshing on={q.refreshing} />
            {feat.challenges && <LinkButton to="/tasks/new" size="sm" icon="plus">Challenge</LinkButton>}
          </>
        )}
      />
      <ChallengesToCheck big />
      <Tabs
        idBase="tasks-kid" label="Show tasks" value={tab} onChange={setTab}
        tabs={[{ value: 'today', label: 'Today' }, { value: 'upcoming', label: 'Upcoming' }, { value: 'done', label: 'Done' }]}
      />
      <TabPanel idBase="tasks-kid" value={tab}>{body}</TabPanel>
      <WorkVerse show={tab !== 'done'} />
    </div>
  );
}

// ---------------------------------------------------------------- grandparent
const GP_TABS = ['mine', 'kids'] as const;
type GpTab = (typeof GP_TABS)[number];

function GrandparentHome() {
  const { me, members, today, feat } = useTaskCtx();
  const q = useRangeInstances();
  const [tab, setTab] = useParam<GpTab>('tab', GP_TABS, 'mine');
  const meId = me?.id;
  const all = q.data ?? [];
  const mineAll = all.filter((i) => i.created_by === meId || i.assignee_id === meId);
  const active = mineAll.filter((i) => isActive(i) && (i.occurs_on >= today || i.status === 'submitted' || i.assignee_id === meId)).sort(byUrgency);
  const done = mineAll.filter((i) => isFinished(i) && i.occurs_on <= today).sort(byDueDesc);
  const kids = kidsFirst(members.filter((m) => m.role === 'kid'));

  let body: ReactNode;
  if (tab === 'mine' && !feat.challenges) {
    body = <ChallengesOff action={<Button variant="secondary" onClick={() => setTab('kids')}>See the kids’ tasks</Button>} />;
  } else if (q.error && !q.data) body = <LoadError message={friendlyError(q.error)} onRetry={q.reload} />;
  else if (!q.data) body = <Loading />;
  else if (tab === 'mine') {
    body = mineAll.length === 0
      ? (
        <EmptyState
          emoji="🏆" title="No challenges yet" message="Set a fun challenge for one of the kids."
          action={<LinkButton to="/tasks/new" icon="plus">Challenge</LinkButton>}
        />
      )
      : (
        <div className="space-y-5">
          {active.length > 0
            ? <Section title="Coming up"><TaskList items={active} showAssignee /></Section>
            : <p className="px-1 text-[15px] text-muted">No open challenges right now.</p>}
          {done.length > 0 && <Section title="Done"><TaskList items={done} showAssignee outcome /></Section>}
        </div>
      );
  } else {
    body = <ByPerson data={all} people={kids} readOnly />;
  }

  return (
    <div className="space-y-4 pb-4">
      <PageHeader
        title="Tasks"
        right={(
          <>
            <Refreshing on={q.refreshing} />
            {feat.challenges && <LinkButton to="/tasks/new" size="sm" icon="plus">Challenge</LinkButton>}
          </>
        )}
      />
      <ChallengesToCheck />
      <Tabs
        idBase="tasks-gp" label="Show tasks" value={tab} onChange={setTab}
        tabs={[{ value: 'mine', label: feat.challenges ? 'My challenges' : 'Challenges' }, { value: 'kids', label: 'Kids’ tasks' }]}
      />
      <TabPanel idBase="tasks-gp" value={tab}>{body}</TabPanel>
      <WorkVerse show={tab === 'kids'} />
    </div>
  );
}

// ---------------------------------------------------------------- manager
const M_TABS = ['person', 'repeating', 'approvals'] as const;
type MTab = (typeof M_TABS)[number];

function ManagerHome() {
  const { members, approvalsCount } = useTaskCtx();
  const q = useRangeInstances();
  const [tab, setTab] = useParam<MTab>('tab', M_TABS, 'person');
  const [params] = useSearchParams();
  const person = params.get('person');

  let body: ReactNode;
  if (tab === 'approvals') body = <ApprovalsList />;
  else if (tab === 'repeating') body = <RepeatingList />;
  else if (q.error && !q.data) body = <LoadError message={friendlyError(q.error)} onRetry={q.reload} />;
  else if (!q.data) body = <Loading />;
  else body = <ByPerson data={q.data} people={kidsFirst(members)} />;

  return (
    <div className="space-y-4 pb-4">
      <PageHeader
        title="Tasks"
        right={(
          <>
            <Refreshing on={q.refreshing && tab === 'person'} />
            <LinkButton to={person ? `/tasks/new?person=${encodeURIComponent(person)}` : '/tasks/new'} size="sm" icon="plus">New</LinkButton>
          </>
        )}
      />
      <Tabs
        idBase="tasks-m" label="Show tasks" value={tab} onChange={setTab}
        tabs={[
          { value: 'person', label: 'By person' },
          { value: 'repeating', label: 'Repeating' },
          { value: 'approvals', label: 'Approvals', count: approvalsCount, countLabel: `${approvalsCount} waiting` },
        ]}
      />
      <TabPanel idBase="tasks-m" value={tab}>{body}</TabPanel>
      <WorkVerse show={tab === 'person'} />
    </div>
  );
}

// ---------------------------------------------------------------- by person (managers; grandparents read-only)
const TIMES = ['today', 'week', 'later', 'earlier'] as const;
type TimeKey = (typeof TIMES)[number];
const TIME_LABEL: Record<TimeKey, string> = { today: 'Today', week: 'This week', later: 'Later', earlier: 'Earlier' };

const STATUS_FILTERS = ['todo', 'waiting', 'done', 'notdone'] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];
const STATUS_FILTER: Record<StatusFilter, { label: string; emoji: string }> = {
  todo: { label: 'To do', emoji: '📝' },
  waiting: { label: 'Waiting', emoji: '⏳' },
  done: { label: 'Done', emoji: '✅' },
  notdone: { label: 'Not done', emoji: '⏰' },
};
const statusFilterOf = (i: TaskInstance): StatusFilter | null =>
  i.status === 'open' ? 'todo' : i.status === 'submitted' ? 'waiting' : i.status === 'approved' ? 'done'
    : i.status === 'missed' || i.status === 'excused' ? 'notdone' : null;

function ByPerson({ data, people, readOnly }: { data: TaskInstance[]; people: Member[]; readOnly?: boolean }) {
  const { today, me, feat } = useTaskCtx();
  const [params, setParams] = useSearchParams();
  const update = (fn: (p: URLSearchParams) => void) => setParams((p) => { const n = new URLSearchParams(p); fn(n); return n; }, { replace: true });

  const personParam = params.get('person');
  const person = personParam && people.some((m) => m.id === personParam) ? personParam : null;
  const timeParam = params.get('time') as TimeKey | null;
  const time: TimeKey = timeParam && TIMES.includes(timeParam) ? timeParam : 'today';
  const statuses = new Set((params.get('status') ?? '').split(',').filter((s): s is StatusFilter => (STATUS_FILTERS as readonly string[]).includes(s)));

  const setPerson = (id: string | null) => update((p) => { if (id) p.set('person', id); else p.delete('person'); });
  const setTime = (t: TimeKey) => update((p) => { if (t === 'today') p.delete('time'); else p.set('time', t); });
  const toggleStatus = (s: StatusFilter) => update((p) => {
    const next = new Set(statuses);
    if (next.has(s)) next.delete(s); else next.add(s);
    if (next.size) p.set('status', [...next].join(',')); else p.delete('status');
  });
  const resetFilters = () => update((p) => { p.delete('status'); p.delete('person'); });

  const end = weekEnd(today);
  const inTime = (i: TaskInstance) => {
    switch (time) {
      case 'today': return i.occurs_on === today || (i.occurs_on < today && isActive(i));
      case 'week': return (i.occurs_on >= today && i.occurs_on <= end) || (i.occurs_on < today && isActive(i));
      case 'later': return i.occurs_on > end;
      case 'earlier': return i.occurs_on < today;
    }
  };
  const peopleIds = new Set(people.map((m) => m.id));
  const filtered = data.filter((i) => {
    if (!peopleIds.has(i.assignee_id)) return false;
    if (person && i.assignee_id !== person) return false;
    if (!inTime(i)) return false;
    const s = statusFilterOf(i);
    return !statuses.size || (s !== null && statuses.has(s));
  });
  const sorter = time === 'earlier' ? byDueDesc : time === 'today' ? byUrgency : byDueAsc;
  const groups = people
    .map((m) => ({ member: m, items: filtered.filter((i) => i.assignee_id === m.id).sort(sorter) }))
    .filter((g) => g.items.length > 0);
  const noTasksAtAll = !data.some((i) => peopleIds.has(i.assignee_id));

  return (
    <div className="space-y-4">
      <PersonFilter members={people} value={person} onChange={setPerson} label="Show tasks for" />
      <div className="space-y-2">
        <ChipGroup label="When">
          {TIMES.map((t) => <Chip key={t} selected={time === t} onClick={() => setTime(t)}>{TIME_LABEL[t]}</Chip>)}
        </ChipGroup>
        <ChipGroup label="Status (pick any)">
          {STATUS_FILTERS.map((s) => (
            <Chip key={s} selected={statuses.has(s)} emoji={STATUS_FILTER[s].emoji} onClick={() => toggleStatus(s)}>{STATUS_FILTER[s].label}</Chip>
          ))}
        </ChipGroup>
      </div>

      {noTasksAtAll ? (
        <EmptyState
          emoji="📝" title="No tasks yet"
          message={readOnly ? 'When the kids get tasks, you can see them here.' : feat.challenges ? 'Make a chore or a challenge.' : 'Make a chore — it can repeat by itself.'}
          action={readOnly ? undefined : <LinkButton to="/tasks/new" icon="plus">New</LinkButton>}
        />
      ) : groups.length === 0 ? (
        <EmptyState
          emoji="🔍" title="Nothing here"
          message={time === 'today' ? 'No tasks today for this filter.' : 'Try another time or filter.'}
          action={(statuses.size > 0 || person) ? <Button variant="secondary" onClick={resetFilters}>Show everyone, any status</Button> : undefined}
        />
      ) : (
        <div className="space-y-5">
          {groups.map(({ member, items }) => {
            const countable = items.filter((i) => i.status !== 'excused');
            const done = countable.filter((i) => i.status === 'approved').length;
            return (
              <section key={member.id} className="space-y-2" aria-labelledby={`grp-${member.id}`}>
                <div className="flex items-center gap-2 px-1">
                  <Avatar member={member} size="sm" name="" />
                  <h2 id={`grp-${member.id}`} className="min-w-0 flex-1 truncate text-lg font-bold">
                    {member.id === me?.id ? `${member.display_name} (me)` : member.display_name}
                  </h2>
                  <span className="shrink-0 text-sm font-semibold text-muted">
                    {countable.length ? `${done} of ${countable.length} done` : plural(items.length, 'task')}
                  </span>
                </div>
                <TaskList items={items} readOnly={readOnly} outcome={time === 'earlier'} />
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
