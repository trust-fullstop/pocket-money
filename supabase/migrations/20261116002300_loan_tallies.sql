-- Loans in the tallies ("How Sam is doing" — this week / this month / this year).
-- * app.tally gets two numbers (money / family-currency cents):
--   - loan_repaid: loan repayments in the period, net of undo rows (each row counted by its own date). Positive =
--     paid back; negative = a repayment from an earlier period was undone in this one.
--   - loan_borrowed: loans that started in the period (amount_cents, without a fee), by started_at in the family time
--     zone (the same bounds as the ledger rows). Requested, offered, declined and cancelled loans never count.
--   money_spent now only counts 'spend' rows: loan repayments moved out of Spent into loan_repaid. Earned and lost
--   still leave loan repayments (and their undo rows) out.
-- * public.wallet: loans are between the kid and the managers. Anyone else who may see the wallet (grandparents,
--   relatives) keeps the tallies from before: repayments inside money_spent, loan_repaid and loan_borrowed null.
--   (Their history already shows a repayment as a "Pocket money adjustment" with its amount; unchanged.)
-- * app.tally has one caller: public.wallet.

-- ---------- 1. tallies ----------
-- Identical to 20261116002100_loans.sql except money_spent (spend rows only) and the new loan_repaid / loan_borrowed.
create or replace function app.tally(p_member uuid, f public.families, p_period text, p_start date, p_end date) returns jsonb
language sql stable as $$
  with b as (select app.local_ts(p_start, '00:00', f.timezone) as s, app.local_ts(p_end, '00:00', f.timezone) as e),
  tx as (select x.currency, x.pot, x.kind, x.amount,
                case when x.kind = 'reversal' and o.kind = 'loan_repayment' then 'loan_repayment' else x.kind end as k
           from b cross join public.transactions x
           left join public.transactions o on x.kind = 'reversal' and x.source_type = 'reversal' and o.id = x.source_id
          where x.member_id = p_member and x.effective_at >= b.s and x.effective_at < b.e
            and x.kind <> 'payout' and o.kind is distinct from 'payout'),
  ins as (select i.status, t.reward_cents, t.reward_minutes, t.reward_points
            from public.task_instances i join public.tasks t on t.id = i.task_id
           where i.assignee_id = p_member and i.occurs_on >= p_start and i.occurs_on < p_end)
  select jsonb_build_object('period', p_period, 'start', p_start, 'end', p_end,
    'money_earned', (select coalesce(sum(amount), 0) from tx where currency = 'money' and amount > 0 and kind <> 'transfer'
                       and k <> 'loan_repayment'),
    'money_lost', (select coalesce(-sum(amount), 0) from tx where currency = 'money' and amount < 0
                     and kind not in ('transfer','spend') and k <> 'loan_repayment'),
    'money_spent', (select coalesce(-sum(amount), 0) from tx where currency = 'money' and kind = 'spend'),
    'money_saved', (select coalesce(sum(amount), 0) from tx where kind = 'transfer' and pot = 'savings'),
    'interest', (select coalesce(sum(amount), 0) from tx where currency = 'money' and kind = 'interest'),
    'loan_repaid', (select coalesce(-sum(amount), 0) from tx where currency = 'money' and k = 'loan_repayment'),
    'loan_borrowed', (select coalesce(sum(l.amount_cents), 0) from public.loans l
                       where l.member_id = p_member and l.started_at is not null
                         and l.status in ('active','repaid','forgiven')
                         and l.started_at >= b.s and l.started_at < b.e),
    'time_earned', (select coalesce(sum(amount), 0) from tx where currency = 'time' and amount > 0),
    'time_lost', (select coalesce(-sum(amount), 0) from tx where currency = 'time' and amount < 0 and kind <> 'time_use'),
    'time_used', (select coalesce(-sum(amount), 0) from tx where currency = 'time' and kind = 'time_use'),
    'points_earned', (select coalesce(sum(amount), 0) from tx where currency = 'points' and amount > 0),
    'points_lost', (select coalesce(-sum(amount), 0) from tx where currency = 'points' and amount < 0),
    'tasks_done', (select count(*) from ins where status = 'approved'),
    'tasks_missed', (select count(*) from ins where status = 'missed'),
    'tasks_open', (select count(*) from ins where status in ('open','submitted')),
    'possible_cents', (select coalesce(sum(reward_cents), 0) from ins where status not in ('cancelled','excused')),
    'possible_minutes', (select coalesce(sum(reward_minutes), 0) from ins where status not in ('cancelled','excused')),
    'possible_points', (select coalesce(sum(reward_points), 0) from ins where status not in ('cancelled','excused')))
  from b $$;

