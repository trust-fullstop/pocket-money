import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import {
  Avatar, Badge, Button, Card, Icon, LinkButton, ListRow, ProgressBar, Section, Stat, cx,
} from '../../components/ui';
import { useFeatures } from '../../lib/features';
import { formatTime, minutes, money, plural } from '../../lib/format';
import { useApp, type LoadResult } from '../../lib/session';
import { characterOf, levelFromPoints } from '../../lib/theme';
import type { Balances, EventOccurrence, Member, TaskInstance } from '../../lib/types';
import { EventRow } from '../calendar/EventRow';
import { isForMember } from '../calendar/events';
import { EVENTS_DAYS, gridCols, rewardParts, spokenAmount, upcomingOnly, type DayProgress } from './lib';

/** Page greeting (the h1 of Home for adults). */
export function Greeting({ name, sub, hello = 'Hi' }: { name: string; sub?: ReactNode; hello?: string }) {
  return (
    <div className="pt-2">
      <h1 className="text-2xl font-extrabold">{hello} {name} <span aria-hidden="true">👋</span></h1>
      {sub && <p className="text-[15px] text-muted">{sub}</p>}
    </div>
  );
}

/** Section with a heading and an optional "See all"-style link on the right. */
export function HomeSection({ title, link, children, className }: {
  title: ReactNode; link?: { to: string; label: string }; children: ReactNode; className?: string;
}) {
  return (
    <Section
      title={title}
      className={cx('mt-6', className)}
      action={link ? <LinkButton to={link.to} variant="ghost" size="sm">{link.label}</LinkButton> : undefined}
    >
      {children}
    </Section>
  );
}

/** "We couldn't load this" + Try again, scoped to one section. */
export function SectionError({ error, onRetry }: { error: string | null; onRetry: () => void }) {
  return (
    <Card className="flex items-center gap-3">
      <Icon name="alert" className="shrink-0 text-warn" />
      <div className="min-w-0 flex-1">
        <p className="font-semibold">We couldn’t load this.</p>
        {error && <p className="truncate text-[14px] text-muted">{error}</p>}
      </div>
      <Button variant="secondary" size="sm" onClick={onRetry}>Try again</Button>
    </Card>
  );
}

/** Grey placeholder blocks; only appear after 150 ms so fast loads don't flash. */
export function Skeleton({ rows = 2, height = 'h-16', label = 'Loading' }: { rows?: number; height?: string; label?: string }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setShow(true), 150);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className="space-y-2" aria-busy="true" aria-label={label} role="status">
      {show && Array.from({ length: rows }, (_, i) => (
        <div key={i} className={cx('w-full motion-safe:animate-pulse rounded-2xl bg-surface-2', height)} />
      ))}
    </div>
  );
}

/** Renders a LoadResult: skeleton while first loading, an error card, or the content. */
export function Loaded<T>({ load, rows, height, children }: {
  load: LoadResult<T>; rows?: number; height?: string; children: (data: T) => ReactNode;
}) {
  if (load.data !== null && load.data !== undefined) return <>{children(load.data)}</>;
  if (load.error) return <SectionError error={load.error} onRetry={() => void load.reload()} />;
  return <Skeleton rows={rows} height={height} />;
}

export function RewardChips({ inst, className }: { inst: TaskInstance; className?: string }) {
  const { family } = useApp();
  const features = useFeatures();
  const parts = rewardParts(inst, family?.currency ?? 'EUR', { signed: true, time: features.on('time'), points: features.on('points') });
  if (!parts.length) return null;
  return (
    <span className={cx('flex flex-wrap gap-1', className)}>
      {parts.map((p) => (
        <Badge key={p} tone="good">
          <span aria-hidden="true">{p}</span>
          <span className="sr-only">{spokenAmount(p)}</span>
        </Badge>
      ))}
    </span>
  );
}

/** Status badge for a task instance (kid-safe words from UX §0.1). */
export function StatusBadge({ inst, now, tz, forKid }: { inst: TaskInstance; now: Date; tz: string; forKid?: boolean }) {
  switch (inst.status) {
    case 'submitted': return <Badge tone="warn"><span aria-hidden="true">⏳</span> Waiting for OK</Badge>;
    case 'approved': return <Badge tone="good"><span aria-hidden="true">✅</span> Done</Badge>;
    case 'missed': return <Badge tone="neutral">Not done this time</Badge>;
    case 'excused': return <Badge tone="neutral">Excused</Badge>;
    case 'cancelled': return <Badge tone="neutral">Cancelled</Badge>;
    default:
      if (Date.parse(inst.due_at) < now.getTime()) {
        return <Badge tone="warn">{forKid ? 'Hurry — was due' : 'Late — was due'} {formatTime(inst.due_at, tz)}</Badge>;
      }
      return inst.decision_note ? <Badge tone="warn"><span aria-hidden="true">🔁</span> Try again</Badge> : <Badge tone="neutral">To do</Badge>;
  }
}

