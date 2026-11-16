// Role rules and the database perimeter (grants), per SPEC §4 and decisions #3/#4.
import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import type { PGlite } from '@electric-sql/pglite';
import { as, asRole, balance, clock, expectCode, makeDb, makeFamily, q, type Fam } from './helpers';

let db: PGlite;
let F: Fam;

const chore = (assignees: string[], extra: Record<string, unknown> = {}) => ({
  title: 'Chore', kind: 'chore', assignees, repeat: 'once', start_on: '2026-11-16', due_time: '19:00', evidence: 'none', ...extra,
});

async function todayInstance(rpc: Fam['owner']['rpc'], group: string, assignee: string) {
  const list = await rpc<any[]>('list_instances', { p_from: '2026-11-16', p_to: '2026-11-16', p_member: assignee });
  const i = list.find((x) => x.group_id === group);
  expect(i, 'instance').toBeTruthy();
  return i;
}

beforeAll(async () => {
  clock.now = '2026-11-16T08:00:00Z';
  db = await makeDb();
  F = await makeFamily(db, { Mum: 'parent', Sam: 'kid', Mia: 'kid', Oma: 'grandparent' });
  await F.owner.rpc('spot', { p: { member_id: F.Sam.id, direction: 'plus', cents: 1000, reason: 'Start' } });
});

describe('kids', () => {
  it('cannot spot', async () => {
    await expectCode(F.Sam.rpc('spot', { p: { member_id: F.Mia.id, direction: 'plus', cents: 100, reason: 'x' } }), 'not_allowed');
    await expectCode(F.Sam.rpc('spot', { p: { member_id: F.Mia.id, direction: 'minus', points: 5, reason: 'x' } }), 'not_allowed');
  });

  it('cannot approve their own task, nor a sibling task they did not create', async () => {
    const t = await F.owner.rpc<any>('create_task', { p_task: chore([F.Sam.id, F.Mia.id], { reward_cents: 100 }) });
    const sam = await todayInstance(F.Sam.rpc, t.group_id, F.Sam.id);
    const mia = await todayInstance(F.Mia.rpc, t.group_id, F.Mia.id);
    await F.Sam.rpc('submit_task', { p_instance: sam.id, p_before: null, p_after: null, p_note: null });
    await F.Mia.rpc('submit_task', { p_instance: mia.id, p_before: null, p_after: null, p_note: null });
    await expectCode(F.Sam.rpc('decide_task', { p_instance: sam.id, p_approve: true, p_note: null }), 'not_allowed');
    await expectCode(F.Sam.rpc('decide_task', { p_instance: mia.id, p_approve: true, p_note: null }), 'not_allowed');
    await expectCode(F.Oma.rpc('decide_task', { p_instance: mia.id, p_approve: true, p_note: null }), 'not_allowed');
    expect((await F.Sam.rpc<any[]>('list_approvals')).length).toBe(0);
    expect((await F.Mum.rpc<any[]>('list_approvals')).map((i) => i.id).sort()).toEqual([sam.id, mia.id].sort());
    await expectCode(F.Sam.rpc('excuse_task', { p_instance: mia.id, p_note: null }), 'not_allowed');
  });

  it('cannot create chores with money, time or penalties; get forced into points-only challenges', async () => {
    await expectCode(F.Sam.rpc('create_task', { p_task: chore([F.Mia.id], { reward_cents: 100 }) }), 'not_allowed', 'money_or_time');
    await expectCode(F.Sam.rpc('create_task', { p_task: chore([F.Mia.id], { reward_minutes: 10 }) }), 'not_allowed', 'money_or_time');
    await expectCode(F.Sam.rpc('create_task', { p_task: chore([F.Mia.id], { penalty_points: 5 }) }), 'not_allowed', 'money_or_time');
    await expectCode(F.Sam.rpc('create_task', { p_task: chore([F.Sam.id]) }), 'not_allowed', 'self_only');
    const t = await F.Sam.rpc<any>('create_task', { p_task: chore([F.Mia.id, F.Sam.id], { reward_points: 500, title: 'Race' }) });
    const tasks = await q(db, `select kind, reward_points from public.tasks where group_id = $1`, [t.group_id]);
    expect(tasks).toEqual([{ kind: 'challenge', reward_points: 50 }, { kind: 'challenge', reward_points: 50 }]);
    // a kid cannot raise money on their own challenge later either
    await expectCode(F.Sam.rpc('update_task', { p_group: t.group_id, p_patch: { reward_cents: 50 } }), 'not_allowed', 'money_or_time');
  });

  it('can only move spending to savings, for themselves', async () => {
    await F.Sam.rpc('transfer', { p_member: F.Sam.id, p_amount: 300, p_to: 'savings' });
    await expectCode(F.Sam.rpc('transfer', { p_member: F.Sam.id, p_amount: 100, p_to: 'spending' }), 'not_allowed', 'withdraw_request');
    await expectCode(F.Mia.rpc('transfer', { p_member: F.Sam.id, p_amount: 100, p_to: 'savings' }), 'not_allowed');
    expect(await balance(db, F.Sam.id, 'savings')).toBe(300);
  });

  it('cannot see a sibling wallet, change allowance, reverse, decide requests or manage targets', async () => {
    await expectCode(F.Mia.rpc('wallet', { p_member: F.Sam.id, p_history_limit: 5 }), 'not_allowed');
    await expectCode(F.Mia.rpc('history', { p_member: F.Sam.id, p_currency: null, p_before: null, p_limit: 5 }), 'not_allowed');
    await expectCode(F.Sam.rpc('update_member', { p_member: F.Sam.id, p_patch: { allowance_cents: 5000 } }), 'not_allowed');
    const tx = (await q(db, `select id from public.transactions where member_id = $1 and kind = 'bonus'`, [F.Sam.id]))[0].id;
    await expectCode(F.Sam.rpc('reverse_transaction', { p_tx: tx, p_reason: 'x' }), 'not_allowed');
    const req = await F.Sam.rpc<any>('create_request', { p_kind: 'spend', p_amount: 100, p_label: 'Sweets', p_note: null });
    await expectCode(F.Sam.rpc('decide_request', { p_request: req.id, p_approve: true, p_note: null }), 'not_allowed');
    await expectCode(F.Mia.rpc('decide_request', { p_request: req.id, p_approve: true, p_note: null }), 'not_allowed');
    await expectCode(F.Mia.rpc('cancel_request', { p_request: req.id }), 'not_allowed');
    await F.Sam.rpc('cancel_request', { p_request: req.id });
    await expectCode(F.Sam.rpc('upsert_target', { p: { member_id: F.Sam.id, title: 'x', period: 'week', metric: 'points_earned', threshold: 1 } }), 'not_allowed');
    await expectCode(F.Sam.rpc('upsert_goal', { p: { member_id: F.Mia.id, title: 'x', target_cents: 100 } }), 'not_allowed');
    const g = await F.Sam.rpc<any>('upsert_goal', { p: { member_id: F.Sam.id, title: 'Lego', target_cents: 6000, emoji: '🧱' } });
    expect(g.title).toBe('Lego');
  });

  it('can never write money rows except via transfer and requests', async () => {
    const kinds = await q(db, `select distinct kind from public.transactions where created_by in ($1, $2)`, [F.Sam.id, F.Mia.id]);
    expect(kinds.map((k) => k.kind)).toEqual(['transfer']);
  });
});

