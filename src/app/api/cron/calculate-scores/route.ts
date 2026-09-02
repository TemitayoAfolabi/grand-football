import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { FIXTURE_STATUS } from '@/lib/constants';

export async function POST(request: NextRequest) {
  // 1. Verify CRON_SECRET
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const supabase = createAdminClient();

    // 2. Find finished fixtures in the active season without a complete score
    // set. The expected count must be the actual profile count, not a fixed
    // capacity limit, otherwise every run recalculates every fixture.
    const { data: season, error: seasonError } = await supabase
      .from('seasons')
      .select('id')
      .eq('is_active', true)
      .single();
    if (seasonError || !season) {
      return NextResponse.json({ error: 'No active season found' }, { status: 404 });
    }

    const { count: profileCount, error: profileCountError } = await supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true });
    if (profileCountError) throw new Error(profileCountError.message);

    const { data: finishedFixtures, error: fixturesError } = await supabase
      .from('fixtures')
      .select('id')
      .eq('season_id', season.id)
      .eq('status', FIXTURE_STATUS.FINISHED);
    if (fixturesError) throw new Error(fixturesError.message);

    if (!finishedFixtures || finishedFixtures.length === 0) {
      return NextResponse.json({ message: 'No finished fixtures found', calculated: 0 });
    }

    let calculated = 0;
    const processed: string[] = [];

    for (const fixture of finishedFixtures) {
      // Count existing score records for this fixture
      const { count } = await supabase
        .from('score_records')
        .select('id', { count: 'exact', head: true })
        .eq('fixture_id', fixture.id);

      // If score records are less than the actual user count, recalculate.
      if ((count ?? 0) < (profileCount ?? 0)) {
        const { data } = await supabase.rpc('calculate_fixture_scores', {
          p_fixture_id: fixture.id,
        });
        calculated += data ?? 0;
        processed.push(fixture.id);
      }
    }

    // 3. Return summary
    return NextResponse.json({
      fixturesChecked: finishedFixtures.length,
      fixturesProcessed: processed.length,
      recordsCalculated: calculated,
    });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 },
    );
  }
}
