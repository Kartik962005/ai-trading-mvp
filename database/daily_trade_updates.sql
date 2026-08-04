create extension if not exists pgcrypto;

create table if not exists public.daily_update_subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.daily_trade_reports (
  id uuid primary key default gen_random_uuid(),
  report_date date not null,
  target_date date,
  kind text not null check (kind in ('forecast', 'review')),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (report_date, kind)
);

create index if not exists daily_update_subscriptions_enabled_idx
on public.daily_update_subscriptions(enabled);

create index if not exists daily_trade_reports_target_kind_idx
on public.daily_trade_reports(target_date, kind);

alter table public.daily_update_subscriptions enable row level security;
alter table public.daily_trade_reports enable row level security;

drop policy if exists "Users can read own daily update preference" on public.daily_update_subscriptions;
create policy "Users can read own daily update preference"
on public.daily_update_subscriptions for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert own daily update preference" on public.daily_update_subscriptions;
create policy "Users can insert own daily update preference"
on public.daily_update_subscriptions for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update own daily update preference" on public.daily_update_subscriptions;
create policy "Users can update own daily update preference"
on public.daily_update_subscriptions for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can read daily trade reports" on public.daily_trade_reports;
create policy "Users can read daily trade reports"
on public.daily_trade_reports for select
using (auth.role() = 'authenticated');
