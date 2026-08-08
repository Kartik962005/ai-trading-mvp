# Handling renames, demergers and delistings

Indian listed companies change trading symbols often. When they do, **nothing in
this app breaks loudly** — the price feed returns `null`, the daily engine skips
the ticker, and the universe silently shrinks. In August 2026 an audit found
three dead tickers that had been quietly excluded for months:

| Was | Became | Effective | Silently broken for |
| --- | --- | --- | --- |
| `ZOMATO` | `ETERNAL` (renamed Eternal Ltd) | 9 Apr 2025 | ~16 months |
| `TATAMOTORS` | `TMPV` (PV+JLR); `TMCV` spun off | Oct / Nov 2025 | ~10 months |
| `LTIM` | `LTM` (LTIMindtree brand change) | 27 Feb 2026 | ~5 months |

The signal universe was running at 77 of 80 stocks without anyone noticing.

## Detecting it

```bash
cd backend && python scripts/audit_tickers.py
```

Checks every ticker in the signal universe and reports any that return no price.
Add `--catalog` to sweep the full ~2,600-name frontend catalog too (slower).
Exits non-zero when something is dead, so it can gate CI.

Run it after demerger or rebranding news, and periodically regardless.

## Fixing it

Two kinds of corporate action, handled differently:

### A rename (one company, new symbol)

`ZOMATO -> ETERNAL`, `LTIM -> LTM`. Replace the symbol everywhere:

1. `frontend/app/stocks.ts` — the NSE entry *and* the BSE entry
2. `backend/app/services/daily_signal_engine/config.py` — `NSE_UNIVERSE` and
   `SECTOR_BY_SYMBOL`
3. `FACE_VALUE_OVERRIDES` in `stocks.ts`, if the old ticker had an entry

### A demerger (one company becomes several)

Check first **whether the parent survives** — this is the easy mistake:

- **Vedanta (15 Jun 2026)** — `VEDL` *continues* trading as the residual
  flagship (critical minerals, Hindustan Zinc), and four carve-outs listed
  alongside it: `VAML`, `VOGL`, `VEDPOWER`, `VISL`. Shareholders got one share
  of each per `VEDL` share. **Keep the parent, add the children.**
- **Tata Motors (Oct/Nov 2025)** — the parent did *not* survive under its old
  symbol. `TATAMOTORS` was renamed `TMPV`, and `TMCV` was spun off separately.
  **Replace the parent, add the sibling.**

Then apply the rename steps above for whatever changed.

## Verifying

Never trust a ticker from a news article — confirm it against the feed the app
actually uses:

```bash
curl "http://127.0.0.1:8000/api/v1/quotes/batch?tickers=TMPV.NS,TMCV.NS,VAML.NS"
```

A real price means the symbol is right. `"price": null` means it is not, whatever
the article said. Re-run `audit_tickers.py` afterwards to confirm the universe is
whole again.

## A caveat on history

Renamed tickers usually carry their price history across, but a demerged entity
starts with only post-listing bars. The signal engine needs
`MIN_SIGNAL_HISTORY_DAYS` (default 140) of history, so a freshly demerged stock
is legitimately skipped until it has enough. That is correct behaviour, not a
bug — do not lower the threshold to force it in.
