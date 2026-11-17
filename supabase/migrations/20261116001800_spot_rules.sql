-- Spotted = a quick report. Parents set fixed amounts once (Family rules → Spotted); the phone fills them in, shows
-- them on the check screen and sends exactly what was shown (so the child never gets a different amount than the
-- parent saw). public.spot itself is unchanged. Grandparents still choose their own gift amount.
-- settings.spot_rules = { reward: {cents, minutes, points}, consequence: {cents, minutes, points} }

create or replace function app.default_spot_rules() returns jsonb language sql immutable as $$
  select '{"reward":{"cents":500,"minutes":0,"points":10},"consequence":{"cents":500,"minutes":0,"points":10}}'::jsonb $$;

create or replace function app.default_settings() returns jsonb language sql immutable as $$
  select '{"interest_pct_month":2,"saver_bonus_points":10,"no_savings_penalty_points":10,"late_grace_minutes":60,
           "challenge_points_cap":50,"grandparents_see_money":true,"emergency_visibility":"family",
           "catchup_days":7,"default_evidence":"photo","managers_add_adults":false,"spend_currency":null}'::jsonb
         || jsonb_build_object('features', app.default_features(), 'spot_rules', app.default_spot_rules()) $$;

-- Full shape check: both directions, each with cents 0..100000, minutes 0..1440, points 0..10000 (whole numbers).
-- Returns the clean object (missing numbers → 0), so a partial patch can never drop a direction.
create or replace function app.check_spot_rules(v jsonb) returns jsonb language plpgsql immutable as $$
declare d text; k text; n numeric; lim int; o jsonb := '{}'::jsonb; one jsonb;
begin
  if jsonb_typeof(v) <> 'object' or (select count(*) from jsonb_object_keys(v) x where x not in ('reward','consequence')) > 0
     or not (v ? 'reward' and v ? 'consequence') then
    raise exception 'invalid' using detail = 'setting:spot_rules';
  end if;
  foreach d in array array['reward','consequence'] loop
    if jsonb_typeof(v->d) <> 'object'
       or (select count(*) from jsonb_object_keys(v->d) x where x not in ('cents','minutes','points')) > 0 then
      raise exception 'invalid' using detail = 'setting:spot_rules';
    end if;
    one := '{}'::jsonb;
    foreach k in array array['cents','minutes','points'] loop
      lim := case k when 'cents' then 100000 when 'minutes' then 1440 else 10000 end;
      if v->d ? k and jsonb_typeof(v->d->k) <> 'number' then raise exception 'invalid' using detail = 'setting:spot_rules'; end if;
      n := coalesce((v->d->>k)::numeric, 0);
      if n < 0 or n > lim or n <> trunc(n) then raise exception 'invalid' using detail = 'setting:spot_rules'; end if;
      one := one || jsonb_build_object(k, n::int);
    end loop;
    o := o || jsonb_build_object(d, one);
  end loop;
  return o;
end $$;

-- Same as 20261116001600_spend_currency.sql, plus the `spot_rules` rule (validated and stored whole).
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

revoke all on function app.default_spot_rules() from public, anon, authenticated;
revoke all on function app.check_spot_rules(jsonb) from public, anon, authenticated;