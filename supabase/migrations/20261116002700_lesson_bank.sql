-- Money school lesson bank: themes of tracked lessons that the parents plan per month.
-- * app.lesson_themes(): the ready themes of the bank (src/features/help/learn/bank.ts): kind, release ('all' = every
--   lesson opens on the 1st of the planned month; 'weekly' = lesson i opens on the 1st + 7·i days), needs (faith themes
--   need 'faith', also for managers) and the lesson ids in order. app.lessons() (id → title) gets the Christmas lessons.
-- * Family setting lesson_plan: { "YYYY-MM": [themeId, …] } (default {}). update_family checks it: an object of at most
--   36 months, 1–3 different ready themes a month (an empty array removes the month), a theme in one month only
--   (duplicate_theme). A theme that has started (its month is this family-local month or earlier) stays where it is:
--   it can't be removed or moved any more (plan_locked). Not-yet-started themes can be moved or removed freely. The
--   whole update_family patch is capped at 16 000 bytes (too_big).
-- * app.lesson_open_on(f, lesson): the family-local day a theme lesson opens (null = its theme isn't planned). Once open,
--   a lesson stays open. It replaces app.lesson_opens() (20261116002400, now unused): Borrowing and insurance no
--   longer opens for everyone on 1 December 2026 — families that existed before this migration get it planned for
--   December 2026 (below), so nothing changes for them.
-- * finish_lesson(p_lesson, p_answers): the quiz's answers (one index per question) must match app.lesson_answers(),
--   else invalid / answers and nothing is written. Kids and relatives can only finish a theme lesson once it is open
--   (invalid / not_open); managers may preview and finish early, as before. XP, the Money school reward (002500) and the
--   audit are unchanged. The one-argument finish_lesson(text) is dropped.
-- * Lesson rewards for lessons finished earlier (lesson_rewards_due / reward_past_lessons) don't look at the plan: a
--   lesson finished stays earned.

-- ---------- 1. the bank ----------
-- Whitelist of tracked lessons (id → title): the 6 core lessons, then each ready theme's lessons in order. Keep in sync
-- with src/features/help/learn/{catalog,bank}.ts (tests/lesson_bank.test.ts checks).
create or replace function app.lessons() returns jsonb language sql immutable as $$
  select '{"purpose":"Why this app?","earn":"How to earn more","why-save":"Why save?","how-save":"How to save",
           "interest":"How interest works","goals":"Saving for a goal",
           "loans-how":"How loans work","loans-repay":"Paying a loan back","insurance-what":"What is insurance?",
           "insurance-people":"Insurance for people","insurance-home-car":"Home and car insurance",
           "insurance-stuff":"Phones, valuables and boats",
           "xmas-advent":"Advent: waiting and getting ready","xmas-generous":"A generous Christmas on a budget",
           "xmas-birth":"The birth of Jesus","xmas-wise-men":"The wise men and their gifts",
           "xmas-thanks":"Thanks and giving: what is Thanksgiving?"}'::jsonb $$;

-- The ready themes (themeId → kind, release, needs, lessons in order). Keep in sync with READY_THEMES in bank.ts.
create or replace function app.lesson_themes() returns jsonb language sql immutable as $$
  select '{"borrow-protect":{"kind":"money","release":"all","needs":[],
             "lessons":["loans-how","loans-repay","insurance-what","insurance-people","insurance-home-car","insurance-stuff"]},
           "christmas":{"kind":"faith","release":"weekly","needs":["faith"],
             "lessons":["xmas-advent","xmas-generous","xmas-birth","xmas-wise-men","xmas-thanks"]}}'::jsonb $$;

-- The quiz answers (index of the right option, per question in order) of every tracked lesson. Rendered from the
-- lessons' quiz() in src/features/help/learn (the same for every reader; tests/lesson_bank.test.ts checks).
create or replace function app.lesson_answers() returns jsonb language sql immutable as $$
  select '{"purpose":[1,1,1],"earn":[1,0,1],"why-save":[1,0,1],"how-save":[1,1,0],"interest":[1,2,0],"goals":[1,1,1],
           "loans-how":[1,1,0],"loans-repay":[1,0,1],"insurance-what":[0,1,1],"insurance-people":[1,0,1],
           "insurance-home-car":[0,1,1],"insurance-stuff":[0,1,0],
           "xmas-advent":[0,1,2],"xmas-generous":[0,1,2],"xmas-birth":[0,1,2],"xmas-wise-men":[1,0,2],"xmas-thanks":[1,2,0]
           }'::jsonb $$;

