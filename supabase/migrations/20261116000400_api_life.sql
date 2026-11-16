-- =====================================================================
-- Pocket Money — family calendar (events, reminders, birthdays) and devices
-- Repeats are expanded in the family's LOCAL time, so a weekly 17:00 lesson stays 17:00 across DST.
-- =====================================================================

-- Occurrences (local timestamps) of a repeating item within [from_l, to_l).
-- All-day items match on the local date, so an all-day item "today" is included even if from_l is mid-day.
create or replace function app.expand_occurrences(start_l timestamp, rep text, from_l timestamp, to_l timestamp, all_day boolean)
returns setof timestamp language plpgsql immutable as $$
declare k0 int; k1 int; step interval; lo timestamp := case when all_day then date_trunc('day', from_l) else from_l end;
begin
  if start_l is null then return; end if;
  if rep is null or rep = 'none' then
    if start_l >= lo and start_l < to_l then return next start_l; end if;
    return;
  end if;
  if rep = 'weekly' then
    step := interval '7 days';
    k0 := greatest(0, floor(extract(epoch from (lo - start_l)) / 604800)::int - 1);
    k1 := ceil(extract(epoch from (to_l - start_l)) / 604800)::int + 1;
  elsif rep = 'monthly' then
    step := interval '1 month';
    k0 := greatest(0, ((extract(year from lo) - extract(year from start_l)) * 12
                       + extract(month from lo) - extract(month from start_l))::int - 1);
    k1 := ((extract(year from to_l) - extract(year from start_l)) * 12 + extract(month from to_l) - extract(month from start_l))::int + 1;
  else
    step := interval '1 year';
    k0 := greatest(0, (extract(year from lo) - extract(year from start_l))::int - 1);
    k1 := (extract(year from to_l) - extract(year from start_l))::int + 1;
  end if;
  if k1 < k0 then return; end if;
  return query select start_l + k * step from generate_series(k0, k1) k
                where start_l + k * step >= lo and start_l + k * step < to_l;
end $$;

