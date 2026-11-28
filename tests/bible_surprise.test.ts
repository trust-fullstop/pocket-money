// Bible time surprise (migration 20261116002600): a family setting bible_reward_cents. A kid who taps one of the app's
// own Bible App links is counted once per family-local day; the first open of the day pays the setting into the
// Wallet. Kids and grandparents never see the value; managers see who opened it; the pay-out shows it as its own line.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import type { PGlite } from '@electric-sql/pglite';
import { asRole, balance, clock, expectCode, makeDb, makeFamily, q, type Fam, type Person } from './helpers';
import { describeAudit } from '../src/features/family/audit';
import type { Member } from '../src/lib/types';

let db: PGlite;
beforeAll(async () => { db = await makeDb(); });
afterAll(() => { clock.now = null; });

type Row = Record<string, any>;
const TZ = 'Africa/Johannesburg'; // UTC+2 all year, no daylight saving
const at = (iso: string) => { clock.now = iso; };
const setBible = (f: Fam, cents: unknown, by: Person = f.owner) =>
  by.rpc<any>('update_family', { p_patch: { settings: { bible_reward_cents: cents } } });
const open = (p: Person, ref?: string | null) => p.rpc<Row>('bible_opened', ref === undefined ? {} : { p_ref: ref });
const summary = (p: Person) => p.rpc<Row>('bible_opens_summary');
const opens = (member: string) =>
  q<Row>(db, `select day::text as day, opens, ref from public.bible_opens where member_id = $1 order by day`, [member]);
/** All Bible time money rows of a member (not their undo rows). */
const bibleMoney = (member: string) =>
  q<Row>(db, `select id, amount, kind, pot, currency, reason, source_type, source_id, source_key, created_by, reversed_by
                from public.transactions where member_id = $1 and source_type = 'bible' order by created_at, source_key`, [member]);
const summaryRow = async (f: Fam, member: string) =>
  (await f.owner.rpc<Row[]>('payout_summary')).find((r) => r.member_id === member)!;
const parts = (r: Row) => r.start_cents + r.allowance_cents + r.rewards_cents + r.consequences_cents + r.loan_cents
  + r.lessons_cents + r.bible_cents + r.other_cents;
const NOOP = { counted: false, rewarded_cents: 0 };

describe('the setting bible_reward_cents', () => {
  let f: Fam;
  it('defaults to 0 (off)', async () => {
    f = await makeFamily(db, { Mum: 'parent', Sam: 'kid', Oma: 'grandparent' }, 'Setting', TZ);
    const [d] = await q<{ v: unknown }>(db, `select app.default_settings()->'bible_reward_cents' as v`);
    expect(d.v).toBe(0);
    expect((await f.owner.rpc<any>('get_state')).family.settings.bible_reward_cents).toBe(0);
  });

  it('accepts whole numbers 0..100000 and nothing else', async () => {
    for (const bad of [7.5, -1, 100001, '700', true, null, { cents: 1 }]) {
      await expectCode(setBible(f, bad), 'invalid', 'setting:bible_reward_cents');
    }
    let st = await setBible(f, 700);
    expect(st.family.settings.bible_reward_cents).toBe(700);
    st = await setBible(f, 100000, f.Mum);
    expect(st.family.settings.bible_reward_cents).toBe(100000);
    st = await setBible(f, 0);
    expect(st.family.settings.bible_reward_cents).toBe(0);
    const [r] = await q<{ v: unknown }>(db, `select settings->'bible_reward_cents' as v from public.families where id = $1`, [f.familyId]);
    expect(r.v).toBe(0);
  });

  it('kids and grandparents cannot change it', async () => {
    await expectCode(setBible(f, 700, f.Sam), 'not_allowed');
    await expectCode(setBible(f, 700, f.Oma), 'not_allowed');
  });

  it('a value stored some other way never pays more than the limit or a fraction', async () => {
    const [r] = await q<Row>(db, `select app.bible_reward_cents('{"bible_reward_cents":7.9}'::jsonb) as a,
      app.bible_reward_cents('{"bible_reward_cents":-5}'::jsonb) as b, app.bible_reward_cents('{"bible_reward_cents":"x"}'::jsonb) as c,
      app.bible_reward_cents('{}'::jsonb) as d, app.bible_reward_cents('{"bible_reward_cents":9999999}'::jsonb) as e`);
    expect(r).toEqual({ a: 7, b: 0, c: 0, d: 0, e: 100000 });
  });

  it('the activity log names it (managers only read the log)', async () => {
    const say = (details: Record<string, unknown>) =>
      describeAudit({ id: 1, actor: null, action: 'family.update', details, created_at: '' }, {} as Record<string, Member>, 'ZAR').text;
    expect(say({ settings: { bible_reward_cents: 700 } })).toBe('Changed the family Bible time surprise');
    await expectCode(f.Sam.rpc('list_audit'), 'not_allowed');
  });
});

