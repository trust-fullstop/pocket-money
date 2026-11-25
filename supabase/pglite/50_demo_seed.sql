-- PGlite-only demo seed: "The Demo Family", built by calling the real RPCs while walking a fake clock
-- from two weeks ago (a Monday) up to now. Runs as superuser after the migrations.
-- Demo logins: 00000000-0000-4000-8000-00000000000N, N = 1..7 = Dad, Mum, Anna, Oma, Sam, Mia, Leo.
-- Tests may pin "now" with: select set_config('app.seed_now', '<timestamptz>', false) before loading.

-- The demo loader runs this file BEFORE 90_time_travel.sql, so install the fake clock here as well.
create or replace function app.now() returns timestamptz language sql stable as $$
  select coalesce(nullif(current_setting('app.fake_now', true), '')::timestamptz, now()) $$;

create or replace function pg_temp.seed_at(p_user uuid, p_ts timestamptz) returns void language plpgsql as $f$
begin
  perform set_config('request.jwt.claim.sub', coalesce(p_user::text, ''), false);
  perform set_config('app.fake_now', p_ts::text, false);
end $f$;

do $seed$
declare
  tz constant text := 'Europe/Amsterdam';
  v_anchor timestamptz := coalesce(nullif(current_setting('app.seed_now', true), '')::timestamptz, now());
  final_ts timestamptz := v_anchor - interval '2 minutes';
  v_today date := ((v_anchor - interval '2 minutes') at time zone tz)::date;
  d0 date := app.week_start(((v_anchor - interval '2 minutes') at time zone tz)::date) - 14;
  u_dad constant uuid := '00000000-0000-4000-8000-000000000001';
  u_mum constant uuid := '00000000-0000-4000-8000-000000000002';
  u_anna constant uuid := '00000000-0000-4000-8000-000000000003';
  u_oma constant uuid := '00000000-0000-4000-8000-000000000004';
  u_sam constant uuid := '00000000-0000-4000-8000-000000000005';
  u_mia constant uuid := '00000000-0000-4000-8000-000000000006';
  u_leo constant uuid := '00000000-0000-4000-8000-000000000007';
  fam uuid; dad uuid; mum uuid; anna uuid; oma uuid; sam uuid; mia uuid; leo uuid;
  mids uuid[]; uids uuid[];
  r jsonb; rec record; d date; rel int; n_days int; v_ts timestamptz; v_user uuid; v_approver uuid; v_req uuid;
  v_tx uuid; v_inst uuid; i int := 0; v_shoes uuid; v_bag uuid;