-- The theme a lesson belongs to (null: a core lesson, or unknown).
create or replace function app.lesson_theme(p_lesson text) returns text language sql immutable as $$
  select t.key from jsonb_each(app.lesson_themes()) t where t.value->'lessons' ? p_lesson limit 1 $$;

-- ---------- 2. the plan ----------
-- The family's plan from merged settings (app.settings); anything but an object counts as no plan.
create or replace function app.lesson_plan_of(s jsonb) returns jsonb language sql immutable as $$
  select case when jsonb_typeof(s->'lesson_plan') = 'object' then s->'lesson_plan' else '{}'::jsonb end $$;

-- The first day of the (earliest) month a theme is planned for, or null.
create or replace function app.theme_month(p_plan jsonb, p_theme text) returns date language sql immutable as $$
  select min((p.key || '-01')::date) from jsonb_each(case when jsonb_typeof(p_plan) = 'object' then p_plan else '{}'::jsonb end) p
   where p.key ~ '^[0-9]{4}-(0[1-9]|1[0-2])$' and jsonb_typeof(p.value) = 'array' and p.value ? p_theme $$;

-- The family-local day a theme lesson opens: its theme's planned month M → M-01 (release 'all') or M-01 + 7·index
-- ('weekly'). Null when the theme isn't planned, or for a lesson that isn't in a theme (core lessons are always open).
create or replace function app.lesson_open_on(f public.families, p_lesson text) returns date language sql stable as $$
  with t as (
    select t.key as theme, t.value->>'release' as release,
           (select (e.o - 1)::int from jsonb_array_elements_text(t.value->'lessons') with ordinality e(id, o)
             where e.id = p_lesson limit 1) as idx
      from jsonb_each(app.lesson_themes()) t
     where t.value->'lessons' ? p_lesson
     limit 1),
  m as (select t.*, app.theme_month(app.lesson_plan_of(app.settings(f)), t.theme) as month from t)
  select case when m.release = 'all' then m.month else m.month + 7 * m.idx end from m $$;

-- Check a new lesson_plan for family f (managers, via update_family) against the bank and the family's current plan.
-- Returns it without empty months.
create or replace function app.check_lesson_plan(f public.families, p_plan jsonb) returns jsonb language plpgsql stable as $$
declare v_themes jsonb := app.lesson_themes(); v_old jsonb := app.lesson_plan_of(app.settings(f));
  v_now text := to_char(app.today(f), 'YYYY-MM'); v_out jsonb := '{}'::jsonb; v_seen text[] := '{}';
  k text; v jsonb; e jsonb; t text;