describe('get_state keeps the surprise a surprise', () => {
  it('managers see the value; kids and grandparents never get the key', async () => {
    const f = await makeFamily(db, { Mum: 'parent', Bonus: 'step_parent', Sam: 'kid', Oma: 'grandparent' }, 'Secret', TZ);
    await f.owner.rpc('update_family', { p_patch: { settings: { bible_reward_cents: 700, lesson_reward_cents: 300 } } });
    for (const p of [f.owner, f.Mum, f.Bonus]) {
      const s = (await p.rpc<any>('get_state')).family.settings;
      expect(s.bible_reward_cents).toBe(700);
      expect(s.lesson_reward_cents).toBe(300);
    }
    for (const p of [f.Sam, f.Oma]) {
      const st = await p.rpc<any>('get_state');
      expect(Object.keys(st.family.settings)).not.toContain('bible_reward_cents');
      expect(JSON.stringify(st)).not.toContain('bible_reward');
      // everything else unchanged
      expect(st.family.settings.lesson_reward_cents).toBe(300);
      expect(st.family.settings.features.faith).toBe(true);
    }
    // also while it is 0 (off): no key at all, so "0" can't be told apart from a value
    await f.owner.rpc('update_family', { p_patch: { settings: { bible_reward_cents: 0 } } });
    expect(Object.keys((await f.Sam.rpc<any>('get_state')).family.settings)).not.toContain('bible_reward_cents');
    expect((await f.Mum.rpc<any>('get_state')).family.settings.bible_reward_cents).toBe(0);
  });
});

