-- Loans (feature 'loans', off by default): a kid borrows from a parent ("the bank") and picks how to pay it back.
-- The money itself is handed over in real life (cash or bank); the app tracks the debt and the repayments.
-- * public.loans: one row per loan. At most ONE open loan (requested, offered or active) per kid.
--   outstanding = total - net repayments (repayment rows that were not undone) - forgiven_cents.
-- * Repayments are ledger rows of the new kind 'loan_repayment' (money / spending, negative, source 'loan' / loan id).
--   - Scheduled: in tick_family, every pocket-money row paid after the loan started repays ONE installment
--     (source_key 'alw:<allowance tx id>'), never more than the loan needs and never more than the wallet holds.
--     No pocket money, no scheduled repayment ("Pay back now" still works).
--   - Extra: repay_loan_now (source_key 'extra:<client request id>', idempotent).
--   - Every path that posts repayments locks the member row first, then the loan row.
-- * Undo: the generic reverse_transaction refuses loan repayments (detail 'use_loan_tools'); managers use
--   reverse_loan_repayment (a repaid loan becomes active again) or forgive_loan.
-- * Privacy: loans are between the kid and the parents. list_loans refuses everyone else; in the wallet history other
--   viewers (grandparents) see "Pocket money adjustment" without the loan id.
-- * Tallies count repayments as spent; the week-end "nothing saved and nothing left" rule adds this week's repayments
--   back; the pay-out overview shows them as their own bucket.
-- * Switch off: no new requests, approvals or offers, but active loans keep being repaid and stay visible.

-- ---------- 1. feature switch ----------
create or replace function app.feature_keys() returns text[] language sql immutable as $$
  select array['challenges','spotted','allowance','requests','savings','interest','saver_rules','goals','targets',
               'time','points','calendar','emergency','devices','ask','bank','learn','faith','needs','loans'] $$;

create or replace function app.default_features() returns jsonb language sql immutable as $$
  select '{"challenges":false,"spotted":true,"allowance":true,"requests":true,"savings":false,"interest":false,
           "saver_rules":false,"goals":false,"targets":false,"time":false,"points":true,"calendar":true,
           "emergency":true,"devices":false,"ask":false,"bank":true,"learn":true,"faith":false,"needs":true,
           "loans":false}'::jsonb $$;

-- ---------- 2. ledger kind ----------
do $$
declare c text;
begin
  for c in select conname from pg_constraint
            where conrelid = 'public.transactions'::regclass and contype = 'c'
              and pg_get_constraintdef(oid) ~ '\mkind\M' and pg_get_constraintdef(oid) like '%task_reward%'
  loop
    execute format('alter table public.transactions drop constraint %I', c);
  end loop;
end $$;

alter table public.transactions add constraint transactions_kind_check check (kind in (
  'task_reward','task_penalty','bonus','fine','gift','transfer','interest','spend','time_use','prize','saver_bonus',
  'no_savings_penalty','excuse','reversal','allowance','payout','loan_repayment'));

-- ---------- 3. table ----------
-- checked_until: the newest pocket money the schedule already looked at (a pay day when the wallet was empty is not
-- retried later). Members are only soft-deleted, a deleted family removes its loans.
create table if not exists public.loans (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  purpose text not null check (char_length(purpose) between 1 and 80),
  amount_cents int not null check (amount_cents between 1 and 10000000),
  fee_cents int not null default 0 check (fee_cents between 0 and 10000000),
  total_cents int not null,
  plan text not null check (plan in ('per_pay','next_pay')),
  installment_cents int not null check (installment_cents >= 1),
  status text not null default 'requested'
    check (status in ('requested','offered','active','declined','cancelled','forgiven','repaid')),
  forgiven_cents int not null default 0 check (forgiven_cents >= 0),
  requested_by uuid references public.members(id),
  decided_by uuid references public.members(id),
  decided_at timestamptz,
  decision_note text check (char_length(decision_note) <= 200),
  started_at timestamptz,
  ended_at timestamptz,
  checked_until timestamptz,
  created_at timestamptz not null default app.now(),
  constraint loans_total check (total_cents = amount_cents + fee_cents),
  constraint loans_installment check (installment_cents <= total_cents),
  constraint loans_started check (status not in ('active','repaid','forgiven') or started_at is not null)
);
create unique index if not exists loans_one_open_uq on public.loans(member_id)
  where status in ('requested','offered','active');
create index if not exists loans_family_idx on public.loans(family_id, status, created_at);
alter table public.loans enable row level security;
revoke all on public.loans from public, anon, authenticated;

-- ---------- 4. helpers ----------
-- "€15.00", "R 150.00", "USD 3.50" (server-side text for ledger reasons).
create or replace function app.money_text(p_cents int, p_currency text) returns text language sql immutable as $$
  select case upper(coalesce(p_currency, '')) when 'EUR' then '€' when 'ZAR' then 'R ' when 'USD' then '$'
              when 'GBP' then '£' else upper(coalesce(p_currency, '')) || ' ' end
         || to_char(p_cents / 100.0, 'FM999999990.00') $$;

-- Net repaid: repayment rows that were not undone (an undo row is exactly minus its repayment).
create or replace function app.loan_repaid(p_loan uuid) returns int language sql stable as $$
  select coalesce(-sum(x.amount), 0)::int from public.transactions x
   where x.source_type = 'loan' and x.source_id = p_loan and x.kind = 'loan_repayment' and x.reversed_by is null $$;

create or replace function app.loan_outstanding(l public.loans) returns int language sql stable as $$
  select greatest(l.total_cents - app.loan_repaid(l.id) - l.forgiven_cents, 0) $$;

