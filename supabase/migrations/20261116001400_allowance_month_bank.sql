-- =====================================================================
-- Pocket money per week OR per month (on a chosen day), and the kids' real bank balance.
-- =====================================================================

-- ---------- 1. allowance schedule ----------
alter table public.members
  add column if not exists allowance_period text not null default 'week' check (allowance_period in ('week','month')),
  add column if not exists allowance_day int not null default 1 check (allowance_day between 1 and 28),
  -- day the current schedule started: pay days before it are never paid (so setting pocket money mid-month
  -- doesn't pay this month's 1st retroactively). null = legacy rows (no restriction).
  add column if not exists allowance_since date;

-- ---------- 2. feature switch "bank" (real bank balance), on by default ----------
create or replace function app.feature_keys() returns text[] language sql immutable as $$
  select array['challenges','spotted','allowance','requests','savings','interest','saver_rules','goals','targets',
               'time','points','calendar','emergency','devices','ask','bank'] $$;

create or replace function app.default_features() returns jsonb language sql immutable as $$
  select '{"challenges":false,"spotted":true,"allowance":true,"requests":true,"savings":false,"interest":false,
           "saver_rules":false,"goals":false,"targets":false,"time":false,"points":true,"calendar":true,
           "emergency":true,"devices":false,"ask":false,"bank":true}'::jsonb $$;

-- ---------- 3. member JSON: schedule visible with the same rule as the amount ----------
create or replace function app.member_json(m public.members, me public.members, s jsonb) returns jsonb language sql stable as $$
  select jsonb_build_object(
    'id', m.id, 'role', m.role, 'relation', m.relation, 'display_name', m.display_name, 'avatar', m.avatar,
    'photo_path', m.photo_path, 'theme', m.theme, 'created_at', m.created_at,
    'allowance_cents', case when app.can_see_money(me, m, s) then m.allowance_cents end,
    'allowance_period', case when app.can_see_money(me, m, s) then m.allowance_period end,
    'allowance_day', case when app.can_see_money(me, m, s) then m.allowance_day end,
    'allowance_since', case when app.can_see_money(me, m, s) then m.allowance_since end,
    'profile', case when app.can_see_profile(me, m, s) then m.profile else null end,
    'linked', exists (select 1 from public.member_logins l where l.member_id = m.id),
    'username', case when me.id = m.id or app.is_manager(me.role) then m.username end,
    'has_password', m.password_hash is not null) $$;

-- ---------- 4. update_member: allowance_period / allowance_day (managers only) ----------
create or replace function public.update_member(p_member uuid, p_patch jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare me public.members; m public.members; f public.families;
  v_period text; v_day int; v_cents int; v_sched boolean;
begin
  me := app.me();
  m := app.get_member(me.family_id, p_member);
  if not app.can_edit_member(me, m) then raise exception 'not_allowed'; end if;
  if p_patch ? 'photo_path' then perform app.check_path(me.family_id, p_patch->>'photo_path'); end if;
  if p_patch ? 'theme' and (jsonb_typeof(p_patch->'theme') <> 'object' or length((p_patch->'theme')::text) > 2000) then
    raise exception 'invalid' using detail = 'theme'; end if;
  if p_patch ? 'profile' and (jsonb_typeof(p_patch->'profile') <> 'object' or length((p_patch->'profile')::text) > 8000) then
    raise exception 'invalid' using detail = 'profile'; end if;
  v_sched := p_patch ?| array['allowance_cents','allowance_period','allowance_day'];
  if v_sched and not app.is_manager(me.role) then raise exception 'not_allowed' using detail = 'allowance'; end if;
  if p_patch ? 'relation' and char_length(coalesce(trim(p_patch->>'relation'), '')) > 30 then
    raise exception 'invalid' using detail = 'relation'; end if;

  v_cents := case when p_patch ? 'allowance_cents' then (p_patch->>'allowance_cents')::int else m.allowance_cents end;
  v_period := coalesce(p_patch->>'allowance_period', m.allowance_period);
  v_day := case when p_patch ? 'allowance_day' then (p_patch->>'allowance_day')::int else m.allowance_day end;
  if v_sched then
    if v_cents is null or v_cents not between 0 and 100000 then raise exception 'invalid' using detail = 'allowance_cents'; end if;
    if v_period not in ('week','month') then raise exception 'invalid' using detail = 'allowance_period'; end if;
    -- switching the period without a day: weekly defaults to Monday, monthly to the 1st
    if p_patch ? 'allowance_period' and not p_patch ? 'allowance_day' and v_period <> m.allowance_period then v_day := 1; end if;
    if v_day is null or (v_period = 'week' and v_day not between 1 and 7) or (v_period = 'month' and v_day not between 1 and 28) then
      raise exception 'invalid' using detail = 'allowance_day';
    end if;
  end if;
  select * into f from public.families where id = me.family_id;

  update public.members set
    display_name = coalesce(nullif(trim(p_patch->>'display_name'), ''), display_name),
    avatar = coalesce(nullif(p_patch->>'avatar', ''), avatar),
    photo_path = case when p_patch ? 'photo_path' then p_patch->>'photo_path' else photo_path end,
    theme = case when p_patch ? 'theme' then p_patch->'theme' else theme end,
    profile = case when p_patch ? 'profile' then p_patch->'profile' else profile end,
    relation = case when p_patch ? 'relation' then nullif(trim(p_patch->>'relation'), '') else relation end,
    allowance_cents = v_cents,
    allowance_period = v_period,
    allowance_day = v_day,
    allowance_since = case
      when v_sched and (v_cents, v_period, v_day) is distinct from (m.allowance_cents, m.allowance_period, m.allowance_day)
        then app.today(f)
      else allowance_since end
  where id = m.id;
  perform app.audit(me.family_id, me.id, 'member.update',
    jsonb_build_object('member', m.id, 'fields', (select jsonb_agg(k) from jsonb_object_keys(p_patch) k)));
  return jsonb_build_object('ok', true);
end $$;

-- ---------- 5. pay days ----------
-- Most recent pay day on or before d for a schedule (weekly: ISO weekday 1..7; monthly: day 1..28).
create or replace function app.pay_day_on_or_before(d date, p_period text, p_day int) returns date language sql immutable as $$
  select case p_period
    when 'week' then d - ((extract(isodow from d)::int - p_day + 7) % 7)
    else case when extract(day from d)::int >= p_day
              then make_date(extract(year from d)::int, extract(month from d)::int, p_day)
              else (make_date(extract(year from d)::int, extract(month from d)::int, p_day) - interval '1 month')::date end
  end $$;

-- Pay every kid's pocket money for pay days since the previous run (catch-up after a paused project:
-- at most 12 weeks back). Never pays a day before the schedule started, before the kid joined, or before
-- the feature was switched on. Weekly keys stay 'allowance:<date>' (as before); monthly use 'allowance-m:<date>'.
-- Guard: a schedule change never pays twice inside one period.
create or replace function app.pay_allowances(f public.families) returns int language plpgsql as $$
declare k public.members; v_today date := app.today(f); v_last date; v_from date; d date; n int := 0;
  v_since_feature date := app.feature_since(f.id, 'allowance'); v_key text;
