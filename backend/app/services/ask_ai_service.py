"""Ask AI - a RAG-style market assistant.

Pipeline: the user asks anything in natural language. We classify the intent,
and when the question is quantitative we compute the answer on our own OHLCV
data (single-stock backtest, cross-stock scan, technical read, or holding ROI)
using the existing backtest engine. An LLM (Groq, with Gemini fallback) then
narrates the computed numbers in a rigorous, honest analyst voice. For purely
conceptual questions the LLM answers directly.

Security note: user prompts are never executed as code. Strategies are
translated into a small set of whitelisted pandas boolean expressions by the
existing nlp_backtester and evaluated with no builtins -- the same constrained
path the rest of the app uses.
"""

import datetime as dt
import os
import re
import threading
import time
from collections import Counter
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any

import numpy as np
import pandas as pd

from app.services import llm_client
from app.services.data_service import get_historical_data
from app.services.stock_ai_service import run_stock_ai_search

try:  # Persistent precomputed market snapshot (built off-server, read here).
    from app.services import stock_snapshot_service
except Exception:  # noqa: BLE001 - degrade to live scans if unavailable
    stock_snapshot_service = None
from app.strategies.nlp_backtester import (
    _prepare_df,
    _rule_engine_fallback,
    _run_crossover,
    _run_simple,
    _run_target_exit,
    _summary,
    _eval_safe,
    run_custom_backtest,
    translate_strategy,
)

SCAN_LIMIT = max(5, min(int(os.getenv("ASK_AI_SCAN_LIMIT", "40")), 120))

# ── Full-universe daily-moves snapshot config ────────────────────────────────
# Market-wide movers/circuit questions must see EVERY stock, not a small head.
# We scan the whole universe in a background thread (Yahoo tolerated 16 workers
# with zero failures in benchmarking) and keep each stock's recent close series
# in memory so any recent session (today / last Friday / etc.) is answerable
# instantly once warm. Everything fetched is also persisted to Supabase, so a
# warm cache makes later rebuilds cheap.
_MOVERS_WORKERS = max(4, min(int(os.getenv("ASK_AI_MOVERS_WORKERS", "16")), 32))
_SNAPSHOT_SERIES_LEN = 30        # recent (date, close) pairs kept per stock
_SNAPSHOT_TTL = 6 * 3600         # rebuild a ready snapshot once it is this old
_SNAPSHOT_FETCH_DAYS = 45        # history window fetched per stock for the snapshot
_MOVERS_WARMUP_WAIT = 25         # secs a movers query waits for a cold cache to seed
_MOVERS_MIN_ROWS = 25            # stop the warmup wait early once this many are in

ANALYST_SYSTEM_PROMPT = """
You are Bullseye's AI market analyst. You are a rigorous, skeptical quant who
talks like a sharp friend, not a hype machine. You help retail investors test
trading ideas honestly.

Core principles you ALWAYS follow:
- Separate WIN RATE from PROFITABILITY. A high win rate with tiny wins and rare
  huge losses is a trap; say so when the numbers show it.
- ALWAYS compare a strategy to simply buying and holding over the same window.
  If buy-and-hold beat the strategy, lead with that.
- Flag overfitting, small sample sizes (few trades), survivorship bias, and the
  fact that transaction costs and slippage will eat into returns.
- Prefer out-of-sample / walk-forward thinking. A backtest is a hypothesis, not
  proof.
- Be concrete and conversational. Short paragraphs. Use a few bullet points when
  listing numbers. No corporate filler, no disclaimers spam.
- End with a clear, practical verdict and one sensible next step to try.

Hard rules:
- Use ONLY the numbers provided to you. Never invent prices, returns, dates, or
  statistics. If a number is not provided, say you don't have it.
- Answer the user directly. Do NOT narrate the request back ("the user asked…"),
  and do NOT describe how the numbers were produced, our database, queries, or any
  internal/backend process.
- This is educational analysis on historical data, not financial advice. State
  this briefly, once, only when giving a verdict on a strategy.
- Never claim a strategy is guaranteed or risk-free.
""".strip()

# The movers/lookup persona. The user just wants a clean list of stocks (top
# gainers/losers/circuit movers) — not an essay about how we got the numbers.
MOVERS_SYSTEM_PROMPT = """
You are Bullseye's market assistant. The user wants a list of stocks for a given day — the biggest
gainers, the biggest losers, or names that moved to a circuit. You will be handed the ranked list.
Your only job is to present it to the user clearly and directly.

How to answer:
- Speak to the user in the second person ("you"). NEVER narrate their request back to them
  ("the user asked…", "you asked…") and NEVER describe how the data was produced, our database,
  our queries, approximations, or any internal/backend process.
- Lead with the answer. Give a clean, ranked, scannable list: each stock with its % move and
  closing price. A one-line intro is fine; then bullets or a compact list.
- Keep extra commentary to a minimum — at most one short, natural sentence if it genuinely helps.
- Do NOT add a verdict, a buy-and-hold comparison, a "next step", or trading advice. Just the list.

Hard rules:
- Use ONLY the stocks and numbers provided. Never invent tickers, prices, or percentages.
- You may state the session date once, plainly, if it is given. Do not over-explain or apologize,
  and do not lecture about live feeds vs historical data.
""".strip()

# The general-assistant persona. This is a true financial-research assistant
# that answers anything, is upfront about what it can/can't do with our data,
# and uses the real app context we inject when it is available.
GENERAL_SYSTEM_PROMPT = """
You are an AI financial research assistant inside a stock prediction and analysis web app (Bullseye).
Your job is to help retail investors understand markets, stocks, indicators, and strategies, and to
answer general questions clearly. You are a knowledgeable, friendly guide — not a hype machine.

How to answer:
- Give clear, structured, beginner-friendly answers. Define jargon the first time you use it
  (e.g. briefly say what RSI or a golden cross is before relying on it).
- Use short paragraphs, and bullet points when you list things. Be concrete; skip corporate filler.
- When the app gives you context (a selected stock, indicators, a prediction, a trend), use those EXACT
  numbers and refer to them directly. Never invent prices, returns, dates, or statistics.
- If you cannot answer something from the information you have, say so honestly rather than guessing.

What you can do in this app:
- This app sits on a backtesting/scanning engine over Bullseye's own historical OHLCV data. When a request
  needs real numbers — backtesting a rule, scanning the universe, a stock's technicals, or the day's biggest
  movers — tell the user you can run it and show how to phrase it, e.g.
  "backtest: buy RELIANCE when RSI crosses below 30, sell at 70", "scan all NSE stocks for a golden cross",
  or "show me the top gainers on Friday".

Honesty and safety rules (always follow):
- You do NOT have a live or real-time market feed. You cannot quote today's live price, breaking news, or
  intraday circuit hits as they happen. Say so plainly, and offer what you CAN do from historical data.
- Do not guarantee profits and do not give personalized financial advice. Any prediction or backtest is
  uncertain; remind the user that past performance does not guarantee future results and that they should
  do their own research. State this briefly when you give an actual recommendation or market outlook.
""".strip()


