-- Bullseye daily signal notifications schema
-- Users come from Supabase auth.users. This schema stores app-specific notification,
-- model run, signal, outcome, email, and audit data.

create extension if not exists pgcrypto;

create table if not exists public.notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  daily_stock_email_enabled boolean not null default false,
  market text not null default 'NSE',
  risk_level text not null default 'Balanced',
  email_time time not null default '18:00',
  signal_type text not null default 'Next-day swing',
  consent_version text,
  consent_accepted_at timestamptz,
  unsubscribed_at timestamptz,
  unsubscribe_nonce text,
  unsubscribe_token_hash text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.model_runs (
  id uuid primary key default gen_random_uuid(),
  run_date date not null,
  target_date date not null,
  market text not null,
  risk_level text not null,
  signal_type text not null,
  model_version text not null,
  generated_at timestamptz not null default timezone('utc', now()),
  universe_size integer not null default 0,
  filtered_count integer not null default 0,
  selected_count integer not null default 0,
  data_timestamp timestamptz,
  status text not null default 'completed',
  summary jsonb not null default '{}'::jsonb
);

create table if not exists public.stock_signals (
  id uuid primary key default gen_random_uuid(),
  model_run_id uuid not null references public.model_runs(id) on delete cascade,
  symbol text not null,
  company_name text,
  sector text,
  direction text not null,
  entry_low numeric(14,4) not null,
  entry_high numeric(14,4) not null,
  target_price numeric(14,4) not null,
  stop_loss numeric(14,4) not null,
  confidence numeric(8,6) not null,
  expected_r numeric(12,6) not null,
  risk_reward numeric(12,6) not null,
  final_score numeric(12,6) not null,
  setup_type text not null,
  explanation_json jsonb not null default '{}'::jsonb,
  model_version text not null,
  run_date date not null,
  target_date date not null,
  market text not null,
  data_quality_valid boolean not null default true,
  signal_rank integer
);

create table if not exists public.signal_outcomes (
  id uuid primary key default gen_random_uuid(),
  stock_signal_id uuid not null unique references public.stock_signals(id) on delete cascade,
  outcome text not null,
  realized_r numeric(12,6),
  evaluated_at timestamptz not null default timezone('utc', now()),
  hit_sequence text,
  notes jsonb not null default '{}'::jsonb
);

create table if not exists public.email_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  model_run_id uuid references public.model_runs(id) on delete set null,
  email text not null,
  email_kind text not null,
  target_date date,
  status text not null,
  provider text,
  response jsonb not null default '{}'::jsonb,
  sent_at timestamptz not null default timezone('utc', now()),
  error_message text
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists notification_preferences_enabled_idx
  on public.notification_preferences(daily_stock_email_enabled, market, risk_level, signal_type);
create index if not exists model_runs_scope_idx
  on public.model_runs(run_date desc, market, risk_level, signal_type);
create index if not exists stock_signals_run_idx
  on public.stock_signals(model_run_id, signal_rank);
create index if not exists stock_signals_target_idx
  on public.stock_signals(target_date, market);
create index if not exists signal_outcomes_signal_idx
  on public.signal_outcomes(stock_signal_id);
create index if not exists email_logs_user_idx
  on public.email_logs(user_id, sent_at desc);
create index if not exists email_logs_run_idx
  on public.email_logs(model_run_id, email_kind);
create index if not exists audit_logs_user_idx
  on public.audit_logs(user_id, created_at desc);

alter table public.notification_preferences enable row level security;
alter table public.model_runs enable row level security;
alter table public.stock_signals enable row level security;
alter table public.signal_outcomes enable row level security;
alter table public.email_logs enable row level security;
alter table public.audit_logs enable row level security;

drop policy if exists "Users can read own notification preferences" on public.notification_preferences;
create policy "Users can read own notification preferences"
on public.notification_preferences for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert own notification preferences" on public.notification_preferences;
create policy "Users can insert own notification preferences"
on public.notification_preferences for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update own notification preferences" on public.notification_preferences;
create policy "Users can update own notification preferences"
on public.notification_preferences for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Authenticated users can read model runs" on public.model_runs;
create policy "Authenticated users can read model runs"
on public.model_runs for select
using (auth.role() = 'authenticated');

drop policy if exists "Authenticated users can read stock signals" on public.stock_signals;
create policy "Authenticated users can read stock signals"
on public.stock_signals for select
using (auth.role() = 'authenticated');

drop policy if exists "Authenticated users can read outcomes" on public.signal_outcomes;
create policy "Authenticated users can read outcomes"
on public.signal_outcomes for select
using (auth.role() = 'authenticated');

drop policy if exists "Users can read own email logs" on public.email_logs;
create policy "Users can read own email logs"
on public.email_logs for select
using (auth.uid() = user_id);

drop policy if exists "Users can read own audit logs" on public.audit_logs;
create policy "Users can read own audit logs"
on public.audit_logs for select
using (auth.uid() = user_id);
