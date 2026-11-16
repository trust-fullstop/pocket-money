// Demo backend: the real SQL (supabase/migrations + supabase/pglite) running in the browser via PGlite,
// persisted in IndexedDB. Rebuilt automatically whenever the SQL changes.
import type { PGlite } from '@electric-sql/pglite';
import { AppError } from '../errors';
import type { Backend } from './index';
import { clearArgTypeCache, orderSqlFiles, pgRpc } from './pgcall';

const SQL = import.meta.glob<string>(['/supabase/migrations/*.sql', '/supabase/pglite/*.sql'], {
  query: '?raw', import: 'default', eager: true,
});

export const DEMO_DAD = '00000000-0000-4000-8000-000000000001';
const DATA_DIR = 'idb://pocket-money-demo';
const UID_KEY = 'pm.demo.uid';
const OFFSET_KEY = 'pm.demo.offset_ms';

function uuid(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** cyrb53: small, fast string hash (no crypto.subtle needed, works on plain http too). */
function hash(str: string): string {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36) + ':' + str.length;
}

const files = orderSqlFiles(SQL);
const SQL_HASH = hash(files.join('\n-- next file --\n'));

async function wipe(db: PGlite) {
  await db.exec(`
    drop schema if exists public cascade;
    drop schema if exists app cascade;
    drop schema if exists auth cascade;
    drop schema if exists extensions cascade;
    create schema public authorization pg_database_owner;
    grant usage on schema public to public;`);
  clearArgTypeCache(db);
}

async function build(db: PGlite) {
  for (const sql of files) await db.exec(sql);
  await db.exec(`
    create table if not exists public.demo_meta (hash text not null, built_at timestamptz not null default now());
    create table if not exists public.demo_photos (path text primary key, mime text not null, data bytea not null);`);
  await db.query('insert into public.demo_meta(hash) values ($1)', [SQL_HASH]);
  clearArgTypeCache(db);
}

async function currentHash(db: PGlite): Promise<string | null> {
  try {
    const r = await db.query<{ hash: string }>('select hash from public.demo_meta order by built_at desc limit 1');
    return r.rows[0]?.hash ?? null;
  } catch {
    return null;
  }
}

async function open(): Promise<PGlite> {
  const [{ PGlite }, { pgcrypto }] = await Promise.all([
    import('@electric-sql/pglite'),
    import('@electric-sql/pglite/contrib/pgcrypto'),
  ]);
  let db: PGlite;
  try {
    db = new PGlite(DATA_DIR, { extensions: { pgcrypto } });
    await db.waitReady;
  } catch {
    // IndexedDB unavailable (e.g. some private modes): fall back to an in-memory database.
    db = new PGlite({ extensions: { pgcrypto } });
    await db.waitReady;
  }
  if ((await currentHash(db)) !== SQL_HASH) {
    await wipe(db);
    await build(db);
  }
  return db;
}

let dbPromise: Promise<PGlite> | null = null;
function getDb(): Promise<PGlite> {
  dbPromise ??= open().catch((e) => { dbPromise = null; throw e; });
  return dbPromise;
}

const offset = () => Number(localStorage.getItem(OFFSET_KEY) || 0) || 0;
const fakeNow = () => (offset() ? new Date(Date.now() + offset()).toISOString() : null);

