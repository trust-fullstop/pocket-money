-- =====================================================================
-- Pocket Money — tasks (chores + challenges), instances, approvals
-- Approver rule (decision #4): approver <> assignee AND
--   (manager OR (task creator AND task has no money/time reward)).
-- All ledger writes go through app.post() with a source key, so a retry or a race can never pay twice.
-- =====================================================================

-- ---------- input helpers ----------
create or replace function app.int_in(p jsonb, k text, lo int, hi int, dflt int default 0) returns int
language plpgsql immutable as $$
declare v jsonb := p->k; n numeric;
begin
  if v is null or jsonb_typeof(v) = 'null' then return dflt; end if;
  if jsonb_typeof(v) = 'number' then n := (v #>> '{}')::numeric;
  elsif jsonb_typeof(v) = 'string' and (v #>> '{}') ~ '^\s*-?\d{1,9}\s*$' then n := trim(v #>> '{}')::numeric;
  else raise exception 'invalid' using detail = k;
  end if;
  if n <> trunc(n) or n < lo or n > hi then raise exception 'invalid' using detail = k; end if;
  return n::int;
end $$;

create or replace function app.text_in(p jsonb, k text, maxlen int) returns text
language plpgsql immutable as $$
declare v text;
begin
  if p is null or p->k is null or jsonb_typeof(p->k) = 'null' then return null; end if;
  if jsonb_typeof(p->k) not in ('string','number') then raise exception 'invalid' using detail = k; end if;
  v := nullif(trim(p->>k), '');
  if v is not null and char_length(v) > maxlen then raise exception 'invalid' using detail = k; end if;
  return v;
end $$;

create or replace function app.bool_in(p jsonb, k text, dflt boolean) returns boolean
language plpgsql immutable as $$
begin
  if p is null or p->k is null or jsonb_typeof(p->k) = 'null' then return dflt; end if;
  if jsonb_typeof(p->k) <> 'boolean' then raise exception 'invalid' using detail = k; end if;
  return (p->>k)::boolean;
end $$;

create or replace function app.to_uuid(v text, k text default 'id') returns uuid
language plpgsql immutable as $$
begin
  if v is null or trim(v) = '' then return null; end if;
  if trim(v) !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'invalid' using detail = k;
  end if;
  return trim(v)::uuid;
end $$;

create or replace function app.week_start(d date) returns date language sql immutable as $$
  select d - (extract(isodow from d)::int - 1) $$;

-- ---------- task helpers ----------
create or replace function app.task_occurs(t public.tasks, d date) returns boolean language sql immutable as $$
  select d >= t.start_on and (t.end_on is null or d <= t.end_on) and case t.repeat
    when 'once' then d = t.start_on
    when 'daily' then true
    when 'weekdays' then extract(isodow from d) between 1 and 5
    when 'weekly' then extract(isodow from d) = extract(isodow from t.start_on)
    when 'days' then extract(isodow from d)::int = any(t.repeat_days)
    else false end $$;

-- Create the instances of active tasks from max(start_on, today - catchup_days, task creation day)
-- to today + 7. Occurrences that were already due before the task existed are never created.
-- Idempotent: unique (task_id, occurs_on).
create or replace function app.materialise(f public.families, p_group uuid default null) returns int
language plpgsql as $$
declare s jsonb := app.settings(f); v_today date := app.today(f); n int;
begin
  insert into public.task_instances(task_id, family_id, assignee_id, occurs_on, due_at)
  select t.id, t.family_id, t.assignee_id, d::date, app.local_ts(d::date, t.due_time, f.timezone)
    from public.tasks t
    cross join lateral generate_series(
        greatest(t.start_on, v_today - coalesce((s->>'catchup_days')::int, 7), (t.created_at at time zone f.timezone)::date),
        least(v_today + 7, coalesce(t.end_on, v_today + 7)),
        interval '1 day') d
   where t.family_id = f.id and t.active and (p_group is null or t.group_id = p_group)
     and app.task_occurs(t, d::date)
     and app.local_ts(d::date, t.due_time, f.timezone) > t.created_at
  on conflict (task_id, occurs_on) do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function app.task_json(t public.tasks) returns jsonb language sql stable as $$
  select jsonb_build_object(
    'id', t.id, 'group_id', t.group_id, 'assignee_id', t.assignee_id, 'created_by', t.created_by,
    'active', t.active, 'created_at', t.created_at, 'kind', t.kind, 'title', t.title, 'details', t.details,
    'emoji', t.emoji, 'reward_cents', t.reward_cents, 'reward_minutes', t.reward_minutes,
    'reward_points', t.reward_points, 'reward_text', t.reward_text, 'time_label', t.time_label,
    'penalty_cents', t.penalty_cents, 'penalty_minutes', t.penalty_minutes, 'penalty_points', t.penalty_points,
    'repeat', t.repeat, 'repeat_days', to_jsonb(t.repeat_days), 'start_on', t.start_on, 'end_on', t.end_on,
    'due_time', left(t.due_time::text, 5), 'evidence', t.evidence) $$;

create or replace function app.can_decide(i public.task_instances, t public.tasks, me public.members) returns boolean
language sql stable as $$
  select i.status = 'submitted' and me.family_id = i.family_id and me.id <> i.assignee_id
     and (app.is_manager(me.role) or (t.created_by = me.id and t.reward_cents = 0 and t.reward_minutes = 0)) $$;

create or replace function app.instance_json(i public.task_instances, t public.tasks, me public.members) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'id', i.id, 'task_id', i.task_id, 'group_id', t.group_id, 'assignee_id', i.assignee_id,
    'occurs_on', i.occurs_on, 'due_at', i.due_at, 'status', i.status,
    'before_path', i.before_path, 'after_path', i.after_path, 'note', i.note,
    'submitted_at', i.submitted_at, 'decided_by', i.decided_by, 'decided_at', i.decided_at,
    'decision_note', i.decision_note,
    'kind', t.kind, 'title', t.title, 'details', t.details, 'emoji', t.emoji, 'created_by', t.created_by,
    'evidence', t.evidence, 'reward_cents', t.reward_cents, 'reward_minutes', t.reward_minutes,
    'reward_points', t.reward_points, 'reward_text', t.reward_text, 'time_label', t.time_label,
    'penalty_cents', t.penalty_cents, 'penalty_minutes', t.penalty_minutes, 'penalty_points', t.penalty_points,
    'partners', coalesce((select jsonb_agg(o.assignee_id order by o.created_at, o.id) from public.tasks o
                           where o.group_id = t.group_id and o.family_id = t.family_id and o.id <> t.id), '[]'::jsonb),
    'can_submit', me.id = i.assignee_id and i.status = 'open',
    'can_decide', app.can_decide(i, t, me),
    'can_excuse', app.is_manager(me.role) and i.status in ('open','missed') and me.id <> i.assignee_id) $$;

-- Validate a task patch over a base row. Non-managers (kids, grandparents) may never add or raise
-- money/time rewards or any penalty; their points are capped by challenge_points_cap.
-- Feature switches: challenges need 'challenges'; adding/raising minutes needs 'time', points needs 'points'.
create or replace function app.apply_task_patch(b public.tasks, p jsonb, me public.members, s jsonb) returns public.tasks
language plpgsql stable as $$
declare t public.tasks := b; v text; cap int := coalesce((s->>'challenge_points_cap')::int, 50);
begin
  if t.kind = 'challenge' then perform app.require_feature(s, 'challenges'); end if;
  if p ? 'title' then
    t.title := app.text_in(p, 'title', 80);
    if t.title is null then raise exception 'invalid' using detail = 'title'; end if;
  end if;
  if p ? 'details' then t.details := app.text_in(p, 'details', 500); end if;
  if p ? 'emoji' then t.emoji := coalesce(app.text_in(p, 'emoji', 16), '✅'); end if;
  if p ? 'reward_cents' then t.reward_cents := app.int_in(p, 'reward_cents', 0, 100000); end if;
  if p ? 'reward_minutes' then t.reward_minutes := app.int_in(p, 'reward_minutes', 0, 1440); end if;
  if p ? 'reward_points' then t.reward_points := app.int_in(p, 'reward_points', 0, 10000); end if;
  if p ? 'reward_text' then t.reward_text := app.text_in(p, 'reward_text', 120); end if;
  if p ? 'time_label' then
    v := coalesce(p->>'time_label', 'game');
    if v not in ('wifi','game','fun') then raise exception 'invalid' using detail = 'time_label'; end if;
    t.time_label := v;
  end if;
  if p ? 'penalty_cents' then t.penalty_cents := app.int_in(p, 'penalty_cents', 0, 100000); end if;
  if p ? 'penalty_minutes' then t.penalty_minutes := app.int_in(p, 'penalty_minutes', 0, 1440); end if;
  if p ? 'penalty_points' then t.penalty_points := app.int_in(p, 'penalty_points', 0, 10000); end if;
  if p ? 'due_time' then
    v := p->>'due_time';
    if v is null or v !~ '^([01]\d|2[0-3]):[0-5]\d(:00)?$' then raise exception 'invalid' using detail = 'due_time'; end if;
    t.due_time := v::time;
  end if;
  if p ? 'evidence' then
    v := coalesce(p->>'evidence', s->>'default_evidence', 'photo');
    if v not in ('photo','photo_or_note','none') then raise exception 'invalid' using detail = 'evidence'; end if;
    t.evidence := v;
  end if;
  if p ? 'end_on' then
    if p->>'end_on' is null or p->>'end_on' = '' then t.end_on := null;
    else
      t.end_on := app.try_date(p->>'end_on');
      if t.end_on is null then raise exception 'invalid' using detail = 'end_on'; end if;
    end if;
  end if;
  if t.end_on is not null and t.end_on < t.start_on then raise exception 'invalid' using detail = 'end_on'; end if;
  -- switched-off currencies: no new or higher minutes / points (existing values may stay or go down)
  if t.reward_minutes > coalesce(b.reward_minutes, 0) or t.penalty_minutes > coalesce(b.penalty_minutes, 0) then
    perform app.require_feature(s, 'time');
  end if;
  if t.reward_points > coalesce(b.reward_points, 0) or t.penalty_points > coalesce(b.penalty_points, 0) then
    perform app.require_feature(s, 'points');
  end if;
  if not app.is_manager(me.role) then
    if t.reward_cents > coalesce(b.reward_cents, 0) or t.reward_minutes > coalesce(b.reward_minutes, 0)
       or t.penalty_cents > coalesce(b.penalty_cents, 0) or t.penalty_minutes > coalesce(b.penalty_minutes, 0)
       or t.penalty_points > coalesce(b.penalty_points, 0) then
      raise exception 'not_allowed' using detail = 'money_or_time';
    end if;
    if t.reward_points > coalesce(b.reward_points, 0) then
      t.reward_points := greatest(coalesce(b.reward_points, 0), least(t.reward_points, cap));
    end if;
  end if;
  return t;
end $$;

-- ---------- RPCs ----------
create or replace function public.create_task(p_task jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare me public.members; f public.families; s jsonb; mgr boolean; b public.tasks; t public.tasks; m public.members;
  v_group uuid := gen_random_uuid(); v_ids uuid[] := '{}'; v_assignees uuid[] := '{}'; a uuid; d jsonb; v_days int[] := '{}';
begin
  me := app.me();
  select * into f from public.families where id = me.family_id;
  s := app.settings(f); mgr := app.is_manager(me.role);
  if p_task is null or jsonb_typeof(p_task) <> 'object' then raise exception 'invalid' using detail = 'task'; end if;

  if jsonb_typeof(p_task->'assignees') is distinct from 'array' or jsonb_array_length(p_task->'assignees') not between 1 and 10 then
    raise exception 'invalid' using detail = 'assignees';
  end if;
  for a in select u from (select app.to_uuid(x, 'assignees') as u, min(o) as o
                            from jsonb_array_elements_text(p_task->'assignees') with ordinality e(x, o) group by 1) z
           order by z.o loop
    m := app.get_member(me.family_id, a);
    v_assignees := v_assignees || m.id;
  end loop;
  if not mgr and v_assignees = array[me.id] then raise exception 'not_allowed' using detail = 'self_only'; end if;

  b.family_id := f.id; b.group_id := v_group; b.created_by := me.id; b.active := true;
  b.kind := coalesce(p_task->>'kind', 'chore');
  if b.kind not in ('chore','challenge') then raise exception 'invalid' using detail = 'kind'; end if;
  if not mgr then b.kind := 'challenge'; end if;
  b.emoji := '✅'; b.time_label := 'game'; b.due_time := '19:00';
  b.reward_cents := 0; b.reward_minutes := 0; b.reward_points := 0;
  b.penalty_cents := 0; b.penalty_minutes := 0; b.penalty_points := 0;
  b.evidence := coalesce(s->>'default_evidence', 'photo');
  b.repeat := coalesce(p_task->>'repeat', 'once');
  if b.repeat not in ('once','daily','weekdays','weekly','days') then raise exception 'invalid' using detail = 'repeat'; end if;
  if b.repeat = 'days' then
    if jsonb_typeof(p_task->'repeat_days') is distinct from 'array' then raise exception 'invalid' using detail = 'repeat_days'; end if;
    for d in select * from jsonb_array_elements(p_task->'repeat_days') loop
      if jsonb_typeof(d) <> 'number' or (d #>> '{}') !~ '^[1-7]$' then raise exception 'invalid' using detail = 'repeat_days'; end if;
    end loop;
    select coalesce(array_agg(distinct (x #>> '{}')::int order by (x #>> '{}')::int), '{}') into v_days
      from jsonb_array_elements(p_task->'repeat_days') x;
    if cardinality(v_days) = 0 then raise exception 'invalid' using detail = 'repeat_days'; end if;
  end if;
  b.repeat_days := v_days;
  if p_task->>'start_on' is null or p_task->>'start_on' = '' then b.start_on := app.today(f);
  else
    b.start_on := app.try_date(p_task->>'start_on');
    if b.start_on is null or b.start_on < app.today(f) - 366 or b.start_on > app.today(f) + 366 then
      raise exception 'invalid' using detail = 'start_on';
    end if;
  end if;
  if not (p_task ? 'title') then raise exception 'invalid' using detail = 'title'; end if;
  t := app.apply_task_patch(b, p_task, me, s);
  if t.repeat = 'once' and app.local_ts(t.start_on, t.due_time, f.timezone) <= app.now() then
    raise exception 'invalid' using detail = 'due_in_past';
  end if;

  foreach a in array v_assignees loop
    t.id := gen_random_uuid(); t.assignee_id := a; t.created_at := app.now();
    insert into public.tasks values (t.*);
    v_ids := v_ids || t.id;
  end loop;
  perform app.materialise(f, v_group);
  perform app.audit(f.id, me.id, 'task.create', jsonb_build_object('group', v_group, 'title', t.title, 'kind', t.kind,
    'assignees', to_jsonb(v_assignees), 'reward_cents', t.reward_cents, 'reward_minutes', t.reward_minutes,
    'reward_points', t.reward_points));
  return jsonb_build_object('group_id', v_group, 'task_ids', to_jsonb(v_ids));
end $$;

create or replace function public.update_task(p_group uuid, p_patch jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare me public.members; f public.families; s jsonb; b public.tasks; t public.tasks; v_today date;
begin
  me := app.me();
  select * into f from public.families where id = me.family_id;
  s := app.settings(f);
  perform 1 from public.tasks where group_id = p_group and family_id = me.family_id for update;
  select * into b from public.tasks where group_id = p_group and family_id = me.family_id order by created_at, id limit 1;
  if not found then raise exception 'not_found' using detail = 'task'; end if;
  if not (app.is_manager(me.role) or b.created_by = me.id) then raise exception 'not_allowed'; end if;
  if not b.active then raise exception 'wrong_status' using detail = 'task_stopped'; end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then raise exception 'invalid' using detail = 'patch'; end if;
  t := app.apply_task_patch(b, p_patch, me, s);
  update public.tasks set title = t.title, details = t.details, emoji = t.emoji,
    reward_cents = t.reward_cents, reward_minutes = t.reward_minutes, reward_points = t.reward_points,
    reward_text = t.reward_text, time_label = t.time_label,
    penalty_cents = t.penalty_cents, penalty_minutes = t.penalty_minutes, penalty_points = t.penalty_points,
    due_time = t.due_time, evidence = t.evidence, end_on = t.end_on
  where group_id = p_group and family_id = me.family_id;
  v_today := app.today(f);
  update public.task_instances i set due_at = app.local_ts(i.occurs_on, t.due_time, f.timezone)
   where i.family_id = f.id and i.status = 'open' and i.occurs_on >= v_today
     and i.task_id in (select id from public.tasks where group_id = p_group and family_id = f.id);
  if t.end_on is not null then
    update public.task_instances i set status = 'cancelled'
     where i.family_id = f.id and i.status = 'open' and i.occurs_on > t.end_on
       and i.task_id in (select id from public.tasks where group_id = p_group and family_id = f.id);
  end if;
  if b.active then perform app.materialise(f, p_group); end if;
  perform app.audit(f.id, me.id, 'task.update', jsonb_build_object('group', p_group, 'patch', p_patch));
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.archive_task(p_group uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare me public.members; f public.families; b public.tasks;
begin
  me := app.me();
  select * into f from public.families where id = me.family_id;
  perform 1 from public.tasks where group_id = p_group and family_id = me.family_id for update;
  select * into b from public.tasks where group_id = p_group and family_id = me.family_id order by created_at, id limit 1;
  if not found then raise exception 'not_found' using detail = 'task'; end if;
  if not (app.is_manager(me.role) or b.created_by = me.id) then raise exception 'not_allowed'; end if;
  update public.tasks set active = false where group_id = p_group and family_id = f.id;
  update public.task_instances i set status = 'cancelled'
   where i.family_id = f.id and i.status = 'open' and i.occurs_on >= app.today(f)
     and i.task_id in (select id from public.tasks where group_id = p_group and family_id = f.id);
  perform app.audit(f.id, me.id, 'task.archive', jsonb_build_object('group', p_group, 'title', b.title));
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.list_tasks() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare me public.members; mgr boolean;
begin
  me := app.me(); mgr := app.is_manager(me.role);
  return coalesce((select jsonb_agg(app.task_json(t) order by t.created_at, t.title, t.id)
                     from public.tasks t
                    where t.family_id = me.family_id and t.active
                      and (mgr or t.assignee_id = me.id or t.created_by = me.id)), '[]'::jsonb);
end $$;

create or replace function public.list_instances(p_from date, p_to date, p_member uuid default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare me public.members; see_all boolean;
begin
  me := app.me();
  see_all := app.is_manager(me.role) or me.role = 'grandparent';
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 62 then
    raise exception 'invalid' using detail = 'range';
  end if;
  if p_member is not null then perform app.get_member(me.family_id, p_member); end if;
  return coalesce((select jsonb_agg(app.instance_json(i, t, me) order by i.due_at, t.title, i.id)
    from public.task_instances i join public.tasks t on t.id = i.task_id
   where i.family_id = me.family_id and t.family_id = me.family_id
     and i.occurs_on between p_from and p_to and i.status <> 'cancelled'
     and (p_member is null or i.assignee_id = p_member)
     and (see_all or i.assignee_id = me.id or t.created_by = me.id)), '[]'::jsonb);
end $$;

-- Submitted work the caller may decide. Challenges are left out while the 'challenges' feature is off
-- (same as counts.approvals in get_state); deciding one directly still works.
create or replace function public.list_approvals() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare me public.members; v_challenges boolean;
begin
  me := app.me();
  v_challenges := app.feature_on(me.family_id, 'challenges');
  return coalesce((select jsonb_agg(app.instance_json(i, t, me) order by i.submitted_at, i.id)
    from public.task_instances i join public.tasks t on t.id = i.task_id
   where i.family_id = me.family_id and i.status = 'submitted' and (t.kind <> 'challenge' or v_challenges)
     and app.can_decide(i, t, me)), '[]'::jsonb);
end $$;

-- One instance (same visibility as list_instances; cancelled ones are visible here for deep links).
create or replace function public.get_instance(p_instance uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare me public.members; i public.task_instances; t public.tasks;
begin
  me := app.me();
  select * into i from public.task_instances where id = p_instance and family_id = me.family_id;
  if not found then raise exception 'not_found' using detail = 'instance'; end if;
  select * into t from public.tasks where id = i.task_id and family_id = me.family_id;
  if not found then raise exception 'not_found' using detail = 'task'; end if;
  if not (app.is_manager(me.role) or me.role = 'grandparent' or i.assignee_id = me.id or t.created_by = me.id) then
    raise exception 'not_found' using detail = 'instance';
  end if;
  return app.instance_json(i, t, me);
end $$;

create or replace function public.submit_task(p_instance uuid, p_before text default null, p_after text default null,
  p_note text default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare me public.members; i public.task_instances; t public.tasks;
  v_before text := nullif(trim(p_before), ''); v_after text := nullif(trim(p_after), ''); v_note text := nullif(trim(p_note), '');
begin
  me := app.me();
  select * into i from public.task_instances where id = p_instance and family_id = me.family_id for update;
  if not found then raise exception 'not_found' using detail = 'instance'; end if;
  if i.assignee_id <> me.id then raise exception 'not_allowed'; end if;
  if i.status <> 'open' then raise exception 'wrong_status'; end if;
  select * into t from public.tasks where id = i.task_id;
  perform app.check_path(me.family_id, v_before);
  perform app.check_path(me.family_id, v_after);
  -- evidence must live in the doer's own folder (stops pointing at someone else's photo)
  if (v_before is not null and split_part(v_before, '/', 2) <> me.id::text)
     or (v_after is not null and split_part(v_after, '/', 2) <> me.id::text) then
    raise exception 'invalid' using detail = 'photo_path';
  end if;
  if char_length(v_note) > 500 then raise exception 'invalid' using detail = 'note'; end if;
  if t.evidence = 'photo' and v_before is null and v_after is null then
    raise exception 'invalid' using detail = 'photo_required';
  end if;
  if t.evidence = 'photo_or_note' and v_before is null and v_after is null and v_note is null then
    raise exception 'invalid' using detail = 'evidence_required';
  end if;
  update public.task_instances set status = 'submitted', before_path = v_before, after_path = v_after, note = v_note,
    submitted_at = app.now()
  where id = i.id;
  perform app.audit(i.family_id, me.id, 'task.submit', jsonb_build_object('instance', i.id, 'title', t.title));
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.decide_task(p_instance uuid, p_approve boolean, p_note text default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare me public.members; i public.task_instances; t public.tasks; v_note text := nullif(trim(p_note), '');
begin
  me := app.me();
  select * into i from public.task_instances where id = p_instance and family_id = me.family_id for update;
  if not found then raise exception 'not_found' using detail = 'instance'; end if;
  select * into t from public.tasks where id = i.task_id;
  if not (me.id <> i.assignee_id
          and (app.is_manager(me.role) or (t.created_by = me.id and t.reward_cents = 0 and t.reward_minutes = 0))) then
    raise exception 'not_allowed';
  end if;
  if i.status <> 'submitted' then raise exception 'wrong_status'; end if;
  if p_approve is null then raise exception 'invalid' using detail = 'approve'; end if;
  if char_length(v_note) > 300 then raise exception 'invalid' using detail = 'note'; end if;
  if p_approve then
    update public.task_instances set status = 'approved', decided_by = me.id, decided_at = app.now(), decision_note = v_note
     where id = i.id;
    perform app.post(i.family_id, i.assignee_id, 'money', 'spending', t.reward_cents, 'task_reward', 'reward', t.title, me.id,
                     'task_instance', i.id, 'reward:money');
    -- minutes / points are only paid while that currency is switched on
    if app.feature_on(i.family_id, 'time') then
      perform app.post(i.family_id, i.assignee_id, 'time', 'time', t.reward_minutes, 'task_reward', t.time_label, t.title, me.id,
                       'task_instance', i.id, 'reward:time');
    end if;
    if app.feature_on(i.family_id, 'points') then
      perform app.post(i.family_id, i.assignee_id, 'points', 'points', t.reward_points, 'task_reward', null, t.title, me.id,
                       'task_instance', i.id, 'reward:points');
    end if;
  else
    if v_note is null then raise exception 'invalid' using detail = 'note'; end if;
    -- Sent back after the deadline: the doer gets 24 hours to try again before tick marks it missed.
    update public.task_instances set status = 'open', decided_by = me.id, decided_at = app.now(), decision_note = v_note,
      submitted_at = null, due_at = greatest(i.due_at, app.now() + interval '24 hours')
     where id = i.id;
  end if;
  perform app.audit(i.family_id, me.id, case when p_approve then 'task.approve' else 'task.reject' end,
    jsonb_build_object('instance', i.id, 'title', t.title, 'assignee', i.assignee_id, 'note', v_note));
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.excuse_task(p_instance uuid, p_note text default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare me public.members; i public.task_instances; t public.tasks; r record; v_tx uuid;
  v_note text := left(nullif(trim(p_note), ''), 300);
begin
  me := app.me();
  if not app.is_manager(me.role) then raise exception 'not_allowed'; end if;
  select * into i from public.task_instances where id = p_instance and family_id = me.family_id for update;
  if not found then raise exception 'not_found' using detail = 'instance'; end if;
  if i.assignee_id = me.id then raise exception 'not_allowed' using detail = 'own_task'; end if;
  select * into t from public.tasks where id = i.task_id;
  if i.status not in ('open','missed') then raise exception 'wrong_status'; end if;
  update public.task_instances set status = 'excused', decided_by = me.id, decided_at = app.now(), decision_note = v_note
   where id = i.id;
  if i.status = 'missed' then
    -- compensate exactly the penalties that were posted (and not already reversed) for this instance
    for r in select x.currency, x.pot, min(x.label) as label, -sum(x.amount)::int as amt, array_agg(x.id) as ids
               from public.transactions x
              where x.source_type = 'task_instance' and x.source_id = i.id and x.kind = 'task_penalty'
                and x.reversed_by is null and x.family_id = i.family_id
              group by x.currency, x.pot
    loop
      v_tx := app.post(i.family_id, i.assignee_id, r.currency, r.pot, r.amt, 'excuse', r.label,
                       left('Excused: ' || t.title, 200), me.id, 'task_instance', i.id, 'excuse:' || r.currency);
      if v_tx is not null then
        update public.transactions set reversed_by = v_tx where id = any(r.ids);
      end if;
    end loop;
  end if;
  perform app.audit(i.family_id, me.id, 'task.excuse', jsonb_build_object('instance', i.id, 'title', t.title,
    'assignee', i.assignee_id, 'was', i.status, 'note', v_note));
  return jsonb_build_object('ok', true);
end $$;
