-- =====================================================================
-- Pocket Money — helpers + family, members, joining, sign-in
-- Every public function is SECURITY DEFINER with a pinned search_path and
-- derives the caller from auth.uid() -> member_logins -> members.
-- Errors are raised as short codes (see src/lib/errors.ts).
-- =====================================================================

-- ---------- helpers (schema app is never exposed) ----------
create or replace function app.is_manager(r text) returns boolean language sql immutable as $$
  select r in ('owner','parent','step_parent','guardian') $$;

create or replace function app.role_rank(r text) returns int language sql immutable as $$
  select case r when 'owner' then 1 when 'parent' then 2 when 'step_parent' then 3 when 'guardian' then 4
                when 'grandparent' then 5 else 6 end $$;

create or replace function app.default_settings() returns jsonb language sql immutable as $$
  select '{"interest_pct_month":2,"saver_bonus_points":10,"no_savings_penalty_points":10,"late_grace_minutes":60,
           "challenge_points_cap":50,"grandparents_see_money":true,"emergency_visibility":"family",
           "catchup_days":7,"default_evidence":"photo"}'::jsonb $$;

create or replace function app.settings(f public.families) returns jsonb language sql stable as $$
  select app.default_settings() || coalesce(f.settings, '{}'::jsonb) $$;

create or replace function app.today(f public.families) returns date language sql stable as $$
  select (app.now() at time zone f.timezone)::date $$;

create or replace function app.local_ts(d date, t time, tz text) returns timestamptz language sql stable as $$
  select (d + t) at time zone tz $$;

create or replace function app.try_date(v text) returns date language plpgsql immutable as $$
begin
  if v is null or v !~ '^\d{4}-\d{2}-\d{2}$' then return null; end if;
  return v::date;
exception when others then return null;
end $$;

create or replace function app.check_tz(tz text) returns void language plpgsql stable as $$
begin
  perform now() at time zone tz;
exception when others then
  raise exception 'invalid' using detail = 'timezone';
end $$;

create or replace function app.me() returns public.members language plpgsql stable as $$
declare m public.members;
begin
  select mb.* into m from public.member_logins l join public.members mb on mb.id = l.member_id
   where l.user_id = auth.uid() and mb.active;
  if not found then raise exception 'not_member'; end if;
  return m;
end $$;

create or replace function app.get_member(p_family uuid, p_member uuid) returns public.members language plpgsql stable as $$
declare m public.members;
begin
  select * into m from public.members where id = p_member and family_id = p_family and active;
  if not found then raise exception 'not_found' using detail = 'member'; end if;
  return m;
end $$;

create or replace function app.can_see_money(me public.members, m public.members, s jsonb) returns boolean language sql stable as $$
  select me.family_id = m.family_id and (me.id = m.id or app.is_manager(me.role)
      or (me.role = 'grandparent' and coalesce((s->>'grandparents_see_money')::boolean, true))) $$;

create or replace function app.can_see_profile(me public.members, m public.members, s jsonb) returns boolean language sql stable as $$
  select me.family_id = m.family_id and (me.id = m.id or me.role <> 'kid' or coalesce(s->>'emergency_visibility','family') = 'family') $$;

