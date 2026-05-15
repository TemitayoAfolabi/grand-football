import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  FOOTBALL_DATA_BASE_URL,
  FIXTURE_STATUS,
  LIVE_SYNC_INTERVAL_MS,
  MATCH_DAY_SYNC_INTERVAL_MS,
  FULL_SYNC_INTERVAL_MS,
} from '@/lib/constants';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';

type SyncMode = 'live' | 'match_day' | 'full' | 'skipped';

interface ApiMatch {
  id: number;
  matchday: number;
  utcDate: string;
  status: string;
  minute?: number | null;
  score: {
    fullTime: {
      home: number | null;
      away: number | null;
    };
    halfTime?: {
      home: number | null;
      away: number | null;
    };
  };
  homeTeam: {
    name: string;
    crest: string;
  };
  awayTeam: {
    name: string;
    crest: string;
  };
}

function mapApiStatus(apiStatus: string): string {
  const statusMap: Record<string, string> = {
    SCHEDULED: FIXTURE_STATUS.SCHEDULED,
    TIMED: FIXTURE_STATUS.TIMED,
    IN_PLAY: FIXTURE_STATUS.IN_PLAY,
    PAUSED: FIXTURE_STATUS.PAUSED,
    FINISHED: FIXTURE_STATUS.FINISHED,
    POSTPONED: FIXTURE_STATUS.POSTPONED,
    CANCELLED: FIXTURE_STATUS.CANCELLED,
    SUSPENDED: FIXTURE_STATUS.SUSPENDED,
  };
  return statusMap[apiStatus] ?? FIXTURE_STATUS.SCHEDULED;
}

async function logSync(
  supabase: SupabaseClient<Database>,
  mode: SyncMode,
  status: 'success' | 'error',
  startTime: number,
  extras?: {
    fixtures_updated?: number;
    scores_calculated?: number;
    api_calls_made?: number;
    error_message?: string;
  },
) {
  await supabase.from('sync_log').insert({
    mode,
    status,
    fixtures_updated: extras?.fixtures_updated ?? 0,
    scores_calculated: extras?.scores_calculated ?? 0,
    api_calls_made: extras?.api_calls_made ?? 0,
    error_message: extras?.error_message ?? null,
    duration_ms: Date.now() - startTime,
  });
}

