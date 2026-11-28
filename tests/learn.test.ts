// Money school (feature 'learn') and the 'faith' switch (migration 20261116001700); the Borrowing and insurance lessons
// (migration 20261116002400), opened by the family's lesson plan (migration 20261116002700, more in lesson_bank.test.ts).
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { balance, clock, expectCode, finishArgs, makeDb, makeFamily, q, type Fam } from './helpers';
import { TRACKED_LESSONS } from '../src/features/help/learn/catalog';
import { LESSONS, visibleLessons } from '../src/features/help/learn/lessons';
import { exampleCents, loanTotals } from '../src/features/help/learn/math';
import { THEME_BY_ID, THEME_LESSON_BY_ID, themeOf } from '../src/features/help/learn/bank';
import { lessonGate } from '../src/features/help/learn/progress';
import {
  CORE_LESSON_IDS, FAITH_LESSON_IDS, THEME_LESSON_IDS, TRACKED_LESSON_IDS, isTracked, type Block, type Lesson, type LessonCtx, type QuizQuestion,
} from '../src/features/help/learn/types';
import { VERSE_BY_ID } from '../src/features/faith/verses';
import { money } from '../src/lib/format';
import { START_SMALL, EVERYTHING } from '../src/lib/types';

let db: PGlite;
beforeAll(async () => { db = await makeDb(); });
afterEach(() => { clock.now = null; });

describe('feature switches learn + faith', () => {
  it('learn is on and faith is off by default; both can be switched', async () => {
    const f = await makeFamily(db, { Sam: 'kid' });
    await f.owner.rpc('update_family', { p_patch: { settings: { features: { learn: true, faith: false } } } });
    let st = await f.Sam.rpc<any>('get_state');
    expect(st.family.settings.features.learn).toBe(true);
    expect(st.family.settings.features.faith).toBe(false);
    st = await f.owner.rpc<any>('update_family', { p_patch: { settings: { features: { faith: true } } } });
    expect(st.family.settings.features.faith).toBe(true);
    const [d] = await q<{ d: any }>(db, 'select app.default_features() as d');
    expect(d.d).toMatchObject({ learn: true, faith: false });
    expect(START_SMALL).toMatchObject({ learn: true, faith: false });
    expect(EVERYTHING).toMatchObject({ learn: true, faith: true });
  });
});

