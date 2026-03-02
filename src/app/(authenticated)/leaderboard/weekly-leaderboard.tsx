'use client';

import { useEffect, useState, useTransition } from 'react';
import { createClient } from '@/lib/supabase/client';
import { LeaderboardTable } from '@/components/leaderboard-table';
import { Podium } from '@/components/podium';
import { Skeleton } from '@/components/ui/skeleton';
import { getGameweekLabel } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface WeeklyLeaderboardProps {
  seasonId: string;
  currentUserId: string;
  gameweeks: number[];
  currentGameweek?: number;
}

interface GameweekEntry {
  rank: number;
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  gameweek_points: number;
  exact_count: number;
  outcome_count: number;
}

export function WeeklyLeaderboard({ seasonId, currentUserId, gameweeks, currentGameweek }: WeeklyLeaderboardProps) {
  const [selectedGameweek, setSelectedGameweek] = useState(() => currentGameweek ?? gameweeks[gameweeks.length - 1] ?? 1);
  const [entries, setEntries] = useState<GameweekEntry[]>([]);
  const [isPending, startTransition] = useTransition();

  const supabase = createClient();

  useEffect(() => {
    startTransition(async () => {
      const { data } = await supabase.rpc('get_gameweek_leaderboard', {
        p_season_id: seasonId,
        p_gameweek: selectedGameweek,
      });
      setEntries((data as GameweekEntry[]) ?? []);
    });
  }, [selectedGameweek, seasonId, supabase]);

  const currentIndex = gameweeks.indexOf(selectedGameweek);
  const prevGameweek = () => {
    if (currentIndex > 0) setSelectedGameweek(gameweeks[currentIndex - 1]!);
  };
  const nextGameweek = () => {
    if (currentIndex < gameweeks.length - 1) setSelectedGameweek(gameweeks[currentIndex + 1]!);
  };

  const mappedEntries = entries.map((e) => ({
    rank: Number(e.rank),
    user_id: e.user_id,
    display_name: e.display_name,
    avatar_url: e.avatar_url,
    total_points: Number(e.gameweek_points),
    exact_count: Number(e.exact_count),
    outcome_count: Number(e.outcome_count),
  }));

  const top3 = mappedEntries.slice(0, 3).map((e) => ({
    rank: e.rank,
    display_name: e.display_name,
    total_points: e.total_points,
  }));

  return (
    <div className="space-y-4">
      {/* Gameweek selector */}
      <div className="flex items-center justify-center gap-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={prevGameweek}
          disabled={currentIndex <= 0}
          aria-label="Previous gameweek"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="min-w-[160px] text-center text-h3 font-semibold text-text-primary">
          {getGameweekLabel(selectedGameweek)}
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={nextGameweek}
          disabled={currentIndex >= gameweeks.length - 1}
          aria-label="Next gameweek"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {isPending ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {top3.length >= 3 && <Podium entries={top3} />}
          <LeaderboardTable
            entries={mappedEntries.length > 3 ? mappedEntries.slice(3) : mappedEntries}
            currentUserId={currentUserId}
          />
        </div>
      )}
    </div>
  );
}
