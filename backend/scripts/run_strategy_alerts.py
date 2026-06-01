"""Run AI Strategy Alerts off-server after stock_snapshot is refreshed.

This script is intended for GitHub Actions, not Render. It reads enabled
strategies and today's stock_snapshot rows from Supabase, writes deduped
strategy_signals, and sends capped educational emails.
"""
from __future__ import annotations

import argparse
import os
import sys
from collections import defaultdict
from datetime import datetime, timezone
from html import escape
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from supabase import create_client

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.services.alert_service import _send_email  # noqa: E402
from app.services.strategy_engine import DISCLAIMER, entry_plan, evaluate_snapshot_row, today_signal_date  # noqa: E402

load_dotenv()

MAX_TRIGGERS = int(os.getenv("STRATEGY_ALERT_MAX_TRIGGERS", "15"))


def _connect():
    url = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        sys.exit("Need SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY for strategy alerts.")
    return create_client(url, key)


def _safe_num(value: Any) -> float | None:
    try:
        return float(value) if value is not None else None
    except Exception:
        return None


def _load_all(sb, table: str, select: str = "*") -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    start = 0
    page_size = 1000
    while True:
        response = sb.table(table).select(select).range(start, start + page_size - 1).execute()
        page = getattr(response, "data", None) or []
        rows.extend(page)
        if len(page) < page_size:
            break
        start += page_size
    return rows


def _trigger_score(row: dict[str, Any]) -> float:
    cap = _safe_num(row.get("market_cap_cr")) or 0
    gap = abs(_safe_num(row.get("gap_pct")) or 0)
    vol = _safe_num(row.get("vol_ratio")) or 0
    return round(min(cap / 10000, 80) + min(gap * 4, 20) + min(vol * 5, 20), 4)


def _preference_by_user(sb) -> dict[str, dict[str, Any]]:
    try:
        rows = _load_all(sb, "notification_preferences")
        return {str(row.get("user_id")): row for row in rows}
    except Exception as exc:
        print(f"[StrategyAlerts] notification_preferences unavailable: {exc}")
        return {}


def _email_html(strategy: dict[str, Any], signals: list[dict[str, Any]]) -> str:
    items = []
    for signal in signals:
        plan = signal.get("entry_plan") or {}
        items.append(
            "<tr>"
            f"<td style='padding:8px;border-bottom:1px solid #e2e8f0'><strong>{escape(str(signal.get('symbol') or signal.get('ticker')))}</strong></td>"
            f"<td style='padding:8px;border-bottom:1px solid #e2e8f0'>{escape(str(signal.get('ticker')))}</td>"
            f"<td style='padding:8px;border-bottom:1px solid #e2e8f0'>{plan.get('entry') or '-'}</td>"
            f"<td style='padding:8px;border-bottom:1px solid #e2e8f0'>{plan.get('stop') or '-'}</td>"
            f"<td style='padding:8px;border-bottom:1px solid #e2e8f0'>{plan.get('target') or '-'}</td>"
            "</tr>"
        )
    rows = "".join(items)
    return (
        "<div style='font-family:Inter,Arial,sans-serif;color:#0f172a'>"
        f"<h2>Your educational strategy signals: {escape(str(strategy.get('name') or 'AI Strategy'))}</h2>"
        "<p>Signals computed after close, for the next morning's open.</p>"
        "<table style='border-collapse:collapse;width:100%;font-size:14px'>"
        "<thead><tr><th align='left'>Symbol</th><th align='left'>Ticker</th><th align='left'>Entry</th><th align='left'>Stop</th><th align='left'>Target</th></tr></thead>"
        f"<tbody>{rows}</tbody></table>"
        f"<p style='margin-top:16px;color:#64748b;font-size:12px'>{escape(DISCLAIMER)}</p>"
        "</div>"
    )


def run(*, dry_run: bool = False, max_triggers: int = MAX_TRIGGERS) -> dict[str, Any]:
    sb = _connect()
    strategies = []
    try:
        response = sb.table("user_strategies").select("*").eq("enabled", True).execute()
        strategies = getattr(response, "data", None) or []
    except Exception as exc:
        print(f"[StrategyAlerts] user_strategies unavailable: {exc}")
        return {"strategies": 0, "signals": 0, "emails": 0, "error": str(exc)}

    snapshots = _load_all(sb, "stock_snapshot")
    preferences = _preference_by_user(sb)
    signals_by_user_strategy: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    written = 0
    emails = 0

    for strategy in strategies:
        strategy_json = strategy.get("strategy_json") or {}
        candidates = []
        for row in snapshots:
            try:
                if evaluate_snapshot_row(row, strategy_json):
                    candidates.append(row)
            except Exception:
                continue
        candidates.sort(key=_trigger_score, reverse=True)
        for row in candidates[:max(1, max_triggers)]:
            plan = entry_plan(row, strategy_json)
            signal_date = today_signal_date(row)
            payload = {
                "strategy_id": strategy["id"],
                "user_id": strategy["user_id"],
                "ticker": row.get("ticker"),
                "symbol": row.get("symbol"),
                "signal_date": signal_date,
                "entry_plan": plan,
                "score": _trigger_score(row),
                "outcome": None,
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
            if not dry_run:
                try:
                    sb.table("strategy_signals").upsert(payload, on_conflict="strategy_id,ticker,signal_date").execute()
                    written += 1
                except Exception as exc:
                    print(f"[StrategyAlerts] signal write failed for {row.get('ticker')}: {exc}")
                    continue
            signals_by_user_strategy[(strategy["user_id"], strategy["id"])].append(payload)
        if not dry_run:
            try:
                sb.table("user_strategies").update({"last_run_date": datetime.now(timezone.utc).date().isoformat()}).eq("id", strategy["id"]).execute()
            except Exception as exc:
                print(f"[StrategyAlerts] last_run_date update failed for {strategy.get('id')}: {exc}")

    strategy_by_id = {str(item["id"]): item for item in strategies}
    for (user_id, strategy_id), signals in signals_by_user_strategy.items():
        preference = preferences.get(str(user_id)) or {}
        email = preference.get("email")
        if not preference.get("daily_stock_email_enabled") or not email:
            continue
        strategy = strategy_by_id.get(str(strategy_id)) or {}
        subject = f"Bullseye AI Strategy Signals: {strategy.get('name') or 'Daily Alert'}"
        text = "\n".join([f"{s.get('symbol') or s.get('ticker')}: {s.get('entry_plan')}" for s in signals])
        if dry_run or not os.getenv("RESEND_API_KEY"):
            print(f"[StrategyAlerts] dry email to user {user_id}: {len(signals)} signals")
            continue
        result = _send_email(email, subject, text + "\n\n" + DISCLAIMER, html=_email_html(strategy, signals))
        if result.get("status") == "sent":
            emails += 1

    return {"strategies": len(strategies), "signals": written if not dry_run else sum(len(v) for v in signals_by_user_strategy.values()), "emails": emails, "dry_run": dry_run}


def main() -> None:
    parser = argparse.ArgumentParser(description="Run AI strategy alert detection and emails.")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--max-triggers", type=int, default=MAX_TRIGGERS)
    args = parser.parse_args()
    print(run(dry_run=args.dry_run, max_triggers=args.max_triggers))


if __name__ == "__main__":
    main()
