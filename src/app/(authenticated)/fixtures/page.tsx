import { createClient } from '@/lib/supabase/server';
import { FixtureCard } from '@/components/fixture-card';
import { PredictionForm } from '@/components/prediction-form';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/empty-state';
import { Countdown } from '@/components/countdown';
import { getGameweekLabel } from '@/lib/utils';
import { submitPrediction } from './actions';
import { GameweekSelector } from './gameweek-selector';
import { Calendar, Clock, Lock } from 'lucide-react';

export const metadata = {
  title: 'Fixtures',
};

export const dynamic = 'force-dynamic';

interface FixturesPageProps {
  searchParams: { gw?: string };
}

export default async function FixturesPage({ searchParams }: FixturesPageProps) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const userId = user!.id;

  const { data: season } = await supabase
    .from('seasons')
    .select('*')
    .eq('is_active', true)
    .single();

  if (!season) {
    return (
      <EmptyState
        icon={Calendar}
        title="No Active Season"
        description="Waiting for the admin to start a new season."
      />
    );
  }

  const { data: gameweeks } = await supabase
    .from('fixtures')
    .select('gameweek')
    .eq('season_id', season.id)
    .order('gameweek', { ascending: true });

  const uniqueGameweeks = [...new Set(gameweeks?.map((g) => g.gameweek))];

  // Find the "current" gameweek – the one with the nearest upcoming kickoff
  const now = new Date().toISOString();
  const { data: currentGwRow } = await supabase
    .from('fixtures')
    .select('gameweek')
    .eq('season_id', season.id)
    .gte('kickoff_time', now)
    .order('kickoff_time', { ascending: true })
    .limit(1)
    .single();

  // Also check for any live games
  const { data: liveGwRow } = await supabase
    .from('fixtures')
    .select('gameweek')
    .eq('season_id', season.id)
    .in('status', ['IN_PLAY', 'PAUSED', 'HALFTIME'])
    .limit(1)
    .single();

  const defaultGw = liveGwRow?.gameweek ?? currentGwRow?.gameweek ?? uniqueGameweeks[uniqueGameweeks.length - 1] ?? 1;
  const selectedGw = searchParams.gw ? parseInt(searchParams.gw, 10) : defaultGw;

  const { data: fixtures } = await supabase
    .from('fixtures')
    .select('*')
    .eq('season_id', season.id)
    .eq('gameweek', selectedGw)
    .order('kickoff_time', { ascending: true });

  const fixtureIds = fixtures?.map((f) => f.id) ?? [];
  const { data: predictions } = fixtureIds.length
    ? await supabase.from('predictions').select('*').eq('user_id', userId).in('fixture_id', fixtureIds)
    : { data: [] };

  const finishedIds = fixtures?.filter((f) => f.status === 'FINISHED').map((f) => f.id) ?? [];
  const { data: scoreRecords } = finishedIds.length
    ? await supabase.from('score_records').select('*').eq('user_id', userId).in('fixture_id', finishedIds)
    : { data: [] };

  const predMap = new Map(predictions?.map((p) => [p.fixture_id, p]));
  const scoreMap = new Map(scoreRecords?.map((s) => [s.fixture_id, s]));

  // Check for an admin-set custom deadline for this gameweek
  const { data: customDeadlineRow } = await supabase
    .from('gameweek_deadlines')
    .select('deadline')
    .eq('season_id', season.id)
    .eq('gameweek', selectedGw)
    .single();

  // Gameweek deadline: custom if set, otherwise earliest kickoff
  const gameweekDeadline = customDeadlineRow?.deadline
    ?? fixtures
      ?.filter((f) => f.status !== 'POSTPONED' && f.status !== 'CANCELLED')
      .reduce<string | null>(
        (earliest, f) =>
          !earliest || f.kickoff_time < earliest ? f.kickoff_time : earliest,
        null,
      )
    ?? null;

  const deadlineExpired = gameweekDeadline ? new Date(gameweekDeadline) < new Date() : false;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-h1 text-text-primary">Fixtures</h1>
          <p className="mt-1 text-body-sm text-text-secondary">{getGameweekLabel(selectedGw)}</p>
        </div>
        <Badge variant="star">{season.name}</Badge>
      </div>

      {/* Countdown banner */}
      {gameweekDeadline && !deadlineExpired && (
        <div 
          className="rounded-card border border-border bg-surface px-4 py-3"
          role="timer"
          aria-live="polite"
          aria-label={`Gameweek ${selectedGw} predictions deadline countdown`}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-text-secondary" aria-hidden="true" />
              <span className="text-body-sm text-text-secondary">
                Predictions Lock In:
              </span>
            </div>
            <Countdown targetDate={gameweekDeadline} className="text-body font-semibold" />
          </div>
        </div>
      )}

      {gameweekDeadline && deadlineExpired && (
        <div className="rounded-card border border-border-subtle bg-surface px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Lock className="h-4 w-4 text-text-tertiary" aria-hidden="true" />
              <span className="text-body-sm text-text-tertiary">
                Locked
              </span>
            </div>
            <span className="text-body-sm text-text-tertiary">Predictions closed</span>
          </div>
        </div>
      )}

      {/* Gameweek selector */}
      <GameweekSelector gameweeks={uniqueGameweeks} selected={selectedGw} />

      {/* Fixture list */}
      {fixtures && fixtures.length > 0 ? (
        <div className="space-y-3">
          {fixtures.map((fixture, i) => {
            const prediction = predMap.get(fixture.id);
            const scoreRecord = scoreMap.get(fixture.id);
            const isOpen = new Date(fixture.kickoff_time) > new Date();

            return (
              <div
                key={fixture.id}
                className="animate-fade-in-up opacity-0"
                style={{ animationDelay: `${i * 50}ms` }}
              >
                <FixtureCard
                  fixture={fixture}
                  prediction={prediction ?? null}
                  scoreRecord={scoreRecord ?? null}
                  showPrediction={false}
                >
                  {isOpen && fixture.status !== 'FINISHED' && (
                    <PredictionForm
                      fixtureId={fixture.id}
                      kickoffTime={fixture.kickoff_time}
                      gameweekDeadline={gameweekDeadline ?? undefined}
                      existingPrediction={
                        prediction
                          ? { home_score: prediction.home_score, away_score: prediction.away_score }
                          : null
                      }
                      submitAction={submitPrediction}
                    />
                  )}
                  {!isOpen && fixture.status !== 'FINISHED' && prediction && (
                    <div className="mt-3 border-t border-border-subtle pt-3">
                      <div className="flex items-center justify-between">
                        <span className="text-body-sm text-text-secondary">Your prediction</span>
                        <span className="text-body font-bold tabular-nums text-text-primary">
                          {prediction.home_score} - {prediction.away_score}
                        </span>
                      </div>
                    </div>
                  )}
                </FixtureCard>
              </div>
            );
          })}
        </div>
      ) : (
        <EmptyState
          icon={Calendar}
          title="No Fixtures"
          description="No fixtures scheduled for this gameweek."
        />
      )}
    </div>
  );
}
