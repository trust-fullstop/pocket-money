// Pocket money per week or per month, and the real bank balance (migration 20261116001400).
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { clock, expectCode, makeDb, makeFamily, q, type Fam } from './helpers';

let db: PGlite;
beforeAll(async () => { db = await makeDb(); });
afterEach(() => { clock.now = null; });

const paid = (memberId: string) =>
  q<{ amount: number; source_key: string; reason: string }>(db,
    `select amount, source_key, reason from public.transactions where member_id = $1 and kind = 'allowance' order by effective_at`, [memberId]);

describe('monthly pocket money', () => {
  let f: Fam;
  it('pays on the chosen day of the month, starting from the next pay day (no retro-pay)', async () => {
    clock.now = '2026-11-16T08:00:00Z';
    f = await makeFamily(db, { Sam: 'kid', Mia: 'kid' });
    await f.owner.rpc('update_member', { p_member: f.Sam.id, p_patch: { allowance_cents: 2000, allowance_period: 'month', allowance_day: 1 } });
    await f.owner.rpc('tick');
    expect(await paid(f.Sam.id)).toEqual([]); // 1 Nov is before the schedule started

    clock.now = '2026-12-01T07:00:00Z';
    await f.Sam.rpc('tick');
    await f.Sam.rpc('tick');
    expect(await paid(f.Sam.id)).toEqual([{ amount: 2000, source_key: 'allowance-m:2026-12-01', reason: 'Monthly pocket money' }]);

    const st = await f.Sam.rpc<any>('get_state');
    expect(st.me).toMatchObject({ allowance_cents: 2000, allowance_period: 'month', allowance_day: 1 });
    expect(st.members.find((m: any) => m.id === f.Mia.id).allowance_period).toBeNull(); // sibling can't see
  });

  it('catches up missed months after a pause (max 12 weeks) and never pays twice', async () => {
    clock.now = '2027-02-10T08:00:00Z'; // nobody opened the app since 1 Dec
    await f.owner.rpc('tick');
    expect((await paid(f.Sam.id)).map((r) => r.source_key))
      .toEqual(['allowance-m:2026-12-01', 'allowance-m:2027-01-01', 'allowance-m:2027-02-01']);
  });

  it('weekly on a chosen weekday; changing the day inside a week does not pay twice', async () => {
    clock.now = '2027-03-01T08:00:00Z'; // Monday
    await f.owner.rpc('update_member', { p_member: f.Mia.id, p_patch: { allowance_cents: 300, allowance_period: 'week', allowance_day: 1 } });
    await f.owner.rpc('tick');
    expect((await paid(f.Mia.id)).map((r) => r.source_key)).toEqual(['allowance:2027-03-01']);
    clock.now = '2027-03-03T08:00:00Z'; // Wednesday: move pay day to Friday
    await f.owner.rpc('update_member', { p_member: f.Mia.id, p_patch: { allowance_day: 5 } });
    clock.now = '2027-03-05T08:00:00Z';
    await f.owner.rpc('tick');
    expect((await paid(f.Mia.id)).map((r) => r.source_key)).toEqual(['allowance:2027-03-01']); // Fri skipped: paid Mon
    clock.now = '2027-03-12T08:00:00Z';
    await f.owner.rpc('tick');
    expect((await paid(f.Mia.id)).map((r) => r.source_key)).toEqual(['allowance:2027-03-01', 'allowance:2027-03-12']);
  });

  it('validates the schedule and keeps it parent-only', async () => {
    await expectCode(f.owner.rpc('update_member', { p_member: f.Sam.id, p_patch: { allowance_period: 'month', allowance_day: 31 } }), 'invalid', 'allowance_day');
    await expectCode(f.owner.rpc('update_member', { p_member: f.Sam.id, p_patch: { allowance_period: 'week', allowance_day: 9 } }), 'invalid', 'allowance_day');
    await expectCode(f.owner.rpc('update_member', { p_member: f.Sam.id, p_patch: { allowance_period: 'year' } }), 'invalid', 'allowance_period');
    await expectCode(f.Sam.rpc('update_member', { p_member: f.Sam.id, p_patch: { allowance_period: 'week' } }), 'not_allowed', 'allowance');
    // switching period without a day resets the day to 1
    await f.owner.rpc('update_member', { p_member: f.Sam.id, p_patch: { allowance_period: 'week' } });
    expect((await q(db, `select allowance_period, allowance_day from public.members where id = $1`, [f.Sam.id]))[0])
      .toEqual({ allowance_period: 'week', allowance_day: 1 });
  });
});

