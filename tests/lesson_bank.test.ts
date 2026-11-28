// Money school lesson bank (migration 20261116002700): themes the parents plan per month (family setting lesson_plan),
// lessons that open from the plan (all at once or one a week, family time), the quiz's answers as proof on finish, and
// the backfill that keeps Borrowing and insurance in December 2026 for families from before the bank.
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  asRole, balance, clock, expectCode, finishArgs, makeDb, makeFamily, q, quizAnswers, sqlFiles, type Fam, type Person,
} from './helpers';
import { clearArgTypeCache } from '../src/lib/backend/pgcall';
import {
  MAX_THEMES_A_MONTH, MAX_WEEKLY_LESSONS, READY_THEMES, THEMES, THEME_BY_ID, THEME_LESSONS, addMonths, dayLabel, lessonOpenOn,
  lockedThemes, planOf, releaseLabel, themeMonth, themeOf, type LessonPlan,
} from '../src/features/help/learn/bank';
import { TRACKED_LESSONS } from '../src/features/help/learn/catalog';
import { LESSONS } from '../src/features/help/learn/lessons';
import { lessonGate, moneySchool } from '../src/features/help/learn/progress';
import { THEME_LESSON_IDS, TRACKED_LESSON_IDS, type LessonCtx } from '../src/features/help/learn/types';
import { money } from '../src/lib/format';
import type { LessonDone } from '../src/lib/types';

type Row = Record<string, any>;
const TZ = 'Africa/Johannesburg'; // UTC+2 all year: local midnight = 22:00Z the day before
const MIGRATION = fileURLToPath(new URL('../supabase/migrations/20261116002700_lesson_bank.sql', import.meta.url));

let db: PGlite;
beforeAll(async () => { db = await makeDb(); });
afterEach(() => { clock.now = null; });

const setPlan = (p: Person, plan: unknown) => p.rpc<any>('update_family', { p_patch: { settings: { lesson_plan: plan } } });
const planIn = async (p: Person): Promise<LessonPlan> => (await p.rpc<any>('get_state')).family.settings.lesson_plan;
const finish = (p: Person, lesson: string) => p.rpc<any>('finish_lesson', finishArgs(lesson));
const lessonsOf = (member: string) => q<Row>(db, `select lesson from public.lessons_done where member_id = $1 order by lesson`, [member]);

