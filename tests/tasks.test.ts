// Task lifecycle: create → materialise → submit → approve/reject → missed (tick) → excuse.
import { beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { balance, clock, expectCode, makeDb, makeFamily, q, type Fam } from './helpers';

let db: PGlite;
let F: Fam;

const task = (assignees: string[], extra: Record<string, unknown> = {}) => ({
  title: 'Dishes', kind: 'chore', assignees, repeat: 'daily', start_on: '2026-11-16', due_time: '19:00', evidence: 'none', ...extra,
});

async function inst(rpc: Fam['owner']['rpc'], group: string, day: string, member?: string) {
  const list = await rpc<any[]>('list_instances', { p_from: day, p_to: day, p_member: member ?? null });
  const i = list.find((x) => x.group_id === group && (!member || x.assignee_id === member));
  expect(i, `instance ${group} ${day}`).toBeTruthy();
  return i;
}

const txRows = (instance: string) =>
  q(db, `select kind, currency, pot, amount, label, source_key from public.transactions
          where source_type = 'task_instance' and source_id = $1 order by kind, currency`, [instance]);

beforeAll(async () => {
  clock.now = '2026-11-16T08:00:00Z'; // Monday 09:00 CET
  db = await makeDb();
  F = await makeFamily(db, { Mum: 'parent', Sam: 'kid', Mia: 'kid', Leo: 'kid', Oma: 'grandparent' });
});

describe('create & materialise', () => {
  it('daily task materialises today..today+7 with local due times', async () => {
    const r = await F.owner.rpc<any>('create_task', { p_task: task([F.Sam.id], { title: 'Daily' }) });
    expect(r.task_ids).toHaveLength(1);
    const rows = await q(db, `select occurs_on::text as d, due_at from public.task_instances where task_id = $1 order by occurs_on`, [r.task_ids[0]]);
    expect(rows.map((x) => x.d)).toEqual(['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21',
      '2026-11-22', '2026-11-23']);
    expect(new Date(rows[0].due_at).toISOString()).toBe('2026-11-16T18:00:00.000Z');
  });

  it('repeat rules: weekdays, weekly (start weekday), days', async () => {
    const count = async (extra: Record<string, unknown>) => {
      const r = await F.owner.rpc<any>('create_task', { p_task: task([F.Leo.id], extra) });
      return (await q(db, `select extract(isodow from occurs_on)::int as w from public.task_instances where task_id = $1 order by occurs_on`,
        [r.task_ids[0]])).map((x) => x.w);
    };
    expect(await count({ repeat: 'weekdays' })).toEqual([1, 2, 3, 4, 5, 1]);
    expect(await count({ repeat: 'weekly', start_on: '2026-11-18' })).toEqual([3]);
    expect(await count({ repeat: 'days', repeat_days: [1, 6] })).toEqual([1, 6, 1]);
    expect(await count({ repeat: 'once', start_on: '2026-11-20' })).toEqual([5]);
    await expectCode(F.owner.rpc('create_task', { p_task: task([F.Leo.id], { repeat: 'days', repeat_days: [0] }) }), 'invalid', 'repeat_days');
    await expectCode(F.owner.rpc('create_task', { p_task: task([F.Leo.id], { due_time: '25:00' }) }), 'invalid', 'due_time');
    await expectCode(F.owner.rpc('create_task', { p_task: task([F.Leo.id], { repeat: 'once', due_time: '08:00' }) }), 'invalid', 'due_in_past');
    await expectCode(F.owner.rpc('create_task', { p_task: task([], {}) }), 'invalid', 'assignees');
  });

  it('a partnership creates one task per assignee sharing a group, each listing the partners', async () => {
    const r = await F.owner.rpc<any>('create_task', { p_task: task([F.owner.id, F.Leo.id, F.Sam.id], { title: 'Wash the car', repeat: 'once',
      kind: 'challenge', reward_points: 20 }) });
    expect(r.task_ids).toHaveLength(3);
    const tasks = await q(db, `select distinct group_id from public.tasks where id = any($1::uuid[])`, [r.task_ids]);
    expect(tasks).toEqual([{ group_id: r.group_id }]);
    const leo = await inst(F.Leo.rpc, r.group_id, '2026-11-16', F.Leo.id);
    expect(leo.partners.sort()).toEqual([F.owner.id, F.Sam.id].sort());
    expect(leo.kind).toBe('challenge');
    // the owner cannot approve their own part, Mum can
    const dad = await inst(F.owner.rpc, r.group_id, '2026-11-16', F.owner.id);
    await F.owner.rpc('submit_task', { p_instance: dad.id, p_before: null, p_after: null, p_note: null });
    await expectCode(F.owner.rpc('decide_task', { p_instance: dad.id, p_approve: true, p_note: null }), 'not_allowed');
    await F.Mum.rpc('decide_task', { p_instance: dad.id, p_approve: true, p_note: null });
    expect(await balance(db, F.owner.id, 'points')).toBe(20);
  });
});

describe('DST', () => {
  it('weekly 19:00 Europe/Amsterdam keeps local time across 25 Oct 2026', async () => {
    clock.now = '2026-10-19T06:00:00Z';
    const G = await makeFamily(db, { Kid: 'kid' }, 'DST family');
    const r = await G.owner.rpc<any>('create_task', { p_task: task([G.Kid.id], { repeat: 'weekly', start_on: '2026-10-19' }) });
    const rows = await q(db, `select occurs_on::text as d, due_at from public.task_instances where task_id = $1 order by occurs_on`, [r.task_ids[0]]);
    expect(rows.map((x) => [x.d, new Date(x.due_at).toISOString()])).toEqual([
      ['2026-10-19', '2026-10-19T17:00:00.000Z'], // CEST, UTC+2
      ['2026-10-26', '2026-10-26T18:00:00.000Z'], // CET, UTC+1
    ]);
    // and the next materialisation by tick continues in CET
    clock.now = '2026-10-27T06:00:00Z';
    await G.owner.rpc('tick');
    const next = await q(db, `select due_at from public.task_instances where task_id = $1 and occurs_on = '2026-11-02'`, [r.task_ids[0]]);
    expect(new Date(next[0].due_at).toISOString()).toBe('2026-11-02T18:00:00.000Z');
    clock.now = '2026-11-16T08:00:00Z';
  });
});

describe('approve / reject', () => {
  it('approve credits money, time and points exactly once', async () => {
    clock.now = '2026-11-16T08:00:00Z';
    const r = await F.owner.rpc<any>('create_task', { p_task: task([F.Mia.id], { title: 'Feed cat', repeat: 'once',
      reward_cents: 150, reward_minutes: 30, time_label: 'wifi', reward_points: 10 }) });
    const i = await inst(F.Mia.rpc, r.group_id, '2026-11-16');
    expect(i.can_submit).toBe(true);
    await expectCode(F.Mum.rpc('decide_task', { p_instance: i.id, p_approve: true, p_note: null }), 'wrong_status');
    await F.Mia.rpc('submit_task', { p_instance: i.id, p_before: null, p_after: null, p_note: 'done!' });
    await expectCode(F.Mia.rpc('submit_task', { p_instance: i.id, p_before: null, p_after: null, p_note: null }), 'wrong_status');
    expect((await F.Mum.rpc<any>('get_instance', { p_instance: i.id })).can_decide).toBe(true);
    await F.Mum.rpc('decide_task', { p_instance: i.id, p_approve: true, p_note: 'Great' });
    await expectCode(F.owner.rpc('decide_task', { p_instance: i.id, p_approve: true, p_note: null }), 'wrong_status');
    await expectCode(F.Mum.rpc('decide_task', { p_instance: i.id, p_approve: false, p_note: 'oops' }), 'wrong_status');
    expect(await txRows(i.id)).toEqual([
      { kind: 'task_reward', currency: 'money', pot: 'spending', amount: 150, label: 'reward', source_key: 'reward:money' },
      { kind: 'task_reward', currency: 'points', pot: 'points', amount: 10, label: null, source_key: 'reward:points' },
      { kind: 'task_reward', currency: 'time', pot: 'time', amount: 30, label: 'wifi', source_key: 'reward:time' },
    ]);
    const after = await F.Mia.rpc<any>('get_instance', { p_instance: i.id });
    expect(after).toMatchObject({ status: 'approved', decided_by: F.Mum.id, decision_note: 'Great', can_submit: false });
    const w = await F.Mia.rpc<any>('wallet', { p_member: F.Mia.id, p_history_limit: 10 });
    expect(w.balances).toEqual({ spending: 150, savings: 0, time: 30, points: 10 });
    expect(w.history.find((t: any) => t.currency === 'money').reason).toBe('Feed cat');
  });

  it('reject sends it back to open with a note, keeps photos, and gives 24h when already late', async () => {
    const r = await F.owner.rpc<any>('create_task', { p_task: task([F.Sam.id], { title: 'Tidy room', repeat: 'once', evidence: 'photo',
      reward_cents: 100 }) });
    const i = await inst(F.Sam.rpc, r.group_id, '2026-11-16');
    const photo = `${F.familyId}/${F.Sam.id}/after.jpg`;
    await expectCode(F.Sam.rpc('submit_task', { p_instance: i.id, p_before: null, p_after: null, p_note: 'done' }), 'invalid', 'photo_required');
    await expectCode(F.Sam.rpc('submit_task', { p_instance: i.id, p_before: null, p_after: `${F.familyId}/${F.Mia.id}/x.jpg`, p_note: null }),
      'invalid', 'photo_path');
    await expectCode(F.Sam.rpc('submit_task', { p_instance: i.id, p_before: null, p_after: `../${F.Sam.id}/x.jpg`, p_note: null }),
      'invalid', 'photo_path');
    await expectCode(F.Mia.rpc('submit_task', { p_instance: i.id, p_before: null, p_after: null, p_note: null }), 'not_allowed');
    clock.now = '2026-11-16T18:30:00Z'; // late (due 18:00Z) but within grace
    await F.Sam.rpc('submit_task', { p_instance: i.id, p_before: null, p_after: photo, p_note: null });
    await expectCode(F.Mum.rpc('decide_task', { p_instance: i.id, p_approve: false, p_note: '  ' }), 'invalid', 'note');
    await F.Mum.rpc('decide_task', { p_instance: i.id, p_approve: false, p_note: 'Bed is not made' });
    const back = await F.Sam.rpc<any>('get_instance', { p_instance: i.id });
    expect(back).toMatchObject({ status: 'open', decision_note: 'Bed is not made', submitted_at: null, after_path: photo, can_submit: true });
    expect(new Date(back.due_at).toISOString()).toBe('2026-11-17T18:30:00.000Z');
    expect(await txRows(i.id)).toEqual([]);
    // tick does not mark it missed while the extension runs
    clock.now = '2026-11-17T08:00:00Z';
    await F.owner.rpc('tick');
    expect((await F.Sam.rpc<any>('get_instance', { p_instance: i.id })).status).toBe('open');
    await F.Sam.rpc('submit_task', { p_instance: i.id, p_before: null, p_after: photo, p_note: null });
    await F.owner.rpc('decide_task', { p_instance: i.id, p_approve: true, p_note: null });
    expect((await txRows(i.id)).map((x) => x.amount)).toEqual([100]);
    clock.now = '2026-11-16T08:00:00Z';
  });

  it('photo_or_note accepts a note', async () => {
    const r = await F.owner.rpc<any>('create_task', { p_task: task([F.Leo.id], { title: 'Homework', repeat: 'once', evidence: 'photo_or_note' }) });
    const i = await inst(F.Leo.rpc, r.group_id, '2026-11-16');
    await expectCode(F.Leo.rpc('submit_task', { p_instance: i.id, p_before: null, p_after: null, p_note: ' ' }), 'invalid', 'evidence_required');
    await F.Leo.rpc('submit_task', { p_instance: i.id, p_before: null, p_after: null, p_note: 'Maths p.12' });
  });
});

describe('missed, penalties and excuses', () => {
  let group: string;

  it('tick marks overdue instances missed and fines exactly once', async () => {
    clock.now = '2026-11-16T08:00:00Z';
    const r = await F.owner.rpc<any>('create_task', { p_task: task([F.Leo.id], { title: 'Bins', penalty_cents: 50, penalty_minutes: 10,
      penalty_points: 3, reward_cents: 20 }) });
    group = r.group_id;
    clock.now = '2026-11-16T18:59:00Z'; // due 18:00Z + 60 min grace not yet passed
    await F.owner.rpc('tick');
    const i = await inst(F.Leo.rpc, group, '2026-11-16');
    expect(i.status).toBe('open');
    clock.now = '2026-11-16T19:01:00Z';
    const t1 = await F.Leo.rpc<any>('tick');
    expect(t1.missed).toBeGreaterThanOrEqual(1);
    await F.owner.rpc('tick');
    await F.Mum.rpc('tick');
    const m = await F.Leo.rpc<any>('get_instance', { p_instance: i.id });
    expect(m.status).toBe('missed');
    expect(m.can_submit).toBe(false);
    await expectCode(F.Leo.rpc('submit_task', { p_instance: i.id, p_before: null, p_after: null, p_note: 'late' }), 'wrong_status');
    const rows = await q(db, `select kind, currency, amount, effective_at, created_by, reason from public.transactions
                               where source_type = 'task_instance' and source_id = $1 order by currency`, [i.id]);
    expect(rows.map((x) => [x.kind, x.currency, x.amount, x.created_by, x.reason])).toEqual([
      ['task_penalty', 'money', -50, null, 'Missed: Bins'],
      ['task_penalty', 'points', -3, null, 'Missed: Bins'],
      ['task_penalty', 'time', -10, null, 'Missed: Bins'],
    ]);
    expect(rows.every((x) => new Date(x.effective_at).toISOString() === '2026-11-16T18:00:00.000Z')).toBe(true);
  });

  it('catch-up: several missed days are fined once each', async () => {
    clock.now = '2026-11-18T19:30:00Z';
    await F.owner.rpc('tick');
    await F.owner.rpc('tick');
    const n = await q(db, `select count(*)::int as n from public.transactions x join public.task_instances i on i.id = x.source_id
                            join public.tasks t on t.id = i.task_id where t.group_id = $1 and x.kind = 'task_penalty' and x.currency = 'money'`, [group]);
    expect(n[0].n).toBe(3); // 16th, 17th, 18th
  });

  it('excusing a missed instance compensates exactly the penalties; excusing an open one moves nothing', async () => {
    const i = await inst(F.owner.rpc, group, '2026-11-17');
    expect(i.status).toBe('missed');
    expect(i.can_excuse).toBe(true);
    const before = { m: await balance(db, F.Leo.id, 'spending'), t: await balance(db, F.Leo.id, 'time'), p: await balance(db, F.Leo.id, 'points') };
    await expectCode(F.Leo.rpc('excuse_task', { p_instance: i.id, p_note: 'please' }), 'not_allowed');
    await F.Mum.rpc('excuse_task', { p_instance: i.id, p_note: 'Was ill' });
    await expectCode(F.owner.rpc('excuse_task', { p_instance: i.id, p_note: 'again' }), 'wrong_status');
    expect(await balance(db, F.Leo.id, 'spending')).toBe(before.m + 50);
    expect(await balance(db, F.Leo.id, 'time')).toBe(before.t + 10);
    expect(await balance(db, F.Leo.id, 'points')).toBe(before.p + 3);
    const rows = await txRows(i.id);
    expect(rows.filter((x) => x.kind === 'excuse').map((x) => [x.currency, x.amount, x.source_key])).toEqual([
      ['money', 50, 'excuse:money'], ['points', 3, 'excuse:points'], ['time', 10, 'excuse:time'],
    ]);
    const pen = await q(db, `select reversed_by from public.transactions where source_id = $1 and kind = 'task_penalty'`, [i.id]);
    expect(pen.every((x) => x.reversed_by)).toBe(true);
    await F.owner.rpc('tick');
    expect((await txRows(i.id)).length).toBe(6);

    const open = await inst(F.owner.rpc, group, '2026-11-20');
    await F.owner.rpc('excuse_task', { p_instance: open.id, p_note: 'Holiday' });
    expect((await F.Leo.rpc<any>('get_instance', { p_instance: open.id })).status).toBe('excused');
    expect(await txRows(open.id)).toEqual([]);
    clock.now = '2026-11-21T08:00:00Z';
    await F.owner.rpc('tick');
    expect(await txRows(open.id)).toEqual([]);
  });

  it('approved and excused instances are never fined', async () => {
    const approved = await q(db, `select count(*)::int as n from public.transactions x join public.task_instances i on i.id = x.source_id
                                  where x.kind = 'task_penalty' and i.status in ('approved','excused','submitted') and x.reversed_by is null`);
    expect(approved[0].n).toBe(0);
  });
});

describe('update, archive, visibility', () => {
  it('update_task recomputes due_at of open future instances only', async () => {
    clock.now = '2026-11-16T08:00:00Z';
    const r = await F.owner.rpc<any>('create_task', { p_task: task([F.Mia.id], { title: 'Piano' }) });
    const today = await inst(F.Mia.rpc, r.group_id, '2026-11-16');
    await F.Mia.rpc('submit_task', { p_instance: today.id, p_before: null, p_after: null, p_note: null });
    await F.owner.rpc('update_task', { p_group: r.group_id, p_patch: { due_time: '20:30', reward_points: 4, title: 'Piano practice' } });
    const rows = await q(db, `select occurs_on::text as d, due_at, status from public.task_instances where task_id = $1 order by occurs_on`,
      [r.task_ids[0]]);
    expect(new Date(rows[0].due_at).toISOString()).toBe('2026-11-16T18:00:00.000Z'); // submitted: unchanged
    expect(new Date(rows[1].due_at).toISOString()).toBe('2026-11-17T19:30:00.000Z');
    const t = (await F.Mia.rpc<any[]>('list_tasks')).find((x) => x.group_id === r.group_id);
    expect(t).toMatchObject({ title: 'Piano practice', reward_points: 4, due_time: '20:30' });
    await expectCode(F.Sam.rpc('update_task', { p_group: r.group_id, p_patch: { title: 'x' } }), 'not_allowed');
    await expectCode(F.Mia.rpc('archive_task', { p_group: r.group_id }), 'not_allowed');

    await F.owner.rpc('archive_task', { p_group: r.group_id });
    const after = await q(db, `select status, count(*)::int as n from public.task_instances where task_id = $1 group by status order by status`,
      [r.task_ids[0]]);
    expect(after).toEqual([{ status: 'cancelled', n: 7 }, { status: 'submitted', n: 1 }]);
    expect((await F.owner.rpc<any[]>('list_tasks')).some((x) => x.group_id === r.group_id)).toBe(false);
    await F.owner.rpc('tick');
    const n = await q(db, `select count(*)::int as n from public.task_instances where task_id = $1`, [r.task_ids[0]]);
    expect(n[0].n).toBe(8);
  });

  it('kids see only their own (or created) instances; grandparents see all read-only', async () => {
    const days = { p_from: '2026-11-16', p_to: '2026-11-23', p_member: null };
    const sam = await F.Sam.rpc<any[]>('list_instances', days);
    expect(sam.length).toBeGreaterThan(0);
    for (const i of sam) {
      expect(i.assignee_id === F.Sam.id || i.created_by === F.Sam.id).toBe(true);
      expect(i.can_decide || i.can_excuse).toBe(false);
    }
    const oma = await F.Oma.rpc<any[]>('list_instances', days);
    const mgr = await F.owner.rpc<any[]>('list_instances', days);
    expect(oma.length).toBe(mgr.length);
    expect(oma.some((i) => i.can_submit || i.can_decide || i.can_excuse)).toBe(false);
    expect(mgr.length).toBeGreaterThan(sam.length);
    expect((await F.Sam.rpc<any[]>('list_tasks')).every((t) => t.assignee_id === F.Sam.id || t.created_by === F.Sam.id)).toBe(true);
    await expectCode(F.Sam.rpc('list_instances', { p_from: '2026-11-01', p_to: '2027-01-31', p_member: null }), 'invalid', 'range');
    // ordering by due_at
    const due = mgr.map((i) => new Date(i.due_at).getTime());
    expect([...due].sort((a, b) => a - b)).toEqual(due);
    const other = mgr.find((i) => i.assignee_id === F.Leo.id && i.created_by !== F.Sam.id);
    await expectCode(F.Sam.rpc('get_instance', { p_instance: other.id }), 'not_found');
  });

  it('get_instance returns exactly the list_instances row (same flags), not_found when not visible', async () => {
    clock.now = '2026-11-16T08:00:00Z';
    const r = await F.owner.rpc<any>('create_task', { p_task: task([F.Leo.id, F.Mia.id], { title: 'Garden', repeat: 'once',
      reward_cents: 30 }) });
    const day = { p_from: '2026-11-16', p_to: '2026-11-16', p_member: null };
    const id = (await inst(F.owner.rpc, r.group_id, '2026-11-16', F.Leo.id)).id;
    const same = async (rpc: Fam['owner']['rpc']) => {
      const one = await rpc<any>('get_instance', { p_instance: id });
      expect(one).toEqual((await rpc<any[]>('list_instances', day)).find((x) => x.id === id));
      return one;
    };
    expect(await same(F.Leo.rpc)).toMatchObject({ status: 'open', can_submit: true, can_decide: false, can_excuse: false,
      partners: [F.Mia.id], title: 'Garden', reward_cents: 30, group_id: r.group_id });
    expect(await same(F.Mum.rpc)).toMatchObject({ can_submit: false, can_decide: false, can_excuse: true });
    expect(await same(F.Oma.rpc)).toMatchObject({ can_submit: false, can_decide: false, can_excuse: false });
    await expectCode(F.Sam.rpc('get_instance', { p_instance: id }), 'not_found'); // unrelated kid
    await expectCode(F.Mia.rpc('get_instance', { p_instance: id }), 'not_found'); // partner sees only her own part
    await expectCode(F.owner.rpc('get_instance', { p_instance: crypto.randomUUID() }), 'not_found');

    await F.Leo.rpc('submit_task', { p_instance: id, p_before: null, p_after: null, p_note: 'Weeded' });
    const mum = await same(F.Mum.rpc);
    expect(mum).toMatchObject({ status: 'submitted', note: 'Weeded', can_decide: true, can_excuse: false });
    expect((await F.Mum.rpc<any[]>('list_approvals')).find((x) => x.id === id)).toEqual(mum);

    // reject → back to 'open' with the decision note (the UI relies on this)
    await F.Mum.rpc('decide_task', { p_instance: id, p_approve: false, p_note: 'Missed the back corner' });
    expect(await same(F.Leo.rpc)).toMatchObject({ status: 'open', decision_note: 'Missed the back corner', decided_by: F.Mum.id,
      submitted_at: null, note: 'Weeded', can_submit: true });
  });
});