describe('Money school lessons', () => {
  let f: Fam;
  it('server whitelist matches the app: the core lessons and the theme lessons, with the same titles', async () => {
    const [r] = await q<{ l: Record<string, string> }>(db, 'select app.lessons() as l');
    expect(Object.keys(r.l).sort()).toEqual([...TRACKED_LESSON_IDS].sort());
    expect(TRACKED_LESSON_IDS).toEqual([...CORE_LESSON_IDS, ...THEME_LESSON_IDS]);
    expect(r.l).toEqual(Object.fromEntries(TRACKED_LESSONS.map((l) => [l.id, l.title])));
    // The lesson texts: every tracked lesson exactly once, in the same order, with the catalog's title.
    const tracked = LESSONS.filter((l) => isTracked(l.kind));
    expect(tracked.map((l) => l.id)).toEqual([...TRACKED_LESSON_IDS]);
    for (const l of tracked) expect(l.title, l.id).toBe(r.l[l.id]);
  });

  it('a kid finishes a lesson once and gets +5 XP once', async () => {
    f = await makeFamily(db, { Sam: 'kid', Mia: 'kid', Mum: 'parent' });
    // makeFamily switches everything on (points included)
    const before = await balance(db, f.Sam.id, 'points');
    const r1 = await f.Sam.rpc<any>('finish_lesson', finishArgs('interest'));
    expect(r1).toMatchObject({ lesson: 'interest', first: true, points: 5 });
    const r2 = await f.Sam.rpc<any>('finish_lesson', finishArgs('interest'));
    expect(r2).toMatchObject({ lesson: 'interest', first: false, points: 0, done_at: r1.done_at });
    expect(await balance(db, f.Sam.id, 'points')).toBe(before + 5);
    const [tx] = await q<any>(db, `select kind, reason from public.transactions where member_id = $1 and source_type = 'lesson'`, [f.Sam.id]);
    expect(tx).toEqual({ kind: 'bonus', reason: 'Money school: How interest works' });
  });

  it('grown-ups can do lessons too, without XP', async () => {
    const r = await f.Mum.rpc<any>('finish_lesson', finishArgs('why-save'));
    expect(r).toMatchObject({ first: true, points: 0 });
  });

  it('no XP when points are off', async () => {
    await f.owner.rpc('update_family', { p_patch: { settings: { features: { points: false } } } });
    const r = await f.Mia.rpc<any>('finish_lesson', finishArgs('goals'));
    expect(r).toMatchObject({ first: true, points: 0 });
    await f.owner.rpc('update_family', { p_patch: { settings: { features: { points: true } } } });
  });

  it('kids see their own lessons, parents see everyone’s', async () => {
    const mine = await f.Sam.rpc<any[]>('list_lessons_done');
    expect(mine.map((x) => x.lesson)).toEqual(['interest']);
    expect(mine[0]).toMatchObject({ member_id: f.Sam.id, points: 5 });
    const all = await f.Mum.rpc<any[]>('list_lessons_done');
    expect(all.map((x) => x.lesson).sort()).toEqual(['goals', 'interest', 'why-save']);
  });

  it('rejects unknown lessons, faith reflections and a switched-off Money school', async () => {
    await expectCode(f.Sam.rpc('finish_lesson', { p_lesson: 'nope', p_answers: [1, 1, 1] }), 'invalid', 'lesson');
    await expectCode(f.Sam.rpc('finish_lesson', { p_lesson: 'faith-giving', p_answers: [] }), 'invalid', 'lesson');
    await f.owner.rpc('update_family', { p_patch: { settings: { features: { learn: false } } } });
    await expectCode(f.Sam.rpc('finish_lesson', finishArgs('earn')), 'feature_off', 'learn');
  });

  it('only signed-in members can call the lesson functions', async () => {
    const [p] = await q<{ anon_f: boolean; anon_l: boolean; auth_f: boolean; auth_l: boolean }>(db, `select
      has_function_privilege('anon', 'public.finish_lesson(text, integer[])', 'execute') as anon_f,
      has_function_privilege('anon', 'public.list_lessons_done()', 'execute') as anon_l,
      has_function_privilege('authenticated', 'public.finish_lesson(text, integer[])', 'execute') as auth_f,
      has_function_privilege('authenticated', 'public.list_lessons_done()', 'execute') as auth_l`);
    expect(p).toEqual({ anon_f: false, anon_l: false, auth_f: true, auth_l: true });
  });
});

describe('Borrowing and insurance: planned for December, openable from the 1st (family time)', () => {
  let g: Fam;
  // Europe/Amsterdam (makeFamily's default) is UTC+1 in winter: 1 December starts at 2026-11-30T23:00:00Z.
  const BEFORE = '2026-11-30T22:59:00Z';
  const MIDNIGHT = '2026-11-30T23:00:00Z';

  it('a kid can’t finish a theme lesson before 1 December; core lessons stay open', async () => {
    g = await makeFamily(db, { Sam: 'kid', Mum: 'parent', Oma: 'grandparent' });
    clock.now = '2026-11-20T10:00:00Z';
    await g.owner.rpc('update_family', { p_patch: { settings: { lesson_plan: { '2026-12': ['borrow-protect'] } } } });
    clock.now = BEFORE;
    await expectCode(g.Sam.rpc('finish_lesson', finishArgs('loans-how')), 'invalid', 'not_open');
    await expectCode(g.Sam.rpc('finish_lesson', finishArgs('insurance-stuff')), 'invalid', 'not_open');
    expect(await g.Sam.rpc<any>('finish_lesson', finishArgs('purpose'))).toMatchObject({ first: true, points: 5 });
  });

  it('a relative can’t either', async () => {
    clock.now = BEFORE;
    await expectCode(g.Oma.rpc('finish_lesson', finishArgs('insurance-what')), 'invalid', 'not_open');
  });

  it('a manager can preview (and finish) early, without XP', async () => {
    clock.now = '2026-11-20T10:00:00Z';
    expect(await g.Mum.rpc<any>('finish_lesson', finishArgs('insurance-people'))).toMatchObject({ first: true, points: 0 });
    expect(await g.owner.rpc<any>('finish_lesson', finishArgs('loans-repay'))).toMatchObject({ first: true, points: 0 });
  });

  it('from midnight on 1 December (family time) a kid can, with +5 XP once; and it stays open', async () => {
    clock.now = MIDNIGHT;
    const before = await balance(db, g.Sam.id, 'points');
    const r = await g.Sam.rpc<any>('finish_lesson', finishArgs('loans-how'));
    expect(r).toMatchObject({ lesson: 'loans-how', first: true, points: 5 });
    expect(await g.Sam.rpc<any>('finish_lesson', finishArgs('loans-how'))).toMatchObject({ first: false, points: 0 });
    expect(await balance(db, g.Sam.id, 'points')).toBe(before + 5);
    const txs = await q<any>(db, `select reason from public.transactions where member_id = $1 and source_type = 'lesson' order by created_at`, [g.Sam.id]);
    expect(txs.map((t) => t.reason)).toContain('Money school: How loans work');
    clock.now = '2027-03-01T12:00:00Z';
    expect(await g.Oma.rpc<any>('finish_lesson', finishArgs('insurance-what'))).toMatchObject({ first: true, points: 0 });
    expect(await g.Sam.rpc<any>('finish_lesson', finishArgs('insurance-stuff'))).toMatchObject({ first: true, points: 5 });
  });

  it('only signed-in members can finish lessons; the bank and the plan checks are server-only', async () => {
    const [p] = await q<Record<string, boolean>>(db, `select
      has_function_privilege('anon', 'public.finish_lesson(text, integer[])', 'execute') as anon_f,
      has_function_privilege('anon', 'app.lesson_open_on(public.families, text)', 'execute') as anon_o,
      has_function_privilege('authenticated', 'app.lesson_open_on(public.families, text)', 'execute') as auth_o,
      has_function_privilege('authenticated', 'app.lesson_themes()', 'execute') as auth_t,
      has_function_privilege('authenticated', 'app.lesson_answers()', 'execute') as auth_a,
      has_function_privilege('anon', 'app.lessons()', 'execute') as anon_l,
      has_function_privilege('authenticated', 'app.lessons()', 'execute') as auth_l`);
    expect(p).toEqual({ anon_f: false, anon_o: false, auth_o: false, auth_t: false, auth_a: false, anon_l: false, auth_l: false });
  });
});