describe('grandparents', () => {
  it('spot minus fails, plus is a gift', async () => {
    await expectCode(F.Oma.rpc('spot', { p: { member_id: F.Mia.id, direction: 'minus', cents: 100, reason: 'x' } }), 'not_allowed', 'gift_only');
    const r = await F.Oma.rpc<any>('spot', { p: { member_id: F.Mia.id, direction: 'plus', cents: 200, points: 5, reason: 'Ice cream' } });
    const rows = await q(db, `select kind, currency, amount from public.transactions where id = any($1::uuid[]) order by currency`, [r.ids]);
    expect(rows).toEqual([{ kind: 'gift', currency: 'money', amount: 200 }, { kind: 'gift', currency: 'points', amount: 5 }]);
  });

  it('can see money (default setting) but not decide or reverse', async () => {
    const w = await F.Oma.rpc<any>('wallet', { p_member: F.Mia.id, p_history_limit: 5 });
    expect(w.balances.spending).toBe(200);
    expect(w.history.every((t: any) => t.can_reverse === false)).toBe(true);
    await expectCode(F.Oma.rpc('create_task', { p_task: chore([F.Mia.id], { reward_cents: 1 }) }), 'not_allowed', 'money_or_time');
  });
});

describe('approver rule (decision #4)', () => {
  it('a manager who is also the assignee cannot approve their own instance', async () => {
    const t = await F.Mum.rpc<any>('create_task', { p_task: chore([F.Mum.id], { title: 'Mum chore', reward_points: 5 }) });
    const i = await todayInstance(F.Mum.rpc, t.group_id, F.Mum.id);
    await F.Mum.rpc('submit_task', { p_instance: i.id, p_before: null, p_after: null, p_note: null });
    expect((await F.Mum.rpc<any>('get_instance', { p_instance: i.id })).can_decide).toBe(false);
    await expectCode(F.Mum.rpc('decide_task', { p_instance: i.id, p_approve: true, p_note: null }), 'not_allowed');
    await F.owner.rpc('decide_task', { p_instance: i.id, p_approve: true, p_note: null });
  });

  it('a kid who created a points-only challenge may approve it', async () => {
    const t = await F.Mia.rpc<any>('create_task', { p_task: chore([F.owner.id], { title: 'No phone at dinner', reward_points: 20,
      reward_text: "I'll make you breakfast" }) });
    const i = await todayInstance(F.owner.rpc, t.group_id, F.owner.id);
    await F.owner.rpc('submit_task', { p_instance: i.id, p_before: null, p_after: null, p_note: null });
    expect((await F.Mia.rpc<any[]>('list_approvals')).map((x) => x.id)).toEqual([i.id]);
    await F.Mia.rpc('decide_task', { p_instance: i.id, p_approve: true, p_note: null });
    expect(await balance(db, F.owner.id, 'points')).toBe(20);
  });

  it('but not once a manager has added money to it', async () => {
    const t = await F.Sam.rpc<any>('create_task', { p_task: chore([F.Mia.id], { title: 'Puzzle', reward_points: 10 }) });
    await F.owner.rpc('update_task', { p_group: t.group_id, p_patch: { reward_cents: 100 } });
    const i = await todayInstance(F.Mia.rpc, t.group_id, F.Mia.id);
    await F.Mia.rpc('submit_task', { p_instance: i.id, p_before: null, p_after: null, p_note: null });
    await expectCode(F.Sam.rpc('decide_task', { p_instance: i.id, p_approve: true, p_note: null }), 'not_allowed');
    await F.Mum.rpc('decide_task', { p_instance: i.id, p_approve: true, p_note: null });
  });
});

