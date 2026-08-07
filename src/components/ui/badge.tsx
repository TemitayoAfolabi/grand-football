import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

type BadgeVariant =
  | 'default'
  | 'star'
  | 'live'
  | 'locked'
  | 'success'
  | 'warning'
  | 'error'
  | 'points';

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

const variantStyles: Record<BadgeVariant, string> = {
  default: 'bg-surface-elevated text-text-secondary',
  star: 'bg-gold-muted text-gold',
  live: 'bg-error-muted text-live',
  locked: 'bg-surface-elevated text-text-tertiary',
  success: 'bg-success-muted text-success',
  warning: 'bg-warning-muted text-warning',
  error: 'bg-error-muted text-error',
  points: 'bg-accent-muted text-accent',
};

export function Badge({ className, variant = 'default', children, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-caption font-semibold tracking-normal',
        variantStyles[variant],
        className,
      )}
      {...props}
    >
      {variant === 'live' && (
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-live-pulse rounded-full bg-live" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-live" />
        </span>
      )}
      {variant === 'star' && <span aria-hidden="true">✦</span>}
      {children}
    </span>
  );
}