describe('the bank: the app and the server agree', () => {
  it('themes: ids, kind, release, needs and lessons in order; titles; at most 5 lessons in a weekly theme', async () => {
    const [r] = await q<{ t: Record<string, Row>; l: Record<string, string> }>(db, 'select app.lesson_themes() as t, app.lessons() as l');
    expect(r.t).toEqual(Object.fromEntries(READY_THEMES.map((t) => [t.id,
      { kind: t.kind, release: t.release, needs: t.needs ?? [], lessons: t.lessons.map((l) => l.id) }])));
    expect(READY_THEMES.map((t) => t.id)).toEqual(['borrow-protect', 'christmas']);
    expect(THEME_LESSONS.map((l) => l.id)).toEqual([...THEME_LESSON_IDS]);
    for (const l of THEME_LESSONS) expect(r.l[l.id], l.id).toBe(l.title);
    expect(Object.keys(r.l)).toHaveLength(TRACKED_LESSON_IDS.length);
    expect(r.l).toEqual(Object.fromEntries(TRACKED_LESSONS.map((l) => [l.id, l.title])));
    // The lesson texts carry the catalog's emoji, title, summary and minutes (Christmas: themes/christmas.ts).
    for (const info of THEME_LESSONS) {
      const l = LESSONS.find((x) => x.id === info.id);
      expect(l, info.id).toBeDefined();
      expect({ emoji: l!.emoji, title: l!.title, summary: l!.summary, minutes: l!.minutes, kind: l!.kind }, info.id)
        .toEqual({ emoji: info.emoji, title: info.title, summary: info.summary, minutes: info.minutes, kind: 'series' });
    }
    expect(LESSONS.filter((l) => themeOf(l.id)).map((l) => l.id), 'lesson texts in the bank’s order').toEqual(THEME_LESSONS.map((l) => l.id));
    for (const t of THEMES) {
      if (t.release === 'weekly') expect(t.lessons.length, t.id).toBeLessThanOrEqual(MAX_WEEKLY_LESSONS);
      if (t.status === 'soon') expect(t.lessons, t.id).toEqual([]);
      else expect(t.lessons.length, t.id).toBeGreaterThan(0);
      if (t.kind === 'faith') expect(t.needs, t.id).toEqual(['faith']);
      for (const m of t.suggestedMonths) expect(m >= 1 && m <= 12, t.id).toBe(true);
    }
    expect(new Set(THEMES.map((t) => t.id)).size).toBe(THEMES.length);
    expect(THEME_BY_ID.christmas).toMatchObject({ emoji: '🎄', title: 'Christmas: why we celebrate', kind: 'faith', release: 'weekly', suggestedMonths: [12] });
    expect(THEME_BY_ID['borrow-protect']).toMatchObject({ emoji: '🛡️', title: 'Borrowing and insurance', kind: 'money', release: 'all', suggestedMonths: [12] });
    expect(THEMES.filter((t) => t.status === 'soon').map((t) => t.id)).toEqual(['fresh-start', 'stay-safe', 'easter', 'banks-cards',
      'smart-shopping', 'investing', 'taxes', 'mini-business', 'back-to-school', 'travel-money', 'gratitude', 'generosity', 'first-job']);
    expect(releaseLabel(THEME_BY_ID.christmas)).toBe('5 lessons, one a week');
    expect(releaseLabel(THEME_BY_ID['borrow-protect'])).toBe('6 lessons, all at once');
  });

  it('quiz answers: rendered from every tracked lesson’s quiz, the same for every reader, equal to app.lesson_answers()', async () => {
    const [r] = await q<{ a: Record<string, number[]> }>(db, 'select app.lesson_answers() as a');
    expect(Object.keys(r.a).sort()).toEqual([...TRACKED_LESSON_IDS].sort());
    const ctx = (over: Partial<LessonCtx>): LessonCtx => ({
      m: (c) => money(c, 'ZAR', { whole: true }), currency: 'ZAR', second: null, on: () => true, settings: {}, isKid: true,
      name: 'Anna', allowanceCents: 5000, allowancePeriod: 'week', ...over,
    });
    const readers = [
      ctx({}),
      ctx({ currency: 'EUR', m: (c) => money(c, 'EUR', { whole: true }), isKid: false, allowanceCents: 0, allowancePeriod: null, name: 'Dad' }),
      ctx({ on: (k) => k !== 'loans' && k !== 'points', allowanceCents: 1250, allowancePeriod: 'month', settings: { lesson_reward_cents: 1900 } }),
      ctx({ currency: 'USD', second: 'EUR', on: (k) => k !== 'faith' }),
    ];
    for (const id of TRACKED_LESSON_IDS) {
      const l = LESSONS.find((x) => x.id === id)!;
      expect(l.quiz, id).toBeDefined();
      for (const reader of readers) expect(l.quiz!(reader).map((x) => x.answer), id).toEqual(r.a[id]);
      expect(quizAnswers(id), id).toEqual(r.a[id]);
    }
  });

  it('the plan opens lessons the same way in the app and on the server', async () => {
    const f = await makeFamily(db, { Sam: 'kid' }, 'Parity', TZ);
    clock.now = '2026-11-20T10:00:00Z';
    const plan = { '2026-12': ['christmas'], '2027-02': ['borrow-protect'] };
    await setPlan(f.owner, plan);
    const rows = await q<{ id: string; d: string | null }>(db,
      `select x.id, to_char(app.lesson_open_on(f, x.id), 'YYYY-MM-DD') as d
         from public.families f, unnest($2::text[]) x(id) where f.id = $1`, [f.familyId, [...TRACKED_LESSON_IDS]]);
    expect(Object.fromEntries(rows.map((x) => [x.id, x.d]))).toEqual(Object.fromEntries(TRACKED_LESSON_IDS.map((id) => [id, lessonOpenOn(plan, id)])));
    expect(lessonOpenOn(plan, 'xmas-generous')).toBe('2026-12-08');
    expect(lessonOpenOn(plan, 'xmas-birth')).toBe('2026-12-15');
    expect(lessonOpenOn(plan, 'xmas-thanks')).toBe('2026-12-29');
    expect(lessonOpenOn(plan, 'insurance-stuff')).toBe('2027-02-01');
    expect(lessonOpenOn(plan, 'purpose')).toBeNull();
    expect(lessonOpenOn({}, 'loans-how')).toBeNull();
  });
});

