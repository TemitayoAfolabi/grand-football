import Image from 'next/image';
import Link from 'next/link';
import { Lock, Clock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Countdown } from '@/components/countdown';
import { cn, formatKickoffRelative } from '@/lib/utils';
import { REASON_LABELS } from '@/lib/scoring/explanations';
import type { ReasonCode } from '@/lib/scoring/types';

interface FixtureCardProps {
  fixture: {
    id: string;
    home_team: string;
    away_team: string;
    home_team_crest: string | null;
    away_team_crest: string | null;
    kickoff_time: string;
    status: string;
    home_score: number | null;
    away_score: number | null;
    is_star_game: boolean;
    gameweek: number;
  };
  prediction?: {
    home_score: number;
    away_score: number;
  } | null;
  scoreRecord?: {
    points_awarded: number;
    reason_code: string;
  } | null;
  showPrediction?: boolean;
  children?: React.ReactNode;
}

export function FixtureCard({
  fixture,
  prediction,
  scoreRecord,
  showPrediction = true,
  children,
}: FixtureCardProps) {
  const isFinished = fixture.status === 'FINISHED';
  const isLive = fixture.status === 'IN_PLAY' || fixture.status === 'PAUSED';
  const kickedOff = new Date(fixture.kickoff_time) <= new Date();
  const cardVariant = fixture.is_star_game ? 'gold' : 'default';

  return (
    <Card
      variant={cardVariant}
      className={cn(
        'relative overflow-hidden',
        isLive && 'border-l-2 border-l-live',
        fixture.is_star_game && 'border-l-2 border-l-gold',
      )}
    >
      {/* Status row */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {fixture.is_star_game && <Badge variant="star">Star Game</Badge>}
        {isLive && <Badge variant="live">Live</Badge>}
        {kickedOff && !isFinished && !isLive && (
          <Badge variant="locked">
            <Lock className="h-3 w-3" /> Locked
          </Badge>
        )}
        {isFinished && <Badge variant="success">Full Time</Badge>}
        {!kickedOff && (
          <div className="ml-auto flex items-center gap-1 text-text-tertiary">
            <Clock className="h-3 w-3" aria-hidden="true" />
            <Countdown targetDate={fixture.kickoff_time} />
          </div>
        )}
      </div>

      {/* Teams and score */}
      <Link
        href={`/match/${fixture.id}`}
        className="block rounded-input focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
      >
        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 py-2 tablet:gap-3">
          {/* Home team */}
          <div className="flex min-w-0 items-center gap-2 tablet:gap-3">
            {fixture.home_team_crest && (
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-elevated tablet:h-10 tablet:w-10">
                <Image
                  src={fixture.home_team_crest}
                  alt=""
                  width={24}
                  height={24}
                  className="h-6 w-6 object-contain tablet:h-7 tablet:w-7"
                />
              </div>
            )}
            <span className="truncate text-body-sm font-semibold text-text-primary tablet:text-body">
              {fixture.home_team}
            </span>
          </div>

          {/* Score / Time */}
          <div className="flex min-w-[76px] items-center justify-center gap-1.5 text-center tabular-nums tablet:min-w-[96px] tablet:gap-2">
            {isFinished || isLive ? (
              <>
                <span className="min-w-[24px] text-h3 font-extrabold text-text-primary tablet:min-w-[28px] tablet:text-h2">
                  {fixture.home_score}
                </span>
                <span className="text-body text-text-tertiary">-</span>
                <span className="min-w-[24px] text-h3 font-extrabold text-text-primary tablet:min-w-[28px] tablet:text-h2">
                  {fixture.away_score}
                </span>
              </>
            ) : (
              <span className="text-center text-caption text-text-secondary tablet:text-body-sm">
                {formatKickoffRelative(fixture.kickoff_time)}
              </span>
            )}
          </div>

          {/* Away team */}
          <div className="flex min-w-0 items-center justify-end gap-2 tablet:gap-3">
            <span className="truncate text-right text-body-sm font-semibold text-text-primary tablet:text-body">
              {fixture.away_team}
            </span>
            {fixture.away_team_crest && (
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-elevated tablet:h-10 tablet:w-10">
                <Image
                  src={fixture.away_team_crest}
                  alt=""
                  width={24}
                  height={24}
                  className="h-6 w-6 object-contain tablet:h-7 tablet:w-7"
                />
              </div>
            )}
          </div>
        </div>
      </Link>

      {/* Prediction display */}
      {showPrediction && prediction && (
        <div className="mt-3 border-t border-border-subtle pt-3">
          <div className="flex items-center justify-between">
            <span className="text-body-sm text-text-secondary">Your prediction</span>
            <span className="text-body font-bold tabular-nums text-text-primary">
              {prediction.home_score} - {prediction.away_score}
            </span>
          </div>
        </div>
      )}

      {/* Score record */}
      {scoreRecord && (
        <div className="mt-3 border-t border-border-subtle pt-3">
          <div className="flex items-center justify-between">
            <span className="text-body-sm text-text-secondary">
              {REASON_LABELS[scoreRecord.reason_code as ReasonCode] ?? scoreRecord.reason_code}
            </span>
            <Badge variant="points">+{scoreRecord.points_awarded} pts</Badge>
          </div>
        </div>
      )}

      {/* Inline form (children) */}
      {children}
    </Card>
  );
}
