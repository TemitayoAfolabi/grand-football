import { createClient } from '@/lib/supabase/server';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Users, Calendar, Trophy, Star } from 'lucide-react';
import Link from 'next/link';
import type { Route } from 'next';

export const metadata = {
  title: 'Admin Overview',
};

export default async function AdminDashboardPage() {
  const supabase = createClient();

  // Total users
  const { count: totalUsers } = await supabase
    .from('profiles')
    .select('id', { count: 'exact', head: true });

  // Active season
  const { data: season } = await supabase
    .from('seasons')
    .select('*')
    .eq('is_active', true)
    .single();

  // Upcoming fixtures count
  const { count: upcomingFixtures } = await supabase
    .from('fixtures')
    .select('id', { count: 'exact', head: true })
    .in('status', ['SCHEDULED', 'TIMED']);

  // Total allowlisted emails
  const { count: allowlistCount } = await supabase
    .from('allowlist')
    .select('id', { count: 'exact', head: true });

  // Star Man session status
  const { data: starManSession } = season
    ? await supabase
        .from('star_man_sessions')
        .select('id, status')
        .eq('season_id', season.id)
        .single()
    : { data: null };

  const statCards: { label: string; value: number | string; icon: typeof Users; href: Route; color: string }[] = [
    {
      label: 'Total Users',
      value: totalUsers ?? 0,
      icon: Users,
      href: '/admin/users' as Route,
      color: 'text-accent',
    },
    {
      label: 'Upcoming Fixtures',
      value: upcomingFixtures ?? 0,
      icon: Calendar,
      href: '/admin/fixtures' as Route,
      color: 'text-info',
    },
    {
      label: 'Allowlisted Emails',
      value: allowlistCount ?? 0,
      icon: Users,
      href: '/admin/users' as Route,
      color: 'text-gold',
    },
    {
      label: 'Star Man',
      value: starManSession?.status ?? 'None',
      icon: Star,
      href: '/admin/star-man' as Route,
      color: 'text-gold',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Active Season */}
      <Card>
        <CardHeader>
          <CardTitle>
            <div className="flex items-center gap-2">
              <Trophy className="h-4 w-4 text-gold" aria-hidden="true" />
              Active Season
            </div>
          </CardTitle>
          {season && <Badge variant="success">Active</Badge>}
        </CardHeader>
        {season ? (
          <div className="text-sm text-text-secondary">
            <p className="font-medium text-text-primary">{season.name}</p>
            {season.start_date && (
              <p>
                Started:{' '}
                {new Date(season.start_date).toLocaleDateString('en-GB')}
              </p>
            )}
          </div>
        ) : (
          <p className="text-sm text-text-secondary">
            No active season. Create one to get started.
          </p>
        )}
      </Card>

      {/* Stats grid */}
      <div className="grid grid-cols-1 gap-3 tablet:grid-cols-3">
        {statCards.map((stat) => {
          const Icon = stat.icon;
          return (
            <Link key={stat.label} href={stat.href}>
              <Card className="transition-colors hover:border-accent/30">
                <div className="flex items-center gap-3">
                  <Icon
                    className={`h-8 w-8 ${stat.color}`}
                    aria-hidden="true"
                  />
                  <div>
                    <p className="text-xs text-text-secondary">{stat.label}</p>
                    <p className="text-xl font-bold text-text-primary">{stat.value}</p>
                  </div>
                </div>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