describe('the lesson_plan setting', () => {
  let f: Fam;
  it('is {} for new families', async () => {
    f = await makeFamily(db, { Mum: 'parent', Anna: 'kid', Oma: 'grandparent' }, 'Plan', TZ);
    const [d] = await q<{ v: unknown }>(db, `select app.default_settings()->'lesson_plan' as v`);
    expect(d.v).toEqual({});
    expect(await planIn(f.Anna)).toEqual({});
  });

  it('managers set it; an empty month is dropped; kids and relatives can’t', async () => {
    clock.now = '2026-11-20T10:00:00Z';
    const st = await setPlan(f.Mum, { '2026-12': ['borrow-protect', 'christmas'], '2027-01': [] });
    expect(st.family.settings.lesson_plan).toEqual({ '2026-12': ['borrow-protect', 'christmas'] });
    expect(await planIn(f.Anna)).toEqual({ '2026-12': ['borrow-protect', 'christmas'] });
    await expectCode(setPlan(f.Anna, {}), 'not_allowed');
    await expectCode(setPlan(f.Oma, {}), 'not_allowed');
    const [a] = await q<Row>(db, `select details from public.audit_log where family_id = $1 and action = 'family.update' and details->'settings' ? 'lesson_plan'`, [f.familyId]);
    expect(a.details.settings.lesson_plan).toEqual({ '2026-12': ['borrow-protect', 'christmas'], '2027-01': [] });
  });

  it('rejects bad months, too many themes, unknown and coming-soon themes, a theme twice, and a too-big patch', async () => {
    clock.now = '2026-11-20T10:00:00Z';
    const bad = (plan: unknown, detail = 'setting:lesson_plan') => expectCode(setPlan(f.owner, plan), 'invalid', detail);
    await bad(['christmas']);
    await bad('2026-12');
    await bad({ '2026-13': ['christmas'] });
    await bad({ '2026-1': ['christmas'] });
    await bad({ '26-12': ['christmas'] });
    await bad({ '2026-12-01': ['christmas'] });
    await bad({ '2026-12': 'christmas' });
    await bad({ '2026-12': ['borrow-protect', 'christmas', 'easter', 'gratitude'] });
    await bad({ '2026-12': ['nope'] });
    await bad({ '2027-04': ['easter'] }); // coming soon: not plannable yet
    await bad({ '2026-12': [1] });
    await bad(Object.fromEntries(Array.from({ length: 37 }, (_, i) => [addMonths('2027-01', i), []])));
    await bad({ '2026-12': ['christmas', 'christmas'] }, 'duplicate_theme');
    await bad({ '2026-12': ['christmas'], '2027-12': ['christmas'] }, 'duplicate_theme');
    await expectCode(setPlan(f.owner, { '2026-12': ['x'.repeat(16_100)] }), 'invalid', 'too_big');
    await expectCode(f.owner.rpc('update_family', { p_patch: { name: 'y'.repeat(16_100) } }), 'invalid', 'too_big');
    expect(await planIn(f.owner)).toEqual({ '2026-12': ['borrow-protect', 'christmas'] });
    expect(MAX_THEMES_A_MONTH).toBe(3);
  });
});