describe('a kid opens the Bible App', () => {
  let f: Fam;
  it('the first open of the day pays once; more opens that day only count', async () => {
    at('2026-11-26T06:00:00Z'); // Thu 08:00 in Johannesburg
    f = await makeFamily(db, { Mum: 'parent', Sam: 'kid', Mia: 'kid', Oma: 'grandparent' }, 'Bible Family', TZ);
    await setBible(f, 700);
    expect(await open(f.Sam, 'Proverbs 13:11')).toEqual({ counted: true, first_today: true, rewarded_cents: 700 });
    expect(await balance(db, f.Sam.id, 'spending')).toBe(700);
    const rows = await bibleMoney(f.Sam.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ amount: 700, kind: 'bonus', pot: 'spending', currency: 'money', reason: '📖 Bible time',
      source_type: 'bible', source_id: f.Sam.id, source_key: 'bible:2026-11-26', created_by: f.Sam.id, reversed_by: null });

    at('2026-11-26T09:00:00Z');
    expect(await open(f.Sam, 'home')).toEqual({ counted: true, first_today: false, rewarded_cents: 0 });
    expect(await opens(f.Sam.id)).toEqual([{ day: '2026-11-26', opens: 2, ref: 'Proverbs 13:11' }]);
    expect(await balance(db, f.Sam.id, 'spending')).toBe(700);

    at('2026-11-26T21:59:00Z'); // 23:59 local: still Thursday
    expect(await open(f.Sam)).toEqual({ counted: true, first_today: false, rewarded_cents: 0 });
    expect(await opens(f.Sam.id)).toEqual([{ day: '2026-11-26', opens: 3, ref: 'Proverbs 13:11' }]);
    expect(await balance(db, f.Sam.id, 'spending')).toBe(700);
    const [times] = await q<Row>(db, `select first_at, last_at, family_id from public.bible_opens where member_id = $1`, [f.Sam.id]);
    expect([new Date(times.first_at).toISOString(), new Date(times.last_at).toISOString(), times.family_id])
      .toEqual(['2026-11-26T06:00:00.000Z', '2026-11-26T21:59:00.000Z', f.familyId]);
  });

  it('the next family-local day pays again', async () => {
    at('2026-11-26T22:01:00Z'); // 00:01 local on Friday 27 Nov
    expect(await open(f.Sam, null)).toEqual({ counted: true, first_today: true, rewarded_cents: 700 });
    expect(await balance(db, f.Sam.id, 'spending')).toBe(1400);
    expect((await opens(f.Sam.id)).map((r) => [r.day, r.opens, r.ref])).toEqual([['2026-11-26', 3, 'Proverbs 13:11'], ['2026-11-27', 1, null]]);
    expect((await bibleMoney(f.Sam.id)).map((r) => r.source_key)).toEqual(['bible:2026-11-26', 'bible:2026-11-27']);
    // nothing in the activity log for opens (that would be noise)
    const [a] = await q<Row>(db, `select count(*)::int as n from public.audit_log where family_id = $1 and action like 'bible%'`, [f.familyId]);
    expect(a.n).toBe(0);
  });

  it('value 0: counted, no money', async () => {
    await setBible(f, 0);
    expect(await open(f.Mia, 'Colossians 3:23')).toEqual({ counted: true, first_today: true, rewarded_cents: 0 });
    expect(await opens(f.Mia.id)).toEqual([{ day: '2026-11-27', opens: 1, ref: 'Colossians 3:23' }]);
    expect(await bibleMoney(f.Mia.id)).toHaveLength(0);
    expect(await balance(db, f.Mia.id, 'spending')).toBe(0);
    // set later that day: the day was already counted, so no back-pay for it
    await setBible(f, 700);
    expect(await open(f.Mia)).toEqual({ counted: true, first_today: false, rewarded_cents: 0 });
    expect(await balance(db, f.Mia.id, 'spending')).toBe(0);
  });

  it('grown-ups are never counted or paid', async () => {
    for (const p of [f.owner, f.Mum, f.Oma]) {
      expect(await open(p, 'home')).toEqual(NOOP);
      expect(await opens(p.id)).toEqual([]);
      expect(await bibleMoney(p.id)).toHaveLength(0);
    }
  });

  it('faith off: a quiet no-op', async () => {
    at('2026-11-28T06:00:00Z');
    await f.owner.rpc('update_family', { p_patch: { settings: { features: { faith: false } } } });
    expect(await open(f.Sam, 'home')).toEqual(NOOP);
    expect((await opens(f.Sam.id)).map((r) => r.day)).not.toContain('2026-11-28');
    expect(await balance(db, f.Sam.id, 'spending')).toBe(1400);
    await f.owner.rpc('update_family', { p_patch: { settings: { features: { faith: true } } } });
  });

  it('a kid who hides the verses for themselves: a quiet no-op', async () => {
    await f.Sam.rpc('update_member', { p_member: f.Sam.id, p_patch: { theme: { verses: false } } });
    expect(await open(f.Sam, 'home')).toEqual(NOOP);
    expect((await opens(f.Sam.id)).map((r) => r.day)).not.toContain('2026-11-28');
    expect(await balance(db, f.Sam.id, 'spending')).toBe(1400);
    await f.Sam.rpc('update_member', { p_member: f.Sam.id, p_patch: { theme: { verses: true } } });
    expect(await open(f.Sam, 'home')).toEqual({ counted: true, first_today: true, rewarded_cents: 700 });
    expect(await balance(db, f.Sam.id, 'spending')).toBe(2100);
  });

  it('a removed kid (a late tap from their phone): a quiet no-op, nothing stored, nothing paid', async () => {
    const g = await makeFamily(db, { Leo: 'kid' }, 'Removed', TZ);
    await setBible(g, 700);
    expect(await open(g.Leo, 'home')).toMatchObject({ counted: true, rewarded_cents: 700 });
    await g.owner.rpc('remove_member', { p_member: g.Leo.id });
    at('2026-11-29T06:00:00Z'); // a new day: an active kid would be paid again
    expect(await open(g.Leo, 'home')).toEqual(NOOP);
    expect((await opens(g.Leo.id)).map((r) => r.day)).not.toContain('2026-11-29');
    expect((await bibleMoney(g.Leo.id)).map((r) => r.source_key)).toEqual(['bible:2026-11-28']);
    // other RPCs still say "not a member"
    await expectCode(g.Leo.rpc('get_state'), 'not_member');
  });

  it('the link name is trimmed and clipped to 40 characters; empty is none', async () => {
    const g = await makeFamily(db, { Sam: 'kid', Mia: 'kid' }, 'Refs', TZ);
    const long = `   ${'Lamentations 3:22-23 '.repeat(5)}  `;
    await open(g.Sam, long);
    const [r] = await opens(g.Sam.id);
    expect(r.ref).toBe('Lamentations 3:22-23 Lamentations 3:22-2');
    expect([...r.ref].length).toBe(40);
    await open(g.Mia, '   ');
    expect((await opens(g.Mia.id))[0].ref).toBeNull();
  });
});

