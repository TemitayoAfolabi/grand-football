import { createClient } from '@/lib/supabase/server';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { BonusTracker } from '@/components/bonus-tracker';
import { FixtureCard } from '@/components/fixture-card';
import { StatCard } from '@/components/stat-card';
import { GlowDivider } from '@/components/glow-divider';
import { StarManCard } from '@/components/star-man-card';
import { LiveMatchesSection } from '@/components/live-matches-section';
import { Countdown } from '@/components/countdown';
import { Suspense } from 'react';
import { Trophy, TrendingUp, Calendar, ChevronRight, Target, Award, Clock, Lock } from 'lucide-react';
import Link from 'next/link';
import {
  getCachedUser,
  getCachedActiveSeason,
  getCachedLeaderboard,
  getCachedProfile,
} from '@/lib/server/cached-queries';

export const metadata = {
  title: 'Dashboard',
};

export default async function DashboardPage() {
  const supabase = createClient();
  
  // Use cached queries for user and season - these may already be fetched by layout
  const [user, season] = await Promise.all([
    getCachedUser(),
    getCachedActiveSeason(),
  ]);
  
  const userId = user!.id;

  if (!season) {
    return (
      <div className="flex flex-col items-center gap-4 py-16">
        <Trophy className="h-16 w-16 text-text-tertiary" aria-hidden="true" />
        <h1 className="text-h1 text-text-primary">No Active Season</h1>
        <p className="text-body text-text-secondary">
          Waiting for the admin to start a new season.
        </p>
      </div>
    );
  }

  // Calculate month boundaries once
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString()
    .split('T')[0]!;
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1)
    .toISOString()
    .split('T')[0]!;

  // Parallelize ALL independent queries - this is the biggest performance win
  const [
    leaderboard,
    upcomingFixtures,
    recentFixtures,
    profile,
    badgeResult,
    liveFixtures,
    monthFixturesResult,
    monthFixtureIds,
  ] = await Promise.all([
    // Cached leaderboard RPC
    getCachedLeaderboard(season.id),
    // Upcoming fixtures
    supabase
      .from('fixtures')
      .select('*')
      .eq('season_id', season.id)
      .in('status', ['SCHEDULED', 'TIMED'])
      .order('kickoff_time', { ascending: true })
      .limit(5),
    // Recent results
    supabase
      .from('fixtures')
      .select('*')
      .eq('season_id', season.id)
      .eq('status', 'FINISHED')
      .order('kickoff_time', { ascending: false })
      .limit(5),
    // User profile (cached)
    getCachedProfile(userId),
    // Badge count
    supabase
      .from('user_badges')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId),
    // Live fixtures
    supabase
      .from('fixtures')
      .select('*')
      .eq('season_id', season.id)
      .in('status', ['IN_PLAY', 'PAUSED'])
      .order('kickoff_time', { ascending: true }),
    // Month fixtures count
    supabase
      .from('fixtures')
      .select('id', { count: 'exact', head: true })
      .eq('season_id', season.id)
      .gte('kickoff_time', monthStart)
      .lt('kickoff_time', monthEnd),
    // Month fixture IDs for prediction count
    supabase
      .from('fixtures')
      .select('id')
      .eq('season_id', season.id)
      .gte('kickoff_time', monthStart)
      .lt('kickoff_time', monthEnd),
  ]);

  const userEntry = leaderboard?.find((e) => e.user_id === userId);
  const badgeCount = badgeResult.count;
  const monthFixtures = monthFixturesResult.count;

  // Get IDs for dependent queries
  const upcomingIds = upcomingFixtures.data?.map((f) => f.id) ?? [];
  const recentIds = recentFixtures.data?.map((f) => f.id) ?? [];
  const liveIds = liveFixtures.data?.map((f) => f.id) ?? [];
  const monthIds = monthFixtureIds.data?.map((f) => f.id) ?? [];

  // Second batch of parallel queries (depend on first batch results)
  const [upcomingPredictions, recentScores, livePredictions, monthPredictionsResult] = await Promise.all([
    upcomingIds.length
      ? supabase
          .from('predictions')
          .select('*')
          .eq('user_id', userId)
          .in('fixture_id', upcomingIds)
      : Promise.resolve({ data: [] }),
    recentIds.length
      ? supabase
          .from('score_records')
          .select('*')
          .eq('user_id', userId)
          .in('fixture_id', recentIds)
      : Promise.resolve({ data: [] }),
    liveIds.length
      ? supabase
          .from('predictions')
          .select('*')
          .eq('user_id', userId)
          .in('fixture_id', liveIds)
      : Promise.resolve({ data: [] }),
    monthIds.length
      ? supabase
          .from('predictions')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId)
          .in('fixture_id', monthIds)
      : Promise.resolve({ count: 0 }),
  ]);

  const monthPredictions = monthPredictionsResult.count ?? 0;

  // Build display data
  const displayName = profile?.display_name || user!.email?.split('@')[0] || 'Player';
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const liveGameweek = liveFixtures.data?.[0]?.gameweek ?? null;

  const predMap = new Map(upcomingPredictions.data?.map((p) => [p.fixture_id, p]));
  const scoreMap = new Map(recentScores.data?.map((s) => [s.fixture_id, s]));

  // Fetch current gameweek and deadline for countdown banner
  const currentTime = new Date().toISOString();
  const { data: currentGwRow } = await supabase
    .from('fixtures')
    .select('gameweek')
    .eq('season_id', season.id)
    .gte('kickoff_time', currentTime)
    .order('kickoff_time', { ascending: true })
    .limit(1)
    .single();

  const currentGameweek = liveGameweek ?? currentGwRow?.gameweek ?? null;

  let gameweekDeadline: string | null = null;
  if (currentGameweek) {
    // Check for custom deadline
    const { data: customDeadlineRow } = await supabase
      .from('gameweek_deadlines')
      .select('deadline')
      .eq('season_id', season.id)
      .eq('gameweek', currentGameweek)
      .single();

    if (customDeadlineRow?.deadline) {
      gameweekDeadline = customDeadlineRow.deadline;
    } else {
      // Use earliest kickoff time
      const { data: currentGwFixtures } = await supabase
        .from('fixtures')
        .select('kickoff_time, status')
        .eq('season_id', season.id)
        .eq('gameweek', currentGameweek);

      gameweekDeadline =
        currentGwFixtures
          ?.filter((f) => f.status !== 'POSTPONED' && f.status !== 'CANCELLED')
          .reduce<string | null>(
            (earliest, f) =>
              !earliest || f.kickoff_time < earliest ? f.kickoff_time : earliest,
            null,
          ) ?? null;
    }
  }

  const deadlineExpired = gameweekDeadline ? new Date(gameweekDeadline) < new Date() : false;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-h1 text-text-primary">{greeting}, {displayName}</h1>
        <p className="mt-1 text-body-sm text-text-secondary">{season.name} Season</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard
          icon={Trophy}
          label="Rank"
          value={userEntry?.rank ? `#${userEntry.rank}` : '-'}
        />
        <StatCard
          icon={TrendingUp}
          label="Points"
          value={userEntry?.total_points ?? 0}
        />
        <Link href="/badges" className="block">
          <StatCard
            icon={Award}
            label="Badges"
            value={badgeCount ?? 0}
          />
        </Link>
      </div>

      {/* Countdown banner */}
      {currentGameweek && gameweekDeadline && !deadlineExpired && (
        <div 
          className="rounded-card border border-border bg-surface px-4 py-3"
          role="timer"
          aria-live="polite"
          aria-label={`Gameweek ${currentGameweek} predictions deadline countdown`}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-text-secondary" aria-hidden="true" />
              <span className="text-body-sm text-text-secondary">
                GW {currentGameweek} Predictions Lock In:
              </span>
            </div>
            <Countdown targetDate={gameweekDeadline} className="text-body font-semibold" />
          </div>
        </div>
      )}

      {currentGameweek && gameweekDeadline && deadlineExpired && (
        <div className="rounded-card border border-border-subtle bg-surface px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Lock className="h-4 w-4 text-text-tertiary" aria-hidden="true" />
              <span className="text-body-sm text-text-tertiary">
                GW {currentGameweek} Locked
              </span>
            </div>
            <span className="text-body-sm text-text-tertiary">Predictions closed</span>
          </div>
        </div>
      )}

      {currentGameweek === null && upcomingFixtures.data && upcomingFixtures.data.length === 0 && (
        <div className="rounded-card border border-border-subtle bg-surface px-4 py-3">
          <div className="flex items-center gap-2">
            <Trophy className="h-4 w-4 text-text-tertiary" aria-hidden="true" />
            <div className="flex-1">
              <div className="text-body-sm text-text-tertiary">Season Complete</div>
              <div className="text-caption text-text-tertiary">No upcoming gameweeks</div>
            </div>
          </div>
        </div>
      )}

      {/* Quick actions */}
      <Link
        href="/predictions/me"
        className="flex items-center justify-between rounded-card border border-border bg-surface px-4 py-3 transition-colors hover:bg-surface-elevated"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-muted">
            <Target className="h-4 w-4 text-accent" aria-hidden="true" />
          </div>
          <span className="text-body font-medium text-text-primary">My Prediction History</span>
        </div>
        <ChevronRight className="h-4 w-4 text-text-tertiary" aria-hidden="true" />
      </Link>

      {/* Live Matches */}
      {liveFixtures.data && liveFixtures.data.length > 0 && liveGameweek && (
        <LiveMatchesSection
          gameweek={liveGameweek}
          initialFixtures={liveFixtures.data}
          predictions={(livePredictions.data ?? []).map((p) => ({
            fixture_id: p.fixture_id,
            home_score: p.home_score,
            away_score: p.away_score,
          }))}
        />
      )}

      {/* Monthly bonus tracker */}
      <Card>
        <BonusTracker
          predicted={monthPredictions ?? 0}
          total={monthFixtures ?? 0}
          eligible={
            (monthPredictions ?? 0) === (monthFixtures ?? 0) && (monthFixtures ?? 0) > 0
          }
        />
      </Card>

      {/* Star Man card */}
      <Suspense fallback={null}>
        <StarManCard />
      </Suspense>

      <GlowDivider />

      {/* Upcoming fixtures */}
      <section>
        <CardHeader>
          <CardTitle>
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-accent" aria-hidden="true" />
              Upcoming Fixtures
            </div>
          </CardTitle>
          <Link
            href="/fixtures"
            className="flex items-center gap-1 text-body-sm text-accent hover:text-accent-hover transition-colors"
          >
            View all
            <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </CardHeader>
        {upcomingFixtures.data && upcomingFixtures.data.length > 0 ? (
          <div className="space-y-3">
            {upcomingFixtures.data.map((fixture, i) => (
              <div
                key={fixture.id}
                className="animate-fade-in-up opacity-0"
                style={{ animationDelay: `${i * 50}ms` }}
              >
                <FixtureCard
                  fixture={fixture}
                  prediction={predMap.get(fixture.id) ?? null}
                />
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-card border border-border-subtle bg-surface p-6 text-center">
            <Calendar className="mx-auto mb-2 h-8 w-8 text-text-tertiary" aria-hidden="true" />
            <p className="text-body-sm text-text-secondary">No upcoming fixtures scheduled.</p>
          </div>
        )}
      </section>

      <GlowDivider />

      {/* Recent results */}
      <section>
        <CardHeader>
          <CardTitle>
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-accent" aria-hidden="true" />
              Recent Results
            </div>
          </CardTitle>
          <Link
            href="/fixtures"
            className="flex items-center gap-1 text-body-sm text-accent hover:text-accent-hover transition-colors"
          >
            View all
            <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </CardHeader>
        {recentFixtures.data && recentFixtures.data.length > 0 ? (
          <div className="space-y-3">
            {recentFixtures.data.map((fixture, i) => {
              const score = scoreMap.get(fixture.id);
              return (
                <div
                  key={fixture.id}
                  className="animate-fade-in-up opacity-0"
                  style={{ animationDelay: `${i * 50}ms` }}
                >
                  <FixtureCard
                    fixture={fixture}
                    scoreRecord={score ?? null}
                  />
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-card border border-border-subtle bg-surface p-6 text-center">
            <p className="text-body-sm text-text-secondary">No results yet.</p>
          </div>
        )}
      </section>
    </div>
  );
}
