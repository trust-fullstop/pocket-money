// Money: allowance, week/month closes (interest, saver bonus, no-savings rule, targets), tallies,
// transfers, requests, reversals and history. One family walked through November 2026.
import { beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { balance, clock, expectCode, makeDb, makeFamily, q, type Fam } from './helpers';

let db: PGlite;
let F: Fam;
let late: string;
let leoTargets: { done: string; points: string };

const rows = (member: string, kind: string) =>
  q(db, `select currency, pot, amount, label, effective_at, source_key from public.transactions
          where member_id = $1 and kind = $2 order by effective_at, currency`, [member, kind]);
const iso = (d: unknown) => new Date(d as string).toISOString();

beforeAll(async () => {
  clock.now = '2026-11-02T08:00:00Z'; // Monday 09:00 CET
  db = await makeDb();
  F = await makeFamily(db, { Mum: 'parent', Sam: 'kid', Mia: 'kid', Leo: 'kid' });
});

describe('a month in the life', () => {
  it('pays pocket money once per week, from the first full week a kid is in the family', async () => {
    await F.owner.rpc('update_member', { p_member: F.Sam.id, p_patch: { allowance_cents: 500 } });
    await F.owner.rpc('tick');
    await F.Sam.rpc('tick');
    const a = await rows(F.Sam.id, 'allowance');
    expect(a.map((x) => [x.amount, x.label, iso(x.effective_at), x.source_key])).toEqual([
      [500, 'pocket', '2026-11-01T23:00:00.000Z', 'allowance:2026-11-02'],
    ]);
    clock.now = '2026-11-04T08:00:00Z';
    late = (await F.owner.rpc<any>('add_member', { p_name: 'Late', p_role: 'kid' })).member_id;
    await F.owner.rpc('update_member', { p_member: late, p_patch: { allowance_cents: 300 } });
    await F.owner.rpc('tick');
    expect(await rows(late, 'allowance')).toEqual([]);
    expect(await rows(F.Sam.id, 'allowance')).toHaveLength(1);
  });

  it('closes week 1: interest, saver bonus, no-savings penalty and weekly target prizes', async () => {
    clock.now = '2026-11-02T09:00:00Z';
    await F.owner.rpc('spot', { p: { member_id: F.Sam.id, direction: 'plus', cents: 10000, reason: 'Birthday money' } });
    await F.Sam.rpc('transfer', { p_member: F.Sam.id, p_amount: 10000, p_to: 'savings' });
    await F.owner.rpc('spot', { p: { member_id: F.Mia.id, direction: 'plus', cents: 300, reason: 'Helped' } });
    const req = await F.Mia.rpc<any>('create_request', { p_kind: 'spend', p_amount: 300, p_label: 'Sweets', p_note: null });
    await F.Mum.rpc('decide_request', { p_request: req.id, p_approve: true, p_note: null });
    const done = await F.owner.rpc<any>('upsert_target', { p: { member_id: F.Leo.id, title: '80% of chores', period: 'week',
      metric: 'completion_pct', threshold: 80, prize_cents: 200, prize_minutes: 30, time_label: 'fun' } });
    const points = await F.owner.rpc<any>('upsert_target', { p: { member_id: F.Leo.id, title: '1000 points', period: 'week',
      metric: 'points_earned', threshold: 1000, prize_points: 5 } });
    leoTargets = { done: done.id, points: points.id };
    expect(done).toMatchObject({ threshold: 80, prize_cents: 200, active: true, current_value: 0, last_result: null });
    const hw = await F.owner.rpc<any>('create_task', { p_task: { title: 'Homework', kind: 'chore', assignees: [F.Leo.id],
      repeat: 'daily', start_on: '2026-11-02', due_time: '19:00', evidence: 'none', reward_cents: 10 } });
    for (let d = 0; d < 7; d++) {
      const day = `2026-11-0${2 + d}`;
      clock.now = `${day}T17:00:00Z`;
      await F.Leo.rpc('tick');
      if (d === 3) continue; // forgot Thursday
      const [i] = (await F.Leo.rpc<any[]>('list_instances', { p_from: day, p_to: day, p_member: F.Leo.id }))
        .filter((x) => x.group_id === hw.group_id);
      await F.Leo.rpc('submit_task', { p_instance: i.id, p_before: null, p_after: null, p_note: null });
      await F.Mum.rpc('decide_task', { p_instance: i.id, p_approve: true, p_note: null });
    }
    const w = await F.Leo.rpc<any>('wallet', { p_member: F.Leo.id, p_history_limit: 0 });
    expect(w.targets.find((t: any) => t.id === leoTargets.done).current_value).toBe(85); // 6 of 7

    clock.now = '2026-11-09T08:00:00Z';
    const t = await F.Mia.rpc<any>('tick');
    expect(t.weeks_closed).toBe(1);
    const weekEnd = '2026-11-08T22:59:59.000Z';
    // interest = floor(10000 * 2% * 12 / 52) = 46
    expect((await rows(F.Sam.id, 'interest')).map((x) => [x.pot, x.amount, iso(x.effective_at)])).toEqual([['savings', 46, weekEnd]]);
    expect((await rows(F.Sam.id, 'saver_bonus')).map((x) => [x.currency, x.amount])).toEqual([['points', 10]]);
    expect(await rows(F.Sam.id, 'no_savings_penalty')).toEqual([]);
    expect((await rows(F.Mia.id, 'no_savings_penalty')).map((x) => [x.currency, x.amount, iso(x.effective_at)]))
      .toEqual([['points', -10, weekEnd]]);
    expect(await rows(F.Mia.id, 'interest')).toEqual([]);
    expect(await rows(F.Leo.id, 'no_savings_penalty')).toEqual([]); // earned, but kept spending money
    expect((await rows(F.Leo.id, 'prize')).map((x) => [x.currency, x.amount, x.label])).toEqual([
      ['money', 200, 'prize'], ['time', 30, 'fun'],
    ]);
    const res = await q(db, `select target_id, value, met from public.target_results order by value desc`);
    expect(res).toEqual([{ target_id: leoTargets.done, value: 85, met: true }, { target_id: leoTargets.points, value: 0, met: false }]);
    expect(await rows(late, 'allowance')).toHaveLength(1);
    expect(await rows(F.Sam.id, 'allowance')).toHaveLength(2);

    clock.now = '2026-11-09T10:00:00Z';
    expect((await F.owner.rpc<any>('tick')).weeks_closed).toBe(0);
    expect(await rows(F.Leo.id, 'prize')).toHaveLength(2);
    expect(await rows(F.Sam.id, 'interest')).toHaveLength(1);
    const lw = await F.owner.rpc<any>('wallet', { p_member: F.Leo.id, p_history_limit: 0 });
    expect(lw.targets.find((x: any) => x.id === leoTargets.done).last_result).toEqual({ period_start: '2026-11-02', value: 85, met: true });
  });

  it('week 2: interest compounds, no saver bonus without growth', async () => {
    clock.now = '2026-11-16T08:00:00Z';
    await F.owner.rpc('tick');
    // floor(10046 * 24 / 5200) = 46
    expect((await rows(F.Sam.id, 'interest')).map((x) => x.amount)).toEqual([46, 46]);
    expect(await rows(F.Sam.id, 'saver_bonus')).toHaveLength(1);
    expect(await rows(F.Mia.id, 'no_savings_penalty')).toHaveLength(1); // earned nothing in week 2
    expect(await rows(F.Sam.id, 'allowance')).toHaveLength(3);
    expect(await rows(F.Leo.id, 'prize')).toHaveLength(2); // 0% in week 2
  });

  it('tallies week / month / ytd and the "possible" minimum', async () => {
    const fine = await F.owner.rpc<any>('spot', { p: { member_id: F.Sam.id, direction: 'minus', cents: 200, reason: 'Left bike in the rain' } });
    await F.owner.rpc('reverse_transaction', { p_tx: fine.ids[0], p_reason: 'It was Leo' });
    const comic = await F.Sam.rpc<any>('create_request', { p_kind: 'spend', p_amount: 100, p_label: 'Comic', p_note: null });
    await F.Mum.rpc('decide_request', { p_request: comic.id, p_approve: true, p_note: null });
    const dishes = await F.owner.rpc<any>('create_task', { p_task: { title: 'Dishes', kind: 'chore', assignees: [F.Sam.id],
      repeat: 'daily', start_on: '2026-11-16', due_time: '19:00', evidence: 'none', reward_cents: 50, reward_points: 1 } });
    const [tue] = await F.owner.rpc<any[]>('list_instances', { p_from: '2026-11-17', p_to: '2026-11-17', p_member: F.Sam.id });
    expect(tue.group_id).toBe(dishes.group_id);
    await F.owner.rpc('excuse_task', { p_instance: tue.id, p_note: 'Dentist' });

    const w = await F.Sam.rpc<any>('wallet', { p_member: F.Sam.id, p_history_limit: 100 });
    expect(w.balances).toEqual({ spending: 1400, savings: 10092, time: 0, points: 10 });
    expect(w.avg_weekly_savings_cents).toBe(2523);
    expect(w.tallies.week).toMatchObject({ period: 'week', start: '2026-11-16', end: '2026-11-23',
      money_earned: 700, money_lost: 200, money_spent: 100, money_saved: 0, interest: 0, points_earned: 0, points_lost: 0,
      tasks_done: 0, tasks_missed: 0, tasks_open: 6, possible_cents: 300, possible_points: 6, possible_minutes: 0 });
    expect(w.tallies.month).toMatchObject({ period: 'month', start: '2026-11-01', end: '2026-12-01',
      money_earned: 10000 + 1500 + 92 + 200, money_lost: 200, money_spent: 100, money_saved: 10000, interest: 92,
      points_earned: 10, tasks_open: 7, possible_cents: 350 });
    expect(w.tallies.ytd).toMatchObject({ period: 'ytd', start: '2026-01-01', end: '2026-11-17',
      money_earned: 11792, money_saved: 10000, possible_cents: 50, tasks_open: 1 });
    const times = w.history.map((x: any) => new Date(x.effective_at).getTime());
    expect([...times].sort((a, b) => b - a)).toEqual(times);
  });

  it('transfers check the balance and the direction', async () => {
    await expectCode(F.Sam.rpc('transfer', { p_member: F.Sam.id, p_amount: 1401, p_to: 'savings' }), 'insufficient');
    await expectCode(F.Sam.rpc('transfer', { p_member: F.Sam.id, p_amount: 0, p_to: 'savings' }), 'invalid', 'amount');
    await expectCode(F.Sam.rpc('transfer', { p_member: F.Sam.id, p_amount: 1, p_to: 'points' }), 'invalid', 'pot');
    const r = await F.Sam.rpc<any>('transfer', { p_member: F.Sam.id, p_amount: 400, p_to: 'savings' });
    expect(r).toEqual({ ok: true, balances: { spending: 1000, savings: 10492, time: 0, points: 10 } });
    await expectCode(F.owner.rpc('transfer', { p_member: F.Sam.id, p_amount: 10493, p_to: 'spending' }), 'insufficient');
    await F.owner.rpc('transfer', { p_member: F.Sam.id, p_amount: 92, p_to: 'spending' });
    expect(await balance(db, F.Sam.id, 'spending')).toBe(1092);
    expect(await balance(db, F.Sam.id, 'savings')).toBe(10400);
  });

  it('withdraw request: kid asks, parent approves once', async () => {
    await expectCode(F.Sam.rpc('create_request', { p_kind: 'withdraw', p_amount: 10401, p_label: null, p_note: null }), 'insufficient');
    const r = await F.Sam.rpc<any>('create_request', { p_kind: 'withdraw', p_amount: 500, p_label: 'Lego', p_note: 'On sale!' });
    const mine = await F.Sam.rpc<any[]>('list_requests', { p_status: 'pending' });
    expect(mine.map((x) => [x.id, x.can_cancel, x.can_decide])).toEqual([[r.id, true, false]]);
    expect((await F.Mia.rpc<any[]>('list_requests', { p_status: 'all' })).some((x) => x.id === r.id)).toBe(false);
    expect((await F.Mum.rpc<any[]>('list_requests', { p_status: 'pending' })).find((x) => x.id === r.id).can_decide).toBe(true);
    await F.Mum.rpc('decide_request', { p_request: r.id, p_approve: true, p_note: 'Enjoy' });
    await expectCode(F.owner.rpc('decide_request', { p_request: r.id, p_approve: true, p_note: null }), 'wrong_status');
    await expectCode(F.Sam.rpc('cancel_request', { p_request: r.id }), 'wrong_status');
    expect(await balance(db, F.Sam.id, 'savings')).toBe(9900);
    expect(await balance(db, F.Sam.id, 'spending')).toBe(1592);
    const tx = await q(db, `select pot, amount, kind, reason from public.transactions where source_type = 'request' and source_id = $1 order by amount`, [r.id]);
    expect(tx).toEqual([
      { pot: 'savings', amount: -500, kind: 'transfer', reason: 'From savings: Lego — On sale!' },
      { pot: 'spending', amount: 500, kind: 'transfer', reason: 'From savings: Lego — On sale!' },
    ]);
    const all = await F.Sam.rpc<any[]>('list_requests', { p_status: 'all' });
    expect(all.find((x) => x.id === r.id)).toMatchObject({ status: 'approved', decided_by: F.Mum.id, decision_note: 'Enjoy', can_cancel: false });
  });

  it('spend approval re-checks the balance at decision time', async () => {
    const r = await F.Sam.rpc<any>('create_request', { p_kind: 'spend', p_amount: 1592, p_label: 'Game', p_note: null });
    await F.Sam.rpc('transfer', { p_member: F.Sam.id, p_amount: 1000, p_to: 'savings' });
    await expectCode(F.Mum.rpc('decide_request', { p_request: r.id, p_approve: true, p_note: null }), 'insufficient');
    expect((await q(db, `select status from public.requests where id = $1`, [r.id]))[0].status).toBe('pending');
    await F.Mum.rpc('decide_request', { p_request: r.id, p_approve: false, p_note: 'Not enough left' });
    expect((await q(db, `select count(*)::int as n from public.transactions where source_id = $1`, [r.id]))[0].n).toBe(0);
    expect(await balance(db, F.Sam.id, 'spending')).toBe(592);
  });

  it('time requests use time minutes with the asked label', async () => {
    await F.owner.rpc('spot', { p: { member_id: F.Sam.id, direction: 'plus', minutes: 60, time_label: 'game', reason: 'Great week' } });
    await expectCode(F.Sam.rpc('create_request', { p_kind: 'time', p_amount: 61, p_label: 'game', p_note: null }), 'insufficient');
    await expectCode(F.Sam.rpc('create_request', { p_kind: 'time', p_amount: 10, p_label: 'tv', p_note: null }), 'invalid', 'label');
    const r = await F.Sam.rpc<any>('create_request', { p_kind: 'time', p_amount: 30, p_label: 'game', p_note: 'Minecraft' });
    await expectCode(F.Sam.rpc('decide_request', { p_request: r.id, p_approve: true, p_note: null }), 'not_allowed');
    await F.owner.rpc('decide_request', { p_request: r.id, p_approve: true, p_note: null });
    expect(await rows(F.Sam.id, 'time_use')).toMatchObject([{ currency: 'time', pot: 'time', amount: -30, label: 'game' }]);
    expect(await balance(db, F.Sam.id, 'time')).toBe(30);
    const w = await F.Sam.rpc<any>('wallet', { p_member: F.Sam.id, p_history_limit: 1 });
    expect(w.tallies.week).toMatchObject({ time_earned: 60, time_used: 30, time_lost: 0 });
  });

  it('at most 5 pending requests per kid', async () => {
    const ids: string[] = [];
    for (let n = 0; n < 5; n++) ids.push((await F.Sam.rpc<any>('create_request', { p_kind: 'spend', p_amount: 1, p_label: `x${n}`, p_note: null })).id);
    await expectCode(F.Sam.rpc('create_request', { p_kind: 'spend', p_amount: 1, p_label: 'x6', p_note: null }), 'invalid', 'too_many_requests');
    for (const id of ids) await F.Sam.rpc('cancel_request', { p_request: id });
    expect(await F.Sam.rpc<any[]>('list_requests', { p_status: 'pending' })).toEqual([]);
  });

  it('reversals: once, never of transfers or reversals, flagged in history', async () => {
    const fine = (await rows(F.Sam.id, 'fine'))[0];
    const fineTx = (await q(db, `select id, reversed_by from public.transactions where member_id = $1 and kind = 'fine'`, [F.Sam.id]))[0];
    expect(fineTx.reversed_by).toBeTruthy();
    expect(fine.amount).toBe(-200);
    await expectCode(F.owner.rpc('reverse_transaction', { p_tx: fineTx.id, p_reason: 'again' }), 'wrong_status');
    await expectCode(F.owner.rpc('reverse_transaction', { p_tx: fineTx.reversed_by, p_reason: 'undo undo' }), 'not_allowed');
    const transfer = (await q(db, `select id from public.transactions where member_id = $1 and kind = 'transfer' limit 1`, [F.Sam.id]))[0];
    await expectCode(F.owner.rpc('reverse_transaction', { p_tx: transfer.id, p_reason: 'x' }), 'not_allowed');
    const rev = (await q(db, `select amount, kind, reason, created_by from public.transactions where id = $1`, [fineTx.reversed_by]))[0];
    expect(rev).toEqual({ amount: 200, kind: 'reversal', reason: 'Reversed: It was Leo', created_by: F.owner.id });

    const hist = await F.owner.rpc<any[]>('history', { p_member: F.Sam.id, p_currency: 'money', p_before: null, p_limit: 200 });
    const by = (id: string) => hist.find((x) => x.id === id);
    expect(by(fineTx.id).can_reverse).toBe(false);
    expect(by(fineTx.reversed_by).can_reverse).toBe(false);
    expect(hist.find((x) => x.kind === 'interest').can_reverse).toBe(true);
    expect((await F.Sam.rpc<any[]>('history', { p_member: F.Sam.id, p_currency: null, p_before: null, p_limit: 200 }))
      .some((x) => x.can_reverse)).toBe(false);

    // reversing a bonus takes the money back
    const bonus = hist.find((x) => x.kind === 'bonus');
    const before = await balance(db, F.Sam.id, 'spending');
    await F.Mum.rpc('reverse_transaction', { p_tx: bonus.id, p_reason: 'Duplicate' });
    expect(await balance(db, F.Sam.id, 'spending')).toBe(before - bonus.amount);
  });

  it('history paginates by effective time and filters by currency', async () => {
    const all = await F.Sam.rpc<any[]>('history', { p_member: F.Sam.id, p_currency: null, p_before: null, p_limit: 200 });
    expect(all.length).toBeGreaterThan(10);
    const page1 = await F.Sam.rpc<any[]>('history', { p_member: F.Sam.id, p_currency: null, p_before: null, p_limit: 3 });
    expect(page1.map((x) => x.id)).toEqual(all.slice(0, 3).map((x) => x.id));
    const page2 = await F.Sam.rpc<any[]>('history', { p_member: F.Sam.id, p_currency: null, p_before: page1[2].effective_at, p_limit: 200 });
    expect(page2.every((x) => new Date(x.effective_at) < new Date(page1[2].effective_at))).toBe(true);
    const pts = await F.Sam.rpc<any[]>('history', { p_member: F.Sam.id, p_currency: 'points', p_before: null, p_limit: 200 });
    expect(pts.length).toBeGreaterThan(0);
    expect(pts.every((x) => x.currency === 'points')).toBe(true);
    await expectCode(F.Sam.rpc('history', { p_member: F.Sam.id, p_currency: 'gold', p_before: null, p_limit: 5 }), 'invalid', 'currency');
  });

  it('goals: kid for themself, manager for a kid', async () => {
    const g = await F.Sam.rpc<any>('upsert_goal', { p: { member_id: F.Sam.id, title: 'Lego set', target_cents: 6000, emoji: '🧱' } });
    const g2 = await F.owner.rpc<any>('upsert_goal', { p: { id: g.id, member_id: F.Sam.id, title: 'Big Lego set', target_cents: 9000 } });
    expect(g2).toMatchObject({ id: g.id, title: 'Big Lego set', target_cents: 9000, emoji: '🧱', archived: false });
    await expectCode(F.Sam.rpc('upsert_goal', { p: { title: 'x', target_cents: 0 } }), 'invalid');
    expect((await F.Sam.rpc<any>('wallet', { p_member: F.Sam.id, p_history_limit: 0 })).goals.map((x: any) => x.id)).toEqual([g.id]);
    await F.Sam.rpc('archive_goal', { p_goal: g.id });
    expect((await F.Sam.rpc<any>('wallet', { p_member: F.Sam.id, p_history_limit: 0 })).goals).toEqual([]);
    await expectCode(F.owner.rpc('upsert_goal', { p: { member_id: F.Mum.id, title: 'x', target_cents: 100 } }), 'not_allowed');
  });

  it('closes the month: monthly target prize exactly once', async () => {
    const t = await F.owner.rpc<any>('upsert_target', { p: { member_id: F.Sam.id, title: 'Earn €20', period: 'month',
      metric: 'money_earned', threshold: 2000, prize_points: 50 } });
    await expectCode(F.owner.rpc('upsert_target', { p: { member_id: F.Mum.id, title: 'x', period: 'month', metric: 'money_earned',
      threshold: 1 } }), 'invalid', 'member');
    await expectCode(F.owner.rpc('upsert_target', { p: { member_id: F.Sam.id, title: 'x', period: 'month', metric: 'completion_pct',
      threshold: 101 } }), 'invalid');
    clock.now = '2026-12-01T08:00:00Z';
    const r = await F.owner.rpc<any>('tick');
    expect(r.months_closed).toBe(1);
    expect(r.weeks_closed).toBe(2);
    await F.Sam.rpc('tick');
    const prize = (await rows(F.Sam.id, 'prize')).map((x) => [x.currency, x.amount, iso(x.effective_at)]);
    expect(prize).toEqual([['points', 50, '2026-11-30T22:59:59.000Z']]);
    const res = await q(db, `select period_start::text as p, met from public.target_results where target_id = $1`, [t.id]);
    expect(res).toEqual([{ p: '2026-11-01', met: true }]);
    await F.owner.rpc('archive_target', { p_target: t.id });
    expect((await F.owner.rpc<any>('wallet', { p_member: F.Sam.id, p_history_limit: 0 })).targets).toEqual([]);
  });
});
