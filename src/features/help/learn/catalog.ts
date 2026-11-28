// Tracked Money school lessons (titles match the server's app.lessons()): the six core lessons, plus the lessons of the
// lesson bank's themes (./bank). Small on purpose: Home and Help import this for progress without loading the lesson
// texts. Progress (planned, open, done) lives in ./progress.
import type { FeatureKey } from '../../../lib/types';
import { THEME_LESSONS, themeOf } from './bank';
import type { CoreLessonId, TrackedLessonId } from './types';

/** What a list, a progress bar or Home needs to know about a tracked lesson. */
export interface LessonInfo {
  id: TrackedLessonId;
  emoji: string;
  title: string;
  summary: string;
  minutes: number;
  /** Switches it needs (a theme lesson: its theme's, e.g. faith). */
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

/** Every tracked lesson (core, then each ready theme of the lesson bank) — the server whitelist. */
export const TRACKED_LESSONS: LessonInfo[] = [
  ...CORE_LESSONS,
  ...THEME_LESSONS.map((l): LessonInfo => {
    const needs = themeOf(l.id)?.needs;
    return needs ? { ...l, needs } : { ...l };
  }),
];
