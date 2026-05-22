import { NextRequest, NextResponse } from 'next/server';

const BACKEND =
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  process.env.BACKEND_URL ||
  'http://127.0.0.1:8000';

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const prompt = String(body.prompt ?? '').trim();
  const currentTicker = String(body.current_ticker ?? body.ticker ?? '').trim();

  if (!prompt || !currentTicker) {
    return NextResponse.json({ error: 'Prompt and ticker are required' }, { status: 400 });
  }

  const response = await fetch(`${BACKEND}/api/v1/stock-ai/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt,
      current_ticker: currentTicker,
      stocks: body.stocks ?? [],
    }),
  });

  const data = await response.json().catch(() => ({}));
  return NextResponse.json(data, { status: response.status });
}
