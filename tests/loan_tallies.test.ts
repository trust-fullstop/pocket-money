// Loans in the tallies (migration 20261116002300): "How Sam is doing" (week / month / year) shows what was borrowed
// and what was paid back, for the kid and the parents. Repayments no longer count as Spent; grandparents and other
// relatives keep the old numbers (repayments inside Spent, no loan lines).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { balance, clock, makeDb, makeFamily, q, type Fam } from './helpers';

let db: PGlite;
beforeAll(async () => { db = await makeDb(); });
afterAll(() => { clock.now = null; });

type Row = Record<string, any>;
const TZ = 'Africa/Johannesburg'; // UTC+2 all year, no daylight saving
const at = (iso: string) => { clock.now = iso; };
const req = () => crypto.randomUUID();
const tick = (f: Fam) => f.owner.rpc<any>('tick');
const tallies = async (f: Fam, who: string, member: string): Promise<Record<'week' | 'month' | 'ytd', Row>> =>
  (await f[who].rpc<any>('wallet', { p_member: member, p_history_limit: 0 })).tallies;
const repayments = (member: string) =>
  q(db, `select id, amount, effective_at from public.transactions where member_id = $1 and kind = 'loan_repayment'
          order by effective_at, created_at`, [member]);
const summaryRow = async (f: Fam, member: string) => (await f.owner.rpc<Row[]>('payout_summary')).find((r) => r.member_id === member)!;
const parts = (r: Row) =>
  r.start_cents + r.allowance_cents + r.rewards_cents + r.consequences_cents + r.loan_cents + r.other_cents;

