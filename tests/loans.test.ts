// Loans (migration 20261116002100): a kid borrows from a parent ("the bank") and chooses how to pay it back from
// their pocket money. The money is handed over in real life; the app tracks the debt and the repayments.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { balance, clock, expectCode, makeDb, makeFamily, q, type Fam } from './helpers';
import { describeAudit } from '../src/features/family/audit';
import type { Member } from '../src/lib/types';

let db: PGlite;
beforeAll(async () => { db = await makeDb(); });
afterAll(() => { clock.now = null; });

type Row = Record<string, any>;
const MON2 = '2026-11-02T08:00:00Z'; // Monday 09:00 CET
const at = (iso: string) => { clock.now = iso; };
const req = () => crypto.randomUUID();

const allowance = (f: Fam, member: string, cents: number) =>
  f.owner.rpc('update_member', { p_member: member, p_patch: { allowance_cents: cents } });
const spot = (f: Fam, member: string, direction: 'plus' | 'minus', cents: number, reason: string) =>
  f.owner.rpc<{ ids: string[] }>('spot', { p: { member_id: member, direction, cents, reason } });
const tick = (f: Fam) => f.owner.rpc<any>('tick');
const repayments = (member: string) =>
  q(db, `select id, amount, kind, label, reason, source_type, source_id, source_key, effective_at, reversed_by, created_by
           from public.transactions where member_id = $1 and kind = 'loan_repayment' order by effective_at, created_at`, [member]);
const loanOf = async (f: Fam, who: string, id: string) =>
  ((await f[who].rpc<Row[]>('list_loans', {})) as Row[]).find((l) => l.id === id)!;
const managerLoan = async (f: Fam, id: string) => (await f.owner.rpc<Row[]>('list_loans', {})).find((l) => l.id === id)!;
const summaryRow = async (f: Fam, member: string) => (await f.owner.rpc<Row[]>('payout_summary')).find((r) => r.member_id === member)!;
const parts = (r: Row) =>
  r.start_cents + r.allowance_cents + r.rewards_cents + r.consequences_cents + r.loan_cents + r.other_cents;
const iso = (t: string) => new Date(t).toISOString();

