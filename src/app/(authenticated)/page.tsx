import { Suspense } from 'react';
import Link from 'next/link';
import type { Route } from 'next';
import { redirect } from 'next/navigation';
import { Award, ChevronRight, Sparkles, Target, Trophy, TrendingUp } from 'lucide-react';
import { StatCard } from '@/components/stat-card';
import { StarManCard } from '@/components/star-man-card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DashboardDeadline,
  LiveDashboardMatches,
  MonthlyBonusCard,
  RecentResults,
  UpcomingFixtures,
} from './dashboard-sections';
import {
  getCachedActiveSeason,
  getCachedLeaderboard,
  getCachedProfile,
  getCachedUser,
} from '@/lib/server/cached-queries';
import { createClient } from '@/lib/supabase/server';

export const metadata = {
  title: 'Dashboard',
};

export default async function DashboardPage() {
  const [user, season] = await Promise.all([getCachedUser(), getCachedActiveSeason()]);

  if (!user) redirect('/login');

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

  const supabase = createClient();
  const [leaderboard, profile, badgeResult] = await Promise.all([
    getCachedLeaderboard(season.id),
    getCachedProfile(user.id),
    supabase
      .from('user_badges')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id),
  ]);

  const userEntry = leaderboard?.find((entry) => entry.user_id === user.id);
  const displayName = profile?.display_name || user.email?.split('@')[0] || 'Player';
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-h1 text-text-primary">
          {greeting}, {displayName}
        </h1>
        <p className="mt-1 text-body-sm text-text-secondary">{season.name} Season</p>
      </div>

      <div className="grid grid-cols-3 gap-2 tablet:gap-3">
        <StatCard icon={Trophy} label="Rank" value={userEntry?.rank ? `#${userEntry.rank}` : '-'} />
        <StatCard icon={TrendingUp} label="Points" value={userEntry?.total_points ?? 0} />
        <Link href="/badges" className="block">
          <StatCard icon={Award} label="Badges" value={badgeResult.count ?? 0} />
        </Link>
      </div>

      <Suspense fallback={<Skeleton className="h-[70px]" />}>
        <DashboardDeadline seasonId={season.id} />
      </Suspense>

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

      <Link
        href={'/matchday' as Route}
        className="flex items-center justify-between rounded-card border border-accent/30 bg-accent-muted px-4 py-3 transition-colors hover:bg-accent-muted/70"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-text-inverse">
            <Sparkles className="h-4 w-4" aria-hidden="true" />
          </div>
          <span className="text-body font-medium text-text-primary">Matchday Drama</span>
        </div>
        <ChevronRight className="h-4 w-4 text-accent" aria-hidden="true" />
      </Link>

      <Suspense fallback={null}>
        <LiveDashboardMatches seasonId={season.id} userId={user.id} />
      </Suspense>

      <Suspense fallback={<Skeleton className="h-[104px]" />}>
        <MonthlyBonusCard seasonId={season.id} userId={user.id} />
      </Suspense>

      <Suspense fallback={null}>
        <StarManCard seasonId={season.id} />
      </Suspense>

      <Suspense fallback={<FixtureListSkeleton />}>
        <UpcomingFixtures seasonId={season.id} userId={user.id} />
      </Suspense>

      <Suspense fallback={<FixtureListSkeleton />}>
        <RecentResults seasonId={season.id} userId={user.id} />
      </Suspense>
    </div>
  );
}

function FixtureListSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-6 w-40" />
      <Skeleton className="h-28" />
      <Skeleton className="h-28" />
    </div>
  );
}
