"""Intelligent stock screener — Phase 1.

Two ways in, one safe engine out:

* **Natural language** ("cheap profitable smallcaps with low debt and RSI < 40")
  is sent to the LLM (Groq, via ``llm_client``), which writes a single SQL
  ``SELECT`` over the virtual table ``stock_snapshot``. Because the model writes
  real SQL over every column, it is no longer limited to a handful of hand-coded
  phrasings.
* **Raw SQL** (a pro user types ``SELECT ... FROM stock_snapshot WHERE ...``) is
  taken as-is.

Both go through the same validate-then-execute path:

1. ``sqlglot`` parses the SQL and we **reject** anything that is not a single
   read-only ``SELECT`` over ``stock_snapshot`` (no DDL/DML, no other tables, no
   multiple statements, no dangerous functions).
2. Execution runs in ``sqlglot``'s pure-Python executor **over an in-memory copy
   of the snapshot** — the query can never reach the real Postgres, so even a
   hostile query only sees a throwaway list of dicts.

If the LLM is unavailable or produces SQL we cannot run, we fall back to the
existing ``smart_search`` router so the screener never hard-fails.
"""

from __future__ import annotations

import re
from typing import Any

import sqlglot
from sqlglot import expressions as exp
from sqlglot.executor import execute as sqlglot_execute

from app.services import llm_client
from app.services.smart_search_service import smart_search
from app.services.stock_snapshot_service import frontend_metric_row, get_snapshot_rows

TABLE = "stock_snapshot"
DEFAULT_LIMIT = 60
MAX_LIMIT = 300

# Every column the model / a pro user is allowed to reference, with a one-line
# meaning + unit. Kept in sync with database/supabase_stock_snapshot.sql.
COLUMN_DOC = {
    "ticker": "Yahoo ticker, e.g. RELIANCE.NS (text)",
    "symbol": "NSE symbol, e.g. RELIANCE (text)",
    "name": "company name (text)",
    "sector": "Yahoo sector name (text)",
    "price": "current price, INR",
    "previous_close": "previous close, INR",
    "today_open": "today's open, INR",
    "gap_pct": "open vs prev close, %",
    "vwap10": "10-day VWAP, INR",
    "change_pct": "today's move, %",
    "trailing_pe": "trailing P/E ratio",
    "forward_pe": "forward P/E ratio",
    "price_to_book": "P/B ratio",
    "market_cap": "market cap, INR (absolute)",
    "market_cap_cr": "market cap in INR crore (use THIS for cap buckets)",
    "roe": "return on equity, % (e.g. 15 = 15%)",
    "roce": "return on capital employed, % — not provided by the data source, always NULL; use roe instead",
    "roa": "return on assets, %",
    "debt_to_equity": "debt/equity RATIO (0 = debt-free, <1 = low debt, 1 = 1x, 2 = 2x). For 'low debt' use < 1, 'debt-free' use < 0.1",
    "revenue_growth": "revenue growth, %",
    "profit_growth": "profit growth, %",
    "earnings_quarterly_growth": "latest quarterly earnings growth, %",
    "dividend_yield": "dividend yield in % (0.86 = 0.86%, 5.67 = 5.67%). For 'yield above 3%' use > 3",
    "operating_margin": "operating margin, %",
    "profit_margin": "net profit margin, %",
    "beta": "beta vs market",
    "enterprise_value": "enterprise value, INR",
    "total_cash": "total cash, INR",
    "total_debt": "total debt, INR",
    "rsi14": "14-day RSI, 0-100 (<30 oversold, >70 overbought)",
    "mfi14": "14-day Money Flow Index, 0-100",
    "sma20": "20-day simple moving average, INR",
    "sma50": "50-day simple moving average, INR",
    "sma200": "200-day simple moving average, INR",
    "ema20": "20-day EMA, INR",
    "atr14": "14-day Average True Range, INR",
    "ret_1w": "1-week return, %",
    "ret_1m": "1-month return, %",
    "ret_3m": "3-month return, %",
    "ret_6m": "6-month return, %",
    "ret_1y": "1-year return, %",
    "high_52w": "52-week high, INR",
    "low_52w": "52-week low, INR",
    "vol_ratio": "latest volume / 20-day avg volume",
    "latest_volume": "latest session volume (shares)",
    "volume_sma20": "20-day average volume (shares)",
    "latest_date": "date of the latest bar (date)",
}
KNOWN_COLUMNS = set(COLUMN_DOC)

