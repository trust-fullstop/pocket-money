// Money school reward (migration 20261116002500): a family setting "money per lesson" (lesson_reward_cents). A kid's first
// finish of a lesson pays it once, into the Wallet; lessons finished before there was a value can be rewarded later (at
// today's value, in this pay-out); the pay-out shows it as its own line.
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { PGlite } from '@electric-sql/pglite';
import { asRole, balance, clock, expectCode, finishArgs, makeDb, makeFamily, q, type Fam, type Person } from './helpers';
import { describeAudit } from '../src/features/family/audit';
import type { Member } from '../src/lib/types';

let db: PGlite;
beforeAll(async () => { db = await makeDb(); });
afterEach(() => { clock.now = null; });

type Row = Record<string, any>;
const setReward = (f: Fam, cents: unknown, by: Person = f.owner) =>
  by.rpc<any>('update_family', { p_patch: { settings: { lesson_reward_cents: cents } } });
const finish = (p: Person, lesson: string) => p.rpc<any>('finish_lesson', finishArgs(lesson));
const due = (p: Person) => p.rpc<any>('lesson_rewards_due');
const rewardPast = (p: Person, expected: number, member?: string) =>
  p.rpc<any>('reward_past_lessons', member ? { p_expected_cents: expected, p_member: member } : { p_expected_cents: expected });
/** All lesson-money rows of a member (not their undo rows). */
const lessonMoney = (member: string) =>
  q<Row>(db, `select id, amount, kind, pot, currency, reason, source_type, source_key, created_by, reversed_by, effective_at
                from public.transactions
               where member_id = $1 and source_type = 'lesson' and source_key like 'lesson-money:%'
               order by created_at, source_key`, [member]);
const allMoney = (family: string) =>
  q<{ n: number }>(db, `select count(*)::int as n from public.transactions where family_id = $1 and currency = 'money'`, [family]);
const summaryRow = async (f: Fam, member: string) =>
  (await f.owner.rpc<Row[]>('payout_summary')).find((r) => r.member_id === member)!;
const parts = (r: Row) =>
  r.start_cents + r.allowance_cents + r.rewards_cents + r.consequences_cents + r.loan_cents + r.lessons_cents + r.bible_cents + r.other_cents;

describe('the setting lesson_reward_cents', () => {
  let f: Fam;
  it('defaults to 0 (off)', async () => {
    f = await makeFamily(db, { Mum: 'parent', Sam: 'kid', Oma: 'grandparent' });
    const [d] = await q<{ v: unknown }>(db, `select app.default_settings()->'lesson_reward_cents' as v`);
    expect(d.v).toBe(0);
    const st = await f.Sam.rpc<any>('get_state');
    expect(st.family.settings.lesson_reward_cents).toBe(0);
  });

  it('accepts whole numbers 0..100000 and nothing else', async () => {
    for (const bad of [19.5, -1, 100001, '1900', true, null, { cents: 1 }]) {
      await expectCode(setReward(f, bad), 'invalid', 'setting:lesson_reward_cents');
    }
    let st = await setReward(f, 1900);
    expect(st.family.settings.lesson_reward_cents).toBe(1900);
    st = await setReward(f, 100000, f.Mum);
    expect(st.family.settings.lesson_reward_cents).toBe(100000);
    st = await setReward(f, 0);
    expect(st.family.settings.lesson_reward_cents).toBe(0);
    const [r] = await q<{ v: unknown }>(db, `select settings->'lesson_reward_cents' as v from public.families where id = $1`, [f.familyId]);
    expect(r.v).toBe(0);
  });

  it('kids and grandparents cannot change it', async () => {
    await expectCode(setReward(f, 100, f.Sam), 'not_allowed');
    await expectCode(setReward(f, 100, f.Oma), 'not_allowed');
  });

  it('a value stored some other way never pays more than the limit or a fraction', async () => {
    const [r] = await q<Row>(db, `select app.lesson_reward_cents('{"lesson_reward_cents":19.9}'::jsonb) as a,
      app.lesson_reward_cents('{"lesson_reward_cents":-5}'::jsonb) as b, app.lesson_reward_cents('{"lesson_reward_cents":"x"}'::jsonb) as c,
      app.lesson_reward_cents('{}'::jsonb) as d, app.lesson_reward_cents('{"lesson_reward_cents":9999999}'::jsonb) as e`);
    expect(r).toEqual({ a: 19, b: 0, c: 0, d: 0, e: 100000 });
  });
});

