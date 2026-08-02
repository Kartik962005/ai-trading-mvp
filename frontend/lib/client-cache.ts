// Shared client-side API fetcher + localStorage cache.
// Extracted verbatim from app/page.tsx during the Phase A foundation refactor
// (see REDESIGN_3D_MASTERPLAN.md). Pure browser utilities — no React.

export const BACKEND = '/api/backend';

export const fetcher = async (url: string) => {
  const response = await fetch(`${BACKEND}${url}`);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.detail || data?.error || `Request failed: ${response.status}`);
  }
  return data;
};

const CACHE_TTL = 1000 * 60 * 60 * 6;

// Per-key freshness. A live quote and a fundamentals snapshot must NOT share a
// TTL: serving a six-hour-old price made the app show stale prices on load
// (and any signal computed from them is wrong). Prices expire in a minute;
// slow-moving data keeps the long TTL.
const TTL_RULES: Array<[RegExp, number]> = [
  [/^quote:/, 1000 * 60],
  [/^index-quotes$/, 1000 * 60],
  [/^market-quotes:/, 1000 * 60],
  [/^chart:/, 1000 * 60 * 10],
  [/^analysis:/, 1000 * 60 * 30],
  [/^fundamentals:/, 1000 * 60 * 60 * 6],
];

export function cacheTtlFor(key: string): number {
  for (const [pattern, ttl] of TTL_RULES) {
    if (pattern.test(key)) return ttl;
  }
  return CACHE_TTL;
}

export function getCache<T>(key: string): T | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw);
    if (!parsed?.ts || Date.now() - parsed.ts > cacheTtlFor(key)) return undefined;
    if (parsed.data?.error || parsed.data?.detail) return undefined;
    if (
      parsed.data &&
      typeof parsed.data === 'object' &&
      !Array.isArray(parsed.data) &&
      Object.keys(parsed.data).length === 0
    ) {
      return undefined;
    }
    return parsed.data;
  } catch {
    return undefined;
  }
}

export function setCache(key: string, data: any) {
  if (typeof window === 'undefined' || !data || data.error || data.detail) return;
  if (typeof data === 'object' && !Array.isArray(data) && Object.keys(data).length === 0) return;
  try {
    window.localStorage.setItem(key, JSON.stringify({ data, ts: Date.now() }));
  } catch {}
}
