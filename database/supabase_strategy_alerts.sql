create table if not exists public.user_strategies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  nl_text text not null,
  strategy_json jsonb not null,
  quality jsonb not null default '{}'::jsonb,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_run_date date
);

create table if not exists public.strategy_signals (
  id uuid primary key default gen_random_uuid(),
  strategy_id uuid not null references public.user_strategies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  ticker text not null,
  symbol text,
  signal_date date not null,
  entry_plan jsonb not null default '{}'::jsonb,
  score numeric,
  outcome jsonb,
  created_at timestamptz not null default now(),
  unique(strategy_id, ticker, signal_date)
);

create index if not exists user_strategies_user_id_idx on public.user_strategies(user_id);
create index if not exists user_strategies_enabled_idx on public.user_strategies(enabled);
create index if not exists strategy_signals_strategy_id_idx on public.strategy_signals(strategy_id);
create index if not exists strategy_signals_user_id_idx on public.strategy_signals(user_id);
create index if not exists strategy_signals_date_idx on public.strategy_signals(signal_date desc);

alter table public.user_strategies enable row level security;
alter table public.strategy_signals enable row level security;

drop policy if exists "Users can read own strategies" on public.user_strategies;
create policy "Users can read own strategies"
on public.user_strategies for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert own strategies" on public.user_strategies;
create policy "Users can insert own strategies"
on public.user_strategies for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update own strategies" on public.user_strategies;
create policy "Users can update own strategies"
on public.user_strategies for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete own strategies" on public.user_strategies;
create policy "Users can delete own strategies"
on public.user_strategies for delete
using (auth.uid() = user_id);

drop policy if exists "Users can read own strategy signals" on public.strategy_signals;
create policy "Users can read own strategy signals"
on public.strategy_signals for select
using (auth.uid() = user_id);

drop policy if exists "Service role can manage strategy signals" on public.strategy_signals;
create policy "Service role can manage strategy signals"
on public.strategy_signals for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');
