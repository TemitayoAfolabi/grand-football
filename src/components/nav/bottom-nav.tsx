'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Calendar, Trophy, Star, Award } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Route } from 'next';

const items: { href: Route; label: string; Icon: typeof Home }[] = [
  { href: '/' as Route, label: 'Home', Icon: Home },
  { href: '/fixtures' as Route, label: 'Fixtures', Icon: Calendar },
  { href: '/star-man' as Route, label: 'Star Man', Icon: Star },
  { href: '/leaderboard' as Route, label: 'Board', Icon: Trophy },
  { href: '/badges' as Route, label: 'Badges', Icon: Award },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-bg-primary/85 backdrop-blur-lg pb-safe tablet:hidden"
      aria-label="Main navigation"
    >
      <ul className="flex list-none items-center justify-around">
        {items.map(({ href, label, Icon }) => {
          const isActive = href === '/' ? pathname === '/' : pathname.startsWith(href);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                className={cn(
                  'relative flex flex-col items-center gap-1 rounded-input border border-transparent px-2 py-3 text-nav transition-all duration-200',
                  isActive
                    ? 'bg-accent/10 border-accent/30 text-accent font-bold'
                    : 'text-text-tertiary hover:text-text-secondary hover:border-border hover:bg-surface-elevated/50',
                )}
                aria-current={isActive ? 'page' : undefined}
              >
                <Icon className="h-5 w-5" aria-hidden="true" />
                <span>{label}</span>
                {isActive && (
                  <span className="absolute bottom-1.5 h-1 w-1 rounded-full bg-accent" aria-hidden="true" />
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
