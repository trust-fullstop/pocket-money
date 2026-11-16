-- Grandparents may attach a photo to a gift: allow them to write into a KID's folder of their own family,
-- so the kid (who can read their own folder) sees it. Kids still only write their own folder.
create or replace function public.can_write_photo(p_path text) returns boolean
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare me public.members; parts text[] := string_to_array(coalesce(p_path, ''), '/');
begin
  select mb.* into me from public.member_logins l join public.members mb on mb.id = l.member_id
   where l.user_id = auth.uid() and mb.active;
  if not found or array_length(parts, 1) <> 3 or parts[1] is distinct from me.family_id::text then return false; end if;
  if parts[2] = 'avatars' or parts[2] = me.id::text or app.is_manager(me.role) then return true; end if;
  return me.role = 'grandparent' and exists (
    select 1 from public.members k where k.family_id = me.family_id and k.active and k.role = 'kid' and k.id::text = parts[2]);
end $$;

revoke all on function public.can_write_photo(text) from public, anon, authenticated;
grant execute on function public.can_write_photo(text) to authenticated;

-- Readers: same as before, plus whoever attached the photo to a ledger row (e.g. the grandparent who sent a gift).
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
                    and (i.before_path = p_path or i.after_path = p_path))
      or exists (select 1 from public.transactions x
                  where x.family_id = me.family_id and x.created_by = me.id and x.photo_path = p_path);
end $$;

revoke all on function public.can_read_photo(text) from public, anon, authenticated;
grant execute on function public.can_read_photo(text) to authenticated;
