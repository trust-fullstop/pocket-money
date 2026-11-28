// Test helpers: a fresh PGlite with the real migrations, and an RPC caller that goes through
// the same pgRpc() the in-browser demo uses (role `authenticated`, auth.uid(), fake clock).
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { expect } from 'vitest';
import { orderSqlFiles, pgRpc } from '../src/lib/backend/pgcall';
import { AppError } from '../src/lib/errors';
import { EVERYTHING, type Features } from '../src/lib/types';
import { LESSONS } from '../src/features/help/learn/lessons';
import type { LessonCtx } from '../src/features/help/learn/types';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), 'utf8');

/**
 * SQL files in the exact order the in-browser demo loads them (orderSqlFiles from pgcall.ts:
 * 00_shim, migrations without `@supabase-only`, then the other pglite files). Without `seed`
 * the demo seed is left out.
 */
export function sqlFiles(opts: { seed?: boolean } = {}): { name: string; sql: string }[] {
  const all: Record<string, string> = {};
  for (const dir of ['migrations', 'pglite']) {
    for (const f of readdirSync(join(ROOT, 'supabase', dir)).filter((x) => x.endsWith('.sql'))) {
      if (!opts.seed && f.includes('demo_seed')) continue;
      all[`/supabase/${dir}/${f}`] = read('supabase', dir, f);
    }
  }
  const byContent = new Map(Object.entries(all).map(([k, v]) => [v, k]));
  return orderSqlFiles(all).map((sql) => ({ name: byContent.get(sql) ?? '?', sql }));
}

export async function makeDb(opts: { seed?: boolean; seedNow?: string } = {}): Promise<PGlite> {
  const db = new PGlite({ extensions: { pgcrypto } });
  if (opts.seedNow) await db.query(`select set_config('app.seed_now', $1, false)`, [opts.seedNow]);
  for (const f of sqlFiles(opts)) {
    try {
      await db.exec(f.sql);
    } catch (e: any) {
      throw new Error(`${f.name}: ${e?.message ?? e}${e?.position ? ` (at char ${e.position})` : ''}${e?.where ? `\n${e.where}` : ''}`);
    }
  }
  return db;
}

export type Rpc = <T = any>(fn: string, args?: Record<string, unknown>) => Promise<T>;

/** A mutable clock shared by all callers of a test (ISO string or null = real time). */
export const clock = { now: null as string | null };

export function as(db: PGlite, userId: string | null): Rpc {
  return <T = any>(fn: string, args: Record<string, unknown> = {}) =>
    pgRpc<T>(db, fn, args, { userId, fakeNow: clock.now });
}

export const uid = () => randomUUID();

export async function expectCode(p: Promise<unknown>, code: string, detail?: string) {
  let err: unknown = null;
  try { await p; } catch (e) { err = e; }
  expect(err, `expected error ${code}`).toBeInstanceOf(AppError);
  expect((err as AppError).code, (err as AppError).message).toBe(code);
  if (detail !== undefined) expect((err as AppError).detail).toBe(detail);
}

/** Run raw SQL as a given database role (for perimeter tests). */
export async function asRole(db: PGlite, role: string, sql: string, userId: string | null = null) {
  return db.transaction(async (tx) => {
    await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [userId ?? '']);
    await tx.exec(`set local role ${role}`);
    return tx.query(sql);
  });
}

export interface Person { uid: string; id: string; rpc: Rpc }
/** A test family: `familyId`, `owner` and one Person per extra name passed to makeFamily. */
export type Fam = { familyId: string; owner: Person } & Record<string, Person>;

/**
 * Create a family whose owner is "Owner" and add extra members, each with its own login.
 * people: { name: role }
 * New families "start small" (START_SMALL); test families switch every feature on (EVERYTHING, so `ask` stays
 * off) right after create_family, so the domain tests keep their meaning. Pass `features` to override.
 */
export async function makeFamily(db: PGlite, people: Record<string, string>, familyName = 'Test Family', tz = 'Europe/Amsterdam',
  features: Partial<Features> = EVERYTHING): Promise<Fam> {
  const ownerUid = uid();
  const ownerRpc = as(db, ownerUid);
  const r = await ownerRpc<{ family_id: string; member_id: string }>('create_family',
    { p_family_name: familyName, p_my_name: 'Owner', p_avatar: '👨', p_timezone: tz, p_currency: 'EUR' });
  if (Object.keys(features).length) await ownerRpc('update_family', { p_patch: { settings: { features } } });
  const fam = { familyId: r.family_id, owner: { uid: ownerUid, id: r.member_id, rpc: ownerRpc } } as unknown as Fam;
  for (const [name, role] of Object.entries(people)) {
    const added = await ownerRpc<{ member_id: string; invite: { token: string } }>('add_member', { p_name: name, p_role: role });
    const u = uid();
    const rpc = as(db, u);
    const red = await rpc<{ ok: boolean }>('redeem_invite', { p_code: added.invite.token, p_label: 'test' });
    expect(red.ok).toBe(true);
    fam[name] = { uid: u, id: added.member_id, rpc };
  }
  return fam;
}

/** Superuser query helper (bypasses the RPC perimeter, for assertions only). */
export async function q<T = any>(db: PGlite, sql: string, params: unknown[] = []): Promise<T[]> {
  return (await db.query<T>(sql, params)).rows;
}

export async function balance(db: PGlite, memberId: string, pot: string): Promise<number> {
  const r = await q<{ b: number }>(db, `select coalesce(sum(amount),0)::int as b from public.transactions where member_id = $1 and pot = $2`, [memberId, pot]);
  return r[0].b;
}

/** A reader for rendering lesson quizzes (the right answers don't depend on it; tests/lesson_bank.test.ts checks). */
const QUIZ_CTX: LessonCtx = {
  m: (c) => `€${c / 100}`, currency: 'EUR', second: null, on: () => true, settings: {}, isKid: true, name: 'Anna',
  allowanceCents: 0, allowancePeriod: null,
};

/** The right quiz answers of a tracked lesson, rendered like the app does (what LessonPage sends to finish_lesson). */
export function quizAnswers(lesson: string): number[] {
  const l = LESSONS.find((x) => x.id === lesson);
  return l?.quiz ? l.quiz(QUIZ_CTX).map((x) => x.answer) : [];
}

/** finish_lesson's arguments with the right quiz answers. */
export const finishArgs = (lesson: string) => ({ p_lesson: lesson, p_answers: quizAnswers(lesson) });
