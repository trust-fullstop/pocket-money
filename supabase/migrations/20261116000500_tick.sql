-- =====================================================================
-- Pocket Money — timed rules. Every step is idempotent:
--   instances: unique (task_id, occurs_on); ledger rows: unique source key; periods: period_runs / target_results.
-- effective_at = the moment a row counts for (due time, week start/end); created_at = when it was written.
-- =====================================================================

-- Evaluate the targets of one closed period and pay prizes once.
create or replace function app.close_targets(f public.families, p_period text, p_start date, p_end date) returns int
language plpgsql as $$
declare tg public.targets; v_val int; v_met boolean; n int; v_paid int := 0;
  v_eff timestamptz := app.local_ts(p_end, '00:00', f.timezone) - interval '1 second';
begin
  for tg in select t.* from public.targets t join public.members m on m.id = t.member_id
             where t.family_id = f.id and t.active and t.period = p_period and m.active
               and t.created_at < app.local_ts(p_end, '00:00', f.timezone)
             order by t.created_at, t.id
  loop
    v_val := app.target_value(tg, f, p_start, p_end);
    v_met := v_val >= tg.threshold;
    insert into public.target_results(target_id, period_start, value, met) values (tg.id, p_start, v_val, v_met)
      on conflict do nothing;
    get diagnostics n = row_count;
    if n > 0 and v_met then
      perform app.post(f.id, tg.member_id, 'money', 'spending', tg.prize_cents, 'prize', 'prize', 'Prize: ' || tg.title, null,
                       'target', tg.id, 'prize:money:' || p_start, v_eff);
      perform app.post(f.id, tg.member_id, 'time', 'time', tg.prize_minutes, 'prize', tg.time_label, 'Prize: ' || tg.title, null,
                       'target', tg.id, 'prize:time:' || p_start, v_eff);
      perform app.post(f.id, tg.member_id, 'points', 'points', tg.prize_points, 'prize', null, 'Prize: ' || tg.title, null,
                       'target', tg.id, 'prize:points:' || p_start, v_eff);
      v_paid := v_paid + 1;
    end if;
  end loop;
  return v_paid;
end $$;

create or replace function app.tick_family(p_family uuid) returns jsonb
language plpgsql as $$
declare f public.families; s jsonb; v_today date; v_now timestamptz := app.now(); v_grace int;
  n_created int := 0; n_missed int := 0; n_weeks int := 0; n_months int := 0;
  r record; k public.members; ws date; we date; ws_ts timestamptz; we_ts timestamptz; v_first date; v_last date;
  v_pct numeric; v_saver int; v_nosave int; sav_end bigint; sav_start bigint; spend_end bigint; earned bigint; v_int int;
  v_created date;
