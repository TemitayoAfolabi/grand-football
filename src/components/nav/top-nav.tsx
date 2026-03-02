'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Calendar, Trophy, User, Shield, Award } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Route } from 'next';

const items: { href: Route; label: string; Icon: typeof Home }[] = [
  { href: '/' as Route, label: 'Dashboard', Icon: Home },
  { href: '/fixtures' as Route, label: 'Fixtures', Icon: Calendar },
  { href: '/leaderboard' as Route, label: 'Leaderboard', Icon: Trophy },
  { href: '/badges' as Route, label: 'Badges', Icon: Award },
  { href: '/settings' as Route, label: 'Profile', Icon: User },
];

interface TopNavProps {
  isAdmin?: boolean;
}

export function TopNav({ isAdmin = false }: TopNavProps) {
  const pathname = usePathname();

  return (
    <nav
      className="sticky top-0 z-20 hidden border-b border-border-subtle bg-bg-primary/90 backdrop-blur-xl tablet:block"
      aria-label="Main navigation"
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link href="/" className="flex items-center gap-2 text-lg font-bold">
          <span className="text-accent">Grand</span>
          <span className="text-text-primary">Football</span>
        </Link>
        <ul className="flex list-none items-center gap-1">
          {items.map(({ href, label, Icon }) => {
            const isActive = href === '/' ? pathname === '/' : pathname.startsWith(href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  className={cn(
                    'flex items-center gap-2 rounded-input px-3 py-2 text-body-sm transition-all duration-150',
                    isActive
                      ? 'bg-accent-muted text-accent font-medium'
                      : 'text-text-secondary hover:bg-surface-elevated/30 hover:text-text-primary',
                  )}
                  aria-current={isActive ? 'page' : undefined}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  {label}
                </Link>
              </li>
            );
          })}
          {isAdmin && (
            <li>
              <Link
                href={'/admin' as Route}
                className={cn(
                  'flex items-center gap-2 rounded-input px-3 py-2 text-body-sm transition-all duration-150',
                  pathname.startsWith('/admin')
                    ? 'bg-accent-muted text-accent font-medium'
                    : 'text-text-secondary hover:bg-surface-elevated/30 hover:text-text-primary',
                )}
                aria-current={pathname.startsWith('/admin') ? 'page' : undefined}
              >
                <Shield className="h-4 w-4" aria-hidden="true" />
                Admin
              </Link>
            </li>
          )}
        </ul>
      </div>
    </nav>
  );
}