/** One of today's tasks for a kid: big "Do it!" for open tasks, otherwise a row linking to the task. */
export function KidTaskRow({ inst }: { inst: TaskInstance }) {
  const { family, now, membersById } = useApp();
  const tz = family?.timezone ?? 'UTC';
  const t = now();
  const partners = inst.partners.map((id) => membersById[id]).filter(Boolean);
  const overdue = inst.status === 'open' && Date.parse(inst.due_at) < t.getTime();
  const info = (
    <>
      <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-surface-2 text-2xl" aria-hidden="true">{inst.emoji || '✅'}</span>
      <span className="min-w-0 flex-1">
        <span className={cx('block font-semibold', inst.status === 'approved' && 'text-muted line-through decoration-2')}>{inst.title}</span>
        <span className={cx('block text-[14px] tabular-nums', overdue ? 'font-semibold text-warn' : 'text-muted')}>
          {inst.status === 'open' && inst.decision_note && <span className="font-semibold text-warn"><span aria-hidden="true">🔁</span> Try again · </span>}
          {overdue ? `Hurry — was due ${formatTime(inst.due_at, tz)}` : `by ${formatTime(inst.due_at, tz)}`}
          {partners.length > 0 && ` · with ${partners.map((p) => p.display_name).join(' & ')}`}
        </span>
        <RewardChips inst={inst} className="mt-1" />
      </span>
    </>
  );
  if (inst.status === 'open' && inst.can_submit) {
    return (
      <li className="flex items-center gap-3 p-3">
        {info}
        <Link
          to={`/tasks/${inst.id}`}
          className="inline-flex min-h-14 shrink-0 items-center rounded-2xl bg-accent-strong px-4 text-lg font-extrabold text-white shadow-sm transition active:scale-95"
          aria-label={`Do it: ${inst.title}`}
        >
          Do it!
        </Link>
      </li>
    );
  }
  return (
    <li>
      <Link to={`/tasks/${inst.id}`} className="flex min-h-11 items-center gap-3 p-3 hover:bg-surface-2">
        {info}
        <span className="shrink-0"><StatusBadge inst={inst} now={t} tz={tz} forKid /></span>
      </Link>
    </li>
  );
}

/** One task in the family list (manager / grandparent): who · what · when · status. */
export function FamilyTaskRow({ inst }: { inst: TaskInstance }) {
  const { family, now, membersById } = useApp();
  const tz = family?.timezone ?? 'UTC';
  const who = membersById[inst.assignee_id];
  return (
    <ListRow
      to={`/tasks/${inst.id}`}
      left={
        <span className="relative">
          <span className="grid size-11 place-items-center rounded-2xl bg-surface-2 text-2xl" aria-hidden="true">{inst.emoji || '✅'}</span>
          {who && <Avatar member={who} name="" size="xs" className="!absolute -bottom-1 -right-1 ring-2 ring-surface" />}
        </span>
      }
      title={inst.title}
      subtitle={`${who?.display_name ?? 'Someone'} · by ${formatTime(inst.due_at, tz)}`}
      right={inst.status === 'submitted' && inst.can_decide
        ? <span className="inline-flex min-h-8 items-center rounded-full bg-accent-strong px-3 text-[14px] font-bold text-white">Check</span>
        : <StatusBadge inst={inst} now={now()} tz={tz} />}
    />
  );
}

/** "Coming up" — next calendar items (optionally only those for one member). Hidden when the calendar is switched off. */
export function ComingUp({ events, max, forMember, title = 'Coming up' }: {
  events: LoadResult<EventOccurrence[]>; max: number; forMember?: string; title?: string;
}) {
  const { now } = useApp();
  const features = useFeatures();
  if (!features.on('calendar')) return null;
  return (
    <HomeSection title={title} link={{ to: '/calendar', label: 'Calendar' }}>
      <Loaded load={events} rows={2}>
        {(list) => {
          const items = upcomingOnly(list, now())
            .filter((o) => !forMember || isForMember(o, forMember))
            .slice(0, max);
          if (!items.length) {
            return (
              <Card className="flex items-center gap-3">
                <span className="text-2xl" aria-hidden="true">🗓️</span>
                <p className="text-muted">Nothing on the calendar for the next {EVENTS_DAYS} days.</p>
              </Card>
            );
          }
          return (
            <Card padded={false} className="divide-y divide-line overflow-hidden">
              {items.map((o) => <EventRow key={`${o.id}-${o.occurs_at}`} occ={o} withDay to="/calendar" />)}
            </Card>
          );
        }}
      </Loaded>
    </HomeSection>
  );
}

