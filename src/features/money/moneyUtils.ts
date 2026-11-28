// Small non-UI helpers for the Money feature: data loading with error codes, formatting words, goal ETA, errors.
import { useCallback, useEffect, useRef, useState } from 'react';
import { friendlyError, toAppError, type ErrorCode } from '../../lib/errors';
import { amount, formatWhen, minutes, money, points, timeAgo } from '../../lib/format';
import type { Currency, Family, Loan, Member } from '../../lib/types';
import { isManager } from '../../lib/types';

export interface Loaded<T> {
  data: T | undefined;
  /** True while there is no data yet (first load or after deps changed). */
  loading: boolean;
  /** True while a silent reload runs. */
  refreshing: boolean;
  error: string | null;
  code: ErrorCode | null;
  reload: () => Promise<void>;
}

/** Like useLoad() but keeps the error code (to tell "not allowed" from "no connection"). */
export function useData<T>(fn: () => Promise<T>, deps: readonly unknown[]): Loaded<T> {
  const [data, setData] = useState<T | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<{ msg: string; code: ErrorCode } | null>(null);
  const fnRef = useRef(fn);
  const seq = useRef(0);
  useEffect(() => { fnRef.current = fn; });

  const run = useCallback(async (silent: boolean) => {
    const id = ++seq.current;
    if (silent) setRefreshing(true); else { setLoading(true); setData(undefined); }
    try {
      const d = await fnRef.current();
      if (id === seq.current) { setData(d); setError(null); }
    } catch (e) {
      if (id === seq.current) setError({ msg: friendlyError(e), code: toAppError(e).code });
    } finally {
      if (id === seq.current) { setLoading(false); setRefreshing(false); }
    }
  }, []);

  useEffect(() => {
    fnRef.current = fn;
    run(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  const reload = useCallback(() => run(true), [run]);
  return { data, loading, refreshing, error: error?.msg ?? null, code: error?.code ?? null, reload };
}

/** True once `on` has stayed true for `ms` (skeletons appear after 150 ms to avoid a flash). */
export function useDelayed(on: boolean, ms = 150): boolean {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!on) return;
    const t = window.setTimeout(() => setShown(true), ms);
    return () => { window.clearTimeout(t); setShown(false); };
  }, [on, ms]);
  return on && shown;
}

/** Signed amount in words for screen readers: "plus €2.50", "minus 15 min", "plus 10 points". */
export function deltaWords(currency: Currency, value: number, cur: string): string {
  const abs = Math.abs(value);
  const body = currency === 'points' ? `${abs} point${abs === 1 ? '' : 's'}` : amount(currency, abs, cur);
  return `${value < 0 ? 'minus' : 'plus'} ${body}`;
}

/** "10 points" (prose) */
export const pointsWords = (n: number) => `${n} point${Math.abs(n) === 1 ? '' : 's'}`;

/** Money in prose: drops ".00" ("€2", "€2.50"). */
export const moneyWords = (cents: number, cur: string) => money(cents, cur, { whole: true });

export interface GoalProgress { reached: boolean; weeks: number | null; left: number }

/** Goal ETA: weeks = ceil((target − savings) / average weekly savings); null when the kid isn't saving yet. */
export function goalProgress(target: number, savings: number, avgWeekly: number): GoalProgress {
  const left = Math.max(0, target - Math.max(0, savings));
  if (left === 0) return { reached: true, weeks: 0, left };
  return { reached: false, weeks: avgWeekly > 0 ? Math.ceil(left / avgWeekly) : null, left };
}

/** "about 6 weeks at your pace" / "Save a little each week to get there" / "You did it! 🎉 …" */
export function goalEtaText(p: GoalProgress, self: boolean, name: string): string {
  if (p.reached) return self ? 'You did it! 🎉 Ask a grown-up to take it out' : `${name} has saved enough! 🎉`;
  if (p.weeks == null) return self ? 'Save a little each week to get there' : `${name} isn't saving each week yet`;
  const pace = self ? 'at your pace' : `at ${name}'s pace`;
  if (p.weeks <= 1) return `about 1 week to go ${pace}`;
  return `about ${p.weeks} weeks to go ${pace}`;
}

/** May `me` see `m`'s money (mirrors app.can_see_money)? */
export function canSeeMoney(me: Member | null, m: Pick<Member, 'id'> | null, family: Family | null): boolean {
  if (!me || !m || !family) return false;
  if (me.id === m.id || isManager(me.role)) return true;
  return me.role === 'grandparent' && family.settings?.grandparents_see_money !== false;
}

