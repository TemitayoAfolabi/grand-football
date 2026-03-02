import { cn } from '@/lib/utils';

interface ScoreDisplayProps {
  homeTeam: string;
  awayTeam: string;
  homeScore: number | null;
  awayScore: number | null;
  large?: boolean;
  className?: string;
}

export function ScoreDisplay({
  homeTeam,
  awayTeam,
  homeScore,
  awayScore,
  large = false,
  className,
}: ScoreDisplayProps) {
  return (
    <div className={cn('flex items-center justify-center gap-3 text-center', className)}>
      <span className="min-w-0 flex-1 truncate text-right text-body font-semibold text-text-primary">
        {homeTeam}
      </span>
      <div className="flex shrink-0 items-center gap-2 tabular-nums">
        <span className={cn(
          'font-extrabold text-text-primary',
          large ? 'text-display' : 'text-score',
        )}>
          {homeScore ?? '-'}
        </span>
        <span className="text-text-tertiary text-h3">:</span>
        <span className={cn(
          'font-extrabold text-text-primary',
          large ? 'text-display' : 'text-score',
        )}>
          {awayScore ?? '-'}
        </span>
      </div>
      <span className="min-w-0 flex-1 truncate text-left text-body font-semibold text-text-primary">
        {awayTeam}
      </span>
    </div>
  );
}