describe('a kid asks, a parent says yes, the pocket money pays it back', () => {
  let f: Fam;
  let loan: Row;

  it('a kid asks for a loan with a plan', async () => {
    at(MON2);
    f = await makeFamily(db, { Mum: 'parent', Sam: 'kid', Mia: 'kid', Oma: 'grandparent' });
    await allowance(f, f.Sam.id, 500);
    await tick(f); // today's pocket money (500)
    at('2026-11-02T08:30:00Z');
    loan = await f.Sam.rpc<Row>('request_loan', { p_member: f.Sam.id, p_amount: 2000, p_purpose: '  School   trip ',
      p_plan: 'per_pay', p_installment: 500 });
    expect(loan).toMatchObject({ member_id: f.Sam.id, purpose: 'School trip', amount_cents: 2000, fee_cents: 0, total_cents: 2000,
      repaid_cents: 0, outstanding_cents: 2000, plan: 'per_pay', installment_cents: 500, status: 'requested',
      requested_by: f.Sam.id, next_amount_cents: 500, next_pay_on: '2026-11-09', pay_days_left: 4, payoff_on: '2026-11-30',
      can_decide: false, can_cancel: true, can_accept: false, can_repay: false, can_forgive: false });
    expect((await f.Mum.rpc<any>('get_state')).counts.loans).toBe(1);
    expect((await f.Sam.rpc<any>('get_state')).counts.loans).toBe(0);
    expect((await f.Oma.rpc<any>('get_state')).counts.loans).toBe(0);
    expect((await managerLoan(f, loan.id)).can_decide).toBe(true);
  });

  it('a parent approves; it starts now', async () => {
    at('2026-11-02T09:00:00Z');
    const ok = await f.Mum.rpc<Row>('decide_loan', { p_id: loan.id, p_approve: true, p_note: 'Have a great trip' });
    expect(ok).toMatchObject({ status: 'active', decided_by: f.Mum.id, decision_note: 'Have a great trip', can_forgive: true,
      can_repay: true });
    expect(iso(ok.started_at)).toBe('2026-11-02T09:00:00.000Z');
    expect((await f.Mum.rpc<any>('get_state')).counts.loans).toBe(0);
    await expectCode(f.Mum.rpc('decide_loan', { p_id: loan.id, p_approve: true }), 'wrong_status');
    const audit = await q(db, `select action, actor from public.audit_log where action like 'loan.%' and details->>'loan' = $1
                                order by id`, [loan.id]);
    expect(audit).toEqual([{ action: 'loan.request', actor: f.Sam.id }, { action: 'loan.approve', actor: f.Mum.id }]);
  });

  it('the next pocket money repays exactly one installment, once', async () => {
    at('2026-11-09T08:00:00Z');
    await tick(f);
    await tick(f);
    const [alw] = await q(db, `select id, effective_at from public.transactions where member_id = $1 and kind = 'allowance'
                                and effective_at > '2026-11-05' `, [f.Sam.id]);
    const rows = await repayments(f.Sam.id);
    expect(rows).toEqual([{ id: rows[0].id, amount: -500, kind: 'loan_repayment', label: null,
      reason: 'Loan repayment: School trip (€15.00 to go)', source_type: 'loan', source_id: loan.id, source_key: `alw:${alw.id}`,
      effective_at: new Date(new Date(alw.effective_at).getTime() + 1000), reversed_by: null, created_by: null }]);
    expect(await balance(db, f.Sam.id, 'spending')).toBe(500);
    expect(await loanOf(f, 'Sam', loan.id)).toMatchObject({ repaid_cents: 500, outstanding_cents: 1500, status: 'active',
      next_amount_cents: 500, next_pay_on: '2026-11-16', pay_days_left: 3, payoff_on: '2026-11-30' });
  });

  it('the pay-out overview shows the loan as its own line, and it still adds up', async () => {
    const sam = await summaryRow(f, f.Sam.id);
    expect(sam).toMatchObject({ wallet_cents: 500, start_cents: 0, allowance_cents: 1000, rewards_cents: 0, consequences_cents: 0,
      loan_cents: -500, other_cents: 0, loan_outstanding_cents: 1500, loan_purpose: 'School trip' });
    expect(parts(sam)).toBe(sam.wallet_cents);
    expect(await summaryRow(f, f.Mia.id)).toMatchObject({ loan_cents: 0, loan_outstanding_cents: null, loan_purpose: null });
  });

  it('tallies count the repayment as spent, not lost or earned', async () => {
    const w = await f.Sam.rpc<any>('wallet', { p_member: f.Sam.id, p_history_limit: 0 });
    expect(w.tallies.week).toMatchObject({ money_earned: 500, money_lost: 0, money_spent: 500 });
  });

  it('loans are private: siblings and grandparents get not_allowed; grandparents see "Pocket money adjustment"', async () => {
    await expectCode(f.Mia.rpc('list_loans', { p_member: f.Sam.id }), 'not_allowed');
    expect(await f.Mia.rpc('list_loans', {})).toEqual([]);
    await expectCode(f.Oma.rpc('list_loans', {}), 'not_allowed');
    await expectCode(f.Oma.rpc('list_loans', { p_member: f.Sam.id }), 'not_allowed');
    const row = (w: any) => w.history.find((t: any) => t.kind === 'loan_repayment' || (t.masked && t.amount < 0));
    const oma = row(await f.Oma.rpc<any>('wallet', { p_member: f.Sam.id, p_history_limit: 50 }));
    expect(oma).toMatchObject({ kind: 'adjustment', amount: -500, reason: 'Pocket money adjustment', source_id: null,
      source_type: null, created_by: null, masked: true, can_reverse: false });
    const own = row(await f.Sam.rpc<any>('wallet', { p_member: f.Sam.id, p_history_limit: 50 }));
    expect(own).toMatchObject({ reason: 'Loan repayment: School trip (€15.00 to go)', source_id: loan.id, masked: false, can_reverse: false });
    const mum = row(await f.Mum.rpc<any>('wallet', { p_member: f.Sam.id, p_history_limit: 50 }));
    expect(mum).toMatchObject({ source_id: loan.id, masked: false, can_reverse: true });
  });

  it('the generic undo refuses loan repayments', async () => {
    const [r] = await repayments(f.Sam.id);
    await expectCode(f.Mum.rpc('reverse_transaction', { p_tx: r.id, p_reason: 'Oops' }), 'not_allowed', 'use_loan_tools');
    expect((await repayments(f.Sam.id))[0].reversed_by).toBeNull();
  });

  it('"Pay back now" works, is idempotent and capped', async () => {
    at('2026-11-09T10:00:00Z');
    const r1 = req();
    let l = await f.Sam.rpc<Row>('repay_loan_now', { p_id: loan.id, p_amount: 200, p_request: r1 });
    expect(l).toMatchObject({ repaid_cents: 700, outstanding_cents: 1300, status: 'active' });
    l = await f.Sam.rpc<Row>('repay_loan_now', { p_id: loan.id, p_amount: 200, p_request: r1 });
    expect(l.outstanding_cents).toBe(1300);
    expect(await balance(db, f.Sam.id, 'spending')).toBe(300);
    expect((await repayments(f.Sam.id)).map((x) => x.source_key)).toContain(`extra:${r1}`);
    await expectCode(f.Sam.rpc('repay_loan_now', { p_id: loan.id, p_amount: 400, p_request: req() }), 'insufficient');
    await expectCode(f.Sam.rpc('repay_loan_now', { p_id: loan.id, p_amount: 0, p_request: req() }), 'invalid', 'amount');
    await expectCode(f.Sam.rpc('repay_loan_now', { p_id: loan.id, p_amount: 100, p_request: null }), 'invalid', 'request');
    await expectCode(f.Mia.rpc('repay_loan_now', { p_id: loan.id, p_amount: 100, p_request: req() }), 'not_allowed');
    await expectCode(f.Oma.rpc('repay_loan_now', { p_id: loan.id, p_amount: 100, p_request: req() }), 'not_allowed');

    at('2026-11-09T10:05:00Z');
    await spot(f, f.Sam.id, 'plus', 2000, 'Birthday money');
    await expectCode(f.Sam.rpc('repay_loan_now', { p_id: loan.id, p_amount: 1400, p_request: req() }), 'invalid', 'more_than_owed');
    l = await f.Mum.rpc<Row>('repay_loan_now', { p_id: loan.id, p_amount: 1300, p_request: req() }); // a parent may too
    expect(l).toMatchObject({ status: 'repaid', outstanding_cents: 0, repaid_cents: 2000, next_pay_on: null, pay_days_left: null });
    expect(l.ended_at).not.toBeNull();
    expect(await balance(db, f.Sam.id, 'spending')).toBe(1000);
    expect((await repayments(f.Sam.id)).at(-1)!.reason).toBe('Loan repayment: School trip (paid off 🎉)');
    const audit = await q(db, `select actor, details from public.audit_log where action = 'loan.repay' and family_id = $1
                                order by id`, [f.familyId]);
    expect(audit.map((a) => [a.actor, a.details.amount])).toEqual([[f.Sam.id, 200], [f.Mum.id, 1300]]);
    // a repaid loan takes nothing more from the pocket money
    at('2026-11-16T08:00:00Z');
    await tick(f);
    expect(await repayments(f.Sam.id)).toHaveLength(3);
  });

  it('undoing a repayment re-opens a repaid loan; only from the next pocket money on', async () => {
    at('2026-11-16T10:00:00Z');
    const last = (await repayments(f.Sam.id)).at(-1)!;
    await expectCode(f.Sam.rpc('reverse_loan_repayment', { p_tx: last.id, p_reason: 'Mine' }), 'not_allowed');
    await expectCode(f.Mum.rpc('reverse_loan_repayment', { p_tx: last.id, p_reason: '  ' }), 'invalid', 'reason');
    const l = await f.Mum.rpc<Row>('reverse_loan_repayment', { p_tx: last.id, p_reason: 'Paid with the wrong money' });
    expect(l).toMatchObject({ status: 'active', outstanding_cents: 1300, ended_at: null, next_pay_on: '2026-11-23' });
    expect(await balance(db, f.Sam.id, 'spending')).toBe(1000 + 500 + 1300); // + this Monday's pocket money
    await expectCode(f.Mum.rpc('reverse_loan_repayment', { p_tx: last.id, p_reason: 'Again' }), 'wrong_status');
    const undo = await q(db, `select amount, reason, source_type, source_id from public.transactions where id = (
                                select reversed_by from public.transactions where id = $1)`, [last.id]);
    expect(undo).toEqual([{ amount: 1300, reason: 'Loan repayment undone: Paid with the wrong money', source_type: 'reversal',
      source_id: last.id }]);
    // this Monday's pocket money was paid before the loan re-opened: it does not repay
    await tick(f);
    expect(await repayments(f.Sam.id)).toHaveLength(3);
    const oma = (await f.Oma.rpc<any>('wallet', { p_member: f.Sam.id, p_history_limit: 50 })).history
      .find((t: any) => t.masked && t.amount === 1300);
    expect(oma).toMatchObject({ kind: 'adjustment', reason: 'Pocket money adjustment', source_id: null, masked: true });
    // tallies net the undo against the repayment (both in "spent")
    const w = await f.Sam.rpc<any>('wallet', { p_member: f.Sam.id, p_history_limit: 0 });
    expect(w.tallies.month.money_spent).toBe(500 + 200 + 1300 - 1300);
  });

  it('one open loan per kid', async () => {
    await expectCode(f.Sam.rpc('request_loan', { p_member: f.Sam.id, p_amount: 100, p_purpose: 'More', p_plan: 'next_pay' }),
      'invalid', 'loan_open');
    await expectCode(f.Mum.rpc('request_loan', { p_member: f.Sam.id, p_amount: 100, p_purpose: 'More', p_plan: 'next_pay' }),
      'invalid', 'loan_open');
    await expect(q(db, `insert into public.loans(family_id, member_id, purpose, amount_cents, total_cents, plan, installment_cents,
                                                 status, started_at)
                        values ($1, $2, 'x', 100, 100, 'next_pay', 100, 'active', now())`, [f.familyId, f.Sam.id])).rejects.toThrow();
  });

  it('a parent can forgive the rest; then repayments cannot be undone any more', async () => {
    await expectCode(f.Sam.rpc('forgive_loan', { p_id: loan.id, p_note: null }), 'not_allowed');
    const l = await f.Mum.rpc<Row>('forgive_loan', { p_id: loan.id, p_note: 'Well done for paying most of it' });
    expect(l).toMatchObject({ status: 'forgiven', forgiven_cents: 1300, outstanding_cents: 0, repaid_cents: 700,
      decision_note: 'Well done for paying most of it', can_forgive: false, can_repay: false });
    const [first] = await repayments(f.Sam.id);
    await expectCode(f.Mum.rpc('reverse_loan_repayment', { p_tx: first.id, p_reason: 'x' }), 'not_allowed', 'forgiven');
    const mum = (await f.Mum.rpc<any>('wallet', { p_member: f.Sam.id, p_history_limit: 50 })).history
      .find((t: any) => t.id === first.id);
    expect(mum.can_reverse).toBe(false);
    await expectCode(f.Mum.rpc('forgive_loan', { p_id: loan.id }), 'wrong_status');
    // and Sam may ask again
    const again = await f.Sam.rpc<Row>('request_loan', { p_member: f.Sam.id, p_amount: 100, p_purpose: 'Sweets', p_plan: 'next_pay' });
    expect(again.status).toBe('requested');
    expect((await f.Sam.rpc<Row[]>('list_loans', {})).map((x) => x.status)).toEqual(['requested', 'forgiven']);
  });

  it('undoing a repayment of a paid-off loan is refused while a newer loan is open', async () => {
    // Mia pays a small loan off, then asks for a new one; undoing the old repayment must not clash with it
    at('2026-11-16T11:00:00Z');
    await spot(f, f.Mia.id, 'plus', 300, 'Helped in the garden');
    const old = await f.Mum.rpc<Row>('request_loan', { p_member: f.Mia.id, p_amount: 200, p_purpose: 'Book', p_plan: 'next_pay' });
    const paid = await f.Mia.rpc<Row>('repay_loan_now', { p_id: old.id, p_amount: 200, p_request: req() });
    expect(paid.status).toBe('repaid');
    await f.Mia.rpc('request_loan', { p_member: f.Mia.id, p_amount: 100, p_purpose: 'Stickers', p_plan: 'next_pay' });
    const last = (await repayments(f.Mia.id)).at(-1)!;
    await expectCode(f.Mum.rpc('reverse_loan_repayment', { p_tx: last.id, p_reason: 'Mistake' }), 'invalid', 'loan_open');
  });
});

