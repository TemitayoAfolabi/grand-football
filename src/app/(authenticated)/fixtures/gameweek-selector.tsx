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
      className="hide-scrollbar relative flex gap-2 overflow-x-auto pb-1"
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
            'shrink-0 rounded-pill px-4 py-2 text-body-sm font-medium transition-all duration-150',
            gw === selected
              ? 'bg-accent text-text-inverse shadow-glow-accent'
              : 'bg-surface-elevated border border-border text-text-secondary hover:text-text-primary hover:border-border-strong',
          )}
        >
          GW {gw}
        </Link>
      ))}
    </div>
  );
}
