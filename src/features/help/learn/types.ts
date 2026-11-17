// Money school contract: lesson shapes shared by the lesson screens (help/learn), the faith reflections
// (features/faith) and the server whitelist (migration 20261116001700: app.lessons()).
import type { FamilySettings, FeatureKey } from '../../../lib/types';

/** Core lessons — tracked on the server (finish_lesson), +5 XP once for kids when points are on. Keep in sync with app.lessons(). */
export const CORE_LESSON_IDS = ['purpose', 'earn', 'why-save', 'how-save', 'interest', 'goals'] as const;
export type CoreLessonId = (typeof CORE_LESSON_IDS)[number];
/** Faith reflections — feature 'faith'. Not scored, not tracked, no XP (faith is invited, never tested). */
export const FAITH_LESSON_IDS = ['faith-stewardship', 'faith-giving', 'faith-tithing', 'faith-family', 'faith-churches', 'faith-world'] as const;
export type FaithLessonId = (typeof FAITH_LESSON_IDS)[number];
export type LessonId = CoreLessonId | FaithLessonId;

/** XP a kid gets the first time they finish a core lesson (server: same number). */
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
  | { kind: 'widget'; widget: 'interest' | 'jars' | 'goal' | 'needs-wants' }
  /** Something to think or talk about — nothing is stored or checked. */
  | { kind: 'reflect'; prompt: string };

export interface Step { title: string; emoji?: string; blocks: Block[] }

/** One quiz question: `answer` = index of the right option, `why` = shown after answering. */
export interface QuizQuestion { q: string; options: string[]; answer: number; why: string }

export interface Lesson {
  id: LessonId;
  kind: 'core' | 'faith';
  emoji: string;
  title: string;
  /** One line under the title in the list. */
  summary: string;
  minutes: number;
  /** Only shown when all of these are on (besides 'learn', and 'faith' for faith lessons). */
  needs?: FeatureKey[];
  steps: (ctx: LessonCtx) => Step[];
  /** Core lessons: 2–3 questions, all must be right to finish (retry allowed). Faith reflections: none. */
  quiz?: (ctx: LessonCtx) => QuizQuestion[];
}
