-- Money school rewards: a family setting "money per lesson" (lesson_reward_cents, family-currency cents, 0 = off).
-- * A KID finishing a tracked lesson for the first time gets that amount in the Wallet: kind 'bonus', pot 'spending',
--   source ('lesson', kid, 'lesson-money:<lesson>'). The unique index on transactions(source_type, source_id,
--   source_key) makes it once-only forever, also after an undo (an undone reward is never paid again). The +5 XP row
--   keeps its own key ('lesson:<lesson>') and is unchanged.
-- * lessons_done remembers what the finish paid (money_cents) and whether it was finished as a kid (as_kid). Only
--   as_kid rows of members who are a kid now are ever rewarded: grown-ups never get money, also not after a role change.
-- * Lessons finished before there was a value (or while it was 0): managers see them (lesson_rewards_due) and reward
--   them at today's value, effective now so they land in this pay-out (reward_past_lessons).
-- * Pay-out: lesson rewards (and their undo rows) get their own bucket, lessons_cents, taken out of rewards_cents, so
--   start + allowance + rewards + consequences + loan + lessons + other = wallet still holds.
-- * app.reward_lesson is the one writer for both paths.

-- ---------- 1. the setting ----------
-- Same as 20261116001800_spot_rules.sql plus "lesson_reward_cents": 0 (off).
create or replace function app.default_settings() returns jsonb language sql immutable as $$
  select '{"interest_pct_month":2,"saver_bonus_points":10,"no_savings_penalty_points":10,"late_grace_minutes":60,
           "challenge_points_cap":50,"grandparents_see_money":true,"emergency_visibility":"family",
           "catchup_days":7,"default_evidence":"photo","managers_add_adults":false,"spend_currency":null,
           "lesson_reward_cents":0}'::jsonb
         || jsonb_build_object('features', app.default_features(), 'spot_rules', app.default_spot_rules()) $$;

-- The money per lesson from merged settings (app.settings): a whole number 0..100000, anything else counts as 0.
create or replace function app.lesson_reward_cents(s jsonb) returns int language sql immutable as $$
  select case when jsonb_typeof(s->'lesson_reward_cents') = 'number'
              then least(greatest(trunc((s->>'lesson_reward_cents')::numeric), 0), 100000)::int
              else 0 end $$;

