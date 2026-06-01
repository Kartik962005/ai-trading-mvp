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
