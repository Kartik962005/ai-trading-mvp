# Bullseye — Phased Upgrade Prompt (resumable)

> **How to use this file.** Each phase below is a self-contained prompt. Start a
> Claude Code session, paste **§0 CONTEXT** first, then paste the one **PHASE**
> you want to do. If a session runs out of context, come back later, paste
> §0 CONTEXT + the next unfinished PHASE, and continue. Phases are ordered but
> independently shippable — do them in any order, each ends in its own commit.
>
> Progress tracker (tick as you go):
> - [x] Phase 0 — Safety net (yfinance pinned; cold-start guards in place)
> - [x] Phase 1 — Intelligent NL→SQL screener (backend brain) — DONE 2026-07-11, see status below
> - [ ] Phase 2 — Screener/Ask-AI two-mode UI (NL + raw SQL)  ← NEXT
> - [ ] Phase 3 — Homepage: analyze only 4–5 stocks (the big speed win)
> - [ ] Phase 4 — 3D / animated redesign (React Bits) ← IN PROGRESS 2026-07-11
>   - [ ] 4.1 npm i lenis ogl + add 4 components under `frontend/components/reactbits/` (unwired, zero risk) — commit
>   - [ ] 4.2 GradientBlinds as hero background (dynamic ssr:false, desktop-only, reduced-motion gated) — commit
>   - [ ] 4.3 TextPressure hero headline — commit
>   - [ ] 4.4 ScrollStack feature section — commit
>   - [ ] 4.5 BorderGlow on hero/CTA cards (NOT all 24 market cards) — commit
>   - [ ] 4.6 verify (type-check + dev server + console) & push when owner approves
>   (each step is an independent local commit; resume from the first unticked box)
> - [ ] Phase 5 — General performance pass
>
> **Phase 1 status (backend, verified against live data + Groq):**
> - New `backend/app/services/intelligent_screener_service.py`: LLM (Groq only —
>   Gemini/OpenRouter/Cerebras keys are NOT set) turns English into a real SQL
>   SELECT over `stock_snapshot`; pros can type SQL directly; both validated by
>   `sqlglot` (single read-only SELECT, only `stock_snapshot`, no DDL/DML/other
>   tables) and executed in `sqlglot`'s in-memory executor over a COPY of the
>   snapshot (user SQL can't touch Postgres). Falls back to `smart_search` when
>   Groq is down. `sqlglot==30.12.0` added to requirements.
> - `POST /api/v1/screener/smart-search` now calls `intelligent_smart_search`
>   (added optional `mode: 'auto'|'sql'|'nl'`). Response is backward-compatible
>   and gains `generated_sql`, `mode`, and (for aggregates) `table`.
> - **Needs deploy:** push → Render reinstalls `sqlglot` + runs new code. The
>   existing screener UI gets smarter immediately even before Phase 2 (it just
>   won't show the SQL toggle / generated-SQL panel until Phase 2 ships).
>
> **Data-quality findings surfaced during Phase 1 (own task — fix in `build_snapshot.py`):**
> - `sector` is NULL for ~1,863 / 2,045 rows → sector screens are weak.
> - Fundamentals (`trailing_pe`, `roe`, `debt_to_equity`, growth, margins,
>   `dividend_yield`) exist for only ~180 large/mid-caps; `roce` is 100% NULL.
> - Unit scaling: `debt_to_equity` is a percent (28 = 0.28x), `dividend_yield` is
>   ×100 (86 = 0.86%). The LLM prompt now accounts for this, but the frontend
>   still DISPLAYS raw values (e.g. "divY 1253") — normalize in build_snapshot or
>   in `frontend_metric_row`.

---

## §0 CONTEXT — paste this at the top of EVERY session

You are working on **Bullseye** (`ai-trading-mvp`), an AI stock-analysis app.

**Topology**
- Backend: **FastAPI**, single file `backend/main.py` (routes) + `backend/app/services/*`. Deployed on **Render free tier** (sleeps after ~15 min idle; a keep-alive workflow now pings it 24/7).
- Frontend: **Next.js 16** (`frontend/`), deployed on **Vercel**. ⚠️ This is a *modified* Next.js — read `frontend/node_modules/next/dist/docs/` before using any Next-specific API. `frontend/app/page.tsx` is the homepage (~4,000 lines). Root layout: `frontend/app/layout.tsx`.
- DB: **Supabase** table `stock_snapshot` (~2,045 rows, one per NSE/BSE stock), refreshed daily by `.github/workflows/daily-snapshot.yml` running `backend/scripts/build_snapshot.py`.
- Frontend→backend calls go through a same-origin proxy: `frontend/app/api/backend/[...path]/route.ts`. In client code the base is `const BACKEND = '/api/backend'` and calls look like `` `${BACKEND}/api/v1/...` ``.

**LLM is already available** — use it, don't reinvent it:
- `backend/app/services/llm_client.py` → `chat(messages, temperature=?, max_tokens=?, model=?, prefer='groq') -> {"text","model"}`.
- Fallback chain Groq → Gemini → OpenRouter → Cerebras (keys in `backend/.env`; `llm_client.any_provider_available()` tells you if any key is set).

**`stock_snapshot` columns** (all numeric unless noted) — this is the screener's data model:
`ticker`(text pk), `symbol`(text), `name`(text), `sector`(text), `price`, `previous_close`, `today_open`, `gap_pct`, `vwap10`, `change_pct`, `trailing_pe`, `forward_pe`, `price_to_book`, `market_cap`, `market_cap_cr`, `roe`, `roce`, `roa`, `debt_to_equity`, `revenue_growth`, `profit_growth`, `earnings_quarterly_growth`, `dividend_yield`, `operating_margin`, `profit_margin`, `beta`, `enterprise_value`, `total_cash`, `total_debt`, `rsi14`, `mfi14`, `sma20`, `sma50`, `sma200`, `ema20`, `atr14`, `ret_1w`, `ret_1m`, `ret_3m`, `ret_6m`, `ret_1y`, `high_52w`, `low_52w`, `vol_ratio`, `latest_volume`, `volume_sma20`, `latest_date`(date), `source`(text), `updated_at`(timestamptz).
There is **no** `piotroski_score` column — do not filter on it unless Phase 1 adds it.

**Working style the owner expects:** investigate → short plan → call out doubts → confirm scope → execute. Be blunt and honest; never claim something works without checking. Verify UI changes in the browser preview (`preview_start` the `frontend` launch config), and verify backend changes by curling the live/local endpoint.

**Do NOT break these:** the daily snapshot job, the `/api/backend` proxy contract, existing screener response shape consumed by `frontend/app/screens/`, and the honest-signals philosophy (it's allowed to return "no strong matches" instead of noise).

**Git:** branch `main`, remote `github.com/Kartik962005/ai-trading-mvp` (public). Commit per phase; only push when the owner says so.

---

## PHASE 0 — Safety net & quick wins

**Goal:** cheap insurance before bigger changes.

1. **Pin `yfinance`.** In `backend/requirements.txt` it's currently unpinned (just `yfinance`). Pin it to the version confirmed working (`yfinance==1.3.0`, or whatever `pip show yfinance` reports in the working env). Rationale: a future Render redeploy could otherwise pull a broken release and silently kill the daily snapshot job. While there, pin any other unpinned critical deps (`supabase`, `pandas`, `fastapi`).
2. **Confirm the cold-start fixes are present** (added earlier): `.github/workflows/keep-alive.yml` and `frontend/components/BackendWarmup.tsx` mounted in `layout.tsx`. If missing, re-add.
3. **Add a lightweight `/api/v1/health-lite`** (or reuse `/health`) that does NO yfinance/DB work, for the warm-up ping to hit cheaply.

**Acceptance:** `requirements.txt` has pinned versions; `pip install -r requirements.txt` still resolves; snapshot script still runs (`python backend/scripts/build_snapshot.py --dry-run` if supported, else a small sample).
**Commit:** `Phase 0: pin deps + confirm cold-start guards`

---

## PHASE 1 — Intelligent NL→SQL screener (the brain)

**Problem:** `backend/app/services/screener_service.py::_parse_rules` is a giant hand-written **regex** parser. It only understands ~30–40 phrasings, so free-form English fails unpredictably. Replace it with a real LLM translator, and add a power-user raw-SQL path.

**Build `backend/app/services/intelligent_screener_service.py` with two entry paths:**

**Path A — Natural language → filter (for naive users).**
- Send the user's text to `llm_client.chat(...)` with a system prompt that includes the exact `stock_snapshot` column list (from §0), their meanings/units (e.g. `market_cap_cr` = market cap in ₹ crore; `roe`/`roce`/margins/growth in %; `ret_1m` = 1-month return %; `rsi14` 0–100), and instructs it to return **strict JSON only**:
  ```json
  {"select":["symbol","name","price","trailing_pe","roe","ret_1m"],
   "where":[{"col":"trailing_pe","op":"<","val":15},
            {"col":"roe","op":">=","val":15},
            {"col":"debt_to_equity","op":"<","val":0.5}],
   "order_by":{"col":"ret_1m","dir":"desc"},
   "limit":50,
   "explanation":"Cheap (PE<15), profitable (ROE≥15%), low-debt names, best 1M momentum first."}
  ```
- **Validate** the JSON in Python against a whitelist: `col` ∈ known columns, `op` ∈ `{<,<=,>,>=,=,!=,between,in,is null}`, `val` numeric/string/array. Reject anything else. This makes the LLM output safe by construction (you build the query, the LLM never emits raw SQL here).
- Translate the validated spec to a Supabase query (PostgREST `.select().filter()/.order().limit()`), execute, return rows in the **existing screener row shape** (reuse `stock_snapshot_service.frontend_metric_row`).

**Path B — Raw SQL → results (for pro users).**
- Detect SQL: input trimmed starts with `select` (case-insensitive) OR the UI flags "SQL mode".
- **Security is mandatory.** Parse with `sqlglot` (add to requirements). Reject unless: exactly one statement, it is a `SELECT`, referenced tables ⊆ `{stock_snapshot}`, referenced columns ⊆ known columns, **no** `insert/update/delete/drop/alter/create/grant/;/--/pg_/copy/function` and no CTE writing. Enforce a hard `LIMIT` (append if absent). 
- Execute via a **read-only** path: create a Supabase Postgres function `screener_select(q text)` that is `SECURITY INVOKER`, runs only if `current_setting` role is read-only, or simpler — connect with a dedicated **read-only DB role** (grant `SELECT` on `stock_snapshot` only) using a separate `SUPABASE_READONLY_URL`. Never run user SQL with the service-role key.
- Return `{rows, generated_sql, explanation, source:"raw-sql"}`; on validation failure return a friendly error naming the offending token.

**Wire it up:** update the endpoint the screener UI calls — `POST /api/v1/screener/smart-search` (see `backend/main.py` ~line 446) — to route to Path B if SQL-like else Path A, and **fall back** to the old `screen_stocks` regex only if `llm_client.any_provider_available()` is false. Keep the response schema backward-compatible; add `generated_sql` and `explanation` fields.

**Also:** if you want Piotroski/scored scans to work, either (a) compute a Piotroski F-score in `build_snapshot.py` and add a `piotroski_score` column (migration + backfill), or (b) have Path A map "piotroski"/"quality" to a proxy expression over existing columns (positive `roe`, positive `profit_growth`, low `debt_to_equity`, positive `operating_margin`) and label it honestly as a proxy.

**Acceptance (test these):**
- "cheap profitable smallcaps with low debt and RSI below 40" → returns sensible filtered rows (not empty, not random).
- "top 10 stocks by 1 year return in the IT sector" → correct ordering/limit.
- `SELECT symbol, price, roe FROM stock_snapshot WHERE roe > 25 ORDER BY roe DESC LIMIT 20` → runs, returns rows.
- `DROP TABLE stock_snapshot;` / `SELECT * FROM users` / `; DELETE ...` → all rejected with a clear message, nothing executed.
- LLM keys unset → falls back to regex path without 500-ing.

**Commit:** `Phase 1: LLM-powered NL->filter screener + safe raw-SQL path`

---

## PHASE 2 — Screener / Ask-AI two-mode UI

**Goal:** expose Phase 1's two paths cleanly in `frontend/app/screens/`.

- A single smart search box with a small **"English ⇄ SQL"** toggle (auto-detect SQL if the text starts with `select`). Placeholder examples rotate ("debt-free companies with ROE over 20%", "SELECT symbol,price FROM stock_snapshot WHERE ...").
- On submit → `POST ${BACKEND}/api/v1/screener/smart-search` with `{prompt, mode}`.
- Show: a results table (reuse existing screener row/table components), a collapsible **"Generated SQL / filter"** panel (transparency + teaches SQL), the `explanation` line, and honest empty/again states ("No stock matched — try loosening a filter" vs the old blank).
- Error states for invalid SQL should surface the backend's friendly message inline.
- Keep it fast: debounce, cancel in-flight requests, show a skeleton while loading.

**Acceptance:** naive English and raw SQL both return results in the UI; generated SQL is visible; invalid SQL shows a helpful error, not a blank screen.
**Verify:** `preview_start` the `frontend` config, drive the screener page, confirm both modes.
**Commit:** `Phase 2: two-mode (NL + SQL) screener UI`

---

## PHASE 3 — Homepage: analyze only 4–5 stocks (BIG speed win)

**Problem (measured):** `frontend/app/page.tsx` sets `STOCK_PAGE_LIMIT = 100` (line ~687). On load it (a) calls `analyze-batch` for ~100 tickers (line ~4098) **and** (b) every `StockCard` independently fetches `/api/v1/analyze/{ticker}` (line ~1396) and `/api/v1/chart/{ticker}?range=1mo` (line ~1408). That's hundreds of heavy calls → the lag.

**Redesign:**
1. **Featured strip:** pick **5 curated stocks** (e.g. RELIANCE, HDFCBANK, TCS, INFY, ICICIBANK — or top movers from a single cheap `quotes/batch`). Only these get full analysis (`analyze/batch` for 5) + mini charts on first paint.
2. **Everything else = cheap cards:** render the rest from the static `STOCKS` list showing **price + %change only** via ONE `/api/v1/quotes/batch` call per 30 (batched), NOT per-card analyze/chart.
3. **Lazy analysis:** a card fetches its full `/api/v1/analyze/{ticker}` + chart **only when it scrolls into view** (`IntersectionObserver`) or on click/expand. Never eagerly for 100 cards.
4. **Paginate / virtualize** the long list (e.g. show 20, "load more", or a virtualized grid) instead of 100 at once.
5. Add skeletons so the page paints instantly and fills in progressively.

**Acceptance:** homepage first meaningful paint is fast; Network tab shows ~1–2 batch calls + 5 analyze calls on load (not ~200). Scrolling lazily loads the rest. No visual "everything blank then freeze."
**Verify:** `preview_start`, load `/`, check `read_network_requests` count and `read_console_messages` for errors; screenshot.
**Commit:** `Phase 3: homepage analyzes 5 featured stocks + lazy-load rest`

---

## PHASE 4 — 3D / animated redesign (React Bits)

**Goal:** a clean, premium, animated homepage using these React Bits components (JS + CSS variants). Keep it tasteful and **fast** — gate heavy WebGL behind desktop + `prefers-reduced-motion` checks and `dynamic()` imports so it never regresses Phase 3's speed.

**Install deps:** `cd frontend && npm i lenis ogl` (`motion`/framer is already present; TextPressure and BorderGlow need no deps).

**Add components** under `frontend/components/reactbits/` (each is a **client component** — add `'use client'` at the top; copy sources from reactbits.dev or the originals provided by the owner):
- `ScrollStack.jsx` + `ScrollStack.css` (needs `lenis`).
- `GradientBlinds.jsx` + `GradientBlinds.css` (needs `ogl`).
- `TextPressure.jsx` (variable font — ensure the font referenced actually loads).
- `BorderGlow.jsx` + `BorderGlow.css`.

**Integration plan:**
- **GradientBlinds** = fixed hero background behind the ticker tape / headline (`mixBlendMode="lighten"`, brand colors, `blindCount` modest). Absolutely position it, `pointer-events:none`, `z-index` below content.
- **TextPressure** = the hero headline (e.g. "BULLSEYE"). Confirm the variable font loads or swap to one that does.
- **ScrollStack / ScrollStackItem** = the "how it works" / feature section, 3–5 cards that stack on scroll.
- **BorderGlow** = wrap the featured stock cards and CTA cards for the edge-glow on hover.

**Performance guardrails (required):**
- `dynamic(() => import(...), { ssr:false })` for `GradientBlinds` (WebGL) and only mount it on desktop (`window.innerWidth > 768`) and when `!matchMedia('(prefers-reduced-motion: reduce)').matches`.
- Pause/destroy WebGL when off-screen or tab hidden (the component already cleans up on unmount — mount/unmount via IntersectionObserver).
- Don't run `lenis` smooth-scroll globally if it fights the existing scroll; scope it to the ScrollStack section.

**Acceptance:** homepage looks polished with the four effects; Lighthouse/Performance not worse than Phase 3; reduced-motion users get a static, calm version; mobile doesn't run the WebGL shader.
**Verify:** `preview_start`, screenshot desktop + `resize_window` mobile + `colorScheme:'dark'`; check console for WebGL/lenis errors.
**Commit:** `Phase 4: animated homepage (ScrollStack, GradientBlinds, TextPressure, BorderGlow)`

---

## PHASE 5 — General performance pass

**Goal:** make the whole app feel smooth.
- **Split `page.tsx`** (~4,000 lines) into modules (StockCard, TickerTape, DetailView, hooks). Huge components hurt build + runtime.
- `dynamic()`-import heavy/below-the-fold pieces (charts, detail view, WebGL).
- Memoize expensive renders (`React.memo`, `useMemo`, stable `useCallback`); ensure SWR keys are stable.
- Tune SWR: sane `refreshInterval` (quotes 60s is fine; don't revalidate analyze on focus), `keepPreviousData`, dedupe.
- Backend: make sure homepage/screener reads hit the **snapshot cache**, not live Yahoo, on the hot path; add short in-process caches where missing; confirm `analyze/batch` concurrency is sane.
- Run `npm run build` and a bundle check; lazy-load `@supabase/supabase-js` (already dynamic — keep it).
- Images: use Next `<Image>`/proper sizes for any hero art.

**Acceptance:** measurably faster first load and interaction; no console errors; build succeeds.
**Verify:** before/after `read_network_requests` + screenshot; `npm run build` clean.
**Commit:** `Phase 5: perf — code-split, lazy-load, cache hot paths`

---

### Notes for whoever runs these
- Do phases **in order** for smoothest results, but 1–2 (screener) and 3–5 (homepage/perf) are independent tracks if you want to parallelize across sessions.
- After each phase: verify in the browser preview, then commit. Push only when the owner approves.
- If context runs low mid-phase, commit a WIP checkpoint, note what's left at the top of this file's tracker, and resume next session with §0 + the remaining steps.
