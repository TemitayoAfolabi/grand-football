'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

/** Verify the caller is an admin — identical guard to parent actions.ts */
async function requireAdmin(): Promise<void> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  const { data: isAdmin } = await supabase.rpc('is_admin');
  if (!isAdmin) throw new Error('Forbidden');
}

// ── Types ────────────────────────────────────────────────────────────────

export interface FixtureRow {
  id: string;
  home_team: string;
  away_team: string;
  kickoff_time: string;
  home_score: number | null;
  away_score: number | null;
  is_star_game: boolean;
  status: string;
}

export interface PredictionRow {
  id: string;
  user_id: string;
  fixture_id: string;
  pred_home: number;
  pred_away: number;
  submitted_at: string;
  updated_at: string;
  display_name: string;
  points_awarded: number | null;
  reason_code: string | null;
}

export interface UserRow {
  id: string;
  display_name: string;
}

export interface PredictionsData {
  fixtures: FixtureRow[];
  predictions: PredictionRow[];
  users: UserRow[];
  deadline: string | null;
}

// ── Actions ──────────────────────────────────────────────────────────────

export async function getAdminActiveSeason(): Promise<{ id: string; name: string } | null> {
  await requireAdmin();
  const admin = createAdminClient();
  const { data } = await admin
    .from('seasons')
    .select('id, name')
    .eq('is_active', true)
    .single();
  return data;
}

export interface GameweekInfo {
  gw: number;
  earliestKickoff: string;
}

export async function getAdminAvailableGameweeks(seasonId: string): Promise<GameweekInfo[]> {
  await requireAdmin();
  const admin = createAdminClient();
  // Fetch ordered by kickoff ASC so first occurrence per GW is the earliest
  const { data } = await admin
    .from('fixtures')
    .select('gameweek, kickoff_time')
    .eq('season_id', seasonId)
    .order('kickoff_time', { ascending: true });
  const gwMap = new Map<number, string>();
  for (const r of data ?? []) {
    if (!gwMap.has(r.gameweek)) {
      gwMap.set(r.gameweek, r.kickoff_time);
    }
  }
  return [...gwMap.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([gw, earliestKickoff]) => ({ gw, earliestKickoff }));
}

export async function getAdminPredictionsForGameweek(
  seasonId: string,
  gw: number,
): Promise<PredictionsData> {
  await requireAdmin();
  const admin = createAdminClient();

  // 1. Fixtures for this GW + season
  const { data: fixturesRaw } = await admin
    .from('fixtures')
    .select('id, home_team, away_team, kickoff_time, home_score, away_score, is_star_game, status')
    .eq('season_id', seasonId)
    .eq('gameweek', gw)
    .order('kickoff_time', { ascending: true });

  const fixtures: FixtureRow[] = fixturesRaw ?? [];
  const fixtureIds = fixtures.map((f) => f.id);

  // 2. Predictions for those fixtures (bypasses RLS via admin client)
  const { data: predRaw } =
    fixtureIds.length > 0
      ? await admin
          .from('predictions')
          .select(
            `
            id, user_id, fixture_id,
            home_score, away_score,
            submitted_at, updated_at,
            profiles!predictions_user_id_fkey ( display_name )
          `,
          )
          .in('fixture_id', fixtureIds)
          .order('user_id', { ascending: true })
      : { data: [] };

  // 3. Score records for those fixtures (may be empty before scoring runs)
  const { data: scoreRaw } =
    fixtureIds.length > 0
      ? await admin
          .from('score_records')
          .select('user_id, fixture_id, points_awarded, reason_code')
          .in('fixture_id', fixtureIds)
      : { data: [] };

  const scoreMap = new Map(
    (scoreRaw ?? []).map((s) => [`${s.user_id}:${s.fixture_id}`, s]),
  );

  const predictions: PredictionRow[] = (predRaw ?? []).map((p) => {
    const score = scoreMap.get(`${p.user_id}:${p.fixture_id}`);
    return {
      id: p.id,
      user_id: p.user_id,
      fixture_id: p.fixture_id,
      pred_home: p.home_score,
      pred_away: p.away_score,
      submitted_at: p.submitted_at,
      updated_at: p.updated_at,
      display_name:
        (p.profiles as unknown as { display_name: string } | null)?.display_name ?? 'Unknown',
      points_awarded: score?.points_awarded ?? null,
      reason_code: score?.reason_code ?? null,
    };
  });

  // 4. All users (to show non-submitters as empty rows)
  const { data: usersRaw } = await admin
    .from('profiles')
    .select('id, display_name')
    .order('display_name', { ascending: true });

  // 5. Deadline for this GW (may not exist)
  const { data: deadlineRow } = await admin
    .from('gameweek_deadlines')
    .select('deadline')
    .eq('season_id', seasonId)
    .eq('gameweek', gw)
    .maybeSingle();

  const deadline = (deadlineRow as { deadline: string } | null)?.deadline ?? null;

  return {
    fixtures,
    predictions,
    users: usersRaw ?? [],
    deadline,
  };
}