describe('undo', () => {
  it('an undone Bible time reward is never paid again that day', async () => {
    at('2026-11-26T08:00:00Z');
    const f = await makeFamily(db, { Mum: 'parent', Sam: 'kid' }, 'Undo', TZ);
    await setBible(f, 700);
    await open(f.Sam, 'home');
    const [tx] = await bibleMoney(f.Sam.id);
    await f.Mum.rpc('reverse_transaction', { p_tx: tx.id, p_reason: 'Testing' });
    expect(await balance(db, f.Sam.id, 'spending')).toBe(0);
    expect(await open(f.Sam, 'home')).toEqual({ counted: true, first_today: false, rewarded_cents: 0 });
    // even when the day's row were gone, the once-per-day key on the money row holds
    await db.query(`delete from public.bible_opens where member_id = $1`, [f.Sam.id]);
    expect(await open(f.Sam, 'home')).toEqual({ counted: true, first_today: true, rewarded_cents: 0 });
    expect(await balance(db, f.Sam.id, 'spending')).toBe(0);
    expect(await bibleMoney(f.Sam.id)).toHaveLength(1);
  });
});

describe('bible_opens_summary (managers)', () => {
  it('per active kid: days this month, in the last 7 days, the last day and this month’s money', async () => {
    at('2026-10-31T08:00:00Z');
    const f = await makeFamily(db, { Mum: 'parent', Sam: 'kid', Mia: 'kid', Leo: 'kid', Oma: 'grandparent' }, 'Summary', TZ);
    await setBible(f, 700);
    await open(f.Sam); // October: not this month
    for (const day of ['2026-11-02', '2026-11-20', '2026-11-22', '2026-11-26']) {
      at(`${day}T08:00:00Z`);
      await open(f.Sam);
      await open(f.Sam); // twice the same day: still one day
    }
    at('2026-11-21T08:00:00Z');
    await open(f.Leo);
    at('2026-11-25T08:00:00Z');
    await open(f.Mia);
    const [miaTx] = await bibleMoney(f.Mia.id);
    await f.Mum.rpc('reverse_transaction', { p_tx: miaTx.id, p_reason: 'Oops' });
    await f.owner.rpc('remove_member', { p_member: f.Leo.id });

    at('2026-11-26T10:00:00Z'); // Thursday 26 Nov
    for (const p of [f.Sam, f.Oma]) await expectCode(summary(p), 'not_allowed');
    const s = await summary(f.Mum);
    expect(s).toMatchObject({ cents_each: 700, today: '2026-11-26', month_start: '2026-11-01' });
    expect(s.kids).toEqual([
      { member_id: f.Mia.id, days_month: 1, days_7: 1, last_day: '2026-11-25', rewarded_month_cents: 0 },
      { member_id: f.Sam.id, days_month: 4, days_7: 3, last_day: '2026-11-26', rewarded_month_cents: 2800 },
    ]);
    // the owner sees the same; a kid who never opened it shows zeros
    const g = await makeFamily(db, { Sam: 'kid' }, 'Nobody', TZ);
    expect((await summary(g.owner)).kids).toEqual([
      { member_id: g.Sam.id, days_month: 0, days_7: 0, last_day: null, rewarded_month_cents: 0 },
    ]);
    // 7 days back from 3 Dec: 27 Nov .. 3 Dec
    at('2026-12-03T08:00:00Z');
    const later = await summary(f.owner);
    expect(later.kids.find((k: Row) => k.member_id === f.Sam.id)).toMatchObject({ days_month: 0, days_7: 0, last_day: '2026-11-26',
      rewarded_month_cents: 0 });
  });
});

