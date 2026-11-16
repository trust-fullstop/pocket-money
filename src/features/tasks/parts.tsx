// Small UI pieces shared by the Tasks screens (rows, chips, tabs, filters, photos, skeletons).
import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import {
  Avatar, Badge, Button, Card, CountBadge, EmptyState, Icon, LinkButton, Sheet, Spinner, cx,
} from '../../components/ui';
import { backend } from '../../lib/backend';
import type { Member, TaskInstance } from '../../lib/types';
import { useTaskCtx } from './hooks';
import {
  dueShort, isLate, isSentBack, penaltyParts, rewardParts, statusOf, type Part,
} from './lib';

// ---------------------------------------------------------------- amounts
const TONE_CLASS = {
  plus: 'bg-good-soft text-good',
  minus: 'bg-warn-soft text-warn',
  neutral: 'bg-surface-2 text-muted',
} as const;

/** One amount pill: emoji + signed text, read out in words ("plus €2.00"). */
export function AmountPill({ part, tone, big }: { part: Part; tone: keyof typeof TONE_CLASS; big?: boolean }) {
  return (
    <span className={cx('inline-flex max-w-full items-center gap-1 rounded-full px-2.5 py-0.5 font-bold', big ? 'text-[15px]' : 'text-[13px]', TONE_CLASS[tone])}>
      <span aria-hidden="true" className="truncate">{part.emoji} {part.text}</span>
      <span className="sr-only">{part.sr}</span>
    </span>
  );
}

/** Reward chips (green) and, when set, consequence chips (orange, ⏰ = "if not done in time"). */
export function RewardChips({ inst, big, hidePenalty }: { inst: TaskInstance; big?: boolean; hidePenalty?: boolean }) {
  const { currency } = useTaskCtx();
  const rewards = rewardParts(inst, currency);
  const penalties = hidePenalty ? [] : penaltyParts(inst, currency);
  if (!rewards.length && !penalties.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {rewards.length > 0 && <span className="sr-only">Reward:</span>}
      {rewards.map((p) => <AmountPill key={p.key} part={p} tone="plus" big={big} />)}
      {penalties.length > 0 && (
        <>
          <span className="sr-only">If not done in time:</span>
          <span className={cx('inline-flex items-center gap-1 rounded-full font-bold text-warn', big ? 'text-[15px]' : 'text-[13px]')} aria-hidden="true">⏰</span>
          {penalties.map((p) => <AmountPill key={p.key} part={p} tone="minus" big={big} />)}
        </>
      )}
    </div>
  );
}

/** What a finished task brought: "+€0.50 +10 XP" (done), "−€0.50" (not done), "Excused" (given back). */
export function OutcomeChips({ inst, big }: { inst: TaskInstance; big?: boolean }) {
  const { currency } = useTaskCtx();
  if (inst.status === 'approved') {
    const parts = rewardParts(inst, currency);
    return parts.length ? <div className="flex flex-wrap gap-1.5">{parts.map((p) => <AmountPill key={p.key} part={p} tone="plus" big={big} />)}</div> : null;
  }
  if (inst.status === 'missed') {
    const parts = penaltyParts(inst, currency);
    return parts.length ? <div className="flex flex-wrap gap-1.5">{parts.map((p) => <AmountPill key={p.key} part={p} tone="minus" big={big} />)}</div> : null;
  }
  if (inst.status === 'excused' && penaltyParts(inst, currency).length) {
    return <span className={cx('text-muted', big ? 'text-[15px]' : 'text-sm')}>🤝 Excused — nothing taken away</span>;
  }
  return null;
}

// ---------------------------------------------------------------- status & tags
export function StatusBadge({ inst, className }: { inst: TaskInstance; className?: string }) {
  const s = statusOf(inst);
  return (
    <Badge tone={s.tone} className={className}>
      <span aria-hidden="true">{s.emoji}</span>{s.label}
    </Badge>
  );
}

/** "🏆 Challenge from Mum" / "🏆 Your challenge for Dad" / "🏆 Challenge". */
export function ChallengeTag({ inst }: { inst: TaskInstance }) {
  const { me, nameOf } = useTaskCtx();
  if (inst.kind !== 'challenge') return null;
  const mine = inst.created_by === me?.id;
  const text = mine
    ? inst.assignee_id === me?.id ? 'Your challenge' : `Your challenge for ${nameOf(inst.assignee_id)}`
    : `Challenge from ${nameOf(inst.created_by)}`;
  return <Badge tone="accent"><span aria-hidden="true">🏆</span>{text}</Badge>;
}

