import { cn } from '@/lib/utils';
import { Sparkles } from 'lucide-react';

interface BonusTrackerProps {
  predicted: number;
  total: number;
  eligible: boolean;
  className?: string;
}

export function BonusTracker({ predicted, total, eligible, className }: BonusTrackerProps) {
  const percentage = total > 0 ? Math.round((predicted / total) * 100) : 0;

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex items-center justify-between">
        <span className="text-body-sm text-text-secondary">Monthly Bonus Progress</span>
        <span className="text-body-sm font-semibold tabular-nums text-text-primary">
          {predicted}/{total}
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-pill bg-bg-secondary">
        <div
          className={cn(
            'h-full rounded-pill transition-all duration-700 ease-out',
            eligible ? 'bg-gradient-to-r from-accent to-gold' : 'bg-accent',
          )}
          style={{ width: `${percentage}%` }}
          role="progressbar"
          aria-valuenow={predicted}
          aria-valuemin={0}
          aria-valuemax={total}
          aria-label={`${predicted} of ${total} predictions made`}
        />
      </div>
      {eligible && (
        <div className="flex items-center gap-1.5 text-caption text-gold">
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="font-medium">Eligible for +10 bonus points!</span>
        </div>
      )}
      {!eligible && total > 0 && (
        <p className="text-caption text-text-secondary">
          Submit all predictions to earn +10 bonus points
        </p>
      )}
    </div>
  );
}
