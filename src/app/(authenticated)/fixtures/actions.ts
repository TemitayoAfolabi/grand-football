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
  const { data: isOpen } = await supabase.rpc('is_fixture_open', {
    p_fixture_id: fixtureId,
  });

  if (!isOpen) {
    return { error: 'This fixture is locked. Predictions are no longer accepted.' };
  }

  // Upsert the prediction
  const { error: dbError } = await supabase.from('predictions').upsert(
    {
      user_id: user.id,
      fixture_id: fixtureId,
      home_score: homeScore,
      away_score: awayScore,
    },
    { onConflict: 'user_id,fixture_id' },
  );

  if (dbError) {
    return { error: 'Failed to save prediction. Please try again.' };
  }

  revalidatePath('/fixtures');
  revalidatePath('/');
  return { success: true };
}
