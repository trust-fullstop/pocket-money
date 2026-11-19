-- "What we need" (feature 'needs', on by default): grown-ups note what each child needs (school shoes, a school bag…)
-- for an occasion ("New term", "Birthday", or one the family types in). Any adult can say "I'll get it" and tick it
-- off when it is bought, so everyone sees it's done, by whom and when.
-- * Adults = every non-kid member: parents, bonus parents, guardians and the grandparent role (also aunts, uncles,
--   godparents). Kids never see needs, so surprises stay surprises: every RPC refuses kids, get_state has no counts
--   and the activity log is managers-only.
-- * Every change is one conditional UPDATE (… and status = 'open' …), so two people can't claim the same need:
--   the second one gets wrong_status.

-- ---------- 1. feature switch ----------
create or replace function app.feature_keys() returns text[] language sql immutable as $$
  select array['challenges','spotted','allowance','requests','savings','interest','saver_rules','goals','targets',
               'time','points','calendar','emergency','devices','ask','bank','learn','faith','needs'] $$;

create or replace function app.default_features() returns jsonb language sql immutable as $$
  select '{"challenges":false,"spotted":true,"allowance":true,"requests":true,"savings":false,"interest":false,
           "saver_rules":false,"goals":false,"targets":false,"time":false,"points":true,"calendar":true,
           "emergency":true,"devices":false,"ask":false,"bank":true,"learn":true,"faith":false,"needs":true}'::jsonb $$;

-- ---------- 2. table ----------
-- claimed_by / done_by / created_by have no ON DELETE action: members are only ever soft-deleted (active = false),
-- and a deleted family removes its needs in the same statement.
create table if not exists public.needs (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  item text not null check (char_length(item) between 1 and 80),
  details text check (char_length(details) <= 300),
  occasion text not null check (char_length(occasion) between 1 and 40),
  status text not null default 'open' check (status in ('open','claimed','done','cancelled')),
  claimed_by uuid references public.members(id),
  claimed_at timestamptz,
  done_by uuid references public.members(id),
  done_at timestamptz,
  done_note text check (char_length(done_note) <= 200),
  created_by uuid references public.members(id),
  created_at timestamptz not null default app.now(),
  updated_at timestamptz not null default app.now(),
  constraint needs_claimed_has_claimer check (status <> 'claimed' or claimed_by is not null),
  constraint needs_done_has_who_and_when check (status <> 'done' or (done_by is not null and done_at is not null))
);
create index if not exists needs_family_idx on public.needs(family_id, status, created_at);
alter table public.needs enable row level security;
revoke all on public.needs from public, anon, authenticated;

-- ---------- 3. helpers ----------
-- Same list as NEED_DEFAULT_OCCASIONS in src/lib/types.ts.
create or replace function app.need_default_occasions() returns text[] language sql immutable as $$
  select array['Anytime','New term','Birthday','Christmas'] $$;

-- The caller, when they may use needs at all: adults only (kids → not_allowed), and the switch must be on.
create or replace function app.needs_me() returns public.members language plpgsql stable as $$
declare me public.members;
begin
  me := app.me();
  if me.role = 'kid' then raise exception 'not_allowed'; end if;
  perform app.require_feature(app.family_settings(me.family_id), 'needs');
  return me;
end $$;

-- Trimmed, single-spaced text; null when empty.
create or replace function app.need_clean(p text) returns text language sql immutable as $$
  select nullif(regexp_replace(btrim(coalesce(p, '')), '\s+', ' ', 'g'), '') $$;

-- Occasion as typed, spelled like a default or like the family already used it ("new term" → "New term").
-- Empty → 'Anytime'.
create or replace function app.need_occasion(p_family uuid, p text) returns text language plpgsql stable as $$
declare v text := app.need_clean(p); hit text;
begin
  if v is null then return 'Anytime'; end if;
  if char_length(v) > 40 then raise exception 'invalid' using detail = 'occasion'; end if;
  select x into hit from unnest(app.need_default_occasions()) x where lower(x) = lower(v);
  if hit is null then
    select n.occasion into hit from public.needs n
     where n.family_id = p_family and lower(n.occasion) = lower(v) order by n.created_at desc limit 1;
  end if;
  return coalesce(hit, v);
