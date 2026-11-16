-- Private deployments: create THE family and its owner up front, before the website is published,
-- so the first stranger to open the site can't claim it. Returns a one-time join link token for the owner.
-- Run as the database owner (SQL editor / Management API), never callable from the app:
--   select * from app.provision_family('The Marks Family', 'Steve', '👨', 'Dad');
create or replace function app.provision_family(
  p_family_name text, p_owner_name text, p_avatar text default '🙂', p_relation text default null,
  p_timezone text default 'Europe/Amsterdam', p_currency text default 'EUR', p_valid interval default interval '24 hours')
returns table(family_id uuid, owner_member_id uuid, token text, short_code text, expires_at timestamptz)
language plpgsql as $$
declare f public.families; m public.members; v_token text; v_code text; v_exp timestamptz := app.now() + p_valid;
begin
  if exists (select 1 from public.families) then raise exception 'family_limit' using detail = 'already_provisioned'; end if;
  perform app.check_tz(p_timezone);
  insert into public.families(name, currency, timezone) values (trim(p_family_name), upper(p_currency), p_timezone) returning * into f;
  insert into public.members(family_id, role, display_name, avatar, relation)
    values (f.id, 'owner', trim(p_owner_name), coalesce(nullif(p_avatar, ''), '🙂'), nullif(trim(p_relation), '')) returning * into m;
  v_token := app.new_token(); v_code := app.new_short_code();
  insert into public.invites(family_id, member_id, token, short_code, created_by, expires_at)
    values (f.id, m.id, v_token, v_code, m.id, v_exp);
  perform app.audit(f.id, null, 'family.provision', jsonb_build_object('name', f.name));
  return query select f.id, m.id, v_token, v_code, v_exp;
end $$;

revoke all on function app.provision_family(text, text, text, text, text, text, interval) from public, anon, authenticated;