begin
  if jsonb_typeof(p_plan) is distinct from 'object' then raise exception 'invalid' using detail = 'setting:lesson_plan'; end if;
  if (select count(*) from jsonb_object_keys(p_plan)) > 36 then raise exception 'invalid' using detail = 'setting:lesson_plan'; end if;
  for k, v in select * from jsonb_each(p_plan) loop
    if k !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' or jsonb_typeof(v) <> 'array' or jsonb_array_length(v) > 3 then
      raise exception 'invalid' using detail = 'setting:lesson_plan';
    end if;
    continue when jsonb_array_length(v) = 0;
    for e in select * from jsonb_array_elements(v) loop
      if jsonb_typeof(e) <> 'string' or not (v_themes ? (e #>> '{}')) then
        raise exception 'invalid' using detail = 'setting:lesson_plan';
      end if;
      if (e #>> '{}') = any(v_seen) then raise exception 'invalid' using detail = 'duplicate_theme'; end if;
      v_seen := v_seen || (e #>> '{}');
    end loop;
    v_out := v_out || jsonb_build_object(k, v);
  end loop;
  -- A theme that has started (planned for this month or earlier) stays in its month.
  for t, k in
    select x.theme, min(p.key) from jsonb_each(v_old) p
      cross join lateral jsonb_array_elements_text(case when jsonb_typeof(p.value) = 'array' then p.value else '[]'::jsonb end) x(theme)
     where p.key ~ '^[0-9]{4}-(0[1-9]|1[0-2])$' and v_themes ? x.theme
     group by x.theme
  loop
    if k <= v_now and not coalesce(v_out->k ? t, false) then
      raise exception 'invalid' using detail = 'plan_locked';
    end if;
  end loop;
  return v_out;
end $$;

-- Same as 20261116002600_bible_surprise.sql plus "lesson_plan": {} (no themes planned).
create or replace function app.default_settings() returns jsonb language sql immutable as $$
  select '{"interest_pct_month":2,"saver_bonus_points":10,"no_savings_penalty_points":10,"late_grace_minutes":60,
           "challenge_points_cap":50,"grandparents_see_money":true,"emergency_visibility":"family",
           "catchup_days":7,"default_evidence":"photo","managers_add_adults":false,"spend_currency":null,
           "lesson_reward_cents":0,"bible_reward_cents":0,"lesson_plan":{}}'::jsonb
         || jsonb_build_object('features', app.default_features(), 'spot_rules', app.default_spot_rules()) $$;

-- Same as 20261116002600_bible_surprise.sql, plus: the whole patch is at most 16 000 bytes (too_big), and the
-- `lesson_plan` rule (app.check_lesson_plan).
create or replace function public.update_family(p_patch jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare me public.members; f public.families; f2 public.families; k text; v jsonb; fk text; fv jsonb; new_settings jsonb;
  v_before jsonb; v_after jsonb;
begin
  me := app.me();
  if not app.is_manager(me.role) then raise exception 'not_allowed'; end if;
  if octet_length(p_patch::text) > 16000 then raise exception 'invalid' using detail = 'too_big'; end if;
  select * into f from public.families where id = me.family_id for update;
  new_settings := coalesce(f.settings, '{}'::jsonb);
  if p_patch ? 'settings' then
    if jsonb_typeof(p_patch->'settings') <> 'object' then raise exception 'invalid' using detail = 'settings'; end if;
    for k, v in select * from jsonb_each(p_patch->'settings') loop
      -- features: only known keys with boolean values, merged into the stored switches
      if k = 'features' then
        if jsonb_typeof(v) <> 'object' then raise exception 'invalid' using detail = 'setting:features'; end if;
        for fk, fv in select * from jsonb_each(v) loop
          if not (fk = any(app.feature_keys())) or jsonb_typeof(fv) <> 'boolean' then
            raise exception 'invalid' using detail = 'setting:features';
          end if;
        end loop;
        new_settings := new_settings || jsonb_build_object('features',
          case when jsonb_typeof(new_settings->'features') = 'object' then new_settings->'features' else '{}'::jsonb end || v);
        continue;
      end if;
      if k = 'interest_pct_month' and jsonb_typeof(v) = 'number' and (v::text)::numeric between 0 and 20 then null;
      elsif k in ('saver_bonus_points','no_savings_penalty_points','challenge_points_cap') and jsonb_typeof(v) = 'number' and (v::text)::numeric between 0 and 1000 then null;
      elsif k = 'late_grace_minutes' and jsonb_typeof(v) = 'number' and (v::text)::numeric between 0 and 1440 then null;
      elsif k = 'catchup_days' and jsonb_typeof(v) = 'number' and (v::text)::numeric between 0 and 31 then null;
      elsif k = 'grandparents_see_money' and jsonb_typeof(v) = 'boolean' then null;
      elsif k = 'managers_add_adults' and jsonb_typeof(v) = 'boolean' then
        if me.role <> 'owner' then raise exception 'not_allowed' using detail = 'owner_only'; end if;
      elsif k = 'emergency_visibility' and v #>> '{}' in ('family','adults') then null;
      elsif k = 'default_evidence' and v #>> '{}' in ('photo','photo_or_note','none') then null;
      elsif k = 'spend_currency' and (jsonb_typeof(v) = 'null' or (jsonb_typeof(v) = 'string' and v #>> '{}' ~ '^[A-Z]{3}$')) then null;
      elsif k = 'spot_rules' then
        v := app.check_spot_rules(v);
      elsif k in ('lesson_reward_cents','bible_reward_cents') and jsonb_typeof(v) = 'number'
            and (v::text)::numeric between 0 and 100000 and (v::text)::numeric = trunc((v::text)::numeric) then
        v := to_jsonb((v::text)::numeric::int);
      elsif k = 'lesson_plan' then
        v := app.check_lesson_plan(f, v);
      else raise exception 'invalid' using detail = 'setting:' || k;
      end if;
      new_settings := new_settings || jsonb_build_object(k, v);
    end loop;
  end if;
  -- remember the day each feature was (effectively) switched on, so timed rules don't back-pay
  v_before := app.effective_features(app.settings(f));
  f2 := f; f2.settings := new_settings;
  v_after := app.effective_features(app.settings(f2));
  insert into public.period_runs(family_id, period, period_start)
    select f.id, 'feature_on:' || a.key, app.today(f) from jsonb_each(v_after) a
     where a.value = 'true'::jsonb and v_before->a.key = 'false'::jsonb
  on conflict do nothing;
  if p_patch ? 'timezone' then perform app.check_tz(p_patch->>'timezone'); end if;
  if p_patch ? 'currency' and (p_patch->>'currency') !~ '^[A-Z]{3}$' then raise exception 'invalid' using detail = 'currency'; end if;
  update public.families set
    name = coalesce(nullif(trim(p_patch->>'name'), ''), name),
    currency = coalesce(p_patch->>'currency', currency),
    timezone = coalesce(p_patch->>'timezone', timezone),
    settings = new_settings
  where id = f.id;
  perform app.audit(f.id, me.id, 'family.update', p_patch);
  return public.get_state();
end $$;

-- ---------- 3. families from before the bank ----------
-- They keep what shipped: Borrowing and insurance opens on 1 December 2026. Families that already have a plan (also an
-- empty one) are left alone, so this is safe to run twice.
update public.families
   set settings = coalesce(settings, '{}'::jsonb) || '{"lesson_plan":{"2026-12":["borrow-protect"]}}'::jsonb
 where not (coalesce(settings, '{}'::jsonb) ? 'lesson_plan');

-- ---------- 4. finish_lesson: the plan and the quiz ----------
-- Same as 20261116002500_lesson_rewards.sql (XP, money, as_kid and the audit unchanged), except: a theme lesson needs its
-- theme's features (also for managers) and, for kids and relatives, to be open (app.lesson_open_on ≤ today); and the
-- quiz's answers must be the right ones (app.lesson_answers()).
drop function if exists public.finish_lesson(text);

create or replace function public.finish_lesson(p_lesson text, p_answers int[] default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare me public.members; f public.families; s jsonb; v_title text; v_done timestamptz; v_first boolean := false;
  v_points int := 0; v_money int := 0; v_each int; v_theme jsonb; v_need text; v_open date; v_right jsonb;
begin
  me := app.me();
  select * into f from public.families where id = me.family_id;
  s := app.settings(f);
  perform app.require_feature(s, 'learn');
  v_title := app.lessons()->>p_lesson;
  if v_title is null then raise exception 'invalid' using detail = 'lesson'; end if;
  v_theme := app.lesson_themes()->app.lesson_theme(p_lesson);
  if v_theme is not null then
    for v_need in select jsonb_array_elements_text(v_theme->'needs') loop
      perform app.require_feature(s, v_need);
    end loop;
    if not app.is_manager(me.role) then
      v_open := app.lesson_open_on(f, p_lesson);
      if v_open is null or app.today(f) < v_open then raise exception 'invalid' using detail = 'not_open'; end if;
    end if;
  end if;
  v_right := app.lesson_answers()->p_lesson;
  if v_right is null or p_answers is null or to_jsonb(p_answers) <> v_right then
    raise exception 'invalid' using detail = 'answers';
  end if;
  insert into public.lessons_done(member_id, family_id, lesson, as_kid) values (me.id, f.id, p_lesson, me.role = 'kid')
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
  if v_first and me.role = 'kid' then
    v_each := app.lesson_reward_cents(s);
    if v_each > 0 then
      v_money := app.reward_lesson(f, me, p_lesson, v_each, 'Money school: ' || v_title, me.id);
    end if;
  end if;
  if not v_first then
    select done_at into v_done from public.lessons_done where member_id = me.id and lesson = p_lesson;
  else
    perform app.audit(f.id, me.id, 'lesson.finish',
                      jsonb_build_object('lesson', p_lesson, 'points', v_points, 'money', v_money));
  end if;
  return jsonb_build_object('lesson', p_lesson, 'done_at', v_done, 'first', v_first, 'points', v_points,
                            'money_cents', v_money);
end $$;

-- ---------- 5. grants ----------
revoke all on function app.lessons() from public, anon, authenticated;
revoke all on function app.lesson_themes() from public, anon, authenticated;
revoke all on function app.lesson_answers() from public, anon, authenticated;
revoke all on function app.lesson_theme(text) from public, anon, authenticated;
revoke all on function app.lesson_plan_of(jsonb) from public, anon, authenticated;
revoke all on function app.theme_month(jsonb, text) from public, anon, authenticated;
revoke all on function app.lesson_open_on(public.families, text) from public, anon, authenticated;
revoke all on function app.check_lesson_plan(public.families, jsonb) from public, anon, authenticated;
revoke all on function app.default_settings() from public, anon, authenticated;

revoke all on function public.update_family(jsonb) from public, anon, authenticated;
revoke all on function public.finish_lesson(text, int[]) from public, anon, authenticated;

grant execute on function public.update_family(jsonb) to authenticated;
grant execute on function public.finish_lesson(text, int[]) to authenticated;
