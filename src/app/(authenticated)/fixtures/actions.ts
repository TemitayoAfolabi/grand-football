'use server';

import { createClient } from '@/lib/supabase/server';
import { predictionSchema } from '@/lib/validations';
import { revalidatePath } from 'next/cache';

export async function submitPrediction(
  formData: FormData,
): Promise<{ error?: string; success?: boolean }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: 'Not authenticated' };
  }

  const raw = {
    fixtureId: formData.get('fixtureId') as string,
    homeScore: Number(formData.get('homeScore')),
    awayScore: Number(formData.get('awayScore')),
  };

  const parsed = predictionSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? 'Invalid input' };
  }

  const { fixtureId, homeScore, awayScore } = parsed.data;

  // Check if fixture is still open
  const { data: isOpen, error: rpcError } = await supabase.rpc('is_fixture_open', {
    p_fixture_id: fixtureId,
  });

  if (rpcError) {
    console.error('[submitPrediction] is_fixture_open RPC failed:', JSON.stringify(rpcError));
    return { error: 'Failed to save prediction. Please try again.' };
  }

  if (!isOpen) {
    return { error: 'This fixture is locked. Predictions are no longer accepted.' };
  }

  // Check if a prediction already exists (avoids upsert RLS issues)
  const { data: existing } = await supabase
    .from('predictions')
    .select('id')
    .eq('user_id', user.id)
    .eq('fixture_id', fixtureId)
    .maybeSingle();

  let dbError;

  if (existing) {
    // UPDATE existing prediction
    ({ error: dbError } = await supabase
      .from('predictions')
      .update({
        home_score: homeScore,
        away_score: awayScore,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id));
  } else {
    // INSERT new prediction
    ({ error: dbError } = await supabase
      .from('predictions')
      .insert({
        user_id: user.id,
        fixture_id: fixtureId,
        home_score: homeScore,
        away_score: awayScore,
      }));
  }

  if (dbError) {
    console.error('[submitPrediction] DB error:', JSON.stringify(dbError));
    return { error: 'Failed to save prediction. Please try again.' };
  }

  revalidatePath('/fixtures');
  revalidatePath('/');
  return { success: true };
}