/** "🤝 With Dad and Sam" plus small avatars. */
export function Partners({ ids, label = 'With', big }: { ids: string[]; label?: string; big?: boolean }) {
  const { membersById, me } = useTaskCtx();
  if (!ids.length) return null;
  const people = ids.map((id) => membersById[id]).filter((m): m is Member => !!m);
  const names = people.map((m) => (m.id === me?.id ? 'you' : m.display_name));
  return (
    <div className={cx('flex items-center gap-2 text-muted', big ? 'text-[15px]' : 'text-sm')}>
      <span className="flex -space-x-2" aria-hidden="true">
        {people.slice(0, 4).map((m) => <Avatar key={m.id} member={m} size="xs" name="" ring="var(--surface)" />)}
      </span>
      <span><span aria-hidden="true">🤝 </span>{label} {names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0]}</span>
    </div>
  );
}

// ---------------------------------------------------------------- task row
export interface TaskRowProps {
  inst: TaskInstance;
  /** Kid layout: bigger type and 56 px buttons. */
  big?: boolean;
  /** Show the assignee (avatar + name) — for lists that mix people. */
  showAssignee?: boolean;
  /** Finished-list mode: show what was earned or lost instead of the possible rewards. */
  outcome?: boolean;
  /** No action buttons (read-only lists). */
  readOnly?: boolean;
}

/** One task: whole row opens the detail; "Do it" / "Check" buttons on the right. */
export function TaskRow({ inst, big, showAssignee, outcome, readOnly }: TaskRowProps) {
  const { me, membersById, nameOf, today, tz, now } = useTaskCtx();
  const nowDate = now();
  const late = isLate(inst, nowDate.getTime());
  const sentBack = isSentBack(inst);
  const assignee = membersById[inst.assignee_id];
  const to = `/tasks/${inst.id}`;
  const mine = inst.assignee_id === me?.id;

  let action: ReactNode = null;
  if (!readOnly && inst.can_submit) {
    action = (
      <LinkButton to={to} size={big ? 'lg' : 'sm'} aria-label={`Do it: ${inst.title}`}>
        {big ? 'Do it!' : 'Do it'}
      </LinkButton>
    );
  } else if (!readOnly && inst.can_decide) {
    action = <LinkButton to={to} size={big ? 'lg' : 'sm'} variant="secondary" aria-label={`Check: ${inst.title}`}>Check</LinkButton>;
  }

  return (
    <li className={cx('relative flex items-center gap-3 transition hover:bg-surface-2/60', big ? 'px-4 py-3.5' : 'px-3.5 py-3', inst.status === 'approved' && !outcome && 'opacity-80')}>
      <span className={cx('grid shrink-0 place-items-center rounded-2xl bg-surface-2', big ? 'size-14 text-4xl' : 'size-11 text-2xl')} aria-hidden="true">
        {inst.emoji}
      </span>
      <div className={cx('min-w-0 flex-1', big ? 'space-y-1.5' : 'space-y-1')}>
        <Link
          to={to}
          className={cx(
            'block font-bold leading-snug after:absolute after:inset-0 after:content-[""] focus-visible:outline-none focus-visible:after:rounded-2xl focus-visible:after:outline focus-visible:after:outline-3 focus-visible:after:-outline-offset-2 focus-visible:after:outline-accent',
            big ? 'text-lg' : 'text-base',
          )}
        >
          {inst.title}
          {showAssignee && !mine && assignee && <span className="sr-only"> for {assignee.display_name}</span>}
        </Link>
        <div className={cx('flex flex-wrap items-center gap-x-2 gap-y-1 text-muted', big ? 'text-[15px]' : 'text-sm')}>
          {showAssignee && assignee && (
            <span className="inline-flex items-center gap-1.5 font-semibold text-ink" aria-hidden="true">
              <Avatar member={assignee} size="xs" name="" />{mine ? 'You' : assignee.display_name}
            </span>
          )}
          <span>{dueShort(inst, today, tz, nowDate)}</span>
          <StatusBadge inst={inst} />
          <ChallengeTag inst={inst} />
        </div>
        {sentBack && (
          <p className={cx('font-semibold text-warn', big ? 'text-[15px]' : 'text-sm')}>
            <span aria-hidden="true">💬 </span>{nameOf(inst.decided_by)} says: “{inst.decision_note}”
          </p>
        )}
        {late && !sentBack && (
          <p className={cx('font-semibold text-warn', big ? 'text-[15px]' : 'text-sm')}>
            <span aria-hidden="true">⏰ </span>{inst.can_submit ? 'Hurry — it might still count' : 'Late — not done yet'}
          </p>
        )}
        {outcome ? <OutcomeChips inst={inst} big={big} /> : <RewardChips inst={inst} big={big} />}
        <Partners ids={inst.partners} big={big} />
      </div>
      {action && <div className="relative z-10 shrink-0">{action}</div>}
    </li>
  );
}