describe('plans and pocket money', () => {
  it('next_pay: everything from the next pocket money', async () => {
    at(MON2);
    const f = await makeFamily(db, { Mum: 'parent', Leo: 'kid' }, 'Next Pay Family');
    await allowance(f, f.Leo.id, 800);
    await tick(f);
    const l = await f.Leo.rpc<Row>('request_loan', { p_member: f.Leo.id, p_amount: 600, p_purpose: 'Football', p_plan: 'next_pay',
      p_installment: 50 });
    expect(l).toMatchObject({ plan: 'next_pay', installment_cents: 600, pay_days_left: 1, payoff_on: '2026-11-09' });
    await f.Mum.rpc('decide_loan', { p_id: l.id, p_approve: true });
    at('2026-11-09T08:00:00Z');
    await tick(f);
    expect((await repayments(f.Leo.id)).map((r) => [r.amount, r.reason])).toEqual([[-600, 'Loan repayment: Football (paid off 🎉)']]);
    expect(await loanOf(f, 'Leo', l.id)).toMatchObject({ status: 'repaid', outstanding_cents: 0 });
    expect(await balance(db, f.Leo.id, 'spending')).toBe(800 + 800 - 600);
  });

  it('the wallet cannot cover it: a partial repayment, never below zero; the rest stays on the loan', async () => {
    at(MON2);
    const f = await makeFamily(db, { Mum: 'parent', Leo: 'kid', Sam: 'kid' }, 'Partial Family');
    await allowance(f, f.Leo.id, 500);
    await allowance(f, f.Sam.id, 500);
    await tick(f);
    at('2026-11-02T10:00:00Z');
    await spot(f, f.Leo.id, 'minus', 700, 'Broke the window');     // Leo: -200
    await spot(f, f.Sam.id, 'minus', 1500, 'Lost the house key'); // Sam: -1000
    const leo = await f.Mum.rpc<Row>('request_loan', { p_member: f.Leo.id, p_amount: 1200, p_purpose: 'Bike lights', p_plan: 'per_pay',
      p_installment: 500 }); // recorded by a parent: active right away
    expect(leo).toMatchObject({ status: 'active', requested_by: f.Mum.id, decided_by: f.Mum.id });
    const sam = await f.Mum.rpc<Row>('request_loan', { p_member: f.Sam.id, p_amount: 1000, p_purpose: 'New key', p_plan: 'per_pay',
      p_installment: 500 });
    expect((await q(db, `select action from public.audit_log where details->>'loan' = $1`, [leo.id])).map((a) => a.action))
      .toEqual(['loan.record']);

    at('2026-11-09T08:00:00Z');
    await tick(f);
    expect((await repayments(f.Leo.id)).map((r) => r.amount)).toEqual([-300]);
    expect(await balance(db, f.Leo.id, 'spending')).toBe(0);
    expect(await repayments(f.Sam.id)).toEqual([]); // wallet still below zero: nothing taken
    expect(await balance(db, f.Sam.id, 'spending')).toBe(-500);
    expect((await managerLoan(f, leo.id)).outstanding_cents).toBe(900);

    // money earned between pay days is not grabbed for a pay day that was short
    at('2026-11-10T10:00:00Z');
    await spot(f, f.Leo.id, 'plus', 200, 'Helped');
    await spot(f, f.Sam.id, 'plus', 800, 'Helped');
    await tick(f);
    expect((await repayments(f.Leo.id)).map((r) => r.amount)).toEqual([-300]);
    expect(await repayments(f.Sam.id)).toEqual([]);

    at('2026-11-16T08:00:00Z');
    await tick(f);
    expect((await repayments(f.Leo.id)).map((r) => r.amount)).toEqual([-300, -500]);
    expect((await repayments(f.Sam.id)).map((r) => r.amount)).toEqual([-500]);
    at('2026-11-23T08:00:00Z');
    await tick(f);
    expect((await repayments(f.Leo.id)).map((r) => r.amount)).toEqual([-300, -500, -400]); // the last one is smaller
    expect((await managerLoan(f, leo.id)).status).toBe('repaid');
    expect(await balance(db, f.Leo.id, 'spending')).toBe(300);
    expect((await managerLoan(f, sam.id)).outstanding_cents).toBe(0);
  });

  it('pocket money changed or stopped: no repayment without an actual pocket-money row', async () => {
    at(MON2);
    const f = await makeFamily(db, { Mum: 'parent', Mia: 'kid' }, 'Stop Family');
    await allowance(f, f.Mia.id, 500);
    await tick(f);
    at('2026-11-02T10:00:00Z');
    const l = await f.Mum.rpc<Row>('request_loan', { p_member: f.Mia.id, p_amount: 1500, p_purpose: 'Art set', p_plan: 'per_pay',
      p_installment: 500 });
    at('2026-11-03T10:00:00Z');
    await allowance(f, f.Mia.id, 0);
    expect(await loanOf(f, 'Mia', l.id)).toMatchObject({ next_pay_on: null, payoff_on: null, pay_days_left: 3 });
    at('2026-11-09T08:00:00Z');
    await tick(f);
    expect(await repayments(f.Mia.id)).toEqual([]);

    at('2026-11-10T10:00:00Z');
    await allowance(f, f.Mia.id, 400);
    expect((await loanOf(f, 'Mia', l.id)).next_pay_on).toBe('2026-11-16');
    at('2026-11-16T08:00:00Z');
    await tick(f);
    expect((await repayments(f.Mia.id)).map((r) => r.amount)).toEqual([-500]); // wallet 500 + 400 covers the installment

    at('2026-11-17T10:00:00Z');
    await f.owner.rpc('update_family', { p_patch: { settings: { features: { allowance: false } } } });
    expect((await loanOf(f, 'Mia', l.id)).next_pay_on).toBeNull();
    at('2026-11-23T08:00:00Z');
    await tick(f);
    expect(await repayments(f.Mia.id)).toHaveLength(1);
  });
});