describe('borrowed and paid back, week / month / year', () => {
  let f: Fam;
  let loanId: string;

  it('a recorded loan shows as borrowed for the kid and the parents, not for a grandparent', async () => {
    at('2026-11-02T06:00:00Z'); // Monday 08:00 in Johannesburg
    f = await makeFamily(db, { Mum: 'parent', Sam: 'kid', Oma: 'grandparent' }, 'Tally Family', TZ);
    await f.owner.rpc('update_member', { p_member: f.Sam.id, p_patch: { allowance_cents: 500 } });
    await tick(f); // today's pocket money
    at('2026-11-02T07:00:00Z');
    const loan = await f.Mum.rpc<Row>('request_loan', { p_member: f.Sam.id, p_amount: 2000, p_purpose: 'Bike', p_plan: 'per_pay',
      p_installment: 500 });
    expect(loan.status).toBe('active');
    loanId = loan.id;

    for (const who of ['Sam', 'Mum', 'owner']) {
      const t = await tallies(f, who, f.Sam.id);
      for (const p of ['week', 'month', 'ytd'] as const) {
        expect(t[p], `${who} ${p}`).toMatchObject({ loan_borrowed: 2000, loan_repaid: 0, money_spent: 0, money_earned: 500,
          money_lost: 0 });
      }
    }
    const oma = await tallies(f, 'Oma', f.Sam.id);
    for (const p of ['week', 'month', 'ytd'] as const) {
      expect(oma[p], p).toMatchObject({ loan_borrowed: null, loan_repaid: null, money_spent: 0, money_earned: 500 });
    }
  });

  it('a scheduled repayment is "paid back", not spent, earned or lost', async () => {
    at('2026-11-09T06:00:00Z');
    await tick(f);
    expect((await repayments(f.Sam.id)).map((r) => r.amount)).toEqual([-500]);
    at('2026-11-09T07:00:00Z');
    const ask = await f.Sam.rpc<any>('create_request', { p_kind: 'spend', p_amount: 100, p_label: 'Sweets', p_note: null });
    await f.Mum.rpc('decide_request', { p_request: ask.id, p_approve: true, p_note: null });

    for (const who of ['Sam', 'Mum']) {
      const t = await tallies(f, who, f.Sam.id);
      expect(t.week, who).toMatchObject({ loan_borrowed: 0, loan_repaid: 500, money_spent: 100, money_earned: 500, money_lost: 0 });
      expect(t.month, who).toMatchObject({ loan_borrowed: 2000, loan_repaid: 500, money_spent: 100, money_earned: 1000, money_lost: 0 });
      expect(t.ytd, who).toMatchObject({ loan_borrowed: 2000, loan_repaid: 500, money_spent: 100 });
    }
    // a grandparent: the old numbers, the repayment inside Spent
    const oma = await tallies(f, 'Oma', f.Sam.id);
    expect(oma.week).toMatchObject({ loan_borrowed: null, loan_repaid: null, money_spent: 600, money_earned: 500, money_lost: 0 });
    expect(oma.month).toMatchObject({ loan_borrowed: null, loan_repaid: null, money_spent: 600, money_earned: 1000 });
    // and still sees the repayment in the history as a pocket money adjustment (unchanged)
    const hist = (await f.Oma.rpc<any>('wallet', { p_member: f.Sam.id, p_history_limit: 50 })).history;
    expect(hist.find((t: any) => t.amount === -500 && t.masked)).toMatchObject({ kind: 'adjustment', source_id: null });
  });

  it('an undo in the same period nets to zero', async () => {
    at('2026-11-09T08:00:00Z');
    const [r] = await repayments(f.Sam.id);
    await f.Mum.rpc('reverse_loan_repayment', { p_tx: r.id, p_reason: 'Not this week' });
    const t = await tallies(f, 'Sam', f.Sam.id);
    expect(t.week).toMatchObject({ loan_repaid: 0, money_spent: 100, money_earned: 500, money_lost: 0 });
    expect(t.month).toMatchObject({ loan_borrowed: 2000, loan_repaid: 0, money_spent: 100, money_earned: 1000, money_lost: 0 });
    const oma = await tallies(f, 'Oma', f.Sam.id);
    expect(oma.week).toMatchObject({ loan_repaid: null, money_spent: 100, money_earned: 500, money_lost: 0 });
  });

  it('an undo in a later period shows as a negative "paid back" there', async () => {
    at('2026-11-30T06:00:00Z'); // pocket money on 16, 23 and 30 Nov each repays 500
    await tick(f);
    expect((await repayments(f.Sam.id)).map((r) => r.amount)).toEqual([-500, -500, -500, -500]);
    at('2026-11-30T20:00:00Z'); // 22:00 on Monday 30 Nov
    await f.Sam.rpc('repay_loan_now', { p_id: loanId, p_amount: 200, p_request: req() });
    let t = await tallies(f, 'Sam', f.Sam.id);
    expect(t.month).toMatchObject({ loan_borrowed: 2000, loan_repaid: 1500 + 200, money_spent: 100 });

    at('2026-12-01T06:00:00Z'); // Tuesday 1 Dec: a new month, the same week
    const extra = (await repayments(f.Sam.id)).at(-1)!;
    expect(extra.amount).toBe(-200);
    await f.Mum.rpc('reverse_loan_repayment', { p_tx: extra.id, p_reason: 'Keep it for the trip' });
    for (const who of ['Sam', 'Mum']) {
      t = await tallies(f, who, f.Sam.id);
      expect(t.month, who).toMatchObject({ period: 'month', start: '2026-12-01', loan_borrowed: 0, loan_repaid: -200,
        money_spent: 0, money_earned: 0, money_lost: 0 });
      expect(t.week, who).toMatchObject({ start: '2026-11-30', loan_borrowed: 0, loan_repaid: 500, money_spent: 0,
        money_earned: 500, money_lost: 0 });
      expect(t.ytd, who).toMatchObject({ loan_borrowed: 2000, loan_repaid: 1500, money_spent: 100 });
    }
    // a grandparent: exactly the old numbers
    const oma = await tallies(f, 'Oma', f.Sam.id);
    expect(oma.month).toMatchObject({ loan_borrowed: null, loan_repaid: null, money_spent: -200, money_earned: 0, money_lost: 0 });
    expect(oma.week).toMatchObject({ loan_repaid: null, money_spent: 500, money_earned: 500 });
    expect(oma.ytd).toMatchObject({ loan_repaid: null, money_spent: 1600 });
  });

  it('the pay-out overview still adds up', async () => {
    const sam = await summaryRow(f, f.Sam.id);
    expect(sam).toMatchObject({ loan_cents: -1500, loan_outstanding_cents: 500, loan_purpose: 'Bike', allowance_cents: 2500,
      other_cents: -100 });
    expect(parts(sam)).toBe(sam.wallet_cents);
    expect(sam.wallet_cents).toBe(await balance(db, f.Sam.id, 'spending'));
  });
});

