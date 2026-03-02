'use client';

import { useLiveFixtures } from '@/hooks/use-live-fixtures';
import { LiveFixtureCard } from '@/components/live-fixture-card';
import { Badge } from '@/components/ui/badge';
import { CardHeader, CardTitle } from '@/components/ui/card';
import { Radio, Wifi, WifiOff } from 'lucide-react';
import type { Tables } from '@/lib/database.types';

type Fixture = Tables<'fixtures'>;

interface Prediction {
  fixture_id: string;
  home_score: number;
  away_score: number;
}

interface LiveMatchesSectionProps {
  gameweek: number;
  initialFixtures: Fixture[];
  predictions: Prediction[];
}

export function LiveMatchesSection({
  gameweek,
  initialFixtures,
  predictions,
}: LiveMatchesSectionProps) {
  const { fixtures, isConnected } = useLiveFixtures(gameweek);

  // Use realtime fixtures, fall back to initial server-rendered data
  const liveFixtures = (
    fixtures.length > 0 ? fixtures : initialFixtures
  ).filter((f) => f.status === 'IN_PLAY' || f.status === 'PAUSED' || f.status === 'SUSPENDED');

  if (liveFixtures.length === 0) return null;

  const predMap = new Map(predictions.map((p) => [p.fixture_id, p]));

  return (
    <section aria-label="Live matches">
      <CardHeader>
        <CardTitle>
          <div className="flex items-center gap-2">
            <Radio className="h-4 w-4 text-live" aria-hidden="true" />
            Live Matches
            <Badge variant="live">{liveFixtures.length}</Badge>
          </div>
        </CardTitle>
        {isConnected ? (
          <Wifi
            className="h-4 w-4 text-success"
            aria-label="Live updates active"
          />
        ) : (
          <WifiOff
            className="h-4 w-4 text-text-tertiary"
            aria-label="Using polling fallback"
          />
        )}
      </CardHeader>
      <div className="space-y-3">
        {liveFixtures.map((fixture, i) => (
          <div
            key={fixture.id}
            className="animate-fade-in-up opacity-0"
            style={{ animationDelay: `${i * 50}ms` }}
          >
            <LiveFixtureCard
              fixture={fixture}
              prediction={predMap.get(fixture.id) ?? null}
            />
          </div>
        ))}
      </div>
    </section>
  );
}
