import { createClient } from '@/lib/supabase/server';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { BonusTracker } from '@/components/bonus-tracker';
import { FixtureCard } from '@/components/fixture-card';
import { StatCard } from '@/components/stat-card';
import { GlowDivider } from '@/components/glow-divider';
import { StarManCard } from '@/components/star-man-card';
import { LiveMatchesSection } from '@/components/live-matches-section';
import { Suspense } from 'react';
import { Trophy, TrendingUp, Calendar, ChevronRight, Target, Award } from 'lucide-react';
import Link from 'next/link';

export const metadata = {
  title: 'Dashboard',
};

export default async function DashboardPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const userId = user!.id;

  // Get active season
  const { data: season } = await supabase
    .from('seasons')
    .select('*')
    .eq('is_active', true)
    .single();

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

  // Get leaderboard to find user rank
  const { data: leaderboard } = await supabase.rpc('get_season_leaderboard', {
    p_season_id: season.id,
  });

  const userEntry = leaderboard?.find((e) => e.user_id === userId);

  // Get upcoming fixtures
  const { data: upcomingFixtures } = await supabase
    .from('fixtures')
    .select('*')
    .eq('season_id', season.id)
    .in('status', ['SCHEDULED', 'TIMED'])
    .order('kickoff_time', { ascending: true })
    .limit(5);

  // Get user predictions for upcoming fixtures
  const upcomingIds = upcomingFixtures?.map((f) => f.id) ?? [];
  const { data: upcomingPredictions } = upcomingIds.length
    ? await supabase
        .from('predictions')
        .select('*')
        .eq('user_id', userId)
        .in('fixture_id', upcomingIds)
    : { data: [] };

  // Get recent results
  const { data: recentFixtures } = await supabase
    .from('fixtures')
    .select('*')
    .eq('season_id', season.id)
    .eq('status', 'FINISHED')
    .order('kickoff_time', { ascending: false })
    .limit(5);

  // Get score records for recent results
  const recentIds = recentFixtures?.map((f) => f.id) ?? [];
  const { data: recentScores } = recentIds.length
    ? await supabase
        .from('score_records')
        .select('*')
        .eq('user_id', userId)
        .in('fixture_id', recentIds)
    : { data: [] };

  // Monthly bonus progress
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString()
    .split('T')[0]!;
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1)
    .toISOString()
    .split('T')[0]!;

  const { count: monthFixtures } = await supabase
    .from('fixtures')
    .select('id', { count: 'exact', head: true })
    .eq('season_id', season.id)
    .gte('kickoff_time', monthStart)
    .lt('kickoff_time', monthEnd);

  const { count: monthPredictions } = await supabase
    .from('predictions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .in(
      'fixture_id',
      (
        await supabase
          .from('fixtures')
          .select('id')
          .eq('season_id', season.id)
          .gte('kickoff_time', monthStart)
          .lt('kickoff_time', monthEnd)
      ).data?.map((f) => f.id) ?? [],
    );

  // Username for greeting
  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('id', userId)
    .single();

  const displayName = profile?.display_name || user!.email?.split('@')[0] || 'Player';
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  // Badge count
  const { count: badgeCount } = await supabase
    .from('user_badges')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId);

  // Get live fixtures for Live Matches section
  const { data: liveFixtures } = await supabase
    .from('fixtures')
    .select('*')
    .eq('season_id', season.id)
    .in('status', ['IN_PLAY', 'PAUSED'])
    .order('kickoff_time', { ascending: true });

  const liveIds = liveFixtures?.map((f) => f.id) ?? [];
  const { data: livePredictions } = liveIds.length
    ? await supabase
        .from('predictions')
        .select('*')
        .eq('user_id', userId)
        .in('fixture_id', liveIds)
    : { data: [] };

  const liveGameweek = liveFixtures?.[0]?.gameweek ?? null;

  const predMap = new Map(upcomingPredictions?.map((p) => [p.fixture_id, p]));
  const scoreMap = new Map(recentScores?.map((s) => [s.fixture_id, s]));

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
      {liveFixtures && liveFixtures.length > 0 && liveGameweek && (
        <LiveMatchesSection
          gameweek={liveGameweek}
          initialFixtures={liveFixtures}
          predictions={(livePredictions ?? []).map((p) => ({
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
        {upcomingFixtures && upcomingFixtures.length > 0 ? (
          <div className="space-y-3">
            {upcomingFixtures.map((fixture, i) => (
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
        {recentFixtures && recentFixtures.length > 0 ? (
          <div className="space-y-3">
            {recentFixtures.map((fixture, i) => {
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