# ── Ticker resolution ────────────────────────────────────────────────────────
# Tokens that are far more often used as exchange/index references than as the
# specific listed company that happens to share the symbol (e.g. BSE Ltd). We
# only treat these as a stock when explicitly qualified.
_AMBIGUOUS_SYMBOLS = {"NSE", "BSE", "NIFTY", "SENSEX", "BANKNIFTY", "NIFTY50", "INDEX"}


def _resolve_ticker(prompt: str, known_stocks: list[dict[str, Any]] | None) -> str | None:
    text_upper = prompt.upper()

    explicit = re.search(r"\b([A-Z][A-Z0-9&-]{1,14}\.(?:NS|BO))\b", text_upper)
    if explicit:
        return explicit.group(1)

    best_name_match = None
    for stock in known_stocks or []:
        symbol = str(stock.get("symbol") or "").upper()
        ticker = str(stock.get("ticker") or "").upper()
        name = str(stock.get("name") or "").upper()
        if symbol and re.search(rf"\b{re.escape(symbol)}\b", text_upper):
            # Skip exchange/index words unless the user clearly means the company.
            if symbol in _AMBIGUOUS_SYMBOLS and not re.search(
                rf"\b{re.escape(symbol)}\b\s*(LTD|LIMITED|SHARE|SHARES|STOCK|EQUITY)", text_upper
            ):
                continue
            return ticker or symbol
        if name and len(name) >= 4 and name in text_upper:
            best_name_match = ticker or symbol
    return best_name_match


# ── Intent heuristics ────────────────────────────────────────────────────────
_CROSS_PATTERNS = re.compile(
    r"\b(all stocks|across|which stocks|what stocks|every stock|each stock|"
    r"any stock|list of stocks|best stocks|top stocks|scan|universe|screen|"
    r"rank|ranking|portfolio|basket|nifty stocks|nse stocks|us stocks)\b",
    re.IGNORECASE,
)
_BACKTEST_PATTERNS = re.compile(
    r"\b(backtest|back test|strategy|simulate|buy when|buy if|sell when|sell if|"
    r"buy after|enter when|exit when|if i buy|if i bought|crossover|golden cross|"
    r"death cross|rsi|macd|moving average|gap up|gap down|mean reversion|momentum|"
    r"\d+\s*%)\b",
    re.IGNORECASE,
)
_ROI_PATTERNS = re.compile(
    r"\b(bought|purchased|holding|how much would|invested|profit|loss|roi|return on)\b",
    re.IGNORECASE,
)
_TECHNICAL_PATTERNS = re.compile(
    r"\b(support|resistance|overbought|oversold|current rsi|trend|indicator|"
    r"how is .* doing|technical)\b",
    re.IGNORECASE,
)
# Conceptual / explanatory phrasing ("what is RSI?", "explain the difference…").
_EXPLAIN_PATTERNS = re.compile(
    r"\b(explain|what\s+is|what\s+are|what'?s|whats|difference between|"
    r"why\s+(is|do|does|are|would)|how\s+do(es)?\b|define|meaning of|"
    r"tell me about|pros and cons)\b",
    re.IGNORECASE,
)
# Concrete, computable intent: an explicit backtest/scan verb or a tradeable rule.
_ACTION_PATTERNS = re.compile(
    r"\b(backtest|back test|simulate|scan|screen|rank|buy when|buy if|buy after|"
    r"sell when|sell if|exit when|enter when|crosses?|golden cross|death cross|"
    r"\d+\s*%|across all|every stock|all (nse|us)?\s*stocks)\b",
    re.IGNORECASE,
)
# Market-data lookups: biggest movers / gainers / losers / circuit hits for a
# day. Answered by computing daily moves across the universe from our data.
# Kept deliberately broad ("user can ask anything") -- explicit ranking nouns,
# circuit language, and the dramatic up/down verbs people actually type. The
# bare verbs are safe because _classify only routes to MOVERS when there is no
# specific ticker OR the prompt also contains a market-wide word.
_MOVERS_PATTERNS = re.compile(
    r"\b("
    r"upper circuit|lower circuit|hit (the )?circuit|circuit breaker|circuits?|"
    r"top gainers?|top losers?|biggest gainers?|biggest losers?|top movers?|biggest movers?|"
    r"most active|best performers?|worst performers?|best performing|worst performing|"
    r"gainers?|losers?|movers?|"
    r"gained the most|rose the most|went up the most|up the most|"
    r"fell the most|dropped the most|went down the most|down the most|declined the most|"
    r"surged?|soared?|rallied|rally|rallies|jumped|spiked|skyrocketed|"
    r"crashed|tanked|plunged|slumped|tumbled|nosedived?|sank|sunk"
    r")\b",
    re.IGNORECASE,
)
# Words that signal a market-wide list rather than one specific stock.
_UNIVERSE_WORDS = re.compile(
    r"\b(stocks?|shares?|which|list|top|best|worst|all|nse|bse|nifty|market|"
    r"gainers?|losers?|movers?|names?)\b",
    re.IGNORECASE,
)


def _classify(prompt: str, ticker: str | None) -> str:
    explain = _EXPLAIN_PATTERNS.search(prompt)
    action = _ACTION_PATTERNS.search(prompt)
    cross = _CROSS_PATTERNS.search(prompt)
    backtest_kw = _BACKTEST_PATTERNS.search(prompt)
    movers = _MOVERS_PATTERNS.search(prompt)

    # Conceptual questions are answered directly, unless they also describe a
    # concrete rule or explicitly ask to backtest/scan something.
    if explain and not action:
        return "GENERAL"

    # Market-data lookup: biggest movers / circuit / gainers / losers across the
    # market (or whenever the phrasing is about a list rather than one stock).
    if movers and (not ticker or _UNIVERSE_WORDS.search(prompt)):
        return "MOVERS"

    # Cross-universe backtest/scan: a strategy framed against many stocks.
    if cross and (action or backtest_kw):
        if ticker and not re.search(
            r"\b(all|across|every|each|universe|scan|rank|screen)\b", prompt, re.IGNORECASE
        ):
            return "BACKTEST"
        return "CROSS_SCAN"

    # An explicit, concrete strategy or backtest request.
    if action or (
        backtest_kw and re.search(r"\b(buy|sell|enter|exit|cross|backtest|simulate|strateg)\b", prompt, re.IGNORECASE)
    ):
        return "BACKTEST" if ticker else "CROSS_SCAN"

    # Single-stock reads only when the user actually asks about price/indicators.
    if ticker and _ROI_PATTERNS.search(prompt):
        return "ROI"
    if ticker and _TECHNICAL_PATTERNS.search(prompt):
        return "TECHNICAL"

    # Everything else is handled like a general assistant by the LLM.
    return "GENERAL"


_FOLLOWUP_SAME_IDEA = re.compile(
    r"\b(same idea|same strategy|this strategy|that strategy|the strategy|it across|across all|all nse stocks)\b",
    re.IGNORECASE,
)


