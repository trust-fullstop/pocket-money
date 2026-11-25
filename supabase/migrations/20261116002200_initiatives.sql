-- "Look what I did ⭐" (proud moments): a kid shows something good they did on their own initiative, optionally
-- with a photo, and a parent rewards it (by default the family's Spotted reward rule), says thanks, or asks to talk.
-- * Uses the 'spotted' switch (no new key): while it is off kids can't send new ones, but waiting ones can still be
--   listed, decided and cancelled.
-- * public.initiatives: one row per proud moment. request_id (one per form on the phone) makes sending idempotent.
-- * A reward posts ledger rows like Spotted: kind 'bonus', source 'initiative' / id / 'money' | 'time' | 'points'.
--   The unique source index on transactions makes a double reward impossible.
-- * Limits per kid: 3 waiting, 5 sent per family-timezone day (cancelled ones count).
-- * Photos must be in the kid's own folder (<family>/<kid>/...). On Supabase the object must also exist in Storage
--   (checked dynamically: PGlite, used by the demo and the tests, has no storage schema).
-- * Removed kids: remove_member cancels their waiting proud moments, and list/decide/counts skip kids who are no
--   longer active (or no longer a kid).
-- * Locks: every path that changes a proud moment locks the kid's member row first, then the proud moment row.

-- ---------- 1. table ----------
create table if not exists public.initiatives (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  what text not null check (char_length(what) between 1 and 200),
  photo_path text,
  status text not null default 'waiting' check (status in ('waiting','rewarded','thanked','talk','cancelled')),
  decided_by uuid references public.members(id),
  decided_at timestamptz,
  decision_note text check (char_length(decision_note) <= 200),
  reward_cents int not null default 0 check (reward_cents >= 0),
  reward_minutes int not null default 0 check (reward_minutes >= 0),
  reward_points int not null default 0 check (reward_points >= 0),
  request_id uuid not null,
  created_at timestamptz not null default app.now(),
  constraint initiatives_request_uq unique (member_id, request_id)
);
create index if not exists initiatives_family_idx on public.initiatives(family_id, status, created_at);
alter table public.initiatives enable row level security;
revoke all on public.initiatives from public, anon, authenticated;

-- ---------- 2. helpers ----------
create or replace function app.initiative_json(i public.initiatives, me public.members) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'id', i.id, 'member_id', i.member_id, 'what', i.what, 'photo_path', i.photo_path, 'status', i.status,
    'decided_by', i.decided_by, 'decided_at', i.decided_at, 'decision_note', i.decision_note,
    'reward_cents', i.reward_cents, 'reward_minutes', i.reward_minutes, 'reward_points', i.reward_points,
    'created_at', i.created_at,
    'can_decide', i.status = 'waiting' and app.is_manager(me.role) and i.member_id <> me.id
                  and exists (select 1 from public.members m where m.id = i.member_id and m.active and m.role = 'kid'),
    'can_cancel', i.status = 'waiting' and i.member_id = me.id) $$;

create or replace function app.get_initiative(p_family uuid, p_id uuid) returns public.initiatives
language plpgsql stable as $$
declare i public.initiatives;
begin
  select * into i from public.initiatives where id = p_id and family_id = p_family;
  if not found then raise exception 'not_found' using detail = 'initiative'; end if;
  return i;
end $$;

-- Whitespace tidied; null when empty; at most 200 characters (detail = what was too long).
create or replace function app.initiative_text(p text, p_detail text) returns text language plpgsql immutable as $$
declare v text := nullif(regexp_replace(btrim(coalesce(p, '')), '\s+', ' ', 'g'), '');
begin
  if char_length(v) > 200 then raise exception 'invalid' using detail = p_detail; end if;
  return v;
end $$;

-- Does the photo exist? On Supabase: an object in the private 'photos' bucket. Databases without Storage (PGlite in
-- the demo and the tests) can't check, so there it is always true. Dynamic SQL, so this compiles without the schema.
create or replace function app.photo_exists(p_path text) returns boolean language plpgsql stable as $$
declare v boolean;
begin
  if to_regclass('storage.objects') is null then return true; end if;
  execute 'select exists (select 1 from storage.objects where bucket_id = $1 and name = $2)' into v using 'photos', p_path;
  return coalesce(v, false);
