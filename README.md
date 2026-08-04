# Bullseye

An AI stock-research app for the Indian market (NSE). It ranks a universe of
stocks each evening, emails the highest-conviction setups to opted-in users, and
answers plain-English questions about the market with real data rather than a
language model's recollection.

Three things it does:

| Feature | What it is |
| --- | --- |
| **Daily signals** | An after-close pipeline scores the universe and publishes a ranked short list — entry band, target, stop, confidence, and an honest day-level conviction label. Emailed to subscribers at a time they choose. |
| **Screener** | Plain English ("cheap profitable smallcaps with low debt") is translated to SQL by an LLM, validated, and executed against a precomputed snapshot of ~2,000 stocks. Raw SQL is also accepted. |
| **Ask AI** | A research chat that routes each question to a real handler — backtest, cross-market scan, movers, screen, single-stock read — and falls back to conversation when none apply. |

> **Not investment advice.** Bullseye is not a SEBI-registered advisor. The
> models are educational, backtests can be overfit, and the engine deliberately
> labels weak days as "sit this one out". Read `docs/FIXES_AND_DEPLOY.md` for an
> honest account of the measured edge (thin, but positive-expectancy).

---

## Architecture

```
Browser
  │
  ▼
Next.js 16 (Vercel) ── app/api/backend/[...path]  ← server-side proxy
  │                     (browser never calls the API host directly)
  ▼
FastAPI (Render) ──────┬── Supabase Postgres   (signals, users, prefs, outcomes)
                       ├── Supabase Storage    (per-ticker Parquet price history)
                       ├── Yahoo Finance / NSE (market data)
                       └── Groq / Gemini / OpenRouter / Cerebras (LLM chain)
```

**Price data is cached in four layers**, checked in order: process RAM (1h) →
Supabase Storage Parquet → Postgres `stock_prices` → Yahoo chart API → yfinance.
The cache must contain the most recent *completed trading session* or it
refetches; anything staler produced signals priced days out of date.

**Scheduling does not rely on a long-lived process.** Render's free tier sleeps,
which kills in-process loops, so GitHub Actions drives everything externally
(see `.github/workflows/`). `POST /api/v1/daily-updates/run-scheduled` is a
single idempotent tick: it sends due emails *and* records the previous day's
outcomes, deduplicated per user per day.

### Repository layout

```
backend/
  main.py                    FastAPI app — 61 routes, rate limits, CORS
  app/core/                  Supabase client
  app/services/
    daily_signal_engine/     the signal pipeline (see below)
    data_service.py          market data + the 4-layer price cache
    ask_ai_service.py        Ask AI intent router and handlers
    intelligent_screener_service.py   natural language → validated SQL
    strategy_engine.py       safe strategy DSL (Pydantic-validated)
    alert_service.py         per-user price/indicator alerts
    daily_trade_service.py   orchestrates runs, emails, outcome tracking
  app/strategies/
    expression_guard.py      allowlist validator for LLM-authored expressions
    nlp_backtester.py        pandas expression backtester
  scripts/                   one-off jobs: snapshot build, ML training, backtests
  tests/                     unit tests (python -m unittest discover -s tests)

frontend/
  app/                       Next.js routes (/, /screens, /ask-ai, /alerts)
  components/                UI, 3D scene (react-three-fiber), shared pieces
  lib/                       pure helpers — indicators, formatting, chart math

database/                    Supabase schema; run these in the SQL editor
docs/                        design notes, deploy checklists, change history
```

### The signal pipeline

`backend/app/services/daily_signal_engine/` — one module per stage, run in order
by `daily_trade_service.run_daily_prediction()`:

1. **`data_ingestion`** — fetch OHLCV for the universe (80 NSE names by default).
   A failed fetch *skips the ticker*; it never invents prices.
2. **`data_validation`** — reject illiquid, stale, wide-spread, or abnormally
   volatile names. Produces a `quality_score`.
3. **`feature_engineering`** — EMA 20/50, RSI 14, ADX 14, ATR 14, 20-day
   support/resistance, volume averages, returns.
4. **`technical_rules`** — 8 bullish and 8 bearish checks. Needs a directional
   edge of ≥ 2 to be a candidate at all; ties are `HOLD`.
5. **`market_regime`** — index trend (bullish / bearish / neutral) and strength.
6. **`ml_interface`** — a gradient model over 30 features predicts win
   probability, calibrated against realised outcomes. Falls back to a logistic
   approximation when the artifact is missing.
7. **`scoring`** — expected R (net of cost and slippage) and a weighted
   `final_score` across nine factors.