-- Next pocket-money day strictly after today (pocket money paid today was before the loan started), honouring
-- allowance_since. Null without pocket money. An estimate: the schedule guards may skip a day after a change.
create or replace function app.loan_next_pay(m public.members, f public.families) returns date language sql stable as $$
  select case when m.allowance_cents > 0 and app.feature_on_s(app.settings(f), 'allowance') then
    app.pay_day_on_or_before(
      case m.allowance_period
        when 'week' then greatest(app.today(f), coalesce(m.allowance_since - 1, app.today(f))) + 7
        else (greatest(app.today(f), coalesce(m.allowance_since - 1, app.today(f))) + interval '1 month')::date end,
      m.allowance_period, m.allowance_day) end $$;

create or replace function app.loan_json(l public.loans, me public.members) returns jsonb language sql stable as $$
  with v as (select app.loan_repaid(l.id) as repaid, app.loan_outstanding(l) as outstanding,
               l.status in ('requested','offered','active') as open,
               app.is_manager(me.role) and me.family_id = l.family_id as mgr,
               app.loan_next_pay(m, f) as next_pay, m.allowance_period as period
          from public.members m join public.families f on f.id = m.family_id
         where m.id = l.member_id),
  d as (select v.*, case when v.open and v.outstanding > 0
                         then (v.outstanding + l.installment_cents - 1) / l.installment_cents end as days_left
          from v)
  select jsonb_build_object(
    'id', l.id, 'member_id', l.member_id, 'purpose', l.purpose, 'amount_cents', l.amount_cents, 'fee_cents', l.fee_cents,
    'total_cents', l.total_cents, 'repaid_cents', d.repaid, 'outstanding_cents', d.outstanding,
    'forgiven_cents', l.forgiven_cents, 'plan', l.plan, 'installment_cents', l.installment_cents, 'status', l.status,
    'requested_by', l.requested_by, 'decided_by', l.decided_by, 'decided_at', l.decided_at,
    'decision_note', l.decision_note, 'started_at', l.started_at, 'ended_at', l.ended_at, 'created_at', l.created_at,
    'next_amount_cents', case when d.open then least(l.installment_cents, d.outstanding) end,
    'next_pay_on', case when d.open then d.next_pay end,
    'pay_days_left', d.days_left,
    'payoff_on', case when d.open and d.next_pay is not null and d.days_left is not null then
                   case d.period when 'week' then d.next_pay + 7 * (d.days_left - 1)
                        else (d.next_pay + make_interval(months => d.days_left - 1))::date end end,
    'can_decide', d.mgr and l.status = 'requested',
    'can_accept', me.id = l.member_id and l.status = 'offered',
    'can_cancel', me.id = l.requested_by and l.status in ('requested','offered'),
    'can_repay', (me.id = l.member_id or d.mgr) and l.status = 'active',
    'can_forgive', d.mgr and l.status = 'active')
  from d $$;

-- Posts one repayment (the caller holds the member lock, then the loan lock) and closes the loan when nothing is left.
-- Returns null when that repayment already exists (same source_key).
create or replace function app.loan_post_repayment(l public.loans, p_amount int, p_by uuid, p_key text,
  p_effective timestamptz default null) returns uuid language plpgsql as $$
declare v_left int; v_cur text; v_id uuid;
begin
  v_left := app.loan_outstanding(l) - p_amount;
  select currency into v_cur from public.families where id = l.family_id;
  v_id := app.post(l.family_id, l.member_id, 'money', 'spending', -p_amount, 'loan_repayment', null,
                   'Loan repayment: ' || l.purpose
                     || case when v_left > 0 then ' (' || app.money_text(v_left, v_cur) || ' to go)' else ' (paid off 🎉)' end,
                   p_by, 'loan', l.id, p_key, p_effective);
  if v_id is not null and v_left <= 0 then
    update public.loans set status = 'repaid', ended_at = app.now() where id = l.id and status = 'active';
  end if;
  return v_id;
end $$;

-- Scheduled repayments (called by tick_family after the pocket money): every pocket-money row of the kid dated after
-- the loan started (and after the last one looked at) repays least(installment, outstanding, wallet), dated one
-- second after that pocket money. Runs whether the switch is on or not: active loans keep being repaid.
create or replace function app.loan_repay_allowances(f public.families) returns int language plpgsql as $$
declare v_loan uuid; v_member uuid; l public.loans; a record; v_amt int; n int := 0;
begin
  for v_loan, v_member in select x.id, x.member_id from public.loans x
                           where x.family_id = f.id and x.status = 'active' order by x.started_at, x.id
  loop
    perform 1 from public.members where id = v_member for update;
    select * into l from public.loans where id = v_loan for update;
    continue when l.status <> 'active';
    for a in select t.id, t.effective_at from public.transactions t
              where t.member_id = l.member_id and t.kind = 'allowance' and t.currency = 'money' and t.reversed_by is null
                and t.effective_at > coalesce(l.checked_until, l.started_at)
              order by t.effective_at, t.id
    loop
      v_amt := least(l.installment_cents, app.loan_outstanding(l), greatest(app.bal(l.member_id, 'spending'), 0));
      if v_amt > 0 and app.loan_post_repayment(l, v_amt, null, 'alw:' || a.id, a.effective_at + interval '1 second')
                       is not null then
        n := n + 1;
      end if;
      update public.loans set checked_until = a.effective_at where id = l.id returning * into l;
      exit when l.status <> 'active';
    end loop;
  end loop;
  return n;
end $$;

-- A loan of the caller's family, or not_found.
create or replace function app.get_loan(p_family uuid, p_id uuid) returns public.loans language plpgsql stable as $$
declare l public.loans;
begin
  select * into l from public.loans where id = p_id and family_id = p_family;
  if not found then raise exception 'not_found' using detail = 'loan'; end if;
  return l;
end $$;

