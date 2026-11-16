// Pure helpers for the Tasks feature: words, amounts, statuses, date windows. No React here.
import { addDays, formatDay, formatTime, isoWeekday, minutes as fmtMinutes, money, points as fmtPoints } from '../../lib/format';
import type { BadgeTone } from '../../components/ui';
import type { Evidence, Member, Repeat, TaskInstance, TimeLabel } from '../../lib/types';
import { isManager } from '../../lib/types';

export const TIME_LABELS: Record<TimeLabel, { emoji: string; label: string; long: string }> = {
  wifi: { emoji: '📶', label: 'Wi-Fi', long: 'Wi-Fi time' },
  game: { emoji: '🎮', label: 'Game', long: 'game time' },
  fun: { emoji: '🎈', label: 'Fun', long: 'fun time' },
};
export const timeLabelOf = (l: TimeLabel | null | undefined) => TIME_LABELS[l ?? 'game'] ?? TIME_LABELS.game;

export const EVIDENCE: Record<Evidence, { emoji: string; label: string; line: string }> = {
  photo: { emoji: '📸', label: 'Photo', line: 'Show it with a photo' },
  photo_or_note: { emoji: '📝', label: 'Photo or note', line: 'A photo or a note' },
  none: { emoji: '👍', label: 'Nothing', line: 'No proof needed' },
};

export const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const DAY_LONG = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** Pictures for chores and challenges (the emoji grid in the form). */
export const TASK_EMOJIS = [
  '🧹', '🧺', '🍽️', '🛏️', '🗑️', '♻️', '🧽', '🧼', '🪥', '🛁', '👕', '🧦',
  '🧸', '🐶', '🐱', '🐕', '🪴', '🌱', '🚗', '🛒', '🍳', '🥦', '🍎', '💧',
  '📚', '✏️', '🎒', '🎹', '🎸', '🎨', '📖', '🧩', '⚽', '🏃', '🚴', '🏊',
  '💤', '⏰', '📵', '🤝', '❤️', '💪', '🎯', '🏆', '🌟', '🎉', '✅', '📦',
];

export const MINUS = '−';

// ---------------------------------------------------------------- amounts
/** One reward/consequence piece: visible chip text, words for screen readers, and prose for sentences. */
export interface Part { key: string; emoji: string; text: string; sr: string; prose: string }

type RewardFields = Pick<TaskInstance, 'reward_cents' | 'reward_minutes' | 'reward_points' | 'reward_text' | 'time_label'>;
type PenaltyFields = Pick<TaskInstance, 'penalty_cents' | 'penalty_minutes' | 'penalty_points' | 'time_label'>;

export function rewardParts(t: RewardFields, currency: string): Part[] {
  const out: Part[] = [];
  if (t.reward_cents > 0) {
    out.push({
      key: 'money', emoji: '💰', text: money(t.reward_cents, currency, { sign: true }),
      sr: `plus ${money(t.reward_cents, currency)}`, prose: money(t.reward_cents, currency, { sign: true, whole: true }),
    });
  }
  if (t.reward_minutes > 0) {
    const l = timeLabelOf(t.time_label);
    out.push({
      key: 'time', emoji: l.emoji, text: `${fmtMinutes(t.reward_minutes, { sign: true })} ${l.label}`,
      sr: `plus ${fmtMinutes(t.reward_minutes)} ${l.long}`, prose: `${fmtMinutes(t.reward_minutes, { sign: true })} ${l.long}`,
    });
  }
  if (t.reward_points > 0) {
    out.push({
      key: 'points', emoji: '✨', text: fmtPoints(t.reward_points, { sign: true }),
      sr: `plus ${t.reward_points} points`, prose: `+${t.reward_points} ${t.reward_points === 1 ? 'point' : 'points'}`,
    });
  }
  if (t.reward_text) {
    out.push({ key: 'text', emoji: '🎁', text: t.reward_text, sr: `reward: ${t.reward_text}`, prose: `“${t.reward_text}”` });
  }
  return out;
}

export function penaltyParts(t: PenaltyFields, currency: string): Part[] {
  const out: Part[] = [];
  if (t.penalty_cents > 0) {
    out.push({
      key: 'money', emoji: '💰', text: money(-t.penalty_cents, currency, { sign: true }),
      sr: `minus ${money(t.penalty_cents, currency)}`, prose: money(-t.penalty_cents, currency, { sign: true, whole: true }),
    });
  }
  if (t.penalty_minutes > 0) {
    const l = timeLabelOf(t.time_label);
    out.push({
      key: 'time', emoji: l.emoji, text: `${fmtMinutes(-t.penalty_minutes)} ${l.label}`,
      sr: `minus ${fmtMinutes(t.penalty_minutes)} ${l.long}`, prose: `${fmtMinutes(-t.penalty_minutes)} ${l.long}`,
    });
  }
  if (t.penalty_points > 0) {
    out.push({
      key: 'points', emoji: '✨', text: fmtPoints(-t.penalty_points),
      sr: `minus ${t.penalty_points} points`, prose: `${MINUS}${t.penalty_points} ${t.penalty_points === 1 ? 'point' : 'points'}`,
    });
  }
  return out;
}

export const hasMoneyOrTimeReward = (t: Pick<TaskInstance, 'reward_cents' | 'reward_minutes'>) => t.reward_cents > 0 || t.reward_minutes > 0;

/** "a", "a and b", "a, b and c". */
export function joinWords(list: string[]): string {
  if (list.length <= 1) return list[0] ?? '';
  return `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`;
}