/** A card with a divided list of TaskRows. */
export function TaskList({ items, ...row }: { items: TaskInstance[] } & Omit<TaskRowProps, 'inst'>) {
  return (
    <Card padded={false} className="overflow-hidden">
      <ul className="divide-y divide-line">
        {items.map((i) => <TaskRow key={i.id} inst={i} {...row} />)}
      </ul>
    </Card>
  );
}

// ---------------------------------------------------------------- tabs (views) and person filter
export interface TabDef<T extends string> { value: T; label: string; count?: number; countLabel?: string }

/** Tab bar that switches views (role="tablist"; arrow keys move). Pair with <TabPanel>. */
export function Tabs<T extends string>({ value, onChange, tabs, label, idBase, className }: {
  value: T; onChange: (v: T) => void; tabs: TabDef<T>[]; label: string; idBase: string; className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const onKey = (e: KeyboardEvent) => {
    const dir = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    const i = tabs.findIndex((t) => t.value === value);
    const next = tabs[(i + dir + tabs.length) % tabs.length];
    onChange(next.value);
    window.requestAnimationFrame(() => ref.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.focus());
  };
  return (
    <div ref={ref} role="tablist" aria-label={label} onKeyDown={onKey} className={cx('flex gap-1 rounded-2xl bg-surface-2 p-1', className)}>
      {tabs.map((t) => {
        const on = t.value === value;
        return (
          <button
            key={t.value} type="button" role="tab" id={`${idBase}-tab-${t.value}`} aria-selected={on}
            aria-controls={`${idBase}-panel`} tabIndex={on ? 0 : -1} onClick={() => onChange(t.value)}
            aria-label={t.count ? `${t.label}, ${t.countLabel ?? `${t.count} waiting`}` : undefined}
            className={cx(
              'flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl px-2 text-[15px] font-semibold transition',
              on ? 'bg-surface text-ink shadow-sm ring-1 ring-line' : 'text-muted hover:text-ink',
            )}
          >
            {t.label}
            {!!t.count && <CountBadge count={t.count} label={t.countLabel ?? `${t.count} waiting`} />}
          </button>
        );
      })}
    </div>
  );
}

export function TabPanel({ idBase, value, children, className }: { idBase: string; value: string; children: ReactNode; className?: string }) {
  return (
    <div role="tabpanel" id={`${idBase}-panel`} aria-labelledby={`${idBase}-tab-${value}`} className={className}>
      {children}
    </div>
  );
}

/** Single-choice row of people with "Everyone" first (radiogroup). */
export function PersonFilter({ members, value, onChange, label }: {
  members: Member[]; value: string | null; onChange: (id: string | null) => void; label: string;
}) {
  const { me } = useTaskCtx();
  const items: { id: string | null; name: string; member?: Member }[] = [
    { id: null, name: 'Everyone' },
    ...members.map((m) => ({ id: m.id, name: m.id === me?.id ? `${m.display_name} (me)` : m.display_name, member: m })),
  ];
  const ref = useRef<HTMLDivElement>(null);
  const onKey = (e: KeyboardEvent) => {
    const dir = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    const i = items.findIndex((x) => x.id === value);
    onChange(items[(i + dir + items.length) % items.length].id);
    window.requestAnimationFrame(() => ref.current?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus());
  };
  return (
    <div ref={ref} role="radiogroup" aria-label={label} onKeyDown={onKey} className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 pt-1 [scrollbar-width:none]">
      {items.map((x) => {
        const on = x.id === value;
        return (
          <button
            key={x.id ?? 'all'} type="button" role="radio" aria-checked={on} tabIndex={on ? 0 : -1} onClick={() => onChange(x.id)}
            className={cx('flex w-[4.5rem] shrink-0 flex-col items-center gap-1 rounded-2xl px-1 py-1.5 transition', on ? 'bg-accent-soft' : 'hover:bg-surface-2')}
          >
            {x.member
              ? <Avatar member={x.member} size="md" ring={on} name="" />
              : (
                <span
                  className={cx('grid size-11 place-items-center rounded-full bg-surface-2 text-2xl', on && 'ring-[3px] ring-accent ring-offset-[3px] ring-offset-surface')}
                  aria-hidden="true"
                >👪</span>
              )}
            <span className={cx('w-full truncate text-center text-[13px] leading-tight', on ? 'font-bold text-ink' : 'font-semibold text-muted')}>{x.name}</span>
          </button>
        );
      })}
    </div>
  );
}

/** A row of toggle chips (aria-pressed) inside a labelled group. */
export function ChipGroup({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return <div role="group" aria-label={label} className={cx('flex flex-wrap gap-2', className)}>{children}</div>;
}

// ---------------------------------------------------------------- loading, errors, headers
export function SkeletonRows({ rows = 3, big }: { rows?: number; big?: boolean }) {
  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">Loading…</span>
      <div className="overflow-hidden rounded-2xl border border-line/70 bg-surface shadow-sm" aria-hidden="true">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className={cx('flex items-center gap-3 border-line px-3.5 py-3', i > 0 && 'border-t')}>
            <div className={cx('shrink-0 animate-pulse rounded-2xl bg-surface-2', big ? 'size-14' : 'size-11')} />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-3/5 animate-pulse rounded bg-surface-2" />
              <div className="h-3 w-2/5 animate-pulse rounded bg-surface-2" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** "We couldn't load this." + the friendly reason + Try again. */
export function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <Card tone="bad" className="space-y-3" role="alert">
      <div>
        <p className="font-bold">We couldn't load this.</p>
        <p className="text-[15px] text-muted">{message}</p>
      </div>
      <Button variant="secondary" icon="reset" loading={busy} onClick={async () => { setBusy(true); try { await onRetry(); } finally { setBusy(false); } }}>
        Try again
      </Button>
    </Card>
  );
}

export function NotForYou() {
  return (
    <EmptyState
      emoji="🙈" title="That's not for you" message="This task belongs to someone else."
      action={<LinkButton to="/" icon="home">Go home</LinkButton>}
    />
  );
}

export function OfflineNote() {
  return (
    <Card tone="warn" role="status" className="flex items-center gap-2 !py-3 text-[15px] font-semibold">
      <span aria-hidden="true">📡</span>No connection — you can look, but not change things.
    </Card>
  );
}

/** Page title with a Back button that can be intercepted (e.g. "Leave without saving?"). */
export function BackHeader({ title, subtitle, right, onBack, fallback = '/tasks' }: {
  title: ReactNode; subtitle?: ReactNode; right?: ReactNode; onBack?: (go: () => void) => void; fallback?: string;
}) {
  const navigate = useNavigate();
  const go = useCallback(() => {
    if ((window.history.state as { idx?: number } | null)?.idx) navigate(-1);
    else navigate(fallback);
  }, [navigate, fallback]);
  return (
    <header className="flex items-center gap-1 pb-3 pt-2">
      <button
        type="button" onClick={() => (onBack ? onBack(go) : go())} aria-label="Back"
        className="-ml-2 grid size-11 shrink-0 place-items-center rounded-full text-ink hover:bg-surface-2"
      >
        <Icon name="back" size={26} />
      </button>
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-[1.75rem] font-extrabold leading-tight tracking-tight">{title}</h1>
        {subtitle && <p className="truncate text-[15px] text-muted">{subtitle}</p>}
      </div>
      {right && <div className="flex shrink-0 items-center gap-1">{right}</div>}
    </header>
  );
}

/** Small "updating…" spinner for the header while data re-loads silently. */
export function Refreshing({ on }: { on: boolean }) {
  if (!on) return null;
  return <span className="grid size-11 place-items-center text-muted" role="status"><Spinner size={18} /><span className="sr-only">Updating…</span></span>;
}

/**
 * Bottom action bar that sticks above the bottom navigation while scrolling (and covers the floating
 * Spotted button, which would otherwise sit on top of these buttons).
 */
export function StickyBar({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cx(
        'sticky bottom-[calc(env(safe-area-inset-bottom)+4rem)] z-40 -mx-4 mt-6 border-t border-line bg-bg/95 px-4 pb-4 pt-3 backdrop-blur-md',
        className,
      )}
    >
      {children}
    </div>
  );
}

