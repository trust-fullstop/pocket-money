-- Pay-out overview: the parent who acts as "the bank" pays each kid's wallet into the kid's real bank account.
-- * New ledger kind 'payout': one row per pay-out that settles the FULL wallet (money / spending, amount = -balance).
--   No partial pay-outs, so a cycle is simply "since the last pay-out that was not undone".
-- * public.record_payout(member, expected, request, note): managers only, idempotent per client request id; refuses
--   when the wallet changed since the parent looked (wrong_status 'balance_changed') or is empty (invalid 'nothing_to_pay').
-- * public.payout_summary(): managers only; per active kid the wallet now and how it was built up since the last pay-out
--   (pocket money, rewards and tasks, consequences, other), which always adds up to the wallet.
-- * Pay-outs are not behaviour: app.tally (earned / lost / spent) and the week-end "nothing saved and nothing left" rule
--   in app.tick_family ignore pay-out rows and their undo rows. Undo is the existing reverse_transaction.

-- ---------- 1. ledger kind ----------
do $$
declare c text;
begin
  for c in select conname from pg_constraint
            where conrelid = 'public.transactions'::regclass and contype = 'c'
              and pg_get_constraintdef(oid) ~ '\mkind\M' and pg_get_constraintdef(oid) like '%task_reward%'
  loop
    execute format('alter table public.transactions drop constraint %I', c);
  end loop;
end $$;

alter table public.transactions add constraint transactions_kind_check check (kind in (
  'task_reward','task_penalty','bonus','fine','gift','transfer','interest','spend','time_use','prize','saver_bonus',
  'no_savings_penalty','excuse','reversal','allowance','payout'));

-- ---------- 2. tallies: a pay-out is neither earned, lost nor spent ----------
-- Identical to 20261116000300_api_money.sql except the tx CTE drops pay-out rows and the undo rows of pay-outs.
create or replace function app.tally(p_member uuid, f public.families, p_period text, p_start date, p_end date) returns jsonb
language sql stable as $$
  with b as (select app.local_ts(p_start, '00:00', f.timezone) as s, app.local_ts(p_end, '00:00', f.timezone) as e),
  tx as (select x.currency, x.pot, x.kind, x.amount
           from b cross join public.transactions x
           left join public.transactions o on x.kind = 'reversal' and x.source_type = 'reversal' and o.id = x.source_id
          where x.member_id = p_member and x.effective_at >= b.s and x.effective_at < b.e
            and x.kind <> 'payout' and o.kind is distinct from 'payout'),
  ins as (select i.status, t.reward_cents, t.reward_minutes, t.reward_points
            from public.task_instances i join public.tasks t on t.id = i.task_id
           where i.assignee_id = p_member and i.occurs_on >= p_start and i.occurs_on < p_end)
  select jsonb_build_object('period', p_period, 'start', p_start, 'end', p_end,
    'money_earned', (select coalesce(sum(amount), 0) from tx where currency = 'money' and amount > 0 and kind <> 'transfer'),
    'money_lost', (select coalesce(-sum(amount), 0) from tx where currency = 'money' and amount < 0 and kind not in ('transfer','spend')),
    'money_spent', (select coalesce(-sum(amount), 0) from tx where currency = 'money' and kind = 'spend'),
    'money_saved', (select coalesce(sum(amount), 0) from tx where kind = 'transfer' and pot = 'savings'),
    'interest', (select coalesce(sum(amount), 0) from tx where currency = 'money' and kind = 'interest'),
    'time_earned', (select coalesce(sum(amount), 0) from tx where currency = 'time' and amount > 0),
    'time_lost', (select coalesce(-sum(amount), 0) from tx where currency = 'time' and amount < 0 and kind <> 'time_use'),
    'time_used', (select coalesce(-sum(amount), 0) from tx where currency = 'time' and kind = 'time_use'),
    'points_earned', (select coalesce(sum(amount), 0) from tx where currency = 'points' and amount > 0),
    'points_lost', (select coalesce(-sum(amount), 0) from tx where currency = 'points' and amount < 0),
    'tasks_done', (select count(*) from ins where status = 'approved'),
    'tasks_missed', (select count(*) from ins where status = 'missed'),
    'tasks_open', (select count(*) from ins where status in ('open','submitted')),
    'possible_cents', (select coalesce(sum(reward_cents), 0) from ins where status not in ('cancelled','excused')),
    'possible_minutes', (select coalesce(sum(reward_minutes), 0) from ins where status not in ('cancelled','excused')),
    'possible_points', (select coalesce(sum(reward_points), 0) from ins where status not in ('cancelled','excused')))
  from b $$;

