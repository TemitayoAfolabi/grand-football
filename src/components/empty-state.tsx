import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import type { Route } from 'next';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  actionHref?: Route;
  className?: string;
}

export function EmptyState({ icon: Icon, title, description, actionLabel, actionHref, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center gap-4 py-12 text-center', className)}>
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-surface-elevated">
        <Icon className="h-8 w-8 text-text-tertiary" aria-hidden="true" />
      </div>
      <div className="space-y-1">
        <h3 className="text-h3 text-text-primary">{title}</h3>
        <p className="text-body-sm text-text-secondary">{description}</p>
      </div>
      {actionLabel && actionHref && (
        <Link href={actionHref}>
          <Button size="sm">{actionLabel}</Button>
        </Link>
      )}
    </div>
  );
}
