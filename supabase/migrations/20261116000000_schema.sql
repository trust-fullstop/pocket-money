-- =====================================================================
-- Pocket Money — schema (runs on Supabase and on PGlite)
-- Money = integer cents, time = integer minutes, points = integer XP.
-- Balances are never stored: balance = sum(transactions.amount).
-- =====================================================================
create schema if not exists app;
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

-- Single source of 'now' so tests and the demo can time-travel (overridden in PGlite only).
create or replace function app.now() returns timestamptz language sql stable as $$ select now() $$;

create table public.families (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 60),
  currency text not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  timezone text not null default 'Europe/Amsterdam',
  settings jsonb not null default '{}'::jsonb,
  last_tick_at timestamptz,
  created_at timestamptz not null default app.now()
);

create table public.members (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  role text not null check (role in ('owner','parent','step_parent','guardian','grandparent','kid')),
  display_name text not null check (char_length(display_name) between 1 and 40),
  avatar text not null default '🙂' check (char_length(avatar) <= 16),
  photo_path text,
  theme jsonb not null default '{}'::jsonb,
  profile jsonb not null default '{}'::jsonb,
  username text unique check (username ~ '^[a-z0-9_.-]{3,24}$'),
  password_hash text,
  failed_logins int not null default 0,
  locked_until timestamptz,
  allowance_cents int not null default 0 check (allowance_cents between 0 and 100000),
  active boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default app.now()
);
create index members_family_idx on public.members(family_id);

-- One member can be signed in on many devices / identities.
create table public.member_logins (
  user_id uuid primary key,
  member_id uuid not null references public.members(id) on delete cascade,
  label text check (char_length(label) <= 40),
  created_at timestamptz not null default app.now(),
  last_seen_at timestamptz not null default app.now()
);
create index member_logins_member_idx on public.member_logins(member_id);

create table public.invites (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  token text not null unique,
  short_code text not null unique,
  created_by uuid references public.members(id) on delete set null,
  expires_at timestamptz not null,
  used_at timestamptz,
  used_by uuid,
  created_at timestamptz not null default app.now()
);

create table public.redeem_attempts (
  user_id uuid,
  at timestamptz not null default app.now(),
  ok boolean not null
);
create index redeem_attempts_idx on public.redeem_attempts(user_id, at);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  group_id uuid not null,
  kind text not null default 'chore' check (kind in ('chore','challenge')),
  title text not null check (char_length(title) between 1 and 80),
  details text check (char_length(details) <= 500),
  emoji text not null default '✅' check (char_length(emoji) <= 16),
  created_by uuid not null references public.members(id),
  assignee_id uuid not null references public.members(id),
  reward_cents int not null default 0 check (reward_cents between 0 and 100000),
  reward_minutes int not null default 0 check (reward_minutes between 0 and 1440),
  reward_points int not null default 0 check (reward_points between 0 and 10000),
  reward_text text check (char_length(reward_text) <= 120),
  time_label text not null default 'game' check (time_label in ('wifi','game','fun')),
  penalty_cents int not null default 0 check (penalty_cents between 0 and 100000),
  penalty_minutes int not null default 0 check (penalty_minutes between 0 and 1440),
  penalty_points int not null default 0 check (penalty_points between 0 and 10000),
  repeat text not null default 'once' check (repeat in ('once','daily','weekdays','weekly','days')),
  repeat_days int[] not null default '{}',
  start_on date not null,
  end_on date,
  due_time time not null default '19:00',
  evidence text not null default 'photo' check (evidence in ('photo','photo_or_note','none')),
  active boolean not null default true,
  created_at timestamptz not null default app.now()
);
create index tasks_family_idx on public.tasks(family_id, active);

create table public.task_instances (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  assignee_id uuid not null references public.members(id),
  occurs_on date not null,
  due_at timestamptz not null,
  status text not null default 'open' check (status in ('open','submitted','approved','missed','excused','cancelled')),
  before_path text,
  after_path text,
  note text check (char_length(note) <= 500),
  submitted_at timestamptz,
  decided_by uuid references public.members(id),
  decided_at timestamptz,
  decision_note text check (char_length(decision_note) <= 300),
  unique (task_id, occurs_on)
);
create index task_instances_status_idx on public.task_instances(family_id, status, due_at);
create index task_instances_assignee_idx on public.task_instances(assignee_id, occurs_on);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  member_id uuid not null references public.members(id),
  currency text not null check (currency in ('money','time','points')),
  pot text not null check (
    (currency = 'money' and pot in ('spending','savings')) or
    (currency = 'time' and pot = 'time') or
    (currency = 'points' and pot = 'points')),
  amount int not null check (amount <> 0),
  kind text not null check (kind in ('task_reward','task_penalty','bonus','fine','gift','transfer','interest',
                                     'spend','time_use','prize','saver_bonus','no_savings_penalty','excuse','reversal','allowance')),
  label text,
  reason text not null check (char_length(reason) between 1 and 200),
  photo_path text,
  source_type text,
  source_id uuid,
  source_key text,
  reversed_by uuid,
  effective_at timestamptz not null default app.now(),
  created_at timestamptz not null default app.now(),
  created_by uuid references public.members(id)
);
create unique index transactions_source_uq on public.transactions(source_type, source_id, source_key)
  where source_type is not null;
