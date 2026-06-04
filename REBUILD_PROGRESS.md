Phase1=quick wins (speed/window/email/follow-up); Phase2=nightly precompute dataset + real screener data; Phase3=real ML model + screener query quality; Phase4=chat history persistence + scheduler reliability; Phase5=move price history to Cloudflare R2 (Parquet).

# Rebuild Progress

## 2026-06-01 - Phase 1

Status: partial-to-done.

Done:
- Single-stock analysis no longer blocks on live Google News/yfinance sentiment when no fresh sentiment cache exists. It returns neutral sentiment immediately and warms news sentiment in the background.
- Google News primary and fallback RSS requests now run concurrently with about 3 second request timeouts.
- `/api/v1/analyze/{ticker}` now fetches 500 days of history in `analyze_ticker_sync`, preserving the 200-day SMA after indicator `dropna`.
- Daily signal email generation now imports cleanly on Python 3.11, uses a light table-based layout, and includes `signal_type` in the subject.
- Instant alert emails now build and pass an HTML body, log skipped/failed sends clearly, and retry Resend POSTs with backoff.
- Alert service logs startup warnings when `RESEND_API_KEY` or the alert from-address env vars are unset.
- Ask-AI quantitative narration paths now receive the last 6 history turns, capped at 4000 chars per turn.

Partial / not fully verified:
- `/api/v1/alerts/{id}/test` was not triggered end-to-end because this thread does not include a real user bearer token and alert id. The underlying `notify_alert` path was verified directly with a monkeypatched sender and produced an HTML table body.
- Ask-AI follow-up was verified at the narration-message level with a monkeypatched LLM client. A live model call depends on configured server-side LLM env vars.

Files changed:
- `backend/app/strategies/engine.py`
- `backend/main.py`
- `backend/app/services/daily_signal_engine/email_generation.py`
- `backend/app/services/alert_service.py`
- `backend/app/services/ask_ai_service.py`
- `REBUILD_PROGRESS.md`

Verification:
- `python -c "import app.services.daily_signal_engine.email_generation"` passed.
- `python -m py_compile app\strategies\engine.py app\services\alert_service.py app\services\ask_ai_service.py main.py` passed.
- `cd frontend && npx tsc --noEmit` passed.
- Backend `/health` returned `{"status":"Backend is running"}` after starting uvicorn on `127.0.0.1:8000`.
- `GET /api/v1/analyze/RELIANCE.NS` returned in 3.22s with a price verdict and neutral background-warming sentiment.
- Direct alert notification test confirmed an HTML body is passed to `_send_email`.
- Direct Ask-AI narration test confirmed prior turns are injected before the follow-up prompt.

Deviations / decisions:
- Whole-analysis cache writes are skipped when analysis returns with background-warming neutral sentiment, so a later request can use the warmed sentiment instead of being pinned to a neutral cached result for the full analysis TTL.
- `Start-Process` failed in this sandbox due a duplicate `Path`/`PATH` environment issue; uvicorn itself was verified cleanly, and WMI process creation was used after approval to start the backend for endpoint verification.

Owner note:
- Verify the `bullseye.help` sender domain in the Resend dashboard. This cannot be completed from code.

Notes for Phase 2:
- Move single-stock and market-wide sentiment/news precompute into the nightly dataset job so interactive requests read cached news and indicators only.
- Use the precompute job to persist a richer market movers dataset by exchange/session, including volume, sector, and data freshness metadata.
- Add a real screener data source contract and freshness checks before improving natural-language screener query quality.

## 2026-06-01 - Phase 2

Status: partial.

