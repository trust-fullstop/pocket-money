-- Vera gate 4: (1) switching weekly <-> monthly must never pay twice close together; (2) catch-up stops at 12 weekly
-- pay days (window today-77 .. today), like the original weekly implementation.
-- Rule for a candidate pay day d (the UI preview in AllowanceEditor.tsx mirrors it):
--   * skip if ANY pocket money (weekly or monthly) was paid in the 7 days before d (d-6 .. d), and
--   * skip if pocket money of the SAME schedule was paid in its own period before d (week: d-6 .. d; month: (d-1 month)+1 .. d).
create or replace function app.pay_allowances(f public.families) returns int language plpgsql as $$
declare k public.members; v_today date := app.today(f); v_last date; v_from date; d date; n int := 0;
  v_since_feature date := app.feature_since(f.id, 'allowance'); v_key text; v_prefix text;
begin
  v_last := coalesce((f.last_tick_at at time zone f.timezone)::date, v_today);
  for k in select m.* from public.members m
            where m.family_id = f.id and m.active and m.role = 'kid' and m.allowance_cents > 0
            order by m.created_at, m.id
  loop
    v_from := greatest(app.pay_day_on_or_before(v_last, k.allowance_period, k.allowance_day),
                       v_today - 77,
                       (k.created_at at time zone f.timezone)::date,
                       coalesce(k.allowance_since, '-infinity'::date),
                       coalesce(app.pay_day_on_or_before(v_since_feature, k.allowance_period, k.allowance_day), '-infinity'::date));
    v_prefix := case k.allowance_period when 'week' then 'allowance:' else 'allowance-m:' end;
    for d in select g::date from generate_series(v_from, v_today, interval '1 day') g
              where (k.allowance_period = 'week' and extract(isodow from g)::int = k.allowance_day)
                 or (k.allowance_period = 'month' and extract(day from g)::int = k.allowance_day)
              order by g
    loop
      v_key := v_prefix || d;
      continue when exists (
        select 1 from public.transactions x
         where x.member_id = k.id and x.kind = 'allowance' and x.source_key is distinct from v_key
           and x.effective_at <= app.local_ts(d, '00:00', f.timezone)
           and (x.effective_at > app.local_ts(d - 7, '00:00', f.timezone)
                or (x.source_key like v_prefix || '%'
                    and x.effective_at > app.local_ts(case k.allowance_period when 'week' then d - 7
                                                      else (d - interval '1 month')::date end, '00:00', f.timezone))));
      if app.post(f.id, k.id, 'money', 'spending', k.allowance_cents, 'allowance', 'pocket',
                  case k.allowance_period when 'week' then 'Weekly pocket money' else 'Monthly pocket money' end, null,
                  'week', k.id, v_key, app.local_ts(d, '00:00', f.timezone)) is not null then
        n := n + 1;
      end if;
    end loop;
  end loop;
  return n;
end $$;

revoke all on function app.pay_allowances(public.families) from public, anon, authenticated;
