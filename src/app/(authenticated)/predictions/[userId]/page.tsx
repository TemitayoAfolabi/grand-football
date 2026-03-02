import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { EmptyState } from '@/components/empty-state';
import { Calendar } from 'lucide-react';
import { PredictionHistoryView } from './prediction-history-view';

export const metadata = {
  title: 'Prediction History',
};

export const dynamic = 'force-dynamic';

interface PredictionHistoryPageProps {
  params: { userId: string };
  searchParams: { gw?: string };
}

export default async function PredictionHistoryPage({
  params,
  searchParams,
}: PredictionHistoryPageProps) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // Resolve "me" to current user
  const targetUserId = params.userId === 'me' ? user.id : params.userId;
  const isOwnProfile = targetUserId === user.id;

  // Get the target profile
  const { data: targetProfile } = await supabase
    .from('profiles')
    .select('id, display_name, avatar_url')
    .eq('id', targetUserId)
    .single();

  if (!targetProfile) {
    return (
      <EmptyState
        icon={Calendar}
        title="User Not Found"
        description="This user does not exist."
      />
    );
  }

  const profileName = targetProfile.display_name;
  const profileAvatar = targetProfile.avatar_url;

  // Get active season
  const { data: season } = await supabase
    .from('seasons')
    .select('*')
    .eq('is_active', true)
    .single();

  if (!season) {
    return (
      <EmptyState
        icon={Calendar}
        title="No Active Season"
        description="Waiting for the admin to start a new season."
      />
    );
  }

  const seasonId = season.id;
  const seasonName = season.name;

  // Get all gameweeks in the season
  const { data: gameweekRows } = await supabase
    .from('fixtures')
    .select('gameweek')
    .eq('season_id', seasonId)
    .order('gameweek', { ascending: true });

  const uniqueGameweeks = [...new Set((gameweekRows ?? []).map((g: { gameweek: number }) => g.gameweek))];

  // Find the "current" gameweek – prefer live, then nearest upcoming, then latest
  const now = new Date().toISOString();
  const { data: liveGwRow } = await supabase
    .from('fixtures')
    .select('gameweek')
    .eq('season_id', seasonId)
    .in('status', ['IN_PLAY', 'PAUSED', 'HALFTIME'])
    .limit(1)
    .single();

  const { data: currentGwRow } = await supabase
    .from('fixtures')
    .select('gameweek')
    .eq('season_id', seasonId)
    .gte('kickoff_time', now)
    .order('kickoff_time', { ascending: true })
    .limit(1)
    .single();

  const defaultGw = liveGwRow?.gameweek ?? currentGwRow?.gameweek ?? uniqueGameweeks[uniqueGameweeks.length - 1] ?? 1;
  const selectedGw: number = searchParams.gw ? parseInt(searchParams.gw, 10) : defaultGw;

  return (
    <PredictionHistoryView
      viewerId={user.id}
      targetUserId={targetUserId}
      targetDisplayName={profileName}
      targetAvatarUrl={profileAvatar}
      isOwnProfile={isOwnProfile}
      seasonId={seasonId}
      seasonName={seasonName}
      gameweeks={uniqueGameweeks}
      initialGameweek={selectedGw}
    />
  );
}
