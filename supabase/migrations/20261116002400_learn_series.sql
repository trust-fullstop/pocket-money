-- Money school lesson series: "December: Borrowing and insurance" — six more tracked lessons (quiz, +5 XP once for kids
-- when points are on), listed all along but only openable from a date.
-- * app.lessons(): the six core lessons + the six series lessons (titles match src/features/help/learn/{catalog,series}.ts).
-- * app.lesson_opens(): series lesson id → first family-local day it can be finished ('YYYY-MM-DD'). Core lessons have
--   no entry (always open). Managers may finish (preview) earlier; kids and relatives get invalid / not_open.
-- * public.finish_lesson: unchanged from 20261116001700_learn_faith.sql except the opening check.

-- ---------- 1. lessons ----------
-- Whitelist of tracked lessons (id → title). Keep in sync with TRACKED_LESSON_IDS in src/features/help/learn/types.ts.
create or replace function app.lessons() returns jsonb language sql immutable as $$
  select '{"purpose":"Why this app?","earn":"How to earn more","why-save":"Why save?","how-save":"How to save",
           "interest":"How interest works","goals":"Saving for a goal",
           "loans-how":"How loans work","loans-repay":"Paying a loan back","insurance-what":"What is insurance?",
           "insurance-people":"Insurance for people","insurance-home-car":"Home and car insurance",
           "insurance-stuff":"Phones, valuables and boats"}'::jsonb $$;

-- Opening day (family-local) of the series lessons. Keep in sync with SERIES[].opensOn in src/features/help/learn/series.ts.
create or replace function app.lesson_opens() returns jsonb language sql immutable as $$
  select '{"loans-how":"2026-12-01","loans-repay":"2026-12-01","insurance-what":"2026-12-01",
           "insurance-people":"2026-12-01","insurance-home-car":"2026-12-01","insurance-stuff":"2026-12-01"}'::jsonb $$;

-- Finish a lesson (idempotent). The first time, a kid gets +5 XP when points are on. A series lesson can only be finished
-- from its opening day (in the family's timezone), except by managers (preview).
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
  if not app.is_manager(me.role) and (app.lesson_opens()->>p_lesson) is not null
     and app.today(f) < (app.lesson_opens()->>p_lesson)::date then
    raise exception 'invalid' using detail = 'not_open';
  end if;
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

-- ---------- 2. grants ----------
revoke all on function public.finish_lesson(text) from public, anon, authenticated;
grant execute on function public.finish_lesson(text) to authenticated;
revoke all on function app.lessons() from public, anon, authenticated;
revoke all on function app.lesson_opens() from public, anon, authenticated;