describe('finishing a lesson pays the reward once', () => {
  let f: Fam;
  it('a kid gets the money once (and the XP as before)', async () => {
    clock.now = '2026-11-20T09:00:00Z';
    f = await makeFamily(db, { Mum: 'parent', Sam: 'kid', Mia: 'kid', Oma: 'grandparent' });
    await setReward(f, 1900);
    const xp = await balance(db, f.Sam.id, 'points');
    const r1 = await finish(f.Sam, 'purpose');
    expect(r1).toMatchObject({ lesson: 'purpose', first: true, points: 5, money_cents: 1900 });
    expect(await balance(db, f.Sam.id, 'spending')).toBe(1900);
    expect(await balance(db, f.Sam.id, 'points')).toBe(xp + 5);
    const rows = await lessonMoney(f.Sam.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ amount: 1900, kind: 'bonus', pot: 'spending', currency: 'money',
      reason: 'Money school: Why this app?', source_key: 'lesson-money:purpose', created_by: f.Sam.id, reversed_by: null });
    // the XP row keeps its own key
    const xpRows = await q<Row>(db, `select source_key from public.transactions where member_id = $1 and currency = 'points'
                                         and source_type = 'lesson'`, [f.Sam.id]);
    expect(xpRows.map((x) => x.source_key)).toEqual(['lesson:purpose']);

    // again (retake): nothing more
    const r2 = await finish(f.Sam, 'purpose');
    expect(r2).toMatchObject({ first: false, points: 0, money_cents: 0, done_at: r1.done_at });
    expect(await balance(db, f.Sam.id, 'spending')).toBe(1900);
    expect(await balance(db, f.Sam.id, 'points')).toBe(xp + 5);
    expect(await lessonMoney(f.Sam.id)).toHaveLength(1);

    const [ld] = await q<Row>(db, `select money_cents, as_kid, points from public.lessons_done where member_id = $1`, [f.Sam.id]);
    expect(ld).toEqual({ money_cents: 1900, as_kid: true, points: 5 });
    expect(await f.Sam.rpc<any[]>('list_lessons_done')).toEqual([expect.objectContaining({ lesson: 'purpose', points: 5, money_cents: 1900 })]);

    const [a] = await q<Row>(db, `select details from public.audit_log where family_id = $1 and action = 'lesson.finish'`, [f.familyId]);
    expect(a.details).toEqual({ lesson: 'purpose', points: 5, money: 1900 });
  });

  it('grown-ups never get money (or XP)', async () => {
    expect(await finish(f.Mum, 'earn')).toMatchObject({ first: true, points: 0, money_cents: 0 });
    expect(await finish(f.owner, 'earn')).toMatchObject({ first: true, points: 0, money_cents: 0 });
    expect(await finish(f.Oma, 'earn')).toMatchObject({ first: true, points: 0, money_cents: 0 });
    for (const p of [f.Mum, f.owner, f.Oma]) {
      expect(await lessonMoney(p.id)).toHaveLength(0);
      const [ld] = await q<Row>(db, `select as_kid, money_cents from public.lessons_done where member_id = $1`, [p.id]);
      expect(ld).toEqual({ as_kid: false, money_cents: 0 });
    }
  });

  it('value 0 = no money', async () => {
    await setReward(f, 0);
    expect(await finish(f.Mia, 'earn')).toMatchObject({ first: true, points: 5, money_cents: 0 });
    expect(await lessonMoney(f.Mia.id)).toHaveLength(0);
    expect(await balance(db, f.Mia.id, 'spending')).toBe(0);
  });

  it('with points off a kid still gets the money (no XP)', async () => {
    const g = await makeFamily(db, { Sam: 'kid' });
    await g.owner.rpc('update_family', { p_patch: { settings: { features: { points: false }, lesson_reward_cents: 500 } } });
    expect(await finish(g.Sam, 'goals')).toMatchObject({ first: true, points: 0, money_cents: 500 });
    expect(await balance(db, g.Sam.id, 'spending')).toBe(500);
    expect(await balance(db, g.Sam.id, 'points')).toBe(0);
  });

  it('a theme lesson before its opening day: still not open for kids, so no money', async () => {
    const g = await makeFamily(db, { Sam: 'kid' }, 'Series', 'Europe/Amsterdam');
    await setReward(g, 300);
    clock.now = '2026-11-20T10:00:00Z';
    await g.owner.rpc('update_family', { p_patch: { settings: { lesson_plan: { '2026-12': ['borrow-protect'] } } } });
    clock.now = '2026-11-30T22:59:00Z'; // 23:59 on 30 Nov in Amsterdam
    await expectCode(finish(g.Sam, 'loans-how'), 'invalid', 'not_open');
    expect(await lessonMoney(g.Sam.id)).toHaveLength(0);
    clock.now = '2026-11-30T23:00:00Z'; // 1 Dec 00:00
    expect(await finish(g.Sam, 'loans-how')).toMatchObject({ first: true, money_cents: 300 });
    expect(await balance(db, g.Sam.id, 'spending')).toBe(300);
  });

  it('learn switched off: feature_off as before', async () => {
    const g = await makeFamily(db, { Sam: 'kid' });
    await g.owner.rpc('update_family', { p_patch: { settings: { features: { learn: false }, lesson_reward_cents: 500 } } });
    await expectCode(finish(g.Sam, 'earn'), 'feature_off', 'learn');
    expect(await lessonMoney(g.Sam.id)).toHaveLength(0);
  });
});

