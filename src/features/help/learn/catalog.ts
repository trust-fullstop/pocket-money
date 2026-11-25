// Tracked Money school lessons (titles match the server's app.lessons()): the six core lessons, plus the lesson series
// from ./series. Small on purpose: Home and Help import this for progress without loading the lesson texts.
import type { FeatureKey, LessonDone } from '../../../lib/types';
import { SERIES, SERIES_LESSONS, seriesOpen, type LessonSeries } from './series';
import type { CoreLessonId, TrackedLessonId } from './types';

/** What a list, a progress bar or Home needs to know about a tracked lesson. */
export interface LessonInfo {
  id: TrackedLessonId;
  emoji: string;
  title: string;
  summary: string;
  minutes: number;
  needs?: FeatureKey[];
}

export interface CoreLessonInfo extends LessonInfo { id: CoreLessonId }

export const CORE_LESSONS: CoreLessonInfo[] = [
  { id: 'purpose', emoji: '🧭', title: 'Why this app?', summary: 'Cause and effect, teamwork and rewards', minutes: 3 },
  { id: 'earn', emoji: '💪', title: 'How to earn more', summary: 'Do it well, do it on time, and earn trust', minutes: 3 },
  { id: 'why-save', emoji: '🐷', title: 'Why save?', summary: 'Needs and wants, surprises, and the superpower of waiting', minutes: 3 },
  { id: 'how-save', emoji: '💰', title: 'How to save', summary: 'Pay yourself first, jars and the 24-hour rule', minutes: 3 },
  { id: 'interest', emoji: '🌱', title: 'How interest works', summary: 'Money that grows, and money that costs', minutes: 3 },
  { id: 'goals', emoji: '🎯', title: 'Saving for a goal', summary: 'Pick it, price it, plan it, keep going', minutes: 3 },
];

export const CORE_BY_ID = Object.fromEntries(CORE_LESSONS.map((l) => [l.id, l])) as Record<CoreLessonId, CoreLessonInfo>;

/** Every tracked lesson (core, then each series) — the server whitelist. */
export const TRACKED_LESSONS: LessonInfo[] = [...CORE_LESSONS, ...SERIES_LESSONS];

export interface TrackedProgress<T extends LessonInfo = LessonInfo> {
  /** Lessons this family can see (their `needs` are on). */
  list: T[];
  done: Set<string>;
  count: number;
  total: number;
  /** First lesson not done yet (null = all done). */
  next: T | null;
}

export type CoreProgress = TrackedProgress<CoreLessonInfo>;

export interface SeriesProgress extends TrackedProgress {
  series: LessonSeries;
  /** Open for everyone today (managers can preview earlier). */
  open: boolean;
}

function progressOf<T extends LessonInfo>(
  lessons: T[], on: (k: FeatureKey) => boolean, rows: LessonDone[] | undefined, memberId: string | undefined,
): TrackedProgress<T> {
  const list = lessons.filter((l) => (l.needs ?? []).every(on));
  const done = new Set((rows ?? []).filter((r) => r.member_id === memberId).map((r) => r.lesson));
  const count = list.filter((l) => done.has(l.id)).length;
  return { list, done, count, total: list.length, next: list.find((l) => !done.has(l.id)) ?? null };
}

/** One person's progress through the core lessons. */
export function coreProgress(on: (k: FeatureKey) => boolean, rows: LessonDone[] | undefined, memberId: string | undefined): CoreProgress {
  return progressOf(CORE_LESSONS, on, rows, memberId);
}

/** One person's progress through each lesson series this family can see; `today` = the family-local date. */
export function seriesProgress(
  on: (k: FeatureKey) => boolean, rows: LessonDone[] | undefined, memberId: string | undefined, today: string | null | undefined,
): SeriesProgress[] {
  return SERIES
    .map((series) => ({ ...progressOf<LessonInfo>(series.lessons, on, rows, memberId), series, open: seriesOpen(series, today) }))
    .filter((p) => p.total > 0);
}
