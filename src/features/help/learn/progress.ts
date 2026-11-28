// Money school progress: ONE model for Home (MoneySchoolCard), Help, Money school (LearnHome, LessonPage) and the
// parents' "What the kids learned". Per tracked lesson: planned (core lessons always; a theme lesson when its theme is
// in the family's lesson_plan), openOn (the family-local day it opens — the client mirror of app.lesson_open_on), open
// (for everyone: core always, theme lessons from openOn on; managers may preview earlier) and done (finished by this
// person). Light on purpose (no lesson texts).
import type { FeatureKey, LessonDone } from '../../../lib/types';
import { READY_THEMES, addDays, lessonOpenOn, themeMonth, themeOf, themeVisible, type LessonPlan, type Theme } from './bank';
import { CORE_LESSONS, type LessonInfo } from './catalog';

export interface LessonStatus {
  lesson: LessonInfo;
  /** The lesson's theme; null = a core lesson. */
  theme: Theme | null;
  tracked: true;
  /** Core: always. Theme lesson: its theme is in the lesson plan. */
  planned: boolean;
  /** Theme lessons: the family-local day (YYYY-MM-DD) it opens; null for core lessons and unplanned themes. */
  openOn: string | null;
  /** Open for everyone today (once open, it stays open). */
  open: boolean;
  done: boolean;
  /** A theme lesson that opened in the last 7 days. */
  fresh: boolean;
}

export interface GroupProgress {
  lessons: LessonStatus[];
  /** Lessons done. */
  count: number;
  total: number;
  /** Lessons open today. */
  openCount: number;
  /** The first open lesson not done yet. */
  next: LessonStatus | null;
  /** The next lesson still to open (earliest openOn after today). */
  nextOpening: LessonStatus | null;
}

export interface ThemeProgress extends GroupProgress {
  theme: Theme;
  /** The planned month, "YYYY-MM". */
  month: string;
  /** The planned month is this month or earlier: it has started (and can't be removed from the plan any more). */
  started: boolean;
}

/** Home's "Up next": an open lesson to do; else the next one to open; else all done. */
export type UpNext =
  | { kind: 'lesson'; lesson: LessonStatus }
  | { kind: 'soon'; lesson: LessonStatus }
  | { kind: 'done' };

export interface MoneySchool {
  /** Family-local today; null before the family loads. */
  today: string | null;
  /** "YYYY-MM" of today. */
  thisMonth: string | null;
  plan: LessonPlan;
  core: GroupProgress;
  /** Planned themes this family can see: this month's first, then earlier months (newest first), then later months. */
  themes: ThemeProgress[];
  upNext: UpNext;
  /** The first open theme lesson to do that opened in the last 7 days ("New this week"), if any. */
  fresh: LessonStatus | null;
  /** The status of any tracked lesson (also unplanned theme lessons); undefined for untracked ids. */
  status: (lessonId: string) => LessonStatus | undefined;
}

export interface ProgressInput {
  on: (k: FeatureKey) => boolean;
  /** Finished lessons (managers get the whole family). */
  rows: LessonDone[] | undefined;
  memberId: string | undefined;
  plan: LessonPlan;
  today: string | null | undefined;
}

const visible = (l: Pick<LessonInfo, 'needs'>, on: (k: FeatureKey) => boolean) => (l.needs ?? []).every(on);

/** One tracked lesson's status (core or theme lesson). */
export function lessonStatus(lesson: LessonInfo, plan: LessonPlan, today: string | null | undefined, done: boolean): LessonStatus {
  const theme = themeOf(lesson.id) ?? null;
  if (!theme) return { lesson, theme: null, tracked: true, planned: true, openOn: null, open: true, done, fresh: false };
  const openOn = lessonOpenOn(plan, lesson.id);
  const open = !!today && openOn !== null && openOn <= today;
  return {
    lesson, theme, tracked: true, planned: openOn !== null, openOn, open, done,
    fresh: open && !!today && openOn !== null && openOn > addDays(today, -7),
  };
}

function group(lessons: LessonStatus[]): GroupProgress {
  let nextOpening: LessonStatus | null = null;
  for (const s of lessons) {
    if (!s.open && s.openOn !== null && (nextOpening === null || s.openOn < (nextOpening.openOn as string))) nextOpening = s;
  }
  return {
    lessons,
    count: lessons.filter((s) => s.done).length,
    total: lessons.length,
    openCount: lessons.filter((s) => s.open).length,
    next: lessons.find((s) => s.open && !s.done) ?? null,
    nextOpening,
  };
}

