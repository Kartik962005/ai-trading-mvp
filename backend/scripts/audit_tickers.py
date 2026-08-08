"""Find tickers that no longer resolve — renames, demergers, delistings.

Indian corporate actions rename symbols regularly (ZOMATO -> ETERNAL,
LTIM -> LTM, TATAMOTORS -> TMPV). A renamed ticker does not error: the price
feed simply returns null, the daily engine skips the stock, and the universe
silently shrinks. That is invisible until someone counts.

Run this after any demerger/rename news, or on a schedule:

    cd backend && python scripts/audit_tickers.py              # signal universe
    cd backend && python scripts/audit_tickers.py --catalog    # + frontend catalog

Exits non-zero when anything is dead, so CI can gate on it.
"""

from __future__ import annotations

import argparse
import re
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.services.daily_signal_engine.config import NSE_UNIVERSE, US_UNIVERSE  # noqa: E402
from app.services.data_service import get_latest_quote  # noqa: E402

CATALOG = Path(__file__).resolve().parents[2] / "frontend" / "app" / "stocks.ts"
ENTRY = re.compile(
    r"\{\s*name:\s*'([^']+)',\s*symbol:\s*'([^']+)',\s*exchange:\s*'([^']+)',\s*ticker:\s*'([^']+)'"
)


def catalog_tickers() -> list[tuple[str, str]]:
    """(ticker, name) pairs from the frontend catalog, deduped, NSE/BSE only."""
    if not CATALOG.exists():
        print(f"[audit] catalog not found at {CATALOG}")
        return []
    text = CATALOG.read_text(encoding="utf-8")
    seen: set[str] = set()
    out: list[tuple[str, str]] = []
    for name, _symbol, exchange, ticker in ENTRY.findall(text):
        if exchange == "CRYPTO" or ticker in seen:
            continue
        seen.add(ticker)
        out.append((ticker, name))
    return out


def check(ticker: str) -> bool:
    """True when the feed returns a usable price."""
    try:
        quote = get_latest_quote(ticker) or {}
    except Exception:
        return False
    price = quote.get("price")
    return isinstance(price, (int, float)) and price > 0


def audit(label: str, entries: list[tuple[str, str]], workers: int = 12) -> list[tuple[str, str]]:
    if not entries:
        return []
    with ThreadPoolExecutor(max_workers=workers) as pool:
        ok = list(pool.map(lambda item: check(item[0]), entries))
    dead = [entry for entry, alive in zip(entries, ok) if not alive]
    print(f"\n{label}: {len(entries)} checked, {len(dead)} dead")
    for ticker, name in dead:
        print(f"  DEAD  {ticker:<16} {name}")
    return dead


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--catalog", action="store_true", help="also audit the frontend catalog (slow, ~2,600 tickers)")
    parser.add_argument("--workers", type=int, default=12)
    args = parser.parse_args()

    dead = audit("Signal universe (NSE)", [(t, "") for t in NSE_UNIVERSE], args.workers)
    dead += audit("Signal universe (US)", [(t, "") for t in US_UNIVERSE], args.workers)
    if args.catalog:
        dead += audit("Frontend catalog", catalog_tickers(), args.workers)

    if dead:
        print(
            f"\n{len(dead)} ticker(s) no longer resolve. Look each one up — a rename needs "
            "updating in frontend/app/stocks.ts AND daily_signal_engine/config.py "
            "(NSE_UNIVERSE + SECTOR_BY_SYMBOL). See docs/CORPORATE_ACTIONS.md."
        )
        return 1
    print("\nAll tickers resolve.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