/** Friendly error for money actions, with the next step where the generic text has none. */
export function moneyError(e: unknown, insufficient?: string): string {
  const a = toAppError(e);
  if (a.code === 'insufficient') return insufficient ?? "There isn't enough left for this. Say no or wait.";
  if (a.code === 'wrong_status') return 'Someone else already did this.';
  if (a.code === 'invalid' && a.detail === 'too_many_requests') return 'You already have 5 requests waiting. Wait for a grown-up first.';
  if (a.code === 'invalid' && a.detail === 'too_many_goals') return 'That is a lot of goals! Finish or remove one first.';
  if (a.code === 'invalid' && a.detail === 'too_many_targets') return 'There are already 20 targets. Remove one first.';
  if (a.code === 'invalid' && a.detail === 'loan_open') return 'There is already a loan. Pay that one back first.';
  if (a.code === 'invalid' && a.detail === 'too_many_loans') return 'You asked for a loan 3 times this week. Wait a few days first.';
  if (a.code === 'invalid' && a.detail === 'more_than_owed') return 'That is more than is still to pay.';
  if (a.code === 'invalid' && a.detail === 'installment') return 'Pick an amount per pocket money between 1 cent and the whole loan.';
  if (a.code === 'invalid' && a.detail === 'fee') return 'The fee can be at most the amount of the loan.';
  if (a.code === 'invalid' && a.detail === 'purpose') return 'Say what the loan is for (up to 80 letters).';
  if (a.code === 'not_allowed' && a.detail === 'use_loan_tools') return 'Undo loan repayments from the loan card.';
  if (a.code === 'not_allowed' && a.detail === 'forgiven') return 'This loan was forgiven, so its repayments stay.';
  if (a.code === 'invalid' && a.detail === 'too_many_waiting') return 'You already have 3 proud moments waiting. Wait for a grown-up first.';
  if (a.code === 'invalid' && a.detail === 'too_many_today') return 'That’s 5 proud moments today! Show the next one tomorrow.';
  if (a.code === 'invalid' && a.detail === 'what') return 'Say what you did (up to 200 letters).';
  if (a.code === 'invalid' && a.detail === 'photo_path') return 'The photo didn’t work. Try another one, or send without a photo.';
  return friendlyError(e);
}

/** The server says this part of the app is switched off (Family → Features) — our copy of the switches is old. */
export const isFeatureOff = (e: unknown) => toAppError(e).code === 'feature_off';

/** Should this error trigger a refetch? (Someone else already handled it, or a part was switched off meanwhile.) */
export const isStale = (e: unknown) => {
  const c = toAppError(e).code;
  return c === 'wrong_status' || c === 'not_found' || c === 'feature_off';
};

/** A loan still asked for, offered or being paid back (at most one per kid). */
export const isOpenLoan = (l: Pick<Loan, 'status'>) => l.status === 'requested' || l.status === 'offered' || l.status === 'active';

/** Close a sheet when the server says its part was switched off meanwhile; true when handled. */
export async function closedIfOff(e: unknown, toast: { show: (msg: string, tone: 'error') => void }, onClose: () => void,
  onChanged: () => Promise<void>): Promise<boolean> {
  if (!isFeatureOff(e)) return false;
  toast.show(moneyError(e), 'error');
  onClose();
  await onChanged();
  return true;
}

/** Cut a string to n characters (for API limits) without breaking emoji surrogate pairs. */
export function clip(s: string, n: number): string {
  const chars = Array.from(s.trim());
  return chars.length > n ? chars.slice(0, n).join('') : chars.join('');
}

/** A row the Money school paid (a lesson reward or lesson XP): shown as from "Money school 🎓", not the kid or parent. */
export const fromMoneySchool = (tx: { source_type: string | null }): boolean => tx.source_type === 'lesson';

/** Who made a change: "You", the member's name, "Automatic" (timed rules) or "Someone" (removed member). */
export function whoName(createdBy: string | null, membersById: Record<string, Member>, viewerId: string | null | undefined): string {
  if (!createdBy) return 'Automatic';
  if (createdBy === viewerId) return 'You';
  return membersById[createdBy]?.display_name ?? 'Someone';
}

/** "12 min ago" for the last 24 h, else "Tue 17 Nov 18:02" / "Yesterday 18:02" in the family time zone. */
export function whenText(iso: string, tz: string, now: Date): string {
  const age = now.getTime() - new Date(iso).getTime();
  if (age >= 0 && age < 86_400_000) return timeAgo(iso, now);
  return formatWhen(iso, tz, now);
}

/** "€5 · 15 min · 10 XP" (only the parts above 0; `sign` adds a "+"). */
export function rewardWords(r: { cents: number; minutes: number; points: number }, cur: string, sign = false): string {
  const plus = sign ? '+' : '';
  return [
    r.cents > 0 && plus + money(r.cents, cur, { whole: true }),
    r.minutes > 0 && plus + minutes(r.minutes),
    r.points > 0 && plus + points(r.points),
  ].filter(Boolean).join(' · ');
}

/** Re-load quietly whenever `version` changes (pass the app state: it changes after every refresh). */
export function useReloadOn(version: unknown, reload: () => Promise<void>) {
  const seen = useRef(version);
  useEffect(() => {
    if (seen.current === version) return;
    seen.current = version;
    void reload();
  }, [version, reload]);
}