import { createClient } from '@/lib/supabase/server';
import { BadgeGrid } from '@/components/badges/badge-grid';
import { BadgeSelector } from '@/components/badges/badge-selector';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { GlowDivider } from '@/components/glow-divider';
import { Award, Sparkles } from 'lucide-react';

export const metadata = {
  title: 'My Badges',
};

export default async function BadgesPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const userId = user!.id;

  const { data: userBadges } = await supabase
    .from('user_badges')
    .select('badge_id, earned_at')
    .eq('user_id', userId)
    .order('earned_at', { ascending: false });

  const { data: profile } = await supabase
    .from('profiles')
    .select('featured_badges')
    .eq('id', userId)
    .single();

  const earnedBadgeIds = (userBadges ?? []).map((b) => b.badge_id);
  const featuredBadges = (profile?.featured_badges as string[]) ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Award className="h-7 w-7 text-accent" aria-hidden="true" />
        <h1 className="text-h1 text-text-primary">My Badges</h1>
      </div>

      <p className="text-body-sm text-text-secondary">
        Earn badges by making predictions, climbing the leaderboard, and hitting milestones.
        Badges are purely for fun and don&apos;t affect your score.
      </p>

      {/* Featured badge selector */}
      <Card>
        <CardHeader>
          <CardTitle>
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-gold" aria-hidden="true" />
              Featured Badges
            </div>
          </CardTitle>
        </CardHeader>
        <div className="px-4 pb-4">
          <BadgeSelector
            earnedBadgeIds={earnedBadgeIds}
            currentFeatured={featuredBadges}
          />
        </div>
      </Card>

      <GlowDivider />

      {/* Full badge collection */}
      <BadgeGrid earnedBadges={userBadges ?? []} />
    </div>
  );
}
