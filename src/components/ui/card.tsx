import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

type CardVariant = 'default' | 'elevated' | 'glass' | 'accent' | 'gold';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  noPadding?: boolean;
  variant?: CardVariant;
  hoverable?: boolean;
}

const variantStyles: Record<CardVariant, string> = {
  default: 'card-gradient border-border shadow-card',
  elevated: 'card-gradient border-border-strong shadow-card-hover',
  glass: 'glass border-border-subtle shadow-card',
  accent: 'card-gradient border-border shadow-card bg-gradient-card-accent',
  gold: 'card-gradient border-gold/30 shadow-card card-featured-glow',
};

export function Card({
  className,
  noPadding = false,
  variant = 'default',
  hoverable = false,
  children,
  ...props
}: CardProps) {
  return (
    <div
      className={cn(
        'rounded-card border transition-all duration-200',
        variantStyles[variant],
        !noPadding && 'p-4 tablet:p-5',
        hoverable &&
          'cursor-pointer active:scale-[0.97] desktop:hover:-translate-y-[3px] desktop:hover:shadow-card-hover',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('mb-3 flex items-center justify-between', className)} {...props}>
      {children}
    </div>
  );
}

export function CardTitle({ className, children, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3 className={cn('text-h3 text-text-primary', className)} {...props}>
      {children}
    </h3>
  );
}
