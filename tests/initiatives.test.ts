// "Look what I did ⭐" (migration 20261116002200): a kid shows something good they did on their own; a parent rewards
// it with the family's Spotted rule, says thanks, or asks to talk about it.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { clock, expectCode, makeDb, makeFamily, q, uid, type Fam } from './helpers';
import { describeAudit } from '../src/features/family/audit';
import { familySpotRules, type Member } from '../src/lib/types';

let db: PGlite;
beforeAll(async () => { db = await makeDb(); });
afterAll(() => { clock.now = null; });

const send = (who: { rpc: Fam['owner']['rpc'] }, what: string, photo: string | null = null, request = uid()) =>
  who.rpc<any>('submit_initiative', { p_what: what, p_photo: photo, p_request: request });
const ledger = (id: string) => q<any>(db,
  `select kind, currency, pot, amount, label, reason, source_type, source_key, created_by, photo_path
     from public.transactions where source_id = $1 order by currency`, [id]);

describe('proud moments', () => {
  let f: Fam;
  let car: any;
  beforeAll(async () => {
    f = await makeFamily(db, { Sam: 'kid', Mia: 'kid', Mum: 'parent', Oma: 'grandparent' });
  });

  it('a kid sends one; the same request id gives back the same row', async () => {
    clock.now = '2026-12-01T09:00:00Z';
    const req = uid();
    car = await send(f.Sam, '  Washed   the car without being asked ', null, req);
    expect(car).toMatchObject({ member_id: f.Sam.id, what: 'Washed the car without being asked', status: 'waiting',
      photo_path: null, can_cancel: true, can_decide: false, reward_cents: 0 });
    const again = await send(f.Sam, 'Something else', null, req);
    expect(again.id).toBe(car.id);
    expect(again.what).toBe('Washed the car without being asked');
    expect(await q(db, `select count(*)::int as n from public.initiatives where member_id = $1`, [f.Sam.id])).toEqual([{ n: 1 }]);
    expect(await q(db, `select action, details from public.audit_log where family_id = $1 and action like 'initiative.%'`, [f.familyId]))
      .toEqual([{ action: 'initiative.submit',
        details: { initiative: car.id, member: f.Sam.id, what: 'Washed the car without being asked', photo: false } }]);

    await expectCode(send(f.Sam, '   '), 'invalid', 'what');
    await expectCode(send(f.Sam, 'x'.repeat(201)), 'invalid', 'what');
    await expectCode(f.Sam.rpc('submit_initiative', { p_what: 'No id' }), 'invalid', 'request');
    // only kids, and only for themselves (there is no member parameter)
    await expectCode(send(f.Mum, 'Cooked dinner'), 'not_allowed');
    await expectCode(send(f.Oma, 'Knitted a scarf'), 'not_allowed');
  });

  it('a manager rewards it with the family rule: bonus rows with the reason "Your idea: …"', async () => {
    clock.now = '2026-12-01T09:10:00Z';
    const st = await f.Mum.rpc<any>('get_state');
    const rule = familySpotRules(st.family.settings).reward;
    expect(rule).toEqual({ cents: 500, minutes: 0, points: 10 });
    const waiting = await f.Mum.rpc<any[]>('list_initiatives');
    expect(waiting.map((x) => [x.id, x.can_decide, x.can_cancel])).toEqual([[car.id, true, false]]);

    const r = await f.Mum.rpc<any>('decide_initiative',
      { p_id: car.id, p_decision: 'reward', p_cents: rule.cents, p_minutes: rule.minutes, p_points: rule.points });
    expect(r).toMatchObject({ status: 'rewarded', reward_cents: 500, reward_minutes: 0, reward_points: 10,
      decided_by: f.Mum.id, decision_note: null, can_decide: false });
    const reason = 'Your idea: Washed the car without being asked';
    const rows = [
      { kind: 'bonus', currency: 'money', pot: 'spending', amount: 500, label: 'reward', reason, source_type: 'initiative',
        source_key: 'money', created_by: f.Mum.id, photo_path: null },
      { kind: 'bonus', currency: 'points', pot: 'points', amount: 10, label: null, reason, source_type: 'initiative',
        source_key: 'points', created_by: f.Mum.id, photo_path: null },
    ];
    expect(await ledger(car.id)).toEqual(rows);

    // a second decision (another parent at the same time) changes nothing
    await expectCode(f.owner.rpc('decide_initiative', { p_id: car.id, p_decision: 'reward', p_cents: 500 }), 'wrong_status');
    await expectCode(f.Mum.rpc('decide_initiative', { p_id: car.id, p_decision: 'thanks' }), 'wrong_status');
    expect(await ledger(car.id)).toEqual(rows);

    // Sam sees the reward in the history
    const hist = await f.Sam.rpc<any[]>('history', { p_member: f.Sam.id, p_currency: null, p_before: null, p_limit: 50 });
    expect(hist.filter((t) => t.reason === reason).map((t) => [t.kind, t.currency, t.amount]))
      .toEqual(expect.arrayContaining([['bonus', 'money', 500], ['bonus', 'points', 10]]));
    const [aud] = await q<any>(db, `select details from public.audit_log where action = 'initiative.reward' and family_id = $1`, [f.familyId]);
    expect(aud.details).toEqual({ initiative: car.id, member: f.Sam.id, what: 'Washed the car without being asked',
      cents: 500, minutes: 0, points: 10, note: null });
  });

  it('"thanks" posts nothing; "talk" needs a note; amounts only come with a reward', async () => {
    clock.now = '2026-12-01T10:00:00Z';
    const help = await send(f.Sam, 'Helped my brother or sister');
    clock.now = '2026-12-01T10:01:00Z';
    const tidy = await send(f.Sam, 'Cleaned up without being asked');
    await expectCode(f.Mum.rpc('decide_initiative', { p_id: help.id, p_decision: 'thanks', p_cents: 100 }), 'invalid', 'amount');
    await expectCode(f.Mum.rpc('decide_initiative', { p_id: help.id, p_decision: 'maybe' }), 'invalid', 'decision');
    await expectCode(f.Mum.rpc('decide_initiative', { p_id: help.id, p_decision: 'reward' }), 'invalid', 'amount');
    await expectCode(f.Mum.rpc('decide_initiative', { p_id: help.id, p_decision: 'reward', p_cents: 100001 }), 'invalid', 'cents');
    await expectCode(f.Mum.rpc('decide_initiative', { p_id: help.id, p_decision: 'reward', p_minutes: 1441 }), 'invalid', 'minutes');
    await expectCode(f.Mum.rpc('decide_initiative', { p_id: help.id, p_decision: 'reward', p_points: -1 }), 'invalid', 'points');
    await expectCode(f.Mum.rpc('decide_initiative', { p_id: help.id, p_decision: 'thanks', p_note: 'x'.repeat(201) }), 'invalid', 'note');

    clock.now = '2026-12-01T10:10:00Z';
    const th = await f.Mum.rpc<any>('decide_initiative', { p_id: help.id, p_decision: 'thanks' });
    expect(th).toMatchObject({ status: 'thanked', decision_note: null, reward_cents: 0, reward_points: 0 });
    expect(await ledger(help.id)).toEqual([]);

    await expectCode(f.Mum.rpc('decide_initiative', { p_id: tidy.id, p_decision: 'talk' }), 'invalid', 'note');
    await expectCode(f.Mum.rpc('decide_initiative', { p_id: tidy.id, p_decision: 'talk', p_note: '   ' }), 'invalid', 'note');
    clock.now = '2026-12-01T10:20:00Z';
    const talk = await f.Mum.rpc<any>('decide_initiative', { p_id: tidy.id, p_decision: 'talk', p_note: 'Lovely! Let’s look at it together' });
    expect(talk).toMatchObject({ status: 'talk', decision_note: 'Lovely! Let’s look at it together' });
    expect(await ledger(tidy.id)).toEqual([]);

    // the kid reads what the grown-ups said, newest first
    const done = await f.Sam.rpc<any[]>('list_initiatives', { p_status: 'done' });
    expect(done.map((x) => [x.what, x.status, x.decision_note])).toEqual([
      ['Cleaned up without being asked', 'talk', 'Lovely! Let’s look at it together'],
      ['Helped my brother or sister', 'thanked', null],
      ['Washed the car without being asked', 'rewarded', null],
    ]);
    const actions = await q<any>(db, `select action from public.audit_log where family_id = $1 and action like 'initiative.%' order by id`, [f.familyId]);
    expect(actions.map((a) => a.action)).toEqual(['initiative.submit', 'initiative.reward', 'initiative.submit', 'initiative.submit',
      'initiative.thanks', 'initiative.talk']);
  });

  it('siblings see only their own, grandparents see nothing, and only managers decide', async () => {
    clock.now = '2026-12-01T11:00:00Z';
    const w = await send(f.Sam, 'Did extra homework');
    expect(await f.Mia.rpc('list_initiatives', { p_status: 'all' })).toEqual([]);
    expect(await f.Mia.rpc('list_initiatives')).toEqual([]);
    await expectCode(f.Oma.rpc('list_initiatives'), 'not_allowed');
    await expectCode(f.Oma.rpc('list_initiatives', { p_status: 'all' }), 'not_allowed');
    await expectCode(f.Oma.rpc('decide_initiative', { p_id: w.id, p_decision: 'thanks' }), 'not_allowed');
    await expectCode(f.Oma.rpc('decide_initiative', { p_id: w.id, p_decision: 'reward', p_cents: 500 }), 'not_allowed');
    await expectCode(f.Mia.rpc('decide_initiative', { p_id: w.id, p_decision: 'thanks' }), 'not_allowed');
    await expectCode(f.Sam.rpc('decide_initiative', { p_id: w.id, p_decision: 'reward', p_cents: 500 }), 'not_allowed');
    await expectCode(f.Mia.rpc('cancel_initiative', { p_id: w.id }), 'not_allowed');
    await expectCode(f.Mum.rpc('cancel_initiative', { p_id: w.id }), 'not_allowed');
    await expectCode(f.Mum.rpc('list_initiatives', { p_status: 'nope' }), 'invalid', 'status');

    // another family can't see or touch it
    const g = await makeFamily(db, { Leo: 'kid' }, 'Other family');
    expect(await g.owner.rpc('list_initiatives', { p_status: 'all' })).toEqual([]);
    await expectCode(g.owner.rpc('decide_initiative', { p_id: w.id, p_decision: 'thanks' }), 'not_found', 'initiative');
    await expectCode(g.Leo.rpc('cancel_initiative', { p_id: w.id }), 'not_found', 'initiative');

    // managers see every kid's, the kid sees their own
    expect((await f.owner.rpc<any[]>('list_initiatives')).map((x) => x.id)).toEqual([w.id]);
    expect((await f.Sam.rpc<any[]>('list_initiatives', { p_status: 'all' })).map((x) => x.what)).toEqual([
      'Did extra homework', 'Cleaned up without being asked', 'Helped my brother or sister', 'Washed the car without being asked']);
    expect(await q(db, `select count(*)::int as n from public.audit_log where action like 'initiative.%' and details->>'initiative' = $1`, [w.id]))
      .toEqual([{ n: 1 }]);
  });

  it('the kid can take one back while it waits', async () => {
    const [w] = await f.Sam.rpc<any[]>('list_initiatives');
    const c = await f.Sam.rpc<any>('cancel_initiative', { p_id: w.id });
    expect(c).toMatchObject({ status: 'cancelled', can_cancel: false, can_decide: false });
    await expectCode(f.Sam.rpc('cancel_initiative', { p_id: w.id }), 'wrong_status');
    await expectCode(f.Mum.rpc('decide_initiative', { p_id: w.id, p_decision: 'thanks' }), 'wrong_status');
    expect(await f.Mum.rpc('list_initiatives')).toEqual([]);
    const [a] = await q<any>(db, `select details from public.audit_log where action = 'initiative.cancel' and family_id = $1`, [f.familyId]);
    expect(a.details).toEqual({ initiative: w.id, member: f.Sam.id, what: 'Did extra homework' });
  });

  it('a photo must be in the kid’s own folder; the reward rows carry it', async () => {
    clock.now = '2026-12-01T12:00:00Z';
    const g = await makeFamily(db, { Leo: 'kid' }, 'Photo family');
    const own = `${f.familyId}/${f.Sam.id}/proud-1.jpg`;
    for (const p of [`${f.familyId}/${f.Mia.id}/x.jpg`, `${f.familyId}/${f.Mum.id}/x.jpg`, `${g.familyId}/${f.Sam.id}/x.jpg`,
      `${f.familyId}/${f.Sam.id}x/x.jpg`, `${f.familyId}/${f.Sam.id}/../x.jpg`, `${f.familyId}/x.jpg`, 'x.jpg']) {
      await expectCode(send(f.Sam, 'Baked a cake', p), 'invalid', 'photo_path');
    }
    const ok = await send(f.Sam, 'Baked a cake', own);
    expect(ok.photo_path).toBe(own);
    await f.Mum.rpc('decide_initiative', { p_id: ok.id, p_decision: 'reward', p_cents: 300 });
    expect((await ledger(ok.id)).map((r) => [r.currency, r.amount, r.photo_path])).toEqual([['money', 300, own]]);
  });

  it('on a database with Storage the photo must really be uploaded', async () => {
    const g = await makeFamily(db, { Leo: 'kid' }, 'Storage family');
    const path = `${g.familyId}/${g.Leo.id}/proud.jpg`;
    await db.exec(`create schema storage; create table storage.objects (bucket_id text, name text);`);
    try {
      await expectCode(send(g.Leo, 'Fed the cat', path), 'invalid', 'photo_path');
      await q(db, `insert into storage.objects values ('other', $1)`, [path]);
      await expectCode(send(g.Leo, 'Fed the cat', path), 'invalid', 'photo_path');
      await q(db, `insert into storage.objects values ('photos', $1)`, [path]);
      expect((await send(g.Leo, 'Fed the cat', path)).photo_path).toBe(path);
    } finally {
      await db.exec(`drop schema storage cascade`);
    }
  });
});

