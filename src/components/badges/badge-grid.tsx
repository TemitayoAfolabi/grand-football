'use client';

import { cn } from '@/lib/utils';
import { BADGES, TIER_CONFIG, type BadgeTier } from '@/lib/badges/definitions';
import { BadgeIcon } from './badge-icon';

interface UserBadge {
  badge_id: string;
  earned_at: string;
}

interface BadgeGridProps {
  earnedBadges: UserBadge[];
  className?: string;
}

const TIER_ORDER: BadgeTier[] = ['legendary', 'epic', 'rare', 'common'];

export function BadgeGrid({ earnedBadges, className }: BadgeGridProps) {
  const earnedSet = new Set(earnedBadges.map((b) => b.badge_id));
  const earnedCount = earnedBadges.length;

  return (
    <div className={cn('space-y-6', className)}>
      {/* Summary */}
      <div className="flex items-center gap-3">
        <span className="text-stat font-bold text-accent tabular-nums">{earnedCount}</span>
        <span className="text-body-sm text-text-secondary">
          / {BADGES.length} badges earned
        </span>
      </div>

      {/* Tiers */}
      {TIER_ORDER.map((tier) => {
        const tierBadges = BADGES.filter((b) => b.tier === tier);
        const tierConfig = TIER_CONFIG[tier];
        const tierEarned = tierBadges.filter((b) => earnedSet.has(b.id)).length;

        return (
          <section key={tier}>
            <div className="mb-3 flex items-center gap-2">
              <h3 className={cn('text-body-sm font-bold uppercase tracking-wider', tierConfig.color)}>
                {tierConfig.label}
              </h3>
              <span className="text-caption text-text-tertiary">
                {tierEarned}/{tierBadges.length}
              </span>
            </div>

            <div className="grid grid-cols-4 tablet:grid-cols-6 desktop:grid-cols-8 gap-4">
              {tierBadges.map((badge) => (
                <div key={badge.id} className="flex flex-col items-center gap-1.5">
                  <BadgeIcon
                    badge={badge}
                    earned={earnedSet.has(badge.id)}
                    size="md"
                  />
                  <span
                    className={cn(
                      'text-center text-[11px] font-medium leading-tight',
                      earnedSet.has(badge.id) ? 'text-text-primary' : 'text-text-disabled',
                    )}
                  >
                    {badge.name}
                  </span>
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
