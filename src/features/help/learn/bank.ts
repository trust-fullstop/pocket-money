// Money school lesson bank: themes of tracked lessons that the parents plan per month (family setting lesson_plan,
// { "YYYY-MM": [themeId, …] }). Light on purpose (no lesson texts), so Home and Help can show what's open. Ids, order,
// kind, release, needs and titles match the server (app.lesson_themes() / app.lessons(), migration
// 20261116002700_lesson_bank.sql); tests/lesson_bank.test.ts checks.
// Opening (family-local days): a theme planned for month M opens all its lessons on M-01 (release 'all'), or one a week
// (release 'weekly': lesson i on M-01 + 7·i). Once open, a lesson stays open. Kids and relatives only see planned themes;
// managers can preview any ready theme. A theme can be planned for one month only.
import type { FeatureKey } from '../../../lib/types';
import type { ThemeLessonId } from './types';

export interface ThemeLessonInfo {
  id: ThemeLessonId;
  emoji: string;
  title: string;
  summary: string;
  minutes: number;
}

export type ThemeKind = 'money' | 'faith';
/** 'weekly': one lesson a week from the 1st of the planned month; 'all': every lesson on the 1st. */
export type ThemeRelease = 'weekly' | 'all';

export interface Theme {
  id: string;
  emoji: string;
  title: string;
  summary: string;
  kind: ThemeKind;
  /** Only for families with these switched on (faith themes: ['faith']), also for managers. */
  needs?: FeatureKey[];
  release: ThemeRelease;
  /** Months (1–12) the theme fits best: a hint for the parents. */
  suggestedMonths: number[];
  /** 'soon' = listed for the parents, not plannable yet (no lessons). */
  status: 'ready' | 'soon';
  lessons: ThemeLessonInfo[];
}

/** Most lessons a weekly theme may have (one a week, all within about a month). */
export const MAX_WEEKLY_LESSONS = 5;
/** Most themes in one month. */
export const MAX_THEMES_A_MONTH = 3;

const soon = (id: string, emoji: string, title: string, summary: string, suggestedMonths: number[] = [], kind: ThemeKind = 'money'): Theme => ({
  id, emoji, title, summary, kind, ...(kind === 'faith' ? { needs: ['faith'] as FeatureKey[] } : {}),
  release: 'weekly', suggestedMonths, status: 'soon', lessons: [],
});

export const THEMES: Theme[] = [
  {
    id: 'borrow-protect',
    emoji: '🛡️',
    title: 'Borrowing and insurance',
    summary: 'How loans work, and how insurance protects you',
    kind: 'money',
    release: 'all',
    suggestedMonths: [12],
    status: 'ready',
    lessons: [
      { id: 'loans-how', emoji: '🤝', title: 'How loans work', summary: 'Borrow now, pay back later', minutes: 4 },
      { id: 'loans-repay', emoji: '📅', title: 'Paying a loan back', summary: 'Instalments, total cost and keeping your word', minutes: 4 },
      { id: 'insurance-what', emoji: '☂️', title: 'What is insurance?', summary: 'Sharing the risk so one bad day doesn’t sink you', minutes: 4 },
      { id: 'insurance-people', emoji: '❤️', title: 'Insurance for people', summary: 'Life, funeral, health and income', minutes: 3 },
      { id: 'insurance-home-car', emoji: '🏠', title: 'Home and car insurance', summary: 'Buildings, contents and cars', minutes: 4 },
      { id: 'insurance-stuff', emoji: '📱', title: 'Phones, valuables and boats', summary: 'Gadgets, all-risk, pleasure craft and choosing wisely', minutes: 4 },
    ],
  },
  {
    id: 'christmas',
    emoji: '🎄',
    title: 'Christmas: why we celebrate',
    summary: 'Advent, a generous Christmas, the birth of Jesus, the wise men and a thankful heart',
    kind: 'faith',
    needs: ['faith'],
    release: 'weekly',
    suggestedMonths: [12],
    status: 'ready',
    lessons: [
      // Weekly from the 1st: Advent; the budget before the shopping; the story; the gifts; thanks to end the year.
      { id: 'xmas-advent', emoji: '🕯️', title: 'Advent: waiting and getting ready', summary: 'Why Christians count down to Christmas', minutes: 4 },
      { id: 'xmas-generous', emoji: '🎁', title: 'A generous Christmas on a budget', summary: 'Gifts that don’t cost the earth, and giving to others', minutes: 4 },
      { id: 'xmas-birth', emoji: '👶', title: 'The birth of Jesus', summary: 'The Christmas story from Luke and Matthew', minutes: 4 },
      { id: 'xmas-wise-men', emoji: '⭐', title: 'The wise men and their gifts', summary: 'Why we give presents at Christmas', minutes: 4 },
      { id: 'xmas-thanks', emoji: '🙏', title: 'Thanks and giving: what is Thanksgiving?', summary: 'Harvest festivals, Thanksgiving and a thankful heart', minutes: 4 },
    ],
  },
  soon('fresh-start', '🌅', 'A fresh start: goals and budgets', 'Looking back, setting goals and a simple budget', [1]),
  soon('stay-safe', '🔒', 'Staying safe with money online', 'Scams, passwords, in-game buys and shopping online', [2]),
  soon('easter', '✝️', 'Easter: hope and new life', 'Palm Sunday to the empty tomb, and living with hope', [3, 4], 'faith'),
  soon('banks-cards', '🏦', 'Banks and cards', 'Accounts, debit and credit cards, and fees'),
  soon('smart-shopping', '🛒', 'Shopping smart and adverts', 'Comparing prices and seeing through adverts'),
  soon('investing', '📈', 'Investing basics', 'Shares, funds and patience'),
  soon('taxes', '🧾', 'Taxes and what they pay for', 'Roads, schools and hospitals: where tax goes'),
  soon('mini-business', '🍋', 'Start a mini business', 'An idea, costs, prices and profit'),
  soon('back-to-school', '🎒', 'Back to school costs', 'Planning for uniforms, books and stationery', [1, 9]),
  soon('travel-money', '✈️', 'Holiday and travel money', 'Holiday budgets and exchange rates', [6, 7]),
  soon('gratitude', '🦃', 'Gratitude and Thanksgiving', 'A thankful heart, all year round', [11], 'faith'),
  soon('generosity', '💝', 'Generosity and giving', 'Sharing what we have, and why it matters'),
  soon('first-job', '💼', 'Work and your first job', 'Earning, payslips and doing a job well'),
];

