// The kids spend in another currency (migration 20261116001600 + src/lib/fx.ts).
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { clock, expectCode, makeDb, makeFamily, q, type Fam } from './helpers';
import {
  approxMoney, fetchRate, loadRate, parseErApi, parseFrankfurter, rateText, resetFxStore, spendCurrencyOf, toBase, toQuote,
} from '../src/lib/fx';

let db: PGlite;
beforeAll(async () => { db = await makeDb(); });
afterEach(() => { clock.now = null; });

describe('family rule: the kids spend money in', () => {
  let f: Fam;
  it('is off by default, a manager sets it to an ISO code or back to null', async () => {
    f = await makeFamily(db, { Sam: 'kid', Mum: 'parent' });
    let st = await f.Sam.rpc<any>('get_state');
    expect(st.family.settings.spend_currency).toBeNull();
    st = await f.Mum.rpc<any>('update_family', { p_patch: { settings: { spend_currency: 'ZAR' } } });
    expect(st.family.settings.spend_currency).toBe('ZAR');
    expect((await f.Sam.rpc<any>('get_state')).family.settings.spend_currency).toBe('ZAR');
    st = await f.owner.rpc<any>('update_family', { p_patch: { settings: { spend_currency: null } } });
    expect(st.family.settings.spend_currency).toBeNull();
  });

  it('rejects junk and kids', async () => {
    for (const v of ['zar', 'RANDS', 7, true, '']) {
      await expectCode(f.owner.rpc('update_family', { p_patch: { settings: { spend_currency: v } } }), 'invalid', 'setting:spend_currency');
    }
    await expectCode(f.Sam.rpc('update_family', { p_patch: { settings: { spend_currency: 'ZAR' } } }), 'not_allowed');
  });
});

describe('real bank balance in another currency', () => {
  let f: Fam;
  it('defaults to the family currency; rand only once the kids spend in rand', async () => {
    f = await makeFamily(db, { Sam: 'kid' });
    const b = await f.Sam.rpc<any>('set_bank_balance', { p_member: f.Sam.id, p_amount_cents: 5000, p_label: 'Revolut' });
    expect(b).toMatchObject({ amount_cents: 5000, currency: 'EUR', label: 'Revolut' });
    await expectCode(f.Sam.rpc('set_bank_balance', { p_member: f.Sam.id, p_amount_cents: 1, p_currency: 'ZAR' }), 'invalid', 'currency');

    await f.owner.rpc('update_family', { p_patch: { settings: { spend_currency: 'ZAR' } } });
    const r = await f.owner.rpc<any>('set_bank_balance', { p_member: f.Sam.id, p_amount_cents: 125000, p_label: 'Revolut', p_currency: 'ZAR' });
    expect(r).toMatchObject({ amount_cents: 125000, currency: 'ZAR' });
    await expectCode(f.Sam.rpc('set_bank_balance', { p_member: f.Sam.id, p_amount_cents: 1, p_currency: 'USD' }), 'invalid', 'currency');

    const list = await f.Sam.rpc<any[]>('list_bank_balances', { p_member: f.Sam.id });
    expect(list.map((x) => x.currency).sort()).toEqual(['EUR', 'ZAR']);
  });

  it('an account already in rand can still be updated after the rule is switched off', async () => {
    await f.owner.rpc('update_family', { p_patch: { settings: { spend_currency: null } } });
    const r = await f.Sam.rpc<any>('set_bank_balance', { p_member: f.Sam.id, p_amount_cents: 99000, p_label: 'Revolut', p_currency: 'ZAR' });
    expect(r.currency).toBe('ZAR');
    await expectCode(f.Sam.rpc('set_bank_balance', { p_member: f.Sam.id, p_amount_cents: 1, p_currency: 'GBP' }), 'invalid', 'currency');
  });

  it('has exactly one set_bank_balance, callable by signed-in users only', async () => {
    const fns = await q<{ args: string }>(db,
      `select pg_get_function_identity_arguments(p.oid) as args from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'set_bank_balance'`);
    expect(fns).toHaveLength(1);
    const [priv] = await q<{ anon: boolean; pub: boolean; auth: boolean }>(db, `select
      has_function_privilege('anon', 'public.set_bank_balance(uuid,bigint,text,date,text,text)', 'execute') as anon,
      exists (select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
               where p.oid = 'public.set_bank_balance(uuid,bigint,text,date,text,text)'::regprocedure and a.grantee = 0) as pub,
      has_function_privilege('authenticated', 'public.set_bank_balance(uuid,bigint,text,date,text,text)', 'execute') as auth`);
    expect(priv).toEqual({ anon: false, pub: false, auth: true });
  });
});

