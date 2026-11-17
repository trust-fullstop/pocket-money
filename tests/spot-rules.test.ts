// Spotted amounts as a family rule (migration 20261116001800).
import { beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { expectCode, makeDb, makeFamily, q, type Fam } from './helpers';
import { DEFAULT_SPOT_RULES, familySpotRules } from '../src/lib/types';

let db: PGlite;
beforeAll(async () => { db = await makeDb(); });

const RULES = { reward: { cents: 1000, minutes: 15, points: 5 }, consequence: { cents: 300, minutes: 0, points: 0 } };

describe('Spotted rules', () => {
  let f: Fam;
  it('have server defaults that match the app', async () => {
    f = await makeFamily(db, { Sam: 'kid', Mum: 'parent', Oma: 'grandparent' });
    const st = await f.Sam.rpc<any>('get_state');
    expect(st.family.settings.spot_rules).toEqual(DEFAULT_SPOT_RULES);
    expect(familySpotRules(undefined)).toEqual(DEFAULT_SPOT_RULES);
    expect(familySpotRules({ spot_rules: { reward: { cents: 1, minutes: 0, points: 0 } } as any }).consequence).toEqual(DEFAULT_SPOT_RULES.consequence);
  });

  it('parents set both amounts; the whole object is stored', async () => {
    const st = await f.Mum.rpc<any>('update_family', { p_patch: { settings: { spot_rules: RULES } } });
    expect(st.family.settings.spot_rules).toEqual(RULES);
    // missing numbers count as 0
    const st2 = await f.owner.rpc<any>('update_family', {
      p_patch: { settings: { spot_rules: { reward: { cents: 700 }, consequence: { cents: 200 } } } },
    });
    expect(st2.family.settings.spot_rules).toEqual({ reward: { cents: 700, minutes: 0, points: 0 }, consequence: { cents: 200, minutes: 0, points: 0 } });
  });

  it('rejects partial, unknown, negative, fractional and too-large amounts; kids and grandparents cannot change it', async () => {
    const bad = [
      { reward: { cents: 100 } },
      { reward: { cents: 100 }, consequence: { cents: 100 }, extra: {} },
      { reward: { cents: 100, coins: 1 }, consequence: { cents: 100 } },
      { reward: { cents: -1 }, consequence: { cents: 100 } },
      { reward: { cents: 1.5 }, consequence: { cents: 100 } },
      { reward: { cents: 100001 }, consequence: { cents: 100 } },
      { reward: { minutes: 1441 }, consequence: {} },
      { reward: { points: '5' }, consequence: {} },
      'R5',
    ];
    for (const v of bad) {
      await expectCode(f.owner.rpc('update_family', { p_patch: { settings: { spot_rules: v } } }), 'invalid', 'setting:spot_rules');
    }
    await expectCode(f.Sam.rpc('update_family', { p_patch: { settings: { spot_rules: RULES } } }), 'not_allowed');
    await expectCode(f.Oma.rpc('update_family', { p_patch: { settings: { spot_rules: RULES } } }), 'not_allowed');
  });

  it('Spotted itself is unchanged: it posts exactly the amounts the phone sends', async () => {
    await f.Mum.rpc('spot', { p: { member_id: f.Sam.id, direction: 'minus', cents: 200, reason: 'Bike in the rain' } });
    const rows = await q<any>(db, `select kind, amount, currency from public.transactions where member_id = $1 and source_type = 'spot'`, [f.Sam.id]);
    expect(rows).toEqual([{ kind: 'fine', amount: -200, currency: 'money' }]);
  });

  it('the helper functions are not callable from the app', async () => {
    const [p] = await q<{ a: boolean; b: boolean }>(db, `select
      has_function_privilege('authenticated', 'app.check_spot_rules(jsonb)', 'execute') as a,
      has_function_privilege('anon', 'app.default_spot_rules()', 'execute') as b`);
    expect(p).toEqual({ a: false, b: false });
  });
});
