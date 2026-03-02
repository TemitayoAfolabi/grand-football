'use client';

import { useState, useTransition } from 'react';
import { cn } from '@/lib/utils';
import { BADGES, TIER_CONFIG } from '@/lib/badges/definitions';
import { BadgeIcon } from './badge-icon';
import { updateFeaturedBadges } from '@/app/(authenticated)/settings/badge-actions';
import { Button } from '@/components/ui/button';

interface BadgeSelectorProps {
  earnedBadgeIds: string[];
  currentFeatured: string[];
  className?: string;
}

/**
 * Settings page component for selecting up to 3 featured badges.
 */
export function BadgeSelector({ earnedBadgeIds, currentFeatured, className }: BadgeSelectorProps) {
  const [selected, setSelected] = useState<string[]>(currentFeatured);
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const earnedSet = new Set(earnedBadgeIds);
  const earnedBadges = BADGES.filter((b) => earnedSet.has(b.id));

  function toggleBadge(badgeId: string) {
    setSelected((prev) => {
      if (prev.includes(badgeId)) {
        return prev.filter((id) => id !== badgeId);
      }
      if (prev.length >= 3) return prev; // Max 3
      return [...prev, badgeId];
    });
    setMessage(null);
  }

  function handleSave() {
    startTransition(async () => {
      const result = await updateFeaturedBadges(selected);
      if (result.error) {
        setMessage({ type: 'error', text: result.error });
      } else {
        setMessage({ type: 'success', text: 'Featured badges updated!' });
      }
    });
  }

  if (earnedBadges.length === 0) {
    return (
      <div className={cn('rounded-card border border-border-subtle bg-surface p-6 text-center', className)}>
        <p className="text-body-sm text-text-secondary">
          Earn some badges first to feature them on your profile!
        </p>
      </div>
    );
  }

  return (
    <div className={cn('space-y-4', className)}>
      <p className="text-body-sm text-text-secondary">
        Choose up to 3 badges to display on the leaderboard. Tap to select/deselect.
      </p>

      <div className="flex flex-wrap gap-3">
        {earnedBadges.map((badge) => {
          const isSelected = selected.includes(badge.id);
          const tier = TIER_CONFIG[badge.tier];

          return (
            <button
              key={badge.id}
              onClick={() => toggleBadge(badge.id)}
              className={cn(
                'flex flex-col items-center gap-1.5 rounded-card border p-3 transition-all duration-150',
                isSelected
                  ? [tier.borderClass, tier.bgClass, 'ring-2', `ring-${badge.tier === 'legendary' ? 'gold' : badge.tier === 'epic' ? '[#A855F7]' : badge.tier === 'rare' ? 'info' : 'success'}/40`]
                  : 'border-border bg-surface hover:bg-surface-elevated',
                selected.length >= 3 && !isSelected && 'opacity-40 cursor-not-allowed',
              )}
              disabled={selected.length >= 3 && !isSelected}
              aria-pressed={isSelected}
              aria-label={`${badge.name}${isSelected ? ' (selected)' : ''}`}
            >
              <BadgeIcon badge={badge} earned showTooltip={false} size="sm" />
              <span className="text-[11px] font-medium text-text-primary">{badge.name}</span>
            </button>
          );
        })}
      </div>

      {/* Save button */}
      <div className="flex items-center gap-3">
        <Button
          onClick={handleSave}
          disabled={isPending}
          className="min-w-[120px]"
        >
          {isPending ? 'Saving...' : 'Save Badges'}
        </Button>

        <span className="text-caption text-text-tertiary">
          {selected.length}/3 selected
        </span>
      </div>

      {message && (
        <p
          className={cn(
            'text-body-sm',
            message.type === 'success' ? 'text-success' : 'text-error',
          )}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}