create or replace function app.loan_note(p text) returns text language plpgsql immutable as $$
declare v text := nullif(regexp_replace(btrim(coalesce(p, '')), '\s+', ' ', 'g'), '');
begin
  if char_length(v) > 200 then raise exception 'invalid' using detail = 'note'; end if;
  return v;
end $$;

-- ---------- 5. ledger views: privacy, undo, tallies ----------
-- Identical to 20261116000300_api_money.sql except: loan repayments (and their undo rows) read "Pocket money
-- adjustment" without the loan id for anyone but the kid and the managers ('masked'), and can_reverse on a loan
-- repayment means reverse_loan_repayment (not after the loan was forgiven).
create or replace function app.tx_json(t public.transactions, me public.members) returns jsonb language sql stable as $$
  with v as (select (t.kind = 'loan_repayment'
                     or (t.kind = 'reversal' and t.source_type = 'reversal'
                         and exists (select 1 from public.transactions o where o.id = t.source_id and o.kind = 'loan_repayment')))
                    and not app.is_manager(me.role) and me.id <> t.member_id as masked)
  select jsonb_build_object('id', t.id, 'member_id', t.member_id, 'currency', t.currency, 'pot', t.pot, 'amount', t.amount,
    'kind', case when v.masked then 'adjustment' else t.kind end, 'label', t.label,
    'reason', case when v.masked then 'Pocket money adjustment' else t.reason end,
    'photo_path', t.photo_path, 'source_type', case when v.masked then null else t.source_type end,
    'source_id', case when v.masked then null else t.source_id end, 'reversed_by', t.reversed_by,
    'effective_at', t.effective_at, 'created_at', t.created_at, 'created_by', case when v.masked then null else t.created_by end,
    'masked', v.masked,
    'can_reverse', app.is_manager(me.role) and me.family_id = t.family_id and t.member_id <> me.id
                   and t.kind not in ('transfer','reversal') and t.reversed_by is null
                   and (t.kind <> 'loan_repayment'
                        or not exists (select 1 from public.loans l where l.id = t.source_id and l.status = 'forgiven')))
  from v $$;

-- Identical to 20261116000300_api_money.sql except loan repayments are refused (use the loan tools).
create or replace function public.reverse_transaction(p_tx uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare me public.members; x public.transactions; v_reason text := nullif(trim(p_reason), ''); v_id uuid;
begin
  me := app.me();
  if not app.is_manager(me.role) then raise exception 'not_allowed'; end if;
  select * into x from public.transactions where id = p_tx and family_id = me.family_id for update;
  if not found then raise exception 'not_found' using detail = 'transaction'; end if;
  if x.kind = 'loan_repayment' then raise exception 'not_allowed' using detail = 'use_loan_tools'; end if;
  if x.kind in ('transfer','reversal') or x.member_id = me.id then raise exception 'not_allowed'; end if;
  if x.reversed_by is not null then raise exception 'wrong_status'; end if;
  if v_reason is null then raise exception 'invalid' using detail = 'reason'; end if;
  v_id := app.post(x.family_id, x.member_id, x.currency, x.pot, -x.amount, 'reversal', x.label,
                   left('Reversed: ' || v_reason, 200), me.id, 'reversal', x.id, 'reverse');
  if v_id is null then raise exception 'wrong_status'; end if;
  update public.transactions set reversed_by = v_id where id = x.id;
  perform app.audit(me.family_id, me.id, 'tx.reverse', jsonb_build_object('tx', x.id, 'member', x.member_id,
    'currency', x.currency, 'amount', x.amount, 'kind', x.kind, 'reason', v_reason));
  return jsonb_build_object('ok', true);
end $$;

-- Identical to 20261116002000_payout.sql except a loan repayment and its undo row count as spent (netted), never as
-- earned or lost.
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
    'money_spent', (select coalesce(-sum(amount), 0) from tx where currency = 'money' and (kind = 'spend' or k = 'loan_repayment')),
    'money_saved', (select coalesce(sum(amount), 0) from tx where kind = 'transfer' and pot = 'savings'),
    'interest', (select coalesce(sum(amount), 0) from tx where currency = 'money' and kind = 'interest'),
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

-- ---------- 6. tick_family: scheduled repayments; a repayment is not "nothing left" ----------
-- Identical to 20261116002000_payout.sql except (a) step 3b runs the scheduled loan repayments right after the pocket
-- money (also when the allowance switch is off: then there is simply no new pocket money), and (b) spend_end also adds
-- back THIS week's loan repayments (an undo counts by its original's date), like pay-outs.
create or replace function app.tick_family(p_family uuid) returns jsonb
language plpgsql as $$
declare f public.families; s jsonb; v_today date; v_now timestamptz := app.now(); v_grace int;
  n_created int := 0; n_missed int := 0; n_weeks int := 0; n_months int := 0;
  r record; k public.members; ws date; we date; ws_ts timestamptz; we_ts timestamptz; v_first date; v_last date;
  v_pct numeric; v_saver int; v_nosave int; sav_end bigint; sav_start bigint; spend_end bigint; earned bigint; v_int int;
  v_created date;
  on_time boolean; on_points boolean; on_interest boolean; on_saver boolean; on_targets boolean;
  since_interest date; since_saver date; since_targets date;