describe('Borrowing and insurance in the app', () => {
  const DEC = { '2026-12': ['borrow-protect'] };
  it('the gate: locked for kids and relatives before the day or when unplanned, a preview for managers, then open for good', () => {
    expect(lessonGate('loans-how', DEC, '2026-11-30', false)).toMatchObject({ gate: 'locked', openOn: '2026-12-01' });
    expect(lessonGate('loans-how', DEC, null, false).gate).toBe('locked');
    expect(lessonGate('loans-how', {}, '2026-12-05', false)).toMatchObject({ gate: 'locked', openOn: null });
    expect(lessonGate('loans-how', {}, '2026-12-05', true)).toMatchObject({ gate: 'preview', openOn: null });
    expect(lessonGate('loans-how', DEC, '2026-11-30', true).gate).toBe('preview');
    expect(lessonGate('loans-how', DEC, '2026-12-01', false).gate).toBe('open');
    expect(lessonGate('insurance-stuff', DEC, '2027-06-15', false).gate).toBe('open');
    expect(lessonGate('purpose', {}, '2026-01-01', false).gate).toBe('open');
    expect(lessonGate('faith-giving', {}, null, false).gate).toBe('open');
  });

  it('theme lessons are listed like core when their theme’s switches are on (Christmas needs faith)', () => {
    const ids = visibleLessons({ on: (k) => k !== 'faith' }).map((l) => l.id);
    expect(ids).toEqual(TRACKED_LESSON_IDS.filter((id) => themeOf(id)?.id !== 'christmas'));
    expect(visibleLessons({ on: () => true }).map((l) => l.id)).toEqual([...TRACKED_LESSON_IDS, ...FAITH_LESSON_IDS]);
    expect(visibleLessons({ on: (k) => k !== 'learn' })).toEqual([]);
  });

  const MARK = '¤';
  const fmt = (c: number) => `${MARK}${(c / 100).toFixed(c % 100 ? 2 : 0)}`;
  const ctx = (over: Partial<LessonCtx> = {}): LessonCtx => ({
    m: fmt,
    currency: 'ZAR', second: null, on: () => true, settings: {}, isKid: true, name: 'Sam',
    allowanceCents: 5000, allowancePeriod: 'week', ...over,
  });
  const readers = [
    ctx(),
    ctx({ isKid: false, allowanceCents: 0, allowancePeriod: null }),
    ctx({ on: (k) => k !== 'loans' }),
    ctx({ allowanceCents: 1250, allowancePeriod: 'month', on: (k) => k !== 'faith' }),
    ctx({ currency: 'EUR' }),
    ctx({ currency: 'EUR', isKid: false, allowanceCents: 0, allowancePeriod: null, m: (c) => money(c, 'EUR', { whole: true }) }),
    ctx({ m: (c) => money(c, 'ZAR', { whole: true }) }),
  ];
  const textOf = (b: Block): string[] =>
    b.kind === 'text' || b.kind === 'example' ? [b.text] : b.kind === 'list' ? b.items : b.kind === 'reflect' ? [b.prompt] : b.kind === 'verse' && b.note ? [b.note] : [];
  const quizText = (x: QuizQuestion) => [x.q, x.why, ...x.options];
  const series = LESSONS.filter((l) => themeOf(l.id)?.id === 'borrow-protect');

  it('six short lessons: 4–6 steps with an emoji, one thing to think about, 3 quiz questions with a why', () => {
    expect(series.map((l) => l.id)).toEqual(THEME_BY_ID['borrow-protect'].lessons.map((l) => l.id));
    expect(series).toHaveLength(6);
    for (const l of series) {
      const info = THEME_LESSON_BY_ID[l.id as keyof typeof THEME_LESSON_BY_ID];
      expect({ emoji: l.emoji, title: l.title, summary: l.summary, minutes: l.minutes }).toEqual(
        { emoji: info.emoji, title: info.title, summary: info.summary, minutes: info.minutes });
      expect(l.minutes).toBeGreaterThanOrEqual(3);
      expect(l.minutes).toBeLessThanOrEqual(4);
      for (const r of readers) {
        const steps = l.steps(r);
        expect(steps.length, l.id).toBeGreaterThanOrEqual(4);
        expect(steps.length, l.id).toBeLessThanOrEqual(6);
        for (const s of steps) {
          expect(s.emoji, `${l.id}: ${s.title}`).toBeTruthy();
          expect(s.title.trim()).not.toBe('');
          expect(s.blocks.some((b) => b.kind !== 'verse'), `${l.id}: ${s.title}`).toBe(true);
          for (const b of s.blocks) if (b.kind === 'verse') expect(VERSE_BY_ID[b.id], `${l.id}: ${b.id}`).toBeDefined();
        }
        expect(steps.flatMap((s) => s.blocks).filter((b) => b.kind === 'reflect'), l.id).toHaveLength(1);
        const quiz = l.quiz!(r);
        expect(quiz, l.id).toHaveLength(3);
        for (const x of quiz) {
          expect(x.answer).toBeGreaterThanOrEqual(0);
          expect(x.answer).toBeLessThan(x.options.length);
          expect(new Set(x.options).size, x.q).toBe(x.options.length);
          expect(x.why.trim().length, x.q).toBeGreaterThan(10);
        }
      }
    }
  });

  it('use the family’s own money (never a hard-coded currency) and a loan calculator in "Paying a loan back"', () => {
    for (const l of series) {
      for (const r of readers.filter((x) => x.m === fmt)) {
        const texts = [...l.steps(r).flatMap((s) => s.blocks.flatMap(textOf)), ...l.quiz!(r).flatMap(quizText)];
        for (const t of texts) expect(t, l.id).not.toMatch(/(^|[^A-Za-z])R ?\d|€|\$|£|\b(ZAR|EUR|USD|GBP)\b/);
      }
    }
    const repay = series.find((l) => l.id === 'loans-repay')!;
    expect(repay.steps(ctx()).flatMap((s) => s.blocks).some((b) => b.kind === 'widget' && b.widget === 'loan')).toBe(true);
    const text = repay.steps(ctx()).flatMap((s) => s.blocks.flatMap(textOf)).join(' ');
    // R1 000 at 20% a year: 12 months vs 36 months (math.ts loanTotals)
    expect(text).toContain(`You borrow ${MARK}1000 at 20% a year`);
    expect(text).toContain(`${MARK}92.63 a month, ${MARK}1111.61 in total`);
    expect(text).toContain(`${MARK}37.16 a month, ${MARK}1337.95 in total`);
    expect(text).toContain(`A quarter of it is ${MARK}12.50`);
  });

  const amounts = (texts: string[]) => texts.flatMap((t) => [...t.matchAll(/¤(\d+(?:\.\d+)?)/g)].map((x) => Math.round(Number(x[1]) * 100)));
  const allText = (l: Lesson, r: LessonCtx) => [...l.steps(r).flatMap((s) => s.blocks.flatMap(textOf)), ...l.quiz!(r).flatMap(quizText)];
  const noPocketMoney = { allowanceCents: 0, allowancePeriod: null } as const;

  it('real-world example amounts fit the currency: rand-sized for ZAR, a tenth in whole units elsewhere', () => {
    expect(exampleCents('ZAR', 500_000)).toBe(500_000);
    expect(exampleCents('EUR', 500_000)).toBe(50_000);
    expect(exampleCents('USD', 9_000)).toBe(900);
    expect(exampleCents('EUR', 12_345)).toBe(1_200); // whole units
    for (const l of series) {
      const zar = amounts(allText(l, ctx(noPocketMoney)));
      const eur = amounts(allText(l, ctx({ ...noPocketMoney, currency: 'EUR' })));
      expect(zar.length, l.id).toBeGreaterThan(0);
      expect(eur.length, l.id).toBe(zar.length);
      // Biggest example: household contents worth R100 000, so €10 000. No €5 000 phones.
      expect(Math.max(...zar), l.id).toBeLessThanOrEqual(10_000_000);
      expect(Math.max(...eur), l.id).toBeLessThanOrEqual(1_000_000);
      // Every amount is the same example, a tenth (the loan's computed payments are checked below instead).
      if (l.id !== 'loans-repay') eur.forEach((c, i) => expect(c * 10, `${l.id} amount #${i + 1}`).toBe(zar[i]));
    }
    const what = allText(series.find((l) => l.id === 'insurance-what')!, ctx({ currency: 'EUR' })).join(' ');
    expect(what).toContain(`a phone worth ${MARK}500.`);
    // The example loan is scaled once (the principal), then worked out: never scaled twice.
    const repay = series.find((l) => l.id === 'loans-repay')!;
    const eurText = allText(repay, ctx({ ...noPocketMoney, currency: 'EUR' })).join(' ');
    const y = loanTotals(10_000, 20, 12);
    const l3 = loanTotals(10_000, 20, 36);
    expect(eurText).toContain(`You borrow ${MARK}100 at 20% a year over 12 months: ${fmt(y.installment)} a month.`);
    expect(eurText).toContain(`${fmt(y.installment)} a month, ${fmt(y.total)} in total (${fmt(y.interest)} interest)`);
    expect(eurText).toContain(`${fmt(l3.installment)} a month, ${fmt(l3.total)} in total (${fmt(l3.interest)} interest)`);
    expect(eurText).toContain(`Say you get ${MARK}20 a month. A quarter of it is ${MARK}5.`);
  });

  it('pocket money is the family’s own number: never scaled', () => {
    const repay = series.find((l) => l.id === 'loans-repay')!;
    for (const currency of ['ZAR', 'EUR']) {
      const text = allText(repay, ctx({ currency })).join(' ');
      expect(text, currency).toContain(`You get ${MARK}50 a week. A quarter of it is ${MARK}12.50.`);
    }
  });

  it('quiz answers are still right in rand and in euro', () => {
    for (const currency of ['ZAR', 'EUR']) {
      const r = ctx({ currency });
      const quiz = (id: string) => series.find((l) => l.id === id)!.quiz!(r);
      const answer = (x: QuizQuestion) => x.options[x.answer];
      const [loan] = quiz('loans-repay');
      const [a12, a36] = loan.options.slice(0, 2).map((o) => amounts([o])[0]);
      expect(36 * a36, currency).toBeGreaterThan(12 * a12);
      expect(loan.answer).toBe(1);
      const bike = quiz('insurance-what')[1];
      const [claim, excess] = amounts([bike.q]);
      expect(amounts([answer(bike)]), currency).toEqual([claim - excess]);
      const under = quiz('insurance-home-car')[2];
      const [worth, insured, stolen] = amounts([under.q]);
      expect(amounts([answer(under)]), currency).toEqual([(stolen * insured) / worth]);
      const screen = quiz('insurance-stuff')[0];
      const [repair, screenExcess] = amounts([screen.q]);
      expect(repair, currency).toBeLessThan(screenExcess);
      expect(answer(screen)).toBe('Nothing');
    }
  });

  it('"in our family" loan bits only when Loans is on', () => {
    for (const id of ['loans-how', 'loans-repay']) {
      const l = series.find((x) => x.id === id)!;
      const on = l.steps(ctx()).flatMap((s) => s.blocks.flatMap(textOf)).join(' ');
      const off = l.steps(ctx({ on: (k) => k !== 'loans' })).flatMap((s) => s.blocks.flatMap(textOf)).join(' ');
      expect(on, id).toContain('Ask for a loan');
      expect(off, id).not.toContain('Ask for a loan');
      expect(off, id).not.toMatch(/in our family/i);
    }
  });
});
