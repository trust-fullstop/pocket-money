-- @supabase-only
-- =====================================================================
-- Pocket Money — Supabase-only wiring (PGlite loaders skip this file).
-- * private Storage bucket "photos" (paths: <family_id>/<member_id>/<file>), access only via the SQL checks
-- * pg_cron job running the timed rules every 15 minutes
-- =====================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', false, 2097152, '{image/jpeg,image/png,image/webp}')
on conflict (id) do nothing;

-- Managers may delete photos of their own family (e.g. inappropriate pictures); nobody may overwrite.
create or replace function public.can_delete_photo(p_path text) returns boolean
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_member public.members;
begin
  select * into v_member from public.members m
   where m.id = (select ml.member_id from public.member_logins ml where ml.user_id = auth.uid()) and m.active;
  if not found or not app.is_manager(v_member.role) then return false; end if;
  return split_part(coalesce(p_path, ''), '/', 1) = v_member.family_id::text and public.can_write_photo(p_path);
end $$;
revoke all on function public.can_delete_photo(text) from public, anon, authenticated;
grant execute on function public.can_delete_photo(text) to authenticated;

drop policy if exists "pm photos read" on storage.objects;
drop policy if exists "pm photos insert" on storage.objects;
drop policy if exists "pm photos delete" on storage.objects;

create policy "pm photos read" on storage.objects for select to authenticated
  using (bucket_id = 'photos' and public.can_read_photo(name));
create policy "pm photos insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and public.can_write_photo(name));
create policy "pm photos delete" on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and public.can_delete_photo(name));
-- no update policy: photos are immutable evidence

create extension if not exists pg_cron with schema pg_catalog;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'pocket-money-tick') then
    perform cron.unschedule('pocket-money-tick');
  end if;
  perform cron.schedule('pocket-money-tick', '*/15 * * * *', $cron$select app.tick_all()$cron$);
end $$;
