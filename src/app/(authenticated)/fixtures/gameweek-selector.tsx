'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import type { Route } from 'next';

interface GameweekSelectorProps {
  gameweeks: number[];
  selected: number;
}

export function GameweekSelector({ gameweeks, selected }: GameweekSelectorProps) {
  const selectedRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    selectedRef.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
      inline: 'center',
    });
  }, [selected]);

  return (
    <div
      className="hide-scrollbar relative -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 tablet:mx-0 tablet:px-0"
      role="tablist"
      aria-label="Gameweek selector"
    >
      {gameweeks.map((gw) => (
        <Link
          key={gw}
          ref={gw === selected ? selectedRef : undefined}
          href={`/fixtures?gw=${gw}` as Route}
          role="tab"
          aria-selected={gw === selected}
          scroll={false}
          className={cn(
            'shrink-0 rounded-pill px-4 py-2.5 text-body-sm font-semibold transition-all duration-150',
            gw === selected
              ? 'bg-accent text-text-inverse shadow-glow-accent'
              : 'border border-border bg-surface-elevated text-text-secondary hover:border-border-strong hover:text-text-primary',
          )}
        >
          GW {gw}
        </Link>
      ))}
    </div>
  );
}
