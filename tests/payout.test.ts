// Pay-out overview (migration 20261116002000): the parent who is "the bank" pays each kid's wallet into the
// kid's real bank account. record_payout settles the whole wallet; payout_summary shows how the wallet was built up.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { balance, clock, expectCode, makeDb, makeFamily, q, type Fam } from './helpers';
import { describeAudit } from '../src/features/family/audit';
import type { Member } from '../src/lib/types';

let db: PGlite;
beforeAll(async () => { db = await makeDb(); });
afterAll(() => { clock.now = null; });

type Row = Record<string, any>;
const summary = (f: Fam) => f.owner.rpc<Row[]>('payout_summary');
const kid = (rows: Row[], id: string) => rows.find((r) => r.member_id === id)!;
const parts = (r: Row) => r.start_cents + r.allowance_cents + r.rewards_cents + r.consequences_cents + r.other_cents;
const payouts = (member: string) =>
  q(db, `select id, currency, pot, amount, kind, label, reason, source_type, source_id, source_key, created_by, reversed_by
           from public.transactions where member_id = $1 and kind = 'payout' order by created_at`, [member]);
const spot = (f: Fam, member: string, direction: 'plus' | 'minus', cents: number, reason: string) =>
  f.owner.rpc<{ ids: string[] }>('spot', { p: { member_id: member, direction, cents, reason } });
const NOTE = '≈ R 99.20 at €1 = R 19.84 (ECB, 2 Nov 2026)';