begin
  v_last := coalesce((f.last_tick_at at time zone f.timezone)::date, v_today);
  for k in select m.* from public.members m
            where m.family_id = f.id and m.active and m.role = 'kid' and m.allowance_cents > 0
            order by m.created_at, m.id
  loop
    v_from := greatest(app.pay_day_on_or_before(v_last, k.allowance_period, k.allowance_day),
                       v_today - 84,
                       (k.created_at at time zone f.timezone)::date,
                       coalesce(k.allowance_since, '-infinity'::date),
                       coalesce(app.pay_day_on_or_before(v_since_feature, k.allowance_period, k.allowance_day), '-infinity'::date));
    for d in select g::date from generate_series(v_from, v_today, interval '1 day') g
              where (k.allowance_period = 'week' and extract(isodow from g)::int = k.allowance_day)
                 or (k.allowance_period = 'month' and extract(day from g)::int = k.allowance_day)
              order by g
    loop
      v_key := case k.allowance_period when 'week' then 'allowance:' else 'allowance-m:' end || d;
      continue when exists (
        select 1 from public.transactions x
         where x.member_id = k.id and x.kind = 'allowance' and x.source_key <> v_key
           and x.source_key like case k.allowance_period when 'week' then 'allowance:%' else 'allowance-m:%' end
           and x.effective_at > app.local_ts(case k.allowance_period when 'week' then d - 7 else (d - interval '1 month')::date end,
                                             '00:00', f.timezone)
           and x.effective_at <= app.local_ts(d, '00:00', f.timezone));
      if app.post(f.id, k.id, 'money', 'spending', k.allowance_cents, 'allowance', 'pocket',
                  case k.allowance_period when 'week' then 'Weekly pocket money' else 'Monthly pocket money' end, null,
                  'week', k.id, v_key, app.local_ts(d, '00:00', f.timezone)) is not null then
        n := n + 1;
      end if;
    end loop;
  end loop;
  return n;
end $$;

-- tick_family: identical to 20261116000500_tick.sql except step 3 now calls app.pay_allowances.
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
             coalesce(sum(x.amount) filter (where x.pot = 'spending' and x.effective_at < we_ts), 0),
             coalesce(sum(x.amount) filter (where x.currency = 'money' and x.amount > 0
                        and x.kind in ('task_reward','bonus','gift','prize','allowance')
                        and x.effective_at >= ws_ts and x.effective_at < we_ts), 0)
        into sav_end, sav_start, spend_end, earned
        from public.transactions x where x.member_id = k.id;
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