begin
  select * into f from public.families where id = p_family for no key update;
  if not found then raise exception 'not_found' using detail = 'family'; end if;
  s := app.settings(f);
  v_today := app.today(f);
  v_grace := coalesce((s->>'late_grace_minutes')::int, 60);
  v_created := (f.created_at at time zone f.timezone)::date;
  on_time := app.feature_on_s(s, 'time');
  on_points := app.feature_on_s(s, 'points');
  on_interest := app.feature_on_s(s, 'interest');
  on_saver := app.feature_on_s(s, 'saver_rules') and on_points;
  on_targets := app.feature_on_s(s, 'targets');
  since_interest := app.feature_since(f.id, 'interest');
  since_saver := greatest(app.feature_since(f.id, 'saver_rules'), app.feature_since(f.id, 'points'));
  since_targets := app.feature_since(f.id, 'targets');

  -- 1. instances
  n_created := app.materialise(f, null);

  -- 2. missed tasks
  for r in select i.id, i.assignee_id, i.due_at, t.title, t.penalty_cents, t.penalty_minutes, t.penalty_points, t.time_label
             from public.task_instances i join public.tasks t on t.id = i.task_id
            where i.family_id = f.id and i.status = 'open' and i.due_at + make_interval(mins => v_grace) < v_now
            order by i.due_at, i.id
            for update of i
  loop
    update public.task_instances set status = 'missed' where id = r.id;
    perform app.post(f.id, r.assignee_id, 'money', 'spending', -r.penalty_cents, 'task_penalty', null,
                     left('Missed: ' || r.title, 200), null, 'task_instance', r.id, 'penalty:money', r.due_at);
    if on_time then
      perform app.post(f.id, r.assignee_id, 'time', 'time', -r.penalty_minutes, 'task_penalty', r.time_label,
                       left('Missed: ' || r.title, 200), null, 'task_instance', r.id, 'penalty:time', r.due_at);
    end if;
    if on_points then
      perform app.post(f.id, r.assignee_id, 'points', 'points', -r.penalty_points, 'task_penalty', null,
                       left('Missed: ' || r.title, 200), null, 'task_instance', r.id, 'penalty:points', r.due_at);
    end if;
    n_missed := n_missed + 1;
  end loop;

  -- 3. pocket money (weekly or monthly schedule per kid)
  if app.feature_on_s(s, 'allowance') then
    perform app.pay_allowances(f);
  end if;

  -- 3b. loan repayments from the pocket money just paid
  perform app.loan_repay_allowances(f);

  -- 4. close completed weeks (unchanged)
  v_pct := coalesce((s->>'interest_pct_month')::numeric, 0);
  v_saver := coalesce((s->>'saver_bonus_points')::int, 0);
  v_nosave := coalesce((s->>'no_savings_penalty_points')::int, 0);
  v_last := app.week_start(v_today) - 7;
  v_first := greatest(v_last - 7 * 11, app.week_start(v_created));
  for ws in select d::date from generate_series(v_first, v_last, interval '7 days') d loop
    continue when exists (select 1 from public.period_runs where family_id = f.id and period = 'week' and period_start = ws);
    we := ws + 7;
    ws_ts := app.local_ts(ws, '00:00', f.timezone);
    we_ts := app.local_ts(we, '00:00', f.timezone);
    for k in select m.* from public.members m
              where m.family_id = f.id and m.active and m.role = 'kid' and m.created_at < we_ts
                and ((on_interest and (since_interest is null or we > since_interest))
                  or (on_saver and (since_saver is null or we > since_saver)))
              order by m.created_at, m.id
    loop
      select coalesce(sum(x.amount) filter (where x.pot = 'savings' and x.effective_at < we_ts), 0),
             coalesce(sum(x.amount) filter (where x.pot = 'savings' and x.effective_at < ws_ts), 0),
             -- a pay-out or loan repayment made in THIS week isn't "nothing left" (add it back); earlier ones stay
             -- counted, so the rule keeps working in later weeks. An undo counts by its original's date.
             coalesce(sum(x.amount) filter (where x.pot = 'spending' and x.effective_at < we_ts
                        and not (x.kind in ('payout','loan_repayment') and x.effective_at >= ws_ts)
                        and not (coalesce(o.kind in ('payout','loan_repayment'), false) and o.effective_at >= ws_ts)), 0),
             coalesce(sum(x.amount) filter (where x.currency = 'money' and x.amount > 0
                        and x.kind in ('task_reward','bonus','gift','prize','allowance')
                        and x.effective_at >= ws_ts and x.effective_at < we_ts), 0)
        into sav_end, sav_start, spend_end, earned
        from public.transactions x
        left join public.transactions o on x.kind = 'reversal' and x.source_type = 'reversal' and o.id = x.source_id
       where x.member_id = k.id;
      if on_interest and (since_interest is null or we > since_interest) then
        v_int := floor(greatest(sav_end, 0) * v_pct * 12 / (100 * 52))::int;
        if v_int > 0 then
          perform app.post(f.id, k.id, 'money', 'savings', v_int, 'interest', null, 'Interest on your savings', null,
                           'week', k.id, 'interest:' || ws, we_ts - interval '1 second');
        end if;
      end if;
      if on_saver and (since_saver is null or we > since_saver) then
        if v_saver > 0 and sav_end > sav_start then
          perform app.post(f.id, k.id, 'points', 'points', v_saver, 'saver_bonus', null, 'Saver bonus: your savings grew this week',
                           null, 'week', k.id, 'saver_bonus:' || ws, we_ts - interval '1 second');
        end if;
        if v_nosave > 0 and earned > 0 and sav_end <= 0 and spend_end <= 0 then
          perform app.post(f.id, k.id, 'points', 'points', -v_nosave, 'no_savings_penalty', null,
                           'Nothing saved and nothing left this week', null, 'week', k.id, 'no_savings:' || ws,
                           we_ts - interval '1 second');
        end if;
      end if;
    end loop;
    if on_targets and (since_targets is null or we > since_targets) then
      perform app.close_targets(f, 'week', ws, we);
    end if;
    insert into public.period_runs(family_id, period, period_start) values (f.id, 'week', ws) on conflict do nothing;
    n_weeks := n_weeks + 1;
  end loop;

  -- 5. close completed months (unchanged)
  v_last := (date_trunc('month', v_today) - interval '1 month')::date;
  v_first := greatest((v_last - interval '2 months')::date, date_trunc('month', v_created)::date);
  for ws in select d::date from generate_series(v_first, v_last, interval '1 month') d loop
    continue when exists (select 1 from public.period_runs where family_id = f.id and period = 'month' and period_start = ws);
    if on_targets and (since_targets is null or (ws + interval '1 month')::date > since_targets) then
      perform app.close_targets(f, 'month', ws, (ws + interval '1 month')::date);
    end if;
    insert into public.period_runs(family_id, period, period_start) values (f.id, 'month', ws) on conflict do nothing;
    n_months := n_months + 1;
  end loop;

  update public.families set last_tick_at = v_now where id = f.id;
  return jsonb_build_object('instances_created', n_created, 'missed', n_missed, 'weeks_closed', n_weeks,
                            'months_closed', n_months);
