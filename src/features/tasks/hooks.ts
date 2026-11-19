// Hooks for the Tasks feature: session shortcuts, data loading with error codes, delayed skeletons,
// online state, leave-without-saving guard and the approve / send back / excuse actions.
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useNavigate } from 'react-router';
import { useConfirm, useToast } from '../../components/ui';
import { api } from '../../lib/api';
import { AppError, friendlyError, toAppError } from '../../lib/errors';
import { useFeatures } from '../../lib/features';
import { todayISO } from '../../lib/format';
import { useApp } from '../../lib/session';
import { useHoldUpdates } from '../../lib/updates';
import type { TaskInstance } from '../../lib/types';
import { joinWords, penaltyParts, rewardParts, type PenaltyFields, type RewardFields, type Shown } from './lib';

/** Feature switches the Tasks screens care about. */
export function useTaskFeatures() {
  const { on } = useFeatures();
  return { challenges: on('challenges'), time: on('time'), points: on('points') };
}

/** Session values every task screen needs. */
export function useTaskCtx() {
  const { state, me, family, members, membersById, isManager, now, refresh } = useApp();
  const feat = useTaskFeatures();
  const tz = family?.timezone ?? 'UTC';
  const currency = family?.currency ?? 'EUR';
  const today = state?.today ?? todayISO(tz, now());
  const nameOf = useCallback((id: string | null | undefined) => (id && membersById[id]?.display_name) || 'Someone', [membersById]);
  const shown: Shown = { time: feat.time, points: feat.points };
  return {
    state, me, family, members, membersById, isManager, now, refresh, tz, currency, today, nameOf, feat, shown,
    /** Reward pieces without switched-off kinds (time, points). */
    rewardsOf: (t: RewardFields) => rewardParts(t, currency, shown),
    /** Consequence pieces without switched-off kinds (time, points). */
    penaltiesOf: (t: PenaltyFields) => penaltyParts(t, currency, shown),
    isKid: me?.role === 'kid',
    isGrandparent: me?.role === 'grandparent',
    approvalsCount: state?.counts.approvals ?? 0,
  };
}

export interface Fetch<T> {
  data: T | undefined;
  error: AppError | null;
  /** True while the first load for the current key runs (no data to show yet). */
  loading: boolean;
  /** True while a silent re-load runs (data stays visible). */
  refreshing: boolean;
  reload: () => Promise<void>;
  setData: (fn: (d: T | undefined) => T | undefined) => void;
}

/**
 * Load data for a key (re-runs, showing nothing stale, when the key changes). Keeps the AppError so
 * screens can react to codes (not_found, not_allowed). Re-loads silently when `version` changes (pass the
 * app state: it changes after every refresh — mutations, coming back to the app); without a version it
 * re-loads when the app comes back to focus.
 */
export function useFetch<T>(fn: () => Promise<T>, key: readonly unknown[], version?: unknown): Fetch<T> {
  const keyStr = JSON.stringify(key);
  const [res, setRes] = useState<{ key: string; data: T } | null>(null);
  const [err, setErr] = useState<{ key: string; error: AppError } | null>(null);
  const [busy, setBusy] = useState<{ key: string } | null>(null);
  const fnRef = useRef(fn);
  const keyRef = useRef(keyStr);
  const seq = useRef(0);
  useEffect(() => { fnRef.current = fn; keyRef.current = keyStr; });

  // Fetch for key `k`; only the newest request may write its result.
  const load = useCallback((k: string) => {
    const id = ++seq.current;
    return fnRef.current().then(
      (d) => { if (id === seq.current) { setRes({ key: k, data: d }); setErr(null); setBusy(null); } },
      (e: unknown) => { if (id === seq.current) { setErr({ key: k, error: toAppError(e) }); setBusy(null); } },
    );
  }, []);
  // Silent re-load: data stays visible and `refreshing` is true meanwhile (`loading` covers first loads).
  const run = useCallback((k: string) => {
    setBusy({ key: k });
    return load(k);
  }, [load]);

  // (fnRef is updated by the effect above, which runs first in the same commit.)
  useEffect(() => { void load(keyStr); }, [keyStr, load]);

  const versioned = version !== undefined;
  const lastVersion = useRef(version);
  useEffect(() => {
    if (lastVersion.current === version) return;
    lastVersion.current = version;
    void run(keyRef.current);
  }, [version, run]);

  useEffect(() => {
    if (versioned) return;
    let last = Date.now();
    const onWake = () => {
      if (document.visibilityState !== 'visible' || Date.now() - last < 4000) return;
      last = Date.now();
      void run(keyRef.current);
    };
    window.addEventListener('focus', onWake);
    document.addEventListener('visibilitychange', onWake);
    return () => {
      window.removeEventListener('focus', onWake);
      document.removeEventListener('visibilitychange', onWake);
    };
  }, [run, versioned]);

  const data = res?.key === keyStr ? res.data : undefined;
  const error = err?.key === keyStr ? err.error : null;
  const reload = useCallback(() => run(keyRef.current), [run]);
  const setData = useCallback((f: (d: T | undefined) => T | undefined) => {
    setRes((r) => {
      const next = f(r?.key === keyRef.current ? r.data : undefined);
      return next === undefined ? null : { key: keyRef.current, data: next };
    });
  }, []);
  return {
    data, error, reload, setData,
    loading: data === undefined && !error,
    refreshing: busy?.key === keyStr,
  };
}