end $$;

create or replace function app.need_item(p text) returns text language plpgsql immutable as $$
declare v text := app.need_clean(p);
begin
  if v is null or char_length(v) > 80 then raise exception 'invalid' using detail = 'item'; end if;
  return v;
end $$;

create or replace function app.need_details(p text) returns text language plpgsql immutable as $$
declare v text := nullif(btrim(coalesce(p, '')), '');
begin
  if char_length(v) > 300 then raise exception 'invalid' using detail = 'details'; end if;
  return v;
end $$;

-- What the caller may do with a need (the buttons in the app). Managers may do everything that the status allows.
create or replace function app.need_json(n public.needs, me public.members) returns jsonb language sql stable as $$
  select jsonb_build_object(
    'id', n.id, 'member_id', n.member_id, 'item', n.item, 'details', n.details, 'occasion', n.occasion,
    'status', n.status, 'claimed_by', n.claimed_by, 'claimed_at', n.claimed_at, 'done_by', n.done_by,
    'done_at', n.done_at, 'done_note', n.done_note, 'created_by', n.created_by, 'created_at', n.created_at,
    'updated_at', n.updated_at,
    'can_edit', n.status = 'open' and (app.is_manager(me.role) or n.created_by = me.id),
    'can_claim', n.status = 'open',
    'can_release', n.status = 'claimed' and (app.is_manager(me.role) or n.claimed_by = me.id),
    'can_complete', n.status = 'open' or (n.status = 'claimed' and (app.is_manager(me.role) or n.claimed_by = me.id)),
    'can_reopen', n.status = 'done' and (app.is_manager(me.role) or n.done_by = me.id),
    'can_cancel', n.status in ('open','claimed') and (app.is_manager(me.role) or n.created_by = me.id)) $$;

-- Explains why a conditional UPDATE found no row: not_found (no such need in the family), wrong_status (someone
-- else changed it first), or else not_allowed (the caller may not do this).
create or replace function app.need_fail(p_family uuid, p_id uuid, p_ok text[]) returns void language plpgsql stable as $$
declare v_status text;
begin
  select status into v_status from public.needs where id = p_id and family_id = p_family;
  if not found then raise exception 'not_found' using detail = 'need'; end if;
  if not (v_status = any(p_ok)) then raise exception 'wrong_status' using detail = v_status; end if;
  raise exception 'not_allowed';
end $$;

create or replace function app.need_audit(me public.members, p_action text, n public.needs) returns void language plpgsql as $$
begin
  perform app.audit(n.family_id, me.id, p_action,
    jsonb_build_object('need', n.id, 'member', n.member_id, 'item', n.item, 'occasion', n.occasion));
end $$;

-- ---------- 4. RPCs ----------
-- 'active' = open + claimed (oldest first); 'done' = bought in the last 365 days (newest first, max 200);
-- 'all' = everything (newest first, max 500). Needs of removed kids are left out.
create or replace function public.list_needs(p_status text default 'active') returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare me public.members; v_status text := coalesce(p_status, 'active');
begin
  me := app.needs_me();
  if v_status not in ('active','done','all') then raise exception 'invalid' using detail = 'status'; end if;
  if v_status = 'active' then
    return coalesce((select jsonb_agg(app.need_json(n, me) order by n.created_at, n.id)
      from public.needs n join public.members m on m.id = n.member_id and m.active
     where n.family_id = me.family_id and n.status in ('open','claimed')), '[]'::jsonb);
  elsif v_status = 'done' then
    return coalesce((select jsonb_agg(app.need_json(x, me) order by x.done_at desc, x.id) from (
      select n.* from public.needs n join public.members m on m.id = n.member_id and m.active
       where n.family_id = me.family_id and n.status = 'done' and n.done_at >= app.now() - interval '365 days'
       order by n.done_at desc, n.id limit 200) x), '[]'::jsonb);
  end if;
  return coalesce((select jsonb_agg(app.need_json(x, me) order by x.created_at desc, x.id) from (
    select n.* from public.needs n join public.members m on m.id = n.member_id and m.active
     where n.family_id = me.family_id
     order by n.created_at desc, n.id limit 500) x), '[]'::jsonb);