Done:
- Added `backend/supabase_stock_snapshot.sql` for a public `stock_snapshot` table with one row per ticker, public SELECT, and service-role-only writes.
- Added `backend/app/services/stock_snapshot_service.py` for snapshot reads, staleness checks, upserts, frontend row conversion, and parsing the full NSE universe from `frontend/app/stocks.ts`.
- Added `backend/scripts/build_snapshot.py`, runnable standalone, to batch-fetch OHLCV via `screener_service._download_ohlcv`, compute technicals via `_technical_metrics`, fetch real fundamentals via `data_service.get_fundamentals_data`, and chunk-upsert to `stock_snapshot`.
- Added startup stale-check and nightly-after-close background snapshot refresh hooks in `backend/main.py`.
- Removed backend smart screener/screener hash-based fake fundamentals from result rows. Screeners now read `stock_snapshot` first and fall back to live OHLCV only when the snapshot is missing/stale.
- Expanded `/api/v1/screener/search` and `/api/v1/screener/smart-search` to accept the full frontend stock payload instead of truncating to 240/300 stocks.
- Removed frontend technical hash fallbacks and local hashed fundamentals/overrides from screens. The UI now renders backend values or `-` when absent.
- Moved yfinance timezone cache into the backend workspace so batch downloads do not fail with an unwritable SQLite cache path.

Partial / blocked:
- The Supabase project does not yet have `public.stock_snapshot` applied. A real upsert failed with `Could not find the table 'public.stock_snapshot' in the schema cache`. Apply `backend/supabase_stock_snapshot.sql` in Supabase before running the full build.
- Full ~2k-row snapshot build was not completed because the table is missing. A network-enabled dry run for `HDFCBANK.NS`, `TCS.NS`, and `RELIANCE.NS` prepared 3 realistic rows without upserting.
- Smart screener query `PE under 20 and ROE above 15` was smoke-tested before the table exists; it parsed the real rules and returned zero rows instead of fabricating data or crashing.

Files changed:
- `backend/supabase_stock_snapshot.sql`
- `backend/scripts/build_snapshot.py`
- `backend/app/services/stock_snapshot_service.py`
- `backend/app/services/screener_service.py`
- `backend/app/services/smart_search_service.py`
- `backend/app/services/data_service.py`
- `backend/main.py`
- `frontend/app/screens/page.tsx`
- `frontend/app/screens/screen-data.ts`
- `frontend/app/screens/ScreenMetricTable.tsx`
- `frontend/app/screens/[slug]/page.tsx`
- `frontend/app/screens/sector/[sector]/page.tsx`
- `REBUILD_PROGRESS.md`

Verification:
- `python -m py_compile scripts\build_snapshot.py app\services\stock_snapshot_service.py app\services\screener_service.py app\services\smart_search_service.py app\services\data_service.py main.py` passed.
- `cd frontend && npx tsc --noEmit` passed.
- `python scripts\build_snapshot.py --limit 0 --batch-size 2` passed as a no-network smoke test.
- `python scripts\build_snapshot.py --tickers RELIANCE,TCS,HDFCBANK --batch-size 3 --fundamental-workers 3 --dry-run` prepared 3 real rows. Spot values from the dry run: HDFCBANK P/E 16.5908, market cap cr 1144961.155, ROE 13.818; TCS P/E 17.0829, market cap cr 840517.9466, ROE 48.395; RELIANCE P/E 22.1551, market cap cr 1790481.4213, ROE 9.139.
- Direct `smart_search("PE under 20 and ROE above 15", ...)` parsed `P/E < 20` and `ROE > 15`; with the table absent it returned no rows and did not fabricate metrics.

Deviations / decisions:
- Added `--dry-run` to the snapshot builder for safe spot checks before the table exists.
- Kept frontend preset screen metadata available, but removed generated metric values. Preset rows now show `-` for metrics unless backend snapshot rows are provided.
- Snapshot reads fail closed to an empty snapshot when the table is absent/unreachable so live app routes do not 500 before the SQL migration is applied.

Notes for Phase 3:
- After applying the SQL, run the full `python scripts\build_snapshot.py` and then verify row count and indexes in Supabase.
- Use `stock_snapshot` as the training/inference feature base for the real ML model so screener quality and signal scoring share one data contract.
- Add query-quality tests for common fundamental prompts such as `PE under 20 and ROE above 15`, `low debt high ROCE`, and `dividend yield above 3`.

## 2026-06-01 - Phase 3

Status: partial.