-- Same as 20261116001800_spot_rules.sql, plus the `lesson_reward_cents` rule (a whole number 0..100000).
create or replace function public.update_family(p_patch jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare me public.members; f public.families; f2 public.families; k text; v jsonb; fk text; fv jsonb; new_settings jsonb;
  v_before jsonb; v_after jsonb;
begin
  me := app.me();
  if not app.is_manager(me.role) then raise exception 'not_allowed'; end if;
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
      elsif k = 'lesson_reward_cents' and jsonb_typeof(v) = 'number' and (v::text)::numeric between 0 and 100000
            and (v::text)::numeric = trunc((v::text)::numeric) then
        v := to_jsonb((v::text)::numeric::int);
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

-- ---------- 2. lessons_done: what the finish paid, and whether it was finished as a kid ----------
alter table public.lessons_done add column if not exists money_cents int not null default 0;
alter table public.lessons_done add column if not exists as_kid boolean not null default false;
-- Rows from before this migration: finished as a kid when the member is a kid now (roles rarely change). Known edge:
-- a member who finished lessons as a grown-up and is a kid now counts as as_kid for those older rows.
update public.lessons_done l set as_kid = true
  from public.members m
 where m.id = l.member_id and m.role = 'kid' and not l.as_kid;

-- ---------- 3. the one writer ----------
-- Pay p_cents for one finished lesson of kid m (once ever: same source key for the finish and the backlog). Only a
-- kid's as_kid row is paid. Returns what was paid now (0 when nothing was posted: already paid or undone before).
create or replace function app.reward_lesson(f public.families, m public.members, p_lesson text, p_cents int,
  p_reason text, p_by uuid) returns int language plpgsql as $$
begin
  if coalesce(p_cents, 0) <= 0 or m.role <> 'kid' or m.family_id <> f.id then return 0; end if;
  if not exists (select 1 from public.lessons_done l where l.member_id = m.id and l.lesson = p_lesson and l.as_kid) then
    return 0;
  end if;
  if app.post(f.id, m.id, 'money', 'spending', p_cents, 'bonus', null, p_reason, p_by,
              'lesson', m.id, 'lesson-money:' || p_lesson) is null then
    return 0;
  end if;
  update public.lessons_done set money_cents = p_cents where member_id = m.id and lesson = p_lesson;
  return p_cents;
end $$;

-- Finished lessons of the family's kids that never got a lesson-money row (paid, or paid and undone): kids who are
-- still in the family and a kid now, rows finished as a kid.
create or replace function app.lessons_unpaid(p_family uuid) returns setof public.lessons_done language sql stable as $$
  select l.* from public.lessons_done l
    join public.members m on m.id = l.member_id
   where l.family_id = p_family and m.family_id = p_family and m.active and m.role = 'kid' and l.as_kid
     and not exists (select 1 from public.transactions x
                      where x.source_type = 'lesson' and x.source_id = l.member_id
                        and x.source_key = 'lesson-money:' || l.lesson) $$;

-- ---------- 4. finish_lesson: + money ----------
-- Same as 20261116002400_learn_series.sql (opening check and XP unchanged), plus: the row remembers as_kid, and a kid's
-- first finish pays lesson_reward_cents (when > 0). Returns money_cents (paid now); the audit has it too.
create or replace function public.finish_lesson(p_lesson text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare me public.members; f public.families; s jsonb; v_title text; v_done timestamptz; v_first boolean := false;
  v_points int := 0; v_money int := 0; v_each int;
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

-- Same as 20261116001700_learn_faith.sql plus money_cents: what the finish (or the later reward for an earlier lesson)
-- paid, 0 when that money was undone.
create or replace function public.list_lessons_done() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare me public.members;
begin
  me := app.me();
  return coalesce((select jsonb_agg(jsonb_build_object('member_id', l.member_id, 'lesson', l.lesson, 'done_at', l.done_at,
                                                       'points', l.points,
                                                       'money_cents', case when exists (
                                                          select 1 from public.transactions x
                                                           where x.source_type = 'lesson' and x.source_id = l.member_id
                                                             and x.source_key = 'lesson-money:' || l.lesson
                                                             and x.reversed_by is null) then l.money_cents else 0 end)
                                    order by l.done_at desc)
                     from public.lessons_done l
                    where l.family_id = me.family_id and (app.is_manager(me.role) or l.member_id = me.id)), '[]'::jsonb);
end $$;

-- ---------- 5. earlier lessons ----------
-- Per kid (by name): the unpaid lessons (oldest first) and what they would get at today's value; plus the totals.
create or replace function app.lessons_due_json(f public.families, p_each int) returns jsonb language sql stable as $$
  with u as (select * from app.lessons_unpaid(f.id)),
  k as (select m.id, m.display_name, count(u.*)::int as n,
               jsonb_agg(jsonb_build_object('lesson', u.lesson, 'title', coalesce(app.lessons()->>u.lesson, u.lesson),
                                            'done_at', u.done_at) order by u.done_at, u.lesson) as lessons
          from u join public.members m on m.id = u.member_id
         group by m.id, m.display_name)
  select jsonb_build_object(
    'cents_each', p_each,
    'count', coalesce((select sum(k.n) from k), 0)::int,
    'total_cents', coalesce((select sum(k.n) from k), 0)::int * p_each,
    'kids', coalesce((select jsonb_agg(jsonb_build_object('member_id', k.id, 'count', k.n, 'lessons', k.lessons,
                                                          'cents_each', p_each, 'total_cents', k.n * p_each)
                                       order by k.display_name, k.id) from k), '[]'::jsonb)) $$;

-- Managers: the lessons kids finished that never got money (e.g. before there was a value), at today's value.
create or replace function public.lesson_rewards_due() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare me public.members; f public.families;
begin
  me := app.me();
  if not app.is_manager(me.role) then raise exception 'not_allowed'; end if;
  select * into f from public.families where id = me.family_id;
  return app.lessons_due_json(f, app.lesson_reward_cents(app.settings(f)));
end $$;

-- Managers: pay every unpaid lesson (of one kid, or all kids) at today's value, effective now, so it lands in this
-- pay-out. p_expected_cents = the total the parent saw; anything else → wrong_status (the app reloads). Each lesson is
-- paid once ever (same key as finish_lesson). Lock order: the family row (no key update: the key-share locks of new
-- rows never wait on it), then the kids by id (a finish_lesson of that kid waits; tick_family / record_payout lock
-- the same way).
create or replace function public.reward_past_lessons(p_expected_cents int, p_member uuid default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare me public.members; f public.families; s jsonb; m public.members; k public.members; r record;
  v_each int; v_due int; v_got int; v_n int := 0; v_sum int := 0; v_per jsonb := '{}'::jsonb;
begin
  me := app.me();
  if not app.is_manager(me.role) then raise exception 'not_allowed'; end if;
  if p_expected_cents is null then raise exception 'invalid' using detail = 'amount'; end if;
  if p_member is not null then
    m := app.get_member(me.family_id, p_member);
    if m.role <> 'kid' then raise exception 'not_allowed' using detail = 'member'; end if;
  end if;

  select * into f from public.families where id = me.family_id for no key update;
  s := app.settings(f);
  perform app.require_feature(s, 'learn');
  v_each := app.lesson_reward_cents(s);
  if v_each <= 0 then raise exception 'invalid' using detail = 'no_reward'; end if;
  perform 1 from public.members where family_id = f.id and role = 'kid' and active and (p_member is null or id = p_member)
    order by id for update;

  select count(*)::int into v_due from app.lessons_unpaid(f.id) u where p_member is null or u.member_id = p_member;
  if v_due * v_each <> p_expected_cents then raise exception 'wrong_status' using detail = 'amount_changed'; end if;

  for r in select u.member_id, u.lesson, u.done_at from app.lessons_unpaid(f.id) u
              join public.members x on x.id = u.member_id
            where p_member is null or u.member_id = p_member
            order by x.display_name, x.id, u.done_at, u.lesson loop
    if k.id is distinct from r.member_id then
      select * into k from public.members where id = r.member_id;
    end if;
    v_got := app.reward_lesson(f, k, r.lesson, v_each,
      'Money school: ' || coalesce(app.lessons()->>r.lesson, r.lesson)
        || ' (finished ' || to_char(r.done_at at time zone f.timezone, 'FMDD Mon') || ')', me.id);
    if v_got > 0 then
      v_n := v_n + 1; v_sum := v_sum + v_got;
      v_per := v_per || jsonb_build_object(k.id::text, coalesce((v_per->>k.id::text)::int, 0) + 1);
    end if;
  end loop;

  if v_n > 0 then
    perform app.audit(f.id, me.id, 'lesson.reward_past', jsonb_build_object('member', p_member, 'rewarded', v_n,
      'total_cents', v_sum, 'cents_each', v_each, 'kids', v_per));
  end if;
  return jsonb_build_object('rewarded', v_n, 'total_cents', v_sum);
end $$;

-- ---------- 6. pay-out: a Money school bucket ----------
-- Same as 20261116002100_loans.sql except lesson rewards (money rows with source ('lesson', kid, 'lesson-money:…'))
-- and their undo rows (the original's source is carried through the undo join, like its kind) go to lessons_cents
-- instead of rewards_cents. Also: lessons_count (lesson rewards since the cut that were not undone), lessons_each_cents
-- (their one amount, when they all have the same and no lesson reward was undone since the cut; else null),
-- lessons_finished (lessons finished as a kid since the cut) and lessons_unrewarded (finished as a kid, never paid).
create or replace function app.payout_kid(m public.members, f public.families) returns jsonb language sql stable as $$
  with lp as (select p.effective_at, -p.amount as cents from public.transactions p
               where p.member_id = m.id and p.kind = 'payout' and p.reversed_by is null
               order by p.effective_at desc, p.created_at desc limit 1),
  cut as (select coalesce((select lp.effective_at from lp), '-infinity'::timestamptz) as t),
  r0 as (select x.amount, x.effective_at, x.reversed_by,
                (x.kind = 'reversal' and x.source_type = 'reversal') as undo,
                case when x.kind = 'reversal' and x.source_type = 'reversal' then coalesce(o.kind, x.kind) else x.kind end as k,
                case when x.kind = 'reversal' and x.source_type = 'reversal' then o.source_type else x.source_type end as st,
                case when x.kind = 'reversal' and x.source_type = 'reversal' then o.source_key else x.source_key end as sk
           from public.transactions x
           left join public.transactions o on x.kind = 'reversal' and x.source_type = 'reversal' and o.id = x.source_id
          where x.member_id = m.id and x.currency = 'money' and x.pot = 'spending'),
  r as (select r0.*, coalesce(r0.st = 'lesson' and r0.sk like 'lesson-money:%', false) as lesson from r0),
  b as (select coalesce(sum(r.amount), 0)::int as wallet,
               coalesce(sum(r.amount) filter (where r.effective_at > cut.t and r.k = 'allowance'), 0)::int as allowance,
               coalesce(sum(r.amount) filter (where r.effective_at > cut.t and not r.lesson
                          and r.k in ('task_reward','bonus','prize','gift','excuse','interest','saver_bonus')), 0)::int as rewards,
               coalesce(sum(r.amount) filter (where r.effective_at > cut.t
                          and r.k in ('fine','task_penalty','no_savings_penalty')), 0)::int as consequences,
               coalesce(sum(r.amount) filter (where r.effective_at > cut.t and r.k = 'loan_repayment'), 0)::int as loan,
               coalesce(sum(r.amount) filter (where r.effective_at > cut.t and r.lesson), 0)::int as lessons,
               coalesce(sum(r.amount) filter (where r.effective_at > cut.t
                          and r.k not in ('allowance','task_reward','bonus','prize','gift','excuse','interest','saver_bonus',
                                          'fine','task_penalty','no_savings_penalty','payout','loan_repayment')), 0)::int as other,
               count(*) filter (where r.effective_at > cut.t and r.lesson and not r.undo and r.reversed_by is null)::int
                 as lessons_count,
               count(*) filter (where r.effective_at > cut.t and r.lesson and r.undo)::int as lessons_undone,
               count(distinct r.amount) filter (where r.effective_at > cut.t and r.lesson and not r.undo
                                                  and r.reversed_by is null)::int as lessons_amounts,
               max(r.amount) filter (where r.effective_at > cut.t and r.lesson and not r.undo and r.reversed_by is null)
                 as lessons_amount
          from r cross join cut),
  ln as (select l.purpose, app.loan_outstanding(l) as outstanding from public.loans l
          where l.member_id = m.id and l.status = 'active' limit 1)
  select jsonb_build_object(
    'member_id', m.id,
    'wallet_cents', b.wallet,
    'to_pay_cents', greatest(b.wallet, 0),
    'owes_cents', greatest(-b.wallet, 0),
    'last_payout_at', (select lp.effective_at from lp),
    'last_payout_cents', (select lp.cents from lp),
    'since', coalesce((select lp.effective_at from lp), m.created_at),
    'start_cents', b.wallet - b.allowance - b.rewards - b.consequences - b.loan - b.lessons - b.other,
    'allowance_cents', b.allowance,
    'rewards_cents', b.rewards,
    'consequences_cents', b.consequences,
    'loan_cents', b.loan,
    'lessons_cents', b.lessons,
    'other_cents', b.other,
    'lessons_count', b.lessons_count,
    'lessons_each_cents', case when b.lessons_count > 0 and b.lessons_undone = 0 and b.lessons_amounts = 1
                               then b.lessons_amount end,
    'lessons_finished', (select count(*)::int from public.lessons_done d, cut
                          where d.member_id = m.id and d.as_kid and d.done_at > cut.t),
    'lessons_unrewarded', (select count(*)::int from public.lessons_done d
                            where d.member_id = m.id and d.as_kid
                              and not exists (select 1 from public.transactions x
                                               where x.source_type = 'lesson' and x.source_id = d.member_id
                                                 and x.source_key = 'lesson-money:' || d.lesson)),
    'loan_outstanding_cents', (select ln.outstanding from ln),
    'loan_purpose', (select ln.purpose from ln),
    'allowance_cents_per_period', m.allowance_cents,
    'allowance_period', m.allowance_period,
    'allowance_day', m.allowance_day,
    'last_allowance_on', (select (a.effective_at at time zone f.timezone)::date from public.transactions a
                           where a.member_id = m.id and a.kind = 'allowance' and a.currency = 'money' and a.reversed_by is null
                           order by a.effective_at desc limit 1))
  from b $$;

-- ---------- 7. grants ----------
revoke all on function app.lesson_reward_cents(jsonb) from public, anon, authenticated;
revoke all on function app.reward_lesson(public.families, public.members, text, int, text, uuid) from public, anon, authenticated;
revoke all on function app.lessons_unpaid(uuid) from public, anon, authenticated;
revoke all on function app.lessons_due_json(public.families, int) from public, anon, authenticated;
revoke all on function app.payout_kid(public.members, public.families) from public, anon, authenticated;
revoke all on function app.default_settings() from public, anon, authenticated;

revoke all on function public.update_family(jsonb) from public, anon, authenticated;
revoke all on function public.finish_lesson(text) from public, anon, authenticated;
revoke all on function public.list_lessons_done() from public, anon, authenticated;
revoke all on function public.lesson_rewards_due() from public, anon, authenticated;
revoke all on function public.reward_past_lessons(int, uuid) from public, anon, authenticated;

grant execute on function public.update_family(jsonb) to authenticated;
grant execute on function public.finish_lesson(text) to authenticated;
grant execute on function public.list_lessons_done() to authenticated;
grant execute on function public.lesson_rewards_due() to authenticated;
grant execute on function public.reward_past_lessons(int, uuid) to authenticated;
