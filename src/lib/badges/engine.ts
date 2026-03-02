// =============================================================================
// Badge evaluation engine — checks and awards badges based on game events
// =============================================================================

import { createAdminClient } from '@/lib/supabase/admin';
import { BADGES, type BadgeTrigger } from './definitions';
import type { Json } from '@/lib/database.types';

export interface BadgeContext {
  userId: string;
  seasonId: string;
  trigger: BadgeTrigger;
  /** Specific gameweek (for gameweek_complete triggers) */
  gameweek?: number;
  /** Specific fixture ID (for fixture_scored triggers) */
  fixtureId?: string;
}

export interface AwardedBadge {
  badgeId: string;
  seasonId: string | null;
  metadata: Record<string, unknown>;
}

/**
 * Evaluate and award any badges a user has earned based on the trigger context.
 * Returns the list of newly awarded badges.
 */
export async function evaluateBadges(ctx: BadgeContext): Promise<AwardedBadge[]> {
  const supabase = createAdminClient();
  const awarded: AwardedBadge[] = [];

  // Get badges the user already has
  const { data: existing } = await supabase
    .from('user_badges')
    .select('badge_id, season_id')
    .eq('user_id', ctx.userId);

  const existingSet = new Set(
    (existing ?? []).map((e) => `${e.badge_id}:${e.season_id ?? 'career'}`),
  );

  function hasEarned(badgeId: string, seasonal: boolean): boolean {
    const key = seasonal ? `${badgeId}:${ctx.seasonId}` : `${badgeId}:career`;
    return existingSet.has(key);
  }

  // Filter badges relevant to this trigger
  const candidates = BADGES.filter(
    (b) => b.triggers.includes(ctx.trigger) && !hasEarned(b.id, b.seasonal),
  );

  if (candidates.length === 0) return awarded;

  // Run checks for each candidate
  for (const badge of candidates) {
    const earned = await checkBadge(badge.id, ctx, supabase);
    if (earned) {
      const seasonId = badge.seasonal ? ctx.seasonId : null;
      const meta = earned === true ? {} : earned;

      // Insert (idempotent — use insert with conflict handling)
      // Note: upsert with onConflict doesn't work for NULL season_id,
      // so we use insert and silently ignore duplicate key errors.
      const { error } = await supabase.from('user_badges').insert({
        user_id: ctx.userId,
        badge_id: badge.id,
        season_id: seasonId,
        metadata: meta as Json,
      });

      // Ignore unique constraint violation (23505) — badge already awarded
      const isDuplicate = error?.code === '23505';

      if (!error || isDuplicate) {
        awarded.push({ badgeId: badge.id, seasonId, metadata: meta });
        existingSet.add(`${badge.id}:${seasonId ?? 'career'}`);
      }
    }
  }

  // Post-award: check grand_master after awarding other badges
  if (!hasEarned('grand_master', false) && awarded.length > 0) {
    // Count DISTINCT badge_ids to avoid counting seasonal duplicates
    const { data: distinctBadges } = await supabase
      .from('user_badges')
      .select('badge_id')
      .eq('user_id', ctx.userId);

    const uniqueCount = new Set((distinctBadges ?? []).map((b) => b.badge_id)).size;

    if (uniqueCount >= 20) {
      const { error } = await supabase.from('user_badges').insert({
        user_id: ctx.userId,
        badge_id: 'grand_master',
        season_id: null,
        metadata: { total_badges: uniqueCount } as unknown as Json,
      });
      // Treat duplicate key (23505) as success — badge already persisted
      if (!error || error.code === '23505') {
        awarded.push({ badgeId: 'grand_master', seasonId: null, metadata: { total_badges: uniqueCount } });
      }
    }
  }

  return awarded;
}

/**
 * Evaluate badges for ALL users for a given trigger (batch mode).
 * Used after scoring a full gameweek.
 */