describe('the lock: a theme that has started stays where it is', () => {
  let f: Fam;
  it('future themes can be moved and removed freely', async () => {
    f = await makeFamily(db, { Anna: 'kid' }, 'Lock', TZ);
    clock.now = '2026-11-20T10:00:00Z';
    await setPlan(f.owner, { '2026-12': ['borrow-protect'], '2027-01': ['christmas'] });
    await setPlan(f.owner, { '2026-12': ['borrow-protect', 'christmas'] });
    await setPlan(f.owner, { '2027-03': ['borrow-protect'] });
    await setPlan(f.owner, {});
    await setPlan(f.owner, { '2026-12': ['borrow-protect'] });
    expect(await planIn(f.owner)).toEqual({ '2026-12': ['borrow-protect'] });
  });

  it('from the 1st of its month (family time) it can’t be removed or moved', async () => {
    clock.now = '2026-11-30T21:59:00Z'; // 23:59 on 30 Nov in Johannesburg: not started yet
    await setPlan(f.owner, { '2027-01': ['borrow-protect'] });
    await setPlan(f.owner, { '2026-12': ['borrow-protect'], '2027-01': ['christmas'] });
    clock.now = '2026-11-30T22:01:00Z'; // 00:01 on 1 Dec: started
    await expectCode(setPlan(f.owner, {}), 'invalid', 'plan_locked');
    await expectCode(setPlan(f.owner, { '2027-01': ['borrow-protect', 'christmas'] }), 'invalid', 'plan_locked');
    await expectCode(setPlan(f.owner, { '2026-11': ['borrow-protect'], '2027-01': ['christmas'] }), 'invalid', 'plan_locked');
    // the not-yet-started theme still moves; the started one stays
    await setPlan(f.owner, { '2026-12': ['borrow-protect'], '2027-02': ['christmas'] });
    await setPlan(f.owner, { '2026-12': ['borrow-protect'] });
    clock.now = '2027-06-01T10:00:00Z'; // long after: still locked
    await expectCode(setPlan(f.owner, {}), 'invalid', 'plan_locked');
    expect(await planIn(f.owner)).toEqual({ '2026-12': ['borrow-protect'] });
    expect(lockedThemes({ '2026-12': ['borrow-protect'], '2027-02': ['christmas'] }, '2026-12')).toEqual(new Set(['borrow-protect']));
  });

  it('a theme added to the current month opens its passed weeks at once, and is locked from then on', async () => {
    clock.now = '2026-12-10T08:00:00Z';
    await expectCode(finish(f.Anna, 'xmas-advent'), 'invalid', 'not_open');
    await setPlan(f.owner, { '2026-12': ['borrow-protect', 'christmas'] });
    expect(await finish(f.Anna, 'xmas-advent')).toMatchObject({ first: true, points: 5 });
    expect(await finish(f.Anna, 'xmas-generous')).toMatchObject({ first: true, points: 5 });
    await expectCode(finish(f.Anna, 'xmas-birth'), 'invalid', 'not_open');
    await expectCode(setPlan(f.owner, { '2026-12': ['borrow-protect'] }), 'invalid', 'plan_locked');
  });
});

