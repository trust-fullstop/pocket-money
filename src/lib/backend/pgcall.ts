// Shared PGlite RPC caller used by the in-browser demo backend AND the Vitest tests,
// so both exercise the SQL exactly the way PostgREST would: as role `authenticated`,
// with auth.uid() set, inside one transaction per call.
import type { PGliteInterface, Transaction } from '@electric-sql/pglite';
import { toAppError } from '../errors';

type Db = PGliteInterface;
type ArgTypes = Map<string, Map<string, string>>;

const cache = new WeakMap<object, ArgTypes>();

async function argTypes(db: Db): Promise<ArgTypes> {
  const hit = cache.get(db);
  if (hit) return hit;
  const r = await db.query<{ proname: string; argnames: string[] | null; argtypes: string[] }>(`
    select p.proname, p.proargnames as argnames,
           array(select format_type(t, null) from unnest(p.proargtypes::oid[]) with ordinality u(t, i) order by i) as argtypes
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'`);
  const map: ArgTypes = new Map();
  for (const row of r.rows) {
    const m = new Map<string, string>();
    (row.argnames ?? []).forEach((name, i) => { if (name) m.set(name, row.argtypes[i]); });
    map.set(row.proname, m);
  }
  cache.set(db, map);
  return map;
}

export function clearArgTypeCache(db: Db) { cache.delete(db); }

export interface CallOptions { userId: string | null; fakeNow?: string | null }

export async function pgRpc<T>(db: Db, fn: string, args: Record<string, unknown>, opts: CallOptions): Promise<T> {
  if (!/^[a-z_][a-z0-9_]*$/.test(fn)) throw new Error('bad function name');
  const types = await argTypes(db);
  const sig = types.get(fn);
  if (!sig) throw toAppError({ message: 'not_found', detail: 'function ' + fn });
  const parts: string[] = [];
  const values: unknown[] = [];
  for (const [name, value] of Object.entries(args)) {
    if (value === undefined) continue;
    const t = sig.get(name);
    if (!t) throw new Error(`Unknown param ${name} for ${fn}`);
    values.push(value === null ? null : t === 'jsonb' || t === 'json' ? JSON.stringify(value) : Array.isArray(value) ? value : String(value));
    parts.push(`${name} => $${values.length}::${t}`);
  }
  try {
    return await db.transaction(async (tx: Transaction) => {
      await tx.query(`select set_config('request.jwt.claim.sub', $1, true), set_config('app.fake_now', $2, true)`,
        [opts.userId ?? '', opts.fakeNow ?? '']);
      await tx.exec('set local role authenticated');
      const r = await tx.query<{ r: T }>(`select to_jsonb(public.${fn}(${parts.join(', ')})) as r`, values);
      return r.rows[0]?.r as T;
    });
  } catch (e) {
    throw toAppError(e);
  }
}

/** SQL files in load order. Files whose first line contains `@supabase-only` are skipped. */
export function orderSqlFiles(files: Record<string, string>): string[] {
  const keys = Object.keys(files);
  const shim = keys.filter((k) => k.includes('/pglite/00_')).sort();
  const migrations = keys.filter((k) => k.includes('/migrations/')).sort()
    .filter((k) => !files[k].split('\n', 1)[0].includes('@supabase-only'));
  const after = keys.filter((k) => k.includes('/pglite/') && !k.includes('/pglite/00_')).sort();
  return [...shim, ...migrations, ...after].map((k) => files[k]);
}
