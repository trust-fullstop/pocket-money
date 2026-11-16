-- =====================================================================
-- Pocket Money — wallet, tallies, ledger actions (spot, reverse, transfer), requests, goals, targets
--
-- Tally rules (period = [start, end) local dates in the family time zone, by transactions.effective_at):
--   money_earned  = positive money rows, except transfers   (task_reward, bonus, gift, prize, interest,
--                   allowance, excuse, saver_bonus and positive reversals)
--   money_lost    = |negative money rows| except transfers and spends (task_penalty, fine,
--                   no_savings_penalty and negative reversals)
--   money_spent   = |spend rows|;  money_saved = net transfer rows on the savings pot;  interest = interest rows
--   time_earned / time_lost / time_used and points_earned / points_lost follow the same sign rule.
--   A reversal is counted by its own sign: reversing a reward shows as "lost", reversing a fine as "earned".
-- =====================================================================

create or replace function app.tally(p_member uuid, f public.families, p_period text, p_start date, p_end date) returns jsonb
language sql stable as $$
  with b as (select app.local_ts(p_start, '00:00', f.timezone) as s, app.local_ts(p_end, '00:00', f.timezone) as e),
  tx as (select x.currency, x.pot, x.kind, x.amount from public.transactions x, b
          where x.member_id = p_member and x.effective_at >= b.s and x.effective_at < b.e),
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

create or replace function app.tx_json(t public.transactions, me public.members) returns jsonb language sql stable as $$
  select jsonb_build_object('id', t.id, 'member_id', t.member_id, 'currency', t.currency, 'pot', t.pot, 'amount', t.amount,
    'kind', t.kind, 'label', t.label, 'reason', t.reason, 'photo_path', t.photo_path, 'source_type', t.source_type,
    'source_id', t.source_id, 'reversed_by', t.reversed_by, 'effective_at', t.effective_at, 'created_at', t.created_at,
    'created_by', t.created_by,
    'can_reverse', app.is_manager(me.role) and me.family_id = t.family_id and t.member_id <> me.id
                   and t.kind not in ('transfer','reversal') and t.reversed_by is null) $$;

create or replace function app.request_json(r public.requests, me public.members) returns jsonb language sql stable as $$
  select jsonb_build_object('id', r.id, 'member_id', r.member_id, 'kind', r.kind, 'amount', r.amount, 'label', r.label,
    'note', r.note, 'status', r.status, 'decided_by', r.decided_by, 'decided_at', r.decided_at,
    'decision_note', r.decision_note, 'created_at', r.created_at,
    'can_decide', app.is_manager(me.role) and me.family_id = r.family_id and r.member_id <> me.id and r.status = 'pending',
    'can_cancel', r.member_id = me.id and r.status = 'pending') $$;

create or replace function app.goal_json(g public.goals) returns jsonb language sql stable as $$
  select to_jsonb(g) - 'family_id' $$;

-- Value of a target over [p_start, p_end). completion_pct counts approved AND submitted instances as done
-- (a late approval must not cost the kid the prize); cancelled/excused instances are left out.
-- Prizes themselves never count towards a target, and neither do refunds (excused fines, reversals).
create or replace function app.target_value(tg public.targets, f public.families, p_start date, p_end date) returns int
language sql stable as $$
  select case tg.metric
    when 'completion_pct' then (
      select case when count(*) = 0 then 0
                  else (100 * count(*) filter (where i.status in ('approved','submitted')) / count(*))::int end
        from public.task_instances i
       where i.assignee_id = tg.member_id and i.occurs_on >= p_start and i.occurs_on < p_end
         and i.status not in ('cancelled','excused'))
    when 'money_earned' then (
      select coalesce(sum(x.amount), 0)::int from public.transactions x
       where x.member_id = tg.member_id and x.currency = 'money' and x.amount > 0
         and x.kind not in ('transfer','prize','excuse','reversal')
         and x.effective_at >= app.local_ts(p_start, '00:00', f.timezone) and x.effective_at < app.local_ts(p_end, '00:00', f.timezone))
    else (
      select coalesce(sum(x.amount), 0)::int from public.transactions x
       where x.member_id = tg.member_id and x.currency = 'points' and x.amount > 0
         and x.kind not in ('prize','excuse','reversal')
         and x.effective_at >= app.local_ts(p_start, '00:00', f.timezone) and x.effective_at < app.local_ts(p_end, '00:00', f.timezone))
  end $$;

