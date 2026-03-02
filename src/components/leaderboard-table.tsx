import { cn } from '@/lib/utils';
import { Trophy, Target, Eye, ChevronRight } from 'lucide-react';
import { BadgeShowcase } from '@/components/badges/badge-showcase';
import Link from 'next/link';

interface LeaderboardEntry {
  rank: number;
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  total_points: number;
  exact_count: number;
  outcome_count: number;
  featured_badges?: string[];
}

interface LeaderboardTableProps {
  entries: LeaderboardEntry[];
  currentUserId?: string;
  className?: string;
}

export function LeaderboardTable({ entries, currentUserId, className }: LeaderboardTableProps) {
  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-12">
        <Trophy className="h-12 w-12 text-text-tertiary" aria-hidden="true" />
        <p className="text-body text-text-secondary">No leaderboard data yet</p>
        <p className="text-body-sm text-text-tertiary">Play some games to get started!</p>
      </div>
    );
  }

  return (
    <div className={cn('space-y-2', className)}>
      {/* Desktop table header */}
      <div className="hidden tablet:grid tablet:grid-cols-[48px_1fr_80px_60px_60px_40px] gap-2 px-4 py-2 text-stat-label uppercase tracking-wider text-text-tertiary">
        <span>#</span>
        <span>Player</span>
        <span className="text-right">Points</span>
        <span className="text-right">Exact</span>
        <span className="text-right">Outcome</span>
        <span></span>
      </div>

      {entries.map((entry, index) => {
        const isCurrentUser = entry.user_id === currentUserId;
        const isTop3 = entry.rank <= 3;

        return (
          <Link
            key={entry.user_id}
            href={`/predictions/${entry.user_id}`}
            className={cn(
              'grid grid-cols-[48px_1fr_auto_32px] tablet:grid-cols-[48px_1fr_80px_60px_60px_40px] items-center gap-2 rounded-card px-4 py-3 transition-colors duration-150 cursor-pointer',
              isCurrentUser
                ? 'bg-accent-muted border-l-2 border-l-accent'
                : 'bg-surface border border-border hover:bg-surface-elevated',
            )}
            style={{ animationDelay: `${index * 50}ms` }}
          >
            {/* Rank */}
            <div className="flex items-center justify-center">
              {isTop3 ? (
                <div
                  className={cn(
                    'flex h-8 w-8 items-center justify-center rounded-full',
                    entry.rank === 1 && 'bg-podium-gold/20 text-podium-gold',
                    entry.rank === 2 && 'bg-podium-silver/20 text-podium-silver',
                    entry.rank === 3 && 'bg-podium-bronze/20 text-podium-bronze',
                  )}
                >
                  <Trophy className="h-4 w-4" aria-label={`Rank ${entry.rank}`} />
                </div>
              ) : (
                <span className="text-rank font-extrabold text-text-tertiary">
                  {entry.rank}
                </span>
              )}
            </div>

            {/* Name + Badges */}
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span
                  className={cn(
                    'truncate text-body font-medium',
                    isCurrentUser ? 'text-accent' : 'text-text-primary',
                  )}
                >
                  {entry.display_name || 'Anonymous'}
                  {isCurrentUser && (
                    <span className="ml-1.5 text-caption text-text-secondary">(you)</span>
                  )}
                </span>
                {entry.featured_badges && entry.featured_badges.length > 0 && (
                  <BadgeShowcase featuredBadgeIds={entry.featured_badges} />
                )}
              </div>
            </div>

            {/* Points */}
            <span className="text-right text-stat font-bold text-accent tabular-nums">
              {entry.total_points}
            </span>

            {/* Exact count - hidden on mobile */}
            <div className="hidden items-center justify-end gap-1.5 tablet:flex">
              <Target className="h-3.5 w-3.5 text-success" aria-hidden="true" />
              <span className="text-body-sm tabular-nums text-text-secondary">{entry.exact_count}</span>
            </div>

            {/* Outcome count - hidden on mobile */}
            <div className="hidden items-center justify-end gap-1.5 tablet:flex">
              <Eye className="h-3.5 w-3.5 text-info" aria-hidden="true" />
              <span className="text-body-sm tabular-nums text-text-secondary">{entry.outcome_count}</span>
            </div>

            {/* View predictions indicator */}
            <div className="flex items-center justify-center">
              <ChevronRight className="h-4 w-4 text-text-tertiary" aria-hidden="true" />
            </div>
          </Link>
        );
      })}
    </div>
  );
}