describe('pay-out: the Bible time line', () => {
  let f: Fam;
  it('Bible time gets its own bucket next to lessons and loans, and it all adds up', async () => {
    at('2026-11-02T06:00:00Z'); // Monday 08:00
    f = await makeFamily(db, { Mum: 'parent', Sam: 'kid', Mia: 'kid' }, 'Payout Bible', TZ);
    await f.owner.rpc('update_member', { p_member: f.Sam.id, p_patch: { allowance_cents: 500 } });
    await f.owner.rpc('tick');
    at('2026-11-02T07:00:00Z');
    await f.owner.rpc('update_family', { p_patch: { settings: { bible_reward_cents: 700, lesson_reward_cents: 300 } } });
    let row = await summaryRow(f, f.Sam.id);
    expect(row).toMatchObject({ bible_cents: 0, bible_days: 0, bible_each_cents: null });

    const loan = await f.Mum.rpc<Row>('request_loan', { p_member: f.Sam.id, p_amount: 2000, p_purpose: 'Bike', p_plan: 'per_pay',
      p_installment: 400 });
    expect(loan.status).toBe('active');
    await f.Sam.rpc('finish_lesson', { p_lesson: 'purpose' });
    await open(f.Sam);
    await f.owner.rpc('spot', { p: { member_id: f.Sam.id, direction: 'plus', cents: 200, reason: 'Helped' } });
    at('2026-11-03T07:00:00Z');
    await open(f.Sam);
    at('2026-11-04T07:00:00Z');
    await open(f.Sam);
    row = await summaryRow(f, f.Sam.id);
    expect(row).toMatchObject({ allowance_cents: 500, rewards_cents: 200, lessons_cents: 300, bible_cents: 2100, bible_days: 3,
      bible_each_cents: 700, wallet_cents: 3100 });
    expect(parts(row)).toBe(row.wallet_cents);

    at('2026-11-09T06:00:00Z'); // next Monday: pocket money and the loan repayment
    await f.owner.rpc('tick');
    row = await summaryRow(f, f.Sam.id);
    expect(row).toMatchObject({ allowance_cents: 1000, loan_cents: -400, bible_cents: 2100, bible_days: 3, wallet_cents: 3200 });
    expect(parts(row)).toBe(row.wallet_cents);
    expect(row.wallet_cents).toBe(await balance(db, f.Sam.id, 'spending'));

    // a new value: two amounts in this cycle, so no "× each"
    at('2026-11-09T07:00:00Z');
    await setBible(f, 1000);
    await open(f.Sam);
    row = await summaryRow(f, f.Sam.id);
    expect(row).toMatchObject({ bible_cents: 3100, bible_days: 4, bible_each_cents: null, rewards_cents: 200 });
    expect(parts(row)).toBe(row.wallet_cents);
    expect(await summaryRow(f, f.Mia.id)).toMatchObject({ bible_cents: 0, bible_days: 0, bible_each_cents: null });
  });

  it('after a pay-out the line starts again; an undo after the cut counts in this cycle', async () => {
    at('2026-11-10T07:00:00Z');
    const before = await summaryRow(f, f.Sam.id);
    await f.Mum.rpc('record_payout', { p_member: f.Sam.id, p_expected_cents: before.wallet_cents, p_request: crypto.randomUUID() });
    let row = await summaryRow(f, f.Sam.id);
    expect(row).toMatchObject({ wallet_cents: 0, start_cents: 0, bible_cents: 0, bible_days: 0, bible_each_cents: null });

    at('2026-11-11T07:00:00Z');
    const old = (await bibleMoney(f.Sam.id)).find((r) => r.source_key === 'bible:2026-11-09')!;
    await f.Mum.rpc('reverse_transaction', { p_tx: old.id, p_reason: 'Too much' });
    row = await summaryRow(f, f.Sam.id);
    expect(row).toMatchObject({ wallet_cents: -1000, rewards_cents: 0, bible_cents: -1000, bible_days: 0, bible_each_cents: null });
    expect(parts(row)).toBe(row.wallet_cents);

    await open(f.Sam);
    row = await summaryRow(f, f.Sam.id);
    expect(row).toMatchObject({ wallet_cents: 0, bible_cents: 0, bible_days: 1, bible_each_cents: null });
    expect(parts(row)).toBe(row.wallet_cents);

    // the next cycle: one amount again
    at('2026-11-12T07:00:00Z');
    await f.Mum.rpc('record_payout', { p_member: f.Sam.id, p_expected_cents: 0, p_request: crypto.randomUUID() }).catch(() => undefined);
    at('2026-11-13T07:00:00Z');
    await f.Mum.rpc('spot', { p: { member_id: f.Sam.id, direction: 'plus', cents: 1500, reason: 'Help' } });
    await f.Mum.rpc('record_payout', { p_member: f.Sam.id, p_expected_cents: 1500, p_request: crypto.randomUUID() });
    at('2026-11-14T07:00:00Z');
    await open(f.Sam);
    at('2026-11-15T07:00:00Z');
    await open(f.Sam);
    row = await summaryRow(f, f.Sam.id);
    expect(row).toMatchObject({ bible_cents: 2000, bible_days: 2, bible_each_cents: 1000, wallet_cents: 2000 });
    expect(parts(row)).toBe(row.wallet_cents);
  });

  it('one reward undone in the same cycle drops out of the days', async () => {
    at('2026-11-20T07:00:00Z');
    const g = await makeFamily(db, { Mum: 'parent', Sam: 'kid' }, 'Undo cycle', TZ);
    await setBible(g, 700);
    await open(g.Sam);
    at('2026-11-21T07:00:00Z');
    await open(g.Sam);
    const [first] = await bibleMoney(g.Sam.id);
    await g.Mum.rpc('reverse_transaction', { p_tx: first.id, p_reason: 'Oops' });
    const row = await summaryRow(g, g.Sam.id);
    expect(row).toMatchObject({ wallet_cents: 700, bible_cents: 700, bible_days: 1, bible_each_cents: null, rewards_cents: 0 });
    expect(parts(row)).toBe(row.wallet_cents);
  });
});