describe('limits', () => {
  it('at most 3 waiting and 5 a day (cancelled ones count), by the family’s day', async () => {
    const f = await makeFamily(db, { Leo: 'kid' }, 'Limits family');
    clock.now = '2026-12-02T10:00:00Z';
    const s1 = await send(f.Leo, 'One');
    const s2 = await send(f.Leo, 'Two');
    const s3 = await send(f.Leo, 'Three');
    await expectCode(send(f.Leo, 'Four'), 'invalid', 'too_many_waiting');
    await f.Leo.rpc('cancel_initiative', { p_id: s1.id });
    await send(f.Leo, 'Four');
    await f.Leo.rpc('cancel_initiative', { p_id: s2.id });
    await send(f.Leo, 'Five');
    await f.Leo.rpc('cancel_initiative', { p_id: s3.id });
    await expectCode(send(f.Leo, 'Six'), 'invalid', 'too_many_today');
    // 23:30 UTC is already the next day in Amsterdam
    clock.now = '2026-12-02T23:30:00Z';
    expect((await send(f.Leo, 'Six')).status).toBe('waiting');
    await expectCode(send(f.Leo, 'Seven'), 'invalid', 'too_many_waiting');
    // a repeat of an earlier form still answers, even at the limit
    const again = await f.Leo.rpc<any>('submit_initiative', { p_what: 'One', p_request: (await q<any>(db,
      `select request_id from public.initiatives where id = $1`, [s1.id]))[0].request_id });
    expect(again).toMatchObject({ id: s1.id, status: 'cancelled' });
  });
});