# Functions we never want, even though the sandbox has no DB to reach.
_BANNED_TOKENS = re.compile(
    r"\b(pg_sleep|pg_read_file|pg_ls_dir|current_setting|set_config|dblink|copy|"
    r"information_schema|pg_catalog|lo_import|lo_export)\b",
    re.IGNORECASE,
)


class SqlValidationError(ValueError):
    """Raised when a SQL statement is not a safe single SELECT over the snapshot."""


# ── snapshot loading ──────────────────────────────────────────────────────────
def _load_rows() -> list[dict[str, Any]]:
    """Full snapshot (stale allowed) as a list of plain dicts — cached upstream."""
    return list(get_snapshot_rows(max_age_hours=None) or [])


def _distinct_sectors(rows: list[dict[str, Any]], limit: int = 30) -> list[str]:
    seen: list[str] = []
    for row in rows:
        sector = row.get("sector")
        if sector and sector not in seen:
            seen.append(sector)
        if len(seen) >= limit:
            break
    return seen


# ── validation ────────────────────────────────────────────────────────────────
# Statements that begin with a write/DDL keyword are still routed to the SQL path
# on purpose — so validate_sql rejects them with a clear message instead of the
# NL model silently reinterpreting "DROP TABLE ..." as a benign search.
_DDL_DML_START = re.compile(
    r"^\s*(drop|delete|update|insert|alter|create|truncate|grant|revoke|merge|replace)\b",
    re.IGNORECASE,
)


def looks_like_sql(text: str) -> bool:
    low = (text or "").strip().lower()
    if _DDL_DML_START.match(low):
        return True
    if low.startswith("with "):
        return True
    # A real SELECT has a FROM; "select me some banking stocks" (English) does not.
    return low.startswith("select") and re.search(r"\bfrom\b", low) is not None


def validate_sql(sql: str) -> exp.Expression:
    """Parse and validate. Returns the (limit-enforced) AST or raises SqlValidationError."""
    if _BANNED_TOKENS.search(sql or ""):
        raise SqlValidationError("Query uses a function that isn't allowed here.")
    try:
        statements = sqlglot.parse(sql, read="postgres")
    except Exception as exc:  # noqa: BLE001
        raise SqlValidationError(f"Could not parse SQL: {exc}") from exc

    statements = [s for s in statements if s is not None]
    if len(statements) != 1:
        raise SqlValidationError("Only a single SELECT statement is allowed.")

    node = statements[0]
    if not isinstance(node, exp.Select):
        raise SqlValidationError("Only read-only SELECT queries are allowed.")

    # Allowed table names = the snapshot plus any CTE aliases defined in-query.
    cte_names = {c.alias_or_name.lower() for c in node.find_all(exp.CTE)}
    allowed = {TABLE} | cte_names
    for table in node.find_all(exp.Table):
        if table.name.lower() not in allowed:
            raise SqlValidationError(
                f"Only the '{TABLE}' table is available (got '{table.name}')."
            )

    # Enforce a hard row cap.
    limit = node.args.get("limit")
    if limit is None:
        node = node.limit(DEFAULT_LIMIT)
    else:
        try:
            requested = int(limit.expression.name)
            if requested > MAX_LIMIT:
                node = node.limit(MAX_LIMIT)
        except Exception:  # noqa: BLE001 - non-integer LIMIT, leave as-is
            pass
    return node


def _execute(node: exp.Expression, rows: list[dict[str, Any]]) -> tuple[list[str], list[tuple]]:
    result = sqlglot_execute(node.sql(), tables={TABLE: rows})
    return list(result.columns), list(result.rows)