create or replace function app.period_bounds(p_period text, d date) returns daterange language sql immutable as $$
  select case p_period
    when 'week' then daterange(app.week_start(d), app.week_start(d) + 7)
    else daterange(date_trunc('month', d)::date, (date_trunc('month', d) + interval '1 month')::date) end $$;

create or replace function app.target_json(tg public.targets, f public.families) returns jsonb language sql stable as $$
  select (to_jsonb(tg) - 'family_id') || jsonb_build_object(
    'current_value', (select app.target_value(tg, f, lower(r), upper(r)) from app.period_bounds(tg.period, app.today(f)) r),
    'last_result', (select jsonb_build_object('period_start', x.period_start, 'value', x.value, 'met', x.met)
                      from public.target_results x where x.target_id = tg.id order by x.period_start desc limit 1)) $$;

-- ---------- wallet & history ----------
create or replace function public.wallet(p_member uuid, p_history_limit int default 50) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare me public.members; m public.members; f public.families; s jsonb; v_today date; ws date; ms date; ys date;
begin
  me := app.me();
  m := app.get_member(me.family_id, p_member);
  select * into f from public.families where id = me.family_id;
  s := app.settings(f);
  if not app.can_see_money(me, m, s) then raise exception 'not_allowed'; end if;
  v_today := app.today(f);
  ws := app.week_start(v_today);
  ms := date_trunc('month', v_today)::date;
  ys := make_date(extract(year from v_today)::int, 1, 1);
  return jsonb_build_object(
    'member', app.member_json(m, me, s),
    'balances', app.balances(m.id),
    'tallies', jsonb_build_object(
      'week', app.tally(m.id, f, 'week', ws, ws + 7),
      'month', app.tally(m.id, f, 'month', ms, (ms + interval '1 month')::date),
      'ytd', app.tally(m.id, f, 'ytd', ys, v_today + 1)),
    'history', coalesce((select jsonb_agg(z.j order by z.ea desc, z.ca desc, z.id desc) from (
        select app.tx_json(x, me) as j, x.effective_at as ea, x.created_at as ca, x.id
          from public.transactions x where x.member_id = m.id
         order by x.effective_at desc, x.created_at desc, x.id desc
         limit least(greatest(coalesce(p_history_limit, 50), 0), 200)) z), '[]'::jsonb),
    'goals', coalesce((select jsonb_agg(app.goal_json(g) order by g.created_at)
                         from public.goals g where g.member_id = m.id and not g.archived), '[]'::jsonb),
    'requests', coalesce((select jsonb_agg(z.j order by z.pending desc, z.ca desc) from (
        select app.request_json(r, me) as j, r.created_at as ca, true as pending
          from public.requests r where r.member_id = m.id and r.status = 'pending'
        union all
        (select app.request_json(r, me), r.created_at, false
           from public.requests r where r.member_id = m.id and r.status <> 'pending'
          order by coalesce(r.decided_at, r.created_at) desc limit 10)) z), '[]'::jsonb),
    'targets', coalesce((select jsonb_agg(app.target_json(tg, f) order by tg.period, tg.created_at)
                           from public.targets tg where tg.member_id = m.id and tg.active), '[]'::jsonb),
    'avg_weekly_savings_cents', greatest(0, (select coalesce(sum(x.amount), 0) from public.transactions x
        where x.member_id = m.id and x.pot = 'savings' and x.effective_at >= app.now() - interval '28 days') / 4)::int);
end $$;

create or replace function public.history(p_member uuid, p_currency text default null, p_before timestamptz default null,
  p_limit int default 50) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare me public.members; m public.members; f public.families;