begin
  if exists (select 1 from public.member_logins where user_id = u_dad) then
    raise notice 'demo seed already present';
    return;
  end if;
  n_days := v_today - d0;

  -- ---------- day 0 (Monday two weeks ago): the family ----------
  perform pg_temp.seed_at(u_dad, app.local_ts(d0, '07:00', tz));
  r := public.create_family(p_family_name => 'The Demo Family', p_my_name => 'Dad', p_avatar => '👨',
                            p_timezone => tz, p_currency => 'EUR');
  fam := (r->>'family_id')::uuid; dad := (r->>'member_id')::uuid;
  update public.member_logins set label = 'Demo' where user_id = u_dad;
  -- the demo shows everything (new families "start small"); Ask answers locally in the demo, no AI call
  perform public.update_family(p_patch => jsonb_build_object('settings', jsonb_build_object('features',
    jsonb_build_object('challenges', true, 'spotted', true, 'allowance', true, 'requests', true, 'savings', true,
      'interest', true, 'saver_rules', true, 'goals', true, 'targets', true, 'time', true, 'points', true,
      'calendar', true, 'emergency', true, 'devices', true, 'ask', true, 'learn', true, 'faith', true, 'needs', true,
      'loans', true),
    'spend_currency', 'ZAR')));  -- the demo kids spend in rand: shows today's EUR → ZAR rate

  mum  := (public.add_member(p_name => 'Mum',  p_role => 'parent',      p_avatar => '👩')->>'member_id')::uuid;
  anna := (public.add_member(p_name => 'Anna', p_role => 'step_parent', p_avatar => '👩‍🦰', p_relation => 'Bonus mum')->>'member_id')::uuid;
  oma  := (public.add_member(p_name => 'Oma',  p_role => 'grandparent', p_avatar => '👵')->>'member_id')::uuid;
  sam  := (public.add_member(p_name => 'Sam',  p_role => 'kid',         p_avatar => '🧒')->>'member_id')::uuid;
  mia  := (public.add_member(p_name => 'Mia',  p_role => 'kid',         p_avatar => '👧')->>'member_id')::uuid;
  leo  := (public.add_member(p_name => 'Leo',  p_role => 'kid',         p_avatar => '🧑')->>'member_id')::uuid;
  insert into public.member_logins(user_id, member_id, label) values
    (u_mum, mum, 'Demo'), (u_anna, anna, 'Demo'), (u_oma, oma, 'Demo'),
    (u_sam, sam, 'Demo'), (u_mia, mia, 'Demo'), (u_leo, leo, 'Demo');
  update public.invites set expires_at = app.now() where family_id = fam and used_at is null;
  mids := array[dad, mum, anna, oma, sam, mia, leo];
  uids := array[u_dad, u_mum, u_anna, u_oma, u_sam, u_mia, u_leo];

  perform pg_temp.seed_at(u_dad, app.local_ts(d0, '07:10', tz));
  perform public.update_member(p_member => dad, p_patch => jsonb_build_object(
    'theme', jsonb_build_object('accent', 'teal', 'classic', true),
    'profile', jsonb_build_object('birthday', '1984-03-12', 'phone', '+31 6 1111 1111', 'blood_type', 'O+',
      'allergies', 'None', 'doctor', 'Dr. de Vries, +31 20 555 0101', 'life360', 'Dad (Life360 circle "Demo Family")',
      'emergency_contacts', jsonb_build_array(jsonb_build_object('name', 'Mum', 'phone', '+31 6 2222 2222', 'relation', 'Partner')))));
  perform public.update_member(p_member => mum, p_patch => jsonb_build_object(
    'theme', jsonb_build_object('accent', 'violet'),
    'profile', jsonb_build_object('birthday', '1986-07-02', 'phone', '+31 6 2222 2222', 'blood_type', 'A+',
      'allergies', 'Penicillin', 'life360', 'Mum (Life360 circle "Demo Family")',
      'emergency_contacts', jsonb_build_array(jsonb_build_object('name', 'Dad', 'phone', '+31 6 1111 1111', 'relation', 'Partner')))));
  perform public.update_member(p_member => anna, p_patch => jsonb_build_object(
    'theme', jsonb_build_object('accent', 'green'),
    'profile', jsonb_build_object('birthday', '1988-09-23', 'phone', '+31 6 3333 3333', 'blood_type', 'B+',
      'allergies', 'Cats', 'life360', 'Anna (Life360 circle "Demo Family")',
      'emergency_contacts', jsonb_build_array(jsonb_build_object('name', 'Dad', 'phone', '+31 6 1111 1111', 'relation', 'Partner')))));
  perform public.update_member(p_member => oma, p_patch => jsonb_build_object(
    'theme', jsonb_build_object('accent', 'amber', 'classic', true),
    'profile', jsonb_build_object('birthday', '1955-12-05', 'phone', '+31 20 444 4444', 'blood_type', 'A-',
      'medication', 'Blood pressure tablets (morning)',
      'emergency_contacts', jsonb_build_array(jsonb_build_object('name', 'Dad', 'phone', '+31 6 1111 1111', 'relation', 'Son')))));
  perform public.update_member(p_member => sam, p_patch => jsonb_build_object(
    'allowance_cents', 500,
    'theme', jsonb_build_object('character', 'fox', 'accent', 'orange'),
    'profile', jsonb_build_object('birthday', to_char((v_today + 20) - interval '13 years', 'YYYY-MM-DD'),
      'blood_type', 'O+', 'height_cm', 154, 'allergies', 'Peanuts 🥜 (EpiPen in school bag)', 'school', 'De Regenboog, group 8',
      'doctor', 'Dr. de Vries, +31 20 555 0101',
      'emergency_contacts', jsonb_build_array(
        jsonb_build_object('name', 'Mum', 'phone', '+31 6 2222 2222', 'relation', 'Mum'),
        jsonb_build_object('name', 'Dad', 'phone', '+31 6 1111 1111', 'relation', 'Dad'),
        jsonb_build_object('name', 'Oma', 'phone', '+31 20 444 4444', 'relation', 'Grandma')))));
  perform public.update_member(p_member => mia, p_patch => jsonb_build_object(
    'allowance_cents', 300,
    'theme', jsonb_build_object('character', 'unicorn', 'accent', 'pink'),
    'profile', jsonb_build_object('birthday', to_char((v_today + 75) - interval '13 years', 'YYYY-MM-DD'),
      'blood_type', 'A+', 'height_cm', 151, 'allergies', 'None', 'school', 'Het Lyceum, 1st year',
      'emergency_contacts', jsonb_build_array(
        jsonb_build_object('name', 'Mum', 'phone', '+31 6 2222 2222', 'relation', 'Mum'),
        jsonb_build_object('name', 'Dad', 'phone', '+31 6 1111 1111', 'relation', 'Dad')))));
  perform public.update_member(p_member => leo, p_patch => jsonb_build_object(
    'allowance_cents', 800,
    'theme', jsonb_build_object('character', 'robot', 'accent', 'blue'),
    'profile', jsonb_build_object('birthday', to_char((v_today - 40) - interval '14 years', 'YYYY-MM-DD'),
      'phone', '+31 6 7777 7777', 'blood_type', 'O-', 'height_cm', 168, 'allergies', 'Hay fever', 'school', 'Het Lyceum, 2nd year',
      'emergency_contacts', jsonb_build_array(
        jsonb_build_object('name', 'Dad', 'phone', '+31 6 1111 1111', 'relation', 'Dad'),
        jsonb_build_object('name', 'Mum', 'phone', '+31 6 2222 2222', 'relation', 'Mum')))));

  -- chores
  perform pg_temp.seed_at(u_mum, app.local_ts(d0, '07:30', tz));
  perform public.create_task(p_task => jsonb_build_object('title', 'Do the dishes', 'emoji', '🍽️', 'kind', 'chore',
    'assignees', jsonb_build_array(sam), 'repeat', 'daily', 'start_on', d0::text, 'due_time', '19:30', 'evidence', 'none',
    'reward_cents', 50, 'reward_points', 10, 'penalty_cents', 25));
  perform public.create_task(p_task => jsonb_build_object('title', 'Make your bed', 'emoji', '🛏️', 'kind', 'chore',
    'details', 'Pillow, duvet, teddy on top 🧸', 'assignees', jsonb_build_array(mia), 'repeat', 'daily', 'start_on', d0::text,
    'due_time', '09:00', 'evidence', 'photo', 'reward_cents', 20, 'reward_points', 5, 'penalty_points', 5));
  perform public.create_task(p_task => jsonb_build_object('title', 'Tidy your room', 'emoji', '🧸', 'kind', 'chore',
    'assignees', jsonb_build_array(sam), 'repeat', 'weekly', 'start_on', (d0 + 5)::text, 'due_time', '11:00',
    'evidence', 'photo', 'reward_cents', 100, 'reward_minutes', 20, 'time_label', 'fun', 'penalty_cents', 50));
  perform public.create_task(p_task => jsonb_build_object('title', 'Tidy your room', 'emoji', '🧸', 'kind', 'chore',
    'assignees', jsonb_build_array(mia), 'repeat', 'weekly', 'start_on', (d0 + 5)::text, 'due_time', '11:00',
    'evidence', 'photo', 'reward_cents', 100, 'reward_minutes', 20, 'time_label', 'fun', 'penalty_cents', 50));
  perform pg_temp.seed_at(u_dad, app.local_ts(d0, '07:35', tz));
  perform public.create_task(p_task => jsonb_build_object('title', 'Homework', 'emoji', '📚', 'kind', 'chore',
    'details', 'A photo of your planner or a short note is fine.', 'assignees', jsonb_build_array(leo), 'repeat', 'weekdays',
    'start_on', d0::text, 'due_time', '18:00', 'evidence', 'photo_or_note', 'reward_minutes', 20, 'time_label', 'game',
    'reward_points', 10, 'penalty_minutes', 30));
  perform public.create_task(p_task => jsonb_build_object('title', 'Take out the bins', 'emoji', '🗑️', 'kind', 'chore',
    'assignees', jsonb_build_array(leo), 'repeat', 'weekly', 'start_on', (d0 + 2)::text, 'due_time', '20:00',
    'evidence', 'photo', 'reward_cents', 100, 'reward_points', 5, 'penalty_cents', 50));
  perform pg_temp.seed_at(u_anna, app.local_ts(d0, '07:40', tz));
  perform public.create_task(p_task => jsonb_build_object('title', 'Walk the dog', 'emoji', '🐕', 'kind', 'chore',
    'details', 'At least 20 minutes, take poop bags!', 'assignees', jsonb_build_array(sam), 'repeat', 'days',
    'repeat_days', jsonb_build_array(1, 3, 5), 'start_on', d0::text, 'due_time', '17:00', 'evidence', 'photo_or_note',
    'reward_cents', 75, 'reward_points', 5, 'penalty_points', 10));

  -- targets
  perform pg_temp.seed_at(u_dad, app.local_ts(d0, '08:00', tz));
  foreach v_user in array array[sam, mia, leo] loop
    perform public.upsert_target(p => jsonb_build_object('member_id', v_user, 'title', 'Do 80% of your jobs this week',
      'period', 'week', 'metric', 'completion_pct', 'threshold', 80, 'prize_cents', 200, 'prize_minutes', 30, 'time_label', 'fun'));
  end loop;
  foreach v_user in array array[sam, leo] loop
    perform public.upsert_target(p => jsonb_build_object('member_id', v_user, 'title', 'Earn €20 this month',
      'period', 'month', 'metric', 'money_earned', 'threshold', 2000, 'prize_points', 50, 'prize_text', 'Choose Friday''s dinner'));
  end loop;

  -- goals (the kids set them themselves)
  perform pg_temp.seed_at(u_sam, app.local_ts(d0, '16:00', tz));
  perform public.upsert_goal(p => jsonb_build_object('member_id', sam, 'title', 'Lego set', 'target_cents', 6000, 'emoji', '🧱'));
  perform pg_temp.seed_at(u_mia, app.local_ts(d0, '16:05', tz));
  perform public.upsert_goal(p => jsonb_build_object('member_id', mia, 'title', 'Bike', 'target_cents', 12000, 'emoji', '🚲'));
  perform pg_temp.seed_at(u_leo, app.local_ts(d0, '16:10', tz));
  perform public.upsert_goal(p => jsonb_build_object('member_id', leo, 'title', 'Headphones', 'target_cents', 8000, 'emoji', '🎧'));

  -- calendar
  perform pg_temp.seed_at(u_mum, app.local_ts(d0, '20:30', tz));
  perform public.upsert_event(p => jsonb_build_object('title', 'School trip to the zoo', 'emoji', '🦁', 'kind', 'event',
    'notes', 'Packed lunch + rain jacket. Bus leaves 08:45.', 'starts_at', app.local_ts(v_today + 5, '08:30', tz)::text,
    'for_members', jsonb_build_array(sam, mia)));
  perform public.upsert_event(p => jsonb_build_object('title', 'Dentist', 'emoji', '🦷', 'kind', 'reminder',
    'notes', 'Check-up, Dr. Bakker', 'starts_at', app.local_ts(v_today + 2, '15:00', tz)::text,
    'for_members', jsonb_build_array(leo)));
  perform public.upsert_event(p => jsonb_build_object('title', 'Christmas', 'emoji', '🎄', 'kind', 'event', 'all_day', true,
    'repeat', 'yearly', 'starts_at', app.local_ts(make_date(extract(year from d0)::int, 12, 25), '00:00', tz)::text));
  perform public.upsert_event(p => jsonb_build_object('title', 'Swimming lesson', 'emoji', '🏊', 'kind', 'event',
    'repeat', 'weekly', 'notes', 'Bring goggles', 'starts_at', app.local_ts(d0 + 2, '16:30', tz)::text,
    'for_members', jsonb_build_array(mia)));

  -- devices
  perform pg_temp.seed_at(u_dad, app.local_ts(d0, '21:00', tz));
  perform public.upsert_device(p => jsonb_build_object('name', 'Leo''s iPhone', 'type', 'phone', 'owner_id', leo,
    'model', 'iPhone 13', 'phone_number', '+31 6 7777 7777', 'notes', 'Screen time: 2h on school days'));
  perform public.upsert_device(p => jsonb_build_object('name', 'Sam''s tablet', 'type', 'tablet', 'owner_id', sam,
    'model', 'Galaxy Tab A9', 'mac', '3C:2E:F9:12:AB:01'));
  perform public.upsert_device(p => jsonb_build_object('name', 'Family Xbox', 'type', 'console', 'model', 'Xbox Series S',
    'ip', '192.168.1.40', 'notes', 'Game time is tracked in the app ⏱️'));
  perform public.upsert_device(p => jsonb_build_object('name', 'Living room TV', 'type', 'tv', 'model', 'LG OLED 55"'));

  -- ---------- walk the clock forward, one day at a time ----------
  for rel in 0 .. n_days loop
    d := d0 + rel;
    if d < v_today then
      perform pg_temp.seed_at(u_dad, app.local_ts(d, case when rel = 0 then '07:45' else '07:00' end::time, tz));
    else
      perform pg_temp.seed_at(u_dad, least(app.local_ts(d, '07:00', tz), final_ts - interval '10 minutes'));
    end if;
    perform public.tick();

    -- scripted moments (all on days before today)
    if rel = 1 then
      perform pg_temp.seed_at(u_oma, app.local_ts(d, '14:00', tz));
      perform public.spot(p => jsonb_build_object('member_id', mia, 'direction', 'plus', 'cents', 1000,
        'reason', 'For your piggy bank 💕'));
    elsif rel = 2 then
      perform pg_temp.seed_at(u_dad, app.local_ts(d, '11:00', tz));
      perform public.spot(p => jsonb_build_object('member_id', sam, 'direction', 'plus', 'cents', 100, 'points', 10,
        'reason', 'Helped grandma with shopping'));
      perform pg_temp.seed_at(u_leo, app.local_ts(d, '15:00', tz));
      v_req := (public.create_request(p_kind => 'spend', p_amount => 750, p_label => 'Cinema ticket',
        p_note => 'Going with Tom on Saturday 🎬')->>'id')::uuid;
      perform pg_temp.seed_at(u_mum, app.local_ts(d, '15:30', tz));
      perform public.decide_request(p_request => v_req, p_approve => true, p_note => 'Have fun!');
    elsif rel = 3 then
      perform pg_temp.seed_at(u_mum, app.local_ts(d, '13:00', tz));
      perform public.spot(p => jsonb_build_object('member_id', leo, 'direction', 'minus', 'cents', 100, 'minutes', 15,
        'time_label', 'game', 'reason', 'Left bike in the rain'));
      perform pg_temp.seed_at(u_sam, app.local_ts(d, '16:00', tz));
      if app.bal(sam, 'spending') >= 100 then perform public.transfer(p_member => sam, p_amount => 100, p_to => 'savings'); end if;
    elsif rel = 4 then
      perform pg_temp.seed_at(u_mia, app.local_ts(d, '16:00', tz));
      if app.bal(mia, 'spending') >= 500 then perform public.transfer(p_member => mia, p_amount => 500, p_to => 'savings'); end if;
      perform pg_temp.seed_at(u_leo, app.local_ts(d, '16:30', tz));
      if app.bal(leo, 'spending') >= 50 then perform public.transfer(p_member => leo, p_amount => 50, p_to => 'savings'); end if;
    elsif rel = 5 then
      perform pg_temp.seed_at(u_anna, app.local_ts(d, '14:00', tz));
      perform public.spot(p => jsonb_build_object('member_id', mia, 'direction', 'plus', 'points', 20, 'minutes', 15,
        'time_label', 'fun', 'reason', 'Lovely drawing for Oma 🎨'));
    elsif rel = 6 then
      -- Sam fixes the room after yesterday's "not yet"
      select ti.id into v_inst from public.task_instances ti join public.tasks t on t.id = ti.task_id
       where ti.family_id = fam and ti.assignee_id = sam and t.title = 'Tidy your room' and ti.occurs_on = d - 1
         and ti.status = 'open';
      if v_inst is not null then
        update public.task_instances set status = 'submitted', submitted_at = app.local_ts(d, '10:00', tz),
          note = 'Everything is in the boxes now!' where id = v_inst;
        perform pg_temp.seed_at(u_dad, app.local_ts(d, '10:30', tz));
        perform public.decide_task(p_instance => v_inst, p_approve => true, p_note => 'Much better 👍');
      end if;
      perform pg_temp.seed_at(u_leo, app.local_ts(d, '13:00', tz));
      if app.bal(leo, 'time') >= 20 then
        v_req := (public.create_request(p_kind => 'time', p_amount => 20, p_label => 'game', p_note => 'Minecraft with Tom')->>'id')::uuid;
        perform pg_temp.seed_at(u_dad, app.local_ts(d, '13:20', tz));
        perform public.decide_request(p_request => v_req, p_approve => true, p_note => null);
      end if;
    elsif rel = 7 then
      perform pg_temp.seed_at(u_sam, app.local_ts(d, '16:00', tz));
      if app.bal(sam, 'spending') >= 200 then perform public.transfer(p_member => sam, p_amount => 200, p_to => 'savings'); end if;
    elsif rel = 8 then
      -- Mia challenges Dad
      perform pg_temp.seed_at(u_mia, app.local_ts(d, '12:00', tz));
      perform public.create_task(p_task => jsonb_build_object('title', 'No phone at dinner for a week', 'emoji', '📵',
        'kind', 'challenge', 'assignees', jsonb_build_array(dad), 'repeat', 'once', 'start_on', v_today::text,
        'due_time', '21:00', 'evidence', 'photo_or_note', 'reward_points', 50, 'reward_text', 'I''ll make you breakfast 🥞'));
      perform pg_temp.seed_at(u_oma, app.local_ts(d, '15:00', tz));
      perform public.spot(p => jsonb_build_object('member_id', sam, 'direction', 'plus', 'cents', 500,
        'reason', 'Ice cream money 🍦'));
    elsif rel = 9 then
      perform pg_temp.seed_at(u_mum, app.local_ts(d, '12:00', tz));
      perform public.spot(p => jsonb_build_object('member_id', leo, 'direction', 'plus', 'cents', 150,
        'reason', 'Fixed the wifi router 🛠️'));
      -- Dad lent Leo cash for bike lights; €5 comes off each pocket money (the next Monday repays the first €5)
      perform pg_temp.seed_at(u_dad, app.local_ts(d, '12:30', tz));
      perform public.request_loan(p_member => leo, p_amount => 2000, p_purpose => 'Bike lights', p_plan => 'per_pay',
        p_installment => 500);
    elsif rel = 10 then
      -- yesterday's dishes were missed because Sam was ill: excuse (the fine is given back)
      select ti.id into v_inst from public.task_instances ti join public.tasks t on t.id = ti.task_id
       where ti.family_id = fam and ti.assignee_id = sam and t.title = 'Do the dishes' and ti.occurs_on = d - 1
         and ti.status = 'missed';
      if v_inst is not null then
        perform pg_temp.seed_at(u_mum, app.local_ts(d, '08:00', tz));
        perform public.excuse_task(p_instance => v_inst, p_note => 'Sam was ill 🤒');
      end if;
      -- a partnership challenge
      perform pg_temp.seed_at(u_mum, app.local_ts(d, '12:00', tz));
      perform public.create_task(p_task => jsonb_build_object('title', 'Wash the car', 'emoji', '🚗', 'kind', 'challenge',
        'details', 'Together! Inside and outside.', 'assignees', jsonb_build_array(dad, leo), 'repeat', 'once',
        'start_on', (d0 + 12)::text, 'due_time', '16:00', 'evidence', 'photo_or_note', 'reward_points', 30,
        'reward_text', '🍕 Pizza night'));
    elsif rel = 11 then
      perform pg_temp.seed_at(u_dad, app.local_ts(d, '18:00', tz));
      r := public.spot(p => jsonb_build_object('member_id', sam, 'direction', 'minus', 'points', 10,
        'reason', 'Shouted at Mia'));
      perform pg_temp.seed_at(u_dad, app.local_ts(d, '20:00', tz));
      perform public.reverse_transaction(p_tx => (r->'ids'->>0)::uuid, p_reason => 'We talked it through, sorry Sam');
    elsif rel = 13 then
      perform pg_temp.seed_at(u_leo, app.local_ts(d, '11:00', tz));
      if app.bal(leo, 'spending') >= 300 then perform public.transfer(p_member => leo, p_amount => 300, p_to => 'savings'); end if;
      perform pg_temp.seed_at(u_sam, app.local_ts(d, '15:00', tz));
      if app.bal(sam, 'spending') >= 400 then
        perform public.create_request(p_kind => 'spend', p_amount => 400, p_label => 'Pokémon cards', p_note => 'Booster pack ⚡');
      end if;
      perform pg_temp.seed_at(u_mia, app.local_ts(d, '15:30', tz));
      if app.bal(mia, 'savings') >= 300 then
        perform public.create_request(p_kind => 'withdraw', p_amount => 300, p_label => 'Fair', p_note => 'Sweets at the fair 🍭');
      end if;
    end if;

    -- "What we need" (grown-ups only): shoes bought by Oma, a bag Mum is getting, two still open
    if rel = n_days - 6 then
      perform pg_temp.seed_at(u_mum, app.local_ts(d, '20:30', tz));
      v_shoes := (public.add_need(p_member => sam, p_item => 'School shoes', p_occasion => 'New term',
        p_details => 'Size 5, black, with velcro')->>'id')::uuid;
      perform pg_temp.seed_at(u_dad, app.local_ts(d, '21:00', tz));
      v_bag := (public.add_need(p_member => leo, p_item => 'School bag', p_occasion => 'New term',
        p_details => 'The zip broke. A backpack with a laptop pocket.')->>'id')::uuid;
    elsif rel = n_days - 5 then
      perform pg_temp.seed_at(u_oma, app.local_ts(d, '10:00', tz));
      perform public.claim_need(p_id => v_shoes);
      perform pg_temp.seed_at(u_mum, app.local_ts(d, '12:15', tz));
      perform public.claim_need(p_id => v_bag);
    elsif rel = n_days - 3 then
      perform pg_temp.seed_at(u_oma, app.local_ts(d, '14:05', tz));
      perform public.complete_need(p_id => v_shoes, p_note => 'Bought at the shoe shop in town, size 5. They are in the hall cupboard.');
      perform pg_temp.seed_at(u_oma, app.local_ts(d, '19:00', tz));
      perform public.add_need(p_member => mia, p_item => 'Art set', p_occasion => 'Birthday',
        p_details => 'Watercolours and good brushes 🎨');
    elsif rel = n_days - 2 then
      perform pg_temp.seed_at(u_anna, app.local_ts(d, '20:00', tz));
      perform public.add_need(p_member => leo, p_item => 'Football boots', p_occasion => 'Christmas', p_details => 'Size 42, for grass');
    end if;

    -- the jobs of the day
    for rec in select ti.id, ti.assignee_id, ti.due_at, t.title, t.evidence, t.kind
                 from public.task_instances ti join public.tasks t on t.id = ti.task_id
                where ti.family_id = fam and ti.occurs_on = d and ti.status = 'open'
                order by ti.due_at, t.title, ti.assignee_id
    loop
      v_user := (select x.u from unnest(mids, uids) x(m, u) where x.m = rec.assignee_id);
      if d < v_today then
        -- a few forgotten jobs (they become "missed" with a fine at the next tick)
        continue when (rec.title, rel) in (('Do the dishes', 3), ('Do the dishes', 9), ('Homework', 4),
                                            ('Make your bed', 6), ('Walk the dog', 11), ('Take out the bins', 9))
                   or (rel >= 14 and abs(hashtext(rec.title || ':' || rel)) % 7 = 0);
        v_ts := rec.due_at - interval '20 minutes';
        perform pg_temp.seed_at(v_user, v_ts);
        if rec.evidence = 'photo' then
          update public.task_instances set status = 'submitted', submitted_at = v_ts, note = 'Done ✅' where id = rec.id;
        else
          perform public.submit_task(p_instance => rec.id, p_before => null, p_after => null,
            p_note => case rec.title when 'Homework' then 'Maths p. 42 and spelling list done'
                                     when 'Walk the dog' then 'Around the park, 25 minutes 🐾'
                                     when 'Wash the car' then 'Shiny! ✨'
                                     else 'Done!' end);
        end if;
        v_approver := case rel % 3 when 0 then u_mum when 1 then u_dad else u_anna end;
        if v_approver = v_user then v_approver := case when v_user = u_mum then u_dad else u_mum end; end if;
        perform pg_temp.seed_at(v_approver, rec.due_at + interval '40 minutes');
        if rec.title = 'Tidy your room' and rec.assignee_id = sam and rel = 5 then
          perform public.decide_task(p_instance => rec.id, p_approve => false, p_note => 'Toys are still under the bed 🙈');
        else
          perform public.decide_task(p_instance => rec.id, p_approve => true, p_note => null);
        end if;
      else
        -- today: some jobs already handed in (waiting for a grown-up), others still to do
        if rec.title = 'No phone at dinner for a week' then
          perform pg_temp.seed_at(v_user, final_ts - interval '5 minutes');
          perform public.submit_task(p_instance => rec.id, p_before => null, p_after => null,
            p_note => 'Phone stayed in the drawer every dinner this week 📵');
          continue;
        end if;
        i := i + 1;
        continue when i % 3 = 0;
        v_ts := least(rec.due_at - interval '20 minutes', final_ts - interval '8 minutes');
        perform pg_temp.seed_at(v_user, v_ts);
        if rec.evidence = 'photo' then
          update public.task_instances set status = 'submitted', submitted_at = v_ts, note = 'Done ✅' where id = rec.id;
        else
          perform public.submit_task(p_instance => rec.id, p_before => null, p_after => null, p_note => 'Done!');
        end if;
      end if;
    end loop;
  end loop;

  -- today: Leo asks for screen time
  perform pg_temp.seed_at(u_leo, final_ts - interval '3 minutes');
  if app.bal(leo, 'time') >= 45 then
    perform public.create_request(p_kind => 'time', p_amount => 45, p_label => 'fun', p_note => 'Movie night 🍿');
  end if;

  perform set_config('app.fake_now', '', false);
  perform set_config('request.jwt.claim.sub', '', false);
end $seed$;

select set_config('app.fake_now', '', false), set_config('request.jwt.claim.sub', '', false);
drop function if exists pg_temp.seed_at(uuid, timestamptz);
