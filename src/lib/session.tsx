// App-wide session state: who am I, my family, members, balances. Plus the tiny useLoad() data hook.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api } from './api';
import { backend } from './backend';
import { friendlyError, toAppError } from './errors';
import { applyTheme } from './theme';
import type { AppState, Balances, Family, Member } from './types';
import { isManager as isManagerRole } from './types';

const TICK_KEY = 'pm.tick.at';
const TICK_EVERY_MS = 5 * 60_000;
const ZERO: Balances = { spending: 0, savings: 0, time: 0, points: 0 };

export interface AppContextValue {
  state: AppState | null;
  me: Member | null;
  family: Family | null;
  members: Member[];
  membersById: Record<string, Member>;
  isManager: boolean;
  /** Balances of a member (zeros when the caller may not see them). */
  balancesOf: (memberId: string) => Balances;
  /** Reload get_state. `{ tick: true }` forces the timed rules to run first (otherwise at most every 5 min). */
  refresh: (opts?: { tick?: boolean }) => Promise<AppState | null>;
  /** True only during the very first load. */
  loading: boolean;
  /** Friendly message when the first load failed (null otherwise). */
  error: string | null;
  mode: 'demo' | 'cloud';
  /** "Now" as the server sees it (respects the demo's fake clock). */
  now: () => Date;
  /** Optimistically patch me (e.g. theme) before the server confirms; call refresh() afterwards. */
  patchMe: (patch: Partial<Member>) => void;
  /** Sign this device out (state becomes null → Welcome). */
  signOut: () => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

async function maybeTick(force: boolean) {
  const last = Number(localStorage.getItem(TICK_KEY) || 0);
  if (!force && Date.now() - last < TICK_EVERY_MS) return;
  try {
    await api.tick();
    localStorage.setItem(TICK_KEY, String(Date.now()));
  } catch (e) {
    // Timed rules are best-effort. Only retry soon when we simply weren't a member yet.
    const code = toAppError(e).code;
    if (code !== 'not_member' && code !== 'not_signed_in') localStorage.setItem(TICK_KEY, String(Date.now()));
  }
}

export function AppProvider({ children }: { children: ReactNode }) {
  const mode = backend().mode;
  const [state, setState] = useState<AppState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);
  const lastLoad = useRef(0);
  const clockOffset = useRef(0);

  const load = useCallback(async (tick: 'auto' | 'force'): Promise<AppState | null> => {
    const id = ++seq.current;
    // Demo: always has a (local) session. Cloud: don't create anonymous users just for visiting the Welcome page.
    const uid = mode === 'demo' ? await backend().ensureSession() : await backend().userId();
    let s: AppState | null = null;
    if (uid) {
      await maybeTick(tick === 'force');
      try {
        s = await api.getState();
      } catch (e) {
        const code = toAppError(e).code;
        if (code !== 'not_member' && code !== 'not_signed_in') throw e;
      }
    }
    lastLoad.current = Date.now();
    if (id === seq.current) {
      if (s) clockOffset.current = Date.parse(s.now) - Date.now();
      setState(s);
      setError(null);
    }
    return s;
  }, [mode]);

  const refresh = useCallback((opts?: { tick?: boolean }) => load(opts?.tick ? 'force' : 'auto'), [load]);

  useEffect(() => {
    let alive = true;
    load('auto')
      .catch((e) => { if (alive) setError(friendlyError(e)); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [load]);

  // Refresh when the app comes back to the foreground.
  useEffect(() => {
    const onWake = () => {
      if (document.visibilityState !== 'visible' || Date.now() - lastLoad.current < 4000) return;
      lastLoad.current = Date.now();
      load('auto').catch(() => undefined);
    };
    window.addEventListener('focus', onWake);
    document.addEventListener('visibilitychange', onWake);
    return () => {
      window.removeEventListener('focus', onWake);
      document.removeEventListener('visibilitychange', onWake);
    };
  }, [load]);

  const theme = state?.me.theme;
  useEffect(() => {
    applyTheme(theme ?? null);
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    const onChange = () => applyTheme(theme ?? null);
    mq?.addEventListener('change', onChange);
    return () => mq?.removeEventListener('change', onChange);
  }, [theme]);

  const patchMe = useCallback((patch: Partial<Member>) => {
    setState((s) => {
      if (!s) return s;
      const me = { ...s.me, ...patch };
      return { ...s, me, members: s.members.map((m) => (m.id === me.id ? { ...m, ...patch } : m)) };
    });
  }, []);

  const signOut = useCallback(async () => {
    await backend().signOut();
    seq.current++;
    setState(null);
    await load('auto').catch(() => undefined);
  }, [load]);

  const value = useMemo<AppContextValue>(() => {
    const members = state?.members ?? [];
    const membersById: Record<string, Member> = {};
    for (const m of members) membersById[m.id] = m;
    return {
      state,
      me: state?.me ?? null,
      family: state?.family ?? null,
      members,
      membersById,
      isManager: isManagerRole(state?.me.role),
      balancesOf: (id: string) => state?.balances[id] ?? ZERO,
      refresh,
      loading,
      error,
      mode,
      now: () => new Date(Date.now() + clockOffset.current),
      patchMe,
      signOut,
    };
  }, [state, refresh, loading, error, mode, patchMe, signOut]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

/** Session state. Must be used inside <AppProvider>. */
export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp() outside <AppProvider>');
  return ctx;
}

/** Like useApp() but returns null outside <AppProvider> (for reusable UI components). */
export function useMaybeApp(): AppContextValue | null {
  return useContext(AppContext);
}

export interface LoadResult<T> {
  data: T | undefined;
  loading: boolean;
  error: string | null;
  /** Re-run the loader, keeping the current data visible meanwhile. */
  reload: () => Promise<void>;
  setData: (d: T | undefined) => void;
}

/**
 * Tiny data hook: `const { data, loading, error, reload } = useLoad(() => api.listLogins(), [])`.
 * Re-runs when deps change; `error` is already a friendly sentence.
 */
export function useLoad<T>(fn: () => Promise<T>, deps: readonly unknown[]): LoadResult<T> {
  const [data, setData] = useState<T | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fnRef = useRef(fn);
  const seqRef = useRef(0);
  useEffect(() => { fnRef.current = fn; });

  const run = useCallback(async (silent: boolean) => {
    const id = ++seqRef.current;
    if (!silent) setLoading(true);
    try {
      const d = await fnRef.current();
      if (id === seqRef.current) { setData(d); setError(null); }
    } catch (e) {
      if (id === seqRef.current) setError(friendlyError(e));
    } finally {
      if (id === seqRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fnRef.current = fn;
    run(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  const reload = useCallback(() => run(true), [run]);
  return { data, loading, error, reload, setData };
}