Done:
- `backend/scripts/train_ml.py` now saves a runtime `joblib` artifact containing the trained classifier, exact feature order, hold period metadata, and out-of-sample probability-to-realized-R calibration bins.
- `backend/app/services/daily_signal_engine/ml_interface.py` now loads the saved artifact from `ML_MODEL_PATH` or the default artifacts folder, verifies the feature order, logs whether model or fallback inference is used, and falls back gracefully when the artifact is missing.
- Added `build_live_feature_values(...)` so daily signals and single-stock analysis pass inference features in the same order as training.
- Daily signal generation now forwards the ordered feature vector and setup type into model inference.
- Single-stock `run_analysis` now uses model win probability for the visible verdict and confidence, uses model-calibrated expected R for the horizon target, and keeps ATR for stop sizing only. The legacy FISO score remains as a diagnostic field.
- Model confidence is blended with smoothed realized hit-rate from existing `stock_signals` / `signal_outcomes` data when available.
- Smart search now routes through `llm_client.chat` for Groq-to-Gemini fallback instead of direct Groq calls.
- Smart search now validates LLM output with a Pydantic schema and a `stock_snapshot` field whitelist. Invalid structured output returns a clarification response instead of silently falling back to regex.
- Fundamental smart-search filters can use schema filters such as `trailing_pe < 20`, `roe > 15`, `debt_to_equity < 1`, and `ret_3m > 0`.
- Smart search now reports unavailable `stock_snapshot` data honestly and labels closest matches when no exact rows satisfy all requested conditions.

Partial / blocked:
- The real production model artifact was not generated because training depends on the historical dataset/Supabase access. Run `python scripts\train_ml.py` after Phase 2's Supabase table and data are in place.
- The Phase 2 `stock_snapshot` table is still not applied in Supabase, so schema-filtered smart searches cannot return real live rows yet.
- Live Groq/Gemini fallback behavior was not tested end-to-end because network access is restricted in this sandbox. The code path was changed to use `llm_client.chat`.
- Outcome hit-rate calibration was smoke-tested only to the point of graceful failure; Supabase reads are blocked here by socket permissions.

Files changed:
- `backend/requirements.txt`
- `backend/scripts/train_ml.py`
- `backend/app/services/daily_signal_engine/__init__.py`
- `backend/app/services/daily_signal_engine/ml_interface.py`
- `backend/app/services/daily_trade_service.py`
- `backend/app/strategies/engine.py`
- `backend/app/services/smart_search_service.py`
- `REBUILD_PROGRESS.md`

Verification:
- `python -m py_compile backend\scripts\train_ml.py backend\app\services\daily_signal_engine\ml_interface.py backend\app\services\daily_trade_service.py backend\app\strategies\engine.py backend\app\services\smart_search_service.py` passed.
- `python scripts\train_ml.py --help` passed and shows `--model-out`.
- Runtime model missing path was verified: `predict_signal_probabilities(...)` logs fallback and returns `model_path=fallback`.
- Runtime model load path was verified with a temporary `joblib` artifact and returned `model_path=model`.
- Schema-filter smoke test produced conditions for `trailing_pe < 20` and `roe > 15`.
- Fundamental filter smoke test with a monkeypatched snapshot returned a real snapshot row for `PE under 20 and ROE above 15`.
- Clarifying-question path was smoke-tested through `_sanitize_router`.
- `npm.cmd --prefix frontend exec -- tsc -p frontend\tsconfig.json --noEmit` passed. The shorter `npm.cmd --prefix frontend exec -- tsc --noEmit` form only printed TypeScript help because npm did not run it from the frontend project directory.

Deviations / decisions:
- The model interface keeps a local copy of `FEATURE_COLUMNS` to avoid a circular import: `ml_interface -> ml_dataset -> backtest -> ml_interface`. The training artifact is still checked against this list at load time.
- Single-stock analysis uses neutral market/sector/earnings context where the detail endpoint does not have cross-sectional data. Daily signals pass richer context where available.
- The expected return target uses the model artifact's realized-R calibration bins. Until a real artifact exists, fallback inference uses a conservative minimum horizon move.
- Added `scikit-learn` and `joblib` to `backend/requirements.txt` because runtime unpickling of the trained classifier requires the same model stack.