describe('switches', () => {
  it('Spotted off: no new proud moments, but waiting ones can still be listed, decided and cancelled', async () => {
    clock.now = '2026-12-03T10:00:00Z';
    const f = await makeFamily(db, { Sam: 'kid', Mum: 'parent' }, 'Switch family');
    const w1 = await send(f.Sam, 'Watered the plants');
    clock.now = '2026-12-03T10:01:00Z';
    const w2 = await send(f.Sam, 'Made my bed');
    await f.owner.rpc('update_family', { p_patch: { settings: { features: { spotted: false } } } });
    await expectCode(send(f.Sam, 'Fed the dog'), 'feature_off', 'spotted');
    expect((await f.Mum.rpc<any[]>('list_initiatives')).map((x) => x.id)).toEqual([w1.id, w2.id]);
    expect((await f.Sam.rpc<any>('get_state')).counts.initiatives).toBe(2);
    expect((await f.Mum.rpc<any>('get_state')).counts.initiatives).toBe(2);
    const r = await f.Mum.rpc<any>('decide_initiative', { p_id: w1.id, p_decision: 'reward', p_cents: 500, p_points: 10 });
    expect(r.status).toBe('rewarded');
    expect((await ledger(w1.id)).map((x) => [x.currency, x.amount])).toEqual([['money', 500], ['points', 10]]);
    expect((await f.Sam.rpc<any>('cancel_initiative', { p_id: w2.id })).status).toBe('cancelled');
  });

  it('time or points with that part switched off → feature_off', async () => {
    clock.now = '2026-12-04T10:00:00Z';
    const f = await makeFamily(db, { Sam: 'kid', Mum: 'parent' }, 'Parts family');
    const w = await send(f.Sam, 'Read to my sister');
    await f.owner.rpc('update_family', { p_patch: { settings: { features: { time: false } } } });
    await expectCode(f.Mum.rpc('decide_initiative', { p_id: w.id, p_decision: 'reward', p_cents: 100, p_minutes: 15 }), 'feature_off', 'time');
    await f.owner.rpc('update_family', { p_patch: { settings: { features: { time: true, points: false } } } });
    await expectCode(f.Mum.rpc('decide_initiative', { p_id: w.id, p_decision: 'reward', p_points: 10 }), 'feature_off', 'points');
    expect(await ledger(w.id)).toEqual([]);
    const r = await f.Mum.rpc<any>('decide_initiative', { p_id: w.id, p_decision: 'reward', p_cents: 100, p_minutes: 15, p_note: 'Extra fun time' });
    expect(r).toMatchObject({ status: 'rewarded', reward_cents: 100, reward_minutes: 15, reward_points: 0, decision_note: 'Extra fun time' });
    expect((await ledger(w.id)).map((x) => [x.currency, x.pot, x.amount, x.label])).toEqual([['money', 'spending', 100, 'reward'], ['time', 'time', 15, 'fun']]);
  });
});

