create extension if not exists pgcrypto;

create table if not exists public.user_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  ticker text not null,
  prompt text not null,
  rule jsonb not null default '{}'::jsonb,
  channels text[] not null default array['email']::text[],
  email text,
  whatsapp text,
  status text not null default 'active' check (status in ('active', 'paused')),
  last_checked_at timestamptz,
  last_triggered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.alert_events (
  id uuid primary key default gen_random_uuid(),
  alert_id uuid references public.user_alerts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  ticker text not null,
  evaluation jsonb not null default '{}'::jsonb,
  notifications jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists user_alerts_user_id_idx on public.user_alerts(user_id);
create index if not exists user_alerts_status_idx on public.user_alerts(status);
create index if not exists alert_events_alert_id_idx on public.alert_events(alert_id);
create index if not exists alert_events_user_id_idx on public.alert_events(user_id);

alter table public.user_alerts enable row level security;
alter table public.alert_events enable row level security;

drop policy if exists "Users can read own alerts" on public.user_alerts;
create policy "Users can read own alerts"
on public.user_alerts for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert own alerts" on public.user_alerts;
create policy "Users can insert own alerts"
on public.user_alerts for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update own alerts" on public.user_alerts;
create policy "Users can update own alerts"
on public.user_alerts for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete own alerts" on public.user_alerts;
create policy "Users can delete own alerts"
on public.user_alerts for delete
using (auth.uid() = user_id);

drop policy if exists "Users can read own alert events" on public.alert_events;
create policy "Users can read own alert events"
on public.alert_events for select
using (auth.uid() = user_id);
