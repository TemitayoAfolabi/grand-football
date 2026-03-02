import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * GET /api/predictions/history/[gameweek]?seasonId=X
 *
 * Returns prediction history for a gameweek with visibility enforcement.
 * All visibility logic is handled by the DB function to ensure a single
 * source of truth (PostgreSQL now()) and avoid client/server clock skew.
 *
 * Response includes:
 * - visibility: 'visible' | 'hidden' (from DB function)
 * - firstKickoff: ISO timestamp of first non-postponed kickoff
 * - viewerHasPredicted: boolean
 * - predictions: array with per-row visibility flags, scores, and points
 * - fixtures: array of fixtures in the gameweek
 * - profiles: deduplicated array of user profiles
 */
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
  if (isNaN(gameweek) || gameweek < 1 || gameweek > 50) {
    return NextResponse.json({ error: 'Invalid gameweek' }, { status: 400 });
  }

  const seasonId = request.nextUrl.searchParams.get('seasonId');
  if (!seasonId) {
    return NextResponse.json(
      { error: 'seasonId is required' },
      { status: 400 },
    );
  }

  // Single DB round-trip: get all predictions with visibility enforcement,
  // score records, and visibility metadata from the SECURITY DEFINER function.
  const { data: predictions, error: predictionsError } = await supabase.rpc(
    'get_gameweek_predictions_with_visibility',
    {
      p_viewer_id: user.id,
      p_season_id: seasonId,
      p_gameweek: gameweek,
    },
  );

  if (predictionsError) {
    return NextResponse.json(
      { error: predictionsError.message },
      { status: 500 },
    );
  }

  // Extract visibility metadata from the first row (same for all rows)
  const typedPredictions = (predictions ?? []) as Array<{
    fixture_id: string;
    user_id: string;
    display_name: string;
    avatar_url: string | null;
    home_score: number | null;
    away_score: number | null;
    submitted_at: string;
    can_view: boolean;
    is_own: boolean;
    points_awarded: number | null;
    reason_code: string | null;
    visibility: string;
    first_kickoff: string | null;
    viewer_has_predicted: boolean;
  }>;

  const visibility = typedPredictions[0]?.visibility ?? 'own_only';
  const firstKickoff = typedPredictions[0]?.first_kickoff ?? null;
  const viewerHasPredicted = typedPredictions[0]?.viewer_has_predicted ?? false;

  // Get fixtures for this gameweek (public data, no visibility concerns)
  const { data: fixtures, error: fixturesError } = await supabase
    .from('fixtures')
    .select('*')
    .eq('season_id', seasonId)
    .eq('gameweek', gameweek)
    .order('kickoff_time', { ascending: true });

  if (fixturesError) {
    return NextResponse.json(
      { error: fixturesError.message },
      { status: 500 },
    );
  }

  // Build unique profiles list from predictions
  const profileMap = new Map<
    string,
    { user_id: string; display_name: string; avatar_url: string | null }
  >();
  for (const p of typedPredictions) {
    if (!profileMap.has(p.user_id)) {
      profileMap.set(p.user_id, {
        user_id: p.user_id,
        display_name: p.display_name,
        avatar_url: p.avatar_url,
      });
    }
  }

  return NextResponse.json({
    visibility,
    firstKickoff,
    viewerHasPredicted,
    predictions: typedPredictions,
    fixtures: fixtures ?? [],
    profiles: Array.from(profileMap.values()),
    gameweek,
    seasonId,
  });
}
