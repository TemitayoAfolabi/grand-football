'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { revalidatePath } from 'next/cache';
import { addStarManNomineeSchema } from '@/lib/validations';
import { ADMIN_ACTIONS, STAR_MAN_DEADLINE_HOURS } from '@/lib/constants';

/** Helper: verify the caller is an admin and return their user ID. */
async function requireAdmin(): Promise<string> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data: isAdmin } = await supabase.rpc('is_admin');
  if (!isAdmin) throw new Error('Forbidden');

  return user.id;
}

/** Log an admin action to the audit log. */
async function auditLog(
  adminId: string,
  action: string,
  targetType: string,
  targetId: string | null,
  oldValue: unknown,
  newValue: unknown,
) {
  const admin = createAdminClient();
  await admin.from('admin_audit_log').insert({
    admin_id: adminId,
    action,
    target_type: targetType,
    target_id: targetId,
    old_value: oldValue as never,
    new_value: newValue as never,
  });
}

// ── Create voting session ───────────────────────────────────────────────

export async function createVotingSession(): Promise<{ error?: string; success?: boolean }> {
  try {
    const adminId = await requireAdmin();
    const admin = createAdminClient();

    // Get active season
    const { data: season } = await admin
      .from('seasons')
      .select('id, name, start_date')
      .eq('is_active', true)
      .single();

    if (!season) {
      return { error: 'No active season found.' };
    }

    if (!season.start_date) {
      return { error: 'Cannot create voting — the active season has no start date.' };
    }

    // Check if session already exists for this season
    const { data: existing } = await admin
      .from('star_man_sessions')
      .select('id')
      .eq('season_id', season.id)
      .single();

    if (existing) {
      return { error: 'A voting session already exists for this season.' };
    }

    // Calculate deadline: STAR_MAN_DEADLINE_HOURS before season start
    const deadline = new Date(season.start_date);
    deadline.setHours(deadline.getHours() - STAR_MAN_DEADLINE_HOURS);

    const { data: newSession, error: dbError } = await admin
      .from('star_man_sessions')
      .insert({
        season_id: season.id,
        status: 'DRAFT',
        deadline: deadline.toISOString(),
      })
      .select('id')
      .single();

    if (dbError) {
      return { error: 'Failed to create voting session. Please try again.' };
    }

    await auditLog(
      adminId,
      ADMIN_ACTIONS.CREATE_STAR_MAN_SESSION,
      'star_man_session',
      newSession?.id ?? null,
      null,
      { season_id: season.id, deadline: deadline.toISOString() },
    );

    revalidatePath('/admin/star-man');
    revalidatePath('/star-man');
    return { success: true };
  } catch (err) {
    return { error: (err as Error).message };
  }
}

// ── Add nominee ─────────────────────────────────────────────────────────

export async function addNominee(
  formData: FormData,
): Promise<{ error?: string; success?: boolean }> {
  try {
    const adminId = await requireAdmin();

    const parsed = addStarManNomineeSchema.safeParse({
      sessionId: formData.get('sessionId'),
      playerName: formData.get('playerName'),
      teamName: formData.get('teamName'),
    });
    if (!parsed.success) {
      return { error: parsed.error.errors[0]?.message ?? 'Invalid input' };
    }

    const { sessionId, playerName, teamName } = parsed.data;
    const admin = createAdminClient();

    // Verify session exists and is not CLOSED
    const { data: session } = await admin
      .from('star_man_sessions')
      .select('id, status')
      .eq('id', sessionId)
      .single();

    if (!session) return { error: 'Voting session not found.' };
    if (session.status === 'CLOSED') {
      return { error: 'Cannot add nominees to a closed session.' };
    }

    // Check for duplicate
    const { data: existing } = await admin
      .from('star_man_nominees')
      .select('id')
      .eq('session_id', sessionId)
      .eq('player_name', playerName)
      .single();

    if (existing) {
      return { error: 'This player is already nominated.' };
    }

    const { error: dbError } = await admin.from('star_man_nominees').insert({
      session_id: sessionId,
      player_name: playerName,
      team_name: teamName,
    });

    if (dbError) {
      return { error: 'Failed to add nominee. Please try again.' };
    }

    await auditLog(
      adminId,
      ADMIN_ACTIONS.ADD_STAR_MAN_NOMINEE,
      'star_man_nominee',
      sessionId,
      null,
      { player_name: playerName, team_name: teamName },
    );

    revalidatePath('/admin/star-man');
    revalidatePath('/star-man');
    return { success: true };
  } catch (err) {
    return { error: (err as Error).message };
  }
}