-- ---------- 3. tick_family: paying out is not "nothing left" ----------
-- Identical to 20261116001400_allowance_month_bank.sql except spend_end (the wallet at week end, used by the
-- no-savings rule) leaves out pay-out rows and their undo rows, i.e. it adds the pay-outs back. Pay-outs are not
-- in the "earned" kinds either.
create or replace function app.tick_family(p_family uuid) returns jsonb
language plpgsql as $$
declare f public.families; s jsonb; v_today date; v_now timestamptz := app.now(); v_grace int;
  n_created int := 0; n_missed int := 0; n_weeks int := 0; n_months int := 0;
  r record; k public.members; ws date; we date; ws_ts timestamptz; we_ts timestamptz; v_first date; v_last date;
  v_pct numeric; v_saver int; v_nosave int; sav_end bigint; sav_start bigint; spend_end bigint; earned bigint; v_int int;
  v_created date;
  on_time boolean; on_points boolean; on_interest boolean; on_saver boolean; on_targets boolean;
  since_interest date; since_saver date; since_targets date;
begin
  select * into f from public.families where id = p_family for update;
  if not found then raise exception 'not_found' using detail = 'family'; end if;
  s := app.settings(f);
  v_today := app.today(f);
  v_grace := coalesce((s->>'late_grace_minutes')::int, 60);
  v_created := (f.created_at at time zone f.timezone)::date;
  on_time := app.feature_on_s(s, 'time');
  on_points := app.feature_on_s(s, 'points');
  on_interest := app.feature_on_s(s, 'interest');
  on_saver := app.feature_on_s(s, 'saver_rules') and on_points;
  on_targets := app.feature_on_s(s, 'targets');
  since_interest := app.feature_since(f.id, 'interest');
  since_saver := greatest(app.feature_since(f.id, 'saver_rules'), app.feature_since(f.id, 'points'));
  since_targets := app.feature_since(f.id, 'targets');

  -- 1. instances
  n_created := app.materialise(f, null);

  -- 2. missed tasks
  for r in select i.id, i.assignee_id, i.due_at, t.title, t.penalty_cents, t.penalty_minutes, t.penalty_points, t.time_label
             from public.task_instances i join public.tasks t on t.id = i.task_id
            where i.family_id = f.id and i.status = 'open' and i.due_at + make_interval(mins => v_grace) < v_now
            order by i.due_at, i.id
            for update of i
  loop
    update public.task_instances set status = 'missed' where id = r.id;
    perform app.post(f.id, r.assignee_id, 'money', 'spending', -r.penalty_cents, 'task_penalty', null,
                     left('Missed: ' || r.title, 200), null, 'task_instance', r.id, 'penalty:money', r.due_at);
    if on_time then
      perform app.post(f.id, r.assignee_id, 'time', 'time', -r.penalty_minutes, 'task_penalty', r.time_label,
                       left('Missed: ' || r.title, 200), null, 'task_instance', r.id, 'penalty:time', r.due_at);
    end if;
    if on_points then
      perform app.post(f.id, r.assignee_id, 'points', 'points', -r.penalty_points, 'task_penalty', null,
                       left('Missed: ' || r.title, 200), null, 'task_instance', r.id, 'penalty:points', r.due_at);
    end if;
    n_missed := n_missed + 1;
  end loop;

  -- 3. pocket money (weekly or monthly schedule per kid)
  if app.feature_on_s(s, 'allowance') then
    perform app.pay_allowances(f);
  end if;

  -- 4. close completed weeks (unchanged)
  v_pct := coalesce((s->>'interest_pct_month')::numeric, 0);
  v_saver := coalesce((s->>'saver_bonus_points')::int, 0);
  v_nosave := coalesce((s->>'no_savings_penalty_points')::int, 0);
  v_last := app.week_start(v_today) - 7;
  v_first := greatest(v_last - 7 * 11, app.week_start(v_created));
  for ws in select d::date from generate_series(v_first, v_last, interval '7 days') d loop
    continue when exists (select 1 from public.period_runs where family_id = f.id and period = 'week' and period_start = ws);
    we := ws + 7;
    ws_ts := app.local_ts(ws, '00:00', f.timezone);
    we_ts := app.local_ts(we, '00:00', f.timezone);
    for k in select m.* from public.members m
              where m.family_id = f.id and m.active and m.role = 'kid' and m.created_at < we_ts
                and ((on_interest and (since_interest is null or we > since_interest))
                  or (on_saver and (since_saver is null or we > since_saver)))
              order by m.created_at, m.id
    loop
      select coalesce(sum(x.amount) filter (where x.pot = 'savings' and x.effective_at < we_ts), 0),
             coalesce(sum(x.amount) filter (where x.pot = 'savings' and x.effective_at < ws_ts), 0),
             -- a pay-out made in THIS week isn't "nothing left" (add it back); earlier pay-outs stay counted, so the
             -- rule keeps working in later weeks. An undo counts by its original pay-out's date.
             coalesce(sum(x.amount) filter (where x.pot = 'spending' and x.effective_at < we_ts
                        and not (x.kind = 'payout' and x.effective_at >= ws_ts)
                        and not (o.kind is not distinct from 'payout' and o.effective_at >= ws_ts)), 0),
             coalesce(sum(x.amount) filter (where x.currency = 'money' and x.amount > 0
                        and x.kind in ('task_reward','bonus','gift','prize','allowance')
                        and x.effective_at >= ws_ts and x.effective_at < we_ts), 0)
        into sav_end, sav_start, spend_end, earned
        from public.transactions x
        left join public.transactions o on x.kind = 'reversal' and x.source_type = 'reversal' and o.id = x.source_id
       where x.member_id = k.id;
      if on_interest and (since_interest is null or we > since_interest) then
        v_int := floor(greatest(sav_end, 0) * v_pct * 12 / (100 * 52))::int;
        if v_int > 0 then
          perform app.post(f.id, k.id, 'money', 'savings', v_int, 'interest', null, 'Interest on your savings', null,
                           'week', k.id, 'interest:' || ws, we_ts - interval '1 second');
        end if;
      end if;
      if on_saver and (since_saver is null or we > since_saver) then
        if v_saver > 0 and sav_end > sav_start then
          perform app.post(f.id, k.id, 'points', 'points', v_saver, 'saver_bonus', null, 'Saver bonus: your savings grew this week',
                           null, 'week', k.id, 'saver_bonus:' || ws, we_ts - interval '1 second');
        end if;
        if v_nosave > 0 and earned > 0 and sav_end <= 0 and spend_end <= 0 then
          perform app.post(f.id, k.id, 'points', 'points', -v_nosave, 'no_savings_penalty', null,
                           'Nothing saved and nothing left this week', null, 'week', k.id, 'no_savings:' || ws,
                           we_ts - interval '1 second');
        end if;
      end if;
    end loop;
    if on_targets and (since_targets is null or we > since_targets) then
      perform app.close_targets(f, 'week', ws, we);
    end if;
    insert into public.period_runs(family_id, period, period_start) values (f.id, 'week', ws) on conflict do nothing;
    n_weeks := n_weeks + 1;
  end loop;

  -- 5. close completed months (unchanged)
  v_last := (date_trunc('month', v_today) - interval '1 month')::date;
  v_first := greatest((v_last - interval '2 months')::date, date_trunc('month', v_created)::date);
  for ws in select d::date from generate_series(v_first, v_last, interval '1 month') d loop
    continue when exists (select 1 from public.period_runs where family_id = f.id and period = 'month' and period_start = ws);
    if on_targets and (since_targets is null or (ws + interval '1 month')::date > since_targets) then
      perform app.close_targets(f, 'month', ws, (ws + interval '1 month')::date);
    end if;
    insert into public.period_runs(family_id, period, period_start) values (f.id, 'month', ws) on conflict do nothing;
    n_months := n_months + 1;
  end loop;

  update public.families set last_tick_at = v_now where id = f.id;
  return jsonb_build_object('instances_created', n_created, 'missed', n_missed, 'weeks_closed', n_weeks,
                            'months_closed', n_months);