describe('lessons finished before there was a value', () => {
  let f: Fam;
  let other: Fam;
  it('lesson_rewards_due lists kids’ unpaid lessons at today’s value', async () => {
    clock.now = '2026-11-01T08:00:00Z';
    f = await makeFamily(db, { Mum: 'parent', Anna: 'parent', Oma: 'grandparent', Sam: 'kid', Mia: 'kid', Leo: 'kid' });
    other = await makeFamily(db, { Sam: 'kid' });
    clock.now = '2026-11-23T09:00:00Z'; // 10:00 on 23 Nov in Amsterdam
    for (const l of ['purpose', 'earn', 'why-save']) await finish(f.Sam, l);
    clock.now = '2026-11-23T09:05:00Z';
    for (const l of ['purpose', 'earn']) await finish(f.Mia, l);
    await finish(f.Leo, 'purpose');
    await finish(f.Mum, 'goals');
    await finish(f.Anna, 'interest'); // as a grown-up…
    await f.owner.rpc('set_role', { p_member: f.Anna.id, p_role: 'kid' }); // …who is a kid now: still no money for it

    let d = await due(f.owner);
    expect(d).toMatchObject({ cents_each: 0, count: 6, total_cents: 0 });
    expect(d.kids.map((k: Row) => [k.member_id, k.count])).toEqual([[f.Leo.id, 1], [f.Mia.id, 2], [f.Sam.id, 3]]);

    await f.owner.rpc('remove_member', { p_member: f.Leo.id }); // left the family: not listed
    await setReward(f, 1900);
    d = await due(f.Mum);
    expect(d).toEqual({
      cents_each: 1900, count: 5, total_cents: 9500,
      kids: [
        { member_id: f.Mia.id, count: 2, cents_each: 1900, total_cents: 3800, lessons: [
          { lesson: 'earn', title: 'How to earn more', done_at: expect.any(String) },
          { lesson: 'purpose', title: 'Why this app?', done_at: expect.any(String) }] },
        { member_id: f.Sam.id, count: 3, cents_each: 1900, total_cents: 5700, lessons: [
          { lesson: 'earn', title: 'How to earn more', done_at: expect.any(String) },
          { lesson: 'purpose', title: 'Why this app?', done_at: expect.any(String) },
          { lesson: 'why-save', title: 'Why save?', done_at: expect.any(String) }] },
      ],
    });
  });

  it('only managers', async () => {
    await expectCode(due(f.Sam), 'not_allowed');
    await expectCode(due(f.Oma), 'not_allowed');
    await expectCode(rewardPast(f.Sam, 9500), 'not_allowed');
    await expectCode(rewardPast(f.Oma, 9500), 'not_allowed');
    await expectCode(rewardPast(f.Anna, 0), 'not_allowed'); // Anna is a kid now
  });

  it('a wrong expected total → wrong_status and nothing is paid', async () => {
    const before = (await allMoney(f.familyId))[0].n;
    await expectCode(rewardPast(f.owner, 9400), 'wrong_status', 'amount_changed');
    await expectCode(rewardPast(f.owner, 3800), 'wrong_status', 'amount_changed'); // Mia's alone is not the whole family's
    expect((await allMoney(f.familyId))[0].n).toBe(before);
  });

  it('p_member: another family’s kid → not_found; a grown-up → not_allowed', async () => {
    await expectCode(rewardPast(f.owner, 0, other.Sam.id), 'not_found', 'member');
    await expectCode(rewardPast(f.owner, 0, f.Mum.id), 'not_allowed', 'member');
    await expectCode(rewardPast(f.owner, 1900, f.Leo.id), 'not_found', 'member'); // removed
  });

  it('pays one kid, then the rest, each lesson once, effective now', async () => {
    clock.now = '2026-11-30T10:00:00Z';
    expect(await rewardPast(f.Mum, 3800, f.Mia.id)).toEqual({ rewarded: 2, total_cents: 3800 });
    expect(await due(f.owner)).toMatchObject({ count: 3, total_cents: 5700, kids: [{ member_id: f.Sam.id }] });
    expect(await rewardPast(f.owner, 5700)).toEqual({ rewarded: 3, total_cents: 5700 });
    expect(await balance(db, f.Sam.id, 'spending')).toBe(5700);
    expect(await balance(db, f.Mia.id, 'spending')).toBe(3800);
    const rows = await lessonMoney(f.Sam.id);
    expect(rows.map((r) => [r.source_key, r.amount, r.kind, r.reason, r.created_by])).toEqual([
      ['lesson-money:earn', 1900, 'bonus', 'Money school: How to earn more (finished 23 Nov)', f.owner.id],
      ['lesson-money:purpose', 1900, 'bonus', 'Money school: Why this app? (finished 23 Nov)', f.owner.id],
      ['lesson-money:why-save', 1900, 'bonus', 'Money school: Why save? (finished 23 Nov)', f.owner.id],
    ]);
    for (const r of rows) expect(new Date(r.effective_at).toISOString()).toBe('2026-11-30T10:00:00.000Z');
    expect((await lessonMoney(f.Mia.id))[0].created_by).toBe(f.Mum.id);
    // nothing for the grown-up rows or the removed kid
    for (const p of [f.Anna, f.Mum, f.Leo]) expect(await lessonMoney(p.id)).toHaveLength(0);
    const ld = await q<Row>(db, `select lesson, money_cents from public.lessons_done where member_id = $1 order by lesson`, [f.Sam.id]);
    expect(ld.map((r) => r.money_cents)).toEqual([1900, 1900, 1900]);
    const mine = await f.owner.rpc<any[]>('list_lessons_done');
    expect(mine.filter((r) => r.member_id === f.Sam.id).map((r) => r.money_cents)).toEqual([1900, 1900, 1900]);
    expect(mine.find((r) => r.member_id === f.Anna.id).money_cents).toBe(0);

    const audit = await q<Row>(db, `select actor, details from public.audit_log where family_id = $1 and action = 'lesson.reward_past'
                                     order by id`, [f.familyId]);
    expect(audit.map((a) => a.details)).toEqual([
      { member: f.Mia.id, rewarded: 2, total_cents: 3800, cents_each: 1900, kids: { [f.Mia.id]: 2 } },
      { member: null, rewarded: 3, total_cents: 5700, cents_each: 1900, kids: { [f.Sam.id]: 3 } },
    ]);
  });

  it('a second time pays nothing', async () => {
    expect(await due(f.owner)).toEqual({ cents_each: 1900, count: 0, total_cents: 0, kids: [] });
    expect(await rewardPast(f.owner, 0)).toEqual({ rewarded: 0, total_cents: 0 });
    await expectCode(rewardPast(f.owner, 5700), 'wrong_status', 'amount_changed');
    expect(await balance(db, f.Sam.id, 'spending')).toBe(5700);
    // and finishing again pays nothing either
    expect(await finish(f.Sam, 'purpose')).toMatchObject({ first: false, money_cents: 0 });
    expect(await lessonMoney(f.Sam.id)).toHaveLength(3);
  });

  it('a kid who was a grown-up gets money for lessons finished as a kid', async () => {
    expect(await finish(f.Anna, 'how-save')).toMatchObject({ first: true, money_cents: 1900 });
    expect((await due(f.owner)).count).toBe(0);
  });

  it('no value → invalid no_reward; learn off → feature_off', async () => {
    const g = await makeFamily(db, { Sam: 'kid' });
    await finish(g.Sam, 'purpose');
    await expectCode(rewardPast(g.owner, 0), 'invalid', 'no_reward');
    await g.owner.rpc('update_family', { p_patch: { settings: { lesson_reward_cents: 100, features: { learn: false } } } });
    await expectCode(rewardPast(g.owner, 100), 'feature_off', 'learn');
    expect(await lessonMoney(g.Sam.id)).toHaveLength(0);
  });

  it('the activity log reads well', () => {
    const byId = { [f.Sam.id]: { display_name: 'Sam' } } as unknown as Record<string, Member>;
    const say = (action: string, details: Record<string, unknown>) =>
      describeAudit({ id: 1, actor: null, action, details, created_at: '' }, byId, 'EUR').text.replace(/\s/g, ' ');
    expect(say('lesson.reward_past', { member: null, rewarded: 3, total_cents: 5700, cents_each: 1900 }))
      .toBe('Gave the Money school reward for 3 earlier lessons (€57)');
    expect(say('lesson.reward_past', { member: f.Sam.id, rewarded: 1, total_cents: 1900, cents_each: 1900 }))
      .toBe('Gave Sam the Money school reward for 1 earlier lesson (€19)');
    expect(say('lesson.finish', { lesson: 'purpose', points: 5, money: 1900 }))
      .toBe('Finished the Money school lesson “Why this app?” (+€19, +5 XP)');
    expect(say('lesson.finish', { lesson: 'goals', points: 0, money: 0 })).toBe('Finished the Money school lesson “Saving for a goal”');
    expect(say('family.update', { settings: { lesson_reward_cents: 1900 } })).toBe('Changed the family Money school reward');
  });
});