// ── Remove nominee ──────────────────────────────────────────────────────

export async function removeNominee(
  formData: FormData,
): Promise<{ error?: string; success?: boolean }> {
  try {
    const adminId = await requireAdmin();
    const nomineeId = formData.get('nomineeId') as string;
    const sessionId = formData.get('sessionId') as string;

    if (!nomineeId || !sessionId) return { error: 'Missing required fields.' };

    const admin = createAdminClient();

    // Verify session is not CLOSED
    const { data: session } = await admin
      .from('star_man_sessions')
      .select('id, status')
      .eq('id', sessionId)
      .single();

    if (!session) return { error: 'Voting session not found.' };
    if (session.status !== 'DRAFT') {
      return { error: 'Can only remove nominees while session is in DRAFT.' };
    }

    // Get nominee info for audit
    const { data: nominee } = await admin
      .from('star_man_nominees')
      .select('player_name, team_name')
      .eq('id', nomineeId)
      .single();

    const { error: dbError } = await admin
      .from('star_man_nominees')
      .delete()
      .eq('id', nomineeId);

    if (dbError) {
      return { error: 'Failed to remove nominee. Please try again.' };
    }

    await auditLog(
      adminId,
      ADMIN_ACTIONS.REMOVE_STAR_MAN_NOMINEE,
      'star_man_nominee',
      nomineeId,
      nominee ?? null,
      null,
    );

    revalidatePath('/admin/star-man');
    revalidatePath('/star-man');
    return { success: true };
  } catch (err) {
    return { error: (err as Error).message };
  }
}

// ── Open voting ─────────────────────────────────────────────────────────

export async function openVoting(
  formData: FormData,
): Promise<{ error?: string; success?: boolean }> {
  try {
    const adminId = await requireAdmin();
    const sessionId = formData.get('sessionId') as string;

    if (!sessionId) return { error: 'Missing session ID.' };

    const admin = createAdminClient();

    // Get session with nominee count
    const { data: session } = await admin
      .from('star_man_sessions')
      .select('id, status')
      .eq('id', sessionId)
      .single();

    if (!session) return { error: 'Voting session not found.' };
    if (session.status !== 'DRAFT') {
      return { error: 'Only DRAFT sessions can be opened.' };
    }

    // Check minimum nominees
    const { count: nomineeCount } = await admin
      .from('star_man_nominees')
      .select('id', { count: 'exact', head: true })
      .eq('session_id', sessionId);

    if ((nomineeCount ?? 0) < 2) {
      return { error: 'Add at least 2 nominees before opening voting.' };
    }

    const { error: dbError } = await admin
      .from('star_man_sessions')
      .update({ status: 'OPEN', updated_at: new Date().toISOString() })
      .eq('id', sessionId);

    if (dbError) {
      return { error: 'Failed to open voting. Please try again.' };
    }

    await auditLog(
      adminId,
      ADMIN_ACTIONS.OPEN_STAR_MAN_VOTING,
      'star_man_session',
      sessionId,
      { status: 'DRAFT' },
      { status: 'OPEN' },
    );

    revalidatePath('/admin/star-man');
    revalidatePath('/star-man');
    revalidatePath('/');
    return { success: true };
  } catch (err) {
    return { error: (err as Error).message };
  }
}

// ── Close voting ────────────────────────────────────────────────────────

export async function closeVoting(
  formData: FormData,
): Promise<{ error?: string; success?: boolean }> {
  try {
    const adminId = await requireAdmin();
    const sessionId = formData.get('sessionId') as string;

    if (!sessionId) return { error: 'Missing session ID.' };

    const admin = createAdminClient();

    const { data: session } = await admin
      .from('star_man_sessions')
      .select('id, status')
      .eq('id', sessionId)
      .single();

    if (!session) return { error: 'Voting session not found.' };
    if (session.status !== 'OPEN') {
      return { error: 'Only OPEN sessions can be closed.' };
    }

    const { error: dbError } = await admin
      .from('star_man_sessions')
      .update({ status: 'CLOSED', updated_at: new Date().toISOString() })
      .eq('id', sessionId);

    if (dbError) {
      return { error: 'Failed to close voting. Please try again.' };
    }

    await auditLog(
      adminId,
      ADMIN_ACTIONS.CLOSE_STAR_MAN_VOTING,
      'star_man_session',
      sessionId,
      { status: 'OPEN' },
      { status: 'CLOSED' },
    );

    revalidatePath('/admin/star-man');
    revalidatePath('/star-man');
    revalidatePath('/');
    return { success: true };
  } catch (err) {
    return { error: (err as Error).message };
  }
}