-- A tally as someone outside the loan sees it (grandparents, relatives): repayments back inside Spent (exactly the
-- numbers from before this migration), no loan lines.
create or replace function app.tally_without_loans(t jsonb) returns jsonb language sql immutable as $$
  select t || jsonb_build_object(
    'money_spent', coalesce((t->>'money_spent')::bigint, 0) + coalesce((t->>'loan_repaid')::bigint, 0),
    'loan_repaid', null, 'loan_borrowed', null) $$;

-- ---------- 2. wallet: loan tallies for the kid and the managers only ----------
-- Identical to 20261116000300_api_money.sql except the tallies go through app.tally_without_loans for anyone who is
-- neither this member nor a manager.
create or replace function public.wallet(p_member uuid, p_history_limit int default 50) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare me public.members; m public.members; f public.families; s jsonb; v_today date; ws date; ms date; ys date;
  v_loans boolean; t_week jsonb; t_month jsonb; t_ytd jsonb;
begin
  me := app.me();
  m := app.get_member(me.family_id, p_member);
  select * into f from public.families where id = me.family_id;
  s := app.settings(f);
  if not app.can_see_money(me, m, s) then raise exception 'not_allowed'; end if;
  v_today := app.today(f);
  ws := app.week_start(v_today);
  ms := date_trunc('month', v_today)::date;
  ys := make_date(extract(year from v_today)::int, 1, 1);
  v_loans := me.id = m.id or app.is_manager(me.role);
  t_week := app.tally(m.id, f, 'week', ws, ws + 7);
  t_month := app.tally(m.id, f, 'month', ms, (ms + interval '1 month')::date);
  t_ytd := app.tally(m.id, f, 'ytd', ys, v_today + 1);
  if not v_loans then
    t_week := app.tally_without_loans(t_week);
    t_month := app.tally_without_loans(t_month);
    t_ytd := app.tally_without_loans(t_ytd);
  end if;
  return jsonb_build_object(
    'member', app.member_json(m, me, s),
    'balances', app.balances(m.id),
    'tallies', jsonb_build_object('week', t_week, 'month', t_month, 'ytd', t_ytd),
    'history', coalesce((select jsonb_agg(z.j order by z.ea desc, z.ca desc, z.id desc) from (
        select app.tx_json(x, me) as j, x.effective_at as ea, x.created_at as ca, x.id
          from public.transactions x where x.member_id = m.id
         order by x.effective_at desc, x.created_at desc, x.id desc
         limit least(greatest(coalesce(p_history_limit, 50), 0), 200)) z), '[]'::jsonb),
    'goals', coalesce((select jsonb_agg(app.goal_json(g) order by g.created_at)
                         from public.goals g where g.member_id = m.id and not g.archived), '[]'::jsonb),
    'requests', coalesce((select jsonb_agg(z.j order by z.pending desc, z.ca desc) from (
        select app.request_json(r, me) as j, r.created_at as ca, true as pending
          from public.requests r where r.member_id = m.id and r.status = 'pending'
        union all
        (select app.request_json(r, me), r.created_at, false
           from public.requests r where r.member_id = m.id and r.status <> 'pending'
          order by coalesce(r.decided_at, r.created_at) desc limit 10)) z), '[]'::jsonb),
    'targets', coalesce((select jsonb_agg(app.target_json(tg, f) order by tg.period, tg.created_at)
                           from public.targets tg where tg.member_id = m.id and tg.active), '[]'::jsonb),
    'avg_weekly_savings_cents', greatest(0, (select coalesce(sum(x.amount), 0) from public.transactions x
        where x.member_id = m.id and x.pot = 'savings' and x.effective_at >= app.now() - interval '28 days') / 4)::int);
end $$;

-- ---------- 3. grants (Supabase grants EXECUTE on new functions by default, so revoke first) ----------
revoke all on function app.tally(uuid, public.families, text, date, date) from public, anon, authenticated;
revoke all on function app.tally_without_loans(jsonb) from public, anon, authenticated;

revoke all on function public.wallet(uuid, int) from public, anon, authenticated;
grant execute on function public.wallet(uuid, int) to authenticated;
