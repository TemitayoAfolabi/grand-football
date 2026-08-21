import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  fetchApiFootballFixtures,
  isLiveProviderFixture,
  type ProviderFixture,
} from '@/lib/server/api-football';
import { fetchFootballDataFixtures } from '@/lib/server/football-data';
import { fixtureKey } from '@/lib/server/fixture-matching';
import { resolveGoldenBootPicks } from '@/lib/server/golden-boot';
import {
  FIXTURE_STATUS,
  FULL_SYNC_INTERVAL_MS,
  LIVE_SYNC_INTERVAL_MS,
  MATCH_DAY_SYNC_INTERVAL_MS,
} from '@/lib/constants';
import { getPremierLeagueSeasonYear } from '@/lib/season';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';

type SyncMode = 'live' | 'match_day' | 'full' | 'skipped';
type StoredFixture = Pick<
  Database['public']['Tables']['fixtures']['Row'],
  | 'id'
  | 'api_fixture_id'
  | 'live_provider_fixture_id'
  | 'status'
  | 'manually_overridden'
  | 'gameweek'
  | 'home_team'
  | 'away_team'
>;

function isFinished(fixture: ProviderFixture) {
  return fixture.status === FIXTURE_STATUS.FINISHED;
}

function fixtureUpdate(
  fixture: ProviderFixture,
): Database['public']['Tables']['fixtures']['Update'] {
  return {
    live_provider_fixture_id: fixture.providerFixtureId,
    home_team: fixture.homeTeam,
    away_team: fixture.awayTeam,
    home_team_crest: fixture.homeTeamCrest,
    away_team_crest: fixture.awayTeamCrest,
    kickoff_time: fixture.kickoffTime,
    gameweek: fixture.gameweek,
    status: fixture.status,
    home_score: fixture.homeScore,
    away_score: fixture.awayScore,
    live_home_score: fixture.liveHomeScore,
    live_away_score: fixture.liveAwayScore,
    match_minute: fixture.matchMinute,
    updated_at: new Date().toISOString(),
  };
}

