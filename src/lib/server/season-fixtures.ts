import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { FOOTBALL_DATA_BASE_URL, FIXTURE_STATUS } from '@/lib/constants';
import type { Database } from '@/lib/database.types';

interface ApiMatch {
  id: number;
  matchday: number;
  utcDate: string;
  status: string;
  score: { fullTime: { home: number | null; away: number | null } };
  homeTeam: { name: string; crest: string };
  awayTeam: { name: string; crest: string };
}

function mapApiStatus(apiStatus: string): string {
  const statuses: Record<string, string> = {
    SCHEDULED: FIXTURE_STATUS.SCHEDULED,
    TIMED: FIXTURE_STATUS.TIMED,
    IN_PLAY: FIXTURE_STATUS.IN_PLAY,
    PAUSED: FIXTURE_STATUS.PAUSED,
    FINISHED: FIXTURE_STATUS.FINISHED,
    POSTPONED: FIXTURE_STATUS.POSTPONED,
    CANCELLED: FIXTURE_STATUS.CANCELLED,
    SUSPENDED: FIXTURE_STATUS.SUSPENDED,
  };
  return statuses[apiStatus] ?? FIXTURE_STATUS.SCHEDULED;
}

/**
 * Imports the published fixture list before a season is made available to
 * players. Existing records are upserted, so this is safe to rerun after the
 * league reschedules a fixture.
 */
export async function importSeasonFixtures(
  supabase: SupabaseClient<Database>,
  seasonId: string,
  apiSeason: number,
): Promise<{ imported: number; total: number }> {
  const apiKey = process.env.FOOTBALL_DATA_API_KEY;
  if (!apiKey) throw new Error('FOOTBALL_DATA_API_KEY not configured');

  const response = await fetch(
    `${FOOTBALL_DATA_BASE_URL}/competitions/PL/matches?season=${apiSeason}`,
    {
      headers: { 'X-Auth-Token': apiKey },
      cache: 'no-store',
    },
  );

  if (!response.ok) {
    throw new Error(`Fixture provider responded with ${response.status}`);
  }

  const { matches = [] } = (await response.json()) as { matches?: ApiMatch[] };
  if (matches.length === 0) {
    throw new Error(`No Premier League fixtures are available for ${apiSeason}/${apiSeason + 1}`);
  }

  const fixtures: Database['public']['Tables']['fixtures']['Insert'][] = matches.map((match) => ({
    season_id: seasonId,
    api_fixture_id: match.id,
    home_team: match.homeTeam.name,
    away_team: match.awayTeam.name,
    home_team_crest: match.homeTeam.crest,
    away_team_crest: match.awayTeam.crest,
    kickoff_time: match.utcDate,
    status: mapApiStatus(match.status),
    home_score: match.score.fullTime.home,
    away_score: match.score.fullTime.away,
    gameweek: match.matchday,
    updated_at: new Date().toISOString(),
  }));

  const { error } = await supabase
    .from('fixtures')
    .upsert(fixtures, { onConflict: 'api_fixture_id' });
  if (error) throw new Error(`Could not save fixtures: ${error.message}`);

  return { imported: fixtures.length, total: matches.length };
}