end $$;

-- ---------- 7. pay-out: a loan bucket ----------
-- Identical to 20261116002000_payout.sql except loan repayments (and their undo rows) get their own bucket
-- loan_cents (left out of other_cents), so start + allowance + rewards + consequences + loan + other = wallet, plus
-- loan_outstanding_cents / loan_purpose of the active loan (null without one).
create or replace function app.payout_kid(m public.members, f public.families) returns jsonb language sql stable as $$
  with lp as (select p.effective_at, -p.amount as cents from public.transactions p
               where p.member_id = m.id and p.kind = 'payout' and p.reversed_by is null
               order by p.effective_at desc, p.created_at desc limit 1),
  cut as (select coalesce((select lp.effective_at from lp), '-infinity'::timestamptz) as t),
  r as (select x.amount, x.effective_at,
               case when x.kind = 'reversal' and x.source_type = 'reversal' then coalesce(o.kind, x.kind) else x.kind end as k
          from public.transactions x
          left join public.transactions o on x.kind = 'reversal' and x.source_type = 'reversal' and o.id = x.source_id
         where x.member_id = m.id and x.currency = 'money' and x.pot = 'spending'),
  b as (select coalesce(sum(r.amount), 0)::int as wallet,
               coalesce(sum(r.amount) filter (where r.effective_at > cut.t and r.k = 'allowance'), 0)::int as allowance,
               coalesce(sum(r.amount) filter (where r.effective_at > cut.t
                          and r.k in ('task_reward','bonus','prize','gift','excuse','interest','saver_bonus')), 0)::int as rewards,
               coalesce(sum(r.amount) filter (where r.effective_at > cut.t
                          and r.k in ('fine','task_penalty','no_savings_penalty')), 0)::int as consequences,
               coalesce(sum(r.amount) filter (where r.effective_at > cut.t and r.k = 'loan_repayment'), 0)::int as loan,
               coalesce(sum(r.amount) filter (where r.effective_at > cut.t
                          and r.k not in ('allowance','task_reward','bonus','prize','gift','excuse','interest','saver_bonus',
                                          'fine','task_penalty','no_savings_penalty','payout','loan_repayment')), 0)::int as other
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
    'start_cents', b.wallet - b.allowance - b.rewards - b.consequences - b.loan - b.other,
    'allowance_cents', b.allowance,
    'rewards_cents', b.rewards,
    'consequences_cents', b.consequences,
    'loan_cents', b.loan,
    'other_cents', b.other,
    'loan_outstanding_cents', (select ln.outstanding from ln),
    'loan_purpose', (select ln.purpose from ln),
    'allowance_cents_per_period', m.allowance_cents,
    'allowance_period', m.allowance_period,
    'allowance_day', m.allowance_day,
    'last_allowance_on', (select (a.effective_at at time zone f.timezone)::date from public.transactions a
                           where a.member_id = m.id and a.kind = 'allowance' and a.currency = 'money' and a.reversed_by is null
                           order by a.effective_at desc limit 1))
  from b $$;

-- Identical to 20261116002000_payout.sql except the lock order: tick_family first (family row, then member and loan
-- rows for the scheduled repayments), then this member, so a pay-out and a tick can never wait on each other.
create or replace function public.record_payout(p_member uuid, p_expected_cents int, p_request uuid, p_note text default null)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare me public.members; m public.members; x public.transactions; v_bal int; v_id uuid;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  me := app.me();
  if not app.is_manager(me.role) then raise exception 'not_allowed'; end if;
  if p_request is null then raise exception 'invalid' using detail = 'request'; end if;
  if p_expected_cents is null then raise exception 'invalid' using detail = 'amount'; end if;
  if char_length(v_note) > 200 then raise exception 'invalid' using detail = 'note'; end if;
  m := app.get_member(me.family_id, p_member);
  if m.role <> 'kid' then raise exception 'not_allowed' using detail = 'member'; end if;

  -- one pay-out at a time per kid (lock order: the family row inside tick_family, then the member)
  perform app.tick_family(me.family_id);
  perform 1 from public.members where id = m.id for update;

  select * into x from public.transactions where source_type = 'payout' and source_id = p_request and source_key = 'payout';
  if found then
    if x.family_id <> me.family_id or x.member_id <> m.id then raise exception 'invalid' using detail = 'request'; end if;
    return app.payout_json(x);
  end if;

  v_bal := app.bal(m.id, 'spending');
  if v_bal <= 0 then raise exception 'invalid' using detail = 'nothing_to_pay'; end if;
  if v_bal <> p_expected_cents then raise exception 'wrong_status' using detail = 'balance_changed'; end if;

  v_id := app.post(me.family_id, m.id, 'money', 'spending', -v_bal, 'payout', null,
                   'Paid out to the bank by ' || me.display_name || coalesce(' · ' || v_note, ''), me.id,
                   'payout', p_request, 'payout');
  if v_id is null then raise exception 'wrong_status' using detail = 'request'; end if;
  perform app.audit(me.family_id, me.id, 'payout.record',
                    jsonb_build_object('member', m.id, 'amount', v_bal, 'note', v_note));
  select * into x from public.transactions where id = v_id;
  return app.payout_json(x);
