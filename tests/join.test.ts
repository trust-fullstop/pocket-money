import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { as, clock, expectCode, makeDb, makeFamily, uid } from './helpers';

let db: PGlite;
beforeAll(async () => { db = await makeDb(); });
afterEach(() => { clock.now = null; });

describe('create family', () => {
  it('makes the caller the owner and returns their state', async () => {
    const me = as(db, uid());
    const r = await me<any>('create_family', { p_family_name: 'Jansen', p_my_name: 'Pa', p_avatar: '👨',
      p_timezone: 'Europe/Amsterdam', p_currency: 'EUR' });
    expect(r.family_id).toBeTruthy();
    const st = await me<any>('get_state');
    expect(st.me.role).toBe('owner');
    expect(st.family.name).toBe('Jansen');
    expect(st.members).toHaveLength(1);
    // one login = one family
    await expectCode(me('create_family', { p_family_name: 'Second', p_my_name: 'Pa', p_avatar: null,
      p_timezone: 'Europe/Amsterdam', p_currency: 'EUR' }), 'already_member');
  });

  it('a stranger without a membership is not a member', async () => {
    await expectCode(as(db, uid())('get_state'), 'not_member');
    await expectCode(as(db, null)('get_state'), 'not_member');
  });
});

describe('invites', () => {
  it('preview + single-use redeem', async () => {
    const fam = await makeFamily(db, {});
    const added = await fam.owner.rpc<any>('add_member', { p_name: 'Kiddo', p_role: 'kid', p_avatar: '🧒' });
    const inv = added.invite;
    expect(inv.short_code).toMatch(/^[A-Z0-9]{6,}$/);

    const phone = as(db, uid());
    const pre = await phone<any>('invite_preview', { p_code: inv.short_code.toLowerCase() });
    expect(pre).toMatchObject({ ok: true, family_name: 'Test Family', display_name: 'Kiddo', role: 'kid' });

    const red = await phone<any>('redeem_invite', { p_code: inv.token, p_label: 'iPad' });
    expect(red).toEqual({ ok: true, member_id: added.member_id });
    expect((await phone<any>('get_state')).me.id).toBe(added.member_id);

    const other = as(db, uid());
    expect(await other<any>('redeem_invite', { p_code: inv.token, p_label: null })).toEqual({ ok: false, error: 'invite_invalid' });
    expect((await other<any>('invite_preview', { p_code: inv.short_code })).ok).toBe(false);
    await expectCode(other('get_state'), 'not_member');
  });

  it('a new invite replaces the old one', async () => {
    const fam = await makeFamily(db, {});
    const added = await fam.owner.rpc<any>('add_member', { p_name: 'Kid', p_role: 'kid' });
    const second = await fam.owner.rpc<any>('create_invite', { p_member: added.member_id });
    const phone = as(db, uid());
    expect((await phone<any>('redeem_invite', { p_code: added.invite.token })).ok).toBe(false);
    expect((await phone<any>('redeem_invite', { p_code: second.token })).ok).toBe(true);
  });

  it('expires after 30 minutes (fake clock)', async () => {
    clock.now = '2026-11-16T08:00:00Z';
    const fam = await makeFamily(db, {});
    const added = await fam.owner.rpc<any>('add_member', { p_name: 'Late', p_role: 'kid' });
    const phone = as(db, uid());
    clock.now = '2026-11-16T08:29:00Z';
    expect((await phone<any>('invite_preview', { p_code: added.invite.token })).ok).toBe(true);
    clock.now = '2026-11-16T08:31:00Z';
    expect(await phone<any>('invite_preview', { p_code: added.invite.token })).toEqual({ ok: false, error: 'invite_invalid' });
    expect(await phone<any>('redeem_invite', { p_code: added.invite.token })).toEqual({ ok: false, error: 'invite_invalid' });
  });

  it('throttles guessing: 10 bad codes per 10 minutes', async () => {
    clock.now = '2026-11-16T09:00:00Z';
    const fam = await makeFamily(db, {});
    const added = await fam.owner.rpc<any>('add_member', { p_name: 'Guess', p_role: 'kid' });
    const guesser = as(db, uid());
    for (let n = 0; n < 10; n++) {
      expect((await guesser<any>('invite_preview', { p_code: `WRONG${n}` })).ok).toBe(false);
    }
    await expectCode(guesser('invite_preview', { p_code: 'WRONG10' }), 'too_many_attempts');
    // even the right code is refused while throttled
    await expectCode(guesser('redeem_invite', { p_code: added.invite.token }), 'too_many_attempts');
    clock.now = '2026-11-16T09:11:00Z';
    // the window has passed and the invite (30 min) is still valid
    expect((await guesser<any>('redeem_invite', { p_code: added.invite.token })).ok).toBe(true);
  });

  it('kids and grandparents cannot add members or create invites', async () => {
    const fam = await makeFamily(db, { Kid: 'kid', Oma: 'grandparent' });
    await expectCode(fam.Kid.rpc('add_member', { p_name: 'X', p_role: 'kid' }), 'not_allowed');
    await expectCode(fam.Oma.rpc('add_member', { p_name: 'X', p_role: 'kid' }), 'not_allowed');
    await expectCode(fam.Kid.rpc('create_invite', { p_member: fam.Oma.id }), 'not_allowed');
  });
});

