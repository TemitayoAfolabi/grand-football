'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Calendar, Trophy, Star, Award, Shield } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Route } from 'next';

const baseItems: { href: Route; label: string; Icon: typeof Home }[] = [
  { href: '/' as Route, label: 'Home', Icon: Home },
  { href: '/fixtures' as Route, label: 'Fixtures', Icon: Calendar },
  { href: '/star-man' as Route, label: 'Star', Icon: Star },
  { href: '/leaderboard' as Route, label: 'Board', Icon: Trophy },
  { href: '/badges' as Route, label: 'Badges', Icon: Award },
];

const adminItem = { href: '/admin' as Route, label: 'Admin', Icon: Shield };

interface BottomNavProps {
  isAdmin?: boolean;
}

export function BottomNav({ isAdmin = false }: BottomNavProps) {
  const pathname = usePathname();
  const items = isAdmin ? [...baseItems, adminItem] : baseItems;

  return (
    <nav
      className="bg-bg-primary/92 pb-safe fixed bottom-0 left-0 right-0 z-50 border-t border-border backdrop-blur-xl tablet:hidden"
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
                  'relative flex min-h-[64px] flex-col items-center justify-center gap-1 rounded-input border border-transparent py-2 text-nav transition-all duration-200',
                  isAdmin ? 'px-0.5' : 'px-1',
                  isActive
                    ? 'border-accent/30 bg-accent/10 font-bold text-accent'
                    : 'text-text-tertiary hover:border-border hover:bg-surface-elevated/50 hover:text-text-secondary',
                )}
                aria-current={isActive ? 'page' : undefined}
              >
                <Icon className={cn('h-5 w-5 shrink-0', isAdmin && 'h-4 w-4')} aria-hidden="true" />
                <span className="max-w-full truncate whitespace-nowrap">{label}</span>
                {isActive && (
                  <span
                    className="absolute bottom-1.5 h-1 w-1 rounded-full bg-accent"
                    aria-hidden="true"
                  />
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
