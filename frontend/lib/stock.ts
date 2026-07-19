// Market/stock helpers extracted verbatim from app/page.tsx during the Phase A
// foundation refactor. Pure — no React. Owns the MarketScope type now.

import { STOCKS } from '@/app/stocks';
import { formatIndianNumber } from './format';

export type MarketScope = 'INDIA' | 'US';

export function resolveMarket(exchange: string): MarketScope {
  return exchange === 'NASDAQ' || exchange === 'NYSE' ? 'US' : 'INDIA';
}

export function isIndianStock(stock?: typeof STOCKS[number] | null) {
  return !!stock && resolveMarket(stock.exchange) === 'INDIA';
}

export function canShowDetailedAnalysis(stock?: typeof STOCKS[number] | null) {
  return !!stock && (resolveMarket(stock.exchange) === 'INDIA' || resolveMarket(stock.exchange) === 'US');
}

export function formatFaceValue(stock?: typeof STOCKS[number] | null, fallback?: any) {
  const value = Number(fallback ?? stock?.faceValue);
  if (!Number.isFinite(value)) return '-';
  const currency = stock?.currency ?? '';
  return `${currency}${formatIndianNumber(value, value < 1 ? 4 : 2)}`;
}