describe('exchange rate (client)', () => {
  const now = Date.parse('2026-11-16T19:00:00Z');
  it('parses Frankfurter v2 and open.er-api, and rejects junk', () => {
    expect(parseFrankfurter([{ date: '2026-11-16', base: 'EUR', quote: 'ZAR', rate: 18.6584 }], 'EUR', 'ZAR', now))
      .toEqual({ base: 'EUR', quote: 'ZAR', rate: 18.6584, date: '2026-11-16', source: 'ECB', fetchedAt: now });
    expect(parseFrankfurter([{ date: '2026-11-16', base: 'EUR', quote: 'USD', rate: 1.1 }], 'EUR', 'ZAR')).toBeNull();
    expect(parseFrankfurter([{ date: '2026-11-16', base: 'EUR', quote: 'ZAR', rate: 0 }], 'EUR', 'ZAR')).toBeNull();
    expect(parseFrankfurter({ status: 422 }, 'EUR', 'ZAR')).toBeNull();
    expect(parseErApi({ result: 'success', base_code: 'EUR', time_last_update_utc: 'Mon, 16 Nov 2026 00:02:31 +0000', rates: { ZAR: 18.7 } }, 'EUR', 'ZAR', now))
      .toMatchObject({ rate: 18.7, date: '2026-11-16', source: 'ExchangeRate-API' });
    expect(parseErApi({ result: 'error' }, 'EUR', 'ZAR')).toBeNull();
    expect(parseErApi({ result: 'success', base_code: 'USD', rates: { ZAR: 17 } }, 'EUR', 'ZAR')).toBeNull();
  });

  it('falls back to the second source, and gives up quietly', async () => {
    const urls: string[] = [];
    const fake = (ok: boolean) => (async (url: string) => {
      urls.push(url);
      if (url.includes('frankfurter')) return { ok: false, json: async () => ({}) };
      return { ok, json: async () => ({ result: 'success', base_code: 'EUR', rates: { ZAR: 18.5 } }) };
    }) as unknown as typeof fetch;
    expect((await fetchRate('EUR', 'ZAR', fake(true)))?.rate).toBe(18.5);
    expect(urls[0]).toBe('https://api.frankfurter.dev/v2/rates?base=EUR&quotes=ZAR');
    expect(urls[1]).toBe('https://open.er-api.com/v6/latest/EUR');
    expect(await fetchRate('EUR', 'ZAR', fake(false))).toBeNull();
    expect(await fetchRate('EUR', 'EUR', fake(true))).toBeNull();
    const throws = (async () => { throw new Error('offline'); }) as unknown as typeof fetch;
    expect(await fetchRate('EUR', 'ZAR', throws)).toBeNull();
  });

  it('shares one request and keeps a fresh rate', async () => {
    resetFxStore();
    let calls = 0;
    const fake = (async () => { calls += 1; return { ok: true, json: async () => [{ date: '2026-11-16', base: 'EUR', quote: 'ZAR', rate: 18.66 }] }; }) as unknown as typeof fetch;
    await Promise.all([loadRate('EUR', 'ZAR', { fetchFn: fake }), loadRate('EUR', 'ZAR', { fetchFn: fake })]);
    await loadRate('EUR', 'ZAR', { fetchFn: fake });
    expect(calls).toBe(1);
    await loadRate('EUR', 'ZAR', { fetchFn: fake, force: true });
    expect(calls).toBe(2);
    resetFxStore();
  });

  it('converts and rounds', () => {
    const sp = (s: string) => s.replace(/\s/g, ' ');
    expect(toQuote(2000, 18.66)).toBe(37320);
    expect(toBase(20000, 18.66)).toBe(1072);
    expect(sp(approxMoney(37320, 'ZAR'))).toBe('R 373');
    expect(sp(approxMoney(3732, 'ZAR'))).toBe('R 37.32');
    expect(sp(approxMoney(9999, 'ZAR'))).toBe('R 99.99');
    expect(sp(approxMoney(10050, 'EUR'))).toBe('€101');
    expect(sp(rateText(18.6584, 'ZAR'))).toBe('R 18.66');
    expect(sp(rateText(0.0536, 'EUR'))).toBe('€0.0536');
    expect(spendCurrencyOf({ currency: 'EUR', settings: { spend_currency: 'ZAR' } })).toBe('ZAR');
    expect(spendCurrencyOf({ currency: 'EUR', settings: { spend_currency: 'EUR' } })).toBeNull();
    expect(spendCurrencyOf({ currency: 'EUR', settings: { spend_currency: null } })).toBeNull();
  });
});
