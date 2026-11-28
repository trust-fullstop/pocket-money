-- Bible time surprise: a family setting bible_reward_cents (family-currency cents, 0 = off), set by the parents.
-- * A KID who taps one of the app's own "Read in the Bible App" / "Open the Bible App" links (they open the YouVersion
--   Bible App) is counted once per family-local day in public.bible_opens. The first open of the day pays the
--   setting into the Wallet: kind 'bonus', pot 'spending', source ('bible', kid, 'bible:<day>'). The unique index on
--   transactions(source_type, source_id, source_key) makes that once per kid per day, also with races and after an
--   undo (an undone day is never paid again).
-- * It is a surprise: kids, grandparents and other relatives never get the value (get_state leaves it out of the
--   family settings for everyone but the managers). Nothing in the app announces it before a kid finds it.
-- * Only what the app itself can see counts: a tap on its links. Opening the Bible App straight from the phone can't
--   be seen. Faith is off, the kid hides verses (Me → Show Bible verses), or the caller isn't a kid: a quiet no-op.
-- * Managers see per kid how many days this month / in the last 7 days and the last day (bible_opens_summary).
-- * Pay-out: these rewards (and their undo rows) get their own bucket, bible_cents, taken out of rewards_cents, so
--   start + allowance + rewards + consequences + loan + lessons + bible + other = wallet still holds.
-- Faith reflections stay as they were: no quiz, score or XP, and beliefs are never evaluated.

-- ---------- 1. the setting ----------
-- Same as 20261116002500_lesson_rewards.sql plus "bible_reward_cents": 0 (off).
create or replace function app.default_settings() returns jsonb language sql immutable as $$
  select '{"interest_pct_month":2,"saver_bonus_points":10,"no_savings_penalty_points":10,"late_grace_minutes":60,
           "challenge_points_cap":50,"grandparents_see_money":true,"emergency_visibility":"family",
           "catchup_days":7,"default_evidence":"photo","managers_add_adults":false,"spend_currency":null,
           "lesson_reward_cents":0,"bible_reward_cents":0}'::jsonb
         || jsonb_build_object('features', app.default_features(), 'spot_rules', app.default_spot_rules()) $$;

-- The Bible time surprise from merged settings (app.settings): a whole number 0..100000, anything else counts as 0.
create or replace function app.bible_reward_cents(s jsonb) returns int language sql immutable as $$
  select case when jsonb_typeof(s->'bible_reward_cents') = 'number'
              then least(greatest(trunc((s->>'bible_reward_cents')::numeric), 0), 100000)::int
              else 0 end $$;

-- Same as 20261116002500_lesson_rewards.sql, plus the `bible_reward_cents` rule (a whole number 0..100000).
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
      elsif k in ('lesson_reward_cents','bible_reward_cents') and jsonb_typeof(v) = 'number'
            and (v::text)::numeric between 0 and 100000 and (v::text)::numeric = trunc((v::text)::numeric) then
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

-- ---------- 2. get_state: the surprise stays a surprise ----------
-- Identical to 20261116002200_initiatives.sql except family.settings: everyone but the managers gets it without
-- bible_reward_cents (kids, grandparents and other relatives never see the value).
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
                                 'settings', case when mgr then s else s - 'bible_reward_cents' end,
                                 'created_at', f.created_at),
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

