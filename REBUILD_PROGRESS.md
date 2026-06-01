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