describe('undo and races', () => {
  it('an undone reward is never listed or paid again', async () => {
    const f = await makeFamily(db, { Mum: 'parent', Sam: 'kid' });
    await setReward(f, 1000);
    await finish(f.Sam, 'purpose');
    const [tx] = await lessonMoney(f.Sam.id);
    await f.Mum.rpc('reverse_transaction', { p_tx: tx.id, p_reason: 'Clicked through' });
    expect(await balance(db, f.Sam.id, 'spending')).toBe(0);
    expect((await due(f.owner)).count).toBe(0);
    expect(await rewardPast(f.owner, 0)).toEqual({ rewarded: 0, total_cents: 0 });
    expect(await finish(f.Sam, 'purpose')).toMatchObject({ first: false, money_cents: 0 });
    expect(await balance(db, f.Sam.id, 'spending')).toBe(0);
    expect(await lessonMoney(f.Sam.id)).toHaveLength(1);
    expect((await f.owner.rpc<any[]>('list_lessons_done'))[0]).toMatchObject({ lesson: 'purpose', money_cents: 0 });
    // the one writer refuses too
    const [r] = await q<Row>(db, `select app.reward_lesson(f, m, 'purpose', 1000, 'again', null) as got
                                    from public.families f, public.members m where f.id = $1 and m.id = $2`, [f.familyId, f.Sam.id]);
    expect(r.got).toBe(0);
    const row = await summaryRow(f, f.Sam.id);
    expect(row).toMatchObject({ lessons_cents: 0, lessons_count: 0, lessons_each_cents: null, lessons_unrewarded: 0,
      lessons_finished: 1, rewards_cents: 0, wallet_cents: 0 });
    expect(parts(row)).toBe(row.wallet_cents);
  });

  it('finished (paid) then the backlog: paid once', async () => {
    const f = await makeFamily(db, { Sam: 'kid' });
    await finish(f.Sam, 'why-save'); // value 0: unpaid
    await setReward(f, 700);
    expect(await finish(f.Sam, 'earn')).toMatchObject({ money_cents: 700 });
    expect(await due(f.owner)).toMatchObject({ count: 1, total_cents: 700 });
    expect(await rewardPast(f.owner, 700)).toEqual({ rewarded: 1, total_cents: 700 });
    expect(await balance(db, f.Sam.id, 'spending')).toBe(1400);
    expect((await lessonMoney(f.Sam.id)).map((r) => r.source_key).sort()).toEqual(['lesson-money:earn', 'lesson-money:why-save']);
  });

  it('the writer only pays a kid’s own lesson rows', async () => {
    const f = await makeFamily(db, { Mum: 'parent', Sam: 'kid' });
    await finish(f.Mum, 'earn');
    const got = async (member: string, lesson: string) => (await q<Row>(db,
      `select app.reward_lesson(f, m, $3, 500, 'x', null) as got from public.families f, public.members m
        where f.id = $1 and m.id = $2`, [f.familyId, member, lesson]))[0].got;
    expect(await got(f.Mum.id, 'earn')).toBe(0); // not a kid
    expect(await got(f.Sam.id, 'earn')).toBe(0); // no finished row
    expect(await got(f.Sam.id, 'nope')).toBe(0);
    expect(await allMoney(f.familyId)).toEqual([{ n: 0 }]);
  });
});

