import 'server-only';
import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';

/**
 * Cached user fetcher - deduplicates auth.getUser() calls within a single request
 * Uses React's cache() to ensure a single DB call per render cycle
 */
export const getCachedUser = cache(async () => {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

/**
 * Cached profile fetcher - deduplicates profile queries within a single request
 */
export const getCachedProfile = cache(async (userId: string) => {
  const supabase = createClient();
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, display_name, avatar_url, force_password_change, featured_badges, is_admin')
    .eq('id', userId)
    .single();
  return profile;
});

/**
 * Cached admin check - reuses the user and profile reads within a single request
 */
export const getCachedIsAdmin = cache(async () => {
  const user = await getCachedUser();
  if (!user) return false;

  const profile = await getCachedProfile(user.id);
  return !!profile?.is_admin;
});

/**
 * Cached active season - deduplicates season queries within a single request
 */
export const getCachedActiveSeason = cache(async () => {
  const supabase = createClient();
  const { data: season } = await supabase
    .from('seasons')
    .select('*')
    .eq('is_active', true)
    .single();
  return season;
});

/**
 * Cached leaderboard - expensive query, cache per request
 */
export const getCachedLeaderboard = cache(async (seasonId: string) => {
  const supabase = createClient();
  const { data: leaderboard } = await supabase.rpc('get_season_leaderboard', {
    p_season_id: seasonId,
  });
  return leaderboard;
});
