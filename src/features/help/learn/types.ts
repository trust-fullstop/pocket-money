// Money school contract: lesson shapes shared by the lesson screens (help/learn), the faith reflections
// (features/faith) and the server whitelist (app.lessons() / app.lesson_opens(), latest in migration 20261116002400).
import type { FamilySettings, FeatureKey } from '../../../lib/types';

/** Core lessons — the basics, always open. */
export const CORE_LESSON_IDS = ['purpose', 'earn', 'why-save', 'how-save', 'interest', 'goals'] as const;
export type CoreLessonId = (typeof CORE_LESSON_IDS)[number];
/** Lesson series — themed sets that open on a date (./series.ts; server: app.lesson_opens()). */
export const SERIES_LESSON_IDS = [
  'loans-how', 'loans-repay', 'insurance-what', 'insurance-people', 'insurance-home-car', 'insurance-stuff',
] as const;
export type SeriesLessonId = (typeof SERIES_LESSON_IDS)[number];
/**
 * Tracked lessons (core + series): a quiz that must be all right, finished on the server (finish_lesson), +5 XP once for
 * kids when points are on. Keep in sync with app.lessons() (latest: migration 20261116002400).
 */
export const TRACKED_LESSON_IDS = [...CORE_LESSON_IDS, ...SERIES_LESSON_IDS] as const;
export type TrackedLessonId = CoreLessonId | SeriesLessonId;
/** Faith reflections — feature 'faith'. Not scored, not tracked, no XP (faith is invited, never tested). */
export const FAITH_LESSON_IDS = ['faith-stewardship', 'faith-giving', 'faith-tithing', 'faith-family', 'faith-churches', 'faith-world'] as const;
export type FaithLessonId = (typeof FAITH_LESSON_IDS)[number];
export type LessonId = TrackedLessonId | FaithLessonId;

export type LessonKind = 'core' | 'series' | 'faith';
/** Core and series lessons are tracked (quiz + server); faith reflections are not. */
export const isTracked = (kind: LessonKind): boolean => kind === 'core' || kind === 'series';

/** XP a kid gets the first time they finish a tracked lesson (server: same number). */
export const LESSON_XP = 5;

/** Everything a lesson may use to talk in the family's own numbers. */
export interface LessonCtx {
  /** Format cents in the family currency, whole units when round: m(2000) → "R 20". */
  m: (cents: number) => string;
  currency: string;
  /** Second currency shown next to money (e.g. 'EUR'), or null. */
  second: string | null;
  /** Feature switch on (dependencies respected). */
  on: (key: FeatureKey) => boolean;
  settings: Partial<FamilySettings>;
  /** The reader is a kid. */
  isKid: boolean;
  /** Reader's first name. */
  name: string;
  /** Reader's pocket money per period in cents (0 = none / not visible) and the period. */
  allowanceCents: number;
  allowancePeriod: 'week' | 'month' | null;
}

export type Block =
  /** A paragraph. `**bold**` is allowed. */
  | { kind: 'text'; text: string }
  /** A highlighted example with numbers. */
  | { kind: 'example'; text: string }
  /** A short list of points. */
  | { kind: 'list'; items: string[] }
  /** A Bible verse from src/features/faith/verses.ts (only rendered when 'faith' is on and the reader shows verses). */
  | { kind: 'verse'; id: string; note?: string }
  /** An interactive piece (see help/learn/widgets). */
  | { kind: 'widget'; widget: 'interest' | 'jars' | 'goal' | 'needs-wants' | 'loan' }
  /** Something to think or talk about — nothing is stored or checked. */
  | { kind: 'reflect'; prompt: string };

export interface Step { title: string; emoji?: string; blocks: Block[] }

/** One quiz question: `answer` = index of the right option, `why` = shown after answering. */
export interface QuizQuestion { q: string; options: string[]; answer: number; why: string }

export interface Lesson {
  id: LessonId;
  kind: LessonKind;
  emoji: string;
  title: string;
  /** One line under the title in the list. */
  summary: string;
  minutes: number;
  /** Only shown when all of these are on (besides 'learn', and 'faith' for faith lessons). */
  needs?: FeatureKey[];
  steps: (ctx: LessonCtx) => Step[];
  /** Tracked lessons: 2–3 questions, all must be right to finish (retry allowed). Faith reflections: none. */
  quiz?: (ctx: LessonCtx) => QuizQuestion[];
}
