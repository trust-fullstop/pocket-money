// "What we need" (migration 20261116001900): adults note what a child needs; kids never see any of it.
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { as, clock, expectCode, makeDb, makeFamily, q, uid, type Fam } from './helpers';
import { NEED_DEFAULT_OCCASIONS, type Member, type Need } from '../src/lib/types';
import { describeAudit } from '../src/features/family/audit';

let db: PGlite;
beforeAll(async () => { db = await makeDb(); });
afterEach(() => { clock.now = null; });

const RPCS: [string, string][] = [
  ['list_needs', 'p_status text'],
  ['list_need_occasions', ''],
  ['add_need', 'p_member uuid, p_item text, p_occasion text, p_details text'],
  ['update_need', 'p_id uuid, p_item text, p_occasion text, p_details text'],
  ['claim_need', 'p_id uuid'],
  ['release_need', 'p_id uuid'],
  ['complete_need', 'p_id uuid, p_note text'],
  ['reopen_need', 'p_id uuid'],
  ['cancel_need', 'p_id uuid'],
];
const sig = (args: string) => args.split(',').map((a) => a.trim().split(' ')[1]).filter(Boolean).join(', ');

describe('What we need', () => {
  let f: Fam;
  let shoes: Need;

  it('an adult adds a need for a kid; it starts open', async () => {
    f = await makeFamily(db, { Sam: 'kid', Mia: 'kid', Mum: 'parent', Oma: 'grandparent', Aunt: 'grandparent', Anna: 'step_parent' });
    clock.now = '2026-11-18T09:00:00Z';
    shoes = await f.Anna.rpc<Need>('add_need', {
      p_member: f.Sam.id, p_item: '  School   shoes ', p_occasion: 'new TERM', p_details: 'Size 5, black',
    });
    expect(shoes).toMatchObject({
      member_id: f.Sam.id, item: 'School shoes', occasion: 'New term', details: 'Size 5, black', status: 'open',
      created_by: f.Anna.id, claimed_by: null, done_by: null,
      can_edit: true, can_claim: true, can_release: false, can_complete: true, can_reopen: false, can_cancel: true,
    });
    const list = await f.Oma.rpc<Need[]>('list_needs');
    expect(list.map((n) => n.item)).toEqual(['School shoes']);
    // Oma didn't add it and isn't a manager: she can claim or buy it, not edit or cancel it.
    expect(list[0]).toMatchObject({ can_edit: false, can_claim: true, can_complete: true, can_cancel: false });
    await expectCode(f.Oma.rpc('update_need', { p_id: shoes.id, p_item: 'Shoes', p_occasion: 'Anytime', p_details: null }), 'not_allowed');
    await expectCode(f.Oma.rpc('cancel_need', { p_id: shoes.id }), 'not_allowed');
  });

  it('a grandparent claims; only the claimer or a manager can then buy or release it', async () => {
    clock.now = '2026-11-18T10:00:00Z';
    const claimed = await f.Oma.rpc<Need>('claim_need', { p_id: shoes.id });
    expect(claimed).toMatchObject({ status: 'claimed', claimed_by: f.Oma.id, can_release: true, can_complete: true, can_claim: false });
    expect(claimed.claimed_at).toBeTruthy();

    // Another adult who is not a manager (an aunt) can't buy or release Oma's claim…
    await expectCode(f.Aunt.rpc('complete_need', { p_id: shoes.id }), 'not_allowed');
    await expectCode(f.Aunt.rpc('release_need', { p_id: shoes.id }), 'not_allowed');
    const auntView = (await f.Aunt.rpc<Need[]>('list_needs'))[0];
    expect(auntView).toMatchObject({ status: 'claimed', can_claim: false, can_complete: false, can_release: false });
    // …and a claimed need can't be edited any more (not even by a manager).
    await expectCode(f.Mum.rpc('update_need', { p_id: shoes.id, p_item: 'Shoes', p_occasion: 'Anytime' }), 'wrong_status', 'claimed');
    // A manager may release it, and the claimer can take it again.
    const mumView = (await f.Mum.rpc<Need[]>('list_needs'))[0];
    expect(mumView).toMatchObject({ can_release: true, can_complete: true, can_cancel: true });
    expect((await f.Mum.rpc<Need>('release_need', { p_id: shoes.id })).status).toBe('open');
    await f.Oma.rpc('claim_need', { p_id: shoes.id });
  });

  it('the claimer marks it bought: done has who and when, and the note', async () => {
    clock.now = '2026-11-19T13:05:00Z';
    const done = await f.Oma.rpc<Need>('complete_need', { p_id: shoes.id, p_note: 'Bought at the mall, size 5' });
    expect(done).toMatchObject({ status: 'done', done_by: f.Oma.id, done_note: 'Bought at the mall, size 5', claimed_by: f.Oma.id, can_reopen: true });
    expect(new Date(done.done_at!).toISOString()).toBe('2026-11-19T13:05:00.000Z');
    expect(await f.Mum.rpc<Need[]>('list_needs')).toEqual([]);
    const doneList = await f.Mum.rpc<Need[]>('list_needs', { p_status: 'done' });
    expect(doneList.map((n) => [n.item, n.done_by])).toEqual([['School shoes', f.Oma.id]]);
    expect(doneList[0].can_reopen).toBe(true);
    // The aunt didn't buy it and isn't a manager: no reopen.
    expect((await f.Aunt.rpc<Need[]>('list_needs', { p_status: 'done' }))[0].can_reopen).toBe(false);
    await expectCode(f.Aunt.rpc('reopen_need', { p_id: shoes.id }), 'not_allowed');
    await expectCode(f.Oma.rpc('complete_need', { p_id: shoes.id }), 'wrong_status', 'done');

    const audit = await f.owner.rpc<any[]>('list_audit');
    const needRows = audit.filter((a) => a.action.startsWith('need.')).map((a) => a.action);
    expect(needRows.sort()).toEqual(['need.add', 'need.claim', 'need.claim', 'need.done', 'need.release']);
    expect(audit.find((a) => a.action === 'need.done').details).toEqual(
      { need: shoes.id, member: f.Sam.id, item: 'School shoes', occasion: 'New term' });
  });

  it('reopen puts it back on the list and clears the claim and the purchase', async () => {
    const back = await f.Oma.rpc<Need>('reopen_need', { p_id: shoes.id });
    expect(back).toMatchObject({ status: 'open', claimed_by: null, claimed_at: null, done_by: null, done_at: null, done_note: null });
    // Anyone may mark an open need bought straight away.
    const done = await f.Aunt.rpc<Need>('complete_need', { p_id: shoes.id });
    expect(done).toMatchObject({ status: 'done', done_by: f.Aunt.id, done_note: null, claimed_by: null });
  });

  it('creator or manager edits while open, and cancels while open or claimed', async () => {
    const bag = await f.Aunt.rpc<Need>('add_need', { p_member: f.Mia.id, p_item: 'School bag', p_occasion: '' });
    expect(bag.occasion).toBe('Anytime');
    expect(bag.details).toBeNull();
    const edited = await f.Aunt.rpc<Need>('update_need', { p_id: bag.id, p_item: 'Blue school bag', p_occasion: 'birthday', p_details: ' Not pink ' });
    expect(edited).toMatchObject({ item: 'Blue school bag', occasion: 'Birthday', details: 'Not pink' });
    await f.Mum.rpc('update_need', { p_id: bag.id, p_item: 'Blue school bag', p_occasion: 'Birthday', p_details: '' });
    await f.Oma.rpc('claim_need', { p_id: bag.id });
    expect((await f.Aunt.rpc<Need>('cancel_need', { p_id: bag.id })).status).toBe('cancelled');
    expect((await f.Mum.rpc<Need[]>('list_needs')).find((n) => n.id === bag.id)).toBeUndefined();
    await expectCode(f.Aunt.rpc('claim_need', { p_id: bag.id }), 'wrong_status', 'cancelled');
    const all = await f.Mum.rpc<Need[]>('list_needs', { p_status: 'all' });
    expect(all.find((n) => n.id === bag.id)?.status).toBe('cancelled');
  });

  it('checks item, details, note and status', async () => {
    await expectCode(f.Mum.rpc('add_need', { p_member: f.Sam.id, p_item: '   ', p_occasion: 'Anytime' }), 'invalid', 'item');
    await expectCode(f.Mum.rpc('add_need', { p_member: f.Sam.id, p_item: 'x'.repeat(81), p_occasion: 'Anytime' }), 'invalid', 'item');
    await expectCode(f.Mum.rpc('add_need', { p_member: f.Sam.id, p_item: 'Pens', p_occasion: 'x'.repeat(41) }), 'invalid', 'occasion');
    await expectCode(f.Mum.rpc('add_need', { p_member: f.Sam.id, p_item: 'Pens', p_occasion: 'Anytime', p_details: 'x'.repeat(301) }), 'invalid', 'details');
    const pens = await f.Mum.rpc<Need>('add_need', { p_member: f.Sam.id, p_item: 'Pens', p_occasion: 'Anytime' });
    await expectCode(f.Mum.rpc('complete_need', { p_id: pens.id, p_note: 'x'.repeat(201) }), 'invalid', 'note');
    await expectCode(f.Mum.rpc('list_needs', { p_status: 'cancelled' }), 'invalid', 'status');
    await expectCode(f.Mum.rpc('claim_need', { p_id: uid() }), 'not_found', 'need');
    await f.Mum.rpc('cancel_need', { p_id: pens.id });
  });

  it('kids get not_allowed from every needs RPC', async () => {
    const n = await f.Mum.rpc<Need>('add_need', { p_member: f.Sam.id, p_item: 'Surprise bike', p_occasion: 'Christmas' });
    const calls: [string, Record<string, unknown>][] = [
      ['list_needs', {}],
      ['list_needs', { p_status: 'done' }],
      ['list_need_occasions', {}],
      ['add_need', { p_member: f.Sam.id, p_item: 'Sweets', p_occasion: 'Anytime' }],
      ['update_need', { p_id: n.id, p_item: 'Sweets', p_occasion: 'Anytime', p_details: null }],
      ['claim_need', { p_id: n.id }],
      ['release_need', { p_id: n.id }],
      ['complete_need', { p_id: n.id, p_note: null }],
      ['reopen_need', { p_id: n.id }],
      ['cancel_need', { p_id: n.id }],
    ];
    expect(new Set(calls.map((c) => c[0]))).toEqual(new Set(RPCS.map((r) => r[0])));
    for (const [fn, args] of calls) {
      await expectCode(f.Sam.rpc(fn, args), 'not_allowed');
      await expectCode(f.Mia.rpc(fn, args), 'not_allowed');
    }
    // Nothing changed.
    expect((await f.Mum.rpc<Need[]>('list_needs')).find((x) => x.id === n.id)?.status).toBe('open');
  });

  it('get_state says nothing about needs (not even a count)', async () => {
    for (const p of [f.Sam, f.Mum, f.Oma]) {
      const st = await p.rpc<any>('get_state');
      const json = JSON.stringify(st);
      expect(json).not.toContain('Surprise bike');
      expect(json).not.toContain('School shoes');
      expect(Object.keys(st.counts ?? {}).sort()).toEqual(['approvals', 'loans', 'my_requests', 'requests']);
      // The only mention is the switch itself.
      expect(st.family.settings.features.needs).toBe(true);
      delete st.family.settings.features.needs;
      expect(JSON.stringify(st)).not.toMatch(/need/i);
    }
  });

  it('only kids of the same family can have needs', async () => {
    const other = await makeFamily(db, { Leo: 'kid' }, 'Other Family');
    await expectCode(f.Mum.rpc('add_need', { p_member: other.Leo.id, p_item: 'Shoes', p_occasion: 'Anytime' }), 'not_found', 'member');
    await expectCode(f.Mum.rpc('add_need', { p_member: f.Oma.id, p_item: 'Shoes', p_occasion: 'Anytime' }), 'invalid', 'member');
    await expectCode(f.Mum.rpc('add_need', { p_member: uid(), p_item: 'Shoes', p_occasion: 'Anytime' }), 'not_found', 'member');
    // The other family can't see or touch our needs.
    expect(await other.owner.rpc<Need[]>('list_needs', { p_status: 'all' })).toEqual([]);
    await expectCode(other.owner.rpc('claim_need', { p_id: shoes.id }), 'not_found', 'need');
    await expectCode(other.owner.rpc('reopen_need', { p_id: shoes.id }), 'not_found', 'need');
    await expectCode(other.owner.rpc('cancel_need', { p_id: shoes.id }), 'not_found', 'need');
    // Someone without a family at all.
    await expectCode(as(db, uid())('list_needs'), 'not_member');
  });

  it('two people claiming at once: the second one hears wrong_status', async () => {
    const kit = await f.Mum.rpc<Need>('add_need', { p_member: f.Mia.id, p_item: 'Sports kit', p_occasion: 'New term' });
    const results = await Promise.allSettled([
      f.Oma.rpc('claim_need', { p_id: kit.id }),
      f.Aunt.rpc('claim_need', { p_id: kit.id }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const failed = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(failed.reason.code).toBe('wrong_status');
    const row = (await q<{ claimed_by: string }>(db, `select claimed_by from public.needs where id = $1`, [kit.id]))[0];
    expect([f.Oma.id, f.Aunt.id]).toContain(row.claimed_by);
    await expectCode(f.Oma.rpc('claim_need', { p_id: kit.id }), 'wrong_status', 'claimed');
  });

  it('occasions: the defaults first, then the family’s own A→Z, without case duplicates', async () => {
    await f.Mum.rpc('add_need', { p_member: f.Sam.id, p_item: 'Swim goggles', p_occasion: 'Summer camp' });
    const again = await f.Oma.rpc<Need>('add_need', { p_member: f.Mia.id, p_item: 'Sun hat', p_occasion: '  summer   CAMP ' });
    expect(again.occasion).toBe('Summer camp');
    await f.Oma.rpc('add_need', { p_member: f.Mia.id, p_item: 'Gift', p_occasion: 'Eid' });
    const occ = await f.Anna.rpc<string[]>('list_need_occasions');
    expect(occ).toEqual([...NEED_DEFAULT_OCCASIONS, 'Eid', 'Summer camp']);
    expect(NEED_DEFAULT_OCCASIONS).toEqual(['Anytime', 'New term', 'Birthday', 'Christmas']);
    // Another family doesn't see our occasions.
    const other = await makeFamily(db, { Kid: 'kid' }, 'Third Family');
    expect(await other.owner.rpc<string[]>('list_need_occasions')).toEqual([...NEED_DEFAULT_OCCASIONS]);
  });

  it('needs of a removed kid disappear from the lists', async () => {
    const g = await makeFamily(db, { Kid: 'kid', Dad: 'parent' }, 'Removal Family');
    await g.Dad.rpc('add_need', { p_member: g.Kid.id, p_item: 'Shoes', p_occasion: 'Anytime' });
    expect(await g.Dad.rpc<Need[]>('list_needs')).toHaveLength(1);
    await g.owner.rpc('remove_member', { p_member: g.Kid.id });
    expect(await g.Dad.rpc<Need[]>('list_needs')).toEqual([]);
  });

  it('feature off → feature_off for adults (kids still hear not_allowed)', async () => {
    const g = await makeFamily(db, { Kid: 'kid', Oma: 'grandparent' }, 'Switch Family', 'Europe/Amsterdam', { needs: false });
    for (const [fn, args] of [
      ['list_needs', {}], ['list_need_occasions', {}], ['add_need', { p_member: g.Kid.id, p_item: 'Shoes', p_occasion: 'Anytime' }],
      ['claim_need', { p_id: uid() }], ['complete_need', { p_id: uid() }],
    ] as [string, Record<string, unknown>][]) {
      await expectCode(g.owner.rpc(fn, args), 'feature_off', 'needs');
      await expectCode(g.Oma.rpc(fn, args), 'feature_off', 'needs');
      await expectCode(g.Kid.rpc(fn, args), 'not_allowed');
    }
  });

  it('is on by default for a brand-new family', async () => {
    const me = as(db, uid());
    await me('create_family',
      { p_family_name: 'Fresh', p_my_name: 'Me', p_avatar: '👩', p_timezone: 'Europe/Amsterdam', p_currency: 'EUR' });
    expect((await me<any>('get_state')).family.settings.features.needs).toBe(true);
    expect(await me<Need[]>('list_needs')).toEqual([]);
  });

  it('privileges: only signed-in users may call the RPCs; the helpers and the table are closed', async () => {
    for (const [fn, args] of RPCS) {
      const name = `public.${fn}(${sig(args)})`;
      const r = await q<{ anon: boolean; auth: boolean; pub: boolean }>(db,
        `select has_function_privilege('anon', $1, 'execute') as anon,
                has_function_privilege('authenticated', $1, 'execute') as auth,
                exists (select 1 from information_schema.routine_privileges
                         where grantee = 'PUBLIC' and routine_schema = 'public' and routine_name = $2) as pub`, [name, fn]);
      expect(r[0], name).toEqual({ anon: false, auth: true, pub: false });
    }
    const helpers = await q<{ name: string; auth: boolean; anon: boolean }>(db,
      `select p.oid::regprocedure::text as name,
              has_function_privilege('authenticated', p.oid, 'execute') as auth,
              has_function_privilege('anon', p.oid, 'execute') as anon
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'app' and (p.proname like 'need%' or p.proname in ('feature_keys','default_features'))`);
    expect(helpers.length).toBeGreaterThanOrEqual(10);
    for (const h of helpers) expect(h, h.name).toMatchObject({ auth: false, anon: false });
    const t = await q<{ sel: boolean; ins: boolean; rls: boolean }>(db,
      `select has_table_privilege('authenticated', 'public.needs', 'select') as sel,
              has_table_privilege('anon', 'public.needs', 'insert') as ins,
              (select relrowsecurity from pg_class where oid = 'public.needs'::regclass) as rls`);
    expect(t[0]).toEqual({ sel: false, ins: false, rls: true });
  });

  it('deleting the family also removes claimed and bought needs', async () => {
    const g = await makeFamily(db, { Kid: 'kid', Oma: 'grandparent' }, 'Goodbye Family');
    const a = await g.Oma.rpc<Need>('add_need', { p_member: g.Kid.id, p_item: 'Shoes', p_occasion: 'Anytime' });
    const b = await g.Oma.rpc<Need>('add_need', { p_member: g.Kid.id, p_item: 'Bag', p_occasion: 'Anytime' });
    await g.Oma.rpc('claim_need', { p_id: a.id });
    await g.Oma.rpc('complete_need', { p_id: b.id, p_note: 'Done' });
    expect((await g.owner.rpc<any>('delete_family', { p_confirm: 'Goodbye Family' })).deleted).toBe(true);
    expect(await q(db, `select 1 from public.needs where family_id = $1`, [g.familyId])).toEqual([]);
  });
});

describe('activity log text for needs', () => {
  it('describes every need.* action in plain words', () => {
    const byId = { k1: { id: 'k1', display_name: 'Sam' } } as unknown as Record<string, Member>;
    const say = (action: string) =>
      describeAudit({ id: 1, actor: null, action, details: { need: 'n1', member: 'k1', item: 'School shoes', occasion: 'New term' }, created_at: '' }, byId, 'EUR');
    expect(say('need.add')).toEqual({ emoji: '🛍️', text: 'Added “School shoes” for Sam (New term)', known: true });
    expect(say('need.claim').text).toBe('Will get “School shoes” for Sam');
    expect(say('need.done').text).toBe('Bought “School shoes” for Sam');
    for (const a of ['need.update', 'need.release', 'need.reopen', 'need.cancel']) expect(say(a).known, a).toBe(true);
  });
});