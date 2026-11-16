-- Custom relationship label per member ("Bonus dad", "Godmother", "Uncle"…).
-- The role still decides what someone may do; the relation is only how the family names them.
alter table public.members add column if not exists relation text check (char_length(relation) <= 30);

create or replace function app.member_json(m public.members, me public.members, s jsonb) returns jsonb language sql stable as $$
  select jsonb_build_object(
    'id', m.id, 'role', m.role, 'relation', m.relation, 'display_name', m.display_name, 'avatar', m.avatar,
    'photo_path', m.photo_path, 'theme', m.theme, 'created_at', m.created_at,
    'allowance_cents', case when app.can_see_money(me, m, s) then m.allowance_cents end,
    'profile', case when app.can_see_profile(me, m, s) then m.profile else null end,
    'linked', exists (select 1 from public.member_logins l where l.member_id = m.id),
    'username', case when me.id = m.id or app.is_manager(me.role) then m.username end,
    'has_password', m.password_hash is not null) $$;

drop function if exists public.add_member(text, text, text);
create or replace function public.add_member(p_name text, p_role text, p_avatar text default null, p_relation text default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare me public.members; m public.members;
begin
  me := app.me();
  if not app.is_manager(me.role) then raise exception 'not_allowed'; end if;
  if p_role not in ('parent','step_parent','guardian','grandparent','kid') then raise exception 'invalid' using detail = 'role'; end if;
  if p_role in ('parent','step_parent','guardian') and me.role <> 'owner' and not app.managers_add_adults(me.family_id) then
    raise exception 'not_allowed' using detail = 'adults_owner_only';
  end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'invalid' using detail = 'name'; end if;
  if char_length(coalesce(trim(p_relation), '')) > 30 then raise exception 'invalid' using detail = 'relation'; end if;
  if (select count(*) from public.members where family_id = me.family_id and active) >= 30 then
    raise exception 'invalid' using detail = 'too_many_members';
  end if;
  insert into public.members(family_id, role, display_name, avatar, relation, created_by)
    values (me.family_id, p_role, trim(p_name),
            coalesce(nullif(p_avatar, ''), case when p_role = 'kid' then '🧒' when p_role = 'grandparent' then '👵' else '🙂' end),
            nullif(trim(p_relation), ''), me.id)
    returning * into m;
  perform app.audit(me.family_id, me.id, 'member.add',
    jsonb_build_object('member', m.id, 'name', m.display_name, 'role', m.role, 'relation', m.relation));
  return jsonb_build_object('member_id', m.id, 'invite', app.make_invite(me, m));
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
  if p_patch ? 'relation' and char_length(coalesce(trim(p_patch->>'relation'), '')) > 30 then
    raise exception 'invalid' using detail = 'relation'; end if;
  update public.members set
    display_name = coalesce(nullif(trim(p_patch->>'display_name'), ''), display_name),
    avatar = coalesce(nullif(p_patch->>'avatar', ''), avatar),
    photo_path = case when p_patch ? 'photo_path' then p_patch->>'photo_path' else photo_path end,
    theme = case when p_patch ? 'theme' then p_patch->'theme' else theme end,
    profile = case when p_patch ? 'profile' then p_patch->'profile' else profile end,
    relation = case when p_patch ? 'relation' then nullif(trim(p_patch->>'relation'), '') else relation end,
    allowance_cents = case when p_patch ? 'allowance_cents' then (p_patch->>'allowance_cents')::int else allowance_cents end
  where id = m.id;
  perform app.audit(me.family_id, me.id, 'member.update',
    jsonb_build_object('member', m.id, 'fields', (select jsonb_agg(k) from jsonb_object_keys(p_patch) k)));
  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.add_member(text, text, text, text) from public, anon, authenticated;
revoke all on function public.update_member(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.add_member(text, text, text, text) to authenticated;
grant execute on function public.update_member(uuid, jsonb) to authenticated;
