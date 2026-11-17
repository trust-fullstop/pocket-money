-- Money school (feature 'learn') and Faith, hope and love (feature 'faith').
-- * 'learn' is on by default (also in "start small"); 'faith' is off by default — a family switches it on.
-- * Core lessons are tracked per member; a kid gets +5 XP the first time (points on). Faith reflections are never
--   tracked or scored (faith is invited, never tested), so they have no server side at all.

-- ---------- 1. feature switches ----------
create or replace function app.feature_keys() returns text[] language sql immutable as $$
  select array['challenges','spotted','allowance','requests','savings','interest','saver_rules','goals','targets',
               'time','points','calendar','emergency','devices','ask','bank','learn','faith'] $$;

create or replace function app.default_features() returns jsonb language sql immutable as $$
  select '{"challenges":false,"spotted":true,"allowance":true,"requests":true,"savings":false,"interest":false,
           "saver_rules":false,"goals":false,"targets":false,"time":false,"points":true,"calendar":true,
           "emergency":true,"devices":false,"ask":false,"bank":true,"learn":true,"faith":false}'::jsonb $$;

-- ---------- 2. lessons ----------
-- Whitelist of tracked lessons (id → title). Keep in sync with CORE_LESSON_IDS in src/features/help/learn/types.ts.
create or replace function app.lessons() returns jsonb language sql immutable as $$
  select '{"purpose":"Why this app?","earn":"How to earn more","why-save":"Why save?","how-save":"How to save",
           "interest":"How interest works","goals":"Saving for a goal"}'::jsonb $$;

create table if not exists public.lessons_done (
  member_id uuid not null references public.members(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  lesson text not null check (char_length(lesson) between 1 and 40),
  done_at timestamptz not null default app.now(),
  points int not null default 0,
  primary key (member_id, lesson)
);
create index if not exists lessons_done_family_idx on public.lessons_done(family_id, done_at desc);
alter table public.lessons_done enable row level security;
revoke all on public.lessons_done from public, anon, authenticated;

-- Finish a lesson (idempotent). The first time, a kid gets +5 XP when points are on.
create or replace function public.finish_lesson(p_lesson text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare me public.members; f public.families; s jsonb; v_title text; v_done timestamptz; v_first boolean := false;
  v_points int := 0;
begin
  me := app.me();
  select * into f from public.families where id = me.family_id;
  s := app.settings(f);
  perform app.require_feature(s, 'learn');
  v_title := app.lessons()->>p_lesson;
  if v_title is null then raise exception 'invalid' using detail = 'lesson'; end if;
  insert into public.lessons_done(member_id, family_id, lesson) values (me.id, f.id, p_lesson)
    on conflict do nothing
    returning done_at into v_done;
  v_first := v_done is not null;
  if v_first and me.role = 'kid' and app.feature_on_s(s, 'points') then
    if app.post(f.id, me.id, 'points', null, 5, 'bonus', null, 'Money school: ' || v_title, me.id,
                'lesson', me.id, 'lesson:' || p_lesson) is not null then
      v_points := 5;
      update public.lessons_done set points = v_points where member_id = me.id and lesson = p_lesson;
    end if;
  end if;
  if not v_first then
    select done_at into v_done from public.lessons_done where member_id = me.id and lesson = p_lesson;
  else
    perform app.audit(f.id, me.id, 'lesson.finish', jsonb_build_object('lesson', p_lesson, 'points', v_points));
  end if;
  return jsonb_build_object('lesson', p_lesson, 'done_at', v_done, 'first', v_first, 'points', v_points);
end $$;

-- Finished lessons, newest first: managers see the whole family, everyone else only their own.
create or replace function public.list_lessons_done() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare me public.members;
begin
  me := app.me();
  return coalesce((select jsonb_agg(jsonb_build_object('member_id', l.member_id, 'lesson', l.lesson, 'done_at', l.done_at,
                                                       'points', l.points) order by l.done_at desc)
                     from public.lessons_done l
                    where l.family_id = me.family_id and (app.is_manager(me.role) or l.member_id = me.id)), '[]'::jsonb);
end $$;

-- ---------- 3. grants ----------
revoke all on function public.finish_lesson(text) from public, anon, authenticated;
revoke all on function public.list_lessons_done() from public, anon, authenticated;
grant execute on function public.finish_lesson(text) to authenticated;
grant execute on function public.list_lessons_done() to authenticated;
revoke all on function app.lessons() from public, anon, authenticated;
