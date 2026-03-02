import { cn } from '@/lib/utils';
import { Trophy } from 'lucide-react';

interface PodiumEntry {
  rank: number;
  display_name: string;
  total_points: number;
}

interface PodiumProps {
  entries: PodiumEntry[];
  className?: string;
}

const podiumConfig = {
  1: {
    height: 'h-28',
    color: 'text-podium-gold',
    bg: 'bg-podium-gold/10',
    border: 'border-podium-gold/30',
    glow: 'shadow-glow-gold',
    label: '1st',
    delay: '400ms',
  },
  2: {
    height: 'h-20',
    color: 'text-podium-silver',
    bg: 'bg-podium-silver/10',
    border: 'border-podium-silver/30',
    glow: '',
    label: '2nd',
    delay: '0ms',
  },
  3: {
    height: 'h-16',
    color: 'text-podium-bronze',
    bg: 'bg-podium-bronze/10',
    border: 'border-podium-bronze/30',
    glow: '',
    label: '3rd',
    delay: '200ms',
  },
} as const;

export function Podium({ entries, className }: PodiumProps) {
  if (entries.length < 3) return null;

  // Reorder: 2nd, 1st, 3rd for visual layout
  const ordered = [entries[1], entries[0], entries[2]].filter(Boolean) as PodiumEntry[];

  return (
    <div className={cn('flex items-end justify-center gap-3 px-4 py-6', className)}>
      {ordered.map((entry, index) => {
        const config = podiumConfig[entry.rank as 1 | 2 | 3];
        if (!config) return null;

        return (
          <div
            key={`${entry.rank}-${entry.display_name ?? index}`}
            className="flex flex-1 max-w-[140px] flex-col items-center gap-2 opacity-0 animate-podium-rise"
            style={{ animationDelay: config.delay }}
          >
            {/* Avatar circle */}
            <div
              className={cn(
                'flex h-12 w-12 items-center justify-center rounded-full border-2 text-h3 font-bold',
                config.bg,
                config.border,
                config.color,
              )}
            >
              {entry.display_name?.charAt(0)?.toUpperCase() || '?'}
            </div>

            {/* Name */}
            <span className="w-full truncate text-center text-body-sm font-medium text-text-primary">
              {entry.display_name || 'Anonymous'}
            </span>

            {/* Points */}
            <span className={cn('text-stat font-bold tabular-nums', config.color)}>
              {entry.total_points}
            </span>

            {/* Podium pedestal */}
            <div
              className={cn(
                'w-full rounded-t-card border border-b-0',
                config.height,
                config.bg,
                config.border,
                config.glow,
                'flex items-center justify-center',
              )}
            >
              <div className="flex flex-col items-center gap-1">
                <Trophy className={cn('h-5 w-5', config.color)} aria-hidden="true" />
                <span className={cn('text-caption font-bold uppercase', config.color)}>
                  {config.label}
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
