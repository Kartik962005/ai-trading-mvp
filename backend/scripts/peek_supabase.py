"""Read-only peek at what's stored in Supabase. Run: python scripts/peek_supabase.py"""
import os
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

url = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
key = (
    os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    or os.getenv("SUPABASE_KEY")
    or os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY")
)
sb = create_client(url, key)

TABLES = ["stock_prices", "user_alerts", "alert_events"]

for table in TABLES:
    print("\n" + "=" * 60)
    print(f"TABLE: {table}")
    print("=" * 60)
    try:
        # total row count
        cnt = sb.table(table).select("*", count="exact").limit(1).execute()
        print(f"Total rows: {cnt.count}")

        # sample rows
        sample = sb.table(table).select("*").limit(5).execute()
        rows = sample.data or []
        if not rows:
            print("(no rows)")
            continue
        print(f"Columns: {list(rows[0].keys())}")
        print("First few rows:")
        for r in rows:
            print("  ", r)

        # for stock_prices, show distinct tickers
        if table == "stock_prices":
            tk = sb.table(table).select("ticker").limit(2000).execute()
            tickers = sorted({r["ticker"] for r in (tk.data or [])})
            print(f"\nDistinct tickers stored ({len(tickers)}): {tickers}")
    except Exception as e:
        print(f"Could not read '{table}': {e}")
