'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

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

export async function createMiniLeague(formData: FormData): Promise<void> {
  const user = await requireUser();
  const name = formString(formData, 'name').trim();
  const seasonId = formString(formData, 'seasonId');
  if (!user || name.length < 3 || name.length > 40) return;

  const admin = createAdminClient();
  const { data: league, error } = await admin
    .from('mini_leagues')
    .insert({ name, season_id: seasonId, created_by: user.id, invite_code: inviteCode() })
    .select('id, invite_code')
    .single();
  if (error || !league) return;

  const { error: memberError } = await admin
    .from('mini_league_members')
    .insert({ mini_league_id: league.id, user_id: user.id });
  if (memberError) return;
  revalidatePath('/matchday');
}

export async function joinMiniLeague(formData: FormData): Promise<void> {
  const user = await requireUser();
  const code = formString(formData, 'inviteCode').trim().toUpperCase();
  if (!user || !/^[A-Z0-9]{8}$/.test(code)) return;

  const admin = createAdminClient();
  const { data: league } = await admin
    .from('mini_leagues')
    .select('id')
    .eq('invite_code', code)
    .maybeSingle();
  if (!league) return;
  const { error } = await admin
    .from('mini_league_members')
    .upsert(
      { mini_league_id: league.id, user_id: user.id },
      { onConflict: 'mini_league_id,user_id' },
    );
  if (error) return;
  revalidatePath('/matchday');
}

export async function saveScorerPick(formData: FormData): Promise<void> {
  const user = await requireUser();
  const fixtureId = formString(formData, 'fixtureId');
  const playerName = formString(formData, 'playerName').trim();
  if (!user || playerName.length < 2 || playerName.length > 60) return;

  const admin = createAdminClient();
  const { data: fixture } = await admin
    .from('fixtures')
    .select('kickoff_time')
    .eq('id', fixtureId)
    .maybeSingle();
  if (!fixture || new Date(fixture.kickoff_time) <= new Date()) return;
  const { error } = await admin.from('scorer_picks').upsert(
    {
      fixture_id: fixtureId,
      user_id: user.id,
      player_name: playerName,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'fixture_id,user_id' },
  );
  if (error) return;
  revalidatePath('/matchday');
  revalidatePath('/fixtures');
}

export async function sendMatchReaction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const fixtureId = formString(formData, 'fixtureId');
  const reaction = formString(formData, 'reaction');
  if (!user || !['called_it', 'robbed', 'how'].includes(reaction)) return;

  const admin = createAdminClient();
  const { error } = await admin
    .from('match_reactions')
    .upsert(
      { fixture_id: fixtureId, user_id: user.id, reaction },
      { onConflict: 'fixture_id,user_id,reaction' },
    );
  if (error) return;
  revalidatePath('/matchday');
}