describe('counts and removed kids', () => {
  it('get_state counts proud moments: the family’s for managers, their own for a kid, none for others', async () => {
    clock.now = '2026-12-05T10:00:00Z';
    const f = await makeFamily(db, { Sam: 'kid', Mia: 'kid', Mum: 'parent', Oma: 'grandparent' }, 'Count family');
    const count = async (p: { rpc: Fam['owner']['rpc'] }) => (await p.rpc<any>('get_state')).counts.initiatives;
    await send(f.Sam, 'One');
    await send(f.Sam, 'Two');
    const mia = await send(f.Mia, 'Three');
    expect([await count(f.owner), await count(f.Mum), await count(f.Sam), await count(f.Mia), await count(f.Oma)]).toEqual([3, 3, 2, 1, 0]);
    await f.Mum.rpc('decide_initiative', { p_id: mia.id, p_decision: 'thanks' });
    expect([await count(f.Mum), await count(f.Mia)]).toEqual([2, 0]);

    // a kid who is no longer active is skipped by the list, the counts and decide
    await q(db, `update public.members set active = false where id = $1`, [f.Sam.id]);
    const [w] = await q<any>(db, `select id from public.initiatives where member_id = $1 and status = 'waiting' limit 1`, [f.Sam.id]);
    expect(await count(f.Mum)).toBe(0);
    expect(await f.Mum.rpc('list_initiatives')).toEqual([]);
    await expectCode(f.Mum.rpc('decide_initiative', { p_id: w.id, p_decision: 'reward', p_cents: 500 }), 'not_found', 'member');
    expect(await ledger(w.id)).toEqual([]);
    await q(db, `update public.members set active = true where id = $1`, [f.Sam.id]);
    expect(await count(f.Mum)).toBe(2);

    // removing the kid cancels their waiting proud moments
    await f.owner.rpc('remove_member', { p_member: f.Sam.id });
    expect(await q(db, `select status, count(*)::int as n from public.initiatives where member_id = $1 group by status`, [f.Sam.id]))
      .toEqual([{ status: 'cancelled', n: 2 }]);
    expect(await count(f.Mum)).toBe(0);
  });
});

