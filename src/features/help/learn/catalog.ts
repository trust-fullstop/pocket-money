// The six core Money school lessons (titles match the server's app.lessons()). Small on purpose: Home and Help
// import this for progress without loading the lesson texts.
import type { FeatureKey, LessonDone } from '../../../lib/types';
import type { CoreLessonId } from './types';

export interface CoreLessonInfo {
  id: CoreLessonId;
  emoji: string;
  title: string;
  summary: string;
  minutes: number;
  needs?: FeatureKey[];
}

export const CORE_LESSONS: CoreLessonInfo[] = [
  { id: 'purpose', emoji: '🧭', title: 'Why this app?', summary: 'Cause and effect, teamwork and rewards', minutes: 3 },
  { id: 'earn', emoji: '💪', title: 'How to earn more', summary: 'Do it well, do it on time, and earn trust', minutes: 3 },
  { id: 'why-save', emoji: '🐷', title: 'Why save?', summary: 'Needs and wants, surprises, and the superpower of waiting', minutes: 3 },
  { id: 'how-save', emoji: '💰', title: 'How to save', summary: 'Pay yourself first, jars and the 24-hour rule', minutes: 3 },
  { id: 'interest', emoji: '🌱', title: 'How interest works', summary: 'Money that grows, and money that costs', minutes: 3 },
  { id: 'goals', emoji: '🎯', title: 'Saving for a goal', summary: 'Pick it, price it, plan it, keep going', minutes: 3 },
];

export const CORE_BY_ID = Object.fromEntries(CORE_LESSONS.map((l) => [l.id, l])) as Record<CoreLessonId, CoreLessonInfo>;

export interface CoreProgress {
  /** Core lessons this family can see (their `needs` are on). */
  list: CoreLessonInfo[];
  done: Set<string>;
  count: number;
  total: number;
  /** First lesson not done yet (null = all done). */
  next: CoreLessonInfo | null;
}

/** One person's progress through the core lessons. */
export function coreProgress(on: (k: FeatureKey) => boolean, rows: LessonDone[] | undefined, memberId: string | undefined): CoreProgress {
  const list = CORE_LESSONS.filter((l) => (l.needs ?? []).every(on));
  const done = new Set((rows ?? []).filter((r) => r.member_id === memberId).map((r) => r.lesson));
  const count = list.filter((l) => done.has(l.id)).length;
  return { list, done, count, total: list.length, next: list.find((l) => !done.has(l.id)) ?? null };
}
