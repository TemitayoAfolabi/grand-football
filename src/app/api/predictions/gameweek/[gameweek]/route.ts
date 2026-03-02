import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: { gameweek: string } },
) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const gameweek = parseInt(params.gameweek, 10);
  if (isNaN(gameweek) || gameweek < 1 || gameweek > 38) {
    return NextResponse.json({ error: 'Invalid gameweek' }, { status: 400 });
  }

  const seasonId = request.nextUrl.searchParams.get('seasonId');
  if (!seasonId) {
    return NextResponse.json({ error: 'seasonId is required' }, { status: 400 });
  }

  // Get fixtures for this gameweek that have kicked off
  const { data: fixtures, error: fixturesError } = await supabase
    .from('fixtures')
    .select('*')
    .eq('season_id', seasonId)
    .eq('gameweek', gameweek)
    .lte('kickoff_time', new Date().toISOString())
    .order('kickoff_time', { ascending: true });

  if (fixturesError) {
    return NextResponse.json(
      { error: fixturesError.message },
      { status: 500 },
    );
  }

  if (!fixtures || fixtures.length === 0) {
    return NextResponse.json({
      predictions: [],
      fixtures: [],
      profiles: [],
    });
  }

  const fixtureIds = fixtures.map((f: { id: string }) => f.id);

  // Get all predictions for these kicked-off fixtures
  // RLS policy allows reading predictions for kicked-off fixtures
  const { data: predictions, error: predictionsError } = await supabase
    .from('predictions')
    .select('*')
    .in('fixture_id', fixtureIds);

  if (predictionsError) {
    return NextResponse.json(
      { error: predictionsError.message },
      { status: 500 },
    );
  }

  // Get profiles for all users who have predictions
  const userIds = [...new Set((predictions ?? []).map((p: { user_id: string }) => p.user_id))];
  const { data: profiles } = userIds.length
    ? await supabase
        .from('profiles')
        .select('id, display_name, avatar_url, featured_badges')
        .in('id', userIds)
    : { data: [] };

  return NextResponse.json({
    predictions: predictions ?? [],
    fixtures,
    profiles: profiles ?? [],
  });
}