const byOpenOn = (a: LessonStatus, b: LessonStatus) => ((a.openOn ?? '') < (b.openOn ?? '') ? -1 : (a.openOn ?? '') > (b.openOn ?? '') ? 1 : 0);

/** One person's Money school: core lessons, the planned themes, and what's up next. */
export function moneySchool({ on, rows, memberId, plan, today }: ProgressInput): MoneySchool {
  const doneIds = new Set((rows ?? []).filter((r) => r.member_id === memberId).map((r) => r.lesson));
  const thisMonth = today ? today.slice(0, 7) : null;
  const statusOf = (l: LessonInfo) => lessonStatus(l, plan, today, doneIds.has(l.id));

  const core = group(CORE_LESSONS.filter((l) => visible(l, on)).map(statusOf));

  const order = (month: string) => (thisMonth === null || month > thisMonth ? 2 : month === thisMonth ? 0 : 1);
  const themes: ThemeProgress[] = READY_THEMES
    .filter((t) => themeVisible(t, on))
    .flatMap((theme) => {
      const month = themeMonth(plan, theme.id);
      if (!month) return [];
      const lessons = theme.lessons.map((l) => statusOf({ ...l, ...(theme.needs ? { needs: theme.needs } : {}) }));
      return [{ ...group(lessons), theme, month, started: thisMonth !== null && month <= thisMonth }];
    })
    .sort((a, b) => {
      const oa = order(a.month), ob = order(b.month);
      if (oa !== ob) return oa - ob;
      if (a.month === b.month) return (plan[a.month] ?? []).indexOf(a.theme.id) - (plan[b.month] ?? []).indexOf(b.theme.id);
      return oa === 1 ? (a.month < b.month ? 1 : -1) : (a.month < b.month ? -1 : 1);
    });

  // Earliest-opened first (ties: by month, then the plan's order, then lesson order).
  const themeLessons = [...themes]
    .sort((a, b) => (a.month === b.month ? (plan[a.month] ?? []).indexOf(a.theme.id) - (plan[b.month] ?? []).indexOf(b.theme.id) : a.month < b.month ? -1 : 1))
    .flatMap((t) => t.lessons)
    .sort(byOpenOn);
  const todo = themeLessons.find((s) => s.open && !s.done) ?? null;
  const later = themeLessons.find((s) => !s.open && s.openOn !== null) ?? null;
  const upNext: UpNext = core.next ? { kind: 'lesson', lesson: core.next }
    : todo ? { kind: 'lesson', lesson: todo }
    : later ? { kind: 'soon', lesson: later }
    : { kind: 'done' };

  const fresh = themeLessons.find((s) => s.fresh && !s.done) ?? null;

  const status = (lessonId: string): LessonStatus | undefined => {
    const coreLesson = CORE_LESSONS.find((l) => l.id === lessonId);
    if (coreLesson) return statusOf(coreLesson);
    const theme = themeOf(lessonId);
    const info = theme?.lessons.find((l) => l.id === lessonId);
    return theme && info ? statusOf({ ...info, ...(theme.needs ? { needs: theme.needs } : {}) }) : undefined;
  };

  return { today: today ?? null, thisMonth, plan, core, themes, upNext, fresh, status };
}

/** The family's Lesson plan (to plan a theme) for managers. */
export const LESSON_PLAN_PATH = '/help/learn/plan';

/**
 * Who may open a lesson today: 'open' for everyone (core lessons; theme lessons from their opening day); before that,
 * 'preview' for managers and 'locked' for kids and relatives. `openOn` null = its theme isn't planned.
 */
export type LessonGate =
  | { gate: 'open'; theme: Theme | null; openOn: string | null }
  | { gate: 'preview' | 'locked'; theme: Theme; openOn: string | null };

export function lessonGate(lessonId: string, plan: LessonPlan, today: string | null | undefined, isManager: boolean): LessonGate {
  const theme = themeOf(lessonId);
  if (!theme) return { gate: 'open', theme: null, openOn: null };
  const openOn = lessonOpenOn(plan, lessonId);
  if (today && openOn !== null && openOn <= today) return { gate: 'open', theme, openOn };
  return { gate: isManager ? 'preview' : 'locked', theme, openOn };
}
