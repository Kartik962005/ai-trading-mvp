"""Throwaway verification: cold-cache concurrent movers scan persists every
ticker without [WinError 10035]. Drives the REAL get_historical_data write path
at the same concurrency the movers snapshot uses.
"""
import io
import sys
import contextlib
from concurrent.futures import ThreadPoolExecutor, as_completed

from _movers_e2e import load_catalog
from app.services import data_service
from app.services.data_service import get_historical_data
from app.services.ask_ai_service import _MOVERS_WORKERS

# ~30 real NSE tickers straight from the frontend catalog.
nse = [s["ticker"] for s in load_catalog() if s["exchange"] == "NSE"][:30]

# Force a genuine COLD cache so the concurrent write path runs for every ticker:
# empty the RAM cache and treat any DB rows as stale so each ticker refreshes
# from Yahoo and re-saves. Runtime test override only -- source logic untouched.
data_service._hist_cache.clear()
data_service.CACHE_MAX_MISSING_SESSIONS = -1

print(f"Scanning {len(nse)} NSE tickers at max_workers={_MOVERS_WORKERS} (cold cache)\n")


def _one(t):
    try:
        df = get_historical_data(t, days=120)
        return t, (df is not None and len(df) > 0)
    except Exception as e:  # noqa: BLE001
        return t, f"EXC: {e}"


buf = io.StringIO()
results = {}
with contextlib.redirect_stdout(buf):
    with ThreadPoolExecutor(max_workers=_MOVERS_WORKERS) as ex:
        futs = [ex.submit(_one, t) for t in nse]
        for f in as_completed(futs):
            t, ok = f.result()
            results[t] = ok

logs = buf.getvalue()
saved = logs.count("Saved")
save_failed = logs.count("Supabase save failed")
winerr = logs.count("WinError 10035")
retries = logs.count("upsert retry")

print(logs)
print("=" * 60)
print(f"tickers scanned        : {len(nse)}")
print(f"'Saved ... to Supabase': {saved}")
print(f"save-failed lines      : {save_failed}")
print(f"WinError 10035 count   : {winerr}")
print(f"retry attempts logged  : {retries}")
fetch_ok = sum(1 for v in results.values() if v is True)
print(f"tickers with data      : {fetch_ok}/{len(nse)}")
print("=" * 60)
ok = (winerr == 0 and save_failed == 0 and saved >= fetch_ok and fetch_ok > 0)
print("RESULT:", "PASS" if ok else "FAIL")
sys.exit(0 if ok else 1)