def _expand_strategy_followup(prompt: str, history: list[dict[str, Any]] | None) -> str:
    clean = prompt.strip()
    if not _FOLLOWUP_SAME_IDEA.search(clean):
        return clean
    if re.search(r"\b(if i buy|buy when|buy after|sell when|sell on|rsi|macd|gap|moving average|\d+\s*%)\b", clean, re.IGNORECASE):
        return clean
    for turn in reversed(history or []):
        if turn.get("role") != "user":
            continue
        prior = str(turn.get("content") or "").strip()
        if not prior or prior.lower() == clean.lower():
            continue
        if _BACKTEST_PATTERNS.search(prior) or re.search(r"\b(if i buy|buy when|buy after|sell when|sell on)\b", prior, re.IGNORECASE):
            if _CROSS_PATTERNS.search(clean) or re.search(r"\b(all|across|nse|stocks|scan)\b", clean, re.IGNORECASE):
                return f"Scan all NSE stocks for this strategy: {prior}"
            return f"{clean}. Use this previous strategy: {prior}"
    return clean


# ── Helpers ──────────────────────────────────────────────────────────────────
def _buy_and_hold_pct(df: pd.DataFrame) -> float:
    if df is None or len(df) < 2:
        return 0.0
    first = float(df.iloc[0]["close"])
    last = float(df.iloc[-1]["close"])
    return ((last - first) / first * 100) if first > 0 else 0.0


def _window_label(df: pd.DataFrame) -> str:
    try:
        start = pd.to_datetime(df.iloc[0]["date"]).date()
        end = pd.to_datetime(df.iloc[-1]["date"]).date()
        return f"{start} to {end} ({len(df)} trading days)"
    except Exception:
        return f"{len(df)} trading days"


def _narrate(
    data_section: str,
    user_prompt: str,
    fallback: str,
    system_prompt: str = ANALYST_SYSTEM_PROMPT,
    history: list[dict[str, Any]] | None = None,
) -> tuple[str, str]:
    """Return (answer_text, model_used). Falls back to deterministic text.

    The user's real question is sent as the user turn so the model replies to it
    directly. The computed numbers are supplied as private context in a system
    message, with an explicit instruction never to expose that the data, or how
    it was produced, exists.
    """
    if not llm_client.any_provider_available():
        return fallback, "local"
    messages = [
        {"role": "system", "content": system_prompt},
        {
            "role": "system",
            "content": (
                "Here are the only real numbers you have to answer the user's question. Use them and "
                "do not invent any others. Answer the user directly and naturally; do NOT mention this "
                "data block, do NOT restate the question, and do NOT describe how the numbers were "
                "produced, our database, queries, or any backend process.\n\n"
                + data_section
            ),
        },
    ]
    for turn in (history or [])[-6:]:
        role = turn.get("role")
        content = str(turn.get("content") or "").strip()
        if role in {"user", "assistant"} and content:
            messages.append({"role": role, "content": content[:4000]})
    messages.append({"role": "user", "content": user_prompt})
    try:
        result = llm_client.chat(messages, temperature=0.35, max_tokens=900)
        return result["text"], result["model"]
    except Exception as exc:  # noqa: BLE001
        print(f"[AskAI] narration failed: {exc}")
        return fallback, "local"


# ── Strategy translation (once) + reuse across stocks ─────────────────────────
def _translate_once(prompt: str) -> dict[str, Any]:
    clean = prompt.lower()
    week_drop = re.search(r"(?:falls?|drops?|down)\s+(\d+(?:\.\d+)?)\s*%\s+in\s+a\s+week", clean)
    delay = re.search(r"(\d+)\s+days?\s+after", clean)
    bounce = re.search(r"(\d+(?:\.\d+)?)\s*%\s+bounce", clean)
    if week_drop and bounce:
        return {
            "buy_expr": f"df['week_return'].shift({int(delay.group(1)) if delay else 0}) < -{float(week_drop.group(1))}",
            "sell_expr": f"df['week_return'] > {float(bounce.group(1))}",
            "mode": "crossover",
        }
    strategy = _rule_engine_fallback(prompt)
    if strategy:
        return strategy
    try:
        return translate_strategy(prompt)
    except Exception as exc:  # noqa: BLE001
        print(f"[AskAI] translate fallback: {exc}")
        return {"buy_expr": "df['RSI_14'] < 35", "sell_expr": "df['RSI_14'] > 65", "mode": "crossover"}


def _simulate(df: pd.DataFrame, strategy: dict[str, Any]) -> tuple[dict | None, list, dict | None]:
    prepared = _prepare_df(df)
    buy_expr = strategy.get("buy_expr", "")
    sell_expr = strategy.get("sell_expr", "")
    mode = strategy.get("mode", "crossover")
    try:
        if mode == "target_exit":
            trades, open_trade = _run_target_exit(
                prepared, buy_expr, strategy.get("target_pct") or 0, strategy.get("target_direction", "up")
            )
        elif mode == "crossover":
            trades, open_trade = _run_crossover(prepared, buy_expr, sell_expr)
        else:
            trades, open_trade = _run_simple(prepared, buy_expr)
    except Exception:
        trades, open_trade = _run_simple(prepared, buy_expr)
    return _summary(trades), trades, open_trade


def _strategy_alert_payload(prompt: str) -> dict[str, Any] | None:
    try:
        from app.services.strategy_engine import DISCLAIMER, backtest_nl_strategy

        result = backtest_nl_strategy(prompt)
        return {
            "strategy_json": result.get("strategy_json"),
            "strategy_alert": {
                "alertable": bool(result.get("alertable")),
                "quality": result.get("quality"),
                "stats": result.get("stats"),
                "out_of_sample": result.get("out_of_sample"),
                "recent_signals": result.get("recent_signals") or [],
                "disclaimer": DISCLAIMER,
                "cta": "Save as daily alert" if result.get("alertable") else None,
            },
            "disclaimer": DISCLAIMER,
        }
    except Exception as exc:  # noqa: BLE001
        print(f"[AskAI] strategy alert payload skipped: {exc}")
        return None


