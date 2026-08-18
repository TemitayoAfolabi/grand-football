import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScoreDisplay } from '@/components/score-display';
import { GlowDivider } from '@/components/glow-divider';
import { REASON_EXPLANATIONS, REASON_LABELS } from '@/lib/scoring/explanations';
import { formatKickoffTime } from '@/lib/date-utils';
import { Star, ChevronLeft, Target, Eye, Zap, X } from 'lucide-react';
import type { ReasonCode } from '@/lib/scoring/types';
import Link from 'next/link';

interface MatchDetailProps {
  params: { fixtureId: string };
}

export async function generateMetadata({ params }: MatchDetailProps) {
  const supabase = createClient();
  const { data: fixture } = await supabase
    .from('fixtures')
    .select('home_team, away_team')
    .eq('id', params.fixtureId)
    .single();

  if (!fixture) return { title: 'Match' };
  return { title: `${fixture.home_team} vs ${fixture.away_team}` };
}

const reasonIcons: Record<string, typeof Target> = {
  EXACT: Target,
  OUTCOME: Eye,
  CORRECT_TEAM_GOALS: Zap,
  WRONG: X,
};

export default async function MatchDetailPage({ params }: MatchDetailProps) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: fixture } = await supabase
    .from('fixtures')
    .select('*')
    .eq('id', params.fixtureId)
    .single();

  if (!fixture) notFound();

  const { data: prediction } = await supabase
    .from('predictions')
    .select('*')
    .eq('user_id', user!.id)
    .eq('fixture_id', fixture.id)
    .maybeSingle();

  const { data: scoreRecord } = await supabase
    .from('score_records')
    .select('*')
    .eq('user_id', user!.id)
    .eq('fixture_id', fixture.id)
    .maybeSingle();

  const ReasonIcon = scoreRecord ? (reasonIcons[scoreRecord.reason_code] ?? Target) : Target;

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link
        href="/fixtures"
        className="inline-flex items-center gap-1 text-body-sm text-text-secondary transition-colors hover:text-accent"
      >
        <ChevronLeft className="h-4 w-4" />
        Fixtures
      </Link>

      {/* Header */}
      <div>
        <div className="flex items-start gap-2">
          {fixture.is_star_game && <Star className="h-5 w-5 text-gold" aria-label="Star Game" />}
          <h1 className="text-h1 text-text-primary">
            {fixture.home_team} vs {fixture.away_team}
          </h1>
        </div>
        <p className="mt-1 text-body-sm text-text-secondary">
          {formatKickoffTime(fixture.kickoff_time)}
        </p>
      </div>

      {/* Status badges */}
      <div className="flex gap-2">
        {fixture.is_star_game && <Badge variant="star">Star Game</Badge>}
        {fixture.status === 'FINISHED' && <Badge variant="success">Full Time</Badge>}
        {(fixture.status === 'IN_PLAY' || fixture.status === 'PAUSED') && (
          <Badge variant="live">Live</Badge>
        )}
      </div>

      {/* Final Score */}
      {fixture.status === 'FINISHED' &&
        fixture.home_score !== null &&
        fixture.away_score !== null && (
          <Card variant="elevated" className="py-6">
            <h2 className="mb-4 text-center text-stat-label uppercase tracking-normal text-text-secondary">
              Final Score
            </h2>
            <ScoreDisplay
              homeTeam={fixture.home_team}
              awayTeam={fixture.away_team}
              homeScore={fixture.home_score}
              awayScore={fixture.away_score}
              large
            />
          </Card>
        )}

      <GlowDivider />

      {/* Prediction */}
      <Card>
        <h2 className="mb-4 text-stat-label uppercase tracking-normal text-text-secondary">
          Your Prediction
        </h2>
        {prediction ? (
          <ScoreDisplay
            homeTeam={fixture.home_team}
            awayTeam={fixture.away_team}
            homeScore={prediction.home_score}
            awayScore={prediction.away_score}
          />
        ) : (
          <p className="text-center text-body-sm text-text-disabled">No prediction submitted</p>
        )}
      </Card>

      {/* Points */}
      {scoreRecord && (
        <Card variant="accent">
          <h2 className="mb-4 text-stat-label uppercase tracking-normal text-text-secondary">
            Points Awarded
          </h2>
          <div className="flex flex-col gap-4 tablet:flex-row tablet:items-center tablet:justify-between">
            <div className="flex items-center gap-3">
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-full ${
                  scoreRecord.points_awarded > 0 ? 'bg-accent-muted' : 'bg-surface-elevated'
                }`}
              >
                <ReasonIcon
                  className={`h-5 w-5 ${
                    scoreRecord.points_awarded > 0 ? 'text-accent' : 'text-text-tertiary'
                  }`}
                  aria-hidden="true"
                />
              </div>
              <div>
                <Badge variant={scoreRecord.points_awarded > 0 ? 'success' : 'default'}>
                  {REASON_LABELS[scoreRecord.reason_code as ReasonCode] ?? scoreRecord.reason_code}
                </Badge>
              </div>
            </div>
            <span className="animate-count-up text-display font-extrabold tabular-nums text-accent">
              +{scoreRecord.points_awarded}
            </span>
          </div>
          <p className="mt-4 text-body-sm text-text-secondary">
            {REASON_EXPLANATIONS[scoreRecord.reason_code as ReasonCode] ?? 'Score calculated.'}
          </p>
          {fixture.is_star_game && scoreRecord.points_awarded > 0 && (
            <div className="mt-3 flex items-center gap-2 rounded-input bg-gold-muted p-3">
              <Star className="h-4 w-4 text-gold" aria-hidden="true" />
              <span className="text-body-sm text-gold">Star Game — points doubled!</span>
            </div>
          )}
        </Card>
      )}

      <GlowDivider />

      {/* Scoring rules */}
      <Card>
        <h2 className="mb-4 text-stat-label uppercase tracking-normal text-text-secondary">
          Scoring Rules
        </h2>
        <ul className="space-y-3">
          {[
            {
              label: 'Exact Score',
              points: fixture.is_star_game ? '10' : '5',
              icon: Target,
              color: 'text-success',
            },
            { label: 'Correct Outcome', points: '3', icon: Eye, color: 'text-info' },
            { label: 'BTTS Reverse', points: '1', icon: Zap, color: 'text-warning' },
            { label: 'Wrong', points: '0', icon: X, color: 'text-text-tertiary' },
          ].map(({ label, points, icon: RuleIcon, color }) => (
            <li key={label} className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <RuleIcon className={`h-4 w-4 ${color}`} aria-hidden="true" />
                <span className="text-body text-text-primary">{label}</span>
              </div>
              <span className="text-body font-bold tabular-nums text-text-primary">
                {points} pts
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