# ── result → screener payload ────────────────────────────────────────────────
def _payload(
    columns: list[str],
    data_rows: list[tuple],
    all_rows: list[dict[str, Any]],
    *,
    generated_sql: str,
    mode: str,
    explanation: str,
    source: str,
    provider: str | None = None,
) -> dict[str, Any]:
    dicts = [dict(zip(columns, r)) for r in data_rows]
    by_key: dict[str, dict[str, Any]] = {}
    for snap in all_rows:
        by_key[str(snap.get("ticker"))] = snap
        by_key[str(snap.get("symbol"))] = snap

    key = "ticker" if "ticker" in columns else ("symbol" if "symbol" in columns else None)
    cards: list[dict[str, Any]] = []
    if key is not None:
        for index, row in enumerate(dicts):
            snap = by_key.get(str(row.get(key)))
            if not snap:
                continue
            cards.append(
                frontend_metric_row(
                    snap,
                    reason=f"Matched your screen (row {index + 1}).",
                    score=max(55, 96 - index),
                )
            )

    payload = {
        "rows": cards,
        "matchedRules": [generated_sql],
        "explanation": explanation,
        "source": source,
        "generated_sql": generated_sql,
        "mode": mode,
        "count": len(cards) if cards else len(dicts),
    }
    if provider:
        payload["llm_provider"] = provider
    # Aggregates / projections with no per-stock key (e.g. GROUP BY sector) can't
    # become stock cards, so hand the UI a plain table instead. A stock-style
    # query that simply matched nothing keeps rows=[] and gets NO table, so it
    # reads as an honest "no matches" rather than an empty grid.
    if key is None and dicts:
        payload["table"] = {"columns": columns, "rows": [list(r) for r in data_rows]}
    return payload


# ── natural language → SQL (Groq) ─────────────────────────────────────────────
def _nl_system_prompt(sectors: list[str]) -> str:
    cols = "\n".join(f"  {name}: {doc}" for name, doc in COLUMN_DOC.items())
    sector_line = ", ".join(sectors) if sectors else "(various Yahoo sectors)"
    return (
        "You translate a retail investor's plain-English stock screen into ONE "
        "valid PostgreSQL SELECT over a single table named stock_snapshot.\n"
        "Return ONLY the SQL — no markdown, no backticks, no explanation.\n\n"
        "Hard rules:\n"
        "- Exactly one statement, a SELECT, FROM stock_snapshot only.\n"
        "- Never write/modify data; SELECT only.\n"
        "- Always include symbol and name in the projection, plus the columns the "
        "user cares about.\n"
        "- Add an ORDER BY that matches the intent (e.g. best momentum -> ORDER BY "
        "ret_1m DESC; cheapest -> trailing_pe ASC).\n"
        "- Always add LIMIT (default 50 unless the user asks for a specific count).\n"
        "- Data coverage: price + technical columns (price, change_pct, rsi14, mfi14, "
        "ret_1w..ret_1y, sma*, ema20, atr14, vol_ratio, volume) cover all ~2045 "
        "stocks. Fundamentals (trailing_pe, roe, debt_to_equity, growth, margins, "
        "dividend_yield, sector) come from Yahoo and may be missing for some illiquid "
        "names. roce is always NULL. Mind the exact units below.\n"
        "- Use ONLY these columns:\n"
        f"{cols}\n\n"
        f"Available sector values (match exactly, or use name LIKE '%word%'): {sector_line}\n\n"
        "Examples:\n"
        "Q: cheap profitable companies with low debt\n"
        "A: SELECT symbol, name, price, trailing_pe, roe, debt_to_equity FROM "
        "stock_snapshot WHERE trailing_pe < 20 AND roe > 15 AND debt_to_equity < 1 "
        "ORDER BY roe DESC LIMIT 50\n"
        "Q: oversold smallcaps that fell this month\n"
        "A: SELECT symbol, name, price, rsi14, ret_1m, market_cap_cr FROM "
        "stock_snapshot WHERE rsi14 < 35 AND market_cap_cr < 5000 AND ret_1m < 0 "
        "ORDER BY rsi14 ASC LIMIT 50\n"
        "Q: top 10 IT stocks by 1 year return\n"
        "A: SELECT symbol, name, ret_1y, sector FROM stock_snapshot WHERE sector "
        "LIKE '%Tech%' ORDER BY ret_1y DESC LIMIT 10"
    )


def _clean_sql(text: str) -> str:
    text = (text or "").strip()
    text = re.sub(r"^```(?:sql)?\s*|\s*```$", "", text, flags=re.IGNORECASE).strip()
    # Keep only up to the first statement terminator, and drop a trailing ';'.
    if ";" in text:
        text = text.split(";", 1)[0].strip()
    return text


def nl_to_sql(prompt: str, sectors: list[str], *, repair_hint: str | None = None) -> tuple[str, str | None]:
    messages = [{"role": "system", "content": _nl_system_prompt(sectors)}]
    user = prompt if not repair_hint else (
        f"{prompt}\n\n(Your previous SQL was invalid: {repair_hint}. "
        "Return corrected SQL only.)"
    )
    messages.append({"role": "user", "content": user})
    response = llm_client.chat(messages, temperature=0, max_tokens=300, prefer="groq")
    return _clean_sql(response["text"]), response.get("model")