describe('real bank balance', () => {
  it('parents record it for a kid, the kid for themself; siblings cannot see it', async () => {
    clock.now = '2026-11-16T08:00:00Z';
    const f = await makeFamily(db, { Mum: 'parent', Sam: 'kid', Mia: 'kid', Oma: 'grandparent' });
    const b1 = await f.Mum.rpc<any>('set_bank_balance', { p_member: f.Sam.id, p_amount_cents: 12345, p_label: 'Revolut', p_as_of: null, p_note: 'From the app' });
    expect(b1).toMatchObject({ label: 'Revolut', amount_cents: 12345, as_of: '2026-11-16', can_delete: true });
    await f.Sam.rpc('set_bank_balance', { p_member: f.Sam.id, p_amount_cents: 12000, p_label: 'Revolut', p_as_of: '2026-11-17' })
      .then(() => { throw new Error('future date accepted'); }, () => undefined);
    const b2 = await f.Sam.rpc<any>('set_bank_balance', { p_member: f.Sam.id, p_amount_cents: -250, p_label: null, p_as_of: '2026-11-15', p_note: null });
    expect(b2).toMatchObject({ label: 'Bank', amount_cents: -250, can_delete: true });

    const list = await f.Sam.rpc<any[]>('list_bank_balances', { p_member: f.Sam.id, p_limit: 10 });
    expect(list.map((x) => x.amount_cents)).toEqual([12345, -250]); // newest as_of first
    expect(list[0].can_delete).toBe(false); // Sam didn't create Mum's entry
    expect(await f.Oma.rpc<any[]>('list_bank_balances', { p_member: f.Sam.id, p_limit: 10 })).toHaveLength(2);
    await expectCode(f.Mia.rpc('list_bank_balances', { p_member: f.Sam.id, p_limit: 10 }), 'not_allowed');
    await expectCode(f.Mia.rpc('set_bank_balance', { p_member: f.Sam.id, p_amount_cents: 1 }), 'not_allowed');
    await expectCode(f.Oma.rpc('set_bank_balance', { p_member: f.Sam.id, p_amount_cents: 1 }), 'not_allowed');
    await expectCode(f.Sam.rpc('delete_bank_balance', { p_id: b1.id }), 'not_allowed');
    await f.Mum.rpc('delete_bank_balance', { p_id: b2.id });
    expect(await f.Sam.rpc<any[]>('list_bank_balances', { p_member: f.Sam.id, p_limit: 10 })).toHaveLength(1);

    await f.owner.rpc('update_family', { p_patch: { settings: { features: { bank: false } } } });
    await expectCode(f.Mum.rpc('set_bank_balance', { p_member: f.Sam.id, p_amount_cents: 1 }), 'feature_off', 'bank');
  });

  it('new families have bank on by default', async () => {
    const st = await (await makeFamily(db, {}, 'Fresh', 'Europe/Amsterdam')).owner.rpc<any>('get_state');
    expect(st.family.settings.features.bank).toBe(true);
  });
});

describe('vera gate 4: allowance guards', () => {
  it('switching weekly -> monthly on the same day never pays twice', async () => {
    clock.now = '2026-11-02T08:00:00Z'; // Monday
    const f = await makeFamily(db, { Kid: 'kid' });
    await f.owner.rpc('update_member', { p_member: f.Kid.id, p_patch: { allowance_cents: 500, allowance_period: 'week', allowance_day: 1 } });
    await f.owner.rpc('tick');
    await f.owner.rpc('update_member', { p_member: f.Kid.id, p_patch: { allowance_cents: 2000, allowance_period: 'month', allowance_day: 2 } });
    clock.now = '2026-11-02T09:00:00Z';
    await f.owner.rpc('tick');
    expect((await paid(f.Kid.id)).map((r) => r.source_key)).toEqual(['allowance:2026-11-02']);
    clock.now = '2026-12-02T08:00:00Z';
    await f.owner.rpc('tick');
    expect((await paid(f.Kid.id)).map((r) => r.source_key)).toEqual(['allowance:2026-11-02', 'allowance-m:2026-12-02']);
  });

  it('switching monthly -> weekly does not pay a week right after the monthly payment', async () => {
    clock.now = '2026-11-01T08:00:00Z'; // Sunday
    const f = await makeFamily(db, { Kid: 'kid' });
    await f.owner.rpc('update_member', { p_member: f.Kid.id, p_patch: { allowance_cents: 2000, allowance_period: 'month', allowance_day: 1 } });
    await f.owner.rpc('tick');
    await f.owner.rpc('update_member', { p_member: f.Kid.id, p_patch: { allowance_cents: 500, allowance_period: 'week', allowance_day: 1 } });
    clock.now = '2026-11-02T08:00:00Z'; // Monday, 1 day after the monthly payment
    await f.owner.rpc('tick');
    clock.now = '2026-11-09T08:00:00Z';
    await f.owner.rpc('tick');
    expect((await paid(f.Kid.id)).map((r) => r.source_key)).toEqual(['allowance-m:2026-11-01', 'allowance:2026-11-09']);
  });

  it('catch-up after a long pause pays at most 12 weekly allowances', async () => {
    clock.now = '2026-08-03T08:00:00Z'; // Monday
    const f = await makeFamily(db, { Kid: 'kid' });
    await f.owner.rpc('update_member', { p_member: f.Kid.id, p_patch: { allowance_cents: 100, allowance_period: 'week', allowance_day: 1 } });
    await f.owner.rpc('tick');
    clock.now = '2026-11-16T08:00:00Z'; // Monday, 15 weeks later
    await f.owner.rpc('tick');
    const keys = (await paid(f.Kid.id)).map((r) => r.source_key);
    expect(keys[0]).toBe('allowance:2026-08-03');
    expect(keys.length - 1).toBe(12); // 12 catch-up payments, ending today
    expect(keys.at(-1)).toBe('allowance:2026-11-16');
  });
});
