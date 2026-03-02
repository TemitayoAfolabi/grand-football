import { createClient } from '@/lib/supabase/server';
import { Tabs } from '@/components/ui/tabs';
import { LeaderboardTable } from '@/components/leaderboard-table';
import { Podium } from '@/components/podium';
import { MonthlyLeaderboard } from './monthly-leaderboard';
import { WeeklyLeaderboard } from './weekly-leaderboard';
import { EmptyState } from '@/components/empty-state';
import { LeaderboardAuditBanner } from '@/components/leaderboard-audit-banner';
import { LiveLeaderboard } from '@/components/live-leaderboard';
import { Trophy } from 'lucide-react';

export const metadata = {
  title: 'Leaderboard',
};

export default async function LeaderboardPage() {
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
        icon={Trophy}
        title="No Active Season"
        description="Waiting for the admin to start a new season."
      />
    );
  }

  const { data: gameweekRows } = await supabase
    .from('fixtures')
    .select('gameweek')
    .eq('season_id', season.id)
    .order('gameweek', { ascending: true });

  const uniqueGameweeks = [...new Set(gameweekRows?.map((g) => g.gameweek))];

  const { data: seasonLeaderboard } = await supabase.rpc('get_season_leaderboard', {
    p_season_id: season.id,
  });

  // Check for live matches to conditionally show Live tab
  const { data: liveFixtureCheck } = await supabase
    .from('fixtures')
    .select('gameweek')
    .eq('season_id', season.id)
    .in('status', ['IN_PLAY', 'PAUSED'])
    .limit(1);

  const liveGameweek = liveFixtureCheck?.[0]?.gameweek ?? null;

  // Find the "current" gameweek for the weekly tab default
  const now = new Date().toISOString();
  const { data: upcomingGwRow } = await supabase
    .from('fixtures')
    .select('gameweek')
    .eq('season_id', season.id)
    .gte('kickoff_time', now)
    .order('kickoff_time', { ascending: true })
    .limit(1)
    .single();

  const currentGameweek = liveGameweek ?? upcomingGwRow?.gameweek ?? uniqueGameweeks[uniqueGameweeks.length - 1] ?? 1;

  // Fetch featured badges for all users on the leaderboard
  const userIds = seasonLeaderboard?.map((e) => e.user_id) ?? [];
  const { data: profiles } = userIds.length
    ? await supabase
        .from('profiles')
        .select('id, featured_badges')
        .in('id', userIds)
    : { data: [] };

  const badgeMap = new Map(
    (profiles ?? []).map((p) => [p.id, p.featured_badges ?? []]),
  );

  const entries =
    seasonLeaderboard?.map((e) => ({
      ...e,
      total_points: Number(e.total_points),
      exact_count: Number(e.exact_count),
      outcome_count: Number(e.outcome_count),
      featured_badges: badgeMap.get(e.user_id) ?? [],
    })) ?? [];

  const top3 = entries.slice(0, 3).map((e) => ({
    rank: e.rank,
    display_name: e.display_name,
    total_points: e.total_points,
  }));

  return (
    <div className="space-y-6">
      <h1 className="text-h1 text-text-primary">Leaderboard</h1>

      <LeaderboardAuditBanner seasonId={season.id} />

      <Tabs
        defaultTab={liveGameweek ? 'live' : 'season'}
        tabs={[
          ...(liveGameweek
            ? [
                {
                  id: 'live',
                  label: '\u{1F534} Live',
                  content: (
                    <LiveLeaderboard
                      seasonId={season.id}
                      currentUserId={userId}
                      currentGameweek={liveGameweek}
                    />
                  ),
                },
              ]
            : []),
          {
            id: 'season',
            label: 'Season',
            content: (
              <div className="space-y-4">
                {top3.length >= 3 && <Podium entries={top3} />}
                <LeaderboardTable
                  entries={entries.length > 3 ? entries.slice(3) : entries}
                  currentUserId={userId}
                />
              </div>
            ),
          },
          {
            id: 'weekly',
            label: 'Weekly',
            content: (
              <WeeklyLeaderboard
                seasonId={season.id}
                currentUserId={userId}
                gameweeks={uniqueGameweeks}
                currentGameweek={currentGameweek}
              />
            ),
          },
          {
            id: 'monthly',
            label: 'Monthly',
            content: <MonthlyLeaderboard seasonId={season.id} currentUserId={userId} />,
          },
        ]}
      />
    </div>
  );
}
