import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { FIXTURE_STATUS, MAX_USERS } from '@/lib/constants';

export async function POST(request: NextRequest) {
  // 1. Verify CRON_SECRET
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const supabase = createAdminClient();

    // 2. Find FINISHED fixtures without complete score_records
    const { data: finishedFixtures } = await supabase
      .from('fixtures')
      .select('id')
      .eq('status', FIXTURE_STATUS.FINISHED);

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

      // If score records are less than expected user count, recalculate
      if ((count ?? 0) < MAX_USERS) {
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