describe('opening days (family time)', () => {
  it('Christmas, one a week: lesson 2 (the budget) opens on 8 December at midnight; lesson 5 (thanks) on the 29th', async () => {
    const f = await makeFamily(db, { Anna: 'kid', Oma: 'grandparent' }, 'Weekly', TZ);
    clock.now = '2026-11-20T10:00:00Z';
    await setPlan(f.owner, { '2026-12': ['christmas'] });
    await expectCode(finish(f.Anna, 'xmas-advent'), 'invalid', 'not_open');
    clock.now = '2026-12-07T21:59:00Z'; // 23:59 on 7 Dec
    expect(await finish(f.Anna, 'xmas-advent')).toMatchObject({ first: true });
    await expectCode(finish(f.Anna, 'xmas-generous'), 'invalid', 'not_open');
    await expectCode(finish(f.Oma, 'xmas-generous'), 'invalid', 'not_open');
    clock.now = '2026-12-07T22:01:00Z'; // 00:01 on 8 Dec
    expect(await finish(f.Anna, 'xmas-generous')).toMatchObject({ first: true, points: 5 });
    expect(await finish(f.Oma, 'xmas-generous')).toMatchObject({ first: true, points: 0 });
    await expectCode(finish(f.Anna, 'xmas-birth'), 'invalid', 'not_open');
    clock.now = '2026-12-28T21:59:00Z';
    await expectCode(finish(f.Anna, 'xmas-thanks'), 'invalid', 'not_open');
    clock.now = '2026-12-28T22:00:00Z';
    for (const id of ['xmas-birth', 'xmas-wise-men', 'xmas-thanks']) expect(await finish(f.Anna, id), id).toMatchObject({ first: true });
    expect(dayLabel('2026-12-08')).toBe('Tue 8 Dec');
  });

  it('an unplanned theme is not open for kids and relatives; managers may preview it', async () => {
    const f = await makeFamily(db, { Mum: 'parent', Anna: 'kid', Oma: 'grandparent' }, 'Unplanned', TZ);
    clock.now = '2026-12-15T10:00:00Z';
    for (const id of ['loans-how', 'xmas-advent']) {
      await expectCode(finish(f.Anna, id), 'invalid', 'not_open');
      await expectCode(finish(f.Oma, id), 'invalid', 'not_open');
    }
    expect(await finish(f.Mum, 'xmas-advent')).toMatchObject({ first: true, points: 0 });
    expect(await finish(f.owner, 'loans-how')).toMatchObject({ first: true, points: 0 });
    expect(await lessonsOf(f.Anna.id)).toEqual([]);
  });

  it('a faith theme with faith off: feature_off for everyone, managers too', async () => {
    const f = await makeFamily(db, { Mum: 'parent', Anna: 'kid' }, 'No faith', TZ);
    clock.now = '2026-11-20T10:00:00Z';
    await setPlan(f.owner, { '2026-12': ['christmas', 'borrow-protect'] });
    await f.owner.rpc('update_family', { p_patch: { settings: { features: { faith: false } } } });
    clock.now = '2026-12-20T10:00:00Z';
    await expectCode(finish(f.Anna, 'xmas-advent'), 'feature_off', 'faith');
    await expectCode(finish(f.Mum, 'xmas-advent'), 'feature_off', 'faith');
    await expectCode(finish(f.owner, 'xmas-thanks'), 'feature_off', 'faith');
    expect(await finish(f.Anna, 'loans-how')).toMatchObject({ first: true, points: 5 });
  });
});

