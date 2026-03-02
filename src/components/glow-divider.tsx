import { cn } from '@/lib/utils';

interface GlowDividerProps {
  className?: string;
}

export function GlowDivider({ className }: GlowDividerProps) {
  return (
    <div
      className={cn('relative h-px w-full', className)}
      aria-hidden="true"
    >
      <div className="absolute inset-0 bg-border-subtle" />
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-accent/20 to-transparent" />
    </div>
  );
}