describe('grants', () => {
  it('anon cannot run the new RPCs, authenticated can; the helper and the table are internal', async () => {
    for (const fn of ['public.bible_opened(text)', 'public.bible_opens_summary()', 'public.get_state()', 'public.update_family(jsonb)']) {
      const [r] = await q<Row>(db, `select has_function_privilege('anon', $1, 'execute') as anon,
                                           has_function_privilege('authenticated', $1, 'execute') as auth`, [fn]);
      expect(r, fn).toEqual({ anon: false, auth: true });
    }
    for (const fn of ['app.bible_reward_cents(jsonb)', 'app.payout_kid(public.members, public.families)', 'app.default_settings()']) {
      const [r] = await q<Row>(db, `select has_function_privilege('anon', $1, 'execute') as anon,
                                           has_function_privilege('authenticated', $1, 'execute') as auth`, [fn]);
      expect(r, fn).toEqual({ anon: false, auth: false });
    }
    await expect(asRole(db, 'anon', `select public.bible_opened('x')`)).rejects.toThrow(/permission denied/);
    await expect(asRole(db, 'anon', `select public.bible_opens_summary()`)).rejects.toThrow(/permission denied/);
    const [t] = await q<Row>(db, `select has_table_privilege('authenticated', 'public.bible_opens', 'select') as s,
                                         has_table_privilege('authenticated', 'public.bible_opens', 'insert') as i,
                                         has_table_privilege('anon', 'public.bible_opens', 'select') as a,
                                         (select relrowsecurity from pg_class where oid = 'public.bible_opens'::regclass) as rls`);
    expect(t).toEqual({ s: false, i: false, a: false, rls: true });
    await expect(asRole(db, 'authenticated', `select * from public.bible_opens`)).rejects.toThrow(/permission denied/);
  });

  it('bible_opens: one row per kid per day, removed with the member or the family', async () => {
    const keys = await q<Row>(db, `
      select c.contype as type, c.confdeltype as on_delete,
             array(select a.attname::text from unnest(c.conkey) k join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k
                    order by array_position(c.conkey, k)) as cols,
             c.confrelid::regclass::text as ref
        from pg_constraint c where c.conrelid = 'public.bible_opens'::regclass and c.contype in ('p', 'f')
       order by c.contype desc, ref`);
    expect(keys).toEqual([
      { type: 'p', on_delete: ' ', cols: ['member_id', 'day'], ref: '-' },
      { type: 'f', on_delete: 'c', cols: ['family_id'], ref: 'families' },
      { type: 'f', on_delete: 'c', cols: ['member_id'], ref: 'members' },
    ]);
    const g = await makeFamily(db, { Sam: 'kid' }, 'Cascade', TZ);
    await open(g.Sam, 'home');
    expect(await opens(g.Sam.id)).toHaveLength(1);
    await db.query(`delete from public.families where id = $1`, [g.familyId]);
    expect(await opens(g.Sam.id)).toEqual([]);
  });
});

