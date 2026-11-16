// Exchange rate between the family currency (what the app counts in, e.g. EUR) and the currency the kids spend in
// (family rule "Kids spend money in", e.g. ZAR). Display only: the ledger never stores converted amounts.
// Rates: ECB reference rates via Frankfurter (free, no key), fallback open.er-api.com. Nothing about the family is
// sent. Cached per currency pair in localStorage: fresh for 6 h; when offline the last rate is shown with its date.
import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { money } from './format';
import { useMaybeApp } from './session';

export interface FxRate {
  base: string;
  quote: string;
  /** 1 base = `rate` quote. */
  rate: number;
  /** Day the rate is from (YYYY-MM-DD). */
  date: string;
  source: 'ECB' | 'ExchangeRate-API';
  /** When this device fetched it (ms since epoch). */
  fetchedAt: number;
}

export const FX_FRESH_MS = 6 * 3_600_000;
/** "Type in R" needs a rate this device fetched in the last 3 days. */
export const FX_ENTRY_MAX_AGE_MS = 72 * 3_600_000;
const TIMEOUT_MS = 8_000;
const CODE = /^[A-Z]{3}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const cacheKey = (base: string, quote: string) => `pm.fx.v1.${base}.${quote}`;

export const validRate = (r: unknown): r is number => typeof r === 'number' && Number.isFinite(r) && r > 0 && r < 1e6;

type Json = Record<string, unknown>;
const isObj = (x: unknown): x is Json => !!x && typeof x === 'object' && !Array.isArray(x);

/** https://api.frankfurter.dev/v2/rates?base=EUR&quotes=ZAR → [{ date, base, quote, rate }] */
export function parseFrankfurter(json: unknown, base: string, quote: string, now = Date.now()): FxRate | null {
  if (!Array.isArray(json)) return null;
  const row = json.find((x): x is Json => isObj(x) && x.base === base && x.quote === quote);
  if (!row || !validRate(row.rate) || typeof row.date !== 'string' || !DAY.test(row.date)) return null;
  return { base, quote, rate: row.rate, date: row.date, source: 'ECB', fetchedAt: now };
}

/** https://open.er-api.com/v6/latest/EUR → { result: 'success', base_code, time_last_update_utc, rates: { ZAR } } */
export function parseErApi(json: unknown, base: string, quote: string, now = Date.now()): FxRate | null {
  if (!isObj(json) || json.result !== 'success' || json.base_code !== base || !isObj(json.rates)) return null;
  const rate = json.rates[quote];
  if (!validRate(rate)) return null;
  const t = typeof json.time_last_update_utc === 'string' ? Date.parse(json.time_last_update_utc) : NaN;
  const date = new Date(Number.isFinite(t) ? t : now).toISOString().slice(0, 10);
  return { base, quote, rate, date, source: 'ExchangeRate-API', fetchedAt: now };
}

