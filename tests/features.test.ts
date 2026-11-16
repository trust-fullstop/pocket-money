// Feature switches (settings.features): "start small" defaults, merge semantics, FEATURE_NEEDS, every
// enforcement point (feature_off + detail = key), the timed rules (no back-pay), and the "Ask Pocket" helper.
import { describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { EVERYTHING, START_SMALL, type Features } from '../src/lib/types';
import { asRole, clock, expectCode, makeDb, makeFamily, q, type Fam } from './helpers';

let db: PGlite;

const rows = (member: string, kind: string) =>
  q(db, `select currency, amount, source_key from public.transactions where member_id = $1 and kind = $2
          order by effective_at, currency`, [member, kind]).then((r) => r.map((x) => [x.currency, x.amount, x.source_key]));
const keys = (member: string, kind: string) => rows(member, kind).then((r) => r.map((x) => x[2]));
const patchFeatures = (F: Fam, features: Partial<Features>, who: keyof Fam = 'owner') =>
  (F[who] as Fam['owner']).rpc<any>('update_family', { p_patch: { settings: { features } } });

describe('settings.features', () => {
  let S: Fam;

  it('a new family starts small', async () => {
    clock.now = '2026-11-16T08:00:00Z';
    db = await makeDb();
    S = await makeFamily(db, { Mum: 'parent', Sam: 'kid', Oma: 'grandparent' }, 'Small', 'Europe/Amsterdam', {});
    expect((await S.Sam.rpc<any>('get_state')).family.settings.features).toEqual(START_SMALL);
    const on = await q(db, `select k, app.feature_on($1, k) as on from unnest(app.feature_keys()) k`, [S.familyId]);
    expect(Object.fromEntries(on.map((x) => [x.k, x.on]))).toEqual(START_SMALL);
  });

  it('update_family merges switches (managers only, known keys, booleans)', async () => {
    let st = await patchFeatures(S, { savings: true }, 'Mum');
    expect(st.family.settings.features).toEqual({ ...START_SMALL, savings: true });
    st = await S.owner.rpc<any>('update_family', { p_patch: { settings: { interest_pct_month: 3, features: { goals: true, time: true } } } });
    expect(st.family.settings.features).toEqual({ ...START_SMALL, savings: true, goals: true, time: true });
    expect(st.family.settings.interest_pct_month).toBe(3);
    await expectCode(patchFeatures(S, { savings: false }, 'Sam'), 'not_allowed');
    await expectCode(patchFeatures(S, { savings: false }, 'Oma'), 'not_allowed');
    const bad = (settings: unknown) => S.owner.rpc('update_family', { p_patch: { settings } });
    await expectCode(bad({ features: true }), 'invalid', 'setting:features');
    await expectCode(bad({ features: { coffee: true } }), 'invalid', 'setting:features');
    await expectCode(bad({ features: { savings: 'yes' } }), 'invalid', 'setting:features');
    await expectCode(bad({ features: { savings: null } }), 'invalid', 'setting:features');
    await expectCode(bad('features'), 'invalid', 'settings');
    // nothing of the rejected patches was stored
    expect((await S.Sam.rpc<any>('get_state')).family.settings.features).toEqual({ ...START_SMALL, savings: true, goals: true, time: true });
  });

  it('interest, saver rules and goals need savings', async () => {
    await patchFeatures(S, { savings: false, interest: true, saver_rules: true });
    const st = await S.Sam.rpc<any>('get_state');
    expect(st.family.settings.features).toMatchObject({ savings: false, interest: true, saver_rules: true, goals: true });
    const eff = async (k: string) => (await q(db, `select app.feature_on($1, $2) as on`, [S.familyId, k]))[0].on;
    expect([await eff('interest'), await eff('saver_rules'), await eff('goals')]).toEqual([false, false, false]);
    await expectCode(S.Sam.rpc('upsert_goal', { p: { member_id: S.Sam.id, title: 'Bike', target_cents: 10000 } }), 'feature_off', 'goals');
    await patchFeatures(S, { savings: true });
    expect([await eff('interest'), await eff('saver_rules'), await eff('goals')]).toEqual([true, true, true]);
    await S.Sam.rpc('upsert_goal', { p: { member_id: S.Sam.id, title: 'Bike', target_cents: 10000 } });
  });
});

describe('enforcement (feature_off, detail = the switch)', () => {
  let E: Fam;
  const chore = (extra: Record<string, unknown> = {}) => ({ title: 'Dishes', kind: 'chore', assignees: [E.Sam.id], repeat: 'daily',
    start_on: '2026-11-16', due_time: '19:00', evidence: 'none', ...extra });
  const spot = (extra: Record<string, unknown>) =>
    E.owner.rpc<any>('spot', { p: { member_id: E.Sam.id, direction: 'plus', reason: 'Spotted', ...extra } });

  it('tasks: challenges, minutes and points', async () => {
    clock.now = '2026-11-16T08:00:00Z';
    db = await makeDb();
    E = await makeFamily(db, { Mum: 'parent', Sam: 'kid' }, 'Enforce', 'Europe/Amsterdam', {});
    await expectCode(E.owner.rpc('create_task', { p_task: chore({ kind: 'challenge' }) }), 'feature_off', 'challenges');
    await expectCode(E.Sam.rpc('create_task', { p_task: chore({ assignees: [E.Sam.id, E.owner.id], reward_points: 5 }) }),
      'feature_off', 'challenges'); // kids only create challenges
    await expectCode(E.owner.rpc('create_task', { p_task: chore({ reward_minutes: 10 }) }), 'feature_off', 'time');
    await expectCode(E.owner.rpc('create_task', { p_task: chore({ penalty_minutes: 10 }) }), 'feature_off', 'time');
    const t = await E.owner.rpc<any>('create_task', { p_task: chore({ reward_cents: 50, reward_points: 5 }) });

    await patchFeatures(E, { points: false });
    await expectCode(E.owner.rpc('create_task', { p_task: chore({ reward_points: 1 }) }), 'feature_off', 'points');
    await expectCode(E.owner.rpc('create_task', { p_task: chore({ penalty_points: 1 }) }), 'feature_off', 'points');
    await expectCode(E.owner.rpc('update_task', { p_group: t.group_id, p_patch: { reward_points: 6 } }), 'feature_off', 'points');
    // keeping or lowering what is already there is fine (a full form re-sent by the UI)
    await E.owner.rpc('update_task', { p_group: t.group_id, p_patch: { title: 'Dishes!', reward_points: 2 } });
    // approving while points are off pays the money only
    const [i] = (await E.Sam.rpc<any[]>('list_instances', { p_from: '2026-11-16', p_to: '2026-11-16', p_member: E.Sam.id }))
      .filter((x) => x.group_id === t.group_id);
    await E.Sam.rpc('submit_task', { p_instance: i.id, p_before: null, p_after: null, p_note: null });
    await E.Mum.rpc('decide_task', { p_instance: i.id, p_approve: true, p_note: null });
    expect(await rows(E.Sam.id, 'task_reward')).toEqual([['money', 50, 'reward:money']]);

    await patchFeatures(E, { challenges: true, points: true });
    const c = await E.Sam.rpc<any>('create_task', { p_task: chore({ title: 'Beat Dad at chess', assignees: [E.Sam.id, E.owner.id],
      repeat: 'once', reward_points: 5 }) });
    // a submitted challenge leaves the approvals badge and list while challenges are off (the UI hides them)
    const [dad] = (await E.owner.rpc<any[]>('list_instances', { p_from: '2026-11-16', p_to: '2026-11-16', p_member: E.owner.id }))
      .filter((x) => x.group_id === c.group_id);
    await E.owner.rpc('submit_task', { p_instance: dad.id, p_before: null, p_after: null, p_note: null });
    const approvals = async () => [(await E.Mum.rpc<any>('get_state')).counts.approvals,
      (await E.Mum.rpc<any[]>('list_approvals')).map((x) => x.id)];
    expect(await approvals()).toEqual([1, [dad.id]]);
    await patchFeatures(E, { challenges: false });
    expect(await approvals()).toEqual([0, []]);
    await expectCode(E.owner.rpc('update_task', { p_group: c.group_id, p_patch: { title: 'Chess' } }), 'feature_off', 'challenges');
  });

  it('spot: spotted, plus minutes need time and points need points', async () => {
    await expectCode(spot({ minutes: 10 }), 'feature_off', 'time');
    await spot({ cents: 100, points: 1 });
    await patchFeatures(E, { points: false });
    await expectCode(spot({ points: 1 }), 'feature_off', 'points');
    await patchFeatures(E, { spotted: false });
    await expectCode(spot({ cents: 100 }), 'feature_off', 'spotted');
    await expectCode(E.Sam.rpc('spot', { p: { member_id: E.Sam.id, direction: 'plus', cents: 1, reason: 'x' } }), 'feature_off', 'spotted');
    await patchFeatures(E, { spotted: true, points: true });
  });

  it('money: transfers need savings, requests need requests (+ savings / time)', async () => {
    await expectCode(E.Sam.rpc('transfer', { p_member: E.Sam.id, p_amount: 50, p_to: 'savings' }), 'feature_off', 'savings');
    await expectCode(E.owner.rpc('transfer', { p_member: E.Sam.id, p_amount: 50, p_to: 'spending' }), 'feature_off', 'savings');
    const req = (p_kind: string, p_amount = 20) => E.Sam.rpc<any>('create_request', { p_kind, p_amount, p_label: null, p_note: null });
    const spend = await req('spend');
    await expectCode(req('withdraw'), 'feature_off', 'savings');
    await expectCode(req('time', 5), 'feature_off', 'time');
    await patchFeatures(E, { requests: false });
    await expectCode(req('spend'), 'feature_off', 'requests');
    await expectCode(req('withdraw'), 'feature_off', 'requests');
    await E.Mum.rpc('decide_request', { p_request: spend.id, p_approve: false, p_note: null }); // open ones can still be decided
    await patchFeatures(E, { requests: true, savings: true, time: true });
    await E.Sam.rpc('transfer', { p_member: E.Sam.id, p_amount: 50, p_to: 'savings' });
    await req('withdraw');
    await expectCode(req('time', 5), 'insufficient'); // past the switch
  });

  it('goals, targets, calendar and devices', async () => {
    await expectCode(E.Sam.rpc('upsert_goal', { p: { member_id: E.Sam.id, title: 'Bike', target_cents: 10000 } }), 'feature_off', 'goals');
    const target = { member_id: E.Sam.id, title: 'All chores', period: 'week', metric: 'completion_pct', threshold: 80, prize_cents: 100 };
    await expectCode(E.owner.rpc('upsert_target', { p: target }), 'feature_off', 'targets');
    await expectCode(E.Sam.rpc('upsert_target', { p: target }), 'feature_off', 'targets');
    await expectCode(E.owner.rpc('upsert_device', { p: { name: 'Tablet', type: 'tablet', owner_id: E.Sam.id } }), 'feature_off', 'devices');
    await E.owner.rpc('upsert_event', { p: { title: 'Swimming', kind: 'event', starts_at: '2026-11-20T10:00:00Z' } }); // on by default
    await patchFeatures(E, { goals: true, targets: true, devices: true });
    await E.Sam.rpc('upsert_goal', { p: { member_id: E.Sam.id, title: 'Bike', target_cents: 10000 } });
    await E.owner.rpc('upsert_target', { p: target });
    await E.owner.rpc('upsert_device', { p: { name: 'Tablet', type: 'tablet', owner_id: E.Sam.id } });

    await patchFeatures(E, { calendar: false, goals: false, targets: false, devices: false, savings: false });
    await expectCode(E.owner.rpc('upsert_event', { p: { title: 'Party', kind: 'event', starts_at: '2026-11-21T10:00:00Z' } }),
      'feature_off', 'calendar');
    // reads keep working while a feature is off
    expect(await E.Sam.rpc<any[]>('list_events', { p_from: '2026-11-16T00:00:00Z', p_to: '2026-11-30T00:00:00Z' })).toHaveLength(1);
    expect(await E.Sam.rpc<any[]>('list_devices')).toHaveLength(1);
    const w = await E.Sam.rpc<any>('wallet', { p_member: E.Sam.id, p_history_limit: 5 });
    expect(w.balances.savings).toBe(50);
  });
});

describe('timed rules follow the switches and never back-pay', () => {
  it('skips allowance, interest, saver rules, targets and switched-off penalty currencies', async () => {
    clock.now = '2026-11-02T08:00:00Z'; // Monday 09:00 CET
    db = await makeDb();
    const O = await makeFamily(db, { Sam: 'kid' }, 'Off');
    await O.owner.rpc('update_member', { p_member: O.Sam.id, p_patch: { allowance_cents: 500 } });
    await O.owner.rpc('spot', { p: { member_id: O.Sam.id, direction: 'plus', cents: 10000, reason: 'Birthday' } });
    await O.Sam.rpc('transfer', { p_member: O.Sam.id, p_amount: 10000, p_to: 'savings' });
    const tg = await O.owner.rpc<any>('upsert_target', { p: { member_id: O.Sam.id, title: 'Always', period: 'week',
      metric: 'points_earned', threshold: 0, prize_cents: 100 } });
    await O.owner.rpc('create_task', { p_task: { title: 'Bed', kind: 'chore', assignees: [O.Sam.id], repeat: 'once',
      start_on: '2026-11-02', due_time: '19:00', evidence: 'none', penalty_cents: 50, penalty_minutes: 10, penalty_points: 3 } });
    await patchFeatures(O, { allowance: false, interest: false, saver_rules: false, targets: false, time: false, points: false });
    await O.owner.rpc('tick');

    clock.now = '2026-11-09T08:00:00Z';
    expect((await O.Sam.rpc<any>('tick')).weeks_closed).toBe(1);
    for (const kind of ['allowance', 'interest', 'saver_bonus', 'no_savings_penalty', 'prize']) expect(await rows(O.Sam.id, kind)).toEqual([]);
    expect(await q(db, `select 1 from public.target_results where target_id = $1`, [tg.id])).toEqual([]);
    expect(await rows(O.Sam.id, 'task_penalty')).toEqual([['money', -50, 'penalty:money']]);
    expect(await q(db, `select 1 from public.period_runs where family_id = $1 and period = 'week' and period_start = '2026-11-02'`,
      [O.familyId])).toHaveLength(1);

    // switched on again on Monday 9 Nov: nothing for the closed week, allowance from this week on
    await patchFeatures(O, EVERYTHING);
    const since = await q(db, `select period from public.period_runs where family_id = $1 and period like 'feature_on:%'
                                 and period_start = '2026-11-09' order by period`, [O.familyId]);
    expect(since.map((x) => x.period)).toEqual(['feature_on:allowance', 'feature_on:interest', 'feature_on:points',
      'feature_on:saver_rules', 'feature_on:targets', 'feature_on:time']);
    await O.owner.rpc('tick');
    expect(await keys(O.Sam.id, 'allowance')).toEqual(['allowance:2026-11-09']);
    for (const kind of ['interest', 'saver_bonus', 'prize']) expect(await rows(O.Sam.id, kind)).toEqual([]);

    clock.now = '2026-11-16T08:00:00Z';
    await O.owner.rpc('tick');
    expect(await rows(O.Sam.id, 'interest')).toEqual([['money', 46, 'interest:2026-11-09']]);
    expect(await keys(O.Sam.id, 'prize')).toEqual(['prize:money:2026-11-09']);
    expect(await keys(O.Sam.id, 'allowance')).toEqual(['allowance:2026-11-09', 'allowance:2026-11-16']);
  });

  it('switching on after a gap without any tick still pays nothing for the weeks before', async () => {
    clock.now = '2026-11-02T08:00:00Z';
    const G = await makeFamily(db, { Sam: 'kid' }, 'Gap', 'Europe/Amsterdam', { ...EVERYTHING, allowance: false, interest: false });
    await G.owner.rpc('update_member', { p_member: G.Sam.id, p_patch: { allowance_cents: 500 } });
    await G.owner.rpc('spot', { p: { member_id: G.Sam.id, direction: 'plus', cents: 10000, reason: 'Birthday' } });
    await G.Sam.rpc('transfer', { p_member: G.Sam.id, p_amount: 10000, p_to: 'savings' });
    await G.owner.rpc('tick');

    clock.now = '2026-11-18T08:00:00Z'; // Wednesday, two weeks later, no tick in between
    await patchFeatures(G, { allowance: true, interest: true });
    expect((await G.owner.rpc<any>('tick')).weeks_closed).toBe(2);
    expect(await keys(G.Sam.id, 'allowance')).toEqual(['allowance:2026-11-16']);
    expect(await rows(G.Sam.id, 'interest')).toEqual([]);
    expect(await keys(G.Sam.id, 'saver_bonus')).toEqual(['saver_bonus:2026-11-02']); // was on all along

    clock.now = '2026-11-23T08:00:00Z';
    await G.owner.rpc('tick');
    expect(await rows(G.Sam.id, 'interest')).toEqual([['money', 46, 'interest:2026-11-16']]);
    expect(await keys(G.Sam.id, 'allowance')).toEqual(['allowance:2026-11-16', 'allowance:2026-11-23']);
  });
});

describe('Ask Pocket', () => {
  type Person = Fam['owner'];
  let A: Fam;
  let samAsk: string;
  const ask = (who: Person, p_question: string | null) => who.rpc<any>('ask_begin', { p_question });
  const list = (who: Person, p_member: string | null = null, p_limit = 50) => who.rpc<any[]>('list_asks', { p_member, p_limit });
  const finish = (role: string, id: string, answer: string | null, status: string, model: string | null = null) =>
    asRole(db, role, `select public.ask_finish('${id}'::uuid, ${answer === null ? 'null' : `'${answer}'`}, '${status}',
      ${model === null ? 'null' : `'${model}'`}) as r`, A.Sam.uid);

  it('needs the ask switch (off in both presets)', async () => {
    clock.now = '2026-11-16T08:00:00Z';
    db = await makeDb();
    A = await makeFamily(db, { Mum: 'parent', Sam: 'kid', Mia: 'kid', Leo: 'kid', Oma: 'grandparent' }, 'Ask Family');
    await expectCode(ask(A.Sam, 'How does saving work?'), 'feature_off', 'ask');
    await patchFeatures(A, { ask: true });
  });

  it('checks the question and returns the context for the prompt', async () => {
    await expectCode(ask(A.Sam, '  hi  '), 'invalid', 'question');
    await expectCode(ask(A.Sam, null), 'invalid', 'question');
    await expectCode(ask(A.Sam, 'x'.repeat(501)), 'invalid', 'question');
    await A.owner.rpc('update_member', { p_member: A.Sam.id, p_patch: { profile: { birthday: '2016-03-01' } } });
    await patchFeatures(A, { savings: false });
    const r = await ask(A.Sam, '  Why should I save?  ');
    samAsk = r.id;
    expect(r).toEqual({ id: samAsk, member: { display_name: 'Sam', role: 'kid', relation: null, age: 10 },
      family: { name: 'Ask Family', currency: 'EUR' },
      features: { ...EVERYTHING, ask: true, savings: false, interest: false, saver_rules: false, goals: false } });
    await patchFeatures(A, { savings: true });
    expect((await ask(A.Oma, 'How do gifts work?')).member).toEqual({ display_name: 'Oma', role: 'grandparent', relation: null, age: null });
    expect(await q(db, `select question, status, answer from public.asks where id = $1`, [samAsk]))
      .toEqual([{ question: 'Why should I save?', status: 'pending', answer: null }]);
  });

  it('only the service role can store the answer', async () => {
    await expect(finish('authenticated', samAsk, 'Fake answer', 'answered')).rejects.toThrow(/permission denied/);
    await expect(finish('anon', samAsk, 'Fake answer', 'answered')).rejects.toThrow(/permission denied/);
    await expect(finish('service_role', samAsk, '  ', 'answered')).rejects.toThrow(/invalid/);
    await expect(finish('service_role', samAsk, 'x', 'maybe')).rejects.toThrow(/invalid/);
    const r = await finish('service_role', samAsk, 'Saving makes your money grow.', 'answered', 'claude-haiku-4-5');
    expect(r.rows).toEqual([{ r: { ok: true } }]);
    await expect(finish('service_role', samAsk, 'Again', 'answered')).rejects.toThrow(/wrong_status/);
    expect(await list(A.Sam)).toEqual([{ id: samAsk, member_id: A.Sam.id, question: 'Why should I save?',
      answer: 'Saving makes your money grow.', status: 'answered', created_at: expect.any(String) }]);
    expect(await q(db, `select model from public.asks where id = $1`, [samAsk])).toEqual([{ model: 'claude-haiku-4-5' }]);
  });

  it('parents read every question, everyone else only their own', async () => {
    clock.now = '2026-11-16T08:05:00Z';
    const mia = (await ask(A.Mia, 'What is interest?')).id;
    expect((await list(A.Sam)).map((x) => x.id)).toEqual([samAsk]);
    expect((await list(A.Sam, A.Sam.id)).map((x) => x.id)).toEqual([samAsk]);
    await expectCode(list(A.Sam, A.Mia.id), 'not_allowed');
    expect((await list(A.Mia)).map((x) => [x.question, x.status])).toEqual([['What is interest?', 'pending']]);
    expect((await list(A.Oma)).map((x) => x.question)).toEqual(['How do gifts work?']);
    const all = await list(A.Mum);
    expect(all[0].id).toBe(mia); // newest first
    expect(all.map((x) => x.question).sort()).toEqual(['How do gifts work?', 'What is interest?', 'Why should I save?']);
    expect((await list(A.owner, A.Mia.id)).map((x) => x.id)).toEqual([mia]);
    expect(await list(A.owner, null, 1)).toHaveLength(1);
  });

  it('limits: 20 per member and 150 per family per day', async () => {
    for (let n = 0; n < 20; n++) await ask(A.Leo, `Question number ${n}`);
    await expectCode(ask(A.Leo, 'One more?'), 'ask_limit', 'member');
    await q(db, `insert into public.asks(family_id, member_id, question, status, created_at)
                 select $1, $2, 'filler', 'answered', $3::timestamptz from generate_series(1, 150)`, [A.familyId, A.owner.id, clock.now]);
    await expectCode(ask(A.Mum, 'May I ask?'), 'ask_limit', 'family');
    clock.now = '2026-11-17T08:00:00Z'; // a new day
    await ask(A.Leo, 'One more?');
    await ask(A.Mum, 'May I ask?');
  });

  it('a question left pending (function crashed) counts as failed later', async () => {
    await ask(A.Mia, 'Still there?');
    const old = await list(A.Mia);
    expect(old.map((x) => [x.question, x.status])).toEqual([['Still there?', 'pending'], ['What is interest?', 'failed']]);
  });
});