describe('perimeter', () => {
  it('anon cannot execute the new functions; helpers and the table are closed', async () => {
    const pub = ['submit_initiative(text, text, uuid)', 'list_initiatives(text)', 'decide_initiative(uuid, text, int, int, int, text)',
      'cancel_initiative(uuid)', 'get_state()', 'remove_member(uuid)'];
    for (const fn of pub) {
      const [r] = await q(db, `select has_function_privilege('anon', $1, 'execute') as a,
                                      has_function_privilege('authenticated', $1, 'execute') as u`, [`public.${fn}`]);
      expect(r, fn).toEqual({ a: false, u: true });
    }
    const helpers = ['initiative_json(public.initiatives, public.members)', 'get_initiative(uuid, uuid)',
      'initiative_text(text, text)', 'photo_exists(text)'];
    for (const fn of helpers) {
      const [r] = await q(db, `select has_function_privilege('anon', $1, 'execute') as a,
                                      has_function_privilege('authenticated', $1, 'execute') as u`, [`app.${fn}`]);
      expect(r, fn).toEqual({ a: false, u: false });
    }
    const [t] = await q(db, `select has_table_privilege('authenticated', 'public.initiatives', 'select') as s,
                                    has_table_privilege('anon', 'public.initiatives', 'insert') as i,
                                    (select relrowsecurity from pg_class where oid = 'public.initiatives'::regclass) as rls`);
    expect(t).toEqual({ s: false, i: false, rls: true });
  });
});

