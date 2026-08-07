'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { TIER_CONFIG, getBadge } from '@/lib/badges/definitions';

interface BadgeToastProps {
  badgeId: string;
  onDismiss: () => void;
}

export function BadgeToast({ badgeId, onDismiss }: BadgeToastProps) {
  const [visible, setVisible] = useState(false);
  const badge = getBadge(badgeId);

  useEffect(() => {
    // Animate in
    const showTimer = setTimeout(() => setVisible(true), 50);

    // Auto-dismiss after 5s
    const dismissTimer = setTimeout(() => {
      setVisible(false);
      setTimeout(onDismiss, 300);
    }, 5000);

    return () => {
      clearTimeout(showTimer);
      clearTimeout(dismissTimer);
    };
  }, [onDismiss]);

  if (!badge) return null;

  const tier = TIER_CONFIG[badge.tier];

  return (
    <div
      className={cn(
        'fixed left-1/2 top-4 z-[100] -translate-x-1/2 transition-all duration-300',
        visible ? 'translate-y-0 opacity-100' : '-translate-y-4 opacity-0',
      )}
      role="alert"
      aria-live="polite"
    >
      <div
        className={cn(
          'flex items-center gap-3 rounded-card border px-4 py-3 shadow-card backdrop-blur-xl',
          'bg-surface-elevated/95',
          tier.borderClass,
          tier.glowClass,
        )}
      >
        {/* Badge icon */}
        <div
          className={cn(
            'flex h-12 w-12 shrink-0 items-center justify-center rounded-full',
            tier.bgClass,
            'border',
            tier.borderClass,
            badge.tier === 'legendary' && 'animate-pulse-glow',
          )}
        >
          <span className="text-2xl" aria-hidden="true">
            {badge.icon}
          </span>
        </div>

        {/* Text */}
        <div className="min-w-0">
          <p className="text-caption font-bold uppercase tracking-normal text-text-tertiary">
            Badge Unlocked!
          </p>
          <p className={cn('text-body font-semibold', tier.color)}>{badge.name}</p>
          <p className="text-caption text-text-secondary">{badge.description}</p>
        </div>

        {/* Dismiss */}
        <button
          onClick={() => {
            setVisible(false);
            setTimeout(onDismiss, 300);
          }}
          className="ml-2 shrink-0 rounded-full p-1 text-text-tertiary transition-colors hover:text-text-primary"
          aria-label="Dismiss"
        >
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// Manager component that queues multiple badge toasts
interface BadgeToastManagerProps {
  newBadgeIds: string[];
  onAllDismissed?: () => void;
}

export function BadgeToastManager({ newBadgeIds, onAllDismissed }: BadgeToastManagerProps) {
  const [queue, setQueue] = useState<string[]>(newBadgeIds);

  useEffect(() => {
    setQueue(newBadgeIds);
  }, [newBadgeIds]);

  useEffect(() => {
    if (queue.length === 0) {
      onAllDismissed?.();
    }
  }, [queue.length, onAllDismissed]);

  if (queue.length === 0) {
    return null;
  }

  const currentBadgeId = queue[0]!;

  return (
    <BadgeToast
      key={currentBadgeId}
      badgeId={currentBadgeId}
      onDismiss={() => setQueue((q) => q.slice(1))}
    />
  );
}
