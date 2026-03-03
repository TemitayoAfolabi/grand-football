'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { predictionSchema } from '@/lib/validations';
import { revalidatePath } from 'next/cache';

export async function submitPrediction(
  formData: FormData,
): Promise<{ error?: string; success?: boolean }> {
  // 1. Authenticate the user via the session-aware client
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: 'Not authenticated' };
  }

  // 2. Validate input
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

  // 3. Use admin client for DB operations (bypasses RLS — we enforce rules in code)
  const admin = createAdminClient();

  // 4. Verify the fixture exists and is still open for predictions
  const { data: fixture, error: fixtureError } = await admin
    .from('fixtures')
    .select('id, kickoff_time')
    .eq('id', fixtureId)
    .single();

  if (fixtureError || !fixture) {
    console.error('[submitPrediction] fixture lookup failed:', JSON.stringify(fixtureError));
    return { error: 'Fixture not found.' };
  }

  if (new Date(fixture.kickoff_time) <= new Date()) {
    return { error: 'This fixture is locked. Predictions are no longer accepted.' };
  }

  // 5. Upsert the prediction (admin client bypasses RLS)
  const { error: dbError } = await admin.from('predictions').upsert(
    {
      user_id: user.id,
      fixture_id: fixtureId,
      home_score: homeScore,
      away_score: awayScore,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,fixture_id' },
  );

  if (dbError) {
    console.error('[submitPrediction] upsert failed:', JSON.stringify(dbError));
    return { error: 'Failed to save prediction. Please try again.' };
  }

  revalidatePath('/fixtures');
  revalidatePath('/');
  return { success: true };
}
