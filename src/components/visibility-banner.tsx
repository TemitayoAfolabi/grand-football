'use client';

import { Eye, EyeOff, Info } from 'lucide-react';
import { Countdown } from '@/components/countdown';

interface VisibilityBannerProps {
  visibility: 'visible' | 'hidden' | 'own_only';
  firstKickoff: string | null;
  isOwnProfile: boolean;
}

export function VisibilityBanner({
  visibility,
  firstKickoff,
  isOwnProfile,
}: VisibilityBannerProps) {
  // Don't show banner for own profile when everything is visible
  if (isOwnProfile && visibility !== 'hidden') return null;

  if (visibility === 'visible') {
    return (
      <div className="flex items-center gap-2 rounded-card border border-success/20 bg-success/10 px-4 py-3">
        <Eye className="h-4 w-4 shrink-0 text-success" aria-hidden="true" />
        <p className="text-body-sm text-success">
          Everyone&apos;s predictions are now visible.
        </p>
      </div>
    );
  }

  if (visibility === 'hidden') {
    return (
      <div className="flex items-center gap-2 rounded-card border border-warning/20 bg-warning/10 px-4 py-3">
        <EyeOff className="h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
        <div className="flex-1">
          <p className="text-body-sm font-medium text-warning">
            Predictions hidden until kickoff
          </p>
          <p className="mt-0.5 text-caption text-warning/80">
            Since you&apos;ve submitted yours, others stay hidden to keep it fair.
            {firstKickoff && (
              <>
                {' '}
                Reveals in <Countdown targetDate={firstKickoff} />
              </>
            )}
          </p>
        </div>
      </div>
    );
  }

  // own_only
  return (
    <div className="flex items-center gap-2 rounded-card border border-border bg-surface-elevated px-4 py-3">
      <Info className="h-4 w-4 shrink-0 text-text-tertiary" aria-hidden="true" />
      <p className="text-body-sm text-text-secondary">
        No fixtures found for this gameweek yet.
      </p>
    </div>
  );
}
