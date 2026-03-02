'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useLiveFixtures } from '@/hooks/use-live-fixtures';
import { useGameweekPredictions } from '@/hooks/use-gameweek-predictions';
import {
  useProvisionalScoring,
  type SeasonEntry,
} from '@/hooks/use-provisional-scoring';
import { LeaderboardTable } from '@/components/leaderboard-table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { ChevronDown, ChevronUp, Wifi, WifiOff, Info } from 'lucide-react';

interface LiveLeaderboardProps {
  seasonId: string;
  currentUserId: string;
  currentGameweek: number;
}

export function LiveLeaderboard({
  seasonId,
  currentUserId,
  currentGameweek,
}: LiveLeaderboardProps) {
  const [activeTab, setActiveTab] = useState<'weekly' | 'season'>('weekly');
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [seasonEntries, setSeasonEntries] = useState<SeasonEntry[]>([]);
  const [customDeadline, setCustomDeadline] = useState<string | null>(null);

  const { fixtures, isConnected, lastUpdated } = useLiveFixtures(currentGameweek);
  const { predictions, profiles, isLoading } = useGameweekPredictions(
    seasonId,
    currentGameweek,
    fixtures,
  );

  const supabase = createClient();

  // Fetch custom deadline for this gameweek
  useEffect(() => {
    async function fetchDeadline() {
      const { data } = await supabase
        .from('gameweek_deadlines')
        .select('deadline')
        .eq('season_id', seasonId)
        .eq('gameweek', currentGameweek)
        .single();
      setCustomDeadline(data?.deadline ?? null);
    }
    void fetchDeadline();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seasonId, currentGameweek]);

  // Count finished fixtures to trigger re-fetch of season entries
  const finishedCount = fixtures.filter(
    (f) => f.status === 'FINISHED',
  ).length;

  // Fetch confirmed season leaderboard for season provisional view
  // Re-fetches when finishedCount changes (a match just ended + scores recalculated)
  useEffect(() => {
    async function fetchSeason() {
      const { data } = await supabase.rpc('get_season_leaderboard', {
        p_season_id: seasonId,
      });
      if (data) {
        setSeasonEntries(
          (data as { user_id: string; total_points: number }[]).map((e) => ({
            user_id: e.user_id,
            confirmed_points: Number(e.total_points),
          })),
        );
      }
    }
    void fetchSeason();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seasonId, finishedCount]);

  const { weeklyLeaderboard, seasonLeaderboard } = useProvisionalScoring(
    fixtures,
    predictions,
    profiles,
    seasonEntries,
    customDeadline,
  );

  const hasLiveMatches = fixtures.some(
    (f) => f.status === 'IN_PLAY' || f.status === 'PAUSED',
  );

  const currentLeaderboard =
    activeTab === 'weekly' ? weeklyLeaderboard : seasonLeaderboard;

  const mappedEntries = currentLeaderboard.map((e) => ({
    rank: e.rank,
    user_id: e.user_id,
    display_name: e.display_name,
    avatar_url: e.avatar_url,
    total_points: e.total_points,
    exact_count: e.exact_count,
    outcome_count: e.outcome_count,
    featured_badges: e.featured_badges,
  }));

  if (isLoading) {
    return (
      <div className="space-y-3" aria-busy="true" aria-label="Loading live leaderboard">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with live badge and connection status */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {hasLiveMatches && <Badge variant="live">LIVE</Badge>}
          <span className="text-h3 font-semibold text-text-primary">
            Gameweek {currentGameweek}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {isConnected ? (
            <Wifi
              className="h-4 w-4 text-success"
              aria-label="Connected to live updates"
            />
          ) : (
            <WifiOff
              className="h-4 w-4 text-text-tertiary"
              aria-label="Disconnected — using polling"
            />
          )}
          {lastUpdated && (
            <span className="text-caption text-text-tertiary">
              {lastUpdated.toLocaleTimeString()}
            </span>
          )}
        </div>
      </div>

      {/* Provisional disclaimer */}
      {hasLiveMatches && (
        <div className="flex items-start gap-2 rounded-card border border-border-subtle bg-surface-elevated p-3">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-info" aria-hidden="true" />
          <p className="text-caption text-text-secondary">
            Provisional scores — final points calculated at full time
          </p>
        </div>
      )}

      {/* Weekly / Season tabs */}
      <div className="flex gap-1 rounded-card bg-bg-secondary p-1" role="tablist" aria-label="Leaderboard view">
        {(['weekly', 'season'] as const).map((tab) => (
          <button
            key={tab}
            role="tab"
            aria-selected={activeTab === tab}
            aria-controls={`live-tabpanel-${tab}`}
            id={`live-tab-${tab}`}
            onClick={() => setActiveTab(tab)}
            className={cn(
              'flex-1 rounded-input px-4 py-2.5 text-body-sm font-medium transition-all duration-250 ease-out',
              activeTab === tab
                ? 'bg-accent text-text-inverse shadow-sm'
                : 'text-text-secondary hover:text-text-primary hover:bg-surface/50',
            )}
          >
            {tab === 'weekly' ? 'Weekly' : 'Season'}
          </button>
        ))}
      </div>

      {/* Leaderboard table */}
      <div
        role="tabpanel"
        id={`live-tabpanel-${activeTab}`}
        aria-labelledby={`live-tab-${activeTab}`}
      >
        <LeaderboardTable entries={mappedEntries} currentUserId={currentUserId} />
      </div>

      {/* Expandable fixture breakdown per user (weekly tab only) */}
      {activeTab === 'weekly' && weeklyLeaderboard.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-body-sm font-medium text-text-secondary">
            Score Breakdown
          </h4>
          {weeklyLeaderboard.map((entry) => (
            <div
              key={entry.user_id}
              className="rounded-card border border-border bg-surface"
            >
              <button
                onClick={() =>
                  setExpandedUser(
                    expandedUser === entry.user_id ? null : entry.user_id,
                  )
                }
                className="flex w-full items-center justify-between px-4 py-3 text-left"
                aria-expanded={expandedUser === entry.user_id}
                aria-controls={`breakdown-${entry.user_id}`}
              >
                <span className="text-body-sm font-medium text-text-primary">
                  {entry.display_name}
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-body-sm font-bold tabular-nums text-accent">
                    {entry.total_points} pts
                  </span>
                  {expandedUser === entry.user_id ? (
                    <ChevronUp className="h-4 w-4 text-text-tertiary" aria-hidden="true" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-text-tertiary" aria-hidden="true" />
                  )}
                </div>
              </button>
              {expandedUser === entry.user_id && (
                <div
                  id={`breakdown-${entry.user_id}`}
                  className="space-y-2 border-t border-border-subtle px-4 pb-3 pt-2"
                >
                  {entry.fixture_breakdown.map((b) => (
                    <div
                      key={b.fixture_id}
                      className="flex items-center justify-between text-body-sm"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        {b.status === 'IN_PLAY' || b.status === 'PAUSED' ? (
                          <span className="relative flex h-2 w-2 shrink-0" aria-label="Live">
                            <span className="absolute inline-flex h-full w-full animate-live-pulse rounded-full bg-live" />
                            <span className="relative inline-flex h-2 w-2 rounded-full bg-live" />
                          </span>
                        ) : (
                          <span
                            className="h-2 w-2 shrink-0 rounded-full bg-success"
                            aria-label="Full time"
                          />
                        )}
                        <span className="truncate text-text-secondary">
                          {b.home_team} {b.actual_home}-{b.actual_away} {b.away_team}
                        </span>
                      </div>
                      <div className="ml-2 flex shrink-0 items-center gap-2">
                        <span className="text-text-tertiary">
                          ({b.predicted_home}-{b.predicted_away})
                        </span>
                        <Badge
                          variant={b.points > 0 ? 'points' : 'default'}
                          className="text-[11px]"
                        >
                          +{b.points}
                        </Badge>
                      </div>
                    </div>
                  ))}
                  {entry.fixture_breakdown.length === 0 && (
                    <p className="text-caption text-text-tertiary">
                      No predictions for kicked-off fixtures
                    </p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