describe('fee offers, cancelling and the switch', () => {
  let f: Fam;

  it('an offer with a fee waits for the kid to accept', async () => {
    at(MON2);
    f = await makeFamily(db, { Mum: 'parent', Sam: 'kid', Mia: 'kid', Leo: 'kid' }, 'Offer Family');
    for (const k of [f.Sam, f.Mia, f.Leo]) await allowance(f, k.id, 500);
    await tick(f);
    const l = await f.Sam.rpc<Row>('request_loan', { p_member: f.Sam.id, p_amount: 1000, p_purpose: 'Headphones', p_plan: 'per_pay',
      p_installment: 250 });
    await expectCode(f.Mum.rpc('decide_loan', { p_id: l.id, p_approve: true, p_fee_cents: 1001 }), 'invalid', 'fee');
    await expectCode(f.Mum.rpc('decide_loan', { p_id: l.id, p_approve: true, p_fee_cents: -1 }), 'invalid', 'fee');
    const offer = await f.Mum.rpc<Row>('decide_loan', { p_id: l.id, p_approve: true, p_note: 'A small fee, like a real bank',
      p_fee_cents: 200 });
    expect(offer).toMatchObject({ status: 'offered', fee_cents: 200, total_cents: 1200, installment_cents: 250, pay_days_left: 5,
      started_at: null });
    expect((await loanOf(f, 'Sam', l.id)).can_accept).toBe(true);
    await expectCode(f.Mum.rpc('accept_loan_offer', { p_id: l.id, p_accept: true }), 'not_allowed');

    at('2026-11-09T08:00:00Z');
    await tick(f);
    expect(await repayments(f.Sam.id)).toEqual([]); // not active yet

    at('2026-11-09T10:00:00Z');
    expect(await f.Sam.rpc<Row>('accept_loan_offer', { p_id: l.id, p_accept: true })).toMatchObject({ status: 'active' });
    at('2026-11-16T08:00:00Z');
    await tick(f);
    expect((await repayments(f.Sam.id)).map((r) => [r.amount, r.reason]))
      .toEqual([[-250, 'Loan repayment: Headphones (€9.50 to go)']]);
    const actions = await q(db, `select action from public.audit_log where details->>'loan' = $1 order by id`, [l.id]);
    expect(actions.map((a) => a.action)).toEqual(['loan.request', 'loan.offer', 'loan.accept']);
  });

  it('a kid may say no to an offer; a next_pay offer repays the fee too', async () => {
    const l = await f.Mia.rpc<Row>('request_loan', { p_member: f.Mia.id, p_amount: 400, p_purpose: 'Fair', p_plan: 'next_pay' });
    const offer = await f.Mum.rpc<Row>('decide_loan', { p_id: l.id, p_approve: true, p_fee_cents: 100 });
    expect(offer).toMatchObject({ status: 'offered', total_cents: 500, installment_cents: 500 });
    expect(await f.Mia.rpc<Row>('accept_loan_offer', { p_id: l.id, p_accept: false })).toMatchObject({ status: 'declined' });
    await expectCode(f.Mia.rpc('accept_loan_offer', { p_id: l.id, p_accept: true }), 'wrong_status');
  });

  it('the one who asked can cancel while it waits; a no is a no', async () => {
    const l = await f.Mia.rpc<Row>('request_loan', { p_member: f.Mia.id, p_amount: 300, p_purpose: 'Cinema', p_plan: 'next_pay' });
    await expectCode(f.Mum.rpc('cancel_loan', { p_id: l.id }), 'not_allowed');
    await expectCode(f.Sam.rpc('cancel_loan', { p_id: l.id }), 'not_allowed');
    expect(await f.Mia.rpc<Row>('cancel_loan', { p_id: l.id })).toMatchObject({ status: 'cancelled' });
    const l2 = await f.Leo.rpc<Row>('request_loan', { p_member: f.Leo.id, p_amount: 300, p_purpose: 'Game', p_plan: 'next_pay' });
    expect(await f.Mum.rpc<Row>('decide_loan', { p_id: l2.id, p_approve: false, p_note: 'Save for it first' }))
      .toMatchObject({ status: 'declined', decision_note: 'Save for it first' });
    await expectCode(f.Leo.rpc('cancel_loan', { p_id: l2.id }), 'wrong_status');
  });

  it('checks the input, and who may ask for whom', async () => {
    const ask = (who: string, p: Row) => f[who].rpc('request_loan', { p_member: f.Leo.id, p_amount: 500, p_purpose: 'Book',
      p_plan: 'per_pay', p_installment: 100, ...p });
    await expectCode(ask('Leo', { p_amount: 0 }), 'invalid', 'amount');
    await expectCode(ask('Leo', { p_amount: 10000001 }), 'invalid', 'amount');
    await expectCode(ask('Leo', { p_purpose: ' ' }), 'invalid', 'purpose');
    await expectCode(ask('Leo', { p_purpose: 'x'.repeat(81) }), 'invalid', 'purpose');
    await expectCode(ask('Leo', { p_plan: 'someday' }), 'invalid', 'plan');
    await expectCode(ask('Leo', { p_installment: null }), 'invalid', 'installment');
    await expectCode(ask('Leo', { p_installment: 501 }), 'invalid', 'installment');
    await expectCode(ask('Sam', {}), 'not_allowed'); // a kid only asks for themselves
    await expectCode(f.Mum.rpc('request_loan', { p_member: f.Mum.id, p_amount: 500, p_purpose: 'Me', p_plan: 'next_pay' }),
      'invalid', 'member');
    const other = await makeFamily(db, { Leo: 'kid' }, 'Other Loan Family');
    await expectCode(other.owner.rpc('request_loan', { p_member: f.Leo.id, p_amount: 500, p_purpose: 'x', p_plan: 'next_pay' }),
      'not_found', 'member');
  });

  it('at most 3 asks that are waiting, declined or cancelled per kid per 7 days', async () => {
    // Mia: declined (Fair) and cancelled (Cinema) already
    const l = await f.Mia.rpc<Row>('request_loan', { p_member: f.Mia.id, p_amount: 100, p_purpose: 'Snack', p_plan: 'next_pay' });
    await f.Mia.rpc('cancel_loan', { p_id: l.id });
    await expectCode(f.Mia.rpc('request_loan', { p_member: f.Mia.id, p_amount: 100, p_purpose: 'Snack', p_plan: 'next_pay' }),
      'invalid', 'too_many_loans');
    at('2026-11-24T08:00:00Z');
    expect((await f.Mia.rpc<Row>('request_loan', { p_member: f.Mia.id, p_amount: 100, p_purpose: 'Snack', p_plan: 'next_pay' })).status)
      .toBe('requested');
  });

  it('switched off: no new loans or approvals, but active loans keep being repaid and stay visible', async () => {
    at('2026-11-24T09:00:00Z');
    const leo = await f.Leo.rpc<Row>('request_loan', { p_member: f.Leo.id, p_amount: 300, p_purpose: 'Game', p_plan: 'next_pay' });
    expect((await f.Mum.rpc<any>('get_state')).counts.loans).toBe(2); // Mia's Snack and Leo's Game
    await f.owner.rpc('update_family', { p_patch: { settings: { features: { loans: false } } } });
    expect((await f.Mum.rpc<any>('get_state')).counts.loans).toBe(0);
    await expectCode(f.Sam.rpc('request_loan', { p_member: f.Sam.id, p_amount: 100, p_purpose: 'x', p_plan: 'next_pay' }),
      'feature_off', 'loans');
    await expectCode(f.Mum.rpc('request_loan', { p_member: f.Sam.id, p_amount: 100, p_purpose: 'x', p_plan: 'next_pay' }),
      'feature_off', 'loans');
    await expectCode(f.Mum.rpc('decide_loan', { p_id: leo.id, p_approve: true }), 'feature_off', 'loans');
    expect(await f.Mum.rpc<Row>('decide_loan', { p_id: leo.id, p_approve: false })).toMatchObject({ status: 'declined' });

    await tick(f);
    const before = (await repayments(f.Sam.id)).length;
    at('2026-11-30T08:00:00Z');
    await tick(f);
    expect(await repayments(f.Sam.id)).toHaveLength(before + 1);
    const sam = await f.Sam.rpc<Row[]>('list_loans', {});
    expect(sam[0]).toMatchObject({ purpose: 'Headphones', status: 'active', can_repay: true });
    await f.Sam.rpc('repay_loan_now', { p_id: sam[0].id, p_amount: 100, p_request: req() });
  });
});

