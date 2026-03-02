import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(request: NextRequest) {
  // 1. Verify CRON_SECRET
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const supabase = createAdminClient();

    // 2. Determine previous month (YYYY-MM format)
    const now = new Date();
    const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const monthStr = `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, '0')}-01`;

    // 3. Get active season
    const { data: season, error: seasonError } = await supabase
      .from('seasons')
      .select('id')
      .eq('is_active', true)
      .single();

    if (seasonError || !season) {
      return NextResponse.json(
        { error: 'No active season found' },
        { status: 404 },
      );
    }

    // 4. Call calculate_monthly_bonus RPC
    const { data: bonusCount, error: rpcError } = await supabase.rpc(
      'calculate_monthly_bonus',
      {
        p_season_id: season.id,
        p_month: monthStr,
      },
    );

    if (rpcError) {
      return NextResponse.json(
        { error: rpcError.message },
        { status: 500 },
      );
    }

    // 5. Return summary
    return NextResponse.json({
      month: monthStr,
      seasonId: season.id,
      bonusesAwarded: bonusCount ?? 0,
    });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 },
    );
  }
}
