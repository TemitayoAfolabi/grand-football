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

export function StatCard({ icon: Icon, label, value, trend, trendValue, className }: StatCardProps) {
  return (
    <div
      className={cn(
        'rounded-card border border-border bg-surface p-4 shadow-card',
        className,
      )}
    >
      <div className="flex items-start justify-between">
        <div className="flex h-10 w-10 items-center justify-center rounded-card bg-accent-muted">
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
      <div className="mt-3">
        <p className="text-stat font-bold tabular-nums text-text-primary">{value}</p>
        <p className="mt-0.5 text-stat-label uppercase tracking-wider text-text-secondary">
          {label}
        </p>
      </div>
    </div>
  );
}
