'use client';

import { cn } from '@/lib/utils';
import { getBadge } from '@/lib/badges/definitions';
import { BadgeChip } from './badge-icon';

interface BadgeShowcaseProps {
  /** Badge IDs to display (max 3) */
  featuredBadgeIds: string[];
  className?: string;
}

/**
 * Compact badge showcase for leaderboard rows and profiles.
 * Shows up to 3 featured badges as small chips.
 */
export function BadgeShowcase({ featuredBadgeIds, className }: BadgeShowcaseProps) {
  if (!featuredBadgeIds || featuredBadgeIds.length === 0) return null;

  const badges = featuredBadgeIds
    .map((id) => getBadge(id))
    .filter(Boolean);

  if (badges.length === 0) return null;

  return (
    <div className={cn('inline-flex items-center gap-1', className)}>
      {badges.map((badge) => (
        <BadgeChip key={badge!.id} badge={badge!} />
      ))}
    </div>
  );
}
