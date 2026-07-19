// News/headline helpers extracted verbatim from app/page.tsx during the Phase A
// foundation refactor. Pure — no React, no side effects.

export type NewsStory = {
  title: string;
  source?: string;
  url?: string | null;
};

export function isEnglishNewsTitle(title: string) {
  const normalized = title.normalize('NFKD');
  const letters = normalized.match(/\p{L}/gu) ?? [];
  if (!letters.length) return true;
  const englishLetters = normalized.match(/[A-Za-z]/g) ?? [];
  return englishLetters.length / letters.length >= 0.85;
}

export function splitNewsHeadline(headline: string) {
  const parts = String(headline).split(/\s(?:—|â€”)\s/);
  return {
    title: parts[0]?.trim() || String(headline),
    source: parts.slice(1).join(' - ').trim(),
  };
}

export function storyFromHeadline(headline: string): NewsStory {
  const { title, source } = splitNewsHeadline(headline);
  return { title, source };
}

export function buildMarketNewsRead(title: string) {
  const lower = title.toLowerCase();
  if (/\b(rate|inflation|fed|rbi|bond|yield|oil|dollar)\b/.test(lower)) {
    return 'Macro driver that can affect risk appetite and market breadth.';
  }
  if (/\b(earnings|profit|results|revenue|guidance)\b/.test(lower)) {
    return 'Earnings flow that can shift sector leadership and stock selection.';
  }
  if (/\b(nifty|sensex|nasdaq|s&p|dow|market)\b/.test(lower)) {
    return 'Broad index context to compare against individual stock setups.';
  }
  return 'Market context item to review before acting on individual signals.';
}