end $$;

-- ---------- 8. get_state: loan requests waiting (managers only) ----------
-- Identical to 20261116000100_api_core.sql except counts.loans: loan requests waiting for a decision, for managers
-- while the switch is on (0 for everyone else).
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
                                 'settings', s, 'created_at', f.created_at),
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
                  where l.family_id = f.id and l.status = 'requested') else 0 end),
    'today', app.today(f),
    'now', app.now());
end $$;

-- ---------- 9. RPCs ----------
-- A kid asks for themselves (status 'requested'); a manager records a loan already given to a kid (status 'active'
-- right away). per_pay: 1 <= installment <= amount from each pocket money; next_pay: everything from the next one.
create or replace function public.request_loan(p_member uuid, p_amount int, p_purpose text, p_plan text,
  p_installment int default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare me public.members; m public.members; l public.loans; v_mgr boolean; v_inst int;
  v_purpose text := nullif(regexp_replace(btrim(coalesce(p_purpose, '')), '\s+', ' ', 'g'), '');
begin
  me := app.me();
  perform app.require_feature(app.family_settings(me.family_id), 'loans');
  v_mgr := app.is_manager(me.role);
  m := app.get_member(me.family_id, p_member);
  if not (v_mgr or (me.role = 'kid' and me.id = m.id)) then raise exception 'not_allowed'; end if;
  if m.role <> 'kid' then raise exception 'invalid' using detail = 'member'; end if;
  if p_amount is null or p_amount < 1 or p_amount > 10000000 then raise exception 'invalid' using detail = 'amount'; end if;
  if v_purpose is null or char_length(v_purpose) > 80 then raise exception 'invalid' using detail = 'purpose'; end if;
  if p_plan = 'next_pay' then
    v_inst := p_amount;
  elsif p_plan = 'per_pay' then
    if p_installment is null or p_installment < 1 or p_installment > p_amount then
      raise exception 'invalid' using detail = 'installment';
    end if;
    v_inst := p_installment;
  else
    raise exception 'invalid' using detail = 'plan';
  end if;

  perform 1 from public.members where id = m.id for update;
  if exists (select 1 from public.loans where member_id = m.id and status in ('requested','offered','active')) then
    raise exception 'invalid' using detail = 'loan_open';
  end if;
  if not v_mgr and (select count(*) from public.loans
                     where member_id = m.id and requested_by = m.id and status in ('requested','declined','cancelled')
                       and created_at > app.now() - interval '7 days') >= 3 then
    raise exception 'invalid' using detail = 'too_many_loans';
  end if;

  insert into public.loans(family_id, member_id, purpose, amount_cents, fee_cents, total_cents, plan, installment_cents,
                           status, requested_by, decided_by, decided_at, started_at)
  values (me.family_id, m.id, v_purpose, p_amount, 0, p_amount, p_plan, v_inst,
          case when v_mgr then 'active' else 'requested' end, me.id,
          case when v_mgr then me.id end, case when v_mgr then app.now() end, case when v_mgr then app.now() end)
  returning * into l;
  perform app.audit(me.family_id, me.id, case when v_mgr then 'loan.record' else 'loan.request' end,
    jsonb_build_object('loan', l.id, 'member', m.id, 'amount', p_amount, 'plan', p_plan, 'installment', v_inst,
                       'purpose', v_purpose));
  return app.loan_json(l, me);
end $$;

-- Managers: yes (fee 0 → active now), yes with a one-time fee (→ 'offered': the kid must accept; the installment stays,
-- so it takes longer; a next_pay plan still repays everything at once) or no (→ declined).
create or replace function public.decide_loan(p_id uuid, p_approve boolean, p_note text default null, p_fee_cents int default 0)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare me public.members; l public.loans; v_note text; v_fee int := coalesce(p_fee_cents, 0);
begin
  me := app.me();
  if not app.is_manager(me.role) then raise exception 'not_allowed'; end if;
  l := app.get_loan(me.family_id, p_id);
  if p_approve is null then raise exception 'invalid' using detail = 'approve'; end if;
  v_note := app.loan_note(p_note);
  select * into l from public.loans where id = l.id for update;
  if l.status <> 'requested' then raise exception 'wrong_status'; end if;
  if not p_approve then
    update public.loans set status = 'declined', decided_by = me.id, decided_at = app.now(), decision_note = v_note,
                            ended_at = app.now()
     where id = l.id returning * into l;
    perform app.audit(me.family_id, me.id, 'loan.decline', jsonb_build_object('loan', l.id, 'member', l.member_id,
      'amount', l.amount_cents, 'note', v_note));
    return app.loan_json(l, me);
  end if;
  perform app.require_feature(app.family_settings(me.family_id), 'loans');
  if v_fee < 0 or v_fee > l.amount_cents then raise exception 'invalid' using detail = 'fee'; end if;
  if v_fee = 0 then
    update public.loans set status = 'active', decided_by = me.id, decided_at = app.now(), decision_note = v_note,
                            started_at = app.now()
     where id = l.id returning * into l;
    perform app.audit(me.family_id, me.id, 'loan.approve', jsonb_build_object('loan', l.id, 'member', l.member_id,
      'amount', l.amount_cents, 'note', v_note));
  else
    update public.loans set status = 'offered', fee_cents = v_fee, total_cents = amount_cents + v_fee,
                            installment_cents = case when plan = 'next_pay' then amount_cents + v_fee else installment_cents end,
                            decided_by = me.id, decided_at = app.now(), decision_note = v_note
     where id = l.id returning * into l;
    perform app.audit(me.family_id, me.id, 'loan.offer', jsonb_build_object('loan', l.id, 'member', l.member_id,
      'amount', l.amount_cents, 'fee', v_fee, 'note', v_note));
  end if;
  return app.loan_json(l, me);
end $$;

-- The kid says yes or no to an offer with a fee.
create or replace function public.accept_loan_offer(p_id uuid, p_accept boolean) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare me public.members; l public.loans;
begin
  me := app.me();
  l := app.get_loan(me.family_id, p_id);
  if l.member_id <> me.id then raise exception 'not_allowed'; end if;
  if p_accept is null then raise exception 'invalid' using detail = 'accept'; end if;
  select * into l from public.loans where id = l.id for update;
  if l.status <> 'offered' then raise exception 'wrong_status'; end if;
  if p_accept then
    perform app.require_feature(app.family_settings(me.family_id), 'loans');
    update public.loans set status = 'active', started_at = app.now() where id = l.id returning * into l;
  else
    update public.loans set status = 'declined', ended_at = app.now() where id = l.id returning * into l;
  end if;
  perform app.audit(me.family_id, me.id, case when p_accept then 'loan.accept' else 'loan.decline' end,
    jsonb_build_object('loan', l.id, 'member', l.member_id, 'amount', l.amount_cents, 'fee', l.fee_cents, 'offer', true));
  return app.loan_json(l, me);
end $$;

-- Pay back now, from the wallet: the kid (own loan) or a manager. 0 < amount <= min(wallet, outstanding).
-- p_request is a client-made uuid: a retry returns the loan instead of paying twice.
create or replace function public.repay_loan_now(p_id uuid, p_amount int, p_request uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare me public.members; l public.loans; v_out int; v_id uuid;
begin
  me := app.me();
  l := app.get_loan(me.family_id, p_id);
  if not (me.id = l.member_id or app.is_manager(me.role)) then raise exception 'not_allowed'; end if;
  if p_request is null then raise exception 'invalid' using detail = 'request'; end if;
  if exists (select 1 from public.transactions where source_type = 'loan' and source_id = l.id
                                                 and source_key = 'extra:' || p_request) then
    return app.loan_json(l, me);
  end if;
  if p_amount is null or p_amount < 1 then raise exception 'invalid' using detail = 'amount'; end if;

  perform 1 from public.members where id = l.member_id for update;
  select * into l from public.loans where id = l.id for update;
  if l.status <> 'active' then raise exception 'wrong_status'; end if;
  v_out := app.loan_outstanding(l);
  if p_amount > v_out then raise exception 'invalid' using detail = 'more_than_owed'; end if;
  if p_amount > app.bal(l.member_id, 'spending') then raise exception 'insufficient'; end if;
  v_id := app.loan_post_repayment(l, p_amount, me.id, 'extra:' || p_request);
  if v_id is not null then
    perform app.audit(me.family_id, me.id, 'loan.repay', jsonb_build_object('loan', l.id, 'member', l.member_id,
      'amount', p_amount, 'left', v_out - p_amount));
  end if;
  select * into l from public.loans where id = l.id;
  return app.loan_json(l, me);
end $$;

-- Managers: let the rest go. forgiven_cents = what was still to pay.
create or replace function public.forgive_loan(p_id uuid, p_note text default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare me public.members; l public.loans; v_note text; v_out int;
begin
  me := app.me();
  if not app.is_manager(me.role) then raise exception 'not_allowed'; end if;
  l := app.get_loan(me.family_id, p_id);
  v_note := app.loan_note(p_note);
  perform 1 from public.members where id = l.member_id for update;
  select * into l from public.loans where id = l.id for update;
  if l.status <> 'active' then raise exception 'wrong_status'; end if;
  v_out := app.loan_outstanding(l);
  update public.loans set forgiven_cents = forgiven_cents + v_out, status = 'forgiven', ended_at = app.now(),
                          decision_note = coalesce(v_note, decision_note)
   where id = l.id returning * into l;
  perform app.audit(me.family_id, me.id, 'loan.forgive', jsonb_build_object('loan', l.id, 'member', l.member_id,
    'amount', v_out, 'note', v_note));
  return app.loan_json(l, me);
end $$;

-- Whoever asked can take the request back while it waits (requested) or before accepting an offer.
create or replace function public.cancel_loan(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare me public.members; l public.loans;
begin
  me := app.me();
  l := app.get_loan(me.family_id, p_id);
  if l.requested_by is distinct from me.id then raise exception 'not_allowed'; end if;
  select * into l from public.loans where id = l.id for update;
  if l.status not in ('requested','offered') then raise exception 'wrong_status'; end if;
  update public.loans set status = 'cancelled', ended_at = app.now() where id = l.id returning * into l;
  perform app.audit(me.family_id, me.id, 'loan.cancel', jsonb_build_object('loan', l.id, 'member', l.member_id,
    'amount', l.amount_cents));
  return app.loan_json(l, me);
end $$;

-- Managers: undo one repayment (money back in the wallet, the loan owes it again). A repaid loan becomes active again
-- and only pocket money from now on repays it. Not after the loan was forgiven.
create or replace function public.reverse_loan_repayment(p_tx uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare me public.members; x public.transactions; l public.loans; v_id uuid;
  v_reason text := nullif(regexp_replace(btrim(coalesce(p_reason, '')), '\s+', ' ', 'g'), '');
begin
  me := app.me();
  if not app.is_manager(me.role) then raise exception 'not_allowed'; end if;
  select * into x from public.transactions where id = p_tx and family_id = me.family_id;
  if not found then raise exception 'not_found' using detail = 'transaction'; end if;
  if x.kind <> 'loan_repayment' then raise exception 'invalid' using detail = 'transaction'; end if;
  if v_reason is null then raise exception 'invalid' using detail = 'reason'; end if;

  perform 1 from public.members where id = x.member_id for update;
  select * into l from public.loans where id = x.source_id for update;
  if not found then raise exception 'not_found' using detail = 'loan'; end if;
  select * into x from public.transactions where id = x.id for update;
  if x.reversed_by is not null then raise exception 'wrong_status'; end if;
  if l.status = 'forgiven' then raise exception 'not_allowed' using detail = 'forgiven'; end if;
  -- reopening a paid-off loan would clash with a newer open loan (one open loan per kid)
  if l.status = 'repaid' and exists (select 1 from public.loans o where o.member_id = l.member_id and o.id <> l.id
                                       and o.status in ('requested','offered','active')) then
    raise exception 'invalid' using detail = 'loan_open';
  end if;

  v_id := app.post(x.family_id, x.member_id, 'money', 'spending', -x.amount, 'reversal', null,
                   left('Loan repayment undone: ' || v_reason, 200), me.id, 'reversal', x.id, 'reverse');
  if v_id is null then raise exception 'wrong_status'; end if;
  update public.transactions set reversed_by = v_id where id = x.id;
  if l.status = 'repaid' then
    update public.loans set status = 'active', ended_at = null, checked_until = app.now() where id = l.id;
  end if;
  perform app.audit(me.family_id, me.id, 'loan.undo', jsonb_build_object('loan', l.id, 'tx', x.id, 'member', x.member_id,
    'amount', -x.amount, 'reason', v_reason));
  select * into l from public.loans where id = l.id;
  return app.loan_json(l, me);
end $$;

-- Kids: their own loans. Managers: every kid's (or one kid's). Anyone else (grandparents, aunts, uncles): not_allowed.
-- Open loans first, then newest first.
create or replace function public.list_loans(p_member uuid default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare me public.members; m public.members;
begin
  me := app.me();
  if me.role = 'kid' then
    if p_member is not null and p_member <> me.id then raise exception 'not_allowed'; end if;
    m := me;
  elsif app.is_manager(me.role) then
    if p_member is not null then m := app.get_member(me.family_id, p_member); end if;
  else
    raise exception 'not_allowed';
  end if;
  return coalesce((select jsonb_agg(s.j order by s.o desc, s.c desc, s.i)
                     from (select app.loan_json(x, me) as j, x.status in ('requested','offered','active') as o,
                                  x.created_at as c, x.id as i
                             from public.loans x
                            where x.family_id = me.family_id and (m.id is null or x.member_id = m.id)
                            order by 2 desc, 3 desc, 4
                            limit 50) s), '[]'::jsonb);
end $$;

-- ---------- 10. grants (Supabase grants EXECUTE on new functions by default, so revoke first) ----------
revoke all on function app.feature_keys() from public, anon, authenticated;
revoke all on function app.default_features() from public, anon, authenticated;
revoke all on function app.money_text(int, text) from public, anon, authenticated;
revoke all on function app.loan_repaid(uuid) from public, anon, authenticated;
revoke all on function app.loan_outstanding(public.loans) from public, anon, authenticated;
revoke all on function app.loan_next_pay(public.members, public.families) from public, anon, authenticated;
revoke all on function app.loan_json(public.loans, public.members) from public, anon, authenticated;
revoke all on function app.loan_post_repayment(public.loans, int, uuid, text, timestamptz) from public, anon, authenticated;
revoke all on function app.loan_repay_allowances(public.families) from public, anon, authenticated;
revoke all on function app.get_loan(uuid, uuid) from public, anon, authenticated;
revoke all on function app.loan_note(text) from public, anon, authenticated;
revoke all on function app.tx_json(public.transactions, public.members) from public, anon, authenticated;
revoke all on function app.tally(uuid, public.families, text, date, date) from public, anon, authenticated;
revoke all on function app.tick_family(uuid) from public, anon, authenticated;
revoke all on function app.payout_kid(public.members, public.families) from public, anon, authenticated;

revoke all on function public.reverse_transaction(uuid, text) from public, anon, authenticated;
revoke all on function public.record_payout(uuid, int, uuid, text) from public, anon, authenticated;
revoke all on function public.get_state() from public, anon, authenticated;
revoke all on function public.request_loan(uuid, int, text, text, int) from public, anon, authenticated;
revoke all on function public.decide_loan(uuid, boolean, text, int) from public, anon, authenticated;
revoke all on function public.accept_loan_offer(uuid, boolean) from public, anon, authenticated;
revoke all on function public.repay_loan_now(uuid, int, uuid) from public, anon, authenticated;
revoke all on function public.forgive_loan(uuid, text) from public, anon, authenticated;
revoke all on function public.cancel_loan(uuid) from public, anon, authenticated;
revoke all on function public.reverse_loan_repayment(uuid, text) from public, anon, authenticated;
revoke all on function public.list_loans(uuid) from public, anon, authenticated;

grant execute on function public.reverse_transaction(uuid, text) to authenticated;
grant execute on function public.record_payout(uuid, int, uuid, text) to authenticated;
grant execute on function public.get_state() to authenticated;
grant execute on function public.request_loan(uuid, int, text, text, int) to authenticated;
grant execute on function public.decide_loan(uuid, boolean, text, int) to authenticated;
grant execute on function public.accept_loan_offer(uuid, boolean) to authenticated;
grant execute on function public.repay_loan_now(uuid, int, uuid) to authenticated;
grant execute on function public.forgive_loan(uuid, text) to authenticated;
grant execute on function public.cancel_loan(uuid) to authenticated;
grant execute on function public.reverse_loan_repayment(uuid, text) to authenticated;
grant execute on function public.list_loans(uuid) to authenticated;