// ---------------------------------------------------------------- statuses
export type StatusKey = 'todo' | 'try_again' | 'waiting' | 'done' | 'missed' | 'excused' | 'cancelled';
export interface StatusInfo { key: StatusKey; label: string; emoji: string; tone: BadgeTone }

/** Sent back = still open, with a decision note from the person who checked it. */
export const isSentBack = (i: TaskInstance) => i.status === 'open' && !!i.decision_note && !!i.decided_by;

export function statusOf(i: TaskInstance): StatusInfo {
  switch (i.status) {
    case 'open':
      return isSentBack(i)
        ? { key: 'try_again', label: 'Try again', emoji: '🔁', tone: 'warn' }
        : { key: 'todo', label: 'To do', emoji: '📝', tone: 'accent' };
    case 'submitted': return { key: 'waiting', label: 'Waiting for OK', emoji: '⏳', tone: 'warn' };
    case 'approved': return { key: 'done', label: 'Done', emoji: '✅', tone: 'good' };
    case 'missed': return { key: 'missed', label: 'Not done this time', emoji: '⏰', tone: 'warn' };
    case 'excused': return { key: 'excused', label: 'Excused', emoji: '🤝', tone: 'neutral' };
    default: return { key: 'cancelled', label: 'Cancelled', emoji: '✖️', tone: 'neutral' };
  }
}

/** Open and past its due time (the server still accepts it during the grace minutes). */
export const isLate = (i: TaskInstance, nowMs: number) => i.status === 'open' && Date.parse(i.due_at) < nowMs;
export const isActive = (i: TaskInstance) => i.status === 'open' || i.status === 'submitted';
export const isFinished = (i: TaskInstance) => i.status === 'approved' || i.status === 'missed' || i.status === 'excused';

/** Sort: to do → waiting → finished, then by due time. */
export function byUrgency(a: TaskInstance, b: TaskInstance): number {
  const rank = (i: TaskInstance) => (i.status === 'open' ? 0 : i.status === 'submitted' ? 1 : 2);
  return rank(a) - rank(b) || a.due_at.localeCompare(b.due_at) || a.title.localeCompare(b.title);
}
export const byDueDesc = (a: TaskInstance, b: TaskInstance) => b.due_at.localeCompare(a.due_at) || a.title.localeCompare(b.title);
export const byDueAsc = (a: TaskInstance, b: TaskInstance) => a.due_at.localeCompare(b.due_at) || a.title.localeCompare(b.title);

// ---------------------------------------------------------------- dates
/** Sunday of the ISO week that contains `date`. */
export const weekEnd = (date: string) => addDays(date, 7 - isoWeekday(date));

/** "Today", "Tomorrow", "Wed 18 Nov" — lower-cased "today"/"tomorrow"/"yesterday" for use inside a sentence. */
export function dayWord(date: string, tz: string, now: Date, inSentence = false): string {
  const d = formatDay(date, tz, now);
  return inSentence && /^(Today|Tomorrow|Yesterday)$/.test(d) ? d.toLowerCase() : d;
}

/** "by 19:00" today, else "Wed 18 Nov · 19:00". */
export function dueShort(i: TaskInstance, today: string, tz: string, now: Date): string {
  const t = formatTime(i.due_at, tz);
  return i.occurs_on === today ? `by ${t}` : `${dayWord(i.occurs_on, tz, now)} · ${t}`;
}

/** "Due today at 19:00" / "Was due Tue 17 Nov at 17:30". */
export function dueLong(i: TaskInstance, tz: string, now: Date): string {
  const past = Date.parse(i.due_at) < now.getTime();
  const day = dayWord(i.due_at, tz, now, true);
  return `${past ? 'Was due' : 'Due'} ${day} at ${formatTime(i.due_at, tz)}`;
}

/** "12 min ago" for the last 24 h, else "Tue 17 Nov 18:30". */
export function whenText(iso: string, tz: string, now: Date): string {
  const diff = now.getTime() - Date.parse(iso);
  if (diff >= 0 && diff < 86_400_000) {
    const s = Math.round(diff / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.floor(s / 60)} min ago`;
    return `${Math.floor(s / 3600)} h ago`;
  }
  return `${formatDay(iso, tz, now)} ${formatTime(iso, tz)}`;
}

// ---------------------------------------------------------------- repeat
export function repeatText(repeat: Repeat, days: number[], startOn: string, tz: string, now: Date): string {
  switch (repeat) {
    case 'once': return `Once, ${dayWord(startOn, tz, now, true)}`;
    case 'daily': return 'Every day';
    case 'weekdays': return 'Every weekday (Mon–Fri)';
    case 'weekly': return `Every ${DAY_LONG[isoWeekday(startOn) - 1]}`;
    case 'days': return days.length ? `Every ${joinWords([...days].sort((a, b) => a - b).map((d) => DAY_SHORT[d - 1]))}` : 'On chosen days';
  }
}

// ---------------------------------------------------------------- people
/** Who will check a finished task, in words ("Sam" for a kid's own challenge, else "a grown-up"). */
export function checkerWords(i: TaskInstance, membersById: Record<string, Member>, meId: string | undefined): string {
  const creator = membersById[i.created_by];
  if (creator && creator.id !== i.assignee_id && !isManager(creator.role) && !hasMoneyOrTimeReward(i)) {
    return creator.id === meId ? 'you' : creator.display_name;
  }
  const assignee = membersById[i.assignee_id];
  return assignee && isManager(assignee.role) ? 'another grown-up' : 'a grown-up';
}

/** Members sorted kids first, then everyone else (stable). */
export function kidsFirst(members: Member[]): Member[] {
  return [...members].sort((a, b) => Number(b.role === 'kid') - Number(a.role === 'kid'));
}