describe('pay-out: the Money school line', () => {
  let f: Fam;
  it('lessons get their own bucket, and it all adds up', async () => {
    clock.now = '2026-11-02T08:00:00Z';
    f = await makeFamily(db, { Mum: 'parent', Sam: 'kid', Mia: 'kid', Oma: 'grandparent' });
    await f.owner.rpc('update_member', { p_member: f.Sam.id, p_patch: { allowance_cents: 500 } });
    clock.now = '2026-11-02T09:00:00Z';
    let row = await summaryRow(f, f.Sam.id);
    expect(row).toMatchObject({ allowance_cents: 500, lessons_cents: 0, lessons_count: 0, lessons_each_cents: null,
      lessons_finished: 0, lessons_unrewarded: 0 });

    clock.now = '2026-11-03T09:00:00Z';
    await finish(f.Sam, 'purpose'); // value 0
    await finish(f.Sam, 'earn');
    row = await summaryRow(f, f.Sam.id);
    expect(row).toMatchObject({ lessons_cents: 0, lessons_count: 0, lessons_each_cents: null, lessons_finished: 2, lessons_unrewarded: 2 });
    expect(parts(row)).toBe(row.wallet_cents);

    clock.now = '2026-11-04T09:00:00Z';
    await setReward(f, 1900);
    await finish(f.Sam, 'why-save');
    await f.owner.rpc('spot', { p: { member_id: f.Sam.id, direction: 'plus', cents: 300, reason: 'Helped' } });
    row = await summaryRow(f, f.Sam.id);
    expect(row).toMatchObject({ wallet_cents: 2700, allowance_cents: 500, rewards_cents: 300, lessons_cents: 1900, lessons_count: 1,
      lessons_each_cents: 1900, lessons_finished: 3, lessons_unrewarded: 2 });
    expect(parts(row)).toBe(row.wallet_cents);

    clock.now = '2026-11-05T09:00:00Z';
    await rewardPast(f.owner, 3800);
    row = await summaryRow(f, f.Sam.id);
    expect(row).toMatchObject({ wallet_cents: 6500, rewards_cents: 300, lessons_cents: 5700, lessons_count: 3, lessons_each_cents: 1900,
      lessons_unrewarded: 0 });
    expect(parts(row)).toBe(row.wallet_cents);

    clock.now = '2026-11-06T09:00:00Z';
    await setReward(f, 2000);
    await finish(f.Sam, 'how-save');
    row = await summaryRow(f, f.Sam.id);
    expect(row).toMatchObject({ wallet_cents: 8500, lessons_cents: 7700, lessons_count: 4, lessons_each_cents: null, lessons_finished: 4 });
    expect(parts(row)).toBe(row.wallet_cents);
    expect(await summaryRow(f, f.Mia.id)).toMatchObject({ lessons_cents: 0, lessons_count: 0, lessons_each_cents: null,
      lessons_finished: 0, lessons_unrewarded: 0 });
  });

  it('after a pay-out the line starts again; an undo after the cut counts in this cycle', async () => {
    clock.now = '2026-11-07T09:00:00Z';
    await f.Mum.rpc('record_payout', { p_member: f.Sam.id, p_expected_cents: 8500, p_request: crypto.randomUUID() });
    let row = await summaryRow(f, f.Sam.id);
    expect(row).toMatchObject({ wallet_cents: 0, start_cents: 0, lessons_cents: 0, lessons_count: 0, lessons_each_cents: null,
      lessons_finished: 0, lessons_unrewarded: 0 });

    clock.now = '2026-11-08T09:00:00Z';
    const howSave = (await lessonMoney(f.Sam.id)).find((r) => r.source_key === 'lesson-money:how-save')!;
    await f.Mum.rpc('reverse_transaction', { p_tx: howSave.id, p_reason: 'Too much' });
    row = await summaryRow(f, f.Sam.id);
    expect(row).toMatchObject({ wallet_cents: -2000, owes_cents: 2000, rewards_cents: 0, lessons_cents: -2000, lessons_count: 0,
      lessons_each_cents: null, lessons_unrewarded: 0 });
    expect(parts(row)).toBe(row.wallet_cents);

    clock.now = '2026-11-09T09:00:00Z'; // Monday: pocket money too
    await finish(f.Sam, 'interest');
    row = await summaryRow(f, f.Sam.id);
    expect(row).toMatchObject({ allowance_cents: 500, wallet_cents: 500, lessons_cents: 0, lessons_count: 1,
      lessons_each_cents: null, lessons_finished: 1 });
    expect(parts(row)).toBe(row.wallet_cents);
    await finish(f.Sam, 'goals');
    row = await summaryRow(f, f.Sam.id);
    expect(row).toMatchObject({ wallet_cents: 2500, lessons_cents: 2000, lessons_count: 2, lessons_each_cents: null, lessons_finished: 2 });
    expect(parts(row)).toBe(row.wallet_cents);

    // the next cycle: one amount again
    clock.now = '2026-11-10T09:00:00Z';
    await f.Mum.rpc('record_payout', { p_member: f.Sam.id, p_expected_cents: 2500, p_request: crypto.randomUUID() });
    await f.owner.rpc('update_family', { p_patch: { settings: { lesson_plan: { '2026-12': ['borrow-protect'] } } } });
    clock.now = '2026-12-02T09:00:00Z';
    expect(await finish(f.Sam, 'loans-how')).toMatchObject({ money_cents: 2000 });
    row = await summaryRow(f, f.Sam.id);
    expect(row).toMatchObject({ lessons_cents: 2000, lessons_count: 1, lessons_each_cents: 2000, lessons_finished: 1,
      lessons_unrewarded: 0 });
    expect(parts(row)).toBe(row.wallet_cents);
    expect(row.wallet_cents).toBe(await balance(db, f.Sam.id, 'spending'));
  });

  it('a lesson reward that is undone in the same cycle drops out of the count', async () => {
    const g = await makeFamily(db, { Mum: 'parent', Sam: 'kid' });
    await setReward(g, 400);
    await finish(g.Sam, 'purpose');
    await finish(g.Sam, 'earn');
    const [first] = await lessonMoney(g.Sam.id);
    await g.Mum.rpc('reverse_transaction', { p_tx: first.id, p_reason: 'Oops' });
    const row = await summaryRow(g, g.Sam.id);
    expect(row).toMatchObject({ wallet_cents: 400, lessons_cents: 400, lessons_count: 1, lessons_each_cents: null, rewards_cents: 0 });
    expect(parts(row)).toBe(row.wallet_cents);
  });

  it('grandparents and kids cannot see the pay-out', async () => {
    await expectCode(f.Oma.rpc('payout_summary'), 'not_allowed');
    await expectCode(f.Sam.rpc('payout_summary'), 'not_allowed');
  });
});