/** Spending / Savings / Time in a row (Savings and Time only when switched on). Negative spending shows "Owes" in orange. */
export function MiniBalances({ b, size = 'md' }: { b: Balances; size?: 'sm' | 'md' }) {
  const { family } = useApp();
  const features = useFeatures();
  const cur = family?.currency ?? 'EUR';
  const owes = b.spending < 0;
  const savings = features.on('savings');
  const time = features.on('time');
  const cls = size === 'sm' ? '[&_.text-2xl]:text-lg' : '';
  return (
    <div className={cx('grid gap-2', gridCols(1 + Number(savings) + Number(time)), cls)}>
      <Stat
        label={owes ? 'Owes' : 'Spending'}
        value={<>{money(owes ? -b.spending : b.spending, cur)}{owes && <span aria-hidden="true"> ⚠️</span>}</>}
        tone={owes ? 'warn' : undefined}
      />
      {savings && <Stat label="Savings" value={money(b.savings, cur)} />}
      {time && <Stat label="Time" value={minutes(b.time)} tone={b.time < 0 ? 'warn' : undefined} />}
    </div>
  );
}

/** A kid's card for managers and grandparents. */
export function KidGlanceCard({ kid, balances, progress, mode }: {
  kid: Member;
  balances?: Balances;
  /** Today's tasks; undefined = still loading / unknown, null = not allowed (hide the line). */
  progress?: DayProgress | null;
  mode: 'manager' | 'grandparent';
}) {
  const features = useFeatures();
  const char = characterOf(kid.theme);
  const level = balances && features.on('points') ? levelFromPoints(balances.points, char?.key) : null;
  const canGift = mode === 'grandparent' && features.on('spotted');
  const header = (
    <div className="flex items-center gap-3">
      <Avatar member={kid} size="lg" name="" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-lg font-extrabold">{kid.display_name}</div>
        {level && (
          <Badge tone="accent">
            {char && <span aria-hidden="true">{char.emoji}</span>} Level {level.level}
          </Badge>
        )}
      </div>
      {mode === 'manager' && <Icon name="forward" className="shrink-0 text-muted" />}
    </div>
  );
  const progressLine = progress === undefined ? (
    <div className="h-3 w-full motion-safe:animate-pulse rounded-full bg-surface-2" aria-hidden="true" />
  ) : progress === null ? null : progress.total === 0 ? (
    <p className="text-[14px] text-muted">No tasks today</p>
  ) : (
    <div>
      <ProgressBar
        value={progress.done}
        max={progress.total}
        tone={progress.done === progress.total ? 'good' : 'accent'}
        label={`${kid.display_name}: today ${progress.done} of ${progress.total} done`}
        showLabel
        valueText={progress.waiting > 0 ? `${progress.waiting} waiting` : undefined}
        size="sm"
      />
      <span className="sr-only">{progress.waiting > 0 ? `, ${plural(progress.waiting, 'task')} waiting for OK` : ''}</span>
    </div>
  );

  return (
    <Card className="space-y-3">
      {mode === 'manager' ? (
        <Link to={`/money/${kid.id}`} className="-m-2 block rounded-2xl p-2 hover:bg-surface-2">
          {header}
          {balances && <div className="mt-3"><MiniBalances b={balances} size="sm" /></div>}
        </Link>
      ) : (
        <>
          {header}
          {balances && <MiniBalances b={balances} size="sm" />}
        </>
      )}
      {progressLine}
      {(mode === 'manager' || canGift) && (
        <div className="flex flex-wrap gap-2">
          {mode === 'manager' ? (
            <>
              <LinkButton to={`/tasks?person=${kid.id}`} variant="secondary" size="sm" icon="tasks">Tasks</LinkButton>
              <LinkButton to={`/tasks/new?person=${kid.id}`} variant="ghost" size="sm" icon="plus">New task</LinkButton>
            </>
          ) : (
            <LinkButton to={`/money/spot?member=${kid.id}`} variant="primary" size="sm" icon="gift">
              Send {kid.display_name} a gift
            </LinkButton>
          )}
        </div>
      )}
    </Card>
  );
}