end $$;

-- The defaults first (in their order), then the family's own occasions A→Z (case-insensitively unique).
create or replace function public.list_need_occasions() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare me public.members;
begin
  me := app.needs_me();
  return to_jsonb(app.need_default_occasions()) || coalesce((
    select jsonb_agg(u.occasion order by lower(u.occasion)) from (
      select distinct on (lower(n.occasion)) n.occasion from public.needs n
       where n.family_id = me.family_id
         and lower(n.occasion) <> all (select lower(x) from unnest(app.need_default_occasions()) x)
       order by lower(n.occasion), n.created_at desc) u), '[]'::jsonb);
end $$;

create or replace function public.add_need(p_member uuid, p_item text, p_occasion text, p_details text default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare me public.members; m public.members; n public.needs;
begin
  me := app.needs_me();
  m := app.get_member(me.family_id, p_member);
  if m.role <> 'kid' then raise exception 'invalid' using detail = 'member'; end if;
  if (select count(*) from public.needs where family_id = me.family_id and status in ('open','claimed')) >= 300 then
    raise exception 'invalid' using detail = 'too_many_needs';
  end if;
  insert into public.needs(family_id, member_id, item, occasion, details, created_by)
    values (me.family_id, m.id, app.need_item(p_item), app.need_occasion(me.family_id, p_occasion),
            app.need_details(p_details), me.id)
    returning * into n;
  perform app.need_audit(me, 'need.add', n);
  return app.need_json(n, me);
end $$;

-- Change the words of a need: whoever added it, or a manager, while nobody is getting it yet.
create or replace function public.update_need(p_id uuid, p_item text, p_occasion text, p_details text default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare me public.members; n public.needs; v_item text; v_occasion text; v_details text;
begin
  me := app.needs_me();
  v_item := app.need_item(p_item);
  v_occasion := app.need_occasion(me.family_id, p_occasion);
  v_details := app.need_details(p_details);
  update public.needs set item = v_item, occasion = v_occasion, details = v_details, updated_at = app.now()
   where id = p_id and family_id = me.family_id and status = 'open'
     and (app.is_manager(me.role) or created_by = me.id)
  returning * into n;
  if not found then perform app.need_fail(me.family_id, p_id, array['open']); end if;
  perform app.need_audit(me, 'need.update', n);
  return app.need_json(n, me);
end $$;

-- "I'll get it": any adult, only while nobody else is getting it.
create or replace function public.claim_need(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare me public.members; n public.needs;
begin
  me := app.needs_me();
  update public.needs set status = 'claimed', claimed_by = me.id, claimed_at = app.now(), updated_at = app.now()
   where id = p_id and family_id = me.family_id and status = 'open'
  returning * into n;
  if not found then perform app.need_fail(me.family_id, p_id, array['open']); end if;
  perform app.need_audit(me, 'need.claim', n);
  return app.need_json(n, me);
end $$;

-- "I can't get it after all": the person getting it, or a manager.
create or replace function public.release_need(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare me public.members; n public.needs;
begin
  me := app.needs_me();
  update public.needs set status = 'open', claimed_by = null, claimed_at = null, updated_at = app.now()
   where id = p_id and family_id = me.family_id and status = 'claimed'
     and (app.is_manager(me.role) or claimed_by = me.id)
  returning * into n;
  if not found then perform app.need_fail(me.family_id, p_id, array['claimed']); end if;
  perform app.need_audit(me, 'need.release', n);
  return app.need_json(n, me);
end $$;

-- "Bought": any adult while open; once someone is getting it, only that person or a manager.
create or replace function public.complete_need(p_id uuid, p_note text default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare me public.members; n public.needs; v_note text;
begin
  me := app.needs_me();
  v_note := nullif(btrim(coalesce(p_note, '')), '');
  if char_length(v_note) > 200 then raise exception 'invalid' using detail = 'note'; end if;
  update public.needs set status = 'done', done_by = me.id, done_at = app.now(), done_note = v_note, updated_at = app.now()
   where id = p_id and family_id = me.family_id
     and (status = 'open' or (status = 'claimed' and (app.is_manager(me.role) or claimed_by = me.id)))
  returning * into n;
  if not found then perform app.need_fail(me.family_id, p_id, array['open','claimed']); end if;
  perform app.need_audit(me, 'need.done', n);
  return app.need_json(n, me);
end $$;

-- Back on the list (e.g. the shoes didn't fit): whoever bought it, or a manager. Clears the claim and the purchase.
create or replace function public.reopen_need(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare me public.members; n public.needs;
begin
  me := app.needs_me();
  update public.needs set status = 'open', claimed_by = null, claimed_at = null, done_by = null, done_at = null,
         done_note = null, updated_at = app.now()
   where id = p_id and family_id = me.family_id and status = 'done'
     and (app.is_manager(me.role) or done_by = me.id)
  returning * into n;
  if not found then perform app.need_fail(me.family_id, p_id, array['done']); end if;
  perform app.need_audit(me, 'need.reopen', n);
  return app.need_json(n, me);
end $$;

-- Not needed any more: whoever added it, or a manager.
create or replace function public.cancel_need(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare me public.members; n public.needs;
begin
  me := app.needs_me();
  update public.needs set status = 'cancelled', updated_at = app.now()
   where id = p_id and family_id = me.family_id and status in ('open','claimed')
     and (app.is_manager(me.role) or created_by = me.id)
  returning * into n;
  if not found then perform app.need_fail(me.family_id, p_id, array['open','claimed']); end if;
  perform app.need_audit(me, 'need.cancel', n);
  return app.need_json(n, me);
end $$;

-- ---------- 5. grants (Supabase grants EXECUTE on new functions by default, so revoke first) ----------
revoke all on function app.feature_keys() from public, anon, authenticated;
revoke all on function app.default_features() from public, anon, authenticated;
revoke all on function app.need_default_occasions() from public, anon, authenticated;
revoke all on function app.needs_me() from public, anon, authenticated;
revoke all on function app.need_clean(text) from public, anon, authenticated;
revoke all on function app.need_occasion(uuid, text) from public, anon, authenticated;
revoke all on function app.need_item(text) from public, anon, authenticated;
revoke all on function app.need_details(text) from public, anon, authenticated;
revoke all on function app.need_json(public.needs, public.members) from public, anon, authenticated;
revoke all on function app.need_fail(uuid, uuid, text[]) from public, anon, authenticated;
revoke all on function app.need_audit(public.members, text, public.needs) from public, anon, authenticated;

revoke all on function public.list_needs(text) from public, anon, authenticated;
revoke all on function public.list_need_occasions() from public, anon, authenticated;
revoke all on function public.add_need(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.update_need(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.claim_need(uuid) from public, anon, authenticated;
revoke all on function public.release_need(uuid) from public, anon, authenticated;
revoke all on function public.complete_need(uuid, text) from public, anon, authenticated;
revoke all on function public.reopen_need(uuid) from public, anon, authenticated;
revoke all on function public.cancel_need(uuid) from public, anon, authenticated;

grant execute on function public.list_needs(text) to authenticated;
grant execute on function public.list_need_occasions() to authenticated;
grant execute on function public.add_need(uuid, text, text, text) to authenticated;
grant execute on function public.update_need(uuid, text, text, text) to authenticated;
grant execute on function public.claim_need(uuid) to authenticated;
grant execute on function public.release_need(uuid) to authenticated;
grant execute on function public.complete_need(uuid, text) to authenticated;
grant execute on function public.reopen_need(uuid) to authenticated;
grant execute on function public.cancel_need(uuid) to authenticated;