# ── orchestration ─────────────────────────────────────────────────────────────
def _sql_path(prompt: str, rows: list[dict[str, Any]]) -> dict[str, Any]:
    try:
        node = validate_sql(prompt)
    except SqlValidationError as exc:
        return {
            "rows": [],
            "matchedRules": [],
            "explanation": str(exc),
            "source": "SQL validation",
            "generated_sql": prompt.strip(),
            "mode": "sql",
            "error": str(exc),
        }
    try:
        columns, data_rows = _execute(node, rows)
    except Exception as exc:  # noqa: BLE001
        return {
            "rows": [],
            "matchedRules": [],
            "explanation": f"Your SQL is valid but failed to run: {exc}",
            "source": "SQL executor",
            "generated_sql": node.sql(),
            "mode": "sql",
            "error": str(exc),
        }
    return _payload(
        columns,
        data_rows,
        rows,
        generated_sql=node.sql(),
        mode="sql",
        explanation=(
            f"Ran your SQL against the live snapshot — {len(data_rows)} row(s)."
            if data_rows
            else "Your SQL ran but matched no stocks. Try loosening a condition."
        ),
        source="Raw SQL over Supabase stock_snapshot (sandboxed)",
    )


def _nl_path(prompt: str, rows: list[dict[str, Any]]) -> dict[str, Any] | None:
    sectors = _distinct_sectors(rows)
    try:
        sql, provider = nl_to_sql(prompt, sectors)
    except Exception as exc:  # noqa: BLE001 - Groq down / rate-limited
        print(f"[IntelligentScreener] NL->SQL generation failed: {exc}")
        return None

    node = None
    for attempt in range(2):
        try:
            node = validate_sql(sql)
            break
        except SqlValidationError as exc:
            if attempt == 0:
                try:
                    sql, provider = nl_to_sql(prompt, sectors, repair_hint=str(exc))
                    continue
                except Exception:  # noqa: BLE001
                    return None
            print(f"[IntelligentScreener] LLM SQL invalid after repair: {exc}")
            return None
    if node is None:
        return None

    try:
        columns, data_rows = _execute(node, rows)
    except Exception as exc:  # noqa: BLE001
        print(f"[IntelligentScreener] LLM SQL failed to execute: {exc}")
        return None

    return _payload(
        columns,
        data_rows,
        rows,
        generated_sql=node.sql(),
        mode="nl",
        explanation=(
            f'Understood "{prompt.strip()}" and ran it as SQL — {len(data_rows)} match(es).'
            if data_rows
            else f'Understood "{prompt.strip()}", but no stock matched. Try loosening it.'
        ),
        source="AI (Groq) natural-language → SQL over stock_snapshot",
        provider=provider,
    )


def intelligent_smart_search(
    prompt: str,
    stocks: list[dict[str, Any]],
    screeners: list[dict[str, Any]] | None = None,
    sectors: list[dict[str, Any]] | list[str] | None = None,
    mode: str = "auto",
) -> dict[str, Any]:
    """Entry point for POST /api/v1/screener/smart-search.

    mode: 'auto' (detect), 'sql' (force raw SQL), or 'nl' (force natural language).
    Always returns a screener payload; never raises.
    """
    screeners = screeners or []
    sectors = sectors or []
    rows = _load_rows()

    use_sql = mode == "sql" or (mode == "auto" and looks_like_sql(prompt))

    if use_sql:
        if not rows:
            return {
                "rows": [],
                "matchedRules": [],
                "explanation": "The market snapshot is temporarily unavailable, so I can't run SQL right now.",
                "source": "stock_snapshot unavailable",
                "generated_sql": prompt.strip(),
                "mode": "sql",
                "error": "snapshot_unavailable",
            }
        return _sql_path(prompt, rows)

    # Natural-language path (Groq). Fall back to the legacy router when the LLM
    # is unconfigured, fails, or produces SQL that yields nothing usable.
    if rows and llm_client.any_provider_available():
        nl = _nl_path(prompt, rows)
        # A successful translation is trusted even when it matches nothing — we
        # show the generated SQL and invite the user to loosen it, rather than
        # silently falling back to the looser regex router. We only fall through
        # when translation/execution actually failed (nl is None).
        if nl is not None:
            return nl

    legacy = smart_search(prompt, stocks, screeners, sectors)
    if isinstance(legacy, dict):
        legacy.setdefault("mode", "legacy")
    return legacy
