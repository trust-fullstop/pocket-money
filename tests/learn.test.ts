// Money school (feature 'learn') and the 'faith' switch (migration 20261116001700).
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { balance, clock, expectCode, makeDb, makeFamily, q, type Fam } from './helpers';
import { CORE_LESSON_IDS } from '../src/features/help/learn/types';
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
  it('server whitelist matches the app', async () => {
    const [r] = await q<{ l: Record<string, string> }>(db, 'select app.lessons() as l');
    expect(Object.keys(r.l).sort()).toEqual([...CORE_LESSON_IDS].sort());
  });

  it('a kid finishes a lesson once and gets +5 XP once', async () => {
    f = await makeFamily(db, { Sam: 'kid', Mia: 'kid', Mum: 'parent' });
    // makeFamily switches everything on (points included)
    const before = await balance(db, f.Sam.id, 'points');
    const r1 = await f.Sam.rpc<any>('finish_lesson', { p_lesson: 'interest' });
    expect(r1).toMatchObject({ lesson: 'interest', first: true, points: 5 });
    const r2 = await f.Sam.rpc<any>('finish_lesson', { p_lesson: 'interest' });
    expect(r2).toMatchObject({ lesson: 'interest', first: false, points: 0, done_at: r1.done_at });
    expect(await balance(db, f.Sam.id, 'points')).toBe(before + 5);
    const [tx] = await q<any>(db, `select kind, reason from public.transactions where member_id = $1 and source_type = 'lesson'`, [f.Sam.id]);
    expect(tx).toEqual({ kind: 'bonus', reason: 'Money school: How interest works' });
  });

  it('grown-ups can do lessons too, without XP', async () => {
    const r = await f.Mum.rpc<any>('finish_lesson', { p_lesson: 'why-save' });
    expect(r).toMatchObject({ first: true, points: 0 });
  });

  it('no XP when points are off', async () => {
    await f.owner.rpc('update_family', { p_patch: { settings: { features: { points: false } } } });
    const r = await f.Mia.rpc<any>('finish_lesson', { p_lesson: 'goals' });
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
    await expectCode(f.Sam.rpc('finish_lesson', { p_lesson: 'nope' }), 'invalid', 'lesson');
    await expectCode(f.Sam.rpc('finish_lesson', { p_lesson: 'faith-giving' }), 'invalid', 'lesson');
    await f.owner.rpc('update_family', { p_patch: { settings: { features: { learn: false } } } });
    await expectCode(f.Sam.rpc('finish_lesson', { p_lesson: 'earn' }), 'feature_off', 'learn');
  });

  it('only signed-in members can call the lesson functions', async () => {
    const [p] = await q<{ anon_f: boolean; anon_l: boolean; auth_f: boolean; auth_l: boolean }>(db, `select
      has_function_privilege('anon', 'public.finish_lesson(text)', 'execute') as anon_f,
      has_function_privilege('anon', 'public.list_lessons_done()', 'execute') as anon_l,
      has_function_privilege('authenticated', 'public.finish_lesson(text)', 'execute') as auth_f,
      has_function_privilege('authenticated', 'public.list_lessons_done()', 'execute') as auth_l`);
    expect(p).toEqual({ anon_f: false, anon_l: false, auth_f: true, auth_l: true });
  });
});