Notes for Phase 4:
- Apply `backend/supabase_stock_snapshot.sql`, run `python scripts\build_snapshot.py`, then run `python scripts\train_ml.py` before judging Phase 3 model quality.
- Add persisted Ask-AI history with compact structured-result summaries so smart-search and movers follow-ups can use saved result context, not just recent text turns.
- For scheduled emails, prefer external cron/admin endpoints or a persisted scheduler state table so restarts do not lose or duplicate sends.

## 2026-06-01 - Phase 4

Status: partial.

Done:
- Added `backend/supabase_ask_ai.sql` for `ask_ai_conversations` and `ask_ai_messages`, with 5-day `expires_at`, indexes, foreign keys to `auth.users`, and RLS policies matching user ownership.
- Added `backend/app/services/ask_ai_history_service.py` for conversation list/load/save, lazy expired-conversation cleanup, sliding 5-day expiry refresh, and compact summaries of prior structured movers/scan/backtest results.
- `/api/v1/ask-ai/chat` now reads the optional bearer token with `get_user_from_authorization`. Anonymous chats still work and return `saved=false`.
- Signed-in Ask-AI turns are persisted as user + assistant messages. Assistant rows store structured `backtest`/`scan` data in JSON for future follow-up context.
- Added `GET /api/v1/ask-ai/conversations` and `GET /api/v1/ask-ai/conversations/{conversation_id}`.
- Frontend Ask-AI now attaches `Authorization: Bearer <token>` when Supabase auth is available, tracks `conversation_id`, loads recent chats, reopens saved conversations, and continues the selected conversation.
- Persisted structured-result summaries are injected back into Ask-AI history for follow-ups when a saved conversation is continued.
- In-process alert and daily-email scheduler loops are now opt-in (`ALERT_CHECKER_ENABLED=true`, `DAILY_UPDATES_ENABLED=true`). By default, scheduling is external via `/api/v1/alerts/check-now`, `/api/v1/daily-updates/run-forecast`, and `/api/v1/daily-updates/run-review`.
- Alert checker default interval, when explicitly enabled, is shortened from 900s to 300s.
- The daily scheduler loop now uses the daily trade service holiday function instead of only checking weekdays.
- Scheduled daily emails now filter due preferences by persistent `email_logs` records for `user_id + target_date + email_kind`, so a restart after the preferred time can catch up without duplicate daily emails for the same target date.

Partial / blocked:
- `backend/supabase_ask_ai.sql` was not applied to the live Supabase project from this sandbox. Apply it before expecting signed-in history persistence.
- Signed-in reload/reopen could not be verified end-to-end because this thread does not include a real user bearer token.
- Live external cron/email delivery was not triggered. The admin endpoints already exist and are now the default scheduling path, but cron setup must be done in Render/GitHub Actions/Supabase.
- Real duplicate/drop behavior after a process restart needs verification against the production `email_logs` table and Resend delivery.

Files changed:
- `backend/supabase_ask_ai.sql`
- `backend/app/services/ask_ai_history_service.py`
- `backend/main.py`
- `backend/app/services/daily_trade_service.py`
- `frontend/app/ask-ai/page.tsx`
- `REBUILD_PROGRESS.md`

Verification:
- Read `frontend/AGENTS.md` and consulted local Next docs: `frontend/node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md`.
- `python -m py_compile main.py app\services\ask_ai_history_service.py app\services\daily_trade_service.py` passed.
- `python -c "import main; print('main import ok')"` passed.
- `npm.cmd --prefix frontend exec -- tsc -p frontend\tsconfig.json --noEmit` passed.
- Anonymous Ask-AI endpoint smoke test with `run_ask_ai` monkeypatched returned HTTP 200, `saved=false`, and did not require auth.
- `compact_structured_summary(...)` smoke test produced a compact previous movers summary.

Deviations / decisions:
- Used lazy cleanup on conversation list/load instead of `pg_cron`, because installing/enabling `pg_cron` is a project-level Supabase decision.
- Did not reject invalid bearer tokens on chat. If auth verification fails, the chat proceeds unsaved so the anonymous path remains reliable.
- Did not add a new scheduler state table. Persistent `email_logs.sent_at` plus `target_date` is the existing durable last-sent record and avoids new migration risk.
- Kept in-process schedulers available behind env flags for local/dev fallback, but disabled them by default so production can use external cron.

