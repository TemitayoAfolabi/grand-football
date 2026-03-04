import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Shield, Users, Calendar, Calculator, LayoutDashboard, Trophy, Star, BarChart3, ClipboardList } from 'lucide-react';
import type { Route } from 'next';

const adminNavItems: { href: Route; label: string; icon: typeof LayoutDashboard }[] = [
  { href: '/admin' as Route, label: 'Overview', icon: LayoutDashboard },
  { href: '/admin/users' as Route, label: 'Users', icon: Users },
  { href: '/admin/fixtures' as Route, label: 'Fixtures', icon: Calendar },
  { href: '/admin/scoring' as Route, label: 'Scoring', icon: Calculator },
  { href: '/admin/leaderboard' as Route, label: 'Leaderboard', icon: BarChart3 },
  { href: '/admin/predictions' as Route, label: 'Predictions', icon: ClipboardList },
  { href: '/admin/season' as Route, label: 'Season', icon: Trophy },
  { href: '/admin/star-man' as Route, label: 'Star Man', icon: Star },
];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = createClient();
  const { data: isAdmin } = await supabase.rpc('is_admin');

  if (!isAdmin) {
    redirect('/');
  }

  return (
    <div className="space-y-4">
      {/* Admin header */}
      <div className="flex items-center gap-2">
        <Shield className="h-5 w-5 text-accent" aria-hidden="true" />
        <h1 className="text-h1 text-text-primary">Admin Panel</h1>
      </div>

      {/* Sub-navigation */}
      <nav
        className="flex gap-1 overflow-x-auto border-b border-border pb-px"
        aria-label="Admin navigation"
      >
        {adminNavItems.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-1.5 whitespace-nowrap rounded-input px-3 py-2 text-body-sm font-medium transition-all duration-150',
                'text-text-secondary hover:text-accent hover:bg-accent-muted',
              )}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Content */}
      {children}
    </div>
  );
}