create or replace function public.list_events(p_from timestamptz, p_to timestamptz) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare me public.members; f public.families; mgr boolean; v_from timestamp; v_to timestamp;
begin
  me := app.me(); mgr := app.is_manager(me.role);
  select * into f from public.families where id = me.family_id;
  if p_from is null or p_to is null or p_to <= p_from or p_to - p_from > interval '400 days' then
    raise exception 'invalid' using detail = 'range';
  end if;
  v_from := p_from at time zone f.timezone;
  v_to := p_to at time zone f.timezone;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', o.id, 'source', o.source, 'title', o.title, 'notes', o.notes, 'emoji', o.emoji, 'kind', o.kind,
      'occurs_at', o.occurs_at, 'all_day', o.all_day, 'repeat', o.repeat, 'for_members', to_jsonb(o.for_members),
      'created_by', o.created_by, 'can_edit', o.can_edit) order by o.occurs_at, o.title, o.id)
    from (
      select e.id, 'event'::text as source, e.title, e.notes, e.emoji, e.kind, (x at time zone f.timezone) as occurs_at,
             e.all_day, e.repeat, e.for_members, e.created_by, (e.created_by = me.id or mgr) as can_edit
        from public.events e
        cross join lateral app.expand_occurrences(e.starts_at at time zone f.timezone, e.repeat, v_from, v_to, e.all_day) x
       where e.family_id = me.family_id
      union all
      select m.id, 'profile_birthday', m.display_name || '''s birthday',
             case when extract(year from x) > extract(year from b.bd)
                  then 'Turns ' || (extract(year from x) - extract(year from b.bd))::int end,
             '🎂', 'birthday', (x at time zone f.timezone), true, 'yearly', array[m.id], null::uuid, false
        from public.members m
        cross join lateral (select app.try_date(m.profile->>'birthday') as bd) b
        cross join lateral app.expand_occurrences(b.bd::timestamp, 'yearly', v_from, v_to, true) x
       where m.family_id = me.family_id and m.active and b.bd is not null
    ) o), '[]'::jsonb);
end $$;

create or replace function public.upsert_event(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare me public.members; f public.families; e public.events; v_id uuid; v_title text; v_notes text; v_emoji text;
  v_kind text; v_start timestamptz; v_all_day boolean; v_repeat text; v_for uuid[] := '{}'; a uuid; m public.members;
begin
  me := app.me();
  select * into f from public.families where id = me.family_id;
  perform app.require_feature(app.settings(f), 'calendar');
  if p is null or jsonb_typeof(p) <> 'object' then raise exception 'invalid' using detail = 'event'; end if;
  v_id := app.to_uuid(p->>'id', 'id');
  if v_id is not null then
    select * into e from public.events where id = v_id and family_id = me.family_id for update;
    if not found then raise exception 'not_found' using detail = 'event'; end if;
    if not (e.created_by = me.id or app.is_manager(me.role)) then raise exception 'not_allowed'; end if;
  end if;
  v_title := app.text_in(p, 'title', 80);
  if v_title is null then raise exception 'invalid' using detail = 'title'; end if;
  v_notes := app.text_in(p, 'notes', 500);
  v_emoji := coalesce(app.text_in(p, 'emoji', 16), '📅');
  v_kind := coalesce(p->>'kind', 'event');
  if v_kind not in ('event','reminder','birthday') then raise exception 'invalid' using detail = 'kind'; end if;
  v_all_day := app.bool_in(p, 'all_day', false);
  v_repeat := coalesce(p->>'repeat', 'none');
  if v_repeat not in ('none','weekly','monthly','yearly') then raise exception 'invalid' using detail = 'repeat'; end if;
  begin
    v_start := (p->>'starts_at')::timestamptz;
  exception when others then
    raise exception 'invalid' using detail = 'starts_at';
  end;
  if v_start is null then raise exception 'invalid' using detail = 'starts_at'; end if;
  if v_all_day then v_start := app.local_ts((v_start at time zone f.timezone)::date, '00:00', f.timezone); end if;
  if p ? 'for_members' and jsonb_typeof(p->'for_members') = 'array' then
    if jsonb_array_length(p->'for_members') > 30 then raise exception 'invalid' using detail = 'for_members'; end if;
    for a in select distinct app.to_uuid(x, 'for_members') from jsonb_array_elements_text(p->'for_members') x loop
      m := app.get_member(me.family_id, a);
      v_for := v_for || m.id;
    end loop;
  elsif p ? 'for_members' and jsonb_typeof(p->'for_members') <> 'null' then
    raise exception 'invalid' using detail = 'for_members';
  end if;
  if v_id is null then
    if (select count(*) from public.events where family_id = me.family_id) >= 2000 then
      raise exception 'invalid' using detail = 'too_many_events';
    end if;
    insert into public.events(family_id, title, notes, emoji, kind, starts_at, all_day, repeat, for_members, created_by)
      values (me.family_id, v_title, v_notes, v_emoji, v_kind, v_start, v_all_day, v_repeat, v_for, me.id)
      returning id into v_id;
    perform app.audit(me.family_id, me.id, 'event.create', jsonb_build_object('event', v_id, 'title', v_title));
  else
    update public.events set title = v_title, notes = v_notes, emoji = v_emoji, kind = v_kind, starts_at = v_start,
      all_day = v_all_day, repeat = v_repeat, for_members = v_for
    where id = v_id;
    perform app.audit(me.family_id, me.id, 'event.update', jsonb_build_object('event', v_id, 'title', v_title));
  end if;
  return jsonb_build_object('id', v_id);
end $$;

create or replace function public.delete_event(p_event uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare me public.members; e public.events;
begin
  me := app.me();
  select * into e from public.events where id = p_event and family_id = me.family_id for update;
  if not found then raise exception 'not_found' using detail = 'event'; end if;
  if not (e.created_by = me.id or app.is_manager(me.role)) then raise exception 'not_allowed'; end if;
  delete from public.events where id = e.id;
  perform app.audit(me.family_id, me.id, 'event.delete', jsonb_build_object('event', e.id, 'title', e.title));
  return jsonb_build_object('ok', true);
end $$;

-- ---------- devices ----------
create or replace function app.device_json(d public.devices) returns jsonb language sql stable as $$
  select jsonb_build_object('id', d.id, 'owner_id', d.owner_id, 'name', d.name, 'type', d.type, 'model', d.model,
    'phone_number', d.phone_number, 'mac', d.mac, 'ip', d.ip, 'notes', d.notes, 'created_at', d.created_at) $$;

create or replace function public.list_devices() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare me public.members; mgr boolean;
begin
  me := app.me(); mgr := app.is_manager(me.role);
  return coalesce((select jsonb_agg(app.device_json(d) order by d.name, d.id) from public.devices d
                    where d.family_id = me.family_id and (mgr or d.owner_id = me.id)), '[]'::jsonb);
end $$;

create or replace function public.upsert_device(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare me public.members; d public.devices; v_id uuid; v_owner uuid; v_name text; v_type text;
begin
  me := app.me();
  perform app.require_feature(app.family_settings(me.family_id), 'devices');
  if not app.is_manager(me.role) then raise exception 'not_allowed'; end if;
  if p is null or jsonb_typeof(p) <> 'object' then raise exception 'invalid' using detail = 'device'; end if;
  v_id := app.to_uuid(p->>'id', 'id');
  if v_id is not null then
    select * into d from public.devices where id = v_id and family_id = me.family_id for update;
    if not found then raise exception 'not_found' using detail = 'device'; end if;
  end if;
  v_owner := app.to_uuid(p->>'owner_id', 'owner_id');
  if v_owner is not null then v_owner := (app.get_member(me.family_id, v_owner)).id; end if;
  v_name := app.text_in(p, 'name', 60);
  if v_name is null then raise exception 'invalid' using detail = 'name'; end if;
  v_type := coalesce(p->>'type', 'phone');
  if v_type not in ('phone','tablet','console','pc','tv','watch','other') then raise exception 'invalid' using detail = 'type'; end if;
  if v_id is null then
    if (select count(*) from public.devices where family_id = me.family_id) >= 200 then
      raise exception 'invalid' using detail = 'too_many_devices';
    end if;
    insert into public.devices(family_id, owner_id, name, type, model, phone_number, mac, ip, notes, created_by)
      values (me.family_id, v_owner, v_name, v_type, app.text_in(p, 'model', 60), app.text_in(p, 'phone_number', 30),
              app.text_in(p, 'mac', 30), app.text_in(p, 'ip', 45), app.text_in(p, 'notes', 300), me.id)
      returning id into v_id;
    perform app.audit(me.family_id, me.id, 'device.create', jsonb_build_object('device', v_id, 'name', v_name));
  else
    update public.devices set owner_id = v_owner, name = v_name, type = v_type, model = app.text_in(p, 'model', 60),
      phone_number = app.text_in(p, 'phone_number', 30), mac = app.text_in(p, 'mac', 30), ip = app.text_in(p, 'ip', 45),
      notes = app.text_in(p, 'notes', 300)
    where id = v_id;
    perform app.audit(me.family_id, me.id, 'device.update', jsonb_build_object('device', v_id, 'name', v_name));
  end if;
  return jsonb_build_object('id', v_id);
end $$;

create or replace function public.delete_device(p_device uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare me public.members; d public.devices;
begin
  me := app.me();
  if not app.is_manager(me.role) then raise exception 'not_allowed'; end if;
  select * into d from public.devices where id = p_device and family_id = me.family_id for update;
  if not found then raise exception 'not_found' using detail = 'device'; end if;
  delete from public.devices where id = d.id;
  perform app.audit(me.family_id, me.id, 'device.delete', jsonb_build_object('device', d.id, 'name', d.name));
  return jsonb_build_object('ok', true);
end $$;
