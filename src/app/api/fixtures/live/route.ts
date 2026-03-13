import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Allow dynamic but with short cache for live data
export const dynamic = 'force-dynamic';

/**
 * GET /api/fixtures/live?gameweek=28
 * Returns ALL fixtures for the given gameweek (so the polling fallback
 * can detect FINISHED transitions, not just IN_PLAY/PAUSED).
 * If no gameweek param, returns only live/in-play fixtures.
 */
export async function GET(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: season } = await supabase
    .from('seasons')
    .select('id')
    .eq('is_active', true)
    .single();

  if (!season) {
    return NextResponse.json(
      { fixtures: [] },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
        },
      }
    );
  }

  const gameweekParam = request.nextUrl.searchParams.get('gameweek');

  let query = supabase
    .from('fixtures')
    .select('*')
    .eq('season_id', season.id)
    .order('kickoff_time', { ascending: true });

  if (gameweekParam) {
    // Return ALL fixtures for this gameweek (including FINISHED)
    const gw = parseInt(gameweekParam, 10);
    if (!isNaN(gw) && gw >= 1 && gw <= 50) {
      query = query.eq('gameweek', gw);
    }
  } else {
    // No gameweek specified — return only live fixtures
    query = query.in('status', ['IN_PLAY', 'PAUSED', 'SUSPENDED']);
  }

  const { data: fixtures, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Short cache for live data - 10 seconds server cache, 30 seconds stale-while-revalidate
  return NextResponse.json(
    { fixtures: fixtures ?? [] },
    {
      headers: {
        'Cache-Control': 'public, s-maxage=10, stale-while-revalidate=30',
      },
    }
  );
}
