import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const prompt = String(body.prompt ?? '').trim();
  const ticker = String(body.ticker ?? 'this stock');
  const context = body.context ?? {};

  if (!prompt) {
    return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({
      title: 'AI chat needs a model key',
      answer: `I can answer loaded market-data questions for ${ticker} right now. For open-ended world-level chat, add OPENAI_API_KEY to the frontend environment and restart the dev server.`,
      rows: [
        ['Loaded ticker', ticker],
        ['Latest close', context.latestClose ?? '-'],
        ['Mode', 'Local market assistant'],
      ],
    });
  }

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
      input: [
        {
          role: 'system',
          content:
            'You are Bullseye AI, a concise market assistant inside a stock analysis website. Answer clearly, use the supplied stock context when relevant, and say when something is educational rather than financial advice. If the user asks for a strategy, describe the logic and limitations.',
        },
        {
          role: 'user',
          content: JSON.stringify({ prompt, ticker, context }),
        },
      ],
      max_output_tokens: 600,
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    return NextResponse.json({ error: detail || 'AI model request failed' }, { status: 502 });
  }

  const data = await response.json();
  const outputItems = Array.isArray(data.output) ? data.output : [];
  const text =
    data.output_text ??
    outputItems
      .flatMap((item: { content?: Array<{ text?: string }> }) => item.content ?? [])
      .map((content: { text?: string }) => content.text ?? '')
      .join('\n')
      .trim();

  return NextResponse.json({
    title: 'Bullseye AI answer',
    answer: text || 'I could not generate an answer for that prompt.',
    rows: [
      ['Ticker', ticker],
      ['Latest close', context.latestClose ?? '-'],
      ['Source', 'AI model'],
    ],
  });
}