// ---------------------------------------------------------------- photos
/** Signed-URL photo with the spec's rule: on a load error fetch a fresh URL once, then show a placeholder. */
function usePhotoSrc(path: string | null | undefined) {
  const [attempt, setAttempt] = useState(0);
  const [res, setRes] = useState<{ key: string; url: string | null } | null>(null);
  const [broken, setBroken] = useState<string | null>(null);
  const key = `${path ?? ''}|${attempt}`;
  useEffect(() => {
    if (!path) return;
    let alive = true;
    const get = () => backend().photoUrl(path);
    get().catch(() => get()).then(
      (url) => { if (alive) setRes({ key, url }); },
      () => { if (alive) setRes({ key, url: null }); },
    );
    return () => { alive = false; };
  }, [path, key]);
  const cur = res?.key === key ? res : null;
  const failed = !!path && ((cur !== null && cur.url === null) || broken === key);
  const onError = () => { if (attempt === 0) setAttempt(1); else setBroken(key); };
  return { url: cur?.url ?? null, failed, loading: !!path && !cur, onError };
}

/** 4:3 evidence thumbnail; tap opens the full photo. */
export function EvidencePhoto({ path, alt, caption, className }: { path: string; alt: string; caption?: string; className?: string }) {
  const { url, failed, loading, onError } = usePhotoSrc(path);
  const [open, setOpen] = useState(false);
  return (
    <figure className={cx('min-w-0', className)}>
      {failed ? (
        <div className="grid aspect-[4/3] place-items-center rounded-xl bg-surface-2 p-2 text-center text-sm text-muted">
          <span><span aria-hidden="true" className="block text-2xl">🖼️</span>Photo unavailable</span>
        </div>
      ) : loading || !url ? (
        <div className="aspect-[4/3] animate-pulse rounded-xl bg-surface-2" role="img" aria-label={`${alt} (loading)`} />
      ) : (
        <button type="button" onClick={() => setOpen(true)} className="block w-full overflow-hidden rounded-xl bg-surface-2" aria-label={`${alt} — open full size`}>
          <img src={url} alt={alt} onError={onError} className="aspect-[4/3] w-full object-cover" draggable={false} />
        </button>
      )}
      {caption && <figcaption className="mt-1 text-center text-sm font-semibold text-muted">{caption}</figcaption>}
      <Sheet open={open} onClose={() => setOpen(false)} title={alt}>
        {url && <img src={url} alt={alt} onError={onError} className="mx-auto max-h-[70dvh] w-full rounded-2xl object-contain" />}
      </Sheet>
    </figure>
  );
}