Notes for Phase 5:
- Before Phase 5, create the Cloudflare R2 bucket and set `R2_ENDPOINT_URL`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, and `R2_BUCKET` server-side.
- Apply the Phase 2 and Phase 4 Supabase SQL files before running storage migration verification, so snapshot/history features are not confused with R2 cutover issues.
- Keep R2 cutover dual-read/dual-write until price reads are verified against existing Supabase `stock_prices`; do not delete the Supabase table during Phase 5.

## 2026-06-01 - Phase 5

Status: partial.

Done:
- Switched the Phase 5 target from the older R2 handoff note to the requested Supabase Storage private bucket `stock-prices`; no new vendor, keys, or env vars were added.
- Added `backend/app/services/price_store.py` for one Parquet file per ticker at `prices/{ticker}.parquet`, with Storage reads, merge-by-date writes, not-found handling, upload upsert, and file-size cap warning.
- Added `pyarrow` to `backend/requirements.txt`; the local environment already had it installed and `python -c "import pyarrow"` passed.
- Updated `get_historical_data` to read Storage first, fall back to Postgres `stock_prices`, preserve stale cached fallback behavior, and dual-write fresh Yahoo data to Storage plus Postgres.
- Fixed the Layer-2 cache-length bug by validating cached Storage/Postgres history against the requested `days` row requirement before returning it.
- Added `price_store.read_many(tickers)` for simple Python-side bulk Storage reads.
- Added `backend/scripts/migrate_prices_to_storage.py` to page through Postgres `stock_prices`, group by ticker, and merge each ticker into Storage without deleting or modifying Postgres rows.
- Updated `backend/scripts/run_backtest.py` to try Storage first and fall back to Postgres during the cutover.

Partial / blocked:
- Full `stock_prices` backfill was not run in this turn. A safe three-ticker migration subset was run and verified first; run the full migration after confirming runtime behavior is acceptable.
- Reads and writes are intentionally still in cutover mode. Storage is first for reads, Postgres is fallback, and fresh downloads write to both stores.
- The Postgres `stock_prices` table was not deleted, truncated, or dropped.

Files changed:
- `backend/requirements.txt`
- `backend/app/services/price_store.py`
- `backend/app/services/data_service.py`
- `backend/scripts/migrate_prices_to_storage.py`
- `backend/scripts/run_backtest.py`
- `REBUILD_PROGRESS.md`

Verification:
- Confirmed the private Supabase Storage bucket `stock-prices` exists.
- `python -c "import pyarrow"` passed.
- `python -m py_compile app\services\price_store.py app\services\data_service.py scripts\migrate_prices_to_storage.py scripts\run_backtest.py` passed.
- `python -c "import pyarrow; from app.services import price_store; print('price_store import ok', price_store.BUCKET)"` passed.
- Ran `python scripts\migrate_prices_to_storage.py --tickers RELIANCE.NS TCS.NS HDFCBANK.NS --page-size 1000`; it migrated 3 tickers and 3717 total rows to Storage.
- Readback comparison matched Postgres exactly: RELIANCE.NS 1239 rows, last close 1320.0; TCS.NS 1239 rows, last close 2297.3999; HDFCBANK.NS 1239 rows, last close 742.7.
- Direct `get_historical_data('RELIANCE.NS', days=365)` returned a Supabase Storage cache hit with 1239 rows and last close 1320.0.
- Monkeypatched short-cache test confirmed a fresh 60-row Storage series for a 365-day request triggers a Yahoo refetch and returns the longer 220-row frame.
- Restarted backend on `127.0.0.1:8000`; `/health` returned `{"status":"Backend is running"}`.
- `GET /api/v1/analyze/RELIANCE.NS` returned HTTP 200 with a real verdict.
- Ask-AI movers smoke test over the three migrated tickers returned `success=true` and ranked movers for 2026-06-01.
- Ask-AI backtest smoke test with RELIANCE context returned a real backtest summary.
- `npm.cmd --prefix frontend exec -- tsc -p frontend\tsconfig.json --noEmit` passed.