describe('database perimeter', () => {
  it('authenticated cannot select, insert into or update any table', async () => {
    const tables = await q<{ t: string }>(db, `select tablename as t from pg_tables where schemaname = 'public'`);
    expect(tables.length).toBeGreaterThan(10);
    for (const { t } of tables) {
      await expect(asRole(db, 'authenticated', `select * from public.${t} limit 1`, F.owner.uid), t).rejects.toThrow(/permission denied/);
      await expect(asRole(db, 'anon', `select * from public.${t} limit 1`), t).rejects.toThrow(/permission denied/);
    }
    await expect(asRole(db, 'authenticated', `update public.members set allowance_cents = 99999`, F.Sam.uid)).rejects.toThrow(/permission denied/);
    await expect(asRole(db, 'authenticated', `insert into public.transactions(family_id, member_id, currency, pot, amount, kind, reason)
      values ('${F.familyId}', '${F.Sam.id}', 'money', 'spending', 99999, 'bonus', 'x')`, F.Sam.uid)).rejects.toThrow(/permission denied/);
  });

  it('authenticated cannot execute app.* helpers (tick_all, post, ...)', async () => {
    await expect(asRole(db, 'authenticated', `select app.tick_all()`, F.owner.uid)).rejects.toThrow(/permission denied/);
    await expect(asRole(db, 'authenticated', `select app.post('${F.familyId}', '${F.Sam.id}', 'money', 'spending', 99999, 'bonus',
      null, 'x', null, null, null, null, null, null)`, F.Sam.uid)).rejects.toThrow(/permission denied/);
    const appFns = await q(db, `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'app' and (has_function_privilege('authenticated', p.oid, 'execute') or has_function_privilege('anon', p.oid, 'execute'))`);
    expect(appFns).toEqual([]);
    // the cron entry point works for the database owner
    const all = await q(db, `select app.tick_all() as r`);
    expect(all[0].r).toEqual({ families: 1, errors: 0 });
  });

  it('anon cannot execute any RPC', async () => {
    await expect(asRole(db, 'anon', `select public.get_state()`)).rejects.toThrow(/permission denied/);
    await expect(asRole(db, 'anon', `select public.create_family('x', 'y', null, 'Europe/Amsterdam', 'EUR')`)).rejects.toThrow(/permission denied/);
    const anonFns = await q(db, `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')`);
    expect(anonFns).toEqual([]);
  });

  it('authenticated can execute exactly the RPCs in api.ts plus the photo checks and ask_begin', async () => {
    const src = readFileSync(new URL('../src/lib/api.ts', import.meta.url), 'utf8');
    const apiNames = new Set([...src.matchAll(/\brpc\b(?:<[^(]*?>)?\(\s*'([a-z_]+)'/g)].map((m) => m[1]));
    expect(apiNames.size).toBeGreaterThan(40);
    const granted = await q<{ proname: string }>(db, `select distinct p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and has_function_privilege('authenticated', p.oid, 'execute')`);
    // Exceptions: the photo checks are called by the Storage policies, and ask_begin by the Edge Function `ask`
    // (api.ask) with the member's own JWT. ask_finish is service_role only, never authenticated.
    expect(granted.map((g) => g.proname).sort()).toEqual([...apiNames, 'can_read_photo', 'can_write_photo', 'ask_begin'].sort());
    expect(granted.map((g) => g.proname)).not.toContain('ask_finish');
  });

  it('an unlinked signed-in user only gets not_member / not_signed_in', async () => {
    await expectCode(as(db, crypto.randomUUID())('get_state'), 'not_member');
    await expectCode(as(db, crypto.randomUUID())('wallet', { p_member: F.Sam.id, p_history_limit: 5 }), 'not_member');
    await expectCode(as(db, null)('create_family', { p_family_name: 'x', p_my_name: 'y' }), 'not_signed_in');
  });
});