end $$;

-- ---------- 4. helpers ----------
create or replace function app.payout_json(x public.transactions) returns jsonb language sql stable as $$
  select jsonb_build_object('id', x.id, 'member_id', x.member_id, 'amount_cents', -x.amount, 'paid_at', x.effective_at) $$;

-- One kid's line on the pay-out overview. The cycle starts after the latest pay-out that was not undone. Wallet rows
-- after that are put in buckets by kind; an undo row counts in the bucket of the row it undid. Pay-outs and their undo
-- rows are in no bucket. start_cents is what was carried over, so start + buckets always equals the wallet.
-- Without any pay-out every wallet row is in a bucket (also the join-day pocket money dated before created_at).
create or replace function app.payout_kid(m public.members, f public.families) returns jsonb language sql stable as $$
  with lp as (select p.effective_at, -p.amount as cents from public.transactions p
               where p.member_id = m.id and p.kind = 'payout' and p.reversed_by is null
               order by p.effective_at desc, p.created_at desc limit 1),
  cut as (select coalesce((select lp.effective_at from lp), '-infinity'::timestamptz) as t),
  r as (select x.amount, x.effective_at,
               case when x.kind = 'reversal' and x.source_type = 'reversal' then coalesce(o.kind, x.kind) else x.kind end as k
          from public.transactions x
          left join public.transactions o on x.kind = 'reversal' and x.source_type = 'reversal' and o.id = x.source_id
         where x.member_id = m.id and x.currency = 'money' and x.pot = 'spending'),
  b as (select coalesce(sum(r.amount), 0)::int as wallet,
               coalesce(sum(r.amount) filter (where r.effective_at > cut.t and r.k = 'allowance'), 0)::int as allowance,
               coalesce(sum(r.amount) filter (where r.effective_at > cut.t
                          and r.k in ('task_reward','bonus','prize','gift','excuse','interest','saver_bonus')), 0)::int as rewards,
               coalesce(sum(r.amount) filter (where r.effective_at > cut.t
                          and r.k in ('fine','task_penalty','no_savings_penalty')), 0)::int as consequences,
               coalesce(sum(r.amount) filter (where r.effective_at > cut.t
                          and r.k not in ('allowance','task_reward','bonus','prize','gift','excuse','interest','saver_bonus',
                                          'fine','task_penalty','no_savings_penalty','payout')), 0)::int as other
          from r cross join cut)
  select jsonb_build_object(
    'member_id', m.id,
    'wallet_cents', b.wallet,
    'to_pay_cents', greatest(b.wallet, 0),
    'owes_cents', greatest(-b.wallet, 0),
    'last_payout_at', (select lp.effective_at from lp),
    'last_payout_cents', (select lp.cents from lp),
    'since', coalesce((select lp.effective_at from lp), m.created_at),
    'start_cents', b.wallet - b.allowance - b.rewards - b.consequences - b.other,
    'allowance_cents', b.allowance,
    'rewards_cents', b.rewards,
    'consequences_cents', b.consequences,
    'other_cents', b.other,
    'allowance_cents_per_period', m.allowance_cents,
    'allowance_period', m.allowance_period,
    'allowance_day', m.allowance_day,
    'last_allowance_on', (select (a.effective_at at time zone f.timezone)::date from public.transactions a
                           where a.member_id = m.id and a.kind = 'allowance' and a.currency = 'money' and a.reversed_by is null
                           order by a.effective_at desc limit 1))
  from b $$;