describe('password login', () => {
  it('logs in, locks after 5 bad passwords for 15 minutes', async () => {
    clock.now = '2026-11-16T10:00:00Z';
    const fam = await makeFamily(db, { Pw: 'kid' });
    const user = `pw${Date.now() % 100000}`;
    expect(await fam.owner.rpc<any>('set_credentials', { p_username: user.toUpperCase(), p_password: 'secret1', p_member: fam.Pw.id }))
      .toEqual({ ok: true, username: user });

    const phone = as(db, uid());
    expect(await phone<any>('login_with_password', { p_username: user, p_password: 'secret1', p_label: 'phone' }))
      .toEqual({ ok: true, member_id: fam.Pw.id });
    expect((await phone<any>('get_state')).me.id).toBe(fam.Pw.id);

    for (let n = 0; n < 5; n++) {
      expect(await as(db, uid())<any>('login_with_password', { p_username: user, p_password: 'nope' }))
        .toEqual({ ok: false, error: 'bad_login' });
    }
    const locked = await as(db, uid())<any>('login_with_password', { p_username: user, p_password: 'secret1' });
    expect(locked.ok).toBe(false);
    expect(locked.error).toBe('locked');
    expect(new Date(locked.until).toISOString()).toBe('2026-11-16T10:15:00.000Z');

    clock.now = '2026-11-16T10:16:00Z';
    expect((await as(db, uid())<any>('login_with_password', { p_username: user, p_password: 'secret1' })).ok).toBe(true);
    expect(await as(db, uid())<any>('login_with_password', { p_username: 'nobody_here', p_password: 'x' }))
      .toEqual({ ok: false, error: 'bad_login' });
  });

  it('usernames are unique and validated', async () => {
    const fam = await makeFamily(db, { A: 'kid', B: 'kid' });
    const name = `uniq${Date.now() % 100000}`;
    await fam.owner.rpc('set_credentials', { p_username: name, p_password: 'secret1', p_member: fam.A.id });
    await expectCode(fam.owner.rpc('set_credentials', { p_username: name, p_password: 'secret1', p_member: fam.B.id }), 'username_taken');
    await expectCode(fam.owner.rpc('set_credentials', { p_username: 'a b', p_password: 'secret1', p_member: fam.B.id }), 'invalid', 'username');
    await expectCode(fam.owner.rpc('set_credentials', { p_username: 'okname', p_password: '123', p_member: fam.B.id }), 'invalid', 'password');
  });
});