describe('the family time zone decides the period of a loan', () => {
  it('23:30 on the last day of the month counts in that month; 00:30 on the 1st in the next', async () => {
    at('2026-10-31T21:30:00Z'); // Saturday 31 Oct, 23:30 in Johannesburg
    const f = await makeFamily(db, { Mum: 'parent', Leo: 'kid' }, 'Midnight Family', TZ);
    const first = await f.Mum.rpc<Row>('request_loan', { p_member: f.Leo.id, p_amount: 700, p_purpose: 'Shoes', p_plan: 'next_pay' });
    let t = await tallies(f, 'Leo', f.Leo.id);
    expect(t.month).toMatchObject({ start: '2026-10-01', loan_borrowed: 700 });
    expect(t.week).toMatchObject({ start: '2026-10-26', loan_borrowed: 700 });
    expect(t.ytd.loan_borrowed).toBe(700);

    at('2026-10-31T22:30:00Z'); // Sunday 1 Nov, 00:30 in Johannesburg (still 31 Oct in UTC)
    t = await tallies(f, 'Leo', f.Leo.id);
    expect(t.month).toMatchObject({ start: '2026-11-01', loan_borrowed: 0 });
    expect(t.week).toMatchObject({ start: '2026-10-26', loan_borrowed: 700 });

    // a forgiven loan was still borrowed
    await f.Mum.rpc('forgive_loan', { p_id: first.id, p_note: null });
    at('2026-10-31T22:45:00Z'); // 00:45 on 1 Nov in Johannesburg
    await f.Mum.rpc('request_loan', { p_member: f.Leo.id, p_amount: 300, p_purpose: 'Socks', p_plan: 'next_pay' });
    t = await tallies(f, 'Leo', f.Leo.id);
    expect(t.month).toMatchObject({ start: '2026-11-01', loan_borrowed: 300 });
    expect(t.week.loan_borrowed).toBe(1000);
    expect(t.ytd.loan_borrowed).toBe(1000);

    at('2026-11-01T22:30:00Z'); // Monday 2 Nov, 00:30: a new week
    t = await tallies(f, 'Mum', f.Leo.id);
    expect(t.week).toMatchObject({ start: '2026-11-02', loan_borrowed: 0 });
    expect(t.month.loan_borrowed).toBe(300);
  });

  it('only loans that started count, without the fee', async () => {
    at('2026-11-03T08:00:00Z');
    const f = await makeFamily(db, { Mum: 'parent', Mia: 'kid' }, 'Fee Family', TZ);
    const no = await f.Mia.rpc<Row>('request_loan', { p_member: f.Mia.id, p_amount: 900, p_purpose: 'Game', p_plan: 'next_pay' });
    expect((await tallies(f, 'Mia', f.Mia.id)).month.loan_borrowed).toBe(0); // asked, not given
    await f.Mum.rpc('decide_loan', { p_id: no.id, p_approve: false });
    const ask = await f.Mia.rpc<Row>('request_loan', { p_member: f.Mia.id, p_amount: 400, p_purpose: 'Fair', p_plan: 'next_pay' });
    await f.Mum.rpc('decide_loan', { p_id: ask.id, p_approve: true, p_fee_cents: 50 });
    expect((await tallies(f, 'Mia', f.Mia.id)).month.loan_borrowed).toBe(0); // offered, not accepted yet
    await f.Mia.rpc('accept_loan_offer', { p_id: ask.id, p_accept: true });
    expect((await tallies(f, 'Mia', f.Mia.id)).month).toMatchObject({ loan_borrowed: 400, loan_repaid: 0 });
  });
});

describe('monthly pocket money: the loan comes off the next pocket money', () => {
  it('pocket money on the 15th repays a next_pay loan, and the month shows both', async () => {
    at('2026-12-14T18:00:00Z'); // Monday 14 Dec, 20:00 in Johannesburg
    const f = await makeFamily(db, { Dad: 'parent', Sam: 'kid' }, 'Monthly Family', TZ);
    await f.Dad.rpc('update_member', { p_member: f.Sam.id,
      p_patch: { allowance_cents: 20000, allowance_period: 'month', allowance_day: 15 } });
    const loan = await f.Dad.rpc<Row>('request_loan', { p_member: f.Sam.id, p_amount: 12000, p_purpose: 'New bike lights',
      p_plan: 'next_pay' });
    expect(loan).toMatchObject({ status: 'active', next_amount_cents: 12000, next_pay_on: '2026-12-15' });

    at('2026-12-14T22:00:05Z'); // Tuesday 15 Dec, just after midnight in Johannesburg
    await tick(f);
    expect(await balance(db, f.Sam.id, 'spending')).toBe(20000 - 12000);
    const t = await tallies(f, 'Sam', f.Sam.id);
    for (const p of ['week', 'month', 'ytd'] as const) {
      expect(t[p], p).toMatchObject({ money_earned: 20000, money_spent: 0, money_lost: 0, loan_borrowed: 12000, loan_repaid: 12000 });
    }
    const row = await summaryRow(f, f.Sam.id);
    expect(row).toMatchObject({ wallet_cents: 8000, allowance_cents: 20000, loan_cents: -12000, loan_outstanding_cents: null });
    expect(parts(row)).toBe(row.wallet_cents);
  });
});

describe('perimeter', () => {
  it('the wallet is for signed-in members only; the tally helpers are not callable', async () => {
    const [w] = await q(db, `select has_function_privilege('anon', 'public.wallet(uuid, int)', 'execute') as a,
                                    has_function_privilege('authenticated', 'public.wallet(uuid, int)', 'execute') as u`);
    expect(w).toEqual({ a: false, u: true });
    for (const fn of ['app.tally(uuid, public.families, text, date, date)', 'app.tally_without_loans(jsonb)']) {
      const [r] = await q(db, `select has_function_privilege('anon', $1, 'execute') as a,
                                      has_function_privilege('authenticated', $1, 'execute') as u`, [fn]);
      expect(r, fn).toEqual({ a: false, u: false });
    }
  });
});