8. **`diversification`** — max 2 per sector, drop names correlated ≥ 0.92 with
   an already-selected pick, take the top N.
9. **`outcome_tracking`** — the next day, mark each signal WIN / LOSS / NEUTRAL
   from the actual bar. Those results feed step 6's calibration.

---

## Running it locally

**Prerequisites:** Node 20.9+ (22 or 24 recommended), Python 3.12, a Supabase
project, and at least one LLM API key.

### 1. Database

Open the Supabase SQL editor and run the files in `database/`. Order does not
matter — they only depend on `auth.users`:

| File | Creates |
| --- | --- |
| `daily_signal_notifications.sql` | prefs, model runs, signals, outcomes, email + audit logs |
| `supabase_stock_snapshot.sql` | `stock_snapshot` — the screener's data source |
| `supabase_alerts.sql` | user alerts and alert events |
| `supabase_ask_ai.sql` | Ask AI conversation history |
| `supabase_strategy_alerts.sql` | saved strategies and their signals |
| `daily_trade_updates.sql` | daily update subscriptions and reports |

Also create a **private Storage bucket named `stock-prices`** — cached price
history is written there as one Parquet file per ticker.

### 2. Environment

Copy `.env.example` into two real files and fill them in:

```bash
cp .env.example backend/.env        # keep everything except the NEXT_PUBLIC_ block
cp .env.example frontend/.env.local # keep only the NEXT_PUBLIC_ block
```

Both are gitignored. The minimum to boot is `SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`, and one LLM key.

### 3. Backend

Create the virtualenv **outside `backend/`** — `nltk` ≥ 3.10 refuses to import
any package that resolves under the current working directory, and uvicorn runs
from `backend/`, so a venv at `backend/.venv` breaks `textblob` at import time.

```bash
python -m venv .venv
.venv/Scripts/activate          # Windows;  source .venv/bin/activate on macOS/Linux
pip install -r backend/requirements.txt
cd backend && python -m uvicorn main:app --host 127.0.0.1 --port 8000
```

### 4. Frontend

```bash
cd frontend && npm install && npm run dev
```

Open <http://localhost:3000>.

### 5. Check it works

```bash
curl http://127.0.0.1:8000/health
```

The first call to `/api/v1/signals/today` runs a full model run (live fetch plus
ML ranking) and can take a minute; afterwards it is cached for the day.

---

## Populating data

An empty database gives an empty screener. In order:

```bash
cd backend
python scripts/build_snapshot.py    # builds stock_snapshot (~2,000 stocks)
python scripts/ingest_history.py    # backfills price history into Storage
python scripts/train_ml.py --top-n 5 --cost 0.05   # retrain, ~3-5 min, offline
```

The trained artifact is committed at
`backend/app/services/daily_signal_engine/artifacts/win_probability_model.joblib`,
so retraining is optional.

## Tests

```bash
cd backend && python -m unittest discover -s tests -v
```

## Scheduled jobs

`.github/workflows/` — all three need repo secrets `BACKEND_URL` and
`ALERT_ADMIN_KEY`, and `ALERT_ADMIN_KEY` must match the backend's env var
exactly. A mismatch is the usual reason emails silently stop.

| Workflow | Schedule | Purpose |
| --- | --- | --- |
| `daily-alert-emails.yml` | every 15 min after close, weekdays | send due emails + record outcomes |
| `daily-snapshot.yml` | weekdays, 17:00 IST | rebuild `stock_snapshot`, then run saved strategy alerts |
| `keep-alive.yml` | every 10 min | stop the free-tier host sleeping |

## Deploying

Frontend on Vercel, backend on Render, both from `main`. Set the backend env
vars on the host (never commit them), and remember `ALERT_ADMIN_KEY` lives in
three places: backend env, host env, and GitHub secrets.

`docs/FIXES_AND_DEPLOY.md` has the full checklist and the honest performance
numbers.

## Security notes

- The **service-role key bypasses row-level security** — backend only, never in
  any `NEXT_PUBLIC_*` variable.
- Screener SQL, whether written by the LLM or a user, is parsed by `sqlglot`,
  restricted to a single read-only `SELECT` over `stock_snapshot`, then run in an
  in-memory executor. It cannot reach the real database.
- Strategy expressions written by the LLM are validated against an AST allowlist
  (`app/strategies/expression_guard.py`) before evaluation. Without it, a prompt
  injection could reach `pandas.read_pickle` and execute arbitrary code.
- Admin and cron endpoints require the `x-alert-admin-key` header; user endpoints
  require a Supabase bearer token.

## Licence

No licence file yet — all rights reserved by default. Add one before inviting
contributions.
