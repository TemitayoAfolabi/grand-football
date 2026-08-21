'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

const REFRESH_INTERVAL_MS = 30_000;

/** Keeps the server-rendered Matchday Drama data in step with live fixtures. */
export function MatchdayLiveRefresh() {
  const router = useRouter();

  useEffect(() => {
    const refresh = () => {
      if (!document.hidden) router.refresh();
    };
    const interval = window.setInterval(refresh, REFRESH_INTERVAL_MS);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [router]);

  return null;
}