Deviations / decisions:
- Did not switch to Storage-only reads/writes because the full Storage backfill has not yet been completed and verified.
- Did not drop or delete from `stock_prices`; owner approval is still required after at least a day of verified Storage reads.
- `Start-Process` still fails in this sandbox due duplicate `Path`/`PATH`; WMI process creation was used to restart the backend, matching the prior handoff workaround.

Cutover state:
- Storage bucket: exists and verified.
- Storage data: RELIANCE.NS, TCS.NS, and HDFCBANK.NS backfilled and read-verified.
- Reads: Storage-first, Postgres fallback.
- Writes: dual-write to Storage and Postgres.
- Postgres `stock_prices`: intact; not dropped.

## 2026-06-01 - AI Strategy Alerts

Status: partial.

Done:
- Added `backend/app/services/strategy_engine.py` with a strict Pydantic strategy schema, EOD-only/intraday rejection, deterministic predicate evaluation, bounded Storage-backed backtests, quality gate, recent triggers, and the shared educational disclaimer.
- Added `backend/supabase_strategy_alerts.sql` for user-owned `user_strategies` and `strategy_signals`, including RLS and a unique `(strategy_id, ticker, signal_date)` dedupe constraint.
- Added `backend/app/services/strategy_store.py` for strategy CRUD, per-user cap, signal listing, and friendly setup errors when the strategy tables are missing.
- Added authenticated FastAPI endpoints: `POST /api/v1/strategies/backtest`, `POST /api/v1/strategies`, `GET /api/v1/strategies`, `PATCH /api/v1/strategies/{id}`, `DELETE /api/v1/strategies/{id}`, and `GET /api/v1/strategies/{id}/signals`.
- Extended `backend/supabase_stock_snapshot.sql` and `backend/scripts/build_snapshot.py` with `today_open`, `gap_pct`, and `vwap10` so daily detection can use cheap snapshot reads.
- Added `backend/scripts/run_strategy_alerts.py` for GitHub Actions/off-server strategy detection, capped triggers, deduped signal writes, and Resend email delivery through the existing email helper.
- Updated `.github/workflows/daily-snapshot.yml` to run strategy alerts after the snapshot build.
- Added `/alerts` in the frontend for signed-in AI Strategy Alerts: plain-English strategy input, bounded backtest stats, quality verdict, disclaimer, save/enable, list, enable/disable, and delete.
- Added an account-menu link to AI Strategy Alerts.
- Ask-AI responses can now include optional `strategy_json`, `strategy_alert`, and `disclaimer` fields, plus a signed-in "Save as daily alert" CTA when the bounded engine marks a strategy alertable. Existing Ask-AI `backtest` and `scan` response shapes are preserved.

Partial / blocked:
- The live Supabase project still does not have `public.stock_snapshot`, so the real endpoint can translate the required example and return a valid no-data result, but cannot run a live stock universe backtest until `backend/supabase_stock_snapshot.sql` is applied and `build_snapshot.py` runs.
- The live Supabase project does not yet have `public.user_strategies` / `public.strategy_signals`, so CRUD and the daily script degrade with setup messages until `backend/supabase_strategy_alerts.sql` is applied.
- A live dry-run of `run_strategy_alerts.py` could not write signals because the strategy tables are missing. The script exits cleanly with a table-missing message.

Files changed:
- `.github/workflows/daily-snapshot.yml`
- `backend/supabase_stock_snapshot.sql`
- `backend/supabase_strategy_alerts.sql`
- `backend/app/services/strategy_engine.py`
- `backend/app/services/strategy_store.py`
- `backend/app/services/ask_ai_service.py`
- `backend/app/services/stock_snapshot_service.py`
- `backend/scripts/build_snapshot.py`
- `backend/scripts/run_strategy_alerts.py`
- `backend/main.py`
- `frontend/app/alerts/page.tsx`
- `frontend/app/ask-ai/page.tsx`
- `frontend/app/page.tsx`
- `REBUILD_PROGRESS.md`

