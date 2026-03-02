'use server';

import { createClient } from '@/lib/supabase/server';
import { BADGE_MAP } from '@/lib/badges/definitions';

/**
 * Get all badges for a specific user.
 */
export async function getUserBadges(userId: string) {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('user_badges')
    .select('badge_id, earned_at, season_id, metadata')
    .eq('user_id', userId)
    .order('earned_at', { ascending: false });

  if (error) return { data: null, error: error.message };
  return { data, error: null };
}

/**
 * Get featured badges for a user (from profile).
 */
export async function getFeaturedBadges(userId: string) {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('profiles')
    .select('featured_badges')
    .eq('id', userId)
    .single();

  if (error) return { data: null, error: error.message };
  return { data: data?.featured_badges ?? [], error: null };
}

/**
 * Update the current user's featured badges (max 3).
 * Validates that the user actually owns each badge.
 */
export async function updateFeaturedBadges(badgeIds: string[]): Promise<{ error: string | null }> {
  const supabase = createClient();

  // Validate input
  if (!Array.isArray(badgeIds) || badgeIds.length > 3) {
    return { error: 'Maximum 3 featured badges allowed.' };
  }

  // Validate all badge IDs exist in the catalog
  for (const id of badgeIds) {
    if (!BADGE_MAP.has(id)) {
      return { error: `Invalid badge ID: ${id}` };
    }
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: 'Not authenticated.' };

  // Validate user owns each badge
  if (badgeIds.length > 0) {
    const { data: owned } = await supabase
      .from('user_badges')
      .select('badge_id')
      .eq('user_id', user.id)
      .in('badge_id', badgeIds);

    const ownedSet = new Set(owned?.map((b) => b.badge_id) ?? []);
    for (const id of badgeIds) {
      if (!ownedSet.has(id)) {
        return { error: `You haven't earned the "${id}" badge yet.` };
      }
    }
  }

  // Update profile
  const { error } = await supabase
    .from('profiles')
    .update({ featured_badges: badgeIds })
    .eq('id', user.id);

  if (error) return { error: error.message };
  return { error: null };
}