export async function evaluateBadgesForAll(
  seasonId: string,
  trigger: BadgeTrigger,
  gameweek?: number,
): Promise<Map<string, AwardedBadge[]>> {
  const supabase = createAdminClient();
  const results = new Map<string, AwardedBadge[]>();

  // Get all users who are active (have predictions this season)
  const { data: users } = await supabase
    .from('predictions')
    .select('user_id, fixtures!inner(season_id)')
    .eq('fixtures.season_id', seasonId);

  const uniqueUserIds = [...new Set(users?.map((u) => u.user_id) ?? [])];

  for (const userId of uniqueUserIds) {
    const awarded = await evaluateBadges({
      userId,
      seasonId,
      trigger,
      gameweek,
    });
    if (awarded.length > 0) {
      results.set(userId, awarded);
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Individual badge checkers
// ---------------------------------------------------------------------------

type SupabaseAdmin = ReturnType<typeof createAdminClient>;

async function checkBadge(
  badgeId: string,
  ctx: BadgeContext,
  supabase: SupabaseAdmin,
): Promise<boolean | Record<string, unknown>> {
  switch (badgeId) {
    // ===== COMMON =====
    case 'first_blood':
      return checkExactScoreCount(ctx.userId, supabase, 1);

    case 'good_eye':
      return checkOutcomeCount(ctx.userId, supabase, 1);

    case 'committed':
      return checkCommittedGameweeks(ctx.userId, ctx.seasonId, supabase, 5);

    case 'podium_finish':
      return checkPodiumFinish(ctx.userId, ctx.seasonId, supabase);

    case 'star_voter':
      return checkStarManVote(ctx.userId, supabase);

    case 'early_bird':
      return checkEarlyBird(ctx.userId, ctx.seasonId, supabase, ctx.gameweek);

    case 'double_up':
      return checkExactInGameweek(ctx.userId, ctx.seasonId, supabase, 2, ctx.gameweek);

    // ===== RARE =====
    case 'sniper':
      return checkExactScoreCount(ctx.userId, supabase, 10);

    case 'on_fire':
      return checkTopHalfStreak(ctx.userId, ctx.seasonId, supabase, 3);

    case 'iron_will':
      return checkIronWill(ctx.userId, ctx.seasonId, supabase);

    case 'gameweek_champion':
      return checkGameweekChampion(ctx.userId, ctx.seasonId, supabase);

    case 'nil_nil_oracle':
      return checkNilNilOracle(ctx.userId, supabase);

    case 'star_game_ace':
      return checkStarGameAce(ctx.userId, ctx.seasonId, supabase);

    case 'hat_trick':
      return checkExactInGameweek(ctx.userId, ctx.seasonId, supabase, 3, ctx.gameweek);

    case 'century':
      return checkCentury(ctx.userId, ctx.seasonId, supabase);

    // ===== EPIC =====
    case 'oracle':
      return checkExactScoreCount(ctx.userId, supabase, 25);

    case 'unstoppable':
      return checkTopHalfStreak(ctx.userId, ctx.seasonId, supabase, 5);

    case 'perfect_gameweek':
      return checkPerfectGameweek(ctx.userId, ctx.seasonId, supabase, ctx.gameweek);

    case 'serial_winner':
      return checkSerialWinner(ctx.userId, ctx.seasonId, supabase, 3);

    case 'the_underdog':
      return checkUnderdogPrediction(ctx.userId, supabase);

    case 'bonus_hunter':
      return checkBonusHunter(ctx.userId, ctx.seasonId, supabase);

    // ===== LEGENDARY =====
    case 'psychic':
      return checkExactScoreCount(ctx.userId, supabase, 50);

    case 'season_champion':
      return checkSeasonChampion(ctx.userId, ctx.seasonId, supabase);

    case 'invincible':
      return checkInvincible(ctx.userId, ctx.seasonId, supabase);

    // grand_master handled in post-award
    default:
      return false;
  }
}

// ---------------------------------------------------------------------------
// Checker implementations
// ---------------------------------------------------------------------------

async function checkExactScoreCount(
  userId: string,
  supabase: SupabaseAdmin,
  threshold: number,
): Promise<boolean> {
  const { count } = await supabase
    .from('score_records')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .in('reason_code', ['EXACT_SCORE', 'STAR_EXACT']);
  return (count ?? 0) >= threshold;
}

async function checkOutcomeCount(
  userId: string,
  supabase: SupabaseAdmin,
  threshold: number,
): Promise<boolean> {
  const { count } = await supabase
    .from('score_records')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .in('reason_code', ['OUTCOME', 'STAR_OUTCOME', 'EXACT_SCORE', 'STAR_EXACT']);
  return (count ?? 0) >= threshold;
}

async function checkCommittedGameweeks(
  userId: string,
  seasonId: string,
  supabase: SupabaseAdmin,
  threshold: number,
): Promise<boolean> {
  // 1) Get ALL fixtures in the season (single query)
  const { data: allFixtures } = await supabase
    .from('fixtures')
    .select('id, gameweek')
    .eq('season_id', seasonId);

  if (!allFixtures || allFixtures.length === 0) return false;

  // Build map: gameweek → fixture IDs
  const gwFixtures = new Map<number, string[]>();
  for (const f of allFixtures) {
    if (!gwFixtures.has(f.gameweek)) gwFixtures.set(f.gameweek, []);
    gwFixtures.get(f.gameweek)!.push(f.id);
  }

  // 2) Get ALL predictions by this user for this season's fixtures (single query)
  const fixtureIds = allFixtures.map((f) => f.id);
  const { data: predictions } = await supabase
    .from('predictions')
    .select('fixture_id')
    .eq('user_id', userId)
    .in('fixture_id', fixtureIds);

  const predictedFixtures = new Set((predictions ?? []).map((p) => p.fixture_id));

  // 3) Count gameweeks where user predicted every fixture (in-memory)
  let completeGameweeks = 0;
  for (const [, ids] of gwFixtures) {
    if (ids.every((id) => predictedFixtures.has(id))) completeGameweeks++;
  }

  return completeGameweeks >= threshold;
}

async function checkPodiumFinish(
  userId: string,
  seasonId: string,
  supabase: SupabaseAdmin,
): Promise<boolean> {
  // Check all finished gameweeks
  const gameweeks = await getFinishedGameweeks(seasonId, supabase);
  for (const gw of gameweeks) {
    const { data } = await supabase.rpc('get_gameweek_leaderboard', {
      p_season_id: seasonId,
      p_gameweek: gw,
    });
    const entry = data?.find((e) => e.user_id === userId);
    if (entry && entry.rank <= 3) return true;
  }
  return false;
}

async function checkStarManVote(
  userId: string,
  supabase: SupabaseAdmin,
): Promise<boolean> {
  const { count } = await supabase
    .from('star_man_votes')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId);
  return (count ?? 0) >= 1;
}

async function checkEarlyBird(
  userId: string,
  seasonId: string,
  supabase: SupabaseAdmin,
  gameweek?: number,
): Promise<boolean> {
  if (!gameweek) return false;

  // Get all fixtures in the gameweek with their kickoff times
  const { data: fixtures } = await supabase
    .from('fixtures')
    .select('id, kickoff_time')
    .eq('season_id', seasonId)
    .eq('gameweek', gameweek);

  if (!fixtures || fixtures.length === 0) return false;

  // Get user predictions for these fixtures
  const { data: predictions } = await supabase
    .from('predictions')
    .select('fixture_id, submitted_at')
    .eq('user_id', userId)
    .in('fixture_id', fixtures.map((f) => f.id));

  if (!predictions || predictions.length < fixtures.length) return false;

  // Check all were submitted 24+ hours before kickoff
  const predMap = new Map(predictions.map((p) => [p.fixture_id, p.submitted_at]));
  return fixtures.every((f) => {
    const submitted = predMap.get(f.id);
    if (!submitted) return false;
    const diff = new Date(f.kickoff_time).getTime() - new Date(submitted).getTime();
    return diff >= 24 * 60 * 60 * 1000;
  });
}

async function checkExactInGameweek(
  userId: string,
  seasonId: string,
  supabase: SupabaseAdmin,
  threshold: number,
  gameweek?: number,
): Promise<boolean> {
  const gameweeks = gameweek ? [gameweek] : await getFinishedGameweeks(seasonId, supabase);

  for (const gw of gameweeks) {
    const { data } = await supabase.rpc('get_gameweek_leaderboard', {
      p_season_id: seasonId,
      p_gameweek: gw,
    });
    const entry = data?.find((e) => e.user_id === userId);
    if (entry && entry.exact_count >= threshold) return true;
  }
  return false;
}

async function checkTopHalfStreak(
  userId: string,
  seasonId: string,
  supabase: SupabaseAdmin,
  streakNeeded: number,
): Promise<boolean> {
  const gameweeks = await getFinishedGameweeks(seasonId, supabase);
  if (gameweeks.length < streakNeeded) return false;

  let currentStreak = 0;
  for (const gw of gameweeks) {
    const { data } = await supabase.rpc('get_gameweek_leaderboard', {
      p_season_id: seasonId,
      p_gameweek: gw,
    });
    if (!data) { currentStreak = 0; continue; }

    const totalPlayers = data.length;
    const entry = data.find((e) => e.user_id === userId);
    const halfwayPoint = Math.ceil(totalPlayers / 2);

    if (entry && entry.rank <= halfwayPoint) {
      currentStreak++;
      if (currentStreak >= streakNeeded) return true;
    } else {
      currentStreak = 0;
    }
  }

  return false;
}

async function checkIronWill(
  userId: string,
  seasonId: string,
  supabase: SupabaseAdmin,
): Promise<boolean> {
  // Check if there's any month where user predicted all fixtures
  const { data: fixtures } = await supabase
    .from('fixtures')
    .select('id, kickoff_time')
    .eq('season_id', seasonId)
    .eq('status', 'FINISHED');

  if (!fixtures || fixtures.length === 0) return false;

  // Group by month
  const months = new Map<string, string[]>();
  for (const f of fixtures) {
    const month = f.kickoff_time.substring(0, 7); // YYYY-MM
    if (!months.has(month)) months.set(month, []);
    months.get(month)!.push(f.id);
  }

  for (const [, fixtureIds] of months) {
    const { count } = await supabase
      .from('predictions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .in('fixture_id', fixtureIds);
    if ((count ?? 0) >= fixtureIds.length) return true;
  }

  return false;
}

async function checkGameweekChampion(
  userId: string,
  seasonId: string,
  supabase: SupabaseAdmin,
): Promise<boolean> {
  const gameweeks = await getFinishedGameweeks(seasonId, supabase);
  for (const gw of gameweeks) {
    const { data } = await supabase.rpc('get_gameweek_leaderboard', {
      p_season_id: seasonId,
      p_gameweek: gw,
    });
    const entry = data?.find((e) => e.user_id === userId);
    if (entry && entry.rank === 1) return true;
  }
  return false;
}

async function checkNilNilOracle(
  userId: string,
  supabase: SupabaseAdmin,
): Promise<boolean> {
  const { count } = await supabase
    .from('score_records')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .in('reason_code', ['EXACT_SCORE', 'STAR_EXACT'])
    .eq('actual_home', 0)
    .eq('actual_away', 0);
  return (count ?? 0) >= 1;
}

async function checkStarGameAce(
  userId: string,
  seasonId: string,
  supabase: SupabaseAdmin,
): Promise<boolean> {
  const { count } = await supabase
    .from('score_records')
    .select('id, fixtures!inner(season_id)', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('reason_code', 'STAR_EXACT')
    .eq('fixtures.season_id', seasonId);
  return (count ?? 0) >= 1;
}

async function checkCentury(
  userId: string,
  seasonId: string,
  supabase: SupabaseAdmin,
): Promise<boolean> {
  const { data } = await supabase.rpc('get_season_leaderboard', {
    p_season_id: seasonId,
  });
  const entry = data?.find((e) => e.user_id === userId);
  return Number(entry?.total_points ?? 0) >= 100;
}

async function checkPerfectGameweek(
  userId: string,
  seasonId: string,
  supabase: SupabaseAdmin,
  gameweek?: number,
): Promise<boolean> {
  const gameweeks = gameweek ? [gameweek] : await getFinishedGameweeks(seasonId, supabase);

  for (const gw of gameweeks) {
    const { data } = await supabase.rpc('get_gameweek_leaderboard', {
      p_season_id: seasonId,
      p_gameweek: gw,
    });
    const entry = data?.find((e) => e.user_id === userId);
    if (!entry) continue;

    // Count total fixtures in this gameweek
    const { count: totalFixtures } = await supabase
      .from('fixtures')
      .select('id', { count: 'exact', head: true })
      .eq('season_id', seasonId)
      .eq('gameweek', gw)
      .eq('status', 'FINISHED');

    // outcome_count + exact_count = all correct outcomes
    if ((entry.outcome_count + entry.exact_count) >= (totalFixtures ?? 0) && (totalFixtures ?? 0) > 0) {
      return true;
    }
  }

  return false;
}

async function checkSerialWinner(
  userId: string,
  seasonId: string,
  supabase: SupabaseAdmin,
  threshold: number,
): Promise<boolean> {
  const gameweeks = await getFinishedGameweeks(seasonId, supabase);
  let wins = 0;

  for (const gw of gameweeks) {
    const { data } = await supabase.rpc('get_gameweek_leaderboard', {
      p_season_id: seasonId,
      p_gameweek: gw,
    });
    const entry = data?.find((e) => e.user_id === userId);
    if (entry && entry.rank === 1) wins++;
    if (wins >= threshold) return true;
  }
  return false;
}

async function checkUnderdogPrediction(
  userId: string,
  supabase: SupabaseAdmin,
): Promise<boolean> {
  // An "underdog" is when the away team wins and user predicted it correctly.
  // We only need to find ONE such record, so limit to a reasonable batch.
  const { data } = await supabase
    .from('score_records')
    .select('id, predicted_home, predicted_away, actual_home, actual_away')
    .eq('user_id', userId)
    .in('reason_code', ['EXACT_SCORE', 'STAR_EXACT', 'OUTCOME', 'STAR_OUTCOME'])
    .limit(200);

  if (!data) return false;

  return data.some(
    (r) =>
      r.actual_away !== null &&
      r.actual_home !== null &&
      r.actual_away > r.actual_home &&
      r.predicted_away !== null &&
      r.predicted_home !== null &&
      r.predicted_away > r.predicted_home,
  );
}

async function checkBonusHunter(
  userId: string,
  seasonId: string,
  supabase: SupabaseAdmin,
): Promise<boolean> {
  // Check if user earned monthly bonus for 3 consecutive months
  // We look at the monthly leaderboard data
  const { data: fixtures } = await supabase
    .from('fixtures')
    .select('kickoff_time')
    .eq('season_id', seasonId)
    .eq('status', 'FINISHED')
    .order('kickoff_time', { ascending: true });

  if (!fixtures || fixtures.length === 0) return false;

  // Get unique months
  const months = [...new Set(fixtures.map((f) => f.kickoff_time.substring(0, 7)))].sort();

  let consecutiveBonus = 0;
  for (const month of months) {
    const { data } = await supabase.rpc('get_monthly_leaderboard', {
      p_month: month,
      p_season_id: seasonId,
    });
    const entry = data?.find((e) => e.user_id === userId);
    if (entry?.bonus_eligible) {
      consecutiveBonus++;
      if (consecutiveBonus >= 3) return true;
    } else {
      consecutiveBonus = 0;
    }
  }

  return false;
}

async function checkSeasonChampion(
  userId: string,
  seasonId: string,
  supabase: SupabaseAdmin,
): Promise<boolean> {
  const { data } = await supabase.rpc('get_season_leaderboard', {
    p_season_id: seasonId,
  });
  if (!data || data.length === 0) return false;
  const first = data[0];
  return first !== undefined && first.user_id === userId && first.rank === 1;
}

async function checkInvincible(
  userId: string,
  seasonId: string,
  supabase: SupabaseAdmin,
): Promise<boolean> {
  const gameweeks = await getFinishedGameweeks(seasonId, supabase);
  if (gameweeks.length < 5) return false; // Need at least 5 gameweeks

  for (const gw of gameweeks) {
    const { data } = await supabase.rpc('get_gameweek_leaderboard', {
      p_season_id: seasonId,
      p_gameweek: gw,
    });
    if (!data) return false;

    const totalPlayers = data.length;
    const entry = data.find((e) => e.user_id === userId);
    const halfwayPoint = Math.ceil(totalPlayers / 2);

    if (!entry || entry.rank > halfwayPoint) return false;
  }

  return true;
}

// ---------------------------------------------------------------------------
// Helper: get distinct finished gameweeks for a season
// ---------------------------------------------------------------------------
async function getFinishedGameweeks(
  seasonId: string,
  supabase: SupabaseAdmin,
): Promise<number[]> {
  const { data } = await supabase
    .from('fixtures')
    .select('gameweek')
    .eq('season_id', seasonId)
    .eq('status', 'FINISHED')
    .order('gameweek', { ascending: true });

  return [...new Set((data ?? []).map((f) => f.gameweek))];
}