# ── Mode: single-stock backtest ───────────────────────────────────────────────
def _single_backtest(prompt: str, ticker: str, history: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    df = get_historical_data(ticker, days=1825)
    if df is None or len(df) < 30:
        raise ValueError(f"Not enough price history for {ticker}.")
    result = run_custom_backtest(df.copy(), prompt)
    if result.get("error"):
        raise ValueError(result["error"])

    buy_hold = _buy_and_hold_pct(_prepare_df(df))
    summary = result.get("summary") or {}
    window = _window_label(_prepare_df(df))

    data_lines = [
        f"Stock: {ticker}",
        f"Window: {window}",
        f"Strategy rules: BUY when `{result.get('buy_expr')}`, SELL when `{result.get('sell_expr')}` (mode: {result.get('mode')})",
        f"Buy-and-hold return over the same window: {round(buy_hold, 2)}%",
    ]
    if summary:
        data_lines += [
            f"Closed trades: {summary.get('total_trades')}",
            f"Win rate: {summary.get('win_rate')}%",
            f"Total compounded return: {summary.get('total_return_pct')}%",
            f"Average return per trade: {summary.get('avg_return_per_trade_pct')}%",
            f"Average win: {summary.get('avg_win_pct')}% | Average loss: {summary.get('avg_loss_pct')}%",
            f"Risk/reward ratio: {summary.get('risk_reward_ratio')} | Profit factor: {summary.get('profit_factor')}",
            f"Max drawdown: {summary.get('max_drawdown_pct')}% | Avg holding days: {summary.get('avg_holding_days')}",
            f"Best trade: {summary.get('best_trade_pct')}% | Worst trade: {summary.get('worst_trade_pct')}%",
            f"Strategy alpha vs buy-and-hold: {round((summary.get('total_return_pct') or 0) - buy_hold, 2)}%",
        ]
    else:
        data_lines.append("No closed trades were triggered by this strategy on this stock.")

    fallback = result.get("analysis_text") or "Backtest completed."
    answer, model_used = _narrate("\n".join(data_lines), prompt, fallback, history=history)

    result["buy_and_hold_return_pct"] = round(buy_hold, 2)
    if summary:
        result["alpha_vs_buy_hold_pct"] = round((summary.get("total_return_pct") or 0) - buy_hold, 2)

    response = {
        "answer": answer,
        "mode": "single_backtest",
        "success": True,
        "model_used": model_used,
        "target_stock": ticker,
        "backtest": result,
        "scan": None,
        "suggestions": [
            f"Compare this against buy-and-hold on {ticker}",
            f"Test this strategy across all NSE stocks: {prompt}",
            "Add a stop-loss and re-run",
        ],
    }
    alert_payload = _strategy_alert_payload(prompt)
    if alert_payload:
        response.update(alert_payload)
    return response


# ── Mode: cross-stock scan ─────────────────────────────────────────────────────
def _pick_universe(prompt: str, known_stocks: list[dict[str, Any]] | None) -> list[dict[str, Any]]:
    stocks = known_stocks or []
    lower = prompt.lower()
    if re.search(r"\b(us|usa|nasdaq|nyse|america|american)\b", lower):
        pool = [s for s in stocks if str(s.get("exchange")) in {"NASDAQ", "NYSE"}]
    else:
        pool = [s for s in stocks if str(s.get("exchange")) == "NSE"]
    if not pool:
        pool = stocks
    return pool[:SCAN_LIMIT]


def _scan_one(stock: dict[str, Any], strategy: dict[str, Any]) -> dict[str, Any] | None:
    ticker = str(stock.get("ticker") or "")
    if not ticker:
        return None
    try:
        df = get_historical_data(ticker, days=1825)
        if df is None or len(df) < 60:
            return None
        summary, trades, _ = _simulate(df, strategy)
        buy_hold = _buy_and_hold_pct(_prepare_df(df))
        total_return = summary.get("total_return_pct", 0) if summary else 0
        return {
            "ticker": ticker,
            "symbol": stock.get("symbol"),
            "name": stock.get("name"),
            "total_trades": summary.get("total_trades", 0) if summary else 0,
            "win_rate": summary.get("win_rate", 0) if summary else 0,
            "total_return_pct": total_return,
            "avg_return_per_trade_pct": summary.get("avg_return_per_trade_pct", 0) if summary else 0,
            "max_drawdown_pct": summary.get("max_drawdown_pct", 0) if summary else 0,
            "buy_hold_pct": round(buy_hold, 2),
            "alpha_pct": round((total_return or 0) - buy_hold, 2),
        }
    except Exception as exc:  # noqa: BLE001
        print(f"[AskAI] scan failed for {ticker}: {exc}")
        return None


def _cross_scan(
    prompt: str,
    known_stocks: list[dict[str, Any]] | None,
    history: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    # Prefer the precomputed snapshot's top liquid names (stable, relevant, and
    # restart-proof); fall back to the catalog head only when it's unavailable.
    universe = _snapshot_candidate_stocks(prompt, known_stocks, SCAN_LIMIT) or _pick_universe(prompt, known_stocks)
    if not universe:
        raise ValueError("No stocks available to scan.")
    strategy = _translate_once(prompt)

    rows: list[dict[str, Any]] = []
    with ThreadPoolExecutor(max_workers=8) as executor:
        futures = [executor.submit(_scan_one, stock, strategy) for stock in universe]
        for future in as_completed(futures):
            row = future.result()
            if row is not None:
                rows.append(row)

    traded = [r for r in rows if r["total_trades"] > 0]
    traded.sort(key=lambda r: r["total_return_pct"], reverse=True)

    scanned = len(rows)
    avg_win = round(float(np.mean([r["win_rate"] for r in traded])), 2) if traded else 0.0
    avg_return = round(float(np.mean([r["total_return_pct"] for r in traded])), 2) if traded else 0.0
    beat_bh = sum(1 for r in traded if r["alpha_pct"] > 0)
    profitable = sum(1 for r in traded if r["total_return_pct"] > 0)

    top = traded[:8]
    bottom = traded[-5:][::-1] if len(traded) > 8 else []

    def _fmt(rows_subset: list[dict[str, Any]]) -> str:
        return "\n".join(
            f"  - {r['symbol'] or r['ticker']}: return {r['total_return_pct']}%, "
            f"win rate {r['win_rate']}%, trades {r['total_trades']}, "
            f"buy-hold {r['buy_hold_pct']}%, alpha {r['alpha_pct']}%"
            for r in rows_subset
        )

    data_lines = [
        f"Strategy rules: BUY `{strategy.get('buy_expr')}`, SELL `{strategy.get('sell_expr')}` (mode: {strategy.get('mode')})",
        f"Universe scanned: {scanned} stocks; {len(traded)} produced at least one trade.",
        f"Across stocks that traded: {profitable} were net profitable, {beat_bh} beat their own buy-and-hold.",
        f"Average win rate: {avg_win}% | Average total return: {avg_return}%",
        "Top performers:",
        _fmt(top) or "  (none)",
    ]
    if bottom:
        data_lines += ["Worst performers:", _fmt(bottom)]

    fallback = (
        f"Scanned {scanned} stocks. {len(traded)} traded, {profitable} were profitable, "
        f"and {beat_bh} beat buy-and-hold. Average win rate {avg_win}%, average return {avg_return}%."
    )
    answer, model_used = _narrate("\n".join(data_lines), prompt, fallback, history=history)

    response = {
        "answer": answer,
        "mode": "cross_scan",
        "success": True,
        "model_used": model_used,
        "target_stock": None,
        "backtest": None,
        "scan": {
            "buy_expr": strategy.get("buy_expr"),
            "sell_expr": strategy.get("sell_expr"),
            "mode": strategy.get("mode"),
            "scanned": scanned,
            "traded": len(traded),
            "profitable": profitable,
            "beat_buy_hold": beat_bh,
            "avg_win_rate": avg_win,
            "avg_total_return_pct": avg_return,
            "rows": traded[:25],
        },
        "suggestions": [
            "Show me the single best stock for this strategy in detail",
            "How would transaction costs change these results?",
            "Compare this to a simple buy-and-hold portfolio",
        ],
    }
    alert_payload = _strategy_alert_payload(prompt)
    if alert_payload:
        response.update(alert_payload)
    return response


# ── Known-universe cache (so movers see EVERY stock, not a truncated head) ─────
# The frontend ships the full catalog on each request, but a single request can
# be partial. We remember the largest catalog we have seen so the background
# movers snapshot always works against the complete universe.
_universe_lock = threading.Lock()
_universe_cache: list[dict[str, Any]] = []


def _remember_universe(stocks: list[dict[str, Any]] | None) -> None:
    global _universe_cache
    if not stocks:
        return
    with _universe_lock:
        if len(stocks) > len(_universe_cache):
            _universe_cache = [dict(s) for s in stocks]


def _all_known_stocks(fallback: list[dict[str, Any]] | None = None) -> list[dict[str, Any]]:
    with _universe_lock:
        if _universe_cache:
            return list(_universe_cache)
    return list(fallback or [])


def _detect_group(prompt: str) -> str:
    if re.search(r"\b(us|usa|u\.s\.|nasdaq|nyse|america|american|dow|s&p)\b", prompt.lower()):
        return "US"
    return "NSE"


def _group_universe(group: str, fallback: list[dict[str, Any]] | None = None) -> list[dict[str, Any]]:
    stocks = _all_known_stocks(fallback)
    if group == "US":
        pool = [s for s in stocks if str(s.get("exchange")) in {"NASDAQ", "NYSE"}]
    else:
        pool = [s for s in stocks if str(s.get("exchange")) == "NSE"]
    return pool or stocks


# ── Mode: market movers / circuit lookup ──────────────────────────────────────
_WEEKDAYS = {
    "monday": 0, "tuesday": 1, "wednesday": 2, "thursday": 3,
    "friday": 4, "saturday": 5, "sunday": 6,
}


def _target_date(prompt: str) -> dt.date | None:
    """Resolve a date reference in the prompt to a concrete date, or None for
    the latest available session."""
    lower = prompt.lower()
    today = dt.date.today()
    if "today" in lower:
        return today
    if "yesterday" in lower:
        return today - dt.timedelta(days=1)
    for name, idx in _WEEKDAYS.items():
        if re.search(rf"\b{name}\b", lower):
            delta = (today.weekday() - idx) % 7  # most recent past/that weekday
            return today - dt.timedelta(days=delta)
    return None


# ── Background daily-moves snapshot ────────────────────────────────────────────
# Per market group we keep: status, each ticker's recent (date, close) series,
# and progress counters. A daemon thread fills it from the full universe. Movers
# queries read it instantly once ready; while warming they get best-so-far plus
# an honest note. Everything fetched is persisted to Supabase by data_service,
# so subsequent rebuilds are cheap.
_snap_lock = threading.Lock()
_snapshots: dict[str, dict[str, Any]] = {}


def _new_snapshot() -> dict[str, Any]:
    return {"status": "idle", "moves": {}, "built_at": 0.0, "started_at": 0.0, "total": 0, "done": 0}


def _snapshot_for(group: str) -> dict[str, Any]:
    with _snap_lock:
        if group not in _snapshots:
            _snapshots[group] = _new_snapshot()
        return _snapshots[group]


def _series_from_df(df: pd.DataFrame) -> list[tuple[str, float]]:
    d = df.copy()
    d["date"] = pd.to_datetime(d["date"], errors="coerce")
    d = d.dropna(subset=["date", "close"]).sort_values("date")
    tail = d.tail(_SNAPSHOT_SERIES_LEN)
    series: list[tuple[str, float]] = []
    for date_val, close_val in zip(tail["date"], tail["close"]):
        try:
            series.append((str(pd.to_datetime(date_val).date()), round(float(close_val), 2)))
        except Exception:  # noqa: BLE001
            continue
    return series


def _start_snapshot_build(group: str, universe: list[dict[str, Any]]) -> dict[str, Any]:
    """Kick off (or skip) a background build for a market group. Returns the
    snapshot state immediately so callers can read whatever is available."""
    state = _snapshot_for(group)
    with _snap_lock:
        if state["status"] == "building":
            return state
        if state["status"] == "ready" and (time.time() - state["built_at"]) < _SNAPSHOT_TTL:
            return state
        state["status"] = "building"
        state["started_at"] = time.time()
        state["total"] = len(universe)
        state["done"] = 0

    def _one(stock: dict[str, Any]) -> tuple[str, dict[str, Any]] | None:
        ticker = str(stock.get("ticker") or "")
        if not ticker:
            return None
        try:
            df = get_historical_data(ticker, days=_SNAPSHOT_FETCH_DAYS)
            if df is None or len(df) < 2:
                return None
            series = _series_from_df(df)
            if len(series) < 2:
                return None
            return ticker, {"symbol": stock.get("symbol"), "name": stock.get("name"), "series": series}
        except Exception:  # noqa: BLE001 - missing/delisted tickers are skipped silently
            return None

    def _worker() -> None:
        try:
            with ThreadPoolExecutor(max_workers=_MOVERS_WORKERS) as executor:
                futures = [executor.submit(_one, stock) for stock in universe]
                for future in as_completed(futures):
                    res = future.result()
                    with _snap_lock:
                        state["done"] += 1
                        if res is not None:
                            state["moves"][res[0]] = res[1]
            with _snap_lock:
                state["status"] = "ready"
                state["built_at"] = time.time()
            print(f"[AskAI] movers snapshot for {group} ready: {len(state['moves'])}/{state['total']} stocks.")
        except Exception as exc:  # noqa: BLE001
            with _snap_lock:
                state["status"] = "ready" if state["moves"] else "idle"
            print(f"[AskAI] movers snapshot build for {group} failed: {exc}")

    threading.Thread(target=_worker, name=f"movers-{group}", daemon=True).start()
    return state


def movers_snapshot_status() -> dict[str, Any]:
    """Read-only progress of the background movers snapshot per market group.
    Used for cheap observability/polling without triggering an LLM narration."""
    out: dict[str, Any] = {}
    with _snap_lock:
        for group, state in _snapshots.items():
            out[group] = {
                "status": state["status"],
                "done": state["done"],
                "total": state["total"],
                "coverage": len(state["moves"]),
                "age_sec": round(time.time() - state["built_at"], 1) if state["built_at"] else None,
            }
    return out


def _move_from_series(series: list[tuple[str, float]], target: dt.date | None) -> dict[str, Any] | None:
    """Compute the single-session % change at `target` (or the latest session)
    from a stored ascending (date, close) series."""
    if not series or len(series) < 2:
        return None
    if target is not None:
        tstr = str(target)
        eligible = [i for i, (d, _) in enumerate(series) if d <= tstr]
        if len(eligible) < 2:
            return None
        idx = eligible[-1]
    else:
        idx = len(series) - 1
    if idx < 1:
        return None
    cur_date, cur_close = series[idx]
    _, prev_close = series[idx - 1]
    if prev_close <= 0:
        return None
    return {
        "date": cur_date,
        "close": cur_close,
        "change_pct": round((cur_close - prev_close) / prev_close * 100, 2),
    }


_LOSERS_RE = re.compile(
    r"\b(loser|losers|lower circuit|fell|fall|declin|worst|dropped|drop|down the most|"
    r"went down|crash|crashed|tank|tanked|plunge|plunged|slump|slumped|"
    r"tumble|tumbled|nosedive|nosedived|sank|sunk)\b"
)


def _snapshot_rows_for_group(group: str) -> list[dict[str, Any]]:
    """Fresh precomputed snapshot rows for the market group, or [] if unavailable.
    The snapshot is built from the NSE universe, so it only serves NSE queries."""
    if group != "NSE" or stock_snapshot_service is None:
        return []
    try:
        return stock_snapshot_service.get_snapshot_rows() or []
    except Exception as exc:  # noqa: BLE001
        print(f"[AskAI] snapshot read failed: {exc}")
        return []


def _market_movers_from_snapshot(
    prompt: str,
    rows_raw: list[dict[str, Any]],
    history: list[dict[str, Any]] | None,
) -> dict[str, Any] | None:
    """Rank movers instantly from the persistent snapshot (no live universe scan)."""
    lower = prompt.lower()
    losers = bool(_LOSERS_RE.search(lower))
    if re.search(r"\b(week|weekly|7\s*day|past week|this week|last week)\b", lower):
        metric_key, window_label = "ret_1w", "the past week"
    elif re.search(r"\b(month|monthly|30\s*day|past month|this month|last month)\b", lower):
        metric_key, window_label = "ret_1m", "the past month"
    else:
        metric_key, window_label = "change_pct", "the latest trading session"

    rows: list[dict[str, Any]] = []
    for r in rows_raw:
        try:
            change = round(float(r.get(metric_key)), 2)
        except (TypeError, ValueError):
            continue
        close = r.get("price")
        rows.append({
            "ticker": r.get("ticker"),
            "symbol": r.get("symbol"),
            "name": r.get("name"),
            "change_pct": change,
            "close": round(float(close), 2) if close not in (None, "") else None,
            "date": str(r.get("latest_date") or "")[:10] or None,
        })
    if not rows:
        return None

    rows.sort(key=lambda x: x["change_pct"], reverse=not losers)
    top = rows[:15]
    direction = "biggest decliners" if losers else "biggest gainers"
    date_counts = Counter(r["date"] for r in rows if r["date"])
    session_date = max(date_counts, key=lambda d: (date_counts[d], d)) if date_counts else None

    header = (
        f"The {direction} over {window_label} (ranked across {len(rows)} NSE stocks "
        "from precomputed Bullseye market data"
        + (f", session dated {session_date}" if metric_key == "change_pct" and session_date else "")
        + "):"
    )
    data_lines = [header, "Format - symbol: % change, latest close:"] + [
        f"  - {r['symbol'] or r['ticker']}: {r['change_pct']:+.2f}%"
        + (f", close {r['close']}" if r["close"] is not None else "")
        for r in top
    ]
    fallback = f"The {direction} over {window_label}:\n" + "\n".join(
        f"- {r['symbol'] or r['ticker']}: {r['change_pct']:+.2f}%"
        + (f" (close {r['close']})" if r["close"] is not None else "")
        for r in top
    )
    answer, model_used = _narrate("\n".join(data_lines), prompt, fallback, MOVERS_SYSTEM_PROMPT, history)
    return {
        "answer": answer,
        "mode": "movers",
        "success": True,
        "model_used": model_used,
        "target_stock": None,
        "backtest": None,
        "scan": {
            "session_date": session_date,
            "direction": direction,
            "coverage": len(rows),
            "universe": len(rows_raw),
            "ready": True,
            "rows": top,
        },
        "suggestions": [
            "Show me the biggest gainers instead" if losers else "Show me the biggest losers instead",
            "Best stocks to invest in right now",
            "Backtest a momentum strategy on the top mover",
        ],
    }


def _movers_unavailable_message(prompt: str) -> dict[str, Any]:
    """Returned for NSE movers when the snapshot isn't populated yet. We do NOT
    fall back to an in-process 2,142-stock scan — that is what exhausts small
    hosts. The daily off-server snapshot build keeps this table fresh."""
    losers = bool(_LOSERS_RE.search(prompt.lower()))
    direction = "biggest decliners" if losers else "biggest gainers"
    return {
        "answer": (
            "I don't have today's full-market scan ready yet — the daily market snapshot "
            "hasn't been built. Once it's populated I can instantly rank the top movers "
            "across every NSE stock. Please try again shortly."
        ),
        "mode": "movers",
        "success": True,
        "model_used": "local",
        "target_stock": None,
        "backtest": None,
        "scan": {
            "session_date": None,
            "direction": direction,
            "coverage": 0,
            "universe": 0,
            "ready": False,
            "rows": [],
        },
        "suggestions": [
            "Best stocks to invest in right now",
            "Analyze RELIANCE",
            "Backtest a momentum strategy on TCS",
        ],
    }


def _snapshot_candidate_stocks(
    prompt: str,
    known_stocks: list[dict[str, Any]] | None,
    limit: int,
) -> list[dict[str, Any]]:
    """Top liquid NSE names from the snapshot (by market cap), mapped back to
    catalog stock dicts, to ground cross-scans without fetching the whole
    universe live. Empty when the snapshot is unavailable (caller falls back)."""
    group = _detect_group(prompt)
    rows = _snapshot_rows_for_group(group)
    if not rows:
        return []
    by_ticker = {str(s.get("ticker")): s for s in (known_stocks or [])}

    def _mcap(r: dict[str, Any]) -> float:
        try:
            return float(r.get("market_cap") or 0)
        except (TypeError, ValueError):
            return 0.0

    rows.sort(key=_mcap, reverse=True)
    out: list[dict[str, Any]] = []
    for r in rows[:limit]:
        ticker = str(r.get("ticker") or "")
        if not ticker:
            continue
        out.append(by_ticker.get(ticker) or {
            "ticker": ticker,
            "symbol": r.get("symbol"),
            "name": r.get("name"),
            "exchange": "NSE",
            "currency": "₹",
        })
    return out


def _market_movers(
    prompt: str,
    known_stocks: list[dict[str, Any]] | None,
    history: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Movers from the persistent snapshot (instant, restart-proof). Small
    universes (e.g. US) still scan live in memory."""
    group = _detect_group(prompt)
    rows_raw = _snapshot_rows_for_group(group)
    if rows_raw:
        result = _market_movers_from_snapshot(prompt, rows_raw, history)
        if result is not None:
            return result
    if group == "NSE" and stock_snapshot_service is not None:
        return _movers_unavailable_message(prompt)
    return _market_movers_inmemory(prompt, known_stocks, history)


def _market_movers_inmemory(
    prompt: str,
    known_stocks: list[dict[str, Any]] | None,
    history: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    group = _detect_group(prompt)
    universe = _group_universe(group, known_stocks)
    if not universe:
        raise ValueError("No stocks available to scan.")

    # Ensure the snapshot is building/ready, then read whatever is available now.
    state = _start_snapshot_build(group, universe)

    # On a cold cache the snapshot starts empty. Give it a brief head start so the
    # first market-wide question returns real names rather than nothing -- but never
    # block for long: the full build keeps running in the background regardless.
    deadline = time.time() + _MOVERS_WARMUP_WAIT
    while time.time() < deadline:
        with _snap_lock:
            ready = state["status"] == "ready"
            have = len(state["moves"])
        if ready or have >= _MOVERS_MIN_ROWS:
            break
        time.sleep(1.0)

    with _snap_lock:
        moves_snapshot = dict(state["moves"])
        status = state["status"]
        done, total = state["done"], state["total"]

    target = _target_date(prompt)
    losers = bool(
        re.search(
            r"\b(loser|losers|lower circuit|fell|fall|declin|worst|dropped|drop|down the most|"
            r"went down|crash|crashed|tank|tanked|plunge|plunged|slump|slumped|"
            r"tumble|tumbled|nosedive|nosedived|sank|sunk)\b",
            prompt.lower(),
        )
    )

    rows: list[dict[str, Any]] = []
    for ticker, info in moves_snapshot.items():
        move = _move_from_series(info["series"], target)
        if move is not None:
            rows.append({"ticker": ticker, "symbol": info.get("symbol"), "name": info.get("name"), **move})

    if not rows:
        # Still warming up with nothing usable yet: tell the user plainly and let
        # them retry, instead of falling through to the generic error path.
        if status != "ready":
            pct = int(done / total * 100) if total else 0
            return {
                "answer": (
                    "I'm scanning the full market right now to answer that accurately "
                    f"(about {pct}% done). Give me a few seconds and ask again — I'll have "
                    "the complete list of movers for that session."
                ),
                "mode": "movers",
                "success": True,
                "model_used": "local",
                "target_stock": None,
                "backtest": None,
                "scan": {
                    "session_date": None,
                    "direction": "biggest decliners" if losers else "biggest gainers",
                    "coverage": len(moves_snapshot),
                    "universe": total,
                    "ready": False,
                    "rows": [],
                },
                "suggestions": [
                    "Show me the top gainers on Friday",
                    "Show me the biggest losers last week",
                    "Backtest a momentum strategy on RELIANCE",
                ],
            }
        raise ValueError("I don't have price data for that period yet.")

    # Anchor every mover to ONE coherent session: the date the most stocks share
    # (ties broken toward the most recent), so the list isn't a jumble of dates.
    date_counts = Counter(r["date"] for r in rows)
    max_count = max(date_counts.values())
    session_date = max(d for d, c in date_counts.items() if c == max_count)
    rows = [r for r in rows if r["date"] == session_date]

    rows.sort(key=lambda r: r["change_pct"], reverse=not losers)
    top = rows[:15]
    direction = "biggest decliners" if losers else "biggest gainers"

    data_lines = [
        f"The {direction} for the trading session dated {session_date} "
        f"(ranked across {len(rows)} stocks with data for that day):",
        "Format - symbol: % change, closing price:",
    ] + [
        f"  - {r['symbol'] or r['ticker']}: {r['change_pct']:+.2f}%, close {r['close']}"
        for r in top
    ]

    fallback = f"The {direction} on {session_date}:\n" + "\n".join(
        f"- {r['symbol'] or r['ticker']}: {r['change_pct']:+.2f}% (close {r['close']})" for r in top
    )
    answer, model_used = _narrate("\n".join(data_lines), prompt, fallback, MOVERS_SYSTEM_PROMPT, history)

    # Be honest if the full-market scan is still warming up. Appended after the
    # model's answer so the model itself never narrates backend mechanics.
    if status != "ready":
        pct = int(done / total * 100) if total else 0
        answer = (
            f"{answer}\n\n_(Still scanning the full market — about {pct}% done. "
            f"This list covers the {len(moves_snapshot)} stocks checked so far; "
            f"ask again in a moment for the complete ranking.)_"
        )

    return {
        "answer": answer,
        "mode": "movers",
        "success": True,
        "model_used": model_used,
        "target_stock": None,
        "backtest": None,
        "scan": {
            "session_date": session_date,
            "direction": direction,
            "coverage": len(moves_snapshot),
            "universe": total,
            "ready": status == "ready",
            "rows": top,
        },
        "suggestions": [
            "Backtest a momentum strategy on the top mover",
            "Show me the biggest losers instead",
            "Scan these names for a mean-reversion setup",
        ],
    }


# ── Mode: technical / ROI (reuse stock_ai_service) ─────────────────────────────
def _single_stock_reuse(
    prompt: str,
    ticker: str,
    known_stocks: list[dict[str, Any]] | None,
    history: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    raw = run_stock_ai_search(prompt, ticker, known_stocks)
    deterministic = raw.get("answer") or "Here is what the data shows."

    if raw.get("type") == "technical_analysis":
        metrics = raw.get("metrics", {})
        data_lines = [f"Stock: {raw.get('target_stock')}"] + [
            f"{key}: {value}" for key, value in metrics.items() if value is not None
        ]
        mode = "technical"
    elif raw.get("type") == "historical_roi":
        data_lines = [
            f"Stock: {raw.get('target_stock')}",
            f"Bought {raw.get('quantity')} share(s) at {raw.get('buy_price')} on {raw.get('investment_date')}",
            f"Latest close {raw.get('current_price')} on {raw.get('latest_date')}",
            f"Invested {raw.get('invested')}, now worth {raw.get('current_value')}",
            f"P&L {raw.get('pnl')} ({raw.get('return_pct')}%)",
        ]
        mode = "roi"
    else:
        data_lines = [deterministic]
        mode = raw.get("type", "technical")

    answer, model_used = _narrate("\n".join(data_lines), prompt, deterministic, history=history)
    return {
        "answer": answer,
        "mode": mode,
        "success": True,
        "model_used": model_used,
        "target_stock": raw.get("target_stock"),
        "backtest": raw.get("custom_metrics"),
        "scan": None,
        "detail": raw,
        "suggestions": [
            f"Backtest a simple strategy on {raw.get('target_stock')}",
            f"What is the support and resistance for {raw.get('target_stock')}?",
        ],
    }


# ── App context enrichment (don't send Groq just the bare question) ────────────
def _stock_snapshot(ticker: str) -> tuple[dict[str, Any] | None, str | None]:
    """Compute a real technical snapshot for a resolved ticker from our OHLCV
    data, reusing the same indicator math the stock detail page uses. Returns
    (snapshot_dict, formatted_text), or (None, None) when data is unavailable."""
    try:
        from app.services import stock_ai_service as sai

        raw = get_historical_data(ticker, days=400)
        if raw is None or len(raw) < 30:
            return None, None
        frame = sai._add_indicators(sai._prepare_df(raw))
        if frame.empty:
            return None, None

        latest = frame.iloc[-1]
        recent_20 = frame.tail(min(20, len(frame)))
        close = sai._round(latest.get("close"))
        rsi = sai._round(latest.get("RSI_14"))
        sma50 = sai._round(latest.get("SMA_50"))
        ema20 = sai._round(latest.get("EMA_20"))
        macd = sai._round(latest.get("MACD"), 4)
        macd_sig = sai._round(latest.get("MACD_signal"), 4)
        support = sai._round(recent_20["low"].min())
        resistance = sai._round(recent_20["high"].max())

        trend_pct = None
        if len(frame) >= 21:
            old_close = sai._safe_float(frame.iloc[-21].get("close"))
            if old_close and close:
                trend_pct = round((close - old_close) / old_close * 100, 2)
        trend_word = (
            "rising" if (trend_pct or 0) > 1 else "falling" if (trend_pct or 0) < -1 else "roughly flat"
        )
        status = sai._technical_status(rsi)
        if macd is not None and macd_sig is not None:
            macd_read = "bullish (MACD above signal)" if macd > macd_sig else "bearish (MACD below signal)"
        else:
            macd_read = "unavailable"

        snapshot = {
            "ticker": ticker,
            "latest_date": latest.get("day"),
            "latest_close": close,
            "rsi_14": rsi,
            "rsi_status": status,
            "sma_50": sma50,
            "ema_20": ema20,
            "macd": macd,
            "macd_signal": macd_sig,
            "support_20d": support,
            "resistance_20d": resistance,
            "trend_20d_pct": trend_pct,
            "trend_word": trend_word,
        }
        trend_line = f"- Recent trend: {trend_word}"
        if trend_pct is not None:
            trend_line += f" ({trend_pct:+.2f}% over ~20 sessions)"
        text = "\n".join(
            [
                f"Stock snapshot for {ticker} (computed from our historical data, as of {latest.get('day')}):",
                f"- Latest close: {close}",
                f"- RSI(14): {rsi} ({status})",
                trend_line,
                f"- SMA 50: {sma50} | EMA 20: {ema20}",
                f"- MACD: {macd_read}",
                f"- 20-day support / resistance: {support} / {resistance}",
                "Note: this is historical data, not a live real-time quote.",
            ]
        )
        return snapshot, text
    except Exception as exc:  # noqa: BLE001
        print(f"[AskAI] snapshot failed for {ticker}: {exc}")
        return None, None


def _format_client_context(context: dict[str, Any] | None) -> str | None:
    """Turn the UI-supplied context (selected stock, prediction, page, etc.)
    into a short text block for the model. Ignores empty fields."""
    if not context:
        return None
    lines: list[str] = []
    page = str(context.get("current_page") or "").strip()
    if page:
        lines.append(f"- The user is on the '{page}' screen of the app.")
    symbol = context.get("selected_symbol") or context.get("selected_ticker")
    if symbol:
        lines.append(f"- Stock currently selected in the app: {symbol}.")
    prediction = context.get("prediction")
    if prediction:
        confidence = context.get("confidence")
        if confidence not in (None, ""):
            lines.append(f"- App's prediction for the selected stock: {prediction} (confidence: {confidence}).")
        else:
            lines.append(f"- App's prediction for the selected stock: {prediction}.")
    trend = context.get("trend")
    if trend:
        lines.append(f"- App-reported price trend: {trend}.")
    indicators = context.get("indicators")
    if isinstance(indicators, dict) and indicators:
        joined = ", ".join(f"{k}={v}" for k, v in list(indicators.items())[:12] if v not in (None, ""))
        if joined:
            lines.append(f"- Indicators shown in the app: {joined}.")
    summary = str(context.get("analysis_summary") or "").strip()
    if summary:
        lines.append(f"- Recent analysis summary from the app: {summary[:600]}")
    if not lines:
        return None
    return "App context provided by the product UI:\n" + "\n".join(lines)


# ── Mode: general chat ─────────────────────────────────────────────────────────
def _general_chat(
    prompt: str,
    history: list[dict[str, Any]] | None,
    ticker: str | None = None,
    context: dict[str, Any] | None = None,
) -> dict[str, Any]:
    if not llm_client.any_provider_available():
        return {
            "answer": (
                "I can't reach the AI engine right now (no model API key is configured). "
                "I can still run backtests and stock scans on our data — try asking something like "
                "\"backtest buy when RSI crosses 30 and sell at 70 on RELIANCE\" or "
                "\"which NSE stocks work best with a gap-up momentum strategy?\""
            ),
            "mode": "general",
            "success": False,
            "model_used": "local",
            "target_stock": None,
            "context_used": False,
            "backtest": None,
            "scan": None,
            "suggestions": [],
        }

    # Build the app-context block from UI-supplied context + a real backend
    # snapshot of the resolved/selected stock. This is what makes answers
    # specific instead of generic.
    context_blocks: list[str] = []
    client_ctx = _format_client_context(context)
    if client_ctx:
        context_blocks.append(client_ctx)

    snap_ticker = ticker or (str((context or {}).get("selected_ticker") or "").upper() or None)
    snapshot = None
    if snap_ticker:
        snapshot, snap_text = _stock_snapshot(snap_ticker)
        if snap_text:
            context_blocks.append(snap_text)

    messages = [{"role": "system", "content": GENERAL_SYSTEM_PROMPT}]
    if context_blocks:
        messages.append(
            {
                "role": "system",
                "content": (
                    "Use the following app context when it is relevant to the question. These are the only "
                    "real, app-provided numbers you have — refer to them directly and do not invent others.\n\n"
                    + "\n\n".join(context_blocks)
                ),
            }
        )
    for turn in (history or [])[-6:]:
        role = turn.get("role")
        content = str(turn.get("content") or "").strip()
        if role in {"user", "assistant"} and content:
            messages.append({"role": role, "content": content[:4000]})
    messages.append({"role": "user", "content": prompt})

    try:
        result = llm_client.chat(messages, temperature=0.4, max_tokens=900)
        answer, model_used = result["text"], result["model"]
    except Exception as exc:  # noqa: BLE001
        print(f"[AskAI] general chat failed: {exc}")
        answer, model_used = (
            "I had trouble generating a response just now. Please try again in a moment.",
            "local",
        )

    return {
        "answer": answer,
        "mode": "general",
        "success": True,
        "model_used": model_used,
        "target_stock": snap_ticker if snapshot else None,
        "context_used": bool(context_blocks),
        "stock_snapshot": snapshot,
        "backtest": None,
        "scan": None,
        "suggestions": [
            "Backtest a strategy on a specific stock",
            "Scan all NSE stocks for a momentum strategy",
            "Explain the difference between win rate and profitability",
        ],
    }


# ── Entry point ────────────────────────────────────────────────────────────────
def run_ask_ai(
    prompt: str,
    history: list[dict[str, Any]] | None = None,
    known_stocks: list[dict[str, Any]] | None = None,
    context: dict[str, Any] | None = None,
) -> dict[str, Any]:
    prompt = (prompt or "").strip()
    if not prompt:
        raise ValueError("Prompt is required.")
    prompt = _expand_strategy_followup(prompt, history)

    # Remember the fullest catalog we have ever seen so ticker resolution and the
    # background market scan cover EVERY listed stock, even when a later request
    # happens to arrive with a thinner list.
    _remember_universe(known_stocks)
    universe = _all_known_stocks(known_stocks)

    ticker = _resolve_ticker(prompt, universe)
    # If the prompt itself names no stock, fall back to whatever the UI says is
    # currently selected so general questions still get real context.
    if not ticker and context:
        selected = str(context.get("selected_ticker") or context.get("selected_symbol") or "").upper()
        if selected:
            ticker = selected if "." in selected else (_resolve_ticker(selected, universe) or selected)
    intent = _classify(prompt, ticker)

    try:
        if intent == "MOVERS":
            return _market_movers(prompt, universe, history)
        if intent == "CROSS_SCAN":
            return _cross_scan(prompt, universe, history)
        if intent == "BACKTEST" and ticker:
            return _single_backtest(prompt, ticker, history)
        if intent in {"TECHNICAL", "ROI"} and ticker:
            return _single_stock_reuse(prompt, ticker, universe, history)
    except Exception as exc:  # noqa: BLE001 - degrade gracefully to a chat answer
        print(f"[AskAI] {intent} handler failed, falling back to chat: {exc}")
        fallback = _general_chat(prompt, history, ticker, context)
        fallback["answer"] = (
            f"I tried to run the numbers for that but hit a snag ({exc}). "
            f"Here's what I can tell you generally:\n\n{fallback['answer']}"
        )
        return fallback

    return _general_chat(prompt, history, ticker, context)
