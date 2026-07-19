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

export function getCache<T>(key: string): T | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw);
    if (!parsed?.ts || Date.now() - parsed.ts > CACHE_TTL) return undefined;
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