begin
  me := app.me();
  m := app.get_member(me.family_id, p_member);
  select * into f from public.families where id = me.family_id;
  if not app.can_see_money(me, m, app.settings(f)) then raise exception 'not_allowed'; end if;
  if p_currency is not null and p_currency not in ('money','time','points') then raise exception 'invalid' using detail = 'currency'; end if;
  return coalesce((select jsonb_agg(z.j order by z.ea desc, z.ca desc, z.id desc) from (
      select app.tx_json(x, me) as j, x.effective_at as ea, x.created_at as ca, x.id
        from public.transactions x
       where x.member_id = m.id and (p_currency is null or x.currency = p_currency)
         and (p_before is null or x.effective_at < p_before)
       order by x.effective_at desc, x.created_at desc, x.id desc
       limit least(greatest(coalesce(p_limit, 50), 1), 200)) z), '[]'::jsonb);
end $$;

-- ---------- Spotted: bonus / fine / gift ----------
create or replace function public.spot(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare me public.members; m public.members; v_dir text; v_kind text; v_sign int; v_c int; v_min int; v_pts int;
  v_reason text; v_photo text; v_mlabel text; v_tlabel text; v_src uuid := gen_random_uuid(); v_ids uuid[] := '{}'; v_id uuid;
begin
  me := app.me();
  if me.role = 'kid' then raise exception 'not_allowed'; end if;
  if p is null or jsonb_typeof(p) <> 'object' then raise exception 'invalid' using detail = 'spot'; end if;
  v_dir := p->>'direction';
  if v_dir is null or v_dir not in ('plus','minus') then raise exception 'invalid' using detail = 'direction'; end if;
  if me.role = 'grandparent' and v_dir = 'minus' then raise exception 'not_allowed' using detail = 'gift_only'; end if;
  m := app.get_member(me.family_id, app.to_uuid(p->>'member_id', 'member_id'));
  if m.id = me.id or m.role <> 'kid' then raise exception 'not_allowed' using detail = 'member'; end if;
  v_c := app.int_in(p, 'cents', 0, 100000);
  v_min := app.int_in(p, 'minutes', 0, 1440);
  v_pts := app.int_in(p, 'points', 0, 10000);
  if v_c + v_min + v_pts = 0 then raise exception 'invalid' using detail = 'amount'; end if;
  v_reason := app.text_in(p, 'reason', 200);
  if v_reason is null then raise exception 'invalid' using detail = 'reason'; end if;
  v_photo := app.text_in(p, 'photo_path', 300);
  perform app.check_path(me.family_id, v_photo);
  v_kind := case when me.role = 'grandparent' then 'gift' when v_dir = 'plus' then 'bonus' else 'fine' end;
  v_sign := case when v_dir = 'plus' then 1 else -1 end;
  v_mlabel := coalesce(app.text_in(p, 'money_label', 20),
                       case when v_kind = 'gift' then 'gift' when v_dir = 'plus' then 'extra' end);
  if v_mlabel is not null and v_mlabel not in ('pocket','extra','reward','prize','gift') then
    raise exception 'invalid' using detail = 'money_label';
  end if;
  v_tlabel := coalesce(app.text_in(p, 'time_label', 20), 'fun');
  if v_tlabel not in ('wifi','game','fun') then raise exception 'invalid' using detail = 'time_label'; end if;
  v_id := app.post(me.family_id, m.id, 'money', 'spending', v_sign * v_c, v_kind, v_mlabel, v_reason, me.id,
                   'spot', v_src, 'money', null, v_photo);
  if v_id is not null then v_ids := v_ids || v_id; end if;
  v_id := app.post(me.family_id, m.id, 'time', 'time', v_sign * v_min, v_kind, v_tlabel, v_reason, me.id,
                   'spot', v_src, 'time', null, v_photo);
  if v_id is not null then v_ids := v_ids || v_id; end if;
  v_id := app.post(me.family_id, m.id, 'points', 'points', v_sign * v_pts, v_kind, null, v_reason, me.id,
                   'spot', v_src, 'points', null, v_photo);
  if v_id is not null then v_ids := v_ids || v_id; end if;
  perform app.audit(me.family_id, me.id, 'spot.' || v_kind, jsonb_build_object('member', m.id, 'cents', v_sign * v_c,
    'minutes', v_sign * v_min, 'points', v_sign * v_pts, 'reason', v_reason));
  return jsonb_build_object('ids', to_jsonb(v_ids));
end $$;

create or replace function public.reverse_transaction(p_tx uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare me public.members; x public.transactions; v_reason text := nullif(trim(p_reason), ''); v_id uuid;
begin
  me := app.me();
  if not app.is_manager(me.role) then raise exception 'not_allowed'; end if;
  select * into x from public.transactions where id = p_tx and family_id = me.family_id for update;
  if not found then raise exception 'not_found' using detail = 'transaction'; end if;
  if x.kind in ('transfer','reversal') or x.member_id = me.id then raise exception 'not_allowed'; end if;
  if x.reversed_by is not null then raise exception 'wrong_status'; end if;
  if v_reason is null then raise exception 'invalid' using detail = 'reason'; end if;
  v_id := app.post(x.family_id, x.member_id, x.currency, x.pot, -x.amount, 'reversal', x.label,
                   left('Reversed: ' || v_reason, 200), me.id, 'reversal', x.id, 'reverse');
  if v_id is null then raise exception 'wrong_status'; end if;
  update public.transactions set reversed_by = v_id where id = x.id;
  perform app.audit(me.family_id, me.id, 'tx.reverse', jsonb_build_object('tx', x.id, 'member', x.member_id,
    'currency', x.currency, 'amount', x.amount, 'kind', x.kind, 'reason', v_reason));
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.transfer(p_member uuid, p_amount int, p_to text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare me public.members; m public.members; v_src uuid := gen_random_uuid(); v_from text;
begin
  me := app.me();
  m := app.get_member(me.family_id, p_member);
  if p_amount is null or p_amount <= 0 or p_amount > 10000000 then raise exception 'invalid' using detail = 'amount'; end if;
  if p_to = 'savings' then
    if not (me.id = m.id or app.is_manager(me.role)) then raise exception 'not_allowed'; end if;
    v_from := 'spending';
  elsif p_to = 'spending' then
    -- kids (and grandparents) need a withdraw request; only managers move savings back directly
    if not app.is_manager(me.role) then raise exception 'not_allowed' using detail = 'withdraw_request'; end if;
    v_from := 'savings';
  else
    raise exception 'invalid' using detail = 'pot';
  end if;
  perform 1 from public.members where id = m.id for update;
  if app.bal(m.id, v_from) < p_amount then raise exception 'insufficient'; end if;
  perform app.post(m.family_id, m.id, 'money', v_from, -p_amount, 'transfer', null,
                   case when p_to = 'savings' then 'Moved to savings' else 'Moved to spending' end, me.id, 'transfer', v_src, 'from');
  perform app.post(m.family_id, m.id, 'money', p_to, p_amount, 'transfer', null,
                   case when p_to = 'savings' then 'Moved to savings' else 'Moved to spending' end, me.id, 'transfer', v_src, 'to');
  perform app.audit(m.family_id, me.id, 'money.transfer', jsonb_build_object('member', m.id, 'amount', p_amount, 'to', p_to));
  return jsonb_build_object('ok', true, 'balances', app.balances(m.id));
end $$;

-- ---------- requests ----------
create or replace function public.create_request(p_kind text, p_amount int, p_label text default null, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare me public.members; v_label text := nullif(trim(p_label), ''); v_note text := nullif(trim(p_note), ''); v_id uuid;
begin
  me := app.me();
  if p_kind is null or p_kind not in ('spend','withdraw','time') then raise exception 'invalid' using detail = 'kind'; end if;
  if p_amount is null or p_amount <= 0 or p_amount > (case when p_kind = 'time' then 1440 else 10000000 end) then
    raise exception 'invalid' using detail = 'amount';
  end if;
  if p_kind = 'time' then
    v_label := coalesce(v_label, 'fun');
    if v_label not in ('wifi','game','fun') then raise exception 'invalid' using detail = 'label'; end if;
  elsif char_length(v_label) > 60 then raise exception 'invalid' using detail = 'label';
  end if;
  if char_length(v_note) > 200 then raise exception 'invalid' using detail = 'note'; end if;
  perform 1 from public.members where id = me.id for update;
  if (select count(*) from public.requests where member_id = me.id and status = 'pending') >= 5 then
    raise exception 'invalid' using detail = 'too_many_requests';
  end if;
  if app.bal(me.id, case p_kind when 'spend' then 'spending' when 'withdraw' then 'savings' else 'time' end) < p_amount then
    raise exception 'insufficient';
  end if;
  insert into public.requests(family_id, member_id, kind, amount, label, note)
    values (me.family_id, me.id, p_kind, p_amount, v_label, v_note) returning id into v_id;
  perform app.audit(me.family_id, me.id, 'request.create', jsonb_build_object('request', v_id, 'kind', p_kind, 'amount', p_amount));
  return jsonb_build_object('id', v_id);
end $$;

create or replace function public.decide_request(p_request uuid, p_approve boolean, p_note text default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare me public.members; r public.requests; v_note text := left(nullif(trim(p_note), ''), 200); v_reason text;
begin
  me := app.me();
  if not app.is_manager(me.role) then raise exception 'not_allowed'; end if;
  select * into r from public.requests where id = p_request and family_id = me.family_id for update;
  if not found then raise exception 'not_found' using detail = 'request'; end if;
  if r.member_id = me.id then raise exception 'not_allowed' using detail = 'own_request'; end if;
  if r.status <> 'pending' then raise exception 'wrong_status'; end if;
  if p_approve is null then raise exception 'invalid' using detail = 'approve'; end if;
  if p_approve then
    perform 1 from public.members where id = r.member_id for update;
    v_reason := left(coalesce(nullif(concat_ws(' — ', r.label, r.note), ''),
                              case r.kind when 'spend' then 'Spend' when 'withdraw' then 'Withdraw from savings' else 'Time used' end), 200);
    if r.kind = 'spend' then
      if app.bal(r.member_id, 'spending') < r.amount then raise exception 'insufficient'; end if;
      perform app.post(r.family_id, r.member_id, 'money', 'spending', -r.amount, 'spend', null, v_reason, me.id,
                       'request', r.id, 'spend');
    elsif r.kind = 'withdraw' then
      if app.bal(r.member_id, 'savings') < r.amount then raise exception 'insufficient'; end if;
      perform app.post(r.family_id, r.member_id, 'money', 'savings', -r.amount, 'transfer', null,
                       left('From savings: ' || v_reason, 200), me.id, 'request', r.id, 'from');
      perform app.post(r.family_id, r.member_id, 'money', 'spending', r.amount, 'transfer', null,
                       left('From savings: ' || v_reason, 200), me.id, 'request', r.id, 'to');
    else
      if app.bal(r.member_id, 'time') < r.amount then raise exception 'insufficient'; end if;
      perform app.post(r.family_id, r.member_id, 'time', 'time', -r.amount, 'time_use', r.label, v_reason, me.id,
                       'request', r.id, 'time');
    end if;
  end if;
  update public.requests set status = case when p_approve then 'approved' else 'declined' end,
    decided_by = me.id, decided_at = app.now(), decision_note = v_note
  where id = r.id;
  perform app.audit(r.family_id, me.id, case when p_approve then 'request.approve' else 'request.decline' end,
    jsonb_build_object('request', r.id, 'member', r.member_id, 'kind', r.kind, 'amount', r.amount));
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.cancel_request(p_request uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare me public.members; r public.requests;
begin
  me := app.me();
  select * into r from public.requests where id = p_request and family_id = me.family_id for update;
  if not found then raise exception 'not_found' using detail = 'request'; end if;
  if r.member_id <> me.id then raise exception 'not_allowed'; end if;
  if r.status <> 'pending' then raise exception 'wrong_status'; end if;
  update public.requests set status = 'cancelled', decided_at = app.now() where id = r.id;
  perform app.audit(r.family_id, me.id, 'request.cancel', jsonb_build_object('request', r.id));
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.list_requests(p_status text default 'pending') returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare me public.members; mgr boolean; v_status text := coalesce(p_status, 'pending');
begin
  me := app.me(); mgr := app.is_manager(me.role);
  if v_status not in ('pending','all') then raise exception 'invalid' using detail = 'status'; end if;
  return coalesce((select jsonb_agg(app.request_json(r, me) order by r.created_at desc, r.id)
    from public.requests r
   where r.family_id = me.family_id and (mgr or r.member_id = me.id)
     and (r.status = 'pending' or (v_status = 'all' and r.created_at > app.now() - interval '60 days'))), '[]'::jsonb);
end $$;

-- ---------- goals ----------
create or replace function public.upsert_goal(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare me public.members; m public.members; g public.goals; v_id uuid; v_title text; v_target int; v_emoji text;
begin
  me := app.me();
  if p is null or jsonb_typeof(p) <> 'object' then raise exception 'invalid' using detail = 'goal'; end if;
  v_id := app.to_uuid(p->>'id', 'id');
  if v_id is not null then
    select * into g from public.goals where id = v_id and family_id = me.family_id for update;
    if not found then raise exception 'not_found' using detail = 'goal'; end if;
    m := app.get_member(me.family_id, g.member_id);
  else
    m := app.get_member(me.family_id, coalesce(app.to_uuid(p->>'member_id', 'member_id'), me.id));
  end if;
  if not (m.id = me.id or (app.is_manager(me.role) and m.role = 'kid')) then raise exception 'not_allowed'; end if;
  v_title := coalesce(app.text_in(p, 'title', 60), g.title);
  if v_title is null then raise exception 'invalid' using detail = 'title'; end if;
  v_target := app.int_in(p, 'target_cents', 1, 10000000, g.target_cents);
  if v_target is null then raise exception 'invalid' using detail = 'target_cents'; end if;
  v_emoji := coalesce(app.text_in(p, 'emoji', 16), g.emoji, '🎯');
  if v_id is null then
    if (select count(*) from public.goals where member_id = m.id and not archived) >= 20 then
      raise exception 'invalid' using detail = 'too_many_goals';
    end if;
    insert into public.goals(family_id, member_id, title, target_cents, emoji)
      values (me.family_id, m.id, v_title, v_target, v_emoji) returning * into g;
  else
    update public.goals set title = v_title, target_cents = v_target, emoji = v_emoji where id = g.id returning * into g;
  end if;
  perform app.audit(me.family_id, me.id, case when v_id is null then 'goal.create' else 'goal.update' end,
    jsonb_build_object('goal', g.id, 'member', m.id, 'title', g.title, 'target_cents', g.target_cents));
  return app.goal_json(g);
end $$;

create or replace function public.archive_goal(p_goal uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare me public.members; g public.goals; m public.members;
begin
  me := app.me();
  select * into g from public.goals where id = p_goal and family_id = me.family_id for update;
  if not found then raise exception 'not_found' using detail = 'goal'; end if;
  select * into m from public.members where id = g.member_id;
  if not (m.id = me.id or (app.is_manager(me.role) and m.role = 'kid')) then raise exception 'not_allowed'; end if;
  update public.goals set archived = true where id = g.id;
  perform app.audit(me.family_id, me.id, 'goal.archive', jsonb_build_object('goal', g.id, 'title', g.title));
  return jsonb_build_object('ok', true);
end $$;

-- ---------- targets ----------
create or replace function public.upsert_target(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare me public.members; f public.families; m public.members; tg public.targets; v_id uuid;
  v_title text; v_period text; v_metric text; v_threshold int; v_pc int; v_pm int; v_pp int; v_text text; v_tl text;
begin
  me := app.me();
  if not app.is_manager(me.role) then raise exception 'not_allowed'; end if;
  if p is null or jsonb_typeof(p) <> 'object' then raise exception 'invalid' using detail = 'target'; end if;
  select * into f from public.families where id = me.family_id;
  v_id := app.to_uuid(p->>'id', 'id');
  if v_id is not null then
    select * into tg from public.targets where id = v_id and family_id = me.family_id for update;
    if not found then raise exception 'not_found' using detail = 'target'; end if;
    m := app.get_member(me.family_id, tg.member_id);
  else
    m := app.get_member(me.family_id, app.to_uuid(p->>'member_id', 'member_id'));
    if m.role <> 'kid' then raise exception 'invalid' using detail = 'member'; end if;
  end if;
  v_title := coalesce(app.text_in(p, 'title', 80), tg.title);
  if v_title is null then raise exception 'invalid' using detail = 'title'; end if;
  v_period := coalesce(p->>'period', tg.period);
  if v_period is null or v_period not in ('week','month') then raise exception 'invalid' using detail = 'period'; end if;
  v_metric := coalesce(p->>'metric', tg.metric);
  if v_metric is null or v_metric not in ('completion_pct','money_earned','points_earned') then
    raise exception 'invalid' using detail = 'metric';
  end if;
  v_threshold := app.int_in(p, 'threshold', 0, case when v_metric = 'completion_pct' then 100 else 10000000 end, tg.threshold);
  if v_threshold is null then raise exception 'invalid' using detail = 'threshold'; end if;
  v_pc := app.int_in(p, 'prize_cents', 0, 100000, coalesce(tg.prize_cents, 0));
  v_pm := app.int_in(p, 'prize_minutes', 0, 1440, coalesce(tg.prize_minutes, 0));
  v_pp := app.int_in(p, 'prize_points', 0, 10000, coalesce(tg.prize_points, 0));
  v_text := case when p ? 'prize_text' then app.text_in(p, 'prize_text', 120) else tg.prize_text end;
  v_tl := coalesce(app.text_in(p, 'time_label', 20), tg.time_label, 'fun');
  if v_tl not in ('wifi','game','fun') then raise exception 'invalid' using detail = 'time_label'; end if;
  if v_id is null then
    if (select count(*) from public.targets where member_id = m.id and active) >= 20 then
      raise exception 'invalid' using detail = 'too_many_targets';
    end if;
    insert into public.targets(family_id, member_id, title, period, metric, threshold, prize_cents, prize_minutes,
                               prize_points, prize_text, time_label, created_by)
      values (me.family_id, m.id, v_title, v_period, v_metric, v_threshold, v_pc, v_pm, v_pp, v_text, v_tl, me.id)
      returning * into tg;
  else
    update public.targets set title = v_title, period = v_period, metric = v_metric, threshold = v_threshold,
      prize_cents = v_pc, prize_minutes = v_pm, prize_points = v_pp, prize_text = v_text, time_label = v_tl
    where id = tg.id returning * into tg;
  end if;
  perform app.audit(me.family_id, me.id, case when v_id is null then 'target.create' else 'target.update' end,
    jsonb_build_object('target', tg.id, 'member', m.id, 'title', tg.title));
  return app.target_json(tg, f);
end $$;

create or replace function public.archive_target(p_target uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare me public.members; tg public.targets;
begin
  me := app.me();
  if not app.is_manager(me.role) then raise exception 'not_allowed'; end if;
  select * into tg from public.targets where id = p_target and family_id = me.family_id for update;
  if not found then raise exception 'not_found' using detail = 'target'; end if;
  update public.targets set active = false where id = tg.id;
  perform app.audit(me.family_id, me.id, 'target.archive', jsonb_build_object('target', tg.id, 'title', tg.title));
  return jsonb_build_object('ok', true);
end $$;