describe('who may manage whose sign-in (can_manage_login)', () => {
  it('a co-parent cannot take over another linked adult; the owner can', async () => {
    const fam = await makeFamily(db, { Mum: 'parent', Anna: 'step_parent', Kid: 'kid', Oma: 'grandparent' });
    await expectCode(fam.Mum.rpc('create_invite', { p_member: fam.Anna.id }), 'not_allowed');
    await expectCode(fam.Mum.rpc('create_invite', { p_member: fam.owner.id }), 'not_allowed');
    await expectCode(fam.Mum.rpc('set_credentials', { p_username: 'annax', p_password: 'secret1', p_member: fam.Anna.id }), 'not_allowed');
    await expectCode(fam.Mum.rpc('list_logins', { p_member: fam.Anna.id }), 'not_allowed');
    await expectCode(fam.Anna.rpc('clear_credentials', { p_member: fam.Mum.id }), 'not_allowed');

    expect((await fam.owner.rpc<any>('create_invite', { p_member: fam.Anna.id })).member_id).toBe(fam.Anna.id);
    expect((await fam.Mum.rpc<any>('create_invite', { p_member: fam.Kid.id })).member_id).toBe(fam.Kid.id);
    expect((await fam.Mum.rpc<any>('create_invite', { p_member: fam.Oma.id })).member_id).toBe(fam.Oma.id);

    // adults are the owner's call: a co-parent can't add one, unless the owner allows it
    await expectCode(fam.Mum.rpc('add_member', { p_name: 'Uncle', p_role: 'guardian' }), 'not_allowed', 'adults_owner_only');
    await expectCode(fam.Mum.rpc('update_family', { p_patch: { settings: { managers_add_adults: true } } }), 'not_allowed', 'owner_only');
    await fam.owner.rpc('update_family', { p_patch: { settings: { managers_add_adults: true } } });
    // then an adult who has never signed in can be invited by a co-parent
    const fresh = await fam.Mum.rpc<any>('add_member', { p_name: 'Uncle', p_role: 'guardian' });
    expect((await fam.Mum.rpc<any>('create_invite', { p_member: fresh.member_id })).member_id).toBe(fresh.member_id);
    await fam.owner.rpc('update_family', { p_patch: { settings: { managers_add_adults: false } } });
    await expectCode(fam.Mum.rpc('create_invite', { p_member: fresh.member_id }), 'not_allowed');

    const logins = await fam.Mum.rpc<any[]>('list_logins', { p_member: null });
    expect(logins).toHaveLength(1);
    expect(logins[0].current).toBe(true);
  });

  it('a login that belongs to one family cannot join another', async () => {
    const a = await makeFamily(db, { Kid: 'kid' }, 'Family A');
    const b = await makeFamily(db, {}, 'Family B');
    const added = await b.owner.rpc<any>('add_member', { p_name: 'Spy', p_role: 'kid' });
    expect(await a.Kid.rpc<any>('redeem_invite', { p_code: added.invite.token })).toEqual({ ok: false, error: 'already_member' });
    expect((await a.Kid.rpc<any>('get_state')).family.name).toBe('Family A');
  });
});

describe('relationship labels', () => {
  it('stores a custom relation on add and update; only allowed editors may change it', async () => {
    const f = await makeFamily(db, { Mum: 'parent', Kid: 'kid' });
    const added = await f.owner.rpc<any>('add_member', { p_name: 'Anna', p_role: 'step_parent', p_avatar: null, p_relation: '  Bonus mum ' });
    let st = await f.owner.rpc<any>('get_state');
    expect(st.members.find((m: any) => m.id === added.member_id)).toMatchObject({ role: 'step_parent', relation: 'Bonus mum' });
    expect(st.members.find((m: any) => m.id === f.Kid.id).relation).toBeNull();

    await f.Mum.rpc('update_member', { p_member: f.Kid.id, p_patch: { relation: 'Bonus son' } });
    await f.Kid.rpc('update_member', { p_member: f.Kid.id, p_patch: { relation: '' } }); // self may clear it
    st = await f.owner.rpc<any>('get_state');
    expect(st.members.find((m: any) => m.id === f.Kid.id).relation).toBeNull();

    await expectCode(f.Kid.rpc('update_member', { p_member: f.Mum.id, p_patch: { relation: 'Boss' } }), 'not_allowed');
    await expectCode(f.owner.rpc('add_member', { p_name: 'X', p_role: 'kid', p_avatar: null, p_relation: 'x'.repeat(31) }), 'invalid', 'relation');
  });
});