-- ---------- 6. real bank balance (information only — never part of the app ledger) ----------
create table if not exists public.bank_balances (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  label text not null default 'Bank' check (char_length(label) between 1 and 40),
  amount_cents bigint not null check (amount_cents between -10000000 and 1000000000),
  as_of date not null,
  note text check (char_length(note) <= 200),
  created_by uuid references public.members(id) on delete set null,
  created_at timestamptz not null default app.now()
);
create index if not exists bank_balances_member_idx on public.bank_balances(member_id, as_of desc, created_at desc);
alter table public.bank_balances enable row level security;
revoke all on public.bank_balances from public, anon, authenticated;

create or replace function app.bank_json(b public.bank_balances, me public.members) returns jsonb language sql stable as $$
  select jsonb_build_object('id', b.id, 'member_id', b.member_id, 'label', b.label, 'amount_cents', b.amount_cents,
    'as_of', b.as_of, 'note', b.note, 'created_by', b.created_by, 'created_at', b.created_at,
    'can_delete', app.is_manager(me.role) or b.created_by = me.id) $$;

-- Record a balance: the member themself, or a manager for a kid.
create or replace function public.set_bank_balance(p_member uuid, p_amount_cents bigint, p_label text default null,
  p_as_of date default null, p_note text default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare me public.members; m public.members; f public.families; s jsonb; b public.bank_balances; v_today date;
begin
  me := app.me();
  m := app.get_member(me.family_id, p_member);
  select * into f from public.families where id = me.family_id;
  s := app.settings(f);
  perform app.require_feature(s, 'bank');
  if not (me.id = m.id or (app.is_manager(me.role) and m.role = 'kid')) then raise exception 'not_allowed'; end if;
  v_today := app.today(f);
  if p_amount_cents is null or p_amount_cents not between -10000000 and 1000000000 then raise exception 'invalid' using detail = 'amount'; end if;
  if p_as_of is not null and (p_as_of > v_today or p_as_of < v_today - 366) then raise exception 'invalid' using detail = 'as_of'; end if;
  if char_length(coalesce(trim(p_label), '')) > 40 then raise exception 'invalid' using detail = 'label'; end if;
  if char_length(coalesce(p_note, '')) > 200 then raise exception 'invalid' using detail = 'note'; end if;
  if (select count(*) from public.bank_balances where member_id = m.id and created_at > app.now() - interval '1 day') >= 20 then
    raise exception 'too_many_attempts';
  end if;
  insert into public.bank_balances(family_id, member_id, label, amount_cents, as_of, note, created_by)
    values (f.id, m.id, coalesce(nullif(trim(p_label), ''), 'Bank'), p_amount_cents, coalesce(p_as_of, v_today),
            nullif(trim(p_note), ''), me.id)
    returning * into b;
  perform app.audit(f.id, me.id, 'bank.set', jsonb_build_object('member', m.id, 'label', b.label));
  return app.bank_json(b, me);
end $$;

-- History, newest first. Same visibility as money (self, managers, grandparents if allowed).
create or replace function public.list_bank_balances(p_member uuid, p_limit int default 20) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare me public.members; m public.members; f public.families;
begin
  me := app.me();
  m := app.get_member(me.family_id, p_member);
  select * into f from public.families where id = me.family_id;
  if not app.can_see_money(me, m, app.settings(f)) then raise exception 'not_allowed'; end if;
  return coalesce((select jsonb_agg(app.bank_json(b, me) order by b.as_of desc, b.created_at desc)
                     from (select * from public.bank_balances where member_id = m.id
                            order by as_of desc, created_at desc limit least(greatest(coalesce(p_limit, 20), 1), 100)) b), '[]'::jsonb);
end $$;

create or replace function public.delete_bank_balance(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare me public.members; b public.bank_balances;
begin
  me := app.me();
  select * into b from public.bank_balances where id = p_id and family_id = me.family_id;
  if not found then raise exception 'not_found'; end if;
  if not (app.is_manager(me.role) or b.created_by = me.id) then raise exception 'not_allowed'; end if;
  delete from public.bank_balances where id = b.id;
  perform app.audit(me.family_id, me.id, 'bank.delete', jsonb_build_object('member', b.member_id, 'label', b.label));
  return jsonb_build_object('ok', true);
end $$;

-- ---------- 7. grants ----------
revoke all on function public.update_member(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.set_bank_balance(uuid, bigint, text, date, text) from public, anon, authenticated;
revoke all on function public.list_bank_balances(uuid, int) from public, anon, authenticated;
revoke all on function public.delete_bank_balance(uuid) from public, anon, authenticated;
grant execute on function public.update_member(uuid, jsonb) to authenticated;
grant execute on function public.set_bank_balance(uuid, bigint, text, date, text) to authenticated;
grant execute on function public.list_bank_balances(uuid, int) to authenticated;
grant execute on function public.delete_bank_balance(uuid) to authenticated;
revoke all on function app.pay_day_on_or_before(date, text, int) from public, anon, authenticated;
revoke all on function app.pay_allowances(public.families) from public, anon, authenticated;
revoke all on function app.bank_json(public.bank_balances, public.members) from public, anon, authenticated;