/** Before/After thumbnails side by side (or the evidence rule when there are no photos). */
export function EvidencePhotos({ inst, who }: { inst: TaskInstance; who: string }) {
  if (!inst.before_path && !inst.after_path) {
    return (
      <p className="rounded-xl bg-surface-2 px-3 py-2 text-[15px] text-muted">
        {inst.evidence === 'none' ? '👍 No photo needed' : '📷 No photo'}
      </p>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-2">
      {inst.before_path
        ? <EvidencePhoto path={inst.before_path} alt={`Before photo of ${inst.title} by ${who}`} caption="Before" />
        : <NoPhoto caption="Before" />}
      {inst.after_path
        ? <EvidencePhoto path={inst.after_path} alt={`After photo of ${inst.title} by ${who}`} caption="After" />
        : <NoPhoto caption="After" />}
    </div>
  );
}

function NoPhoto({ caption }: { caption: string }) {
  return (
    <figure className="min-w-0">
      <div className="grid aspect-[4/3] place-items-center rounded-xl border-2 border-dashed border-line text-sm text-muted">No photo</div>
      <figcaption className="mt-1 text-center text-sm font-semibold text-muted">{caption}</figcaption>
    </figure>
  );
}

/** Disclosure button + region (aria-expanded / aria-controls). */
export function Disclosure({ title, summary, defaultOpen, children, className }: {
  title: ReactNode; summary?: ReactNode; defaultOpen?: boolean; children: ReactNode; className?: string;
}) {
  const [open, setOpen] = useState(!!defaultOpen);
  const id = useId();
  return (
    <div className={className}>
      <button
        type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}
        className="flex min-h-12 w-full items-center gap-2 text-left"
      >
        <span className="min-w-0 flex-1">
          <span className="block font-bold">{title}</span>
          {summary && <span className="block text-sm text-muted">{summary}</span>}
        </span>
        <Icon name="chevron-down" size={20} className={cx('shrink-0 text-muted transition', open && 'rotate-180')} />
      </button>
      <div id={id} hidden={!open} className="pt-2">{children}</div>
    </div>
  );
}

/** A friendly hint that a list is updated from elsewhere — used for late/partner notes. */
export function Note({ tone = 'warn', emoji, children, big }: { tone?: 'warn' | 'good' | 'accent'; emoji?: string; children: ReactNode; big?: boolean }) {
  return (
    <Card tone={tone} className={cx('flex items-start gap-2 !py-3', big ? 'text-[17px]' : 'text-[15px]')}>
      {emoji && <span aria-hidden="true" className="text-xl leading-6">{emoji}</span>}
      <div className="min-w-0 flex-1">{children}</div>
    </Card>
  );
}