-- ---------- 3. bible_opens: one row per kid per family-local day ----------
-- first_at / last_at: the first and the latest tap that day; opens: how many taps (capped); ref: the first tap's link.
create table if not exists public.bible_opens (
  member_id uuid not null references public.members(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  day date not null,
  first_at timestamptz not null default app.now(),
  last_at timestamptz not null default app.now(),
  opens int not null default 1 check (opens between 1 and 1000),
  ref text check (char_length(ref) <= 40),
  primary key (member_id, day)
);
create index if not exists bible_opens_family_idx on public.bible_opens(family_id, day desc);
alter table public.bible_opens enable row level security;
revoke all on public.bible_opens from public, anon, authenticated;

-- ---------- 4. a kid opened the Bible App from the app ----------
-- p_ref: which link (e.g. "Proverbs 13:11" or "home"), trimmed and clipped to 40 characters, kept for the first open
-- of the day. Not a kid / removed from the family / faith off / verses hidden: {counted: false, rewarded_cents: 0}
-- and nothing is stored (a quiet no-op, also for a removed kid whose phone still sends a late tap).
-- Otherwise {counted: true, first_today, rewarded_cents}: rewarded_cents is what went into the Wallet now (0 when the
-- setting is 0, it is not the first open today, or that day was already paid / undone before).
create or replace function public.bible_opened(p_ref text default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare me public.members; f public.families; s jsonb; v_day date; v_ref text; v_first boolean := false;
  v_each int; v_paid int := 0;
begin
  begin
    me := app.me();
  exception when raise_exception then
    if sqlerrm <> 'not_member' then raise; end if;
    return jsonb_build_object('counted', false, 'rewarded_cents', 0);
  end;
  select * into f from public.families where id = me.family_id;
  s := app.settings(f);
  if not app.feature_on_s(s, 'faith') or me.role <> 'kid' or not me.active
     or coalesce(me.theme->'verses' = 'false'::jsonb, false) then
    return jsonb_build_object('counted', false, 'rewarded_cents', 0);
  end if;
  v_day := app.today(f);
  v_ref := nullif(left(regexp_replace(btrim(coalesce(p_ref, '')), '\s+', ' ', 'g'), 40), '');
  insert into public.bible_opens(member_id, family_id, day, ref) values (me.id, f.id, v_day, v_ref)
    on conflict (member_id, day) do nothing
    returning true into v_first;
  v_first := coalesce(v_first, false);
  if not v_first then
    update public.bible_opens set opens = least(opens + 1, 1000), last_at = app.now()
     where member_id = me.id and day = v_day;
  end if;
  v_each := app.bible_reward_cents(s);
  if v_first and v_each > 0 then
    if app.post(f.id, me.id, 'money', 'spending', v_each, 'bonus', null, '📖 Bible time', me.id,
                'bible', me.id, 'bible:' || v_day::text) is not null then
      v_paid := v_each;
    end if;
  end if;
  return jsonb_build_object('counted', true, 'first_today', v_first, 'rewarded_cents', v_paid);
end $$;

-- ---------- 5. managers: who opened it ----------
-- Per active kid: days opened this family-local month and in the last 7 days (today included), the last day, and the
-- surprise money of this month that was not undone. Plus the current setting.
create or replace function public.bible_opens_summary() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare me public.members; f public.families; v_today date; v_month date; v_month_at timestamptz;
begin
  me := app.me();
  if not app.is_manager(me.role) then raise exception 'not_allowed'; end if;
  select * into f from public.families where id = me.family_id;
  v_today := app.today(f);
  v_month := date_trunc('month', v_today)::date;
  v_month_at := app.local_ts(v_month, '00:00', f.timezone);
  return jsonb_build_object(
    'cents_each', app.bible_reward_cents(app.settings(f)),
    'today', v_today,
    'month_start', v_month,
    'kids', coalesce((
      select jsonb_agg(jsonb_build_object(
               'member_id', m.id,
               'days_month', (select count(*)::int from public.bible_opens o
                               where o.member_id = m.id and o.day between v_month and v_today),
               'days_7', (select count(*)::int from public.bible_opens o
                           where o.member_id = m.id and o.day between v_today - 6 and v_today),
               'last_day', (select max(o.day) from public.bible_opens o where o.member_id = m.id),
               'rewarded_month_cents', (select coalesce(sum(x.amount), 0)::int from public.transactions x
                                         where x.member_id = m.id and x.source_type = 'bible' and x.currency = 'money'
                                           and x.kind = 'bonus' and x.reversed_by is null and x.effective_at >= v_month_at))
             order by m.display_name, m.id)
        from public.members m
       where m.family_id = f.id and m.active and m.role = 'kid'), '[]'::jsonb));
end $$;

-- ---------- 6. pay-out: a Bible time bucket ----------
-- Same as 20261116002500_lesson_rewards.sql except Bible time rewards (money rows with source ('bible', kid,
-- 'bible:<day>')) and their undo rows (the original's source is carried through the undo join, like its kind) go to
-- bible_cents instead of rewards_cents. Also: bible_days (Bible time rewards since the cut that were not undone) and
-- bible_each_cents (their one amount, when they all have the same and none was undone since the cut; else null).
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
  r as (select r0.*, coalesce(r0.st = 'lesson' and r0.sk like 'lesson-money:%', false) as lesson,
               coalesce(r0.st = 'bible' and r0.sk like 'bible:%', false) as bible from r0),
  b as (select coalesce(sum(r.amount), 0)::int as wallet,
               coalesce(sum(r.amount) filter (where r.effective_at > cut.t and r.k = 'allowance'), 0)::int as allowance,
               coalesce(sum(r.amount) filter (where r.effective_at > cut.t and not r.lesson and not r.bible
                          and r.k in ('task_reward','bonus','prize','gift','excuse','interest','saver_bonus')), 0)::int as rewards,
               coalesce(sum(r.amount) filter (where r.effective_at > cut.t
                          and r.k in ('fine','task_penalty','no_savings_penalty')), 0)::int as consequences,
               coalesce(sum(r.amount) filter (where r.effective_at > cut.t and r.k = 'loan_repayment'), 0)::int as loan,
               coalesce(sum(r.amount) filter (where r.effective_at > cut.t and r.lesson), 0)::int as lessons,
               coalesce(sum(r.amount) filter (where r.effective_at > cut.t and r.bible), 0)::int as bible,
               coalesce(sum(r.amount) filter (where r.effective_at > cut.t
                          and r.k not in ('allowance','task_reward','bonus','prize','gift','excuse','interest','saver_bonus',
                                          'fine','task_penalty','no_savings_penalty','payout','loan_repayment')), 0)::int as other,
               count(*) filter (where r.effective_at > cut.t and r.lesson and not r.undo and r.reversed_by is null)::int
                 as lessons_count,
               count(*) filter (where r.effective_at > cut.t and r.lesson and r.undo)::int as lessons_undone,
               count(distinct r.amount) filter (where r.effective_at > cut.t and r.lesson and not r.undo
                                                  and r.reversed_by is null)::int as lessons_amounts,
               max(r.amount) filter (where r.effective_at > cut.t and r.lesson and not r.undo and r.reversed_by is null)
                 as lessons_amount,
               count(*) filter (where r.effective_at > cut.t and r.bible and not r.undo and r.reversed_by is null)::int
                 as bible_days,
               count(*) filter (where r.effective_at > cut.t and r.bible and r.undo)::int as bible_undone,
               count(distinct r.amount) filter (where r.effective_at > cut.t and r.bible and not r.undo
                                                  and r.reversed_by is null)::int as bible_amounts,
               max(r.amount) filter (where r.effective_at > cut.t and r.bible and not r.undo and r.reversed_by is null)
                 as bible_amount
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
    'start_cents', b.wallet - b.allowance - b.rewards - b.consequences - b.loan - b.lessons - b.bible - b.other,
    'allowance_cents', b.allowance,
    'rewards_cents', b.rewards,
    'consequences_cents', b.consequences,
    'loan_cents', b.loan,
    'lessons_cents', b.lessons,
    'bible_cents', b.bible,
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
    'bible_days', b.bible_days,
    'bible_each_cents', case when b.bible_days > 0 and b.bible_undone = 0 and b.bible_amounts = 1
                             then b.bible_amount end,
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
revoke all on function app.default_settings() from public, anon, authenticated;
revoke all on function app.bible_reward_cents(jsonb) from public, anon, authenticated;
revoke all on function app.payout_kid(public.members, public.families) from public, anon, authenticated;

revoke all on function public.update_family(jsonb) from public, anon, authenticated;
revoke all on function public.get_state() from public, anon, authenticated;
revoke all on function public.bible_opened(text) from public, anon, authenticated;
revoke all on function public.bible_opens_summary() from public, anon, authenticated;

grant execute on function public.update_family(jsonb) to authenticated;
grant execute on function public.get_state() to authenticated;
grant execute on function public.bible_opened(text) to authenticated;
grant execute on function public.bible_opens_summary() to authenticated;
