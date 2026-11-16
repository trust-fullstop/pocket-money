import { addDays, isoWeekday, minutes, money, plural, points } from '../../lib/format';
import type { EventOccurrence, TaskInstance } from '../../lib/types';
import { zonedTimeToIso } from '../calendar/tz';

export const EVENTS_DAYS = 14;

/** Monday–Sunday of the week that contains `today` (YYYY-MM-DD). */
export function weekRange(today: string): { start: string; end: string } {
  const start = addDays(today, 1 - isoWeekday(today));
  return { start, end: addDays(start, 6) };
}

/** [from, to] ISO window for "coming up": from the start of today (family time) for EVENTS_DAYS days. */
export function eventsWindow(today: string, tz: string): [string, string] {
  return [zonedTimeToIso(today, '00:00', tz), zonedTimeToIso(addDays(today, EVENTS_DAYS), '00:00', tz)];
}

/** Drops timed events that already happened today; all-day items for today stay. */
export function upcomingOnly(list: EventOccurrence[], now: Date): EventOccurrence[] {
  const t = now.getTime();
  return list
    .filter((o) => o.all_day || Date.parse(o.occurs_at) >= t - 5 * 60_000)
    .sort((a, b) => a.occurs_at.localeCompare(b.occurs_at));
}

type Rewardish = Pick<TaskInstance, 'reward_cents' | 'reward_minutes' | 'reward_points'> & { reward_text?: string | null };

/**
 * Only the non-zero parts. Prose: ["€0.50", "10 min", "5 points", "ice cream"].
 * Chips (`signed`): ["+€0.50", "+10 min", "+5 XP", "ice cream"].
 */
export function rewardParts(r: Rewardish, currency: string, opts: { signed?: boolean } = {}): string[] {
  const sign = !!opts.signed;
  const out: string[] = [];
  if (r.reward_cents) out.push(money(r.reward_cents, currency, { sign }));
  if (r.reward_minutes) out.push(minutes(r.reward_minutes, { sign }));
  if (r.reward_points) out.push(sign ? points(r.reward_points, { sign }) : plural(r.reward_points, 'point'));
  if (r.reward_text) out.push(r.reward_text);
  return out;
}

/** Screen-reader wording for a signed chip: "+€0.50" → "plus €0.50". */
export const spokenAmount = (s: string) => s.replace(/^\+/, 'plus ').replace(/^\u2212/, 'minus ');

export function sumRewards(list: TaskInstance[]): { reward_cents: number; reward_minutes: number; reward_points: number } {
  return list.reduce(
    (s, i) => ({
      reward_cents: s.reward_cents + (i.reward_cents || 0),
      reward_minutes: s.reward_minutes + (i.reward_minutes || 0),
      reward_points: s.reward_points + (i.reward_points || 0),
    }),
    { reward_cents: 0, reward_minutes: 0, reward_points: 0 },
  );
}

/** Instances that count for "x of y done" (cancelled / excused ones don't). */
export const countsForProgress = (i: TaskInstance) => i.status !== 'cancelled' && i.status !== 'excused';

export interface DayProgress { done: number; total: number; waiting: number; open: number }

export function progressByMember(list: TaskInstance[]): Record<string, DayProgress> {
  const out: Record<string, DayProgress> = {};
  for (const i of list) {
    if (!countsForProgress(i)) continue;
    const p = (out[i.assignee_id] ??= { done: 0, total: 0, waiting: 0, open: 0 });
    p.total++;
    if (i.status === 'approved') p.done++;
    else if (i.status === 'submitted') p.waiting++;
    else if (i.status === 'open') p.open++;
  }
  return out;
}

const STATUS_ORDER: Record<string, number> = { open: 0, submitted: 1, missed: 2, approved: 3, excused: 4, cancelled: 5 };
export const byStatusThenDue = (a: TaskInstance, b: TaskInstance) =>
  (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9) || a.due_at.localeCompare(b.due_at);