function fixtureInsert(
  seasonId: string,
  fixture: ProviderFixture,
): Database['public']['Tables']['fixtures']['Insert'] {
  return {
    season_id: seasonId,
    api_fixture_id: fixture.providerFixtureId,
    ...fixtureUpdate(fixture),
    home_team: fixture.homeTeam,
    away_team: fixture.awayTeam,
    kickoff_time: fixture.kickoffTime,
    gameweek: fixture.gameweek,
  };
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

function hasValidCronSecret(authHeader: string | null) {
  return [process.env.CRON_SECRET, process.env.SYNC_CRON_SECRET].some(
    (secret) => Boolean(secret) && authHeader === `Bearer ${secret}`,
  );
}

/** Vercel Cron invokes scheduled Route Handlers with GET requests. */
export async function GET(request: NextRequest) {
  return POST(request);
}

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!hasValidCronSecret(authHeader)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startTime = Date.now();
  const supabase = createAdminClient();

  try {
    const { data: season, error: seasonError } = await supabase
      .from('seasons')
      .select('*')
      .eq('is_active', true)
      .single();
    if (seasonError || !season) {
      return NextResponse.json({ error: 'No active season found' }, { status: 404 });
    }

    const storedApiSeason = (season as typeof season & { api_season?: number | null }).api_season;
    const nameYear = /^(20\d{2})-/.exec(season.name)?.[1];
    const apiSeason =
      storedApiSeason ?? (nameYear ? Number(nameYear) : getPremierLeagueSeasonYear());

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
    const mode: SyncMode = hasLiveMatches ? 'live' : hasMatchesToday ? 'match_day' : 'full';
    const intervalMs = hasLiveMatches
      ? LIVE_SYNC_INTERVAL_MS
      : hasMatchesToday
        ? MATCH_DAY_SYNC_INTERVAL_MS
        : FULL_SYNC_INTERVAL_MS;

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
        return NextResponse.json({ mode: 'skipped', elapsed, intervalMs });
      }
    }

    const scope = mode === 'full' ? 'season' : 'today';
    let matches: ProviderFixture[];
    let provider = 'api-football';
    let apiCallsMade = 1;
    try {
      matches = await fetchApiFootballFixtures({ season: apiSeason, scope });
    } catch (apiFootballError) {
      // API-Football's free tier does not include the current season. Keep
      // live scores working with the existing football-data.org provider.
      matches = await fetchFootballDataFixtures({ season: apiSeason, scope });
      provider = 'football-data';
      apiCallsMade = 2;
      console.warn('API-Football sync failed; using football-data.org fallback', apiFootballError);
    }
    const { data: existingFixtures, error: existingError } = await supabase
      .from('fixtures')
      .select(
        'id, api_fixture_id, live_provider_fixture_id, status, manually_overridden, gameweek, home_team, away_team',
      )
      .eq('season_id', season.id);
    if (existingError) throw new Error(existingError.message);

    const byProviderId = new Map<number, StoredFixture>();
    const byFixtureKey = new Map<string, StoredFixture>();
    for (const fixture of (existingFixtures ?? []) as StoredFixture[]) {
      if (fixture.live_provider_fixture_id != null) {
        byProviderId.set(fixture.live_provider_fixture_id, fixture);
      }
      byFixtureKey.set(fixtureKey(fixture.gameweek, fixture.home_team, fixture.away_team), fixture);
    }

    let synced = 0;
    let scoresCalculated = 0;
    let mappedLegacyFixtures = 0;
    const newlyFinished: string[] = [];

    for (const match of matches) {
      const existing =
        byProviderId.get(match.providerFixtureId) ??
        byFixtureKey.get(fixtureKey(match.gameweek, match.homeTeam, match.awayTeam));
      const wasNotFinished = existing?.status !== FIXTURE_STATUS.FINISHED;

      if (existing?.manually_overridden) {
        if (isLiveProviderFixture(match) || isFinished(match)) {
          const { error } = await supabase
            .from('fixtures')
            .update({
              live_provider_fixture_id: match.providerFixtureId,
              status: match.status,
              home_score: match.homeScore,
              away_score: match.awayScore,
              live_home_score: match.liveHomeScore,
              live_away_score: match.liveAwayScore,
              match_minute: match.matchMinute,
              updated_at: new Date().toISOString(),
            })
            .eq('id', existing.id);
          if (error) throw new Error(error.message);
          synced++;
        }
      } else if (existing) {
        const { error } = await supabase
          .from('fixtures')
          .update(fixtureUpdate(match))
          .eq('id', existing.id);
        if (error) throw new Error(error.message);
        if (existing.live_provider_fixture_id == null) mappedLegacyFixtures++;
        synced++;
      } else {
        const { data: inserted, error } = await supabase
          .from('fixtures')
          .insert(fixtureInsert(season.id, match))
          .select('id')
          .single();
        if (error) throw new Error(error.message);
        synced++;
        if (isFinished(match) && inserted) newlyFinished.push(inserted.id);
        continue;
      }

      if (existing && wasNotFinished && isFinished(match)) {
        newlyFinished.push(existing.id);
      }
    }

    for (const fixtureId of newlyFinished) {
      const { data, error } = await supabase.rpc('calculate_fixture_scores', {
        p_fixture_id: fixtureId,
      });
      if (error) throw new Error(error.message);
      scoresCalculated += data ?? 0;
    }

    // API-Football's date + event endpoints remain available on the current
    // plan, so they can resolve scorer picks even when football-data.org was
    // used for the primary score sync. A temporary scorer-event failure must
    // never prevent the core fixture and leaderboard sync from succeeding.
    let goldenBoot = { resolved: 0, correct: 0 };
    try {
      goldenBoot = await resolveGoldenBootPicks({ supabase, seasonId: season.id });
    } catch (goldenBootError) {
      console.warn(
        'Golden Boot resolution failed; it will retry on the next sync',
        goldenBootError,
      );
    }

    await logSync(supabase, mode, 'success', startTime, {
      fixtures_updated: synced,
      scores_calculated: scoresCalculated,
      api_calls_made: apiCallsMade,
    });
    return NextResponse.json({
      provider,
      mode,
      synced,
      mappedLegacyFixtures,
      newlyFinished: newlyFinished.length,
      scoresCalculated,
      goldenBoot,
      seasonId: season.id,
    });
  } catch (err) {
    await logSync(supabase, 'full', 'error', startTime, {
      error_message: (err as Error).message,
    }).catch(() => {});
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
