import { cn } from '@/lib/utils';
import { Clock, Sparkles } from 'lucide-react';

interface BonusTrackerProps {
  predicted: number;
  total: number;
  eligible: boolean;
  onTime: number;
  className?: string;
}

export function BonusTracker({ predicted, total, eligible, onTime, className }: BonusTrackerProps) {
  const lateCount = predicted - onTime;
  const missedCount = total - predicted;
  const percentage = total > 0 ? Math.round((onTime / total) * 100) : 0;

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex items-center justify-between">
        <span className="text-body-sm text-text-secondary">Monthly Bonus Progress</span>
        <span className="text-body-sm font-semibold tabular-nums text-text-primary">
          {onTime}/{total}
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
          aria-valuenow={onTime}
          aria-valuemin={0}
          aria-valuemax={total}
          aria-label={`${onTime} of ${total} predictions on time`}
        />
      </div>
      {eligible && (
        <div className="flex items-center gap-1.5 text-caption text-gold">
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="font-medium">All on time — eligible for +10 bonus!</span>
        </div>
      )}
      {!eligible && lateCount > 0 && missedCount === 0 && (
        <div className="flex items-center gap-1.5 text-caption text-amber-500">
          <Clock className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="font-medium">
            {lateCount} late submission{lateCount !== 1 ? 's' : ''} — bonus lost
          </span>
        </div>
      )}
      {!eligible && lateCount > 0 && missedCount > 0 && (
        <p className="text-caption text-text-secondary">
          {onTime} on time · {lateCount} late · {missedCount} missed
        </p>
      )}
      {!eligible && lateCount === 0 && total > 0 && (
        <p className="text-caption text-text-secondary">
          Submit all predictions on time to earn +10 bonus points
        </p>
      )}
    </div>
  );
}