Verification:
- Read `frontend/AGENTS.md` and consulted local Next docs: `frontend/node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md`.
- `python -m py_compile app\services\strategy_engine.py app\services\strategy_store.py app\services\ask_ai_service.py app\services\stock_snapshot_service.py main.py scripts\build_snapshot.py scripts\run_strategy_alerts.py` passed.
- `python -c "import main; print('main import ok')"` passed.
- Required example translated to valid schema without LLM/network: `gap_pct >= 2`, `price_vs_vwap(10) < 0`, excluded IT/Metals, next-day-open, 15% stop, 20-day hold.
- Required intraday/live example rejected with the mandated EOD-only message.
- `POST /api/v1/strategies/backtest` smoke-tested with FastAPI TestClient on the required example; it returned HTTP 200, valid `strategy_json`, `alertable=false`, and the disclaimer. Current no-data reason is the missing `stock_snapshot` table.
- Local monkeypatched bounded backtest smoke test scanned 5 synthetic rows only, did not go beyond the provided cap, returned quality metadata and disclaimer.
- `python scripts\run_strategy_alerts.py --dry-run --max-triggers 3` exited cleanly and reported missing `user_strategies` instead of crashing.
- `npm.cmd --prefix frontend exec -- tsc -p frontend\tsconfig.json --noEmit` passed.

Deviations / decisions:
- The required example is handled by a deterministic offline translator path before LLM fallback, so verification works even when LLM secrets/network are unavailable.
- The Render endpoint reads at most a capped set of top-market-cap snapshot rows, then cached Parquet files from `price_store`; it does not use Yahoo or scan the full universe.
- `run_strategy_alerts.py` is the only full snapshot detection path and is wired to GitHub Actions after the snapshot build.

