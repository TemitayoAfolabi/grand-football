import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';

interface StatCardProps {
  icon: LucideIcon;
  label: string;
  value: string | number;
  trend?: 'up' | 'down' | 'neutral';
  trendValue?: string;
  className?: string;
}

export function StatCard({
  icon: Icon,
  label,
  value,
  trend,
  trendValue,
  className,
}: StatCardProps) {
  return (
    <div
      className={cn(
        'rounded-card border border-border bg-surface p-3 shadow-card tablet:p-4',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-card bg-accent-muted tablet:h-10 tablet:w-10">
          <Icon className="h-5 w-5 text-accent" aria-hidden="true" />
        </div>
        {trend && trendValue && (
          <span
            className={cn(
              'inline-flex items-center gap-0.5 text-caption font-medium',
              trend === 'up' && 'text-success',
              trend === 'down' && 'text-error',
              trend === 'neutral' && 'text-text-tertiary',
            )}
          >
            {trend === 'up' && '↑'}
            {trend === 'down' && '↓'}
            {trendValue}
          </span>
        )}
      </div>
      <div className="mt-3 min-w-0">
        <p className="text-stat font-bold tabular-nums text-text-primary">{value}</p>
        <p className="mt-1 truncate text-stat-label uppercase tracking-normal text-text-secondary">
          {label}
        </p>
      </div>
    </div>
  );
}