-- Who may add devices / reset sign-in for whom. Adults who already have a login can only be
-- touched by the owner or themselves (prevents a co-parent taking over another adult's account).
create or replace function app.can_manage_login(me public.members, m public.members) returns boolean language sql stable as $$
  select me.family_id = m.family_id and (
       me.id = m.id
    or me.role = 'owner'
    or (app.is_manager(me.role) and m.role <> 'owner'
        and (m.role in ('kid','grandparent') or not exists (select 1 from public.member_logins l where l.member_id = m.id))))
$$;

create or replace function app.can_edit_member(me public.members, m public.members) returns boolean language sql stable as $$
  select me.family_id = m.family_id and (me.id = m.id or me.role = 'owner'
      or (app.is_manager(me.role) and m.role in ('kid','grandparent'))) $$;

create or replace function app.balances(p_member uuid) returns jsonb language sql stable as $$
  select jsonb_build_object(
    'spending', coalesce(sum(amount) filter (where pot = 'spending'), 0),
    'savings',  coalesce(sum(amount) filter (where pot = 'savings'), 0),
    'time',     coalesce(sum(amount) filter (where pot = 'time'), 0),
    'points',   coalesce(sum(amount) filter (where pot = 'points'), 0))
  from public.transactions where member_id = p_member $$;

create or replace function app.bal(p_member uuid, p_pot text) returns int language sql stable as $$
  select coalesce(sum(amount), 0)::int from public.transactions where member_id = p_member and pot = p_pot $$;

create or replace function app.post(
  p_family uuid, p_member uuid, p_currency text, p_pot text, p_amount int, p_kind text, p_label text,
  p_reason text, p_by uuid, p_source_type text default null, p_source_id uuid default null,
  p_source_key text default null, p_effective timestamptz default null, p_photo text default null)
returns uuid language plpgsql as $$
declare v_id uuid;
begin
  if p_amount is null or p_amount = 0 then return null; end if;
  insert into public.transactions(family_id, member_id, currency, pot, amount, kind, label, reason, photo_path,
                                  source_type, source_id, source_key, effective_at, created_by)
  values (p_family, p_member, p_currency,
          case p_currency when 'money' then coalesce(p_pot, 'spending') when 'time' then 'time' else 'points' end,
          p_amount, p_kind, p_label, left(coalesce(nullif(trim(p_reason), ''), p_kind), 200), p_photo,
          p_source_type, p_source_id, p_source_key, coalesce(p_effective, app.now()), p_by)
  on conflict do nothing
  returning id into v_id;
  return v_id;
end $$;

create or replace function app.audit(p_family uuid, p_actor uuid, p_action text, p_details jsonb default '{}'::jsonb)
returns void language sql as $$
  insert into public.audit_log(family_id, actor, action, details) values (p_family, p_actor, p_action, coalesce(p_details, '{}'::jsonb)) $$;

create or replace function app.check_path(p_family uuid, p_path text) returns void language plpgsql immutable as $$
begin
  if p_path is null then return; end if;
  if p_path !~ ('^' || p_family::text || '/[A-Za-z0-9_-]+/[A-Za-z0-9_.-]+$') or p_path like '%..%' then
    raise exception 'invalid' using detail = 'photo_path';
  end if;
end $$;

create or replace function app.new_token() returns text language sql volatile as $$
  select encode(extensions.gen_random_bytes(16), 'hex') $$;

create or replace function app.new_short_code() returns text language plpgsql volatile as $$
declare alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; b bytea := extensions.gen_random_bytes(8); s text := ''; i int;
begin
  for i in 0..7 loop s := s || substr(alphabet, (get_byte(b, i) % 32) + 1, 1); end loop;
  return s;
end $$;

create or replace function app.member_json(m public.members, me public.members, s jsonb) returns jsonb language sql stable as $$
  select jsonb_build_object(
    'id', m.id, 'role', m.role, 'display_name', m.display_name, 'avatar', m.avatar, 'photo_path', m.photo_path,
    'theme', m.theme, 'created_at', m.created_at, 'allowance_cents', m.allowance_cents,
    'profile', case when app.can_see_profile(me, m, s) then m.profile else null end,
    'linked', exists (select 1 from public.member_logins l where l.member_id = m.id),
    'username', case when me.id = m.id or app.is_manager(me.role) then m.username end,
    'has_password', m.password_hash is not null) $$;

-- ---------- family ----------
create or replace function public.create_family(p_family_name text, p_my_name text, p_avatar text default null,
  p_timezone text default 'Europe/Amsterdam', p_currency text default 'EUR')
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := auth.uid(); f public.families; m public.members;
begin
  if v_uid is null then raise exception 'not_signed_in'; end if;
  if exists (select 1 from public.member_logins where user_id = v_uid) then raise exception 'already_member'; end if;
  if coalesce(trim(p_family_name), '') = '' or coalesce(trim(p_my_name), '') = '' then raise exception 'invalid' using detail = 'name'; end if;
  perform app.check_tz(p_timezone);
  insert into public.families(name, currency, timezone) values (trim(p_family_name), upper(coalesce(p_currency, 'EUR')), p_timezone)
    returning * into f;
  insert into public.members(family_id, role, display_name, avatar)
    values (f.id, 'owner', trim(p_my_name), coalesce(nullif(p_avatar, ''), '🙂')) returning * into m;
  insert into public.member_logins(user_id, member_id, label) values (v_uid, m.id, 'First device');
  perform app.audit(f.id, m.id, 'family.create', jsonb_build_object('name', f.name));
  return jsonb_build_object('family_id', f.id, 'member_id', m.id);
end $$;

create or replace function public.get_state() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare me public.members; f public.families; s jsonb; mgr boolean;
begin
  me := app.me();
  select * into f from public.families where id = me.family_id;
  s := app.settings(f); mgr := app.is_manager(me.role);
  update public.member_logins set last_seen_at = app.now()
   where user_id = auth.uid() and last_seen_at < app.now() - interval '5 minutes';
  return jsonb_build_object(
    'me', app.member_json(me, me, s),
    'family', jsonb_build_object('id', f.id, 'name', f.name, 'currency', f.currency, 'timezone', f.timezone,
                                 'settings', s, 'created_at', f.created_at),
    'members', coalesce((select jsonb_agg(app.member_json(m, me, s) order by app.role_rank(m.role), m.display_name)
                           from public.members m where m.family_id = f.id and m.active), '[]'::jsonb),
    'balances', coalesce((select jsonb_object_agg(m.id, app.balances(m.id)) from public.members m
                           where m.family_id = f.id and m.active and app.can_see_money(me, m, s)), '{}'::jsonb),
    'counts', jsonb_build_object(
      'approvals', (select count(*) from public.task_instances i join public.tasks t on t.id = i.task_id
                     where i.family_id = f.id and i.status = 'submitted'
                       and i.assignee_id <> me.id and (mgr or (t.created_by = me.id and t.reward_cents = 0 and t.reward_minutes = 0))),
      'requests', case when mgr then (select count(*) from public.requests r
                     where r.family_id = f.id and r.status = 'pending' and r.member_id <> me.id) else 0 end,
      'my_requests', (select count(*) from public.requests r where r.member_id = me.id and r.status = 'pending')),
    'today', app.today(f),
    'now', app.now());
end $$;

create or replace function public.update_family(p_patch jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare me public.members; f public.families; k text; v jsonb; new_settings jsonb;
begin
  me := app.me();
  if not app.is_manager(me.role) then raise exception 'not_allowed'; end if;
  select * into f from public.families where id = me.family_id for update;
  new_settings := coalesce(f.settings, '{}'::jsonb);
  if p_patch ? 'settings' then
    for k, v in select * from jsonb_each(p_patch->'settings') loop
      if k = 'interest_pct_month' and jsonb_typeof(v) = 'number' and (v::text)::numeric between 0 and 20 then null;
      elsif k in ('saver_bonus_points','no_savings_penalty_points','challenge_points_cap') and jsonb_typeof(v) = 'number' and (v::text)::numeric between 0 and 1000 then null;
      elsif k = 'late_grace_minutes' and jsonb_typeof(v) = 'number' and (v::text)::numeric between 0 and 1440 then null;
      elsif k = 'catchup_days' and jsonb_typeof(v) = 'number' and (v::text)::numeric between 0 and 31 then null;
      elsif k = 'grandparents_see_money' and jsonb_typeof(v) = 'boolean' then null;
      elsif k = 'emergency_visibility' and v #>> '{}' in ('family','adults') then null;
      elsif k = 'default_evidence' and v #>> '{}' in ('photo','photo_or_note','none') then null;
      else raise exception 'invalid' using detail = 'setting:' || k;
      end if;
      new_settings := new_settings || jsonb_build_object(k, v);
    end loop;
  end if;
  if p_patch ? 'timezone' then perform app.check_tz(p_patch->>'timezone'); end if;
  if p_patch ? 'currency' and (p_patch->>'currency') !~ '^[A-Z]{3}$' then raise exception 'invalid' using detail = 'currency'; end if;
  update public.families set
    name = coalesce(nullif(trim(p_patch->>'name'), ''), name),
    currency = coalesce(p_patch->>'currency', currency),
    timezone = coalesce(p_patch->>'timezone', timezone),
    settings = new_settings
  where id = f.id;
  perform app.audit(f.id, me.id, 'family.update', p_patch);
  return public.get_state();
end $$;

create or replace function public.delete_family(p_confirm text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare me public.members; f public.families;
begin
  me := app.me();
  if me.role <> 'owner' then raise exception 'not_allowed'; end if;
  select * into f from public.families where id = me.family_id;
  if p_confirm is distinct from f.name then raise exception 'invalid' using detail = 'confirm'; end if;
  delete from public.families where id = f.id;
  return jsonb_build_object('deleted', true);
end $$;

create or replace function public.list_audit(p_limit int default 50) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare me public.members;
begin
  me := app.me();
  if not app.is_manager(me.role) then raise exception 'not_allowed'; end if;
  return coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at desc) from (
    select * from public.audit_log where family_id = me.family_id order by created_at desc limit least(coalesce(p_limit, 50), 200)) a), '[]'::jsonb);