describe('the week-end saver rule', () => {
  it('a loan repayment this week is not "nothing saved and nothing left"', async () => {
    at('2026-11-03T08:00:00Z'); // Tuesday
    const n = await makeFamily(db, { Mum: 'parent', Leo: 'kid', Mia: 'kid' }, 'Saver Loan Family');
    const pts = (await n.owner.rpc<any>('get_state')).family.settings.no_savings_penalty_points;
    expect(pts).toBeGreaterThan(0);
    await allowance(n, n.Leo.id, 500);
    await allowance(n, n.Mia.id, 500);
    const l = await n.Leo.rpc<Row>('request_loan', { p_member: n.Leo.id, p_amount: 500, p_purpose: 'Gift for Mum', p_plan: 'next_pay' });
    await n.Mum.rpc('decide_loan', { p_id: l.id, p_approve: true });

    at('2026-11-09T08:00:00Z');
    await tick(n);
    expect(await balance(db, n.Leo.id, 'spending')).toBe(0);
    at('2026-11-10T10:00:00Z');
    const ask = await n.Mia.rpc<any>('create_request', { p_kind: 'spend', p_amount: 500, p_label: 'Game', p_note: null });
    await n.Mum.rpc('decide_request', { p_request: ask.id, p_approve: true, p_note: null });

    at('2026-11-16T08:00:00Z');
    await tick(n);
    const pen = (m: string) => q(db, `select amount from public.transactions where member_id = $1 and kind = 'no_savings_penalty'`, [m]);
    expect(await pen(n.Mia.id)).toEqual([{ amount: -pts }]);
    expect(await pen(n.Leo.id)).toEqual([]);
  });
});