-- ---------- 5. RPCs ----------
-- What to pay each kid now. Managers only; catches up due pocket money first.
create or replace function public.payout_summary() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare me public.members; f public.families;
begin
  me := app.me();
  if not app.is_manager(me.role) then raise exception 'not_allowed'; end if;
  perform app.tick_family(me.family_id);
  select * into f from public.families where id = me.family_id;
  return coalesce((select jsonb_agg(app.payout_kid(m, f) order by m.display_name, m.id)
                     from public.members m where m.family_id = f.id and m.active and m.role = 'kid'), '[]'::jsonb);
end $$;

-- "Paid ✅": settles the whole wallet. p_expected_cents is the amount the parent saw (and paid); p_request is a
-- client-made uuid so a retry returns the same row instead of paying twice; p_note (≤ 200) is added to the reason.
create or replace function public.record_payout(p_member uuid, p_expected_cents int, p_request uuid, p_note text default null)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare me public.members; m public.members; x public.transactions; v_bal int; v_id uuid;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  me := app.me();
  if not app.is_manager(me.role) then raise exception 'not_allowed'; end if;
  if p_request is null then raise exception 'invalid' using detail = 'request'; end if;
  if p_expected_cents is null then raise exception 'invalid' using detail = 'amount'; end if;
  if char_length(v_note) > 200 then raise exception 'invalid' using detail = 'note'; end if;
  m := app.get_member(me.family_id, p_member);
  if m.role <> 'kid' then raise exception 'not_allowed' using detail = 'member'; end if;

  -- one pay-out at a time per kid (lock order: member, then the family row inside tick_family)
  perform 1 from public.members where id = m.id for update;
  perform app.tick_family(me.family_id);

  select * into x from public.transactions where source_type = 'payout' and source_id = p_request and source_key = 'payout';
  if found then
    if x.family_id <> me.family_id or x.member_id <> m.id then raise exception 'invalid' using detail = 'request'; end if;
    return app.payout_json(x);
  end if;

  v_bal := app.bal(m.id, 'spending');
  if v_bal <= 0 then raise exception 'invalid' using detail = 'nothing_to_pay'; end if;
  if v_bal <> p_expected_cents then raise exception 'wrong_status' using detail = 'balance_changed'; end if;

  v_id := app.post(me.family_id, m.id, 'money', 'spending', -v_bal, 'payout', null,
                   'Paid out to the bank by ' || me.display_name || coalesce(' · ' || v_note, ''), me.id,
                   'payout', p_request, 'payout');
  if v_id is null then raise exception 'wrong_status' using detail = 'request'; end if;
  perform app.audit(me.family_id, me.id, 'payout.record',
                    jsonb_build_object('member', m.id, 'amount', v_bal, 'note', v_note));
  select * into x from public.transactions where id = v_id;
  return app.payout_json(x);
end $$;

-- ---------- 6. grants ----------
revoke all on function app.tally(uuid, public.families, text, date, date) from public, anon, authenticated;
revoke all on function app.tick_family(uuid) from public, anon, authenticated;
revoke all on function app.payout_json(public.transactions) from public, anon, authenticated;
revoke all on function app.payout_kid(public.members, public.families) from public, anon, authenticated;

revoke all on function public.payout_summary() from public, anon, authenticated;
revoke all on function public.record_payout(uuid, int, uuid, text) from public, anon, authenticated;

grant execute on function public.payout_summary() to authenticated;
grant execute on function public.record_payout(uuid, int, uuid, text) to authenticated;