end $$;

-- ---------- members ----------
create or replace function app.make_invite(me public.members, m public.members) returns jsonb language plpgsql as $$
declare tok text; code text; exp timestamptz := app.now() + interval '30 minutes';
begin
  update public.invites set expires_at = app.now() where member_id = m.id and used_at is null and expires_at > app.now();
  loop
    tok := app.new_token(); code := app.new_short_code();
    begin
      insert into public.invites(family_id, member_id, token, short_code, created_by, expires_at)
        values (m.family_id, m.id, tok, code, me.id, exp);
      exit;
    exception when unique_violation then
      -- extremely unlikely collision: try again
    end;
  end loop;
  perform app.audit(m.family_id, me.id, 'invite.create', jsonb_build_object('member', m.id, 'name', m.display_name));
  return jsonb_build_object('token', tok, 'short_code', code, 'expires_at', exp, 'member_id', m.id,
                            'display_name', m.display_name, 'role', m.role);
end $$;

create or replace function public.add_member(p_name text, p_role text, p_avatar text default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare me public.members; m public.members;
begin
  me := app.me();
  if not app.is_manager(me.role) then raise exception 'not_allowed'; end if;
  if p_role not in ('parent','step_parent','guardian','grandparent','kid') then raise exception 'invalid' using detail = 'role'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'invalid' using detail = 'name'; end if;
  if (select count(*) from public.members where family_id = me.family_id and active) >= 30 then
    raise exception 'invalid' using detail = 'too_many_members';
  end if;
  insert into public.members(family_id, role, display_name, avatar, created_by)
    values (me.family_id, p_role, trim(p_name), coalesce(nullif(p_avatar, ''), case when p_role = 'kid' then '🧒' when p_role = 'grandparent' then '👵' else '🙂' end), me.id)
    returning * into m;
  perform app.audit(me.family_id, me.id, 'member.add', jsonb_build_object('member', m.id, 'name', m.display_name, 'role', m.role));
  return jsonb_build_object('member_id', m.id, 'invite', app.make_invite(me, m));
end $$;

create or replace function public.create_invite(p_member uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare me public.members; m public.members;
begin
  me := app.me();
  m := app.get_member(me.family_id, p_member);
  if not app.can_manage_login(me, m) then raise exception 'not_allowed'; end if;
  return app.make_invite(me, m);
end $$;

create or replace function app.throttle_redeem() returns void language plpgsql as $$
begin
  if (select count(*) from public.redeem_attempts where user_id = auth.uid() and not ok and at > app.now() - interval '10 minutes') >= 10
     or (select count(*) from public.redeem_attempts where not ok and at > app.now() - interval '1 minute') >= 120 then
    raise exception 'too_many_attempts';
  end if;
end $$;

create or replace function app.find_invite(p_code text) returns public.invites language sql stable as $$
  select * from public.invites
   where token = lower(trim(coalesce(p_code, '')))
      or short_code = upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'))
   limit 1 $$;

-- Invalid codes return {ok:false} instead of raising so the failed attempt is recorded (throttling).
create or replace function public.invite_preview(p_code text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := auth.uid(); inv public.invites; m public.members; f public.families;
begin
  if v_uid is null then raise exception 'not_signed_in'; end if;
  perform app.throttle_redeem();
  inv := app.find_invite(p_code);
  if inv.id is null or inv.used_at is not null or inv.expires_at < app.now() then
    insert into public.redeem_attempts(user_id, ok) values (v_uid, false);
    return jsonb_build_object('ok', false, 'error', 'invite_invalid');
  end if;
  select * into m from public.members where id = inv.member_id and active;
  if not found then return jsonb_build_object('ok', false, 'error', 'invite_invalid'); end if;
  select * into f from public.families where id = inv.family_id;
  return jsonb_build_object('ok', true, 'family_name', f.name, 'display_name', m.display_name, 'role', m.role,
    'avatar', m.avatar, 'expires_at', inv.expires_at,
    'linked_elsewhere', exists (select 1 from public.member_logins where user_id = v_uid and member_id <> m.id));
end $$;

create or replace function public.redeem_invite(p_code text, p_label text default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := auth.uid(); inv public.invites; m public.members;
begin
  if v_uid is null then raise exception 'not_signed_in'; end if;
  perform app.throttle_redeem();
  select * into inv from public.invites where id = (app.find_invite(p_code)).id for update;
  if not found or inv.used_at is not null or inv.expires_at < app.now() then
    insert into public.redeem_attempts(user_id, ok) values (v_uid, false);
    return jsonb_build_object('ok', false, 'error', 'invite_invalid');
  end if;
  select * into m from public.members where id = inv.member_id and active;
  if not found then return jsonb_build_object('ok', false, 'error', 'invite_invalid'); end if;
  if exists (select 1 from public.member_logins where user_id = v_uid and member_id <> m.id) then
    return jsonb_build_object('ok', false, 'error', 'already_member');
  end if;
  insert into public.member_logins(user_id, member_id, label) values (v_uid, m.id, left(nullif(trim(p_label), ''), 40))
    on conflict (user_id) do nothing;
  update public.invites set used_at = app.now(), used_by = v_uid where id = inv.id;
  insert into public.redeem_attempts(user_id, ok) values (v_uid, true);
  perform app.audit(m.family_id, m.id, 'invite.redeem', jsonb_build_object('member', m.id));
  return jsonb_build_object('ok', true, 'member_id', m.id);
end $$;

create or replace function public.set_credentials(p_username text, p_password text, p_member uuid default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare me public.members; m public.members; v_user text := lower(trim(coalesce(p_username, '')));
begin
  me := app.me();
  m := app.get_member(me.family_id, coalesce(p_member, me.id));
  if not app.can_manage_login(me, m) then raise exception 'not_allowed'; end if;
  if v_user !~ '^[a-z0-9_.-]{3,24}$' then raise exception 'invalid' using detail = 'username'; end if;
  if char_length(coalesce(p_password, '')) not between 6 and 72 then raise exception 'invalid' using detail = 'password'; end if;
  begin
    update public.members set username = v_user,
      password_hash = extensions.crypt(p_password, extensions.gen_salt('bf', 8)),
      failed_logins = 0, locked_until = null
    where id = m.id;
  exception when unique_violation then
    raise exception 'username_taken';
  end;
  perform app.audit(me.family_id, me.id, 'login.set_password', jsonb_build_object('member', m.id));
  return jsonb_build_object('ok', true, 'username', v_user);
end $$;

create or replace function public.clear_credentials(p_member uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare me public.members; m public.members;
begin
  me := app.me();
  m := app.get_member(me.family_id, p_member);
  if not app.can_manage_login(me, m) then raise exception 'not_allowed'; end if;
  update public.members set username = null, password_hash = null, failed_logins = 0, locked_until = null where id = m.id;
  perform app.audit(me.family_id, me.id, 'login.clear_password', jsonb_build_object('member', m.id));
  return jsonb_build_object('ok', true);
end $$;

-- The caller signs in anonymously first, then attaches that session to the member.
create or replace function public.login_with_password(p_username text, p_password text, p_label text default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := auth.uid(); m public.members;
begin
  if v_uid is null then raise exception 'not_signed_in'; end if;
  perform app.throttle_redeem();
  select * into m from public.members where username = lower(trim(coalesce(p_username, ''))) and active for update;
  if not found then
    insert into public.redeem_attempts(user_id, ok) values (v_uid, false);
    return jsonb_build_object('ok', false, 'error', 'bad_login');
  end if;
  if m.locked_until is not null and m.locked_until > app.now() then
    return jsonb_build_object('ok', false, 'error', 'locked', 'until', m.locked_until);
  end if;
  if m.password_hash is null or extensions.crypt(coalesce(p_password, ''), m.password_hash) <> m.password_hash then
    update public.members set
      failed_logins = case when failed_logins + 1 >= 5 then 0 else failed_logins + 1 end,
      locked_until = case when failed_logins + 1 >= 5 then app.now() + interval '15 minutes' else locked_until end
    where id = m.id;
    insert into public.redeem_attempts(user_id, ok) values (v_uid, false);
    return jsonb_build_object('ok', false, 'error', 'bad_login');
  end if;
  if exists (select 1 from public.member_logins where user_id = v_uid and member_id <> m.id) then
    return jsonb_build_object('ok', false, 'error', 'already_member');
  end if;
  update public.members set failed_logins = 0, locked_until = null where id = m.id;
  insert into public.member_logins(user_id, member_id, label) values (v_uid, m.id, left(nullif(trim(p_label), ''), 40))
    on conflict (user_id) do nothing;
  perform app.audit(m.family_id, m.id, 'login.password', '{}'::jsonb);
  return jsonb_build_object('ok', true, 'member_id', m.id);
end $$;

create or replace function public.list_logins(p_member uuid default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare me public.members; m public.members;
begin
  me := app.me();
  m := app.get_member(me.family_id, coalesce(p_member, me.id));
  if not app.can_manage_login(me, m) then raise exception 'not_allowed'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', l.user_id, 'label', l.label, 'created_at', l.created_at,
            'last_seen_at', l.last_seen_at, 'current', l.user_id = auth.uid()) order by l.last_seen_at desc)
          from public.member_logins l where l.member_id = m.id), '[]'::jsonb);
end $$;

create or replace function public.remove_login(p_user_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare me public.members; m public.members; v_member uuid;
begin
  me := app.me();
  select member_id into v_member from public.member_logins where user_id = p_user_id;
  if not found then raise exception 'not_found'; end if;
  m := app.get_member(me.family_id, v_member);
  if not app.can_manage_login(me, m) then raise exception 'not_allowed'; end if;
  delete from public.member_logins where user_id = p_user_id;
  perform app.audit(me.family_id, me.id, 'login.remove', jsonb_build_object('member', m.id));
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.set_login_label(p_label text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare me public.members;
begin
  me := app.me();
  update public.member_logins set label = left(nullif(trim(p_label), ''), 40) where user_id = auth.uid();
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.update_member(p_member uuid, p_patch jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare me public.members; m public.members;
begin
  me := app.me();
  m := app.get_member(me.family_id, p_member);
  if not app.can_edit_member(me, m) then raise exception 'not_allowed'; end if;
  if p_patch ? 'photo_path' then perform app.check_path(me.family_id, p_patch->>'photo_path'); end if;
  if p_patch ? 'theme' and (jsonb_typeof(p_patch->'theme') <> 'object' or length((p_patch->'theme')::text) > 2000) then
    raise exception 'invalid' using detail = 'theme'; end if;
  if p_patch ? 'profile' and (jsonb_typeof(p_patch->'profile') <> 'object' or length((p_patch->'profile')::text) > 8000) then
    raise exception 'invalid' using detail = 'profile'; end if;
  if p_patch ? 'allowance_cents' and not app.is_manager(me.role) then raise exception 'not_allowed' using detail = 'allowance'; end if;
  update public.members set
    display_name = coalesce(nullif(trim(p_patch->>'display_name'), ''), display_name),
    avatar = coalesce(nullif(p_patch->>'avatar', ''), avatar),
    photo_path = case when p_patch ? 'photo_path' then p_patch->>'photo_path' else photo_path end,
    theme = case when p_patch ? 'theme' then p_patch->'theme' else theme end,
    profile = case when p_patch ? 'profile' then p_patch->'profile' else profile end,
    allowance_cents = case when p_patch ? 'allowance_cents' then (p_patch->>'allowance_cents')::int else allowance_cents end
  where id = m.id;
  perform app.audit(me.family_id, me.id, 'member.update',
    jsonb_build_object('member', m.id, 'fields', (select jsonb_agg(k) from jsonb_object_keys(p_patch) k)));
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.set_role(p_member uuid, p_role text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare me public.members; m public.members;
begin
  me := app.me();
  if me.role <> 'owner' then raise exception 'not_allowed'; end if;
  m := app.get_member(me.family_id, p_member);
  if m.id = me.id then raise exception 'not_allowed' using detail = 'self'; end if;
  if p_role not in ('owner','parent','step_parent','guardian','grandparent','kid') then raise exception 'invalid' using detail = 'role'; end if;
  if p_role = 'owner' then
    update public.members set role = 'parent' where id = me.id;
  end if;
  update public.members set role = p_role where id = m.id;
  perform app.audit(me.family_id, me.id, 'member.role', jsonb_build_object('member', m.id, 'role', p_role));
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.remove_member(p_member uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare me public.members; m public.members;
begin
  me := app.me();
  m := app.get_member(me.family_id, p_member);
  if m.id = me.id or m.role = 'owner' then raise exception 'not_allowed'; end if;
  if not (me.role = 'owner' or (app.is_manager(me.role) and app.can_manage_login(me, m))) then raise exception 'not_allowed'; end if;
  update public.members set active = false, username = null, password_hash = null where id = m.id;
  delete from public.member_logins where member_id = m.id;
  update public.invites set expires_at = app.now() where member_id = m.id and used_at is null;
  update public.tasks set active = false where assignee_id = m.id;
  update public.task_instances set status = 'cancelled' where assignee_id = m.id and status in ('open','submitted');
  update public.requests set status = 'cancelled' where member_id = m.id and status = 'pending';
  perform app.audit(me.family_id, me.id, 'member.remove', jsonb_build_object('member', m.id, 'name', m.display_name));
  return jsonb_build_object('ok', true);
end $$;

-- ---------- photo access (used by Supabase Storage policies) ----------
create or replace function public.can_read_photo(p_path text) returns boolean
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare me public.members; parts text[] := string_to_array(coalesce(p_path, ''), '/');
begin
  select mb.* into me from public.member_logins l join public.members mb on mb.id = l.member_id
   where l.user_id = auth.uid() and mb.active;
  if not found or parts[1] is distinct from me.family_id::text then return false; end if;
  if parts[2] = 'avatars' or parts[2] = me.id::text or app.is_manager(me.role) then return true; end if;
  return exists (select 1 from public.task_instances i join public.tasks t on t.id = i.task_id
                  where i.family_id = me.family_id and t.created_by = me.id
                    and (i.before_path = p_path or i.after_path = p_path));
end $$;

create or replace function public.can_write_photo(p_path text) returns boolean
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare me public.members; parts text[] := string_to_array(coalesce(p_path, ''), '/');
begin
  select mb.* into me from public.member_logins l join public.members mb on mb.id = l.member_id
   where l.user_id = auth.uid() and mb.active;
  if not found or array_length(parts, 1) <> 3 or parts[1] is distinct from me.family_id::text then return false; end if;
  return parts[2] = 'avatars' or parts[2] = me.id::text or app.is_manager(me.role);
end $$;