describe('activity log wording', () => {
  it('says what happened with each loan', () => {
    const byId = { k1: { id: 'k1', display_name: 'Sam' } } as unknown as Record<string, Member>;
    const text = (action: string, details: Record<string, unknown>) =>
      describeAudit({ id: 1, actor: null, action, details, created_at: '' }, byId, 'EUR').text.replace(/\s/g, ' ');
    expect(text('loan.request', { member: 'k1', amount: 2000, purpose: 'School trip' })).toBe('Sam asked to borrow €20 for School trip');
    expect(text('loan.record', { member: 'k1', amount: 2000, purpose: 'School trip' })).toBe('Recorded a loan of €20 to Sam for School trip');
    expect(text('loan.approve', { member: 'k1', amount: 2000 })).toBe('Said yes to Sam’s loan of €20');
    expect(text('loan.offer', { member: 'k1', amount: 2000, fee: 200 })).toBe('Offered Sam a loan of €20 with a €2 fee');
    expect(text('loan.accept', { member: 'k1', amount: 2000, fee: 200 })).toBe('Sam accepted the loan offer of €20');
    expect(text('loan.decline', { member: 'k1', amount: 2000 })).toBe('Said no to Sam’s loan of €20');
    expect(text('loan.decline', { member: 'k1', amount: 2000, offer: true })).toBe('Sam said no to the loan offer of €20');
    expect(text('loan.repay', { member: 'k1', amount: 500 })).toBe('Paid back €5 of Sam’s loan');
    expect(text('loan.forgive', { member: 'k1', amount: 1300 })).toBe('Forgave the last €13 of Sam’s loan');
    expect(text('loan.cancel', { member: 'k1', amount: 2000 })).toBe('Cancelled a loan request of €20 for Sam');
    expect(text('loan.undo', { member: 'k1', amount: 500 })).toBe('Undid a loan repayment of €5 for Sam');
  });
});