describe('grants', () => {
  it('anon cannot run the new RPCs, authenticated can; the helpers are internal', async () => {
    const fns = ['public.lesson_rewards_due()', 'public.reward_past_lessons(int, uuid)', 'public.finish_lesson(text, integer[])',
      'public.list_lessons_done()', 'public.update_family(jsonb)'];
    for (const fn of fns) {
      const [r] = await q<Row>(db, `select has_function_privilege('anon', $1, 'execute') as anon,
                                           has_function_privilege('authenticated', $1, 'execute') as auth`, [fn]);
      expect(r, fn).toEqual({ anon: false, auth: true });
    }
    for (const fn of ['app.reward_lesson(public.families, public.members, text, int, text, uuid)', 'app.lessons_unpaid(uuid)',
      'app.lessons_due_json(public.families, int)', 'app.lesson_reward_cents(jsonb)', 'app.payout_kid(public.members, public.families)']) {
      const [r] = await q<Row>(db, `select has_function_privilege('anon', $1, 'execute') as anon,
                                           has_function_privilege('authenticated', $1, 'execute') as auth`, [fn]);
      expect(r, fn).toEqual({ anon: false, auth: false });
    }
    await expect(asRole(db, 'anon', `select public.lesson_rewards_due()`)).rejects.toThrow(/permission denied/);
    await expect(asRole(db, 'anon', `select public.reward_past_lessons(0, null)`)).rejects.toThrow(/permission denied/);
  });
});