end $$;

-- ---------- 3. get_state: proud moments waiting ----------
-- Identical to 20261116002100_loans.sql except counts.initiatives: proud moments waiting for a grown-up. Managers see
-- the family's (active kids only), a kid sees their own, everyone else 0. Not tied to the switch: waiting ones can
-- still be decided while Spotted is off.
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
      -- challenges are hidden in the app while that feature is off, so they don't count either
      'approvals', (select count(*) from public.task_instances i join public.tasks t on t.id = i.task_id
                     where i.family_id = f.id and i.status = 'submitted'
                       and (t.kind <> 'challenge' or app.feature_on_s(s, 'challenges'))
                       and i.assignee_id <> me.id and (mgr or (t.created_by = me.id and t.reward_cents = 0 and t.reward_minutes = 0))),
      'requests', case when mgr then (select count(*) from public.requests r
                     where r.family_id = f.id and r.status = 'pending' and r.member_id <> me.id) else 0 end,
      'my_requests', (select count(*) from public.requests r where r.member_id = me.id and r.status = 'pending'),
      'loans', case when mgr and app.feature_on_s(s, 'loans') then (select count(*) from public.loans l
                  where l.family_id = f.id and l.status = 'requested') else 0 end,
      'initiatives', case
                       when mgr then (select count(*) from public.initiatives x join public.members k on k.id = x.member_id
                                       where x.family_id = f.id and x.status = 'waiting' and k.active and k.role = 'kid')
                       when me.role = 'kid' then (select count(*) from public.initiatives x
                                                   where x.member_id = me.id and x.status = 'waiting')
                       else 0 end),
    'today', app.today(f),
    'now', app.now());
end $$;

-- ---------- 4. remove_member: cancel the kid's waiting proud moments ----------
-- Identical to 20261116000100_api_core.sql plus the initiatives line.
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
  update public.initiatives set status = 'cancelled', decided_at = app.now() where member_id = m.id and status = 'waiting';
  perform app.audit(me.family_id, me.id, 'member.remove', jsonb_build_object('member', m.id, 'name', m.display_name));
  return jsonb_build_object('ok', true);
end $$;

