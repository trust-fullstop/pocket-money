// Family A must never read or act on anything that belongs to family B, whatever ids it sends.
import { beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { clock, expectCode, makeDb, makeFamily, q, type Fam } from './helpers';

let db: PGlite;
let A: Fam;
let B: Fam;
const b: Record<string, string> = {};

beforeAll(async () => {
  clock.now = '2026-11-16T06:00:00Z'; // Monday 07:00 in Amsterdam
  db = await makeDb();
  A = await makeFamily(db, { Kid: 'kid', Oma: 'grandparent' }, 'Family A');
  B = await makeFamily(db, { Kid: 'kid', Mum: 'parent' }, 'Family B');

  const task = await B.owner.rpc<any>('create_task', { p_task: { title: 'B chore', kind: 'chore', assignees: [B.Kid.id],
    repeat: 'daily', start_on: '2026-11-16', due_time: '19:00', evidence: 'none', reward_cents: 100 } });
  b.group = task.group_id;
  const inst = await B.Kid.rpc<any[]>('list_instances', { p_from: '2026-11-16', p_to: '2026-11-16', p_member: null });
  b.instance = inst[0].id;
  await B.Kid.rpc('submit_task', { p_instance: b.instance, p_before: null, p_after: null, p_note: 'done' });
  const spot = await B.owner.rpc<any>('spot', { p: { member_id: B.Kid.id, direction: 'plus', cents: 500, reason: 'B bonus' } });
  b.tx = spot.ids[0];
  b.request = (await B.Kid.rpc<any>('create_request', { p_kind: 'spend', p_amount: 100, p_label: 'B sweets', p_note: null })).id;
  b.goal = (await B.Kid.rpc<any>('upsert_goal', { p: { member_id: B.Kid.id, title: 'B goal', target_cents: 1000, emoji: '🎯' } })).id;
  b.target = (await B.owner.rpc<any>('upsert_target', { p: { member_id: B.Kid.id, title: 'B target', period: 'week',
    metric: 'points_earned', threshold: 10 } })).id;
  b.event = (await B.owner.rpc<any>('upsert_event', { p: { title: 'B event', kind: 'event', starts_at: '2026-11-20T10:00:00Z' } })).id;
  b.device = (await B.owner.rpc<any>('upsert_device', { p: { name: 'B phone', type: 'phone', owner_id: B.Kid.id } })).id;
});

describe('cross-family ids are "not found"', () => {
  const nf = (p: Promise<unknown>) => expectCode(p, 'not_found');

  it('members', async () => {
    await nf(A.owner.rpc('update_member', { p_member: B.Kid.id, p_patch: { display_name: 'Hacked' } }));
    await nf(A.owner.rpc('set_role', { p_member: B.Kid.id, p_role: 'parent' }));
    await nf(A.owner.rpc('remove_member', { p_member: B.Kid.id }));
    await nf(A.owner.rpc('create_invite', { p_member: B.Kid.id }));
    await nf(A.owner.rpc('set_credentials', { p_username: 'hacker1', p_password: 'secret1', p_member: B.Kid.id }));
    await nf(A.owner.rpc('clear_credentials', { p_member: B.Mum.id }));
    await nf(A.owner.rpc('list_logins', { p_member: B.owner.id }));
    await expectCode(A.owner.rpc('remove_login', { p_user_id: B.owner.uid }), 'not_found');
  });

  it('tasks', async () => {
    await nf(A.owner.rpc('create_task', { p_task: { title: 'x', kind: 'chore', assignees: [B.Kid.id], repeat: 'daily',
      start_on: '2026-11-16', due_time: '19:00' } }));
    await nf(A.owner.rpc('update_task', { p_group: b.group, p_patch: { reward_cents: 9999 } }));
    await nf(A.owner.rpc('archive_task', { p_group: b.group }));
    await nf(A.owner.rpc('decide_task', { p_instance: b.instance, p_approve: true, p_note: null }));
    await nf(A.owner.rpc('excuse_task', { p_instance: b.instance, p_note: null }));
    await nf(A.Kid.rpc('submit_task', { p_instance: b.instance, p_before: null, p_after: null, p_note: 'x' }));
    await nf(A.owner.rpc('get_instance', { p_instance: b.instance }));
    await nf(A.owner.rpc('list_instances', { p_from: '2026-11-16', p_to: '2026-11-20', p_member: B.Kid.id }));
  });

  it('money', async () => {
    await nf(A.owner.rpc('wallet', { p_member: B.Kid.id, p_history_limit: 10 }));
    await nf(A.Oma.rpc('wallet', { p_member: B.Kid.id, p_history_limit: 10 }));
    await nf(A.owner.rpc('history', { p_member: B.Kid.id, p_currency: null, p_before: null, p_limit: 10 }));
    await nf(A.owner.rpc('spot', { p: { member_id: B.Kid.id, direction: 'minus', cents: 100, reason: 'x' } }));
    await nf(A.Oma.rpc('spot', { p: { member_id: B.Kid.id, direction: 'plus', cents: 100, reason: 'x' } }));
    await nf(A.owner.rpc('transfer', { p_member: B.Kid.id, p_amount: 100, p_to: 'spending' }));
    await nf(A.owner.rpc('reverse_transaction', { p_tx: b.tx, p_reason: 'x' }));
    await nf(A.owner.rpc('decide_request', { p_request: b.request, p_approve: true, p_note: null }));
    await nf(A.Kid.rpc('cancel_request', { p_request: b.request }));
    await nf(A.owner.rpc('upsert_goal', { p: { member_id: B.Kid.id, title: 'x', target_cents: 100 } }));
    await nf(A.owner.rpc('upsert_goal', { p: { id: b.goal, member_id: A.Kid.id, title: 'x', target_cents: 100 } }));
    await nf(A.owner.rpc('archive_goal', { p_goal: b.goal }));
    await nf(A.owner.rpc('upsert_target', { p: { member_id: B.Kid.id, title: 'x', period: 'week', metric: 'points_earned', threshold: 1 } }));
    await nf(A.owner.rpc('upsert_target', { p: { id: b.target, member_id: A.Kid.id, title: 'x', period: 'week', metric: 'points_earned', threshold: 1 } }));
    await nf(A.owner.rpc('archive_target', { p_target: b.target }));
  });

  it('calendar and devices', async () => {
    await nf(A.owner.rpc('upsert_event', { p: { id: b.event, title: 'x', kind: 'event', starts_at: '2026-11-20T10:00:00Z' } }));
    await nf(A.owner.rpc('upsert_event', { p: { title: 'x', kind: 'event', starts_at: '2026-11-20T10:00:00Z', for_members: [B.Kid.id] } }));
    await nf(A.owner.rpc('delete_event', { p_event: b.event }));
    await nf(A.owner.rpc('upsert_device', { p: { id: b.device, name: 'x', type: 'phone' } }));
    await nf(A.owner.rpc('upsert_device', { p: { name: 'x', type: 'phone', owner_id: B.Kid.id } }));
    await nf(A.owner.rpc('delete_device', { p_device: b.device }));
  });

  it('B data is untouched', async () => {
    const r = await q(db, `select display_name, role from public.members where id = $1`, [B.Kid.id]);
    expect(r[0]).toEqual({ display_name: 'Kid', role: 'kid' });
    const i = await q(db, `select status from public.task_instances where id = $1`, [b.instance]);
    expect(i[0].status).toBe('submitted');
    const rq = await q(db, `select status from public.requests where id = $1`, [b.request]);
    expect(rq[0].status).toBe('pending');
  });
});

describe('lists only show your own family', () => {
  it('nothing of B leaks into A lists', async () => {
    const everything = JSON.stringify([
      await A.owner.rpc('get_state'),
      await A.owner.rpc('list_tasks'),
      await A.owner.rpc('list_instances', { p_from: '2026-11-10', p_to: '2026-11-30', p_member: null }),
      await A.owner.rpc('list_approvals'),
      await A.owner.rpc('list_requests', { p_status: 'all' }),
      await A.owner.rpc('list_events', { p_from: '2026-11-01T00:00:00Z', p_to: '2026-12-31T00:00:00Z' }),
      await A.owner.rpc('list_devices'),
      await A.owner.rpc('list_audit', { p_limit: 200 }),
      await A.owner.rpc('wallet', { p_member: A.Kid.id, p_history_limit: 200 }),
      await A.Oma.rpc('get_state'),
    ]);
    for (const id of [B.familyId, B.Kid.id, B.Mum.id, B.owner.id, ...Object.values(b)]) {
      expect(everything).not.toContain(id);
    }
    expect(everything).not.toContain('B chore');
  });

  it('photo paths of another family are not readable or writable', async () => {
    const path = `${B.familyId}/${B.Kid.id}/x.jpg`;
    expect(await A.owner.rpc('can_read_photo', { p_path: path })).toBe(false);
    expect(await A.owner.rpc('can_write_photo', { p_path: path })).toBe(false);
    expect(await B.owner.rpc('can_read_photo', { p_path: path })).toBe(true);
    expect(await B.Kid.rpc('can_write_photo', { p_path: path })).toBe(true);
    expect(await B.Kid.rpc('can_write_photo', { p_path: `${B.familyId}/${B.Mum.id}/x.jpg` })).toBe(false);
    await expectCode(A.Kid.rpc('submit_task', { p_instance: b.instance, p_before: path, p_after: null, p_note: null }), 'not_found');
  });
});
