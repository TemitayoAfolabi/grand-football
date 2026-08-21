import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { fetchApiFootballFirstScorer, findApiFootballFixtureId } from './api-football';

const GOLDEN_BOOT_CORRECT_POINTS = 1;

function nameParts(name: string) {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

/** Matches "Bukayo Saka" with API-Football's compact "B. Saka" format. */
export function scorerNamesMatch(pick: string, scorer: string) {
  const pickParts = nameParts(pick);
  const scorerParts = nameParts(scorer);
  if (!pickParts.length || !scorerParts.length) return false;
  if (pickParts.join('') === scorerParts.join('')) return true;

  const pickLast = pickParts.at(-1);
  const scorerLast = scorerParts.at(-1);
  if (pickLast !== scorerLast) return false;

  const pickFirst = pickParts[0] ?? '';
  const scorerFirst = scorerParts[0] ?? '';
  return (
    pickFirst === scorerFirst ||
    pickFirst.startsWith(scorerFirst) ||
    scorerFirst.startsWith(pickFirst)
  );
}

type CompletedFixture = Pick<
  Database['public']['Tables']['fixtures']['Row'],
  'id' | 'kickoff_time' | 'home_team' | 'away_team'
>;
type UnresolvedPick = Pick<
  Database['public']['Tables']['scorer_picks']['Row'],
  'fixture_id' | 'user_id' | 'player_name'
>;

/**
 * Resolves every pending scorer pick for completed fixtures. Golden Boot points
 * are intentionally separate from the prediction/season leaderboard.
 */
export async function resolveGoldenBootPicks({
  supabase,
  seasonId,
}: {
  supabase: SupabaseClient<Database>;
  seasonId: string;
}): Promise<{ resolved: number; correct: number }> {
  const { data: picks, error: picksError } = await supabase
    .from('scorer_picks')
    .select('fixture_id, user_id, player_name')
    .is('resolved_at', null);
  if (picksError) throw new Error(picksError.message);
  if (!picks?.length) return { resolved: 0, correct: 0 };

  const fixtureIds = [...new Set(picks.map((pick) => pick.fixture_id))];
  const { data: fixtures, error: fixturesError } = await supabase
    .from('fixtures')
    .select('id, kickoff_time, home_team, away_team')
    .eq('season_id', seasonId)
    .eq('status', 'FINISHED')
    .in('id', fixtureIds);
  if (fixturesError) throw new Error(fixturesError.message);

  const picksByFixture = new Map<string, UnresolvedPick[]>();
  for (const pick of picks as UnresolvedPick[]) {
    const fixturePicks = picksByFixture.get(pick.fixture_id) ?? [];
    fixturePicks.push(pick);
    picksByFixture.set(pick.fixture_id, fixturePicks);
  }

  let resolved = 0;
  let correct = 0;
  for (const fixture of (fixtures ?? []) as CompletedFixture[]) {
    const providerFixtureId = await findApiFootballFixtureId({
      date: fixture.kickoff_time.slice(0, 10),
      homeTeam: fixture.home_team,
      awayTeam: fixture.away_team,
    });
    // Do not mark picks resolved when API-Football has not published the match
    // yet. A later sync will retry safely.
    if (!providerFixtureId) continue;

    const firstScorer = await fetchApiFootballFirstScorer(providerFixtureId);
    for (const pick of picksByFixture.get(fixture.id) ?? []) {
      const isCorrect = firstScorer ? scorerNamesMatch(pick.player_name, firstScorer) : false;
      const { error } = await supabase
        .from('scorer_picks')
        .update({
          actual_first_scorer: firstScorer,
          is_correct: isCorrect,
          points_awarded: isCorrect ? GOLDEN_BOOT_CORRECT_POINTS : 0,
          provider_fixture_id: providerFixtureId,
          resolved_at: new Date().toISOString(),
        })
        .eq('fixture_id', pick.fixture_id)
        .eq('user_id', pick.user_id);
      if (error) throw new Error(error.message);
      resolved += 1;
      if (isCorrect) correct += 1;
    }
  }

  return { resolved, correct };
}
