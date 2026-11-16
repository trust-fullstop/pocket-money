import { beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { as, clock, makeDb, q } from './helpers';

const DEMO = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;
const NAMES = ['Dad', 'Mum', 'Anna', 'Oma', 'Sam', 'Mia', 'Leo'];

describe('demo seed', () => {
  let db: PGlite;
  let ms = 0;
  beforeAll(async () => {
    clock.now = null;
    const t0 = Date.now();
    db = await makeDb({ seed: true });
    ms = Date.now() - t0;
  });

  it('loads in a few seconds and resets the clock and identity', async () => {
    expect(ms).toBeLessThan(20000);
    const r = await q(db, `select current_setting('app.fake_now', true) as n, current_setting('request.jwt.claim.sub', true) as s`);
    expect(r[0].n ?? '').toBe('');
    expect(r[0].s ?? '').toBe('');
  });

  it('every demo login can call get_state', async () => {
    for (let n = 1; n <= 7; n++) {
      const st = await as(db, DEMO(n))<any>('get_state');
      expect(st.me.display_name).toBe(NAMES[n - 1]);
      expect(st.family.name).toBe('The Demo Family');
      expect(st.members).toHaveLength(7);
    }
  });

  it('Mum has things to approve, including Dad\'s challenge from Mia', async () => {
    const list = await as(db, DEMO(2))<any[]>('list_approvals');
    expect(list.length).toBeGreaterThan(0);
    expect(list.map((x) => x.title)).toContain('No phone at dinner for a week');
    const mia = await as(db, DEMO(6))<any[]>('list_approvals');
    expect(mia.map((x) => x.title)).toEqual(['No phone at dinner for a week']);
  });

  it('kids have money, history, goals and targets', async () => {
    const dad = as(db, DEMO(1));
    const st = await dad<any>('get_state');
    for (const name of ['Sam', 'Mia', 'Leo']) {
      const m = st.members.find((x: any) => x.display_name === name);
      const w = await dad<any>('wallet', { p_member: m.id, p_history_limit: 20 });
      expect(w.balances.spending + w.balances.savings).not.toBe(0);
      expect(w.balances.points).toBeGreaterThan(0);
      expect(w.history.length).toBeGreaterThan(5);
      expect(w.goals).toHaveLength(1);
      expect(w.targets.length).toBeGreaterThan(0);
      expect(w.tallies.ytd.money_earned).toBeGreaterThan(0);
    }
  });

  it('has the story beats: missed, excused, rejected, spots, gifts, requests, reversal', async () => {
    const kinds = await q(db, `select kind, count(*)::int as n from public.transactions group by kind`);
    const k = Object.fromEntries(kinds.map((r: any) => [r.kind, r.n]));
    for (const kind of ['task_reward', 'task_penalty', 'bonus', 'fine', 'gift', 'transfer', 'interest', 'spend',
      'time_use', 'saver_bonus', 'excuse', 'reversal', 'allowance']) {
      expect(k[kind] ?? 0, kind).toBeGreaterThan(0);
    }
    const st = await q(db, `select status, count(*)::int as n from public.task_instances group by status`);
    const s = Object.fromEntries(st.map((r: any) => [r.status, r.n]));
    expect(s.approved).toBeGreaterThan(30);
    expect(s.missed).toBeGreaterThan(0);
    expect(s.excused).toBe(1);
    expect(s.submitted).toBeGreaterThan(0);
    expect(s.open).toBeGreaterThan(0);
    const reqs = await as(db, DEMO(2))<any[]>('list_requests', { p_status: 'pending' });
    expect(reqs.map((r) => r.kind).sort()).toEqual(expect.arrayContaining(['spend', 'withdraw']));
    const ev = await as(db, DEMO(5))<any[]>('list_events', {
      p_from: new Date(Date.now() - 86400000).toISOString(), p_to: new Date(Date.now() + 40 * 86400000).toISOString() });
    expect(ev.map((e) => e.title)).toEqual(expect.arrayContaining(['School trip to the zoo', 'Dentist', 'Swimming lesson', "Sam's birthday"]));
    const dev = await as(db, DEMO(1))<any[]>('list_devices');
    expect(dev).toHaveLength(4);
    const tasks = await as(db, DEMO(1))<any[]>('list_tasks');
    expect(tasks.filter((t) => t.title === 'Wash the car')).toHaveLength(2);
  });
});

describe('demo seed works at any time of the week', () => {
  // Monday just after midnight, Wednesday morning, Saturday late evening, Sunday 23:58 (Amsterdam).
  for (const anchor of ['2026-11-15T23:05:00Z', '2026-11-18T06:30:00Z', '2026-11-21T21:30:00Z', '2027-03-28T21:58:00Z']) {
    it(`seed at ${anchor}`, async () => {
      const db = await makeDb({ seed: true, seedNow: anchor });
      clock.now = anchor;
      try {
        const mum = await as(db, DEMO(2))<any>('get_state');
        expect(mum.counts.approvals).toBeGreaterThan(0);
        const t = await as(db, DEMO(1))<any>('tick');
        expect(t.missed).toBeGreaterThanOrEqual(0);
      } finally {
        clock.now = null;
        await db.close();
      }
    });
  }
});