/** True only after `flag` has been true for `ms` (avoids skeleton flashes). */
export function useDelayed(flag: boolean, ms = 150): boolean {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!flag) return;
    const t = window.setTimeout(() => setShown(true), ms);
    return () => { window.clearTimeout(t); setShown(false); };
  }, [flag, ms]);
  return flag && shown;
}

const subscribeOnline = (cb: () => void) => {
  window.addEventListener('online', cb);
  window.addEventListener('offline', cb);
  return () => { window.removeEventListener('online', cb); window.removeEventListener('offline', cb); };
};
/** navigator.onLine as state. */
export function useOnline(): boolean {
  return useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
}

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

/**
 * While `active`: asks "Leave without saving?" before following an in-app link (nav bar, header links)
 * and before closing the tab. Returns `guardedNavigate` for our own buttons (e.g. Back).
 */
export function useLeaveGuard(active: boolean) {
  const confirm = useConfirm();
  const navigate = useNavigate();
  const activeRef = useRef(active);
  useEffect(() => { activeRef.current = active; });

  const ask = useCallback(() => confirm({
    title: 'Leave without saving?', message: 'What you typed will be lost.',
    confirmLabel: 'Leave', cancelLabel: 'Keep editing', danger: true,
  }), [confirm]);
  useHoldUpdates(active);

  useEffect(() => {
    if (!active) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!a || (a.target && a.target !== '_self') || a.hasAttribute('download')) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      e.preventDefault();
      e.stopPropagation();
      let path = url.pathname;
      if (BASE && path.startsWith(BASE)) path = path.slice(BASE.length) || '/';
      void ask().then((ok) => { if (ok) { activeRef.current = false; navigate(path + url.search + url.hash); } });
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    document.addEventListener('click', onClick, true);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('click', onClick, true);
    };
  }, [active, ask, navigate]);

  return useCallback(async (go: () => void) => {
    if (!activeRef.current || (await ask())) { activeRef.current = false; go(); }
  }, [ask]);
}

// ---------------------------------------------------------------- actions
/** "Sam earned +€0.50, +10 points and “Pizza night”" — exactly what approving pays (switched-off kinds left out). */
export function earnedSentence(i: TaskInstance, name: string, currency: string, shown?: Shown): string {
  const parts = rewardParts(i, currency, shown).map((p) => p.prose);
  return parts.length ? `${name} earned ${joinWords(parts)}` : `Nice work, ${name}`;
}

/** Approve, send back and excuse with the toasts, refresh and stale-handling the UX spec asks for. */
export function useTaskActions(onChanged: () => void) {
  const { refresh, me, membersById, family, isManager } = useApp();
  const { time, points } = useTaskFeatures();
  const toast = useToast();
  const changedRef = useRef(onChanged);
  useEffect(() => { changedRef.current = onChanged; });
  const currency = family?.currency ?? 'EUR';
  const kidCopy = me?.role === 'kid';

  return useMemo(() => {
    const shown: Shown = { time, points };
    const nameOf = (id: string) => membersById[id]?.display_name ?? 'them';
    const after = async () => {
      await refresh().catch(() => undefined);
      changedRef.current();
    };
    const fail = async (e: unknown, stale: string) => {
      const err = toAppError(e);
      toast.show(err.code === 'wrong_status' ? stale : friendlyError(e), 'error');
      // Stale task, or a parent just switched this part off: re-load so the screen catches up.
      if (err.code === 'wrong_status' || err.code === 'feature_off') await after();
    };
    return {
      async approve(i: TaskInstance, note?: string | null): Promise<boolean> {
        try {
          await api.decideTask(i.id, true, note?.trim() || null);
        } catch (e) {
          await fail(e, 'Someone already checked this.');
          return false;
        }
        const earned = earnedSentence(i, nameOf(i.assignee_id), currency, shown);
        toast.show(kidCopy ? `Great! ${earned} ✨` : `Approved. ${earned} ✨`, 'success');
        await after();
        return true;
      },
      async sendBack(i: TaskInstance, note: string): Promise<boolean> {
        try {
          await api.decideTask(i.id, false, note.trim());
        } catch (e) {
          await fail(e, 'Someone already checked this.');
          return false;
        }
        toast.show(`Sent back to ${nameOf(i.assignee_id)}`, 'success');
        await after();
        return true;
      },
      async excuse(i: TaskInstance, note: string): Promise<boolean> {
        if (!isManager) return false;
        try {
          await api.excuseTask(i.id, note.trim() || null);
        } catch (e) {
          await fail(e, 'Someone already did this.');
          return false;
        }
        const back = i.status === 'missed' ? penaltyParts(i, currency, shown).map((p) => p.prose.replace(/^−/, '')) : [];
        toast.show(back.length
          ? `Excused. ${joinWords(back)} given back to ${nameOf(i.assignee_id)}`
          : `Excused for ${nameOf(i.assignee_id)}`, 'success');
        await after();
        return true;
      },
    };
  }, [refresh, membersById, currency, kidCopy, toast, isManager, time, points]);
}