-- ---------- 5. RPCs ----------
-- A kid sends a proud moment for themselves. p_request: one uuid per form; sending the same one again returns the
-- first row (a retry after a lost answer never makes a second one).
create or replace function public.submit_initiative(p_what text, p_photo text default null, p_request uuid default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare me public.members; f public.families; i public.initiatives; v_what text; v_photo text; v_folder text;
begin
  me := app.me();
  if me.role <> 'kid' then raise exception 'not_allowed'; end if;
  select * into f from public.families where id = me.family_id;
  perform app.require_feature(app.settings(f), 'spotted');
  if p_request is null then raise exception 'invalid' using detail = 'request'; end if;
  -- one at a time per kid, so the repeat check and the limits below can't race
  perform 1 from public.members where id = me.id for update;
  select * into i from public.initiatives where member_id = me.id and request_id = p_request;
  if found then return app.initiative_json(i, me); end if;

  v_what := app.initiative_text(p_what, 'what');
  if v_what is null then raise exception 'invalid' using detail = 'what'; end if;
  v_photo := nullif(btrim(coalesce(p_photo, '')), '');
  if v_photo is not null then
    perform app.check_path(f.id, v_photo);
    v_folder := f.id::text || '/' || me.id::text || '/';
    if left(v_photo, length(v_folder)) <> v_folder or not app.photo_exists(v_photo) then
      raise exception 'invalid' using detail = 'photo_path';
    end if;
  end if;
  if (select count(*) from public.initiatives where member_id = me.id and status = 'waiting') >= 3 then
    raise exception 'invalid' using detail = 'too_many_waiting';
  end if;
  if (select count(*) from public.initiatives
       where member_id = me.id and (created_at at time zone f.timezone)::date = app.today(f)) >= 5 then
    raise exception 'invalid' using detail = 'too_many_today';
  end if;

  insert into public.initiatives(family_id, member_id, what, photo_path, request_id)
  values (f.id, me.id, v_what, v_photo, p_request)
  returning * into i;
  perform app.audit(f.id, me.id, 'initiative.submit',
                    jsonb_build_object('initiative', i.id, 'member', me.id, 'what', i.what, 'photo', v_photo is not null));
  return app.initiative_json(i, me);
end $$;

-- 'waiting' (oldest first), 'done' (rewarded / thanked / talk, decided in the last 90 days, newest first, max 100) or
-- 'all' (newest first, max 100). Kids: their own. Managers: every active kid's. Everyone else: not_allowed.
create or replace function public.list_initiatives(p_status text default 'waiting') returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare me public.members; mgr boolean; v text := coalesce(p_status, 'waiting');
begin
  me := app.me();
  mgr := app.is_manager(me.role);
  if not mgr and me.role <> 'kid' then raise exception 'not_allowed'; end if;
  if v not in ('waiting','done','all') then raise exception 'invalid' using detail = 'status'; end if;
  return coalesce((select jsonb_agg(s.j order by s.o, s.i)
                     from (select app.initiative_json(x, me) as j, x.id as i,
                                  row_number() over (order by
                                    case when v = 'waiting' then x.created_at end asc,
                                    case when v = 'done' then x.decided_at end desc,
                                    case when v = 'all' then x.created_at end desc, x.id) as o
                             from public.initiatives x join public.members k on k.id = x.member_id
                            where x.family_id = me.family_id and k.active and k.role = 'kid'
                              and (mgr or x.member_id = me.id)
                              and case v
                                    when 'waiting' then x.status = 'waiting'
                                    when 'done' then x.status in ('rewarded','thanked','talk')
                                                     and x.decided_at >= app.now() - interval '90 days'
                                    else true end
                            order by 3
                            limit case when v = 'waiting' then null else 100 end) s), '[]'::jsonb);
end $$;

-- Managers: 'reward' (validated like Spotted; posts ledger rows), 'thanks' (no rows, note optional) or 'talk'
-- (note required: the kid sees "Let's talk about it 💬").
create or replace function public.decide_initiative(p_id uuid, p_decision text, p_cents int default 0,
  p_minutes int default 0, p_points int default 0, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare me public.members; m public.members; i public.initiatives; s jsonb; v_note text; v_reason text;
        c int := coalesce(p_cents, 0); mi int := coalesce(p_minutes, 0); pt int := coalesce(p_points, 0);
begin
  me := app.me();
  if not app.is_manager(me.role) then raise exception 'not_allowed'; end if;
  if p_decision is null or p_decision not in ('reward','thanks','talk') then
    raise exception 'invalid' using detail = 'decision';
  end if;
  i := app.get_initiative(me.family_id, p_id);
  m := app.get_member(me.family_id, i.member_id);  -- not_found when the kid left the family
  if m.role <> 'kid' then raise exception 'not_found' using detail = 'member'; end if;
  perform 1 from public.members where id = m.id for update;
  select * into i from public.initiatives where id = i.id for update;
  if i.status <> 'waiting' then raise exception 'wrong_status' using detail = 'initiative'; end if;
  v_note := app.initiative_text(p_note, 'note');

  if p_decision = 'reward' then
    if c not between 0 and 100000 then raise exception 'invalid' using detail = 'cents'; end if;
    if mi not between 0 and 1440 then raise exception 'invalid' using detail = 'minutes'; end if;
    if pt not between 0 and 10000 then raise exception 'invalid' using detail = 'points'; end if;
    if c + mi + pt = 0 then raise exception 'invalid' using detail = 'amount'; end if;
    s := app.family_settings(me.family_id);
    if mi > 0 then perform app.require_feature(s, 'time'); end if;
    if pt > 0 then perform app.require_feature(s, 'points'); end if;
    v_reason := 'Your idea: ' || i.what;
    perform app.post(me.family_id, m.id, 'money', 'spending', c, 'bonus', 'reward', v_reason, me.id,
                     'initiative', i.id, 'money', null, i.photo_path);
    perform app.post(me.family_id, m.id, 'time', null, mi, 'bonus', 'fun', v_reason, me.id,
                     'initiative', i.id, 'time', null, i.photo_path);
    perform app.post(me.family_id, m.id, 'points', null, pt, 'bonus', null, v_reason, me.id,
                     'initiative', i.id, 'points', null, i.photo_path);
    update public.initiatives
       set status = 'rewarded', reward_cents = c, reward_minutes = mi, reward_points = pt,
           decided_by = me.id, decided_at = app.now(), decision_note = v_note
     where id = i.id
    returning * into i;
    perform app.audit(me.family_id, me.id, 'initiative.reward',
                      jsonb_build_object('initiative', i.id, 'member', m.id, 'what', i.what,
                                         'cents', c, 'minutes', mi, 'points', pt, 'note', v_note));
  else
    if c <> 0 or mi <> 0 or pt <> 0 then raise exception 'invalid' using detail = 'amount'; end if;
    if p_decision = 'talk' and v_note is null then raise exception 'invalid' using detail = 'note'; end if;
    update public.initiatives
       set status = case p_decision when 'thanks' then 'thanked' else 'talk' end,
           decided_by = me.id, decided_at = app.now(), decision_note = v_note
     where id = i.id
    returning * into i;
    perform app.audit(me.family_id, me.id, 'initiative.' || p_decision,
                      jsonb_build_object('initiative', i.id, 'member', m.id, 'what', i.what, 'note', v_note));
  end if;
  return app.initiative_json(i, me);
end $$;

-- The kid takes back their own proud moment while it is still waiting.
create or replace function public.cancel_initiative(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare me public.members; i public.initiatives;
begin
  me := app.me();
  i := app.get_initiative(me.family_id, p_id);
  if i.member_id <> me.id then raise exception 'not_allowed'; end if;
  perform 1 from public.members where id = me.id for update;
  select * into i from public.initiatives where id = i.id for update;
  if i.status <> 'waiting' then raise exception 'wrong_status' using detail = 'initiative'; end if;
  update public.initiatives set status = 'cancelled', decided_at = app.now() where id = i.id returning * into i;
  perform app.audit(me.family_id, me.id, 'initiative.cancel',
                    jsonb_build_object('initiative', i.id, 'member', me.id, 'what', i.what));
  return app.initiative_json(i, me);
end $$;

-- ---------- 6. grants (Supabase grants EXECUTE on new functions by default, so revoke first) ----------
revoke all on function app.initiative_json(public.initiatives, public.members) from public, anon, authenticated;
revoke all on function app.get_initiative(uuid, uuid) from public, anon, authenticated;
revoke all on function app.initiative_text(text, text) from public, anon, authenticated;
revoke all on function app.photo_exists(text) from public, anon, authenticated;

revoke all on function public.get_state() from public, anon, authenticated;
revoke all on function public.remove_member(uuid) from public, anon, authenticated;
revoke all on function public.submit_initiative(text, text, uuid) from public, anon, authenticated;
revoke all on function public.list_initiatives(text) from public, anon, authenticated;
revoke all on function public.decide_initiative(uuid, text, int, int, int, text) from public, anon, authenticated;
revoke all on function public.cancel_initiative(uuid) from public, anon, authenticated;

grant execute on function public.get_state() to authenticated;
grant execute on function public.remove_member(uuid) to authenticated;
grant execute on function public.submit_initiative(text, text, uuid) to authenticated;
grant execute on function public.list_initiatives(text) to authenticated;
grant execute on function public.decide_initiative(uuid, text, int, int, int, text) to authenticated;
grant execute on function public.cancel_initiative(uuid) to authenticated;