describe('activity log wording', () => {
  it('says what happened with each proud moment', () => {
    const byId = { k1: { id: 'k1', display_name: 'Sam' } } as unknown as Record<string, Member>;
    const text = (action: string, details: Record<string, unknown>) =>
      describeAudit({ id: 1, actor: null, action, details, created_at: '' }, byId, 'EUR').text.replace(/\s/g, ' ');
    const what = 'Washed the car';
    expect(text('initiative.submit', { member: 'k1', what })).toBe('Shared a proud moment: “Washed the car”');
    expect(text('initiative.reward', { member: 'k1', what, cents: 500, minutes: 0, points: 10, note: null }))
      .toBe('Sam: proud moment “Washed the car” → reward €5 and 10 XP');
    expect(text('initiative.reward', { member: 'k1', what, cents: 700, minutes: 0, points: 0, note: 'Extra careful' }))
      .toBe('Sam: proud moment “Washed the car” → reward €7 — Extra careful');
    expect(text('initiative.thanks', { member: 'k1', what })).toBe('Sam: proud moment “Washed the car” → thanks 💛');
    expect(text('initiative.talk', { member: 'k1', what, note: 'Ask first' })).toBe('Sam: proud moment “Washed the car” → let’s talk 💬 — Ask first');
    expect(text('initiative.cancel', { member: 'k1', what })).toBe('Took back a proud moment: “Washed the car”');
  });
});
