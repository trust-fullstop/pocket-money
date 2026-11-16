// Regression tests for Vera's quality-gate findings (16 Nov 2026).
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { as, clock, expectCode, makeDb, makeFamily, q, uid } from './helpers';

let db: PGlite;
beforeAll(async () => { db = await makeDb(); });
afterEach(() => { clock.now = null; });

const rows = (memberId: string, kind: string) =>
  q(db, `select amount, source_key from public.transactions where member_id = $1 and kind = $2 order by effective_at`, [memberId, kind]);

describe('vera findings', () => {
  it('siblings and (optionally) grandparents cannot see a kid\'s weekly pocket money', async () => {
    const f = await makeFamily(db, { Sam: 'kid', Mia: 'kid', Oma: 'grandparent' });
    await f.owner.rpc('update_member', { p_member: f.Sam.id, p_patch: { allowance_cents: 500 } });
    const allowanceSeenBy = async (rpc: any) => (await rpc('get_state')).members.find((m: any) => m.id === f.Sam.id).allowance_cents;
    expect(await allowanceSeenBy(f.owner.rpc)).toBe(500);
    expect(await allowanceSeenBy(f.Sam.rpc)).toBe(500);
    expect(await allowanceSeenBy(f.Mia.rpc)).toBeNull();
    expect(await allowanceSeenBy(f.Oma.rpc)).toBe(500);
    await f.owner.rpc('update_family', { p_patch: { settings: { grandparents_see_money: false } } });
    expect(await allowanceSeenBy(f.Oma.rpc)).toBeNull();
  });

  it('an excused fine does not count as "earned" for the no-savings rule', async () => {
    clock.now = '2026-11-02T08:00:00Z'; // Monday
    const f = await makeFamily(db, { Kid: 'kid' });
    const t = await f.owner.rpc<any>('create_task', { p_task: { title: 'Bins', kind: 'chore', assignees: [f.Kid.id], repeat: 'once',
      start_on: '2026-11-03', due_time: '19:00', evidence: 'none', penalty_cents: 100 } });
    clock.now = '2026-11-04T08:00:00Z';
    await f.owner.rpc('tick');
    const [inst] = await q(db, `select id from public.task_instances where task_id = $1`, [t.task_ids[0]]);
    await f.owner.rpc('excuse_task', { p_instance: inst.id, p_note: 'Was ill' });
    clock.now = '2026-11-09T08:00:00Z';
    await f.owner.rpc('tick');
    expect(await rows(f.Kid.id, 'no_savings_penalty')).toEqual([]);
  });

  it('pocket money missed while the app was not used (e.g. paused project) is paid on the next run', async () => {
    clock.now = '2026-11-02T08:00:00Z';
    const f = await makeFamily(db, { Kid: 'kid' });
    await f.owner.rpc('update_member', { p_member: f.Kid.id, p_patch: { allowance_cents: 300 } });
    await f.owner.rpc('tick');
    expect(await rows(f.Kid.id, 'allowance')).toHaveLength(1);
    clock.now = '2026-11-23T08:00:00Z'; // 3 weeks later, nobody opened the app
    await f.Kid.rpc('tick');
    expect((await rows(f.Kid.id, 'allowance')).map((r: any) => r.source_key))
      .toEqual(['allowance:2026-11-02', 'allowance:2026-11-09', 'allowance:2026-11-16', 'allowance:2026-11-23']);
    await f.Kid.rpc('tick');
    expect(await rows(f.Kid.id, 'allowance')).toHaveLength(4);
  });

  it('setting an allowance today does not back-pay earlier weeks', async () => {
    clock.now = '2026-11-02T08:00:00Z';
    const f = await makeFamily(db, { Kid: 'kid' });
    await f.owner.rpc('tick');
    clock.now = '2026-11-23T08:00:00Z';
    await f.owner.rpc('tick');
    await f.owner.rpc('update_member', { p_member: f.Kid.id, p_patch: { allowance_cents: 300 } });
    await f.owner.rpc('tick');
    expect(await rows(f.Kid.id, 'allowance')).toHaveLength(1);
  });

  it('a private deployment allows only one family (max_families)', async () => {
    const db2 = await makeDb();
    await db2.exec(`update public.app_config set max_families = 1`);
    const first = as(db2, uid());
    await first('create_family', { p_family_name: 'Ours', p_my_name: 'Dad', p_avatar: null, p_timezone: 'Europe/Amsterdam', p_currency: 'EUR' });
    await expectCode(as(db2, uid())('create_family', { p_family_name: 'Stranger', p_my_name: 'X', p_avatar: null,
      p_timezone: 'Europe/Amsterdam', p_currency: 'EUR' }), 'family_limit');
    // joining the existing family with a QR code still works
    const added = await first<any>('add_member', { p_name: 'Kid', p_role: 'kid' });
    expect((await as(db2, uid())<any>('redeem_invite', { p_code: added.invite.token })).ok).toBe(true);
  });
});