export async function POST(request: NextRequest) {
  // 1. Verify CRON_SECRET
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startTime = Date.now();
  const supabase = createAdminClient();

  try {
    // 2. Get active season
    const { data: season, error: seasonError } = await supabase
      .from('seasons')
      .select('*')
      .eq('is_active', true)
      .single();

    if (seasonError || !season) {
      return NextResponse.json(
        { error: 'No active season found' },
        { status: 404 },
      );
    }

    // 3. Determine sync mode based on current state
    const { data: liveFixtures } = await supabase
      .from('fixtures')
      .select('id')
      .eq('season_id', season.id)
      .in('status', [FIXTURE_STATUS.IN_PLAY, FIXTURE_STATUS.PAUSED]);

    const hasLiveMatches = (liveFixtures?.length ?? 0) > 0;

    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setUTCHours(23, 59, 59, 999);

    const { count: todayCount } = await supabase
      .from('fixtures')
      .select('id', { count: 'exact', head: true })
      .eq('season_id', season.id)
      .gte('kickoff_time', todayStart.toISOString())
      .lte('kickoff_time', todayEnd.toISOString());

    const hasMatchesToday = (todayCount ?? 0) > 0;

    let mode: SyncMode;
    let intervalMs: number;

    if (hasLiveMatches) {
      mode = 'live';
      intervalMs = LIVE_SYNC_INTERVAL_MS;
    } else if (hasMatchesToday) {
      mode = 'match_day';
      intervalMs = MATCH_DAY_SYNC_INTERVAL_MS;
    } else {
      mode = 'full';
      intervalMs = FULL_SYNC_INTERVAL_MS;
    }

    // 4. Check last sync time — self-throttle if too recent
    const { data: lastSync } = await supabase
      .from('sync_log')
      .select('ran_at')
      .eq('status', 'success')
      .neq('mode', 'skipped')
      .order('ran_at', { ascending: false })
      .limit(1)
      .single();

    if (lastSync) {
      const elapsed = Date.now() - new Date(lastSync.ran_at).getTime();
      if (elapsed < intervalMs) {
        await logSync(supabase, 'skipped', 'success', startTime);
        return NextResponse.json({
          mode: 'skipped',
          elapsed,
          intervalMs,
        });
      }
    }

    // 5. Fetch from football-data.org API
    const apiKey = process.env.FOOTBALL_DATA_API_KEY;
    if (!apiKey) {
      await logSync(supabase, mode, 'error', startTime, {
        error_message: 'FOOTBALL_DATA_API_KEY not configured',
      });
      return NextResponse.json(
        { error: 'FOOTBALL_DATA_API_KEY not configured' },
        { status: 500 },
      );
    }

    const response = await fetch(
      `${FOOTBALL_DATA_BASE_URL}/competitions/PL/matches?season=2025`,
      {
        headers: { 'X-Auth-Token': apiKey },
        next: { revalidate: 0 },
      },
    );

    if (!response.ok) {
      await logSync(supabase, mode, 'error', startTime, {
        api_calls_made: 1,
        error_message: `API responded with ${response.status}`,
      });
      return NextResponse.json(
        { error: `API responded with ${response.status}` },
        { status: 502 },
      );
    }

    const apiData = (await response.json()) as { matches?: ApiMatch[] };
    const matches: ApiMatch[] = apiData.matches ?? [];

    // 6. Get existing fixtures to detect newly finished ones
    const { data: existingFixtures } = await supabase
      .from('fixtures')
      .select('api_fixture_id, status, manually_overridden')
      .eq('season_id', season.id);

    const existingMap = new Map(
      (existingFixtures ?? []).map((f) => [f.api_fixture_id, f]),
    );

    let synced = 0;
    const newlyFinished: string[] = [];

    // 7. Upsert fixtures
    for (const match of matches) {
      const existing = existingMap.get(match.id);
      const mappedStatus = mapApiStatus(match.status);
      const isLive =
        mappedStatus === FIXTURE_STATUS.IN_PLAY ||
        mappedStatus === FIXTURE_STATUS.PAUSED;
      const wasNotFinished = existing?.status !== FIXTURE_STATUS.FINISHED;
      const isNowFinished = mappedStatus === FIXTURE_STATUS.FINISHED;

      // For manually overridden fixtures: only update scores/status when game finishes or is live
      // Preserve admin's gameweek and kickoff_time
      if (existing?.manually_overridden) {
        if (isNowFinished || isLive) {
          // Get fixture ID for the update
          const { data: fixtureData } = await supabase
            .from('fixtures')
            .select('id')
            .eq('api_fixture_id', match.id)
            .single();

          if (fixtureData) {
            const updateData: Partial<Database['public']['Tables']['fixtures']['Update']> = {
              status: mappedStatus,
              home_score: match.score.fullTime.home,
              away_score: match.score.fullTime.away,
              updated_at: new Date().toISOString(),
              ...(isLive
                ? {
                    live_home_score: match.score.fullTime.home,
                    live_away_score: match.score.fullTime.away,
                    match_minute: match.minute ?? null,
                  }
                : {}),
            };

            await supabase
              .from('fixtures')
              .update(updateData)
              .eq('id', fixtureData.id);

            synced++;

            if (wasNotFinished && isNowFinished) {
              newlyFinished.push(fixtureData.id);
            }
          }
        }
        continue;
      }

      const upsertData: Database['public']['Tables']['fixtures']['Insert'] = {
        season_id: season.id,
        api_fixture_id: match.id,
        home_team: match.homeTeam.name,
        away_team: match.awayTeam.name,
        home_team_crest: match.homeTeam.crest,
        away_team_crest: match.awayTeam.crest,
        kickoff_time: match.utcDate,
        status: mappedStatus,
        home_score: match.score.fullTime.home,
        away_score: match.score.fullTime.away,
        gameweek: match.matchday,
        updated_at: new Date().toISOString(),
        // Live match extras
        ...(isLive
          ? {
              live_home_score: match.score.fullTime.home,
              live_away_score: match.score.fullTime.away,
              match_minute: match.minute ?? null,
            }
          : {}),
      };

      const { data: upserted } = await supabase
        .from('fixtures')
        .upsert(upsertData, { onConflict: 'api_fixture_id' })
        .select('id')
        .single();

      synced++;

      // 8. Track newly finished fixtures
      if (wasNotFinished && isNowFinished && upserted?.id) {
        newlyFinished.push(upserted.id);
      }
    }

    // 9. Auto-trigger score calculation for newly finished fixtures
    let scoresCalculated = 0;
    for (const fixtureId of newlyFinished) {
      const { data } = await supabase.rpc('calculate_fixture_scores', {
        p_fixture_id: fixtureId,
      });
      scoresCalculated += data ?? 0;
    }

    // 10. Log successful sync
    await logSync(supabase, mode, 'success', startTime, {
      fixtures_updated: synced,
      scores_calculated: scoresCalculated,
      api_calls_made: 1,
    });

    return NextResponse.json({
      mode,
      synced,
      newlyFinished: newlyFinished.length,
      scoresCalculated,
      seasonId: season.id,
    });
  } catch (err) {
    await logSync(supabase, 'full', 'error', startTime, {
      error_message: (err as Error).message,
    }).catch(() => {});
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 },
    );
  }
}
