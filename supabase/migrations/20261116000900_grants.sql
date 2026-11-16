-- =====================================================================
-- Pocket Money — the perimeter (decision #5).
-- Nothing is executable by PUBLIC / anon / authenticated unless granted here, one RPC at a time.
-- SECURITY DEFINER functions run as their owner, so they can still call app.* helpers.
-- app.tick_all() is never granted (pg_cron runs it as the owner).
-- =====================================================================
revoke all on all functions in schema public from public, anon, authenticated;
revoke all on all functions in schema app from public, anon, authenticated;
revoke all on schema app from public, anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
alter default privileges in schema app revoke execute on functions from public, anon, authenticated;
-- Per-schema defaults cannot remove the global "EXECUTE to PUBLIC" default, so drop that one too.
alter default privileges revoke execute on functions from public;

grant usage on schema public to authenticated;

-- family & state
grant execute on function public.create_family(text, text, text, text, text) to authenticated;
grant execute on function public.get_state() to authenticated;
grant execute on function public.update_family(jsonb) to authenticated;
grant execute on function public.delete_family(text) to authenticated;
grant execute on function public.list_audit(int) to authenticated;
grant execute on function public.tick() to authenticated;

-- members, joining & sign-in
grant execute on function public.add_member(text, text, text) to authenticated;
grant execute on function public.create_invite(uuid) to authenticated;
grant execute on function public.invite_preview(text) to authenticated;
grant execute on function public.redeem_invite(text, text) to authenticated;
grant execute on function public.set_credentials(text, text, uuid) to authenticated;
grant execute on function public.clear_credentials(uuid) to authenticated;
grant execute on function public.login_with_password(text, text, text) to authenticated;
grant execute on function public.list_logins(uuid) to authenticated;
grant execute on function public.remove_login(uuid) to authenticated;
grant execute on function public.set_login_label(text) to authenticated;
grant execute on function public.update_member(uuid, jsonb) to authenticated;
grant execute on function public.set_role(uuid, text) to authenticated;
grant execute on function public.remove_member(uuid) to authenticated;

-- tasks & challenges
grant execute on function public.create_task(jsonb) to authenticated;
grant execute on function public.update_task(uuid, jsonb) to authenticated;
grant execute on function public.archive_task(uuid) to authenticated;
grant execute on function public.list_tasks() to authenticated;
grant execute on function public.list_instances(date, date, uuid) to authenticated;
grant execute on function public.list_approvals() to authenticated;
grant execute on function public.get_instance(uuid) to authenticated;
grant execute on function public.submit_task(uuid, text, text, text) to authenticated;
grant execute on function public.decide_task(uuid, boolean, text) to authenticated;
grant execute on function public.excuse_task(uuid, text) to authenticated;

-- money, time, points
grant execute on function public.wallet(uuid, int) to authenticated;
grant execute on function public.history(uuid, text, timestamptz, int) to authenticated;
grant execute on function public.spot(jsonb) to authenticated;
grant execute on function public.reverse_transaction(uuid, text) to authenticated;
grant execute on function public.transfer(uuid, int, text) to authenticated;

-- requests, goals, targets
grant execute on function public.create_request(text, int, text, text) to authenticated;
grant execute on function public.decide_request(uuid, boolean, text) to authenticated;
grant execute on function public.cancel_request(uuid) to authenticated;
grant execute on function public.list_requests(text) to authenticated;
grant execute on function public.upsert_goal(jsonb) to authenticated;
grant execute on function public.archive_goal(uuid) to authenticated;
grant execute on function public.upsert_target(jsonb) to authenticated;
grant execute on function public.archive_target(uuid) to authenticated;

-- calendar & devices
grant execute on function public.list_events(timestamptz, timestamptz) to authenticated;
grant execute on function public.upsert_event(jsonb) to authenticated;
grant execute on function public.delete_event(uuid) to authenticated;
grant execute on function public.list_devices() to authenticated;
grant execute on function public.upsert_device(jsonb) to authenticated;
grant execute on function public.delete_device(uuid) to authenticated;

-- photo access checks (used by the Storage policies)
grant execute on function public.can_read_photo(text) to authenticated;
grant execute on function public.can_write_photo(text) to authenticated;
