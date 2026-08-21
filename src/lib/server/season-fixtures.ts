import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchApiFootballFixtures } from '@/lib/server/api-football';
import type { Database } from '@/lib/database.types';

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
  const matches = await fetchApiFootballFixtures({
    season: apiSeason,
    scope: 'season',
  });
  if (matches.length === 0) {
    throw new Error(`No Premier League fixtures are available for ${apiSeason}/${apiSeason + 1}`);
  }

  const fixtures: Database['public']['Tables']['fixtures']['Insert'][] = matches.map((match) => ({
    season_id: seasonId,
    api_fixture_id: match.providerFixtureId,
    live_provider_fixture_id: match.providerFixtureId,
    home_team: match.homeTeam,
    away_team: match.awayTeam,
    home_team_crest: match.homeTeamCrest,
    away_team_crest: match.awayTeamCrest,
    kickoff_time: match.kickoffTime,
    status: match.status,
    home_score: match.homeScore,
    away_score: match.awayScore,
    live_home_score: match.liveHomeScore,
    live_away_score: match.liveAwayScore,
    match_minute: match.matchMinute,
    gameweek: match.gameweek,
    updated_at: new Date().toISOString(),
  }));

  const { error } = await supabase
    .from('fixtures')
    .upsert(fixtures, { onConflict: 'api_fixture_id' });
  if (error) throw new Error(`Could not save fixtures: ${error.message}`);

  return { imported: fixtures.length, total: matches.length };
}