describe('the quiz is the proof', () => {
  let f: Fam;
  const traces = async (member: string) => ({
    done: (await lessonsOf(member)).length,
    tx: (await q<Row>(db, `select count(*)::int as n from public.transactions where member_id = $1`, [member]))[0].n,
    audit: (await q<Row>(db, `select count(*)::int as n from public.audit_log where actor = $1 and action = 'lesson.finish'`, [member]))[0].n,
  });

  it('wrong, missing or partial answers: invalid / answers, and nothing is written', async () => {
    f = await makeFamily(db, { Mum: 'parent', Anna: 'kid' }, 'Quiz', TZ);
    await f.owner.rpc('update_family', { p_patch: { settings: { lesson_reward_cents: 1900 } } });
    clock.now = '2026-11-20T10:00:00Z';
    await setPlan(f.owner, { '2026-12': ['borrow-protect'] });
    clock.now = '2026-12-02T10:00:00Z';
    const before = await traces(f.Anna.id);
    const right = quizAnswers('purpose');
    expect(right).toEqual([1, 1, 1]);
    for (const answers of [[1, 1, 0], [1, 1], [1, 1, 1, 1], [], [0, 0, 0], null, undefined]) {
      await expectCode(f.Anna.rpc('finish_lesson', { p_lesson: 'purpose', p_answers: answers }), 'invalid', 'answers');
    }
    await expectCode(f.Anna.rpc('finish_lesson', { p_lesson: 'loans-how', p_answers: [0, 0, 0] }), 'invalid', 'answers');
    await expectCode(f.Anna.rpc('finish_lesson', { p_lesson: 'loans-how', p_answers: quizAnswers('loans-repay') }), 'invalid', 'answers');
    await expectCode(f.Mum.rpc('finish_lesson', { p_lesson: 'xmas-advent', p_answers: [2, 1, 0] }), 'invalid', 'answers');
    expect(await traces(f.Anna.id)).toEqual(before);
    expect(await traces(f.Mum.id)).toEqual({ done: 0, tx: 0, audit: 0 });
    expect(await balance(db, f.Anna.id, 'spending')).toBe(0);
  });

  it('a lesson that isn’t open says not_open first, whatever the answers', async () => {
    clock.now = '2026-12-02T10:00:00Z';
    await expectCode(f.Anna.rpc('finish_lesson', { p_lesson: 'xmas-advent', p_answers: [9] }), 'invalid', 'not_open');
  });

  it('the right answers: XP and the Money school reward as before', async () => {
    clock.now = '2026-12-02T10:00:00Z';
    expect(await finish(f.Anna, 'purpose')).toMatchObject({ lesson: 'purpose', first: true, points: 5, money_cents: 1900 });
    expect(await finish(f.Anna, 'loans-how')).toMatchObject({ lesson: 'loans-how', first: true, points: 5, money_cents: 1900 });
    expect(await finish(f.Anna, 'purpose')).toMatchObject({ first: false, points: 0, money_cents: 0 });
    expect(await balance(db, f.Anna.id, 'spending')).toBe(3800);
    expect(await balance(db, f.Anna.id, 'points')).toBe(10);
    const audit = await q<Row>(db, `select details from public.audit_log where actor = $1 and action = 'lesson.finish' order by created_at`, [f.Anna.id]);
    expect(audit.map((a) => a.details)).toEqual([
      { lesson: 'purpose', points: 5, money: 1900 }, { lesson: 'loans-how', points: 5, money: 1900 }]);
  });

  it('a lesson finished stays earned: past lessons are rewarded whatever today’s plan says', async () => {
    const g = await makeFamily(db, { Leo: 'kid' }, 'Earned', TZ);
    clock.now = '2026-11-20T10:00:00Z';
    await setPlan(g.owner, { '2026-12': ['borrow-protect'] });
    clock.now = '2026-12-02T10:00:00Z';
    await finish(g.Leo, 'loans-how'); // no reward set yet
    await g.owner.rpc('update_family', { p_patch: { settings: { lesson_reward_cents: 500 } } });
    clock.now = '2027-01-05T10:00:00Z';
    const due = await g.owner.rpc<any>('lesson_rewards_due');
    expect(due.kids.map((k: Row) => [k.member_id, k.count])).toEqual([[g.Leo.id, 1]]);
    await g.owner.rpc('reward_past_lessons', { p_expected_cents: 500 });
    expect(await balance(db, g.Leo.id, 'spending')).toBe(500);
  });
});

describe('families from before the bank (backfill)', () => {
  let old: PGlite;
  let f: Fam;
  it('keep Borrowing and insurance in December 2026: all six open at midnight on 1 December, family time', async () => {
    const files = sqlFiles();
    const at = files.findIndex((x) => x.name.includes('20261116002700_lesson_bank'));
    const timeTravel = files.find((x) => x.name.includes('90_time_travel'))!;
    expect(at).toBeGreaterThan(0);
    old = new PGlite({ extensions: { pgcrypto } });
    for (const x of files.slice(0, at)) await old.exec(x.sql);
    await old.exec(timeTravel.sql);
    f = await makeFamily(old, { Anna: 'kid', Oma: 'grandparent' }, 'Before', TZ);
    for (const x of files.slice(at)) await old.exec(x.sql);
    clearArgTypeCache(old);

    expect((await old.query<Row>(`select settings->'lesson_plan' as p from public.families where id = $1`, [f.familyId])).rows[0].p)
      .toEqual({ '2026-12': ['borrow-protect'] });
    const lessons = THEME_BY_ID['borrow-protect'].lessons.map((l) => l.id);
    clock.now = '2026-11-30T21:59:00Z'; // 23:59 on 30 Nov in Johannesburg
    for (const id of lessons) await expectCode(finish(f.Anna, id), 'invalid', 'not_open');
    await expectCode(finish(f.Oma, 'loans-how'), 'invalid', 'not_open');
    clock.now = '2026-11-30T22:01:00Z'; // 00:01 on 1 Dec
    for (const id of lessons) expect(await finish(f.Anna, id), id).toMatchObject({ first: true, points: 5 });
    expect(await finish(f.Oma, 'loans-how')).toMatchObject({ first: true, points: 0 });
    // Christmas isn't planned for them: the owner plans it after the release.
    await expectCode(finish(f.Anna, 'xmas-advent'), 'invalid', 'not_open');
  });

  it('is safe to run twice and leaves families that have a plan (also an empty one) alone', async () => {
    clock.now = '2026-11-20T10:00:00Z';
    const empty = await makeFamily(old, {}, 'Empty plan', TZ);
    await setPlan(empty.owner, {});
    const own = await makeFamily(old, {}, 'Own plan', TZ);
    await setPlan(own.owner, { '2027-01': ['christmas'] });
    const settings = async () => (await old.query<Row>(`select id, settings from public.families order by id`)).rows;
    const once = await settings();
    await old.exec(readFileSync(MIGRATION, 'utf8'));
    clearArgTypeCache(old);
    expect(await settings()).toEqual(once);
    const byId = Object.fromEntries(once.map((r) => [r.id, r.settings.lesson_plan]));
    expect(byId[f.familyId]).toEqual({ '2026-12': ['borrow-protect'] });
    expect(byId[empty.familyId]).toEqual({});
    expect(byId[own.familyId]).toEqual({ '2027-01': ['christmas'] });
  });
});

