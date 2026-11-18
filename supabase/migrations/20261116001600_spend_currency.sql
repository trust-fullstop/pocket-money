-- The kids spend in another currency (e.g. a parent pays in EUR, the kids buy things in rand). (Comment-only edit after apply.)
-- 1. Family rule `spend_currency` (null = off). The app keeps counting in the family currency; the client shows
--    today's exchange rate next to amounts. The ledger never stores converted amounts.
-- 2. Real bank balances remember their currency (a kid's account can be in rand).

-- ---------- 1. family rule "Kids spend money in" ----------
create or replace function app.default_settings() returns jsonb language sql immutable as $$
  select '{"interest_pct_month":2,"saver_bonus_points":10,"no_savings_penalty_points":10,"late_grace_minutes":60,
           "challenge_points_cap":50,"grandparents_see_money":true,"emergency_visibility":"family",
           "catchup_days":7,"default_evidence":"photo","managers_add_adults":false,"spend_currency":null}'::jsonb
         || jsonb_build_object('features', app.default_features()) $$;

-- The spend currency in use: null when off or when it's the same as the family currency.
create or replace function app.spend_currency(f public.families) returns text language sql stable as $$
  select nullif(nullif(app.settings(f)->>'spend_currency', ''), f.currency) $$;

-- Same as 000100_api_core.sql, plus the `spend_currency` rule (null or a 3-letter ISO code).
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

-- ---------- 2. bank balances remember their currency ----------
alter table public.bank_balances add column if not exists currency text;
update public.bank_balances b set currency = f.currency from public.families f where f.id = b.family_id and b.currency is null;
alter table public.bank_balances alter column currency set not null;
alter table public.bank_balances drop constraint if exists bank_balances_currency_check;
alter table public.bank_balances add constraint bank_balances_currency_check check (currency ~ '^[A-Z]{3}$');

create or replace function app.bank_json(b public.bank_balances, me public.members) returns jsonb language sql stable as $$
  select jsonb_build_object('id', b.id, 'member_id', b.member_id, 'label', b.label, 'amount_cents', b.amount_cents,
    'currency', b.currency, 'as_of', b.as_of, 'note', b.note, 'created_by', b.created_by, 'created_at', b.created_at,
    'can_delete', app.is_manager(me.role) or b.created_by = me.id) $$;

-- One signature only (RPC callers match by argument names): drop the 5-argument version.
drop function if exists public.set_bank_balance(uuid, bigint, text, date, text);

-- Record a balance: the member themself, or a manager for a kid. Currency: the family currency (default), the
-- currency the kids spend in, or one this member's accounts already use (so switching the rule off doesn't strand
-- a rand account).
create or replace function public.set_bank_balance(p_member uuid, p_amount_cents bigint, p_label text default null,
  p_as_of date default null, p_note text default null, p_currency text default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare me public.members; m public.members; f public.families; s jsonb; b public.bank_balances; v_today date; v_cur text;
begin
  me := app.me();
  m := app.get_member(me.family_id, p_member);
  select * into f from public.families where id = me.family_id;
  s := app.settings(f);
  perform app.require_feature(s, 'bank');
  if not (me.id = m.id or (app.is_manager(me.role) and m.role = 'kid')) then raise exception 'not_allowed'; end if;
  v_today := app.today(f);
  v_cur := coalesce(nullif(p_currency, ''), f.currency);
  -- the family currency, the currency the kids spend in, or one this member's accounts already use
  if v_cur is distinct from f.currency and v_cur is distinct from app.spend_currency(f)
     and not exists (select 1 from public.bank_balances x where x.member_id = m.id and x.currency = v_cur) then
    raise exception 'invalid' using detail = 'currency';
  end if;
  if p_amount_cents is null or p_amount_cents not between -10000000 and 1000000000 then raise exception 'invalid' using detail = 'amount'; end if;
  if p_as_of is not null and (p_as_of > v_today or p_as_of < v_today - 366) then raise exception 'invalid' using detail = 'as_of'; end if;
  if char_length(coalesce(trim(p_label), '')) > 40 then raise exception 'invalid' using detail = 'label'; end if;
  if char_length(coalesce(p_note, '')) > 200 then raise exception 'invalid' using detail = 'note'; end if;
  if (select count(*) from public.bank_balances where member_id = m.id and created_at > app.now() - interval '1 day') >= 20 then
    raise exception 'too_many_attempts';
  end if;
  insert into public.bank_balances(family_id, member_id, label, amount_cents, currency, as_of, note, created_by)
    values (f.id, m.id, coalesce(nullif(trim(p_label), ''), 'Bank'), p_amount_cents, v_cur, coalesce(p_as_of, v_today),
            nullif(trim(p_note), ''), me.id)
    returning * into b;
  perform app.audit(f.id, me.id, 'bank.set', jsonb_build_object('member', m.id, 'label', b.label, 'currency', b.currency));
  return app.bank_json(b, me);
end $$;

-- ---------- 3. grants ----------
revoke all on function public.set_bank_balance(uuid, bigint, text, date, text, text) from public, anon, authenticated;
grant execute on function public.set_bank_balance(uuid, bigint, text, date, text, text) to authenticated;
revoke all on function app.spend_currency(public.families) from public, anon, authenticated;