describe('pay-out', () => {
  let f: Fam;
  let paid: Row;
  let req: string;

  it('breaks the wallet down by kind and it adds up', async () => {
    clock.now = '2026-11-02T08:00:00Z'; // Monday 09:00 CET
    f = await makeFamily(db, { Mum: 'parent', Sam: 'kid', Mia: 'kid' });
    await f.owner.rpc('update_member', { p_member: f.Sam.id, p_patch: { allowance_cents: 500 } });

    clock.now = '2026-11-02T09:00:00Z';
    let s = await summary(f); // catches up the pocket money first
    const created = (await q(db, `select created_at from public.members where id = $1`, [f.Sam.id]))[0].created_at;
    expect(kid(s, f.Sam.id)).toMatchObject({
      wallet_cents: 500, to_pay_cents: 500, owes_cents: 0, start_cents: 0, allowance_cents: 500, rewards_cents: 0,
      consequences_cents: 0, other_cents: 0, last_payout_at: null, last_payout_cents: null,
      allowance_cents_per_period: 500, allowance_period: 'week', allowance_day: 1, last_allowance_on: '2026-11-02',
    });
    expect(new Date(kid(s, f.Sam.id).since).toISOString()).toBe(new Date(created).toISOString());
    expect(s.map((r) => r.member_id)).toEqual([f.Mia.id, f.Sam.id]); // kids only, by name like the family list

    clock.now = '2026-11-02T10:00:00Z';
    await spot(f, f.Sam.id, 'plus', 300, 'Helped with dinner');
    await spot(f, f.Sam.id, 'minus', 100, 'Rude to his sister');
    const oops = await spot(f, f.Sam.id, 'minus', 40, 'Left the bike out');
    await f.owner.rpc('reverse_transaction', { p_tx: oops.ids[0], p_reason: 'It was the neighbour' }); // counts as a consequence
    const ask = await f.Sam.rpc<any>('create_request', { p_kind: 'spend', p_amount: 150, p_label: 'Sweets', p_note: null });
    await f.Mum.rpc('decide_request', { p_request: ask.id, p_approve: true, p_note: null });
    await f.Sam.rpc('transfer', { p_member: f.Sam.id, p_amount: 50, p_to: 'savings' });

    s = await summary(f);
    const sam = kid(s, f.Sam.id);
    expect(sam).toMatchObject({ wallet_cents: 500, to_pay_cents: 500, start_cents: 0, allowance_cents: 500, rewards_cents: 300,
      consequences_cents: -100, other_cents: -200 });
    expect(parts(sam)).toBe(sam.wallet_cents);
    expect(sam.wallet_cents).toBe(await balance(db, f.Sam.id, 'spending'));
    expect(kid(s, f.Mia.id)).toMatchObject({ wallet_cents: 0, to_pay_cents: 0, owes_cents: 0, last_allowance_on: null });
  });

  it('record_payout empties the wallet, keeps the note, and the next cycle starts after it', async () => {
    clock.now = '2026-11-03T10:00:00Z';
    req = crypto.randomUUID();
    paid = await f.Mum.rpc<Row>('record_payout', { p_member: f.Sam.id, p_expected_cents: 500, p_request: req, p_note: NOTE });
    expect(paid).toMatchObject({ member_id: f.Sam.id, amount_cents: 500 });
    expect(await balance(db, f.Sam.id, 'spending')).toBe(0);
    expect(await balance(db, f.Sam.id, 'savings')).toBe(50); // savings are not paid out
    expect(await payouts(f.Sam.id)).toEqual([{ id: paid.id, currency: 'money', pot: 'spending', amount: -500, kind: 'payout',
      label: null, reason: `Paid out to the bank by Mum · ${NOTE}`, source_type: 'payout', source_id: req, source_key: 'payout',
      created_by: f.Mum.id, reversed_by: null }]);
    const audit = await q(db, `select actor, details from public.audit_log where action = 'payout.record'`);
    expect(audit).toEqual([{ actor: f.Mum.id, details: { member: f.Sam.id, amount: 500, note: NOTE } }]);

    clock.now = '2026-11-04T10:00:00Z';
    await spot(f, f.Sam.id, 'plus', 200, 'Washed the car');
    const sam = kid(await summary(f), f.Sam.id);
    expect(new Date(sam.last_payout_at).toISOString()).toBe(new Date(paid.paid_at).toISOString());
    expect(sam.since).toBe(sam.last_payout_at);
    expect(sam).toMatchObject({ wallet_cents: 200, last_payout_cents: 500, start_cents: 0, allowance_cents: 0, rewards_cents: 200,
      consequences_cents: 0, other_cents: 0, last_allowance_on: '2026-11-02' });
    expect(parts(sam)).toBe(200);

    // a wallet row dated before the pay-out but written after it is "carried over"
    await q(db, `insert into public.transactions(family_id, member_id, currency, pot, amount, kind, reason, effective_at)
                 values ($1, $2, 'money', 'spending', -30, 'task_penalty', 'Missed: late test row', $3::timestamptz - interval '1 hour')`,
      [f.familyId, f.Sam.id, paid.paid_at]);
    const late = kid(await summary(f), f.Sam.id);
    expect(late).toMatchObject({ wallet_cents: 170, start_cents: -30, rewards_cents: 200, consequences_cents: 0 });
    expect(parts(late)).toBe(170);
    await q(db, `delete from public.transactions where member_id = $1 and reason = 'Missed: late test row'`, [f.Sam.id]);
  });

  it('a retry with the same request id returns the same pay-out and pays nothing twice', async () => {
    clock.now = '2026-11-04T11:00:00Z';
    const again = await f.Mum.rpc<Row>('record_payout', { p_member: f.Sam.id, p_expected_cents: 500, p_request: req, p_note: NOTE });
    expect(again).toEqual(paid);
    expect(await payouts(f.Sam.id)).toHaveLength(1);
    expect(await balance(db, f.Sam.id, 'spending')).toBe(200);
    // the same request id can't be used for another kid
    await spot(f, f.Mia.id, 'plus', 100, 'Tidy room');
    await expectCode(f.owner.rpc('record_payout', { p_member: f.Mia.id, p_expected_cents: 100, p_request: req }), 'invalid', 'request');
  });

  it('refuses a stale amount, an empty or negative wallet and a long note', async () => {
    clock.now = '2026-11-04T12:00:00Z';
    await expectCode(f.owner.rpc('record_payout', { p_member: f.Sam.id, p_expected_cents: 150, p_request: crypto.randomUUID() }),
      'wrong_status', 'balance_changed');
    await spot(f, f.Mia.id, 'minus', 170, 'Broke a plate on purpose');
    const mia = kid(await summary(f), f.Mia.id);
    expect(mia).toMatchObject({ wallet_cents: -70, to_pay_cents: 0, owes_cents: 70 });
    expect(parts(mia)).toBe(-70);
    await expectCode(f.owner.rpc('record_payout', { p_member: f.Mia.id, p_expected_cents: -70, p_request: crypto.randomUUID() }),
      'invalid', 'nothing_to_pay');
    await expectCode(f.owner.rpc('record_payout', { p_member: f.Sam.id, p_expected_cents: 200, p_request: crypto.randomUUID(),
      p_note: 'x'.repeat(201) }), 'invalid', 'note');
    expect(await payouts(f.Mia.id)).toEqual([]);
    expect(await balance(db, f.Sam.id, 'spending')).toBe(200);
  });

  it('is for managers, for kids of their own family only', async () => {
    clock.now = '2026-11-04T13:00:00Z';
    await expectCode(f.Sam.rpc('record_payout', { p_member: f.Sam.id, p_expected_cents: 200, p_request: crypto.randomUUID() }), 'not_allowed');
    await expectCode(f.Sam.rpc('payout_summary'), 'not_allowed');
    await expectCode(f.owner.rpc('record_payout', { p_member: f.Mum.id, p_expected_cents: 0, p_request: crypto.randomUUID() }),
      'not_allowed', 'member');
    const other = await makeFamily(db, { Leo: 'kid' }, 'Other Family');
    await spot(other, other.Leo.id, 'plus', 100, 'Helped');
    await expectCode(f.owner.rpc('record_payout', { p_member: other.Leo.id, p_expected_cents: 100, p_request: crypto.randomUUID() }),
      'not_found', 'member');
    expect(await payouts(other.Leo.id)).toEqual([]);
    expect((await summary(f)).map((r) => r.member_id)).toEqual([f.Mia.id, f.Sam.id]);
  });

  it('undo puts the money back and the summary goes back to the previous cycle', async () => {
    clock.now = '2026-11-05T10:00:00Z';
    const w = await f.owner.rpc<any>('wallet', { p_member: f.Sam.id, p_history_limit: 50 });
    const row = w.history.find((t: any) => t.id === paid.id);
    expect(row).toMatchObject({ kind: 'payout', amount: -500, can_reverse: true });
    await f.owner.rpc('reverse_transaction', { p_tx: paid.id, p_reason: 'Paid the wrong account' });
    expect(await balance(db, f.Sam.id, 'spending')).toBe(700);
    const sam = kid(await summary(f), f.Sam.id);
    expect(sam).toMatchObject({ wallet_cents: 700, last_payout_at: null, last_payout_cents: null, start_cents: 0,
      allowance_cents: 500, rewards_cents: 500, consequences_cents: -100, other_cents: -200 });
    expect(parts(sam)).toBe(700);
    const audit = await q(db, `select details from public.audit_log where action = 'tx.reverse' and details->>'tx' = $1`, [paid.id]);
    expect(audit[0].details).toMatchObject({ kind: 'payout', member: f.Sam.id, amount: -500 });

    // pay out again: the new cycle starts at the new pay-out
    clock.now = '2026-11-05T11:00:00Z';
    const again = await f.owner.rpc<Row>('record_payout', { p_member: f.Sam.id, p_expected_cents: 700, p_request: crypto.randomUUID() });
    expect(again.amount_cents).toBe(700);
    expect((await payouts(f.Sam.id)).map((p) => p.reason)).toEqual([`Paid out to the bank by Mum · ${NOTE}`, 'Paid out to the bank by Owner']);
    const after = kid(await summary(f), f.Sam.id);
    expect(after).toMatchObject({ wallet_cents: 0, last_payout_cents: 700, start_cents: 0, allowance_cents: 0, rewards_cents: 0 });
  });

  it('tallies do not count pay-outs or their undo as earned, lost or spent', async () => {
    clock.now = '2026-11-05T12:00:00Z';
    const w = await f.Sam.rpc<any>('wallet', { p_member: f.Sam.id, p_history_limit: 0 });
    // earned: pocket money 500 + rewards 300 + 200 + the undone 40 consequence; lost: 100 + 40; spent: 150
    expect(w.tallies.week).toMatchObject({ money_earned: 1040, money_lost: 140, money_spent: 150, money_saved: 50 });
  });

  it('the activity log says who was paid what', () => {
    const byId = { k1: { id: 'k1', display_name: 'Sam' } } as unknown as Record<string, Member>;
    const text = (action: string, details: Record<string, unknown>) =>
      describeAudit({ id: 1, actor: null, action, details, created_at: '' }, byId, 'ZAR').text.replace(/\s/g, ' ');
    expect(text('payout.record', { member: 'k1', amount: 24500, note: '≈ €13.13 at €1 = R 18.66 (ECB, 20 Nov 2026)' }))
      .toBe('Paid R 245 out to Sam’s bank (≈ €13.13)');
    expect(text('payout.record', { member: 'k1', amount: 24500, note: null })).toBe('Paid R 245 out to Sam’s bank');
    expect(text('tx.reverse', { member: 'k1', kind: 'payout', amount: -24500 })).toBe('Undid a pay-out for Sam');
  });
});