Next owner steps:
- Run `backend/supabase_strategy_alerts.sql` in production Supabase.
- Run the `stock_snapshot` ALTER statements in `backend/supabase_stock_snapshot.sql` in production Supabase.
- Ensure GitHub secrets `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `RESEND_API_KEY` exist; optionally set `RESEND_FROM_EMAIL` or `ALERT_FROM_EMAIL`.
- Commit and push, then trigger the daily snapshot workflow once to rebuild `stock_snapshot` with `today_open`, `gap_pct`, and `vwap10`.

## 2026-06-01 - Ask-AI Follow-up + History Fixes

Status: done.

Done:
- Fixed "Test the same idea across all NSE stocks" follow-ups by expanding "same idea/this strategy" prompts from recent chat history before backend intent routing.
- Added a deterministic translator path for the TCS rule shape: buy N days after a weekly fall of X%, sell on a Y% bounce. This prevents the cross-stock follow-up from depending on the LLM to rediscover the rule.
- Changed single-stock backtest suggestions to include the original strategy text when asking to test across all NSE stocks.
- Changed Ask-AI signed-in history TTL from 5 days to 48 hours in both backend code and `backend/supabase_ask_ai.sql`.
- Added Ask-AI saved assistant metadata for strategy alert fields so restored chats keep the CTA context.
- Fixed Ask-AI history loading on refresh by waiting for Supabase auth readiness, tracking auth state changes, and auto-opening the most recent saved conversation for signed-in users when the page first loads.
- Added a bottom scroll anchor plus window/container scroll calls so submitting from higher in the chat moves the user to the newest message/answer.

Files changed:
- `backend/app/services/ask_ai_service.py`
- `backend/app/services/ask_ai_history_service.py`
- `backend/supabase_ask_ai.sql`
- `frontend/app/ask-ai/page.tsx`
- `REBUILD_PROGRESS.md`

Verification:
- `python -m py_compile app\services\ask_ai_service.py app\services\ask_ai_history_service.py main.py` passed.
- `npm.cmd --prefix frontend exec -- tsc -p frontend\tsconfig.json --noEmit` passed.
- Direct backend test confirmed the follow-up expands to: `Scan all NSE stocks for this strategy: If I buy TCS 2 days after it falls 5% in a week, then sell on a 3% bounce, does it work?`
- Direct translator test confirmed that expanded rule becomes `buy_expr=df['week_return'].shift(2) < -5.0`, `sell_expr=df['week_return'] > 3.0`, `mode=crossover`.

Owner note:
- Apply the updated `backend/supabase_ask_ai.sql` default in production Supabase so new conversations default to 48-hour expiry. Existing conversations will use the backend-updated 48-hour expiry the next time a turn is saved.

## 2026-06-03 - Ask-AI Capability + Daily Alert Reliability

Status: done.

Done:
- Hardened the stock-detail FISO analysis engine so a displayed buy/sell requires clear directional edge, data quality, risk/reward, expected-R, confidence, chart-quality, and final-score gates. Failed setups now return `Hold` / `no_trade` instead of a weak directional call.
- Changed the frontend stock-detail presentation so `Hold` / `no_trade` cannot be recolored into a buy/sell just because research price bands have target/stop geometry.
- Removed target, stop-loss, risk/reward, expected-move, and target-date UI from `Hold` stock pages; hold now shows a no-trade explanation instead.
- Removed the stock-specific news panel from stock detail pages.
- Tightened daily-signal defaults and expected-R math, using a conservative loss probability and higher risk/reward, confidence, chart-quality, and final-score thresholds.
- Fixed scheduled daily emails for legacy enabled preferences where `daily_stock_email_enabled=true` but `consent_accepted_at` was missing.
- Added `/api/v1/daily-updates/run-scheduled` plus `.github/workflows/daily-alert-emails.yml` so production email delivery can be driven by external cron while respecting each user's selected time.
- Added a deterministic Ask-AI route for natural-language recovery strategy ideas, such as buying stocks that jump after recent weakness with a stop/safety net, so the app runs the scan instead of telling the user to rephrase.
- Added Ask-AI request cancellation with a visible `Stop` control, live research timer, and `Thought for ...` timing shown above completed answers.
- Added an Ask-AI screener mode for broad stock-discovery questions, including fundamentals, valuation, growth, dividend, sector, 52-week-high, and momentum prompts.
- Fixed routing priority so prompts such as "Backtest a momentum strategy on the top mover" no longer loop back into the top-movers answer.
- Added follow-up ticker resolution from recent assistant output, so "top mover", "first stock", and similar references can resolve to the actual ticker from the previous response.
- Added deterministic prompt rewrites for unsupported/broad Ask-AI prompts, returning a computable prompt suggestion instead of the generic "AI engine could not answer" failure.
- Added real metric filtering in the screener for PE, ROE, ROCE, debt-to-equity, operating margin, revenue growth, profit growth, dividend yield, and market cap conditions.
- Moved Ask-AI recent chats into a separate side column, added a visible loading state, and strengthened auto-scroll when sending from higher in the conversation.
- Enabled the in-process daily stock email scheduler by default. It can still be disabled with `DAILY_UPDATES_ENABLED=false`.
- Tightened daily signal quality by applying the already-computed final score gate, requiring minimum chart quality, and defaulting daily stock emails to long-only signals unless `DAILY_SIGNALS_ALLOW_SELL=true`.

Files changed:
- `backend/app/services/ask_ai_service.py`
- `backend/app/services/screener_service.py`
- `backend/app/services/daily_signal_engine/config.py`
- `backend/app/services/daily_trade_service.py`
- `backend/main.py`
- `frontend/app/ask-ai/page.tsx`
- `REBUILD_PROGRESS.md`

Verification:
- `python -m compileall backend\app backend\main.py` passed.
- `python -m pytest backend\tests` passed: 5 tests.
- `npm.cmd --prefix frontend run build` passed.
- Direct router smoke test confirmed: `top movers today -> MOVERS`, `Backtest a momentum strategy on the top mover -> BACKTEST`, `Best stocks to invest in right now -> SCREENER`, `Show companies with increasing operating margins over the last 3 years -> SCREENER`, `Scan all NSE stocks for a momentum strategy -> CROSS_SCAN`.
- Direct parser smoke test confirmed ROCE/debt, dividend yield, operating margin, zero-debt/profit-growth, and small-cap revenue-growth prompts produce real metric conditions.

Known note:
- `npm.cmd --prefix frontend run lint` still fails on pre-existing project-wide lint issues in `frontend/app/page.tsx`, `frontend/app/screens/page.tsx`, and old `any` usage. The production Next build passes.