describe('grants', () => {
  it('one finish_lesson(text, int[]) for signed-in members; the bank and plan helpers are internal', async () => {
    const [p] = await q<Row>(db, `select to_regprocedure('public.finish_lesson(text)') as old,
      (select count(*)::int from pg_proc where proname = 'finish_lesson') as n,
      has_function_privilege('anon', 'public.finish_lesson(text, integer[])', 'execute') as anon_f,
      has_function_privilege('authenticated', 'public.finish_lesson(text, integer[])', 'execute') as auth_f,
      has_function_privilege('anon', 'public.update_family(jsonb)', 'execute') as anon_u,
      has_function_privilege('authenticated', 'public.update_family(jsonb)', 'execute') as auth_u`);
    expect(p).toEqual({ old: null, n: 1, anon_f: false, auth_f: true, anon_u: false, auth_u: true });
    for (const fn of ['app.lessons()', 'app.lesson_themes()', 'app.lesson_answers()', 'app.lesson_theme(text)',
      'app.lesson_plan_of(jsonb)', 'app.theme_month(jsonb, text)', 'app.lesson_open_on(public.families, text)',
      'app.check_lesson_plan(public.families, jsonb)', 'app.default_settings()']) {
      const [r] = await q<Row>(db, `select has_function_privilege('anon', $1, 'execute') as anon,
                                           has_function_privilege('authenticated', $1, 'execute') as auth`, [fn]);
      expect(r, fn).toEqual({ anon: false, auth: false });
    }
    await expect(asRole(db, 'anon', `select public.finish_lesson('purpose', array[1,1,1])`)).rejects.toThrow(/permission denied/);
  });
});

