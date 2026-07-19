# Frontend performance baseline

Captured 2026-07-13, before the Phase A foundation refactor
(see `../../REDESIGN_3D_MASTERPLAN.md`). Every later phase is graded against this.

## Code size
- `app/page.tsx`: **5,235 lines** (the monolith — homepage + stock modal + news +
  nav + ticker + auth/daily-signal modals + all data hooks + two themes).
  Target after Phase A: **< 800 lines** (thin composition).

## Client JS shipped (production build, `.next/static/chunks`, uncompressed)
- **Total: ~2.0 MB** across all chunks.
- Largest chunks:
  | Size | note |
  |---|---|
  | 315 KB | (framework / vendor) |
  | 268 KB | |
  | 224 KB | |
  | 222 KB | |
  | 160 KB | |
  | 138 KB | |
  | 110 KB | |

  (Turbopack hashes chunk names, so per-route attribution needs
  `@next/bundle-analyzer` — add in A1 if we want the treemap. Tracking the total +
  top chunks is enough to see the trend.)

## Lighthouse
- TODO: run once the in-app preview / a headless Chrome is available
  (desktop + mobile). Record Performance / LCP / TBT here.

## How to re-measure (repeat after each phase)
```
cd frontend
rm -rf .next && npm run build
du -sh .next/static/chunks
find .next/static/chunks -name '*.js' -printf '%s %p\n' | sort -rn | head -12
wc -l app/page.tsx
```