begin
  select * into f from public.families where id = p_family for update;
  if not found then raise exception 'not_found' using detail = 'family'; end if;
  s := app.settings(f);
  v_today := app.today(f);
  v_grace := coalesce((s->>'late_grace_minutes')::int, 60);
  v_created := (f.created_at at time zone f.timezone)::date;

  -- 1. instances
  n_created := app.materialise(f, null);

  -- 2. missed tasks: penalty once per instance (source key), counted at the due time
  for r in select i.id, i.assignee_id, i.due_at, t.title, t.penalty_cents, t.penalty_minutes, t.penalty_points, t.time_label
             from public.task_instances i join public.tasks t on t.id = i.task_id
            where i.family_id = f.id and i.status = 'open' and i.due_at + make_interval(mins => v_grace) < v_now
            order by i.due_at, i.id
            for update of i
  loop
    update public.task_instances set status = 'missed' where id = r.id;
    perform app.post(f.id, r.assignee_id, 'money', 'spending', -r.penalty_cents, 'task_penalty', null,
                     left('Missed: ' || r.title, 200), null, 'task_instance', r.id, 'penalty:money', r.due_at);
    perform app.post(f.id, r.assignee_id, 'time', 'time', -r.penalty_minutes, 'task_penalty', r.time_label,
                     left('Missed: ' || r.title, 200), null, 'task_instance', r.id, 'penalty:time', r.due_at);
    perform app.post(f.id, r.assignee_id, 'points', 'points', -r.penalty_points, 'task_penalty', null,
                     left('Missed: ' || r.title, 200), null, 'task_instance', r.id, 'penalty:points', r.due_at);
    n_missed := n_missed + 1;
  end loop;

  -- 3. weekly pocket money for the current week (only weeks starting on/after the kid was added)
  ws := app.week_start(v_today);
  for k in select m.* from public.members m
            where m.family_id = f.id and m.active and m.role = 'kid' and m.allowance_cents > 0
              and (m.created_at at time zone f.timezone)::date <= ws
  loop
    perform app.post(f.id, k.id, 'money', 'spending', k.allowance_cents, 'allowance', 'pocket', 'Weekly pocket money', null,
                     'week', k.id, 'allowance:' || ws, app.local_ts(ws, '00:00', f.timezone));
  end loop;

  -- 4. close completed weeks (Mon..Sun): interest, saver bonus, no-savings rule, weekly targets
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
              order by m.created_at, m.id
    loop
      select coalesce(sum(x.amount) filter (where x.pot = 'savings' and x.effective_at < we_ts), 0),
             coalesce(sum(x.amount) filter (where x.pot = 'savings' and x.effective_at < ws_ts), 0),
             coalesce(sum(x.amount) filter (where x.pot = 'spending' and x.effective_at < we_ts), 0),
             coalesce(sum(x.amount) filter (where x.currency = 'money' and x.amount > 0
                        and x.kind in ('task_reward','bonus','gift','prize','allowance','excuse')
                        and x.effective_at >= ws_ts and x.effective_at < we_ts), 0)
        into sav_end, sav_start, spend_end, earned
        from public.transactions x where x.member_id = k.id;
      v_int := floor(greatest(sav_end, 0) * v_pct * 12 / (100 * 52))::int;
      if v_int > 0 then
        perform app.post(f.id, k.id, 'money', 'savings', v_int, 'interest', null, 'Interest on your savings', null,
                         'week', k.id, 'interest:' || ws, we_ts - interval '1 second');
      end if;
      if v_saver > 0 and sav_end > sav_start then
        perform app.post(f.id, k.id, 'points', 'points', v_saver, 'saver_bonus', null, 'Saver bonus: your savings grew this week',
                         null, 'week', k.id, 'saver_bonus:' || ws, we_ts - interval '1 second');
      end if;
      if v_nosave > 0 and earned > 0 and sav_end <= 0 and spend_end <= 0 then
        perform app.post(f.id, k.id, 'points', 'points', -v_nosave, 'no_savings_penalty', null,
                         'Nothing saved and nothing left this week', null, 'week', k.id, 'no_savings:' || ws,
                         we_ts - interval '1 second');
      end if;
    end loop;
    perform app.close_targets(f, 'week', ws, we);
    insert into public.period_runs(family_id, period, period_start) values (f.id, 'week', ws) on conflict do nothing;
    n_weeks := n_weeks + 1;
  end loop;

  -- 5. close completed months (monthly targets)
  v_last := (date_trunc('month', v_today) - interval '1 month')::date;
  v_first := greatest((v_last - interval '2 months')::date, date_trunc('month', v_created)::date);
  for ws in select d::date from generate_series(v_first, v_last, interval '1 month') d loop
    continue when exists (select 1 from public.period_runs where family_id = f.id and period = 'month' and period_start = ws);
    perform app.close_targets(f, 'month', ws, (ws + interval '1 month')::date);
    insert into public.period_runs(family_id, period, period_start) values (f.id, 'month', ws) on conflict do nothing;
    n_months := n_months + 1;
  end loop;

  update public.families set last_tick_at = v_now where id = f.id;
  return jsonb_build_object('instances_created', n_created, 'missed', n_missed, 'weeks_closed', n_weeks,
                            'months_closed', n_months);
end $$;

-- Any member may run the timed rules for their own family (the app does this on open).
create or replace function public.tick() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare me public.members;
begin
  me := app.me();
  return app.tick_family(me.family_id);
end $$;

-- pg_cron entry point (Supabase only). Never granted to API roles.
create or replace function app.tick_all() returns jsonb
language plpgsql as $$
declare v_fid uuid; n int := 0; v_err int := 0;
begin
  for v_fid in select id from public.families order by id loop
    begin
      perform app.tick_family(v_fid);
      n := n + 1;
    exception when others then
      v_err := v_err + 1;
      raise warning 'tick_family % failed: %', v_fid, sqlerrm;
    end;
  end loop;
  return jsonb_build_object('families', n, 'errors', v_err);
end $$;
