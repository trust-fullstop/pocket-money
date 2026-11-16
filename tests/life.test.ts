// Family calendar (repeats in local time, birthdays from profiles) and the devices register.
import { beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { clock, expectCode, makeDb, makeFamily, type Fam } from './helpers';

let db: PGlite;
let F: Fam;

const at = (list: any[], title: string) => list.filter((e) => e.title === title).map((e) => new Date(e.occurs_at).toISOString());
const events = (rpc: Fam['owner']['rpc'], from: string, to: string) => rpc<any[]>('list_events', { p_from: from, p_to: to });

beforeAll(async () => {
  clock.now = '2026-10-01T08:00:00Z';
  db = await makeDb();
  F = await makeFamily(db, { Mum: 'parent', Sam: 'kid', Mia: 'kid', Oma: 'grandparent' });
  await F.owner.rpc('update_member', { p_member: F.Sam.id, p_patch: { profile: { birthday: '2016-03-14', blood_type: 'A+' } } });
});

describe('events', () => {
  let swim: string;
  let dentist: string;

  it('weekly repeats keep local time across the DST change', async () => {
    swim = (await F.Mum.rpc<any>('upsert_event', { p: { title: 'Swimming lesson', kind: 'event', emoji: '🏊',
      starts_at: '2026-10-21T17:00:00+02:00', repeat: 'weekly', for_members: [F.Sam.id, F.Mia.id] } })).id;
    const list = await events(F.Sam.rpc, '2026-10-19T00:00:00Z', '2026-11-05T00:00:00Z');
    expect(at(list, 'Swimming lesson')).toEqual(['2026-10-21T15:00:00.000Z', '2026-10-28T16:00:00.000Z', '2026-11-04T16:00:00.000Z']);
    const e = list.find((x) => x.title === 'Swimming lesson');
    expect(e).toMatchObject({ id: swim, source: 'event', repeat: 'weekly', all_day: false, emoji: '🏊', created_by: F.Mum.id });
    expect(e.for_members.sort()).toEqual([F.Sam.id, F.Mia.id].sort());
    // no occurrences before the first one
    expect(at(await events(F.Sam.rpc, '2026-09-01T00:00:00Z', '2026-10-21T14:00:00Z'), 'Swimming lesson')).toEqual([]);
  });

  it('monthly repeats clamp to the end of short months', async () => {
    await F.owner.rpc('upsert_event', { p: { title: 'Pocket money review', kind: 'reminder', starts_at: '2026-01-31T19:00:00+01:00',
      repeat: 'monthly' } });
    const list = await events(F.owner.rpc, '2026-02-01T00:00:00Z', '2026-05-01T00:00:00Z');
    expect(at(list, 'Pocket money review')).toEqual(['2026-02-28T18:00:00.000Z', '2026-03-31T17:00:00.000Z', '2026-04-30T17:00:00.000Z']);
  });

  it('yearly all-day events land on the local date, also when the range starts mid-day', async () => {
    await F.owner.rpc('upsert_event', { p: { title: 'Christmas', kind: 'event', emoji: '🎄', all_day: true,
      starts_at: '2025-12-25T10:00:00+01:00', repeat: 'yearly' } });
    expect(at(await events(F.Mia.rpc, '2026-12-01T00:00:00Z', '2027-01-01T00:00:00Z'), 'Christmas')).toEqual(['2026-12-24T23:00:00.000Z']);
    expect(at(await events(F.Mia.rpc, '2026-12-25T12:00:00Z', '2026-12-26T12:00:00Z'), 'Christmas')).toEqual(['2026-12-24T23:00:00.000Z']);
    expect(at(await events(F.Mia.rpc, '2025-12-01T00:00:00Z', '2026-12-31T00:00:00Z'), 'Christmas'))
      .toEqual(['2025-12-24T23:00:00.000Z', '2026-12-24T23:00:00.000Z']);
  });

  it('birthdays come from member profiles', async () => {
    const list = await events(F.Oma.rpc, '2027-03-01T00:00:00Z', '2027-04-01T00:00:00Z');
    const b = list.filter((e) => e.source === 'profile_birthday');
    expect(b).toEqual([{ id: F.Sam.id, source: 'profile_birthday', title: "Sam's birthday", notes: 'Turns 11', emoji: '🎂',
      kind: 'birthday', occurs_at: expect.any(String), all_day: true, repeat: 'yearly', for_members: [F.Sam.id], created_by: null,
      can_edit: false }]);
    expect(new Date(b[0].occurs_at).toISOString()).toBe('2027-03-13T23:00:00.000Z');
  });

  it('anyone creates; only the creator or a manager edits or deletes', async () => {
    dentist = (await F.Sam.rpc<any>('upsert_event', { p: { title: 'Dentist', kind: 'reminder', starts_at: '2026-11-20T10:30:00+01:00',
      for_members: [F.Sam.id] } })).id;
    const range = ['2026-11-19T00:00:00Z', '2026-11-21T00:00:00Z'] as const;
    const canEdit = async (rpc: Fam['owner']['rpc']) => (await events(rpc, ...range)).find((e) => e.id === dentist).can_edit;
    expect(await canEdit(F.Sam.rpc)).toBe(true);
    expect(await canEdit(F.Mum.rpc)).toBe(true);
    expect(await canEdit(F.Mia.rpc)).toBe(false);
    expect(await canEdit(F.Oma.rpc)).toBe(false);
    await expectCode(F.Mia.rpc('upsert_event', { p: { id: dentist, title: 'Hacked', kind: 'event', starts_at: '2026-11-20T10:00:00Z' } }),
      'not_allowed');
    await expectCode(F.Oma.rpc('delete_event', { p_event: dentist }), 'not_allowed');
    await expectCode(F.Sam.rpc('delete_event', { p_event: swim }), 'not_allowed');
    await F.Sam.rpc('upsert_event', { p: { id: dentist, title: 'Dentist (check-up)', kind: 'reminder', starts_at: '2026-11-20T11:00:00+01:00' } });
    expect(at(await events(F.Sam.rpc, ...range), 'Dentist (check-up)')).toEqual(['2026-11-20T10:00:00.000Z']);
    const oma = await F.Oma.rpc<any>('upsert_event', { p: { title: 'Oma visits', kind: 'event', starts_at: '2026-11-21T14:00:00Z' } });
    await F.owner.rpc('delete_event', { p_event: oma.id });
    await F.Mum.rpc('delete_event', { p_event: dentist });
    expect((await events(F.Sam.rpc, ...range)).some((e) => e.id === dentist)).toBe(false);
  });

  it('validates input and range', async () => {
    await expectCode(events(F.Sam.rpc, '2026-01-01T00:00:00Z', '2027-03-01T00:00:00Z'), 'invalid', 'range');
    await expectCode(events(F.Sam.rpc, '2026-01-02T00:00:00Z', '2026-01-01T00:00:00Z'), 'invalid', 'range');
    await expectCode(F.Sam.rpc('upsert_event', { p: { title: 'x', kind: 'event', starts_at: 'tomorrow-ish' } }), 'invalid', 'starts_at');
    await expectCode(F.Sam.rpc('upsert_event', { p: { title: 'x', kind: 'event', starts_at: '2026-11-20T10:00:00Z', repeat: 'daily' } }),
      'invalid', 'repeat');
    await expectCode(F.Sam.rpc('upsert_event', { p: { title: ' ', kind: 'event', starts_at: '2026-11-20T10:00:00Z' } }), 'invalid', 'title');
  });
});

describe('devices', () => {
  it('managers manage; others only see their own', async () => {
    await expectCode(F.Sam.rpc('upsert_device', { p: { name: 'My phone', type: 'phone', owner_id: F.Sam.id } }), 'not_allowed');
    await expectCode(F.Oma.rpc('upsert_device', { p: { name: 'Tablet', type: 'tablet' } }), 'not_allowed');
    const tablet = await F.Mum.rpc<any>('upsert_device', { p: { name: "Sam's tablet", type: 'tablet', owner_id: F.Sam.id, model: 'iPad 9',
      mac: 'AA:BB:CC:DD:EE:FF' } });
    const xbox = await F.owner.rpc<any>('upsert_device', { p: { name: 'Family Xbox', type: 'console' } });
    await expectCode(F.owner.rpc('upsert_device', { p: { name: 'Toaster', type: 'toaster' } }), 'invalid', 'type');
    await expectCode(F.owner.rpc('upsert_device', { p: { name: '', type: 'tv' } }), 'invalid', 'name');

    const mine = await F.Sam.rpc<any[]>('list_devices');
    expect(mine).toEqual([{ id: tablet.id, owner_id: F.Sam.id, name: "Sam's tablet", type: 'tablet', model: 'iPad 9', phone_number: null,
      mac: 'AA:BB:CC:DD:EE:FF', ip: null, notes: null, created_at: expect.any(String) }]);
    expect(await F.Mia.rpc('list_devices')).toEqual([]);
    expect(await F.Oma.rpc('list_devices')).toEqual([]);
    expect((await F.Mum.rpc<any[]>('list_devices')).map((d) => d.id).sort()).toEqual([tablet.id, xbox.id].sort());

    await F.owner.rpc('upsert_device', { p: { id: tablet.id, name: "Mia's tablet", type: 'tablet', owner_id: F.Mia.id } });
    expect(await F.Sam.rpc('list_devices')).toEqual([]);
    expect((await F.Mia.rpc<any[]>('list_devices')).map((d) => d.name)).toEqual(["Mia's tablet"]);
    await expectCode(F.Mia.rpc('delete_device', { p_device: tablet.id }), 'not_allowed');
    await F.Mum.rpc('delete_device', { p_device: tablet.id });
    await expectCode(F.Mum.rpc('delete_device', { p_device: tablet.id }), 'not_found');
    expect((await F.owner.rpc<any[]>('list_devices')).map((d) => d.id)).toEqual([xbox.id]);
  });
});
