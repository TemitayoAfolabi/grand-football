'use client';

import dynamic from 'next/dynamic';

export const LazyLiveMatches = dynamic(
  () => import('@/components/live-matches-section').then((module) => module.LiveMatchesSection),
  { ssr: false },
);