export function createDemoBackend(): Backend {
  const photoUrls = new Map<string, Promise<string>>();
  let sessionPromise: Promise<string> | null = null;

  const ensureSession = (): Promise<string> => {
    const existing = localStorage.getItem(UID_KEY);
    if (existing) return Promise.resolve(existing);
    sessionPromise ??= (async () => {
      const db = await getDb();
      const seeded = await db.query('select 1 from public.member_logins where user_id = $1', [DEMO_DAD]);
      const uid = seeded.rows.length ? DEMO_DAD : uuid();
      localStorage.setItem(UID_KEY, uid);
      return uid;
    })().finally(() => { sessionPromise = null; });
    return sessionPromise;
  };

  return {
    mode: 'demo',

    async rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
      const db = await getDb();
      return pgRpc<T>(db, fn, args, { userId: localStorage.getItem(UID_KEY), fakeNow: fakeNow() });
    },

    async userId() {
      return localStorage.getItem(UID_KEY);
    },

    ensureSession,

    async signOut() {
      // A fresh, unlinked "anonymous" user — like a new phone.
      localStorage.setItem(UID_KEY, uuid());
    },

    async signInWithGoogle() { throw new AppError('not_in_demo'); },
    async linkGoogle() { throw new AppError('not_in_demo'); },
    async identities() { return []; },

    async uploadPhoto(path: string, blob: Blob) {
      const db = await getDb();
      const data = new Uint8Array(await blob.arrayBuffer());
      await db.query(
        `insert into public.demo_photos(path, mime, data) values ($1, $2, $3)
         on conflict (path) do update set mime = excluded.mime, data = excluded.data`,
        [path, blob.type || 'image/jpeg', data]);
    },

    async deleteFamilyPhotos(familyId: string) {
      const db = await getDb();
      await db.query(`delete from public.demo_photos where path like $1`, [`${familyId}/%`]);
      photoUrls.clear();
    },

    async photoUrl(path: string) {
      const hit = photoUrls.get(path);
      if (hit) return hit;
      const p = (async () => {
        const db = await getDb();
        const r = await db.query<{ mime: string; data: Uint8Array }>('select mime, data from public.demo_photos where path = $1', [path]);
        const row = r.rows[0];
        if (!row) throw new AppError('not_found', 'photo');
        return URL.createObjectURL(new Blob([row.data as BlobPart], { type: row.mime }));
      })();
      photoUrls.set(path, p);
      p.catch(() => photoUrls.delete(path));
      return p;
    },

    demo: {
      async people() {
        const db = await getDb();
        const r = await db.query<{ user_id: string; member_id: string; display_name: string; avatar: string; role: string }>(`
          select distinct on (m.id) l.user_id::text as user_id, m.id::text as member_id, m.display_name, m.avatar, m.role,
                 f.name as family_name, f.created_at as family_created
            from public.member_logins l
            join public.members m on m.id = l.member_id and m.active
            join public.families f on f.id = m.family_id
           order by m.id, l.last_seen_at desc`);
        const rank: Record<string, number> = { owner: 1, parent: 2, step_parent: 3, guardian: 4, grandparent: 5, kid: 6 };
        return r.rows.sort((a, b) => (rank[a.role] ?? 9) - (rank[b.role] ?? 9) || a.display_name.localeCompare(b.display_name));
      },
      async switchTo(userId: string) {
        localStorage.setItem(UID_KEY, userId);
      },
      async reset() {
        const db = await getDb();
        // App locks are stored per member id on this device; demo members get new ids after a rebuild.
        const old = await db.query<{ id: string }>('select id from public.members').catch(() => ({ rows: [] as { id: string }[] }));
        for (const { id } of old.rows) localStorage.removeItem(`pm.lock.${id}`);
        try {
          await wipe(db);
          await build(db);
        } catch (e) {
          // Last resort: throw the whole IndexedDB database away; the next load rebuilds it.
          await db.close().catch(() => undefined);
          dbPromise = null;
          await new Promise<void>((resolve) => {
            const req = indexedDB.deleteDatabase('/pglite/pocket-money-demo');
            req.onsuccess = req.onerror = req.onblocked = () => resolve();
          });
          throw e;
        }
        for (const url of photoUrls.values()) url.then((u) => URL.revokeObjectURL(u), () => undefined);
        photoUrls.clear();
        localStorage.removeItem(UID_KEY);
        localStorage.removeItem(OFFSET_KEY);
        localStorage.removeItem('pm.tick.at');
      },
      async advance(hours: number) {
        const next = offset() + Math.round(hours * 3_600_000);
        localStorage.setItem(OFFSET_KEY, String(next));
        return new Date(Date.now() + next).toISOString();
      },
    },
  };
}

/** Demo clock offset in ms (0 = real time). */
export const demoOffsetMs = offset;