/** Themes the parents can plan (with lessons). */
export const READY_THEMES: Theme[] = THEMES.filter((t) => t.status === 'ready');
export const THEME_BY_ID: Record<string, Theme> = Object.fromEntries(THEMES.map((t) => [t.id, t]));
/** Every lesson of the ready themes, theme by theme in lesson order. */
export const THEME_LESSONS: ThemeLessonInfo[] = READY_THEMES.flatMap((t) => t.lessons);
export const THEME_LESSON_BY_ID = Object.fromEntries(THEME_LESSONS.map((l) => [l.id, l])) as Record<ThemeLessonId, ThemeLessonInfo>;
const THEME_BY_LESSON: Record<string, Theme> = Object.fromEntries(READY_THEMES.flatMap((t) => t.lessons.map((l) => [l.id, t])));

/** The (ready) theme a lesson belongs to; undefined for core lessons and faith reflections. */
export function themeOf(lessonId: string): Theme | undefined {
  return THEME_BY_LESSON[lessonId];
}

/** The theme's switches are on (faith themes need 'faith'). */
export const themeVisible = (t: Pick<Theme, 'needs'>, on: (k: FeatureKey) => boolean): boolean => (t.needs ?? []).every(on);

/** "5 lessons, one a week" / "6 lessons, all at once" */
export function releaseLabel(t: Pick<Theme, 'release' | 'lessons'>): string {
  const n = t.lessons.length;
  const lessons = `${n} lesson${n === 1 ? '' : 's'}`;
  return t.release === 'weekly' ? `${lessons}, one a week` : `${lessons}, all at once`;
}

// ---------- the plan ----------

/** { "YYYY-MM": [themeId, …] } — family setting lesson_plan. */
export type LessonPlan = Record<string, string[]>;

export const MONTH_KEY = /^[0-9]{4}-(0[1-9]|1[0-2])$/;

/** The family's plan from its settings: valid month keys and arrays of strings only (the server checks the rest). */
export function planOf(settings: { lesson_plan?: unknown } | null | undefined): LessonPlan {
  const raw = settings?.lesson_plan;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: LessonPlan = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!MONTH_KEY.test(k) || !Array.isArray(v)) continue;
    const ids = v.filter((x): x is string => typeof x === 'string');
    if (ids.length > 0) out[k] = ids;
  }
  return out;
}

/** The month ("YYYY-MM") a theme is planned for (the earliest, should there be more), or null. */
export function themeMonth(plan: LessonPlan, themeId: string): string | null {
  let best: string | null = null;
  for (const [k, ids] of Object.entries(plan)) if (ids.includes(themeId) && (best === null || k < best)) best = k;
  return best;
}

/** "2026-12-01" + 7 days → "2026-12-08" (plain calendar maths, no time zones). */
export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** "2026-12" + 1 → "2027-01" */
export function addMonths(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number);
  const t = y * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
}

/** The first family-local day a theme lesson opens (YYYY-MM-DD); null when its theme isn't planned (or no theme). */
export function lessonOpenOn(plan: LessonPlan, lessonId: string): string | null {
  const theme = themeOf(lessonId);
  if (!theme) return null;
  const month = themeMonth(plan, theme.id);
  if (!month) return null;
  const first = `${month}-01`;
  if (theme.release === 'all') return first;
  return addDays(first, 7 * theme.lessons.findIndex((l) => l.id === lessonId));
}

/**
 * Themes that have started (planned for this month or earlier): they can't be removed or moved any more (the server
 * says 'plan_locked'). `thisMonth` = the family-local "YYYY-MM".
 */
export function lockedThemes(plan: LessonPlan, thisMonth: string): Set<string> {
  const out = new Set<string>();
  for (const [k, ids] of Object.entries(plan)) if (k <= thisMonth) ids.forEach((id) => { if (THEME_BY_ID[id]?.status === 'ready') out.add(id); });
  return out;
}

// ---------- labels ----------

const dateFmt = (opts: Intl.DateTimeFormatOptions) => (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', ...opts }).format(new Date(Date.UTC(y, m - 1, d || 1, 12)));
};

/** "Tue 8 Dec" */
export const dayLabel = (iso: string) => dateFmt({ weekday: 'short', day: 'numeric', month: 'short' })(iso).replace(',', '');
/** "December" (from "2026-12" or "2026-12-08") */
export const monthLabel = (isoOrMonth: string) => dateFmt({ month: 'long' })(isoOrMonth.length === 7 ? `${isoOrMonth}-01` : isoOrMonth);
/** "December 2026" */
export const monthYearLabel = (isoOrMonth: string) => dateFmt({ month: 'long', year: 'numeric' })(isoOrMonth.length === 7 ? `${isoOrMonth}-01` : isoOrMonth);
