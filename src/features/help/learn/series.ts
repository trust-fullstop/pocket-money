// Money school lesson series: themed sets of tracked lessons that open on a date. Light on purpose (no lesson texts),
// so Home can show what's new. Titles and dates match the server (app.lessons() / app.lesson_opens()).
// "Listed" is not "openable": before `opensOn` (family-local date) kids and relatives see a locked teaser; managers can
// preview. From `opensOn` the series is open for everyone, and it stays open.
import type { FeatureKey } from '../../../lib/types';
import type { SeriesLessonId } from './types';

export interface SeriesLessonInfo {
  id: SeriesLessonId;
  emoji: string;
  title: string;
  summary: string;
  minutes: number;
  needs?: FeatureKey[];
}

export interface LessonSeries {
  id: string;
  emoji: string;
  title: string;
  summary: string;
  /** First family-local day (YYYY-MM-DD) kids and relatives can open the lessons. */
  opensOn: string;
  lessons: SeriesLessonInfo[];
}

export const SERIES: LessonSeries[] = [
  {
    id: 'borrow-protect',
    emoji: '🛡️',
    title: 'December: Borrowing and insurance',
    summary: 'How loans work, and how insurance protects you',
    opensOn: '2026-12-01',
    lessons: [
      { id: 'loans-how', emoji: '🤝', title: 'How loans work', summary: 'Borrow now, pay back later', minutes: 4 },
      { id: 'loans-repay', emoji: '📅', title: 'Paying a loan back', summary: 'Instalments, total cost and keeping your word', minutes: 4 },
      { id: 'insurance-what', emoji: '☂️', title: 'What is insurance?', summary: 'Sharing the risk so one bad day doesn’t sink you', minutes: 4 },
      { id: 'insurance-people', emoji: '❤️', title: 'Insurance for people', summary: 'Life, funeral, health and income', minutes: 3 },
      { id: 'insurance-home-car', emoji: '🏠', title: 'Home and car insurance', summary: 'Buildings, contents and cars', minutes: 4 },
      { id: 'insurance-stuff', emoji: '📱', title: 'Phones, valuables and boats', summary: 'Gadgets, all-risk, pleasure craft and choosing wisely', minutes: 4 },
    ],
  },
];

export const SERIES_LESSONS: SeriesLessonInfo[] = SERIES.flatMap((s) => s.lessons);
export const SERIES_LESSON_BY_ID = Object.fromEntries(SERIES_LESSONS.map((l) => [l.id, l])) as Record<SeriesLessonId, SeriesLessonInfo>;
const SERIES_BY_LESSON: Record<string, LessonSeries> = Object.fromEntries(SERIES.flatMap((s) => s.lessons.map((l) => [l.id, s])));

/** The series a lesson belongs to (undefined for core lessons and faith reflections). */
export function seriesOf(lessonId: string): LessonSeries | undefined {
  return SERIES_BY_LESSON[lessonId];
}

/** Open on this family-local day (YYYY-MM-DD)? Unknown day = not open yet. */
export function seriesOpen(series: Pick<LessonSeries, 'opensOn'>, today: string | null | undefined): boolean {
  return !!today && today >= series.opensOn;
}

/** 'open' for everyone; 'preview' = not open yet but a manager may look; 'locked' = not open yet for this reader. */
export type LessonGate = 'open' | 'preview' | 'locked';

export function lessonGate(lessonId: string, today: string | null | undefined, isManager: boolean): LessonGate {
  const s = seriesOf(lessonId);
  if (!s || seriesOpen(s, today)) return 'open';
  return isManager ? 'preview' : 'locked';
}

const dateFmt = (opts: Intl.DateTimeFormatOptions) => (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', ...opts }).format(new Date(Date.UTC(y, m - 1, d, 12)));
};

/** "1 December" */
export const opensLabel = dateFmt({ day: 'numeric', month: 'long' });
/** "December" */
export const monthLabel = dateFmt({ month: 'long' });
