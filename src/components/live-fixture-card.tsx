'use client';

import Image from 'next/image';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { calculatePoints } from '@/lib/scoring/engine';
import { REASON_LABELS } from '@/lib/scoring/explanations';
import type { Tables } from '@/lib/database.types';

type Fixture = Tables<'fixtures'>;

interface Prediction {
  home_score: number;
  away_score: number;
}

interface LiveFixtureCardProps {
  fixture: Fixture;
  prediction?: Prediction | null;
}

export function LiveFixtureCard({ fixture, prediction }: LiveFixtureCardProps) {
  const isLive =
    fixture.status === 'IN_PLAY' || fixture.status === 'PAUSED';
  const minuteDisplay = fixture.match_minute
    ? `${fixture.match_minute}'`
    : fixture.status === 'PAUSED'
      ? 'HT'
      : '';

  const provisionalResult =
    prediction && fixture.home_score != null && fixture.away_score != null
      ? calculatePoints(
          { homeScore: prediction.home_score, awayScore: prediction.away_score },
          { homeScore: fixture.home_score, awayScore: fixture.away_score },
          fixture.is_star_game,
        )
      : null;

  return (
    <Card
      variant={fixture.is_star_game ? 'gold' : 'default'}
      className={cn(
        'relative overflow-hidden',
        isLive && 'border-l-2 border-l-live',
        fixture.is_star_game && !isLive && 'border-l-2 border-l-gold',
      )}
    >
      {/* Status row */}
      <div className="mb-3 flex items-center gap-2">
        {fixture.is_star_game && <Badge variant="star">Star Game</Badge>}
        {isLive && <Badge variant="live">{minuteDisplay || 'LIVE'}</Badge>}
        {fixture.status === 'SUSPENDED' && <Badge variant="locked">Suspended</Badge>}
        {fixture.status === 'FINISHED' && <Badge variant="success">Full Time</Badge>}
      </div>

      {/* Teams and live score */}
      <div className="flex items-center justify-between gap-3 py-2">
        {/* Home team */}
        <div className="flex flex-1 items-center gap-3 min-w-0">
          {fixture.home_team_crest && (
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-elevated">
              <Image
                src={fixture.home_team_crest}
                alt=""
                width={24}
                height={24}
                className="h-6 w-6 object-contain"
              />
            </div>
          )}
          <span className="truncate text-body font-semibold text-text-primary">
            {fixture.home_team}
          </span>
        </div>

        {/* Live score */}
        <div className="flex items-center gap-2 text-center tabular-nums">
          <span className="min-w-[28px] text-h2 font-extrabold text-text-primary">
            {fixture.home_score ?? 0}
          </span>
          <span className="text-text-tertiary text-body">-</span>
          <span className="min-w-[28px] text-h2 font-extrabold text-text-primary">
            {fixture.away_score ?? 0}
          </span>
        </div>

        {/* Away team */}
        <div className="flex flex-1 items-center justify-end gap-3 min-w-0">
          <span className="truncate text-body font-semibold text-text-primary">
            {fixture.away_team}
          </span>
          {fixture.away_team_crest && (
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-elevated">
              <Image
                src={fixture.away_team_crest}
                alt=""
                width={24}
                height={24}
                className="h-6 w-6 object-contain"
              />
            </div>
          )}
        </div>
      </div>

      {/* Prediction + provisional points */}
      {prediction && (
        <div className="mt-3 border-t border-border-subtle pt-3">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-body-sm text-text-secondary">Your prediction: </span>
              <span className="text-body font-bold tabular-nums text-text-primary">
                {prediction.home_score} - {prediction.away_score}
              </span>
            </div>
            {provisionalResult && (
              <Badge variant={provisionalResult.points > 0 ? 'points' : 'default'}>
                +{provisionalResult.points} pts
                {provisionalResult.points > 0 && (
                  <span className="ml-1 text-[10px] opacity-75">
                    {REASON_LABELS[provisionalResult.reasonCode] ??
                      provisionalResult.reasonCode}
                  </span>
                )}
              </Badge>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