async function getJson(url: string, fetchFn: typeof fetch): Promise<unknown> {
  const ctl = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = ctl ? setTimeout(() => ctl.abort(), TIMEOUT_MS) : null;
  try {
    const res = await fetchFn(url, { signal: ctl?.signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Today's rate from the network (ECB first, then the fallback). null when both fail. */
export async function fetchRate(base: string, quote: string, fetchFn: typeof fetch = fetch, now = () => Date.now()): Promise<FxRate | null> {
  if (!CODE.test(base) || !CODE.test(quote) || base === quote) return null;
  const ecb = parseFrankfurter(
    await getJson(`https://api.frankfurter.dev/v2/rates?base=${base}&quotes=${quote}`, fetchFn), base, quote, now());
  if (ecb) return ecb;
  return parseErApi(await getJson(`https://open.er-api.com/v6/latest/${base}`, fetchFn), base, quote, now());
}

function readCache(base: string, quote: string): FxRate | null {
  try {
    const raw = localStorage.getItem(cacheKey(base, quote));
    const r = raw ? (JSON.parse(raw) as Partial<FxRate>) : null;
    if (!r || r.base !== base || r.quote !== quote || !validRate(r.rate) || typeof r.date !== 'string' || !DAY.test(r.date)
      || typeof r.fetchedAt !== 'number' || (r.source !== 'ECB' && r.source !== 'ExchangeRate-API')) return null;
    return r as FxRate;
  } catch {
    return null;
  }
}

function writeCache(r: FxRate) {
  try { localStorage.setItem(cacheKey(r.base, r.quote), JSON.stringify(r)); } catch { /* private mode: keep it in memory */ }
}

// ---------------------------------------------------------------- one shared store per currency pair
export interface FxEntry { rate: FxRate | null; loading: boolean; failed: boolean }
const entries = new Map<string, FxEntry>();
const inflight = new Map<string, Promise<void>>();
const listeners = new Set<() => void>();
const OFF: FxEntry = { rate: null, loading: false, failed: false };

function emit() { listeners.forEach((l) => l()); }
function subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; }
function entryFor(base: string, quote: string): FxEntry {
  const k = `${base}.${quote}`;
  let e = entries.get(k);
  if (!e) { e = { rate: readCache(base, quote), loading: false, failed: false }; entries.set(k, e); }
  return e;
}
function setEntry(base: string, quote: string, e: FxEntry) { entries.set(`${base}.${quote}`, e); emit(); }

/** Fetch the rate unless the one we have is still fresh (or `force`). Concurrent calls share one request. */
export function loadRate(base: string, quote: string, opts: { force?: boolean; fetchFn?: typeof fetch; now?: () => number } = {}): Promise<void> {
  if (!CODE.test(base) || !CODE.test(quote) || base === quote) return Promise.resolve();
  const k = `${base}.${quote}`;
  const now = opts.now ?? (() => Date.now());
  const e = entryFor(base, quote);
  if (!opts.force && e.rate && now() - e.rate.fetchedAt < FX_FRESH_MS) return Promise.resolve();
  const running = inflight.get(k);
  if (running) return running;
  setEntry(base, quote, { ...e, loading: true });
  const p = fetchRate(base, quote, opts.fetchFn ?? fetch, now).catch(() => null).then((r) => {
    if (r) writeCache(r);
    const cur = entryFor(base, quote);
    setEntry(base, quote, r ? { rate: r, loading: false, failed: false } : { rate: cur.rate, loading: false, failed: true });
  }).finally(() => { inflight.delete(k); });
  inflight.set(k, p);
  return p;
}

/** Test helper: forget everything in memory. */
export function resetFxStore() { entries.clear(); inflight.clear(); emit(); }

// ---------------------------------------------------------------- conversions & words
/** base cents → quote cents. */
export const toQuote = (cents: number, rate: number) => Math.round(cents * rate);
/** quote cents → base cents. */
export const toBase = (quoteCents: number, rate: number) => Math.round(quoteCents / rate);

/** An approximate amount: whole units from 100 up ("R 1,867"), else with cents ("R 37.32"). */
export function approxMoney(cents: number, currency: string): string {
  const c = Math.round(cents);
  return Math.abs(c) >= 10_000 ? money(Math.round(c / 100) * 100, currency, { whole: true }) : money(c, currency);
}

const WORDS: Record<string, string> = { ZAR: 'rand', EUR: 'euro', USD: 'dollars', GBP: 'pounds' };
/** "rand", "euro", "dollars", "pounds" (else the ISO code). */
export const currencyWord = (code: string) => WORDS[code] ?? code;

/** "€1 = R 18.66" — always the way round that gives a number of 1 or more (R→€ shows "€1 = R 18.66", not "R1 = €0.0536"). */
export function rateHeadline(base: string, quote: string, rate: number): string {
  return rate >= 1
    ? `${money(100, base, { whole: true })} = ${rateText(rate, quote)}`
    : `${money(100, quote, { whole: true })} = ${rateText(1 / rate, base)}`;
}

/** "R 18.66" for 1 unit of the base currency (more decimals for small rates, e.g. "€0.0536"). */
export function rateText(rate: number, quote: string): string {
  const digits = rate >= 10 ? 2 : rate >= 1 ? 3 : 4;
  try {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency', currency: quote, currencyDisplay: 'narrowSymbol', minimumFractionDigits: 2, maximumFractionDigits: digits,
    }).format(rate);
  } catch {
    return `${rate.toFixed(digits)} ${quote}`;
  }
}

/** The currency the kids spend in, or null when the rule is off / the same as the family currency. */
export function spendCurrencyOf(family: { currency: string; settings?: { spend_currency?: string | null } } | null | undefined): string | null {
  const s = family?.settings?.spend_currency;
  return family && s && CODE.test(s) && s !== family.currency ? s : null;
}

export interface Fx {
  /** Family currency (what the app counts in). */
  base: string;
  /** Currency the kids spend in. */
  quote: string;
  rate: FxRate | null;
  loading: boolean;
  /** The last check failed (the shown rate, if any, may be old). */
  failed: boolean;
  /** Convert between the two currencies (null without a rate). Other currencies → null. */
  convert: (cents: number, from: string) => { cents: number; currency: string } | null;
  refresh: () => void;
}

/** Today's rate for the family, or null when the kids spend in the family currency. */
export function useFx(): Fx | null {
  const app = useMaybeApp();
  const base = app?.family?.currency ?? 'EUR';
  const quote = spendCurrencyOf(app?.family);
  const entry = useSyncExternalStore(subscribe, () => (quote ? entryFor(base, quote) : OFF), () => OFF);
  useEffect(() => {
    if (!quote) return;
    void loadRate(base, quote);
    const again = () => { if (document.visibilityState === 'visible') void loadRate(base, quote); };
    document.addEventListener('visibilitychange', again);
    return () => document.removeEventListener('visibilitychange', again);
  }, [base, quote]);
  return useMemo(() => {
    if (!quote) return null;
    const r = entry.rate;
    return {
      base, quote, rate: r, loading: entry.loading, failed: entry.failed,
      convert: (cents, from) => !r ? null
        : from === base ? { cents: toQuote(cents, r.rate), currency: quote }
          : from === quote ? { cents: toBase(cents, r.rate), currency: base } : null,
      refresh: () => { void loadRate(base, quote, { force: true }); },
    };
  }, [base, quote, entry]);
}
