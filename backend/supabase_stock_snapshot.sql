create table if not exists public.stock_snapshot (
  ticker text primary key,
  symbol text not null,
  name text,
  sector text,
  price numeric,
  previous_close numeric,
  today_open numeric,
  gap_pct numeric,
  vwap10 numeric,
  change_pct numeric,
  trailing_pe numeric,
  forward_pe numeric,
  price_to_book numeric,
  market_cap numeric,
  market_cap_cr numeric,
  roe numeric,
  roce numeric,
  roa numeric,
  debt_to_equity numeric,
  revenue_growth numeric,
  profit_growth numeric,
  earnings_quarterly_growth numeric,
  dividend_yield numeric,
  operating_margin numeric,
  profit_margin numeric,
  beta numeric,
  enterprise_value numeric,
  total_cash numeric,
  total_debt numeric,
  rsi14 numeric,
  mfi14 numeric,
  sma20 numeric,
  sma50 numeric,
  sma200 numeric,
  ema20 numeric,
  atr14 numeric,
  ret_1w numeric,
  ret_1m numeric,
  ret_3m numeric,
  ret_6m numeric,
  ret_1y numeric,
  high_52w numeric,
  low_52w numeric,
  vol_ratio numeric,
  latest_volume numeric,
  volume_sma20 numeric,
  latest_date date,
  source text not null default 'Yahoo Finance + NSE',
  updated_at timestamptz not null default now()
);

create index if not exists stock_snapshot_symbol_idx on public.stock_snapshot(symbol);
create index if not exists stock_snapshot_sector_idx on public.stock_snapshot(sector);
create index if not exists stock_snapshot_updated_at_idx on public.stock_snapshot(updated_at desc);
create index if not exists stock_snapshot_pe_roe_idx on public.stock_snapshot(trailing_pe, roe);

alter table public.stock_snapshot add column if not exists today_open numeric;
alter table public.stock_snapshot add column if not exists gap_pct numeric;
alter table public.stock_snapshot add column if not exists vwap10 numeric;

alter table public.stock_snapshot enable row level security;

drop policy if exists "Anyone can read stock snapshot" on public.stock_snapshot;
create policy "Anyone can read stock snapshot"
on public.stock_snapshot for select
using (true);

drop policy if exists "Service role can insert stock snapshot" on public.stock_snapshot;
create policy "Service role can insert stock snapshot"
on public.stock_snapshot for insert
with check (auth.role() = 'service_role');

drop policy if exists "Service role can update stock snapshot" on public.stock_snapshot;
create policy "Service role can update stock snapshot"
on public.stock_snapshot for update
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

drop policy if exists "Service role can delete stock snapshot" on public.stock_snapshot;
create policy "Service role can delete stock snapshot"
on public.stock_snapshot for delete
using (auth.role() = 'service_role');
