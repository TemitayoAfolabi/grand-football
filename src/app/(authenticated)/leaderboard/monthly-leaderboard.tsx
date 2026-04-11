'use client';

import { useEffect, useState, useTransition } from 'react';
import { createClient } from '@/lib/supabase/client';
import { LeaderboardTable } from '@/components/leaderboard-table';
import { Podium } from '@/components/podium';
import { Skeleton } from '@/components/ui/skeleton';
import { formatMonth } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface MonthlyLeaderboardProps {
  seasonId: string;
  currentUserId: string;
}

interface MonthlyEntry {
  rank: number;
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  monthly_points: number;
  bonus_points: number;
  total_monthly: number;
  exact_count: number;
  outcome_count: number;
  bonus_eligible: boolean;
  fixtures_missed: number;
  on_time_predictions: number;
}

export function MonthlyLeaderboard({ seasonId, currentUserId }: MonthlyLeaderboardProps) {
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [entries, setEntries] = useState<MonthlyEntry[]>([]);
  const [isPending, startTransition] = useTransition();

  const supabase = createClient();

  useEffect(() => {
    startTransition(async () => {
      const monthStr = month.toISOString().split('T')[0]!;
      const { data } = await supabase.rpc('get_monthly_leaderboard', {
        p_season_id: seasonId,
        p_month: monthStr,
      });
      setEntries((data as MonthlyEntry[]) ?? []);
    });
  }, [month, seasonId, supabase]);

  const prevMonth = () => setMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1));
  const nextMonth = () => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1));

  const mappedEntries = entries.map((e) => ({
    rank: Number(e.rank),
    user_id: e.user_id,
    display_name: e.display_name,
    avatar_url: e.avatar_url,
    total_points: Number(e.total_monthly),
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
      {/* Month selector */}
      <div className="flex items-center justify-center gap-4">
        <Button variant="ghost" size="sm" onClick={prevMonth} aria-label="Previous month">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="min-w-[160px] text-center text-h3 font-semibold text-text-primary">
          {formatMonth(month)}
        </span>
        <Button variant="ghost" size="sm" onClick={nextMonth} aria-label="Next month">
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
