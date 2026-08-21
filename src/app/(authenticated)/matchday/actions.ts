'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import type { MiniLeagueActionState, ScorerPickActionState } from './mini-league-state';

async function requireUser() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

function inviteCode() {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase();
}

function formString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === 'string' ? value : '';
}

async function getActiveSeasonId() {
  const admin = createAdminClient();
  const { data: season, error } = await admin
    .from('seasons')
    .select('id')
    .eq('is_active', true)
    .maybeSingle();
  return { seasonId: season?.id, error };
}

export async function createMiniLeague(
  _previousState: MiniLeagueActionState,
  formData: FormData,
): Promise<MiniLeagueActionState> {
  const user = await requireUser();
  const name = formString(formData, 'name').trim();
  if (!user) return { status: 'error', message: 'Please sign in again before creating a league.' };
  if (name.length < 3 || name.length > 40)
    return { status: 'error', message: 'League names must be between 3 and 40 characters.' };

  const { seasonId, error: seasonError } = await getActiveSeasonId();
  if (seasonError || !seasonId)
    return { status: 'error', message: 'There is no active season to create a league for.' };

  const admin = createAdminClient();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const code = inviteCode();
    const { data: league, error } = await admin
      .from('mini_leagues')
      .insert({ name, season_id: seasonId, created_by: user.id, invite_code: code })
      .select('id, invite_code')
      .single();

    if (error?.code === '23505') continue;
    if (error || !league)
      return { status: 'error', message: 'We could not create that league. Please try again.' };

    const { error: memberError } = await admin
      .from('mini_league_members')
      .insert({ mini_league_id: league.id, user_id: user.id });
    if (memberError)
      return {
        status: 'error',
        message: 'League created, but joining it failed. Please try again.',
      };

    revalidatePath('/matchday');
    return {
      status: 'success',
      message: `${name} is ready. Share invite code ${league.invite_code}.`,
    };
  }

  return { status: 'error', message: 'We could not generate an invite code. Please try again.' };
}

export async function joinMiniLeague(
  _previousState: MiniLeagueActionState,
  formData: FormData,
): Promise<MiniLeagueActionState> {
  const user = await requireUser();
  const code = formString(formData, 'inviteCode').trim().toUpperCase();
  if (!user) return { status: 'error', message: 'Please sign in again before joining a league.' };
  if (!/^[A-Z0-9]{8}$/.test(code))
    return { status: 'error', message: 'Enter the complete eight-character invite code.' };

  const { seasonId, error: seasonError } = await getActiveSeasonId();
  if (seasonError || !seasonId)
    return { status: 'error', message: 'There is no active season to join a league for.' };

  const admin = createAdminClient();
  const { data: league } = await admin
    .from('mini_leagues')
    .select('id, name, season_id')
    .eq('invite_code', code)
    .maybeSingle();
  if (!league)
    return { status: 'error', message: 'That invite code does not match a mini-league.' };
  if (league.season_id !== seasonId)
    return { status: 'error', message: 'That mini-league belongs to a previous season.' };

  const { error } = await admin
    .from('mini_league_members')
    .upsert(
      { mini_league_id: league.id, user_id: user.id },
      { onConflict: 'mini_league_id,user_id' },
    );
  if (error)
    return { status: 'error', message: 'We could not join that league. Please try again.' };

  revalidatePath('/matchday');
  return { status: 'success', message: `You are in ${league.name}.` };
}

export async function saveScorerPick(
  _previousState: ScorerPickActionState,
  formData: FormData,
): Promise<ScorerPickActionState> {
  const user = await requireUser();
  const fixtureId = formString(formData, 'fixtureId');
  const playerName = formString(formData, 'playerName').trim();
  if (!user)
    return { status: 'error', message: 'Please sign in again before locking a scorer pick.' };
  if (playerName.length < 2 || playerName.length > 60)
    return { status: 'error', message: 'Enter a player name between 2 and 60 characters.' };

  const admin = createAdminClient();
  const { data: fixture } = await admin
    .from('fixtures')
    .select('kickoff_time')
    .eq('id', fixtureId)
    .maybeSingle();
  if (!fixture) return { status: 'error', message: 'That fixture is no longer available.' };
  if (new Date(fixture.kickoff_time) <= new Date())
    return { status: 'error', message: 'Scorer picks lock at kickoff.' };
  const { error } = await admin.from('scorer_picks').upsert(
    {
      fixture_id: fixtureId,
      user_id: user.id,
      player_name: playerName,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'fixture_id,user_id' },
  );
  if (error)
    return { status: 'error', message: 'We could not save that scorer pick. Please try again.' };
  revalidatePath('/matchday');
  revalidatePath('/fixtures');
  return { status: 'success', message: `${playerName} is locked in.` };
}

export async function sendMatchReaction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const fixtureId = formString(formData, 'fixtureId');
  const reaction = formString(formData, 'reaction');
  if (!user || !['called_it', 'robbed', 'how'].includes(reaction)) return;

  const admin = createAdminClient();
  const { data: fixture } = await admin
    .from('fixtures')
    .select('status')
    .eq('id', fixtureId)
    .maybeSingle();
  if (!fixture || !['IN_PLAY', 'PAUSED', 'HALFTIME'].includes(fixture.status)) return;

  const { error } = await admin
    .from('match_reactions')
    .upsert(
      { fixture_id: fixtureId, user_id: user.id, reaction },
      { onConflict: 'fixture_id,user_id,reaction' },
    );
  if (error) return;
  revalidatePath('/matchday');
}
