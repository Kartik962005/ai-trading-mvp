import type { ScreenMetricRow } from './screen-data';

const BACKEND = '/api/backend';

export async function enrichScreenRows(rows: ScreenMetricRow[]) {
  if (!rows.length) return rows;
  try {
    const response = await fetch(`${BACKEND}/api/v1/screener/enrich`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows }),
    });
    if (!response.ok) return rows;
    const data = await response.json();
    return Array.isArray(data.rows) && data.rows.length ? data.rows as ScreenMetricRow[] : rows;
  } catch {
    return rows;
  }
}