create index transactions_member_idx on public.transactions(member_id, effective_at);

create table public.requests (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  member_id uuid not null references public.members(id),
  kind text not null check (kind in ('spend','withdraw','time')),
  amount int not null check (amount > 0 and amount <= 10000000),
  label text,
  note text check (char_length(note) <= 200),
  status text not null default 'pending' check (status in ('pending','approved','declined','cancelled')),
  decided_by uuid references public.members(id),
  decided_at timestamptz,
  decision_note text check (char_length(decision_note) <= 200),
  created_at timestamptz not null default app.now()
);
create index requests_family_idx on public.requests(family_id, status);

create table public.goals (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  member_id uuid not null references public.members(id),
  title text not null check (char_length(title) between 1 and 60),
  target_cents int not null check (target_cents > 0 and target_cents <= 10000000),
  emoji text not null default '🎯' check (char_length(emoji) <= 16),
  archived boolean not null default false,
  created_at timestamptz not null default app.now()
);

create table public.targets (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  member_id uuid not null references public.members(id),
  title text not null check (char_length(title) between 1 and 80),
  period text not null check (period in ('week','month')),
  metric text not null check (metric in ('completion_pct','money_earned','points_earned')),
  threshold int not null check (threshold >= 0),
  prize_cents int not null default 0 check (prize_cents between 0 and 100000),
  prize_minutes int not null default 0 check (prize_minutes between 0 and 1440),
  prize_points int not null default 0 check (prize_points between 0 and 10000),
  prize_text text check (char_length(prize_text) <= 120),
  time_label text not null default 'fun' check (time_label in ('wifi','game','fun')),
  active boolean not null default true,
  created_by uuid references public.members(id),
  created_at timestamptz not null default app.now()
);

create table public.target_results (
  target_id uuid not null references public.targets(id) on delete cascade,
  period_start date not null,
  value int not null,
  met boolean not null,
  created_at timestamptz not null default app.now(),
  primary key (target_id, period_start)
);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 80),
  notes text check (char_length(notes) <= 500),
  emoji text not null default '📅' check (char_length(emoji) <= 16),
  kind text not null default 'event' check (kind in ('event','reminder','birthday')),
  starts_at timestamptz not null,
  all_day boolean not null default false,
  repeat text not null default 'none' check (repeat in ('none','weekly','monthly','yearly')),
  for_members uuid[] not null default '{}',
  created_by uuid references public.members(id),
  created_at timestamptz not null default app.now()
);

create table public.devices (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  owner_id uuid references public.members(id),
  name text not null check (char_length(name) between 1 and 60),
  type text not null default 'phone' check (type in ('phone','tablet','console','pc','tv','watch','other')),
  model text check (char_length(model) <= 60),
  phone_number text check (char_length(phone_number) <= 30),
  mac text check (char_length(mac) <= 30),
  ip text check (char_length(ip) <= 45),
  notes text check (char_length(notes) <= 300),
  created_by uuid references public.members(id),
  created_at timestamptz not null default app.now()
);

create table public.period_runs (
  family_id uuid not null references public.families(id) on delete cascade,
  period text not null,
  period_start date not null,
  done_at timestamptz not null default app.now(),
  primary key (family_id, period, period_start)
);

create table public.audit_log (
  id bigint generated always as identity primary key,
  family_id uuid not null references public.families(id) on delete cascade,
  actor uuid,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default app.now()
);
create index audit_log_family_idx on public.audit_log(family_id, created_at desc);

-- Lock every table: no direct access, everything goes through RPCs.
do $$
declare t text;
begin
  foreach t in array array['families','members','member_logins','invites','redeem_attempts','tasks','task_instances',
    'transactions','requests','goals','targets','target_results','events','devices','period_runs','audit_log']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
  end loop;
end $$;
