import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {}

export function Skeleton({ className, ...props }: SkeletonProps) {
  return (
    <div
      className={cn(
        'relative min-h-[16px] overflow-hidden rounded-card bg-surface-elevated',
        'after:absolute after:inset-0 after:bg-gradient-to-r after:from-transparent after:via-surface/30 after:to-transparent after:animate-shimmer',
        'after:bg-[length:200%_100%]',
        className,
      )}
      aria-hidden="true"
      {...props}
    />
  );
}
