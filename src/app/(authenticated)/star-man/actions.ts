'use server';

import { createClient } from '@/lib/supabase/server';
import { castStarManVoteSchema } from '@/lib/validations';
import { revalidatePath } from 'next/cache';

export async function castVote(
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
    sessionId: formData.get('sessionId') as string,
    nomineeId: formData.get('nomineeId') as string,
  };

  const parsed = castStarManVoteSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? 'Invalid input' };
  }

  const { sessionId, nomineeId } = parsed.data;

  // Check if voting is still open
  const { data: isOpen } = await supabase.rpc('is_voting_open', {
    p_session_id: sessionId,
  });

  if (!isOpen) {
    return { error: 'Voting is closed. Votes are no longer accepted.' };
  }

  // Verify nominee belongs to this session
  const { data: nominee } = await supabase
    .from('star_man_nominees')
    .select('id')
    .eq('id', nomineeId)
    .eq('session_id', sessionId)
    .single();

  if (!nominee) {
    return { error: 'Invalid nominee selection.' };
  }

  // Upsert the vote (one vote per user per session)
  const { error: dbError } = await supabase.from('star_man_votes').upsert(
    {
      session_id: sessionId,
      user_id: user.id,
      nominee_id: nomineeId,
      voted_at: new Date().toISOString(),
    },
    { onConflict: 'session_id,user_id' },
  );

  if (dbError) {
    return { error: 'Failed to save vote. Please try again.' };
  }

  revalidatePath('/star-man');
  revalidatePath('/');
  return { success: true };
}
