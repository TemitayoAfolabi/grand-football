'use client';

import { Eye, EyeOff, Info, AlertCircle } from 'lucide-react';
import { Countdown } from '@/components/countdown';

interface VisibilityBannerProps {
  visibility: 'visible' | 'hidden' | 'own_only' | 'partial';
  firstKickoff: string | null;
  isOwnProfile: boolean;
}

export function VisibilityBanner({
  visibility,
  firstKickoff,
  isOwnProfile,
}: VisibilityBannerProps) {
  // Don't show banner for own profile when everything is visible
  if (isOwnProfile && visibility !== 'hidden' && visibility !== 'partial') return null;

  if (visibility === 'visible') {
    return (
      <div className="flex items-center gap-2 rounded-card border border-success/20 bg-success/10 px-4 py-3">
        <Eye className="h-4 w-4 shrink-0 text-success" aria-hidden="true" />
        <p className="text-body-sm text-success">
          {isOwnProfile
            ? "Everyone\u2019s predictions are now visible."
            : firstKickoff && new Date(firstKickoff) > new Date()
              ? "You\u2019ve locked in your predictions \u2014 here\u2019s what everyone else predicted!"
              : "Everyone\u2019s predictions are now visible."}
        </p>
      </div>
    );
  }

  if (visibility === 'partial') {
    return (
      <div className="flex items-center gap-2 rounded-card border border-accent/20 bg-accent/10 px-4 py-3">
        <AlertCircle className="h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
        <div className="flex-1">
          <p className="text-body-sm font-medium text-accent">
            Some predictions are hidden
          </p>
          <p className="mt-0.5 text-caption text-accent/80">
            Predictions for each fixture become visible once you submit yours for that fixture, or when it kicks off.
          </p>
        </div>
      </div>
    );
  }

  if (visibility === 'hidden') {
    return (
      <div className="flex items-center gap-2 rounded-card border border-warning/20 bg-warning/10 px-4 py-3">
        <EyeOff className="h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
        <div className="flex-1">
          <p className="text-body-sm font-medium text-warning">
            Predictions hidden until you submit yours
          </p>
          <p className="mt-0.5 text-caption text-warning/80">
            Submit your predictions first to see what others predicted.
            {firstKickoff && (
              <>
                {' '}
                Kickoff in <Countdown targetDate={firstKickoff} />
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
