import { daysBetween, formatDate, formatDay, formatTime, todayISO } from '../../lib/format';
import type { EventInput, EventKind, EventOccurrence, Member } from '../../lib/types';

export type RepeatKind = NonNullable<EventInput['repeat']>;

export const KIND_META: Record<EventKind, { label: string; emoji: string }> = {
  event: { label: 'Event', emoji: '📅' },
  reminder: { label: 'Reminder', emoji: '⏰' },
  birthday: { label: 'Birthday', emoji: '🎂' },
};

export const REPEAT_LABEL: Record<RepeatKind, string> = {
  none: "Doesn't repeat",
  weekly: 'Every week',
  monthly: 'Every month',
  yearly: 'Every year',
};

export const repeatText = (r: string | null | undefined) => REPEAT_LABEL[(r || 'none') as RepeatKind] ?? '';

export const EVENT_EMOJIS = [
  '📅', '⏰', '🎂', '🎉', '🎁', '⚽', '🏊', '🚴', '🎵', '🎨', '📚', '🏫',
  '🩺', '🦷', '💇', '💊', '✈️', '🚗', '🏠', '🍕', '🎬', '🎮', '🛒', '🐶',
  '🧹', '🗑️', '🌳', '⛪', '👵', '🎄',
];

/** for_members = [] means everyone. */
export const isForMember = (o: Pick<EventOccurrence, 'for_members'>, memberId: string) =>
  o.for_members.length === 0 || o.for_members.includes(memberId);

/** "18:30" or "All day". */
export const eventTime = (o: Pick<EventOccurrence, 'all_day' | 'occurs_at'>, tz: string) =>
  o.all_day ? 'All day' : formatTime(o.occurs_at, tz);

/** "Tomorrow 18:30", "Wed 18 Nov · All day". */
export function eventWhen(o: Pick<EventOccurrence, 'all_day' | 'occurs_at'>, tz: string, now: Date): string {
  const day = formatDay(o.occurs_at, tz, now);
  return o.all_day ? `${day} · All day` : `${day} ${formatTime(o.occurs_at, tz)}`;
}

/** Agenda day header: "Today · Mon 16 Nov", "Tomorrow · Tue 17 Nov", "Wed 18 Nov". */
export function dayHeading(date: string, tz: string, now: Date): string {
  const diff = daysBetween(todayISO(tz, now), date);
  const label = formatDate(date, { long: false });
  if (diff === 0) return `Today · ${label}`;
  if (diff === 1) return `Tomorrow · ${label}`;
  if (diff === -1) return `Yesterday · ${label}`;
  return label;
}

/** "Everyone" or "Sam, Mia and Dad". */
export function forWhomText(ids: string[], membersById: Record<string, Member>): string {
  if (ids.length === 0) return 'Everyone';
  const names = ids.map((id) => membersById[id]?.display_name ?? 'Someone');
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** Default start for a new item: the next whole hour (in family time). */
export function nextWholeHour(tz: string, now: Date): { date: string; time: string } {
  const next = new Date(now.getTime() + 60 * 60_000);
  const date = todayISO(tz, next);
  const hour = formatTime(next.toISOString(), tz).slice(0, 2);
  return { date, time: `${hour}:00` };
}