describe('backfill of rows from before the migration', () => {
  it('marks rows of current kids as_kid, leaves grown-ups alone, and is safe to run twice', async () => {
    const f = await makeFamily(db, { Mum: 'parent', Leo: 'kid' });
    await f.owner.rpc('update_family', { p_patch: { settings: { features: { learn: true }, lesson_reward_cents: 0 } } });
    await finish(f.Leo, 'purpose');
    await finish(f.Leo, 'earn');
    await finish(f.Mum, 'purpose');
    // Pretend these rows predate the migration: the columns would have been added with their defaults.
    await db.exec(`update public.lessons_done set as_kid = false, money_cents = 0 where family_id = '${f.familyId}'`);
    const sql = readFileSync(fileURLToPath(new URL('../supabase/migrations/20261116002500_lesson_rewards.sql', import.meta.url)), 'utf8');
    const rows = () => q<Row>(db, `select member_id, lesson, as_kid from public.lessons_done where family_id = $1 order by member_id, lesson`, [f.familyId]);
    await db.exec(sql);
    const once = await rows();
    expect(once.filter((r) => r.member_id === f.Leo.id).every((r) => r.as_kid)).toBe(true);
    expect(once.filter((r) => r.member_id === f.Mum.id).every((r) => !r.as_kid)).toBe(true);
    await db.exec(sql);
    expect(await rows()).toEqual(once);
    await setReward(f, 1900);
    const d = await due(f.owner);
    expect(d.kids.map((k: Row) => [k.member_id, k.count])).toEqual([[f.Leo.id, 2]]);
  });
});