describe('nothing tells the kids beforehand', () => {
  // Kid-facing texts (Help, guide, answers, Money school, Home, Me, the Tallies card), the Ask prompt and the demo
  // seed never mention the Bible time surprise. After the fact a kid sees the "📖 Bible time" row in History.
  const ROOT = new URL('../', import.meta.url);
  const filesIn = (dir: string): string[] =>
    readdirSync(new URL(dir, ROOT), { withFileTypes: true })
      .flatMap((e) => (e.isDirectory() ? filesIn(`${dir}/${e.name}`) : /\.(tsx?|sql)$/.test(e.name) ? [`${dir}/${e.name}`] : []));
  const TELLS = /bible[ _-]?(time|reward|surprise|open)|easter|🥚|bibleTrack|bible_opened/i;

  it('no mention in Help, Money school, Home, Me, Tallies, the Ask prompt or the demo seed', () => {
    const files = [
      ...filesIn('src/features/help'), ...filesIn('src/features/home'), ...filesIn('src/features/me'),
      'src/features/money/Tallies.tsx', 'src/features/faith/reflections.ts',
      ...filesIn('supabase/functions'), ...filesIn('supabase/pglite'),
    ];
    expect(files.length).toBeGreaterThan(20);
    for (const file of files) {
      const text = readFileSync(new URL(file, ROOT), 'utf8');
      expect(text.match(TELLS)?.[0] ?? null, file).toBeNull();
    }
  });
});