describe('the app’s progress model', () => {
  const plan: LessonPlan = { '2026-12': ['borrow-protect', 'christmas'] };
  const rows = (member: string, ids: string[]): LessonDone[] =>
    ids.map((lesson) => ({ member_id: member, lesson, done_at: '2026-12-01T10:00:00Z', points: 5, money_cents: 0 }));
  const on = () => true;

  it('only planned themes, current month first; per lesson planned / openOn / open / done / fresh', () => {
    const s = moneySchool({ on, rows: rows('a', ['purpose', 'xmas-advent']), memberId: 'a', plan, today: '2026-12-09' });
    expect(s.themes.map((t) => [t.theme.id, t.month, t.started])).toEqual([['borrow-protect', '2026-12', true], ['christmas', '2026-12', true]]);
    const xmas = s.themes[1];
    expect(xmas).toMatchObject({ count: 1, total: 5, openCount: 2 });
    expect(xmas.next?.lesson.id).toBe('xmas-generous');
    expect(xmas.nextOpening).toMatchObject({ lesson: { id: 'xmas-birth' }, openOn: '2026-12-15' });
    expect(s.status('xmas-generous')).toMatchObject({ planned: true, openOn: '2026-12-08', open: true, done: false, fresh: true });
    expect(s.status('xmas-advent')).toMatchObject({ open: true, done: true, fresh: false });
    expect(s.status('purpose')).toMatchObject({ planned: true, openOn: null, open: true, done: true });
    expect(s.core).toMatchObject({ count: 1, total: 6 });
    expect(s.upNext).toMatchObject({ kind: 'lesson', lesson: { lesson: { id: 'earn' } } });
    // nothing planned: themes are invisible
    const none = moneySchool({ on, rows: [], memberId: 'a', plan: {}, today: '2026-12-09' });
    expect(none.themes).toEqual([]);
    expect(none.status('loans-how')).toMatchObject({ planned: false, openOn: null, open: false });
    // faith off: Christmas is hidden
    expect(moneySchool({ on: (k) => k !== 'faith', rows: [], memberId: 'a', plan, today: '2026-12-09' }).themes.map((t) => t.theme.id))
      .toEqual(['borrow-protect']);
  });

  it('Up next: core first, then the earliest-opened theme lesson (fresh = opened this week), then a teaser, then all done', () => {
    const core = TRACKED_LESSONS.filter((l) => !themeOf(l.id)).map((l) => l.id);
    const borrow = THEME_BY_ID['borrow-protect'].lessons.map((l) => l.id);
    let s = moneySchool({ on, rows: rows('a', core), memberId: 'a', plan, today: '2026-12-09' });
    expect(s.upNext).toMatchObject({ kind: 'lesson', lesson: { lesson: { id: 'loans-how' }, fresh: false } });
    s = moneySchool({ on, rows: rows('a', [...core, ...borrow, 'xmas-advent']), memberId: 'a', plan, today: '2026-12-09' });
    expect(s.upNext).toMatchObject({ kind: 'lesson', lesson: { lesson: { id: 'xmas-generous' }, fresh: true } });
    expect(s.fresh?.lesson.id).toBe('xmas-generous');
    s = moneySchool({ on, rows: rows('a', [...core, ...borrow, 'xmas-advent', 'xmas-generous']), memberId: 'a', plan, today: '2026-12-09' });
    expect(s.upNext).toMatchObject({ kind: 'soon', lesson: { lesson: { id: 'xmas-birth' }, openOn: '2026-12-15' } });
    s = moneySchool({ on, rows: rows('a', [...core, ...borrow, ...THEME_BY_ID.christmas.lessons.map((l) => l.id)]), memberId: 'a', plan, today: '2026-12-30' });
    expect(s.upNext).toEqual({ kind: 'done' });
    // a future month only: a teaser for its first lesson
    s = moneySchool({ on, rows: rows('a', core), memberId: 'a', plan: { '2027-01': ['christmas'] }, today: '2026-12-09' });
    expect(s.upNext).toMatchObject({ kind: 'soon', lesson: { openOn: '2027-01-01' } });
    expect(s.themes[0]).toMatchObject({ month: '2027-01', started: false, openCount: 0 });
  });

  it('the gate and the plan helpers', () => {
    expect(lessonGate('xmas-generous', plan, '2026-12-07', false)).toMatchObject({ gate: 'locked', openOn: '2026-12-08' });
    expect(lessonGate('xmas-generous', plan, '2026-12-07', true)).toMatchObject({ gate: 'preview', openOn: '2026-12-08' });
    expect(lessonGate('xmas-generous', plan, '2026-12-08', false).gate).toBe('open');
    expect(lessonGate('xmas-generous', {}, '2026-12-08', false)).toMatchObject({ gate: 'locked', openOn: null });
    expect(lessonGate('xmas-thanks', plan, '2026-12-28', false)).toMatchObject({ gate: 'locked', openOn: '2026-12-29' });
    expect(planOf({ lesson_plan: { '2026-12': ['christmas', 7], bad: ['x'], '2027-01': [] } })).toEqual({ '2026-12': ['christmas'] });
    expect(planOf({ lesson_plan: ['christmas'] })).toEqual({});
    expect(planOf(undefined)).toEqual({});
    expect(themeMonth(plan, 'christmas')).toBe('2026-12');
    expect(themeMonth(plan, 'easter')).toBeNull();
    expect(addMonths('2026-12', 1)).toBe('2027-01');
    expect(addMonths('2027-01', -1)).toBe('2026-12');
  });
});