describe('perimeter', () => {
  it('anon cannot execute the new functions; helpers are not callable by members', async () => {
    const pub = ['request_loan(uuid, int, text, text, int)', 'decide_loan(uuid, boolean, text, int)', 'accept_loan_offer(uuid, boolean)',
      'repay_loan_now(uuid, int, uuid)', 'forgive_loan(uuid, text)', 'cancel_loan(uuid)', 'reverse_loan_repayment(uuid, text)',
      'list_loans(uuid)', 'reverse_transaction(uuid, text)', 'record_payout(uuid, int, uuid, text)', 'get_state()'];
    for (const fn of pub) {
      const [r] = await q(db, `select has_function_privilege('anon', $1, 'execute') as a,
                                      has_function_privilege('authenticated', $1, 'execute') as u`, [`public.${fn}`]);
      expect(r, fn).toEqual({ a: false, u: true });
    }
    const helpers = ['money_text(int, text)', 'loan_repaid(uuid)', 'loan_outstanding(public.loans)',
      'loan_next_pay(public.members, public.families)', 'loan_json(public.loans, public.members)',
      'loan_post_repayment(public.loans, int, uuid, text, timestamptz)', 'loan_repay_allowances(public.families)',
      'get_loan(uuid, uuid)', 'loan_note(text)', 'tx_json(public.transactions, public.members)', 'tick_family(uuid)',
      'payout_kid(public.members, public.families)'];
    for (const fn of helpers) {
      const [r] = await q(db, `select has_function_privilege('anon', $1, 'execute') as a,
                                      has_function_privilege('authenticated', $1, 'execute') as u`, [`app.${fn}`]);
      expect(r, fn).toEqual({ a: false, u: false });
    }
    const [t] = await q(db, `select has_table_privilege('authenticated', 'public.loans', 'select') as s,
                                    has_table_privilege('anon', 'public.loans', 'select') as a`);
    expect(t).toEqual({ s: false, a: false });
  });
});
