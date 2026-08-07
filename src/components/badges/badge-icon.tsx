'use client';

import { cn } from '@/lib/utils';
import { TIER_CONFIG, type BadgeDefinition } from '@/lib/badges/definitions';

interface BadgeIconProps {
  badge: BadgeDefinition;
  earned: boolean;
  size?: 'sm' | 'md' | 'lg';
  showTooltip?: boolean;
  className?: string;
}

const sizeMap = {
  sm: { container: 'h-10 w-10', icon: 'text-lg', ring: 'ring-1' },
  md: { container: 'h-14 w-14', icon: 'text-2xl', ring: 'ring-2' },
  lg: { container: 'h-20 w-20', icon: 'text-3xl', ring: 'ring-2' },
};

export function BadgeIcon({
  badge,
  earned,
  size = 'md',
  showTooltip = true,
  className,
}: BadgeIconProps) {
  const tier = TIER_CONFIG[badge.tier];
  const s = sizeMap[size];

  return (
    <div
      className={cn('group relative inline-flex flex-col items-center', className)}
      role={showTooltip ? 'button' : undefined}
      tabIndex={showTooltip ? 0 : undefined}
      aria-label={`${badge.name} badge${earned ? '' : ' (locked)'} — ${badge.description}`}
    >
      <div
        className={cn(
          'flex items-center justify-center rounded-full transition-all duration-300',
          s.container,
          earned
            ? [tier.bgClass, tier.borderClass, 'border', tier.glowClass]
            : 'border border-border-subtle bg-surface-elevated opacity-40 grayscale',
          earned && badge.tier === 'legendary' && 'animate-pulse-glow',
        )}
        role="img"
        aria-hidden="true"
      >
        <span className={cn(s.icon, 'select-none')} aria-hidden="true">
          {badge.icon}
        </span>
      </div>

      {/* Tooltip */}
      {showTooltip && (
        <div
          className={cn(
            'pointer-events-none absolute -top-2 left-1/2 z-50 -translate-x-1/2 -translate-y-full',
            'w-48 rounded-card border border-border bg-surface-elevated p-3 shadow-card',
            'opacity-0 transition-opacity duration-150 group-focus-within:opacity-100 group-hover:opacity-100',
          )}
          role="tooltip"
        >
          <p
            className={cn(
              'text-body-sm font-semibold',
              earned ? tier.color : 'text-text-secondary',
            )}
          >
            {badge.name}
          </p>
          <p className="mt-0.5 text-caption text-text-tertiary">{badge.description}</p>
          <span
            className={cn(
              'mt-1.5 inline-block rounded-pill px-2 py-0.5 text-caption font-bold uppercase tracking-normal',
              earned ? [tier.bgClass, tier.color] : 'bg-surface text-text-disabled',
            )}
          >
            {earned ? tier.label : 'Locked'}
          </span>
        </div>
      )}
    </div>
  );
}

// Compact inline badge for leaderboard rows
interface BadgeChipProps {
  badge: BadgeDefinition;
  className?: string;
}

export function BadgeChip({ badge, className }: BadgeChipProps) {
  const tier = TIER_CONFIG[badge.tier];

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-pill px-1.5 py-0.5',
        tier.bgClass,
        tier.borderClass,
        'border',
        className,
      )}
      role="img"
      aria-label={badge.name}
      title={`${badge.name}: ${badge.description}`}
    >
      <span className="text-caption" aria-hidden="true">
        {badge.icon}
      </span>
    </span>
  );
}
