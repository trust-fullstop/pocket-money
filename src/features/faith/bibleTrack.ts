// Bible time surprise (feature 'faith'): when a kid taps one of Sow & Grow's own Bible App links, the server counts it
// once per family-local day and may put the family's small surprise in their Wallet (bible_opened). Kids aren't told;
// the toast is how they find out. Opening the Bible App any other way can't be seen, and a tap only shows that the
// app was opened, nothing about reading or believing.
//
// The link is never delayed: the call starts on the click and the Bible App opens as usual (target=_blank). A phone
// often freezes the page right away, so a pending marker in localStorage (per family + member) is sent again when the
// app starts or becomes visible, the same family-local day only. Best effort: a tap that never reaches the server is lost.
import { useCallback, useEffect, useRef } from 'react';
import { useToast } from '../../components/ui';
import { api } from '../../lib/api';
import { toAppError } from '../../lib/errors';
import { useFeatures } from '../../lib/features';
import { money, todayISO } from '../../lib/format';
import { useMaybeApp, type AppContextValue } from '../../lib/session';
import type { BibleOpened } from '../../lib/types';
import { showsVerses } from './prefs';

const PREFIX = 'pm.bible.pending';
interface Pending { day: string; ref: string | null; nonce: string }

/** Calls whose answer hasn't come back yet (so a flush doesn't send the same tap twice). */
const inFlight = new Set<string>();
/** A surprise that arrived while the Bible App was in front: shown when this member comes back. */
let deferred: { key: string; message: string } | null = null;

const keyOf = (familyId: string, memberId: string) => `${PREFIX}:${familyId}:${memberId}`;
const newNonce = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;

function read(key: string): Pending | null {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? 'null') as Partial<Pending> | null;
    if (v && typeof v.day === 'string' && typeof v.nonce === 'string') {
      return { day: v.day, nonce: v.nonce, ref: typeof v.ref === 'string' ? v.ref : null };
    }
  } catch { /* unreadable: treated as none */ }
  return null;
}

function write(key: string, p: Pending) {
  try { localStorage.setItem(key, JSON.stringify(p)); } catch { /* private mode / full: just no retry */ }
}

/** Remove the marker only when it is still this tap's (a newer tap keeps its own). */
function clearIf(key: string, nonce: string) {
  try { if (read(key)?.nonce === nonce) localStorage.removeItem(key); } catch { /* ignore */ }
}

/** Who may be counted: a kid, faith on for the family, verses not hidden for themselves (the server checks the same). */
function trackKey(app: AppContextValue | null, faithOn: boolean): string | null {
  const me = app?.me;
  const family = app?.family;
  if (!me || !family || me.role !== 'kid' || !faithOn || !showsVerses(me.theme)) return null;
  return keyOf(family.id, me.id);
}

interface Ctx { app: AppContextValue; show: (message: string, tone?: 'success' | 'info' | 'error') => void }

async function send(key: string, p: Pending, ctx: Ctx) {
  inFlight.add(p.nonce);
  let r: BibleOpened | null = null;
  try {
    r = await api.bibleOpened(p.ref);
    clearIf(key, p.nonce);
  } catch (e) {
    // No answer (offline): keep it for a retry later today. The server said no: never retry.
    const code = toAppError(e).code;
    if (code !== 'network' && code !== 'unknown') clearIf(key, p.nonce);
  } finally {
    inFlight.delete(p.nonce);
  }
  if (!r || !(r.rewarded_cents > 0)) return;
  const currency = ctx.app.family?.currency ?? 'EUR';
  const message = `🥚 You found a surprise: ${money(r.rewarded_cents, currency, { sign: true, whole: true })} 📖`;
  if (document.visibilityState === 'visible') ctx.show(message, 'success');
  else deferred = { key, message };
  void ctx.app.refresh().catch(() => undefined);
}

/**
 * Click handler for Sow & Grow's own Bible App links: `track(ref)` with the verse reference (or 'home'). Does nothing
 * for grown-ups, with faith off or verses hidden. Never calls preventDefault: the link opens as usual.
 */
export function useTrackBibleOpen(): (ref: string | null) => void {
  const app = useMaybeApp();
  const { on } = useFeatures();
  const { show } = useToast();
  const key = trackKey(app, on('faith'));
  const latest = useRef<Ctx | null>(null);
  useEffect(() => { latest.current = app ? { app, show } : null; });
  return useCallback((ref: string | null) => {
    const ctx = latest.current;
    const family = ctx?.app.family;
    if (!key || !ctx || !family) return;
    const p: Pending = {
      day: todayISO(family.timezone, ctx.app.now()),
      ref: ref ? ref.trim().slice(0, 40) || null : null,
      nonce: newNonce(),
    };
    write(key, p);
    void send(key, p, ctx);
  }, [key]);
}

/**
 * Mount once for a signed-in member (AppShell): on start and whenever the app is visible again, send a tap that
 * didn't get through (same family + member, today only; older ones are dropped) and show a surprise that arrived
 * while the Bible App was in front.
 */
export function useBibleOpenFlush(): void {
  const app = useMaybeApp();
  const { on } = useFeatures();
  const { show } = useToast();
  const key = trackKey(app, on('faith'));
  const latest = useRef<Ctx | null>(null);
  useEffect(() => { latest.current = app ? { app, show } : null; });

  useEffect(() => {
    if (!key) return;
    const flush = () => {
      const ctx = latest.current;
      const family = ctx?.app.family;
      if (!ctx || !family || document.visibilityState !== 'visible') return;
      if (deferred?.key === key) {
        ctx.show(deferred.message, 'success');
        deferred = null;
      }
      const p = read(key);
      if (!p || inFlight.has(p.nonce)) return;
      if (p.day !== todayISO(family.timezone, ctx.app.now())) {
        clearIf(key, p.nonce);
        return;
      }
      void send(key, p, ctx);
    };
    flush();
    document.addEventListener('visibilitychange', flush);
    return () => document.removeEventListener('visibilitychange', flush);
  }, [key]);
}
