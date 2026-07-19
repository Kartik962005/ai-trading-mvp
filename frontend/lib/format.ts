// Pure number/label formatters extracted verbatim from app/page.tsx during the
// Phase A foundation refactor. No React, no page-local types.

export function formatIndianNumber(value: any, digits = 2) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '-';
  return new Intl.NumberFormat('en-IN', {
    maximumFractionDigits: digits,
    minimumFractionDigits: numeric % 1 === 0 ? 0 : Math.min(digits, 2),
  }).format(numeric);
}

export function formatCurrencyNumber(value: any, currencySymbol: string, digits = 2) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '-';
  return `${currencySymbol}${formatIndianNumber(numeric, digits)}`;
}

export function formatCompactRupees(value: any) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '-';
  const absolute = Math.abs(numeric);
  if (absolute >= 10000000) return `${(numeric / 10000000).toFixed(2)} Cr`;
  if (absolute >= 100000) return `${(numeric / 100000).toFixed(2)} L`;
  return formatIndianNumber(numeric, 2);
}

export function formatMarketCap(value: any, unit?: string, currencySymbol = '₹') {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '-';
  if (unit === 'crore') return `${currencySymbol}${formatIndianNumber(numeric, 2)} Cr`;
  return `${currencySymbol}${formatCompactRupees(numeric)}`;
}

export function formatRatioValue(value: any, kind?: string) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '-';
  if (kind === 'percent') return `${numeric.toFixed(2)}%`;
  return formatIndianNumber(numeric, 2);
}

export function humanizeLabel(label: string) {
  return label
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function getLevenshteinDistance(s: string, t: string) {
  if (!s.length) return t.length;
  if (!t.length) return s.length;
  const arr: number[][] = [];
  for (let i = 0; i <= t.length; i++) {
    arr[i] = [i];
    for (let j = 1; j <= s.length; j++) {
      arr[i][j] = i === 0
        ? j
        : Math.min(
            arr[i - 1][j] + 1,
            arr[i][j - 1] + 1,
            arr[i - 1][j - 1] + (s[j - 1] === t[i - 1] ? 0 : 1)
          );
    }
  }
  return arr[t.length][s.length];
}