describe('pay-outs and the saver rules', () => {
  it('paying out is not "nothing saved and nothing left"', async () => {
    clock.now = '2026-11-02T08:00:00Z'; // Monday
    const n = await makeFamily(db, { Leo: 'kid', Mia: 'kid' }, 'Saver Family');
    const s = await n.owner.rpc<any>('get_state');
    expect(s.family.settings.no_savings_penalty_points).toBeGreaterThan(0);
    expect(s.family.settings.features.saver_rules).toBe(true);

    clock.now = '2026-11-03T10:00:00Z';
    await spot(n, n.Leo.id, 'plus', 300, 'Mowed the lawn');
    await spot(n, n.Mia.id, 'plus', 300, 'Mowed the lawn');
    // Mia spends it all (the rule should fire); Leo's wallet is paid into the bank (it should not)
    const ask = await n.Mia.rpc<any>('create_request', { p_kind: 'spend', p_amount: 300, p_label: 'Game', p_note: null });
    await n.owner.rpc('decide_request', { p_request: ask.id, p_approve: true, p_note: null });
    clock.now = '2026-11-04T10:00:00Z';
    await n.owner.rpc('record_payout', { p_member: n.Leo.id, p_expected_cents: 300, p_request: crypto.randomUUID() });
    expect(await balance(db, n.Leo.id, 'spending')).toBe(0);

    clock.now = '2026-11-09T08:00:00Z'; // the week closes
    expect((await n.owner.rpc<any>('tick')).weeks_closed).toBe(1);
    const pen = (m: string) => q(db, `select amount from public.transactions where member_id = $1 and kind = 'no_savings_penalty'`, [m]);
    expect(await pen(n.Mia.id)).toEqual([{ amount: -s.family.settings.no_savings_penalty_points }]);
    expect(await pen(n.Leo.id)).toEqual([]);

    const leo = await n.Leo.rpc<any>('wallet', { p_member: n.Leo.id, p_history_limit: 0 });
    expect(leo.tallies.month).toMatchObject({ money_earned: 300, money_lost: 0, money_spent: 0 });

    // Next week Leo earns and spends it all: the rule must still work after an earlier pay-out
    clock.now = '2026-11-10T10:00:00Z';
    await spot(n, n.Leo.id, 'plus', 200, 'Washed the car');
    const ask2 = await n.Leo.rpc<any>('create_request', { p_kind: 'spend', p_amount: 200, p_label: 'Snacks', p_note: null });
    await n.owner.rpc('decide_request', { p_request: ask2.id, p_approve: true, p_note: null });
    clock.now = '2026-11-16T08:00:00Z';
    await n.owner.rpc('tick');
    expect(await pen(n.Leo.id)).toEqual([{ amount: -s.family.settings.no_savings_penalty_points }]);
  });
});

describe('perimeter', () => {
  it('anon cannot execute the new functions; signed-in members can call them', async () => {
    const r = await q(db, `select has_function_privilege('anon', 'public.record_payout(uuid, int, uuid, text)', 'execute') as a1,
                                  has_function_privilege('anon', 'public.payout_summary()', 'execute') as a2,
                                  has_function_privilege('authenticated', 'public.record_payout(uuid, int, uuid, text)', 'execute') as u1,
                                  has_function_privilege('authenticated', 'public.payout_summary()', 'execute') as u2,
                                  has_function_privilege('authenticated', 'app.payout_kid(public.members, public.families)', 'execute') as h1,
                                  has_function_privilege('anon', 'app.payout_json(public.transactions)', 'execute') as h2`);
    expect(r[0]).toEqual({ a1: false, a2: false, u1: true, u2: true, h1: false, h2: false });
  });
});
