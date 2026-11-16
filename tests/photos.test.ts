import { beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { clock, makeDb, makeFamily, type Fam } from './helpers';

// Storage access rules (used by Supabase Storage policies): who may write and read which photo paths.
describe('photo access', () => {
  let db: PGlite;
  let f: Fam;
  let other: Fam;
  const path = (folder: string, fam = f) => `${fam.familyId}/${folder}/x.jpg`;
  const canWrite = (who: keyof Fam & string, p: string) => (f[who] as any).rpc('can_write_photo', { p_path: p });
  const canRead = (who: keyof Fam & string, p: string) => (f[who] as any).rpc('can_read_photo', { p_path: p });

  beforeAll(async () => {
    clock.now = null;
    db = await makeDb();
    f = await makeFamily(db, { Mum: 'parent', Oma: 'grandparent', Sam: 'kid', Mia: 'kid' });
    other = await makeFamily(db, { Zed: 'kid' }, 'Other Family');
  });

  it('kids write only their own folder; managers write any folder of their family', async () => {
    expect(await canWrite('Sam', path(f.Sam.id))).toBe(true);
    expect(await canWrite('Sam', path(f.Mia.id))).toBe(false);
    expect(await canWrite('Mum', path(f.Mia.id))).toBe(true);
    expect(await canWrite('Mum', path(other.Zed.id, other))).toBe(false);
  });

  it('grandparents may write into kids\' folders (gift photos) but not adults\' folders', async () => {
    expect(await canWrite('Oma', path(f.Sam.id))).toBe(true);
    expect(await canWrite('Oma', path(f.Mum.id))).toBe(false);
    expect(await canWrite('Oma', path(other.Zed.id, other))).toBe(false);
  });

  it('a gift photo is readable by the kid and by the grandparent who attached it, not by a sibling', async () => {
    const p = path(f.Sam.id).replace('x.jpg', 'gift.jpg');
    await f.Oma.rpc('spot', { p: { member_id: f.Sam.id, direction: 'plus', cents: 200, reason: 'Well done', photo_path: p } });
    expect(await canRead('Sam', p)).toBe(true);
    expect(await canRead('Oma', p)).toBe(true);
    expect(await canRead('Mia', p)).toBe(false);
    expect(await canRead('Mum', p)).toBe(true);
    expect(await other.Zed.rpc('can_read_photo', { p_path: p })).toBe(false);
  });
});
