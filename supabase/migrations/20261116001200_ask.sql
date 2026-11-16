-- =====================================================================
-- Pocket Money — "Ask Pocket" helper (feature 'ask', off by default).
-- The phone never talks to the AI directly. The Supabase Edge Function `ask` (supabase/functions/ask) does:
--   1. ask_begin(question)  — with the member's own JWT (role authenticated): checks the switch, the limits,
--                             stores the question as 'pending' and returns the context for the prompt;
--   2. calls Claude with the server-side key;
--   3. ask_finish(id, ...)  — with the service-role key ONLY (never granted to authenticated), so nobody can
--                             write or fake an answer from the app.
-- Parents can read every question (list_asks); kids and grandparents only their own.
-- =====================================================================

create table public.asks (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  question text not null check (char_length(question) between 3 and 500),
  answer text check (char_length(answer) <= 4000),
  status text not null default 'pending' check (status in ('pending','answered','failed')),
  model text check (char_length(model) <= 100),
  created_at timestamptz not null default app.now()
);
create index asks_family_idx on public.asks(family_id, created_at desc);
create index asks_member_idx on public.asks(member_id, created_at desc);

alter table public.asks enable row level security;
revoke all on public.asks from public, anon, authenticated;

create or replace function app.ask_json(a public.asks) returns jsonb language sql stable as $$
  select jsonb_build_object('id', a.id, 'member_id', a.member_id, 'question', a.question, 'answer', a.answer,
                            'status', a.status, 'created_at', a.created_at) $$;

-- Newest first. Managers: the whole family, or one member. Everyone else: only their own questions.
create or replace function public.list_asks(p_member uuid default null, p_limit int default 50) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare me public.members; v_member uuid;
begin
  me := app.me();
  if p_member is not null then
    v_member := (app.get_member(me.family_id, p_member)).id;
    if v_member <> me.id and not app.is_manager(me.role) then raise exception 'not_allowed'; end if;
  elsif not app.is_manager(me.role) then
    v_member := me.id;
  end if;
  return coalesce((select jsonb_agg(app.ask_json(z) order by z.created_at desc, z.id desc) from (
      select * from public.asks a
       where a.family_id = me.family_id and (v_member is null or a.member_id = v_member)
       order by a.created_at desc, a.id desc
       limit least(greatest(coalesce(p_limit, 50), 1), 200)) z), '[]'::jsonb);
end $$;

-- Called by the Edge Function with the member's JWT. Limits: 20 questions per member and 150 per family
-- per (local) day, counting every question, answered or not.
create or replace function public.ask_begin(p_question text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare me public.members; f public.families; s jsonb; v_q text := trim(coalesce(p_question, ''));
  v_day timestamptz; v_bd date; v_age int; a public.asks;
begin
  me := app.me();
  select * into f from public.families where id = me.family_id for update;
  s := app.settings(f);
  perform app.require_feature(s, 'ask');
  if char_length(v_q) not between 3 and 500 then raise exception 'invalid' using detail = 'question'; end if;
  -- an answer that never came back (function crashed / timed out) counts as failed
  update public.asks set status = 'failed'
   where member_id = me.id and status = 'pending' and created_at < app.now() - interval '2 minutes';
  v_day := app.local_ts(app.today(f), '00:00', f.timezone);
  if (select count(*) from public.asks where member_id = me.id and created_at >= v_day) >= 20 then
    raise exception 'ask_limit' using detail = 'member';
  end if;
  if (select count(*) from public.asks where family_id = f.id and created_at >= v_day) >= 150 then
    raise exception 'ask_limit' using detail = 'family';
  end if;
  insert into public.asks(family_id, member_id, question) values (f.id, me.id, v_q) returning * into a;
  perform app.audit(f.id, me.id, 'ask.create', jsonb_build_object('ask', a.id));
  v_bd := app.try_date(me.profile->>'birthday');
  v_age := case when v_bd is not null and v_bd <= app.today(f)
                then extract(year from age(app.today(f)::timestamp, v_bd::timestamp))::int end;
  return jsonb_build_object(
    'id', a.id,
    'member', jsonb_build_object('display_name', me.display_name, 'role', me.role, 'relation', me.relation, 'age', v_age),
    'family', jsonb_build_object('name', f.name, 'currency', f.currency),
    'features', app.effective_features(s));
end $$;

-- Service role only (the Edge Function's server-side key). Stores the answer, or marks the question failed.
create or replace function public.ask_finish(p_id uuid, p_answer text, p_status text, p_model text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare a public.asks; v_answer text := left(nullif(trim(coalesce(p_answer, '')), ''), 4000);
begin
  if p_status is null or p_status not in ('answered','failed') then raise exception 'invalid' using detail = 'status'; end if;
  if p_status = 'answered' and v_answer is null then raise exception 'invalid' using detail = 'answer'; end if;
  select * into a from public.asks where id = p_id for update;
  if not found then raise exception 'not_found' using detail = 'ask'; end if;
  if a.status <> 'pending' then raise exception 'wrong_status'; end if;
  update public.asks set status = p_status, answer = case when p_status = 'answered' then v_answer end,
    model = left(nullif(trim(p_model), ''), 100)
  where id = a.id;
  perform app.audit(a.family_id, null, 'ask.' || p_status, jsonb_build_object('ask', a.id, 'member', a.member_id));
  return jsonb_build_object('ok', true);
end $$;

-- Grants. ask_begin is the one authenticated RPC that is not in src/lib/api.ts: the app reaches it through
-- the Edge Function (api.ask), which calls it with the member's own JWT. ask_finish: service_role only.
revoke all on function public.list_asks(uuid, int) from public, anon, authenticated;
revoke all on function public.ask_begin(text) from public, anon, authenticated;
revoke all on function public.ask_finish(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.list_asks(uuid, int) to authenticated;
grant execute on function public.ask_begin(text) to authenticated;
grant execute on function public.ask_finish(uuid, text, text, text) to service_role;
