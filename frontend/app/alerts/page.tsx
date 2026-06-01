'use client';

// The standalone "AI Strategy Alerts" page has been merged into Ask-AI.
// Users now type a strategy directly in the Ask-AI chat, see the backtest, and
// tap "Save as daily alert" there. This route just forwards to /ask-ai so any
// old bookmarks keep working.

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function AlertsRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/ask-ai');
  }, [router]);
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-600">
      <p className="text-sm font-semibold">
        Strategy alerts moved into Ask AI — taking you there…
      </p>
    </div>
  );
}
