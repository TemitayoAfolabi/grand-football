'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { revalidatePath } from 'next/cache';
import { emailSchema, overrideSchema, seasonSchema, editScoreRecordSchema, adminCreateUserSchema, moveFixtureGameweekSchema, setFixtureStatusSchema } from '@/lib/validations';
import { ADMIN_ACTIONS } from '@/lib/constants';
import { evaluateBadgesForAll } from '@/lib/badges/engine';

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

// ── Add email to allowlist ──────────────────────────────────────────────

export async function addToAllowlist(
  formData: FormData,
): Promise<{ error?: string; success?: boolean }> {
  try {
    const adminId = await requireAdmin();

    const parsed = emailSchema.safeParse({
      email: formData.get('email'),
    });
    if (!parsed.success) {
      return { error: parsed.error.errors[0]?.message ?? 'Invalid email' };
    }

    const { email } = parsed.data;
    const normalizedEmail = email.toLowerCase().trim();
    const admin = createAdminClient();

    // Check for duplicate
    const { data: existing } = await admin
      .from('allowlist')
      .select('id')
      .eq('email', normalizedEmail)
      .single();

    if (existing) {
      return { error: 'This email is already in the allowlist.' };
    }

    const { error: dbError } = await admin.from('allowlist').insert({
      email: normalizedEmail,
      added_by: adminId,
    });

    if (dbError) {
      return { error: 'Failed to add email. Please try again.' };
    }

    await auditLog(adminId, ADMIN_ACTIONS.ADD_USER, 'allowlist', null, null, { email: normalizedEmail });
    revalidatePath('/admin/users');
    return { success: true };
  } catch (err) {
    return { error: (err as Error).message };
  }
}

// ── Remove email from allowlist ─────────────────────────────────────────

export async function removeFromAllowlist(
  formData: FormData,
): Promise<{ error?: string; success?: boolean }> {
  try {
    const adminId = await requireAdmin();
    const id = formData.get('id') as string;
    const email = formData.get('email') as string;

    if (!id) return { error: 'Missing allowlist entry ID' };

    const admin = createAdminClient();
    const { error: dbError } = await admin
      .from('allowlist')
      .delete()
      .eq('id', id);

    if (dbError) {
      return { error: 'Failed to remove email. Please try again.' };
    }

    await auditLog(adminId, ADMIN_ACTIONS.REMOVE_USER, 'allowlist', id, { email }, null);
    revalidatePath('/admin/users');
    return { success: true };
  } catch (err) {
    return { error: (err as Error).message };
  }
}

// ── Create user account (admin invite) ──────────────────────────────────

export async function adminCreateUser(
  formData: FormData,
): Promise<{ error?: string; success?: boolean }> {
  try {
    const adminId = await requireAdmin();

    const parsed = adminCreateUserSchema.safeParse({
      email: formData.get('email'),
      displayName: formData.get('displayName') || '',
    });
    if (!parsed.success) {
      return { error: parsed.error.errors[0]?.message ?? 'Invalid input' };
    }

    const { email, displayName } = parsed.data;
    const normalizedEmail = email.toLowerCase().trim();
    const admin = createAdminClient();

    // Check for duplicate allowlist entry
    const { data: existing } = await admin
      .from('allowlist')
      .select('id')
      .eq('email', normalizedEmail)
      .single();

    if (existing) {
      return { error: 'This email is already in the allowlist.' };
    }

    // Add to allowlist first
    const { error: allowlistError } = await admin.from('allowlist').insert({
      email: normalizedEmail,
      added_by: adminId,
    });

    if (allowlistError) {
      return { error: 'Failed to add email to allowlist. Please try again.' };
    }

    // Generate a temporary password
    const tempPassword = generateTempPassword();

    // Create the Supabase auth user via Admin API
    const { data: newUser, error: createError } = await admin.auth.admin.createUser({
      email: normalizedEmail,
      password: tempPassword,
      email_confirm: true, // Skip email confirmation — admin is vouching for the user
      user_metadata: {
        display_name: displayName || normalizedEmail.split('@')[0],
      },
    });

    if (createError) {
      // Rollback allowlist entry
      await admin.from('allowlist').delete().eq('email', normalizedEmail);

      if (createError.message.includes('already been registered')) {
        return { error: 'A user with this email already exists in the auth system.' };
      }
      return { error: `Failed to create user: ${createError.message}` };
    }

    // Update display name in profile if provided
    if (displayName && newUser.user) {
      await admin
        .from('profiles')
        .update({ display_name: displayName })
        .eq('id', newUser.user.id);
    }

    // Send a password reset email so the user can set their own password.
    // resetPasswordForEmail actually sends the email (unlike generateLink which only returns a URL).
    const { error: inviteError } = await admin.auth.resetPasswordForEmail(normalizedEmail, {
      redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/auth/callback?next=/auth/set-password`,
    });

    if (inviteError) {
      console.error('Failed to send invite email:', inviteError.message);
      // User is still created, they can use "forgot password" later
    }

    await auditLog(adminId, ADMIN_ACTIONS.CREATE_USER, 'user', newUser.user?.id ?? null, null, {
      email: normalizedEmail,
      displayName,
    });
    revalidatePath('/admin/users');
    return { success: true };
  } catch (err) {
    return { error: (err as Error).message };
  }
}

// ── Reset user password (admin action) ──────────────────────────────────

export async function adminResetUserPassword(
  formData: FormData,
): Promise<{ error?: string; success?: boolean }> {
  try {
    const adminId = await requireAdmin();
    const userId = formData.get('userId') as string;
    const email = formData.get('email') as string;

    if (!userId || !email) return { error: 'Missing user information' };

    const admin = createAdminClient();

    // Generate a new temporary password and force password change
    const tempPassword = generateTempPassword();

    const { error: updateError } = await admin.auth.admin.updateUserById(userId, {
      password: tempPassword,
    });

    if (updateError) {
      return { error: `Failed to reset password: ${updateError.message}` };
    }

    // Set force_password_change flag
    await admin
      .from('profiles')
      .update({ force_password_change: true, updated_at: new Date().toISOString() })
      .eq('id', userId);

    // Send recovery email so user can set their own password
    const { error: resetEmailError } = await admin.auth.resetPasswordForEmail(email, {
      redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/auth/callback?next=/auth/set-password`,
    });

    if (resetEmailError) {
      return { error: `Failed to send reset email: ${resetEmailError.message}` };
    }

    await auditLog(adminId, ADMIN_ACTIONS.RESET_USER_PASSWORD, 'user', userId, null, {
      email,
      action: 'password_reset',
    });
    revalidatePath('/admin/users');
    return { success: true };
  } catch (err) {
    return { error: (err as Error).message };
  }
}

// ── Resend invite email (admin action) ──────────────────────────────────

export async function adminResendInvite(
  formData: FormData,
): Promise<{ error?: string; success?: boolean }> {
  try {
    const adminId = await requireAdmin();
    const email = formData.get('email') as string;

    if (!email) return { error: 'Missing email' };

    const admin = createAdminClient();

    // Send a new recovery email (this actually sends the email)
    const { error: linkError } = await admin.auth.resetPasswordForEmail(email, {
      redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/auth/callback?next=/auth/set-password`,
    });

    if (linkError) {
      return { error: `Failed to resend invite: ${linkError.message}` };
    }

    await auditLog(adminId, ADMIN_ACTIONS.RESEND_INVITE, 'user', null, null, {
      email,
      action: 'resend_invite',
    });
    revalidatePath('/admin/users');
    return { success: true };
  } catch (err) {
    return { error: (err as Error).message };
  }
}

/** Generate a cryptographically random temporary password (16 chars, mixed case + digits). */
function generateTempPassword(): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const randomBytes = new Uint8Array(16);
  crypto.getRandomValues(randomBytes);
  let password = '';
  for (let i = 0; i < 16; i++) {
    password += chars[randomBytes[i]! % chars.length];
  }
  return password;
}

// ── Toggle star game ────────────────────────────────────────────────────

export async function toggleStarGame(
  fixtureId: string,
  isStarGame: boolean,
): Promise<{ error?: string; success?: boolean }> {
  try {
    const adminId = await requireAdmin();
    const admin = createAdminClient();

    // Ensure fixture hasn't kicked off
    const { data: fixture } = await admin
      .from('fixtures')
      .select('id, status, is_star_game')
      .eq('id', fixtureId)
      .single();

    if (!fixture) return { error: 'Fixture not found' };
    if (!['SCHEDULED', 'TIMED'].includes(fixture.status)) {
      return { error: 'Cannot toggle star game after kickoff' };
    }

    const { error: dbError } = await admin
      .from('fixtures')
      .update({ is_star_game: isStarGame, updated_at: new Date().toISOString() })
      .eq('id', fixtureId);

    if (dbError) {
      return { error: 'Failed to update fixture. Please try again.' };
    }

    await auditLog(adminId, ADMIN_ACTIONS.TOGGLE_STAR, 'fixture', fixtureId, {
      is_star_game: fixture.is_star_game,
    }, { is_star_game: isStarGame });

    revalidatePath('/admin/fixtures');
    revalidatePath('/fixtures');
    return { success: true };
  } catch (err) {
    return { error: (err as Error).message };
  }
}

// ── Override fixture result ─────────────────────────────────────────────

export async function overrideResult(
  formData: FormData,
): Promise<{ error?: string; success?: boolean }> {
  try {
    const adminId = await requireAdmin();

    const parsed = overrideSchema.safeParse({
      fixtureId: formData.get('fixtureId'),
      homeScore: Number(formData.get('homeScore')),
      awayScore: Number(formData.get('awayScore')),
    });
    if (!parsed.success) {
      return { error: parsed.error.errors[0]?.message ?? 'Invalid input' };
    }

    const { fixtureId, homeScore, awayScore } = parsed.data;
    const admin = createAdminClient();

    // Get current fixture state
    const { data: fixture } = await admin
      .from('fixtures')
      .select('home_score, away_score, status')
      .eq('id', fixtureId)
      .single();

    if (!fixture) return { error: 'Fixture not found' };

    const { error: dbError } = await admin
      .from('fixtures')
      .update({
        home_score: homeScore,
        away_score: awayScore,
        status: 'FINISHED',
        manually_overridden: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', fixtureId);

    if (dbError) {
      return { error: 'Failed to override result. Please try again.' };
    }

    await auditLog(adminId, ADMIN_ACTIONS.OVERRIDE_RESULT, 'fixture', fixtureId, {
      home_score: fixture.home_score,
      away_score: fixture.away_score,
    }, { home_score: homeScore, away_score: awayScore });

    revalidatePath('/admin/fixtures');
    revalidatePath('/fixtures');
    return { success: true };
  } catch (err) {
    return { error: (err as Error).message };
  }
}

// ── Recalculate scores ──────────────────────────────────────────────────

export async function recalculateScores(
  fixtureId?: string,
): Promise<{ error?: string; success?: boolean; count?: number }> {
  try {
    const adminId = await requireAdmin();
    const admin = createAdminClient();

    if (fixtureId) {
      // Single fixture
      const { data, error } = await admin.rpc('calculate_fixture_scores', {
        p_fixture_id: fixtureId,
      });
      if (error) return { error: error.message };

      // Evaluate badges for all users after scoring
      const { data: fixture } = await admin
        .from('fixtures')
        .select('season_id, gameweek')
        .eq('id', fixtureId)
        .single();
      if (fixture) {
        await evaluateBadgesForAll(fixture.season_id, 'fixture_scored', fixture.gameweek).catch(() => {});
      }

      await auditLog(adminId, ADMIN_ACTIONS.RECALCULATE, 'fixture', fixtureId, null, {
        records_affected: data,
      });

      revalidatePath('/admin/scoring');
      revalidatePath('/leaderboard');
      revalidatePath('/badges');
      return { success: true, count: data };
    }

    // All finished fixtures
    const { data: fixtures } = await admin
      .from('fixtures')
      .select('id')
      .eq('status', 'FINISHED');

    let total = 0;
    for (const f of fixtures ?? []) {
      const { data } = await admin.rpc('calculate_fixture_scores', {
        p_fixture_id: f.id,
      });
      total += data ?? 0;
    }

    await auditLog(adminId, ADMIN_ACTIONS.RECALCULATE, 'all_fixtures', null, null, {
      fixtures_count: fixtures?.length ?? 0,
      records_affected: total,
    });

    // Evaluate badges after recalculating all scores
    if (fixtures && fixtures.length > 0) {
      const { data: season } = await admin
        .from('seasons')
        .select('id')
        .eq('is_active', true)
        .single();
      if (season) {
        await evaluateBadgesForAll(season.id, 'fixture_scored').catch(() => {});
        await evaluateBadgesForAll(season.id, 'gameweek_complete').catch(() => {});
      }
    }

    revalidatePath('/admin/scoring');
    revalidatePath('/leaderboard');
    revalidatePath('/badges');
    return { success: true, count: total };
  } catch (err) {
    return { error: (err as Error).message };
  }
}

// ── Start new season ────────────────────────────────────────────────────

export async function startNewSeason(
  formData: FormData,
): Promise<{ error?: string; success?: boolean }> {
  try {
    const adminId = await requireAdmin();

    const parsed = seasonSchema.safeParse({
      name: formData.get('name'),
    });
    if (!parsed.success) {
      return { error: parsed.error.errors[0]?.message ?? 'Invalid input' };
    }

    const { name } = parsed.data;
    const admin = createAdminClient();

    // Deactivate current season
    await admin
      .from('seasons')
      .update({ is_active: false })
      .eq('is_active', true);

    // Create new season
    const { error: dbError } = await admin.from('seasons').insert({
      name,
      is_active: true,
      start_date: new Date().toISOString(),
    });

    if (dbError) {
      return { error: 'Failed to start new season. Please try again.' };
    }

    await auditLog(adminId, ADMIN_ACTIONS.NEW_SEASON, 'season', null, null, { name });
    revalidatePath('/admin');
    revalidatePath('/');
    return { success: true };
  } catch (err) {
    return { error: (err as Error).message };
  }
}

// ── Edit score record (admin leaderboard correction) ────────────────────

export async function editScoreRecord(
  scoreRecordId: string,
  newPoints: number,
  reason: string,
): Promise<{ error?: string; success?: boolean }> {
  try {
    const adminId = await requireAdmin();

    const parsed = editScoreRecordSchema.safeParse({
      scoreRecordId,
      newPoints,
      reason,
    });
    if (!parsed.success) {
      return { error: parsed.error.errors[0]?.message ?? 'Invalid input' };
    }

    const admin = createAdminClient();

    // Fetch the current score record with related data for the audit log
    const { data: record, error: fetchError } = await admin
      .from('score_records')
      .select(`
        id,
        user_id,
        fixture_id,
        points_awarded,
        reason_code,
        is_star_game,
        predicted_home,
        predicted_away,
        actual_home,
        actual_away
      `)
      .eq('id', parsed.data.scoreRecordId)
      .single();

    if (fetchError || !record) {
      return { error: 'Score record not found' };
    }

    // Fetch user display name and fixture details for the audit log
    const [profileResult, fixtureResult] = await Promise.all([
      admin.from('profiles').select('display_name').eq('id', record.user_id).single(),
      admin.from('fixtures').select('home_team, away_team, gameweek, season_id').eq('id', record.fixture_id).single(),
    ]);

    const displayName = profileResult.data?.display_name ?? 'Unknown';
    const fixture = fixtureResult.data;
    const fixtureLabel = fixture
      ? `${fixture.home_team} vs ${fixture.away_team} (GW${fixture.gameweek})`
      : 'Unknown fixture';

    // Update score record
    const { error: updateError } = await admin
      .from('score_records')
      .update({
        points_awarded: parsed.data.newPoints,
        manually_edited: true,
      })
      .eq('id', parsed.data.scoreRecordId);

    if (updateError) {
      return { error: 'Failed to update score record. Please try again.' };
    }

    // Log to audit trail with denormalized data for public display
    await auditLog(
      adminId,
      ADMIN_ACTIONS.EDIT_SCORE_RECORD,
      'score_record',
      parsed.data.scoreRecordId,
      {
        points_awarded: record.points_awarded,
        reason_code: record.reason_code,
        display_name: displayName,
        fixture_label: fixtureLabel,
      },
      {
        points_awarded: parsed.data.newPoints,
        reason: parsed.data.reason,
        display_name: displayName,
        fixture_label: fixtureLabel,
        season_id: fixture?.season_id ?? null,
        user_id: record.user_id,
      },
    );

    revalidatePath('/admin/leaderboard');
    revalidatePath('/leaderboard');
    return { success: true };
  } catch (err) {
    return { error: (err as Error).message };
  }
}

// ── Set / clear gameweek submission deadline ────────────────────────────

export async function setGameweekDeadline(
  seasonId: string,
  gameweek: number,
  deadline: string | null,
): Promise<{ error?: string; success?: boolean }> {
  try {
    const adminId = await requireAdmin();
    const admin = createAdminClient();

    if (!seasonId || !gameweek || gameweek < 1 || gameweek > 50) {
      return { error: 'Invalid season or gameweek.' };
    }

    if (deadline) {
      // Validate the deadline is a valid date
      const deadlineDate = new Date(deadline);
      if (isNaN(deadlineDate.getTime())) {
        return { error: 'Invalid deadline date.' };
      }

      const { error: dbError } = await admin
        .from('gameweek_deadlines')
        .upsert(
          {
            season_id: seasonId,
            gameweek,
            deadline,
            set_by: adminId,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'season_id,gameweek' },
        );

      if (dbError) {
        return { error: 'Failed to set deadline. Please try again.' };
      }

      await auditLog(adminId, 'SET_GAMEWEEK_DEADLINE', 'gameweek_deadline', null, null, {
        season_id: seasonId,
        gameweek,
        deadline,
      });
    } else {
      // Clear the custom deadline (reverts to earliest kickoff)
      const { error: dbError } = await admin
        .from('gameweek_deadlines')
        .delete()
        .eq('season_id', seasonId)
        .eq('gameweek', gameweek);

      if (dbError) {
        return { error: 'Failed to clear deadline. Please try again.' };
      }

      await auditLog(adminId, 'CLEAR_GAMEWEEK_DEADLINE', 'gameweek_deadline', null, null, {
        season_id: seasonId,
        gameweek,
      });
    }

    revalidatePath('/admin/fixtures');
    revalidatePath('/fixtures');
    return { success: true };
  } catch (err) {
    return { error: (err as Error).message };
  }
}

// ── Move fixture to a different gameweek ────────────────────────────────

export async function moveFixtureGameweek(
  fixtureId: string,
  targetGameweek: number,
  newStatus?: string,
  newKickoffTime?: string,
): Promise<{ error?: string; success?: boolean }> {
  try {
    const adminId = await requireAdmin();

    const parsed = moveFixtureGameweekSchema.safeParse({ fixtureId, targetGameweek, newStatus, newKickoffTime });
    if (!parsed.success) return { error: parsed.error.errors[0]?.message ?? 'Invalid input' };

    // Validate kickoff time is a real date if provided
    if (newKickoffTime) {
      const dt = new Date(newKickoffTime);
      if (isNaN(dt.getTime())) return { error: 'Invalid kickoff date/time' };
    }

    const admin = createAdminClient();
    const { data: fixture } = await admin
      .from('fixtures')
      .select('id, gameweek, status, season_id, home_team, away_team, kickoff_time')
      .eq('id', fixtureId)
      .single();

    if (!fixture) return { error: 'Fixture not found' };
    if (['IN_PLAY', 'PAUSED', 'FINISHED'].includes(fixture.status)) {
      return { error: 'Cannot move a fixture that is live or finished' };
    }

    const updatePayload: Record<string, unknown> = {
      gameweek: targetGameweek,
      manually_overridden: true,
      updated_at: new Date().toISOString(),
    };
    if (newStatus) updatePayload.status = newStatus;
    if (newKickoffTime) updatePayload.kickoff_time = new Date(newKickoffTime).toISOString();

    const { error: dbError } = await admin.from('fixtures').update(updatePayload).eq('id', fixtureId);
    if (dbError) return { error: 'Failed to move fixture. Please try again.' };

    try {
      await auditLog(
        adminId,
        ADMIN_ACTIONS.MOVE_FIXTURE_GAMEWEEK,
        'fixture',
        fixtureId,
        { gameweek: fixture.gameweek, status: fixture.status, kickoff_time: fixture.kickoff_time },
        { gameweek: targetGameweek, status: newStatus ?? fixture.status, kickoff_time: newKickoffTime ?? fixture.kickoff_time },
      );
    } catch (e) { console.error('Audit log failed:', e); }

    revalidatePath('/admin/fixtures');
    revalidatePath('/fixtures');
    return { success: true };
  } catch (err) {
    return { error: (err as Error).message };
  }
}

// ── Set fixture status (POSTPONED / CANCELLED) ──────────────────────────

export async function setFixtureStatus(
  fixtureId: string,
  status: 'POSTPONED' | 'CANCELLED',
): Promise<{ error?: string; success?: boolean }> {
  try {
    const adminId = await requireAdmin();

    const parsed = setFixtureStatusSchema.safeParse({ fixtureId, status });
    if (!parsed.success) return { error: parsed.error.errors[0]?.message ?? 'Invalid input' };

    const admin = createAdminClient();
    const { data: fixture } = await admin
      .from('fixtures')
      .select('id, status, home_team, away_team, gameweek')
      .eq('id', fixtureId)
      .single();

    if (!fixture) return { error: 'Fixture not found' };
    if (['IN_PLAY', 'PAUSED'].includes(fixture.status)) return { error: 'Cannot cancel or postpone a live fixture' };
    if (fixture.status === 'FINISHED') return { error: 'Cannot change status of a finished fixture' };
    if (fixture.status === status) return { error: `Fixture is already ${status}` };

    const { error: dbError } = await admin.from('fixtures').update({
      status,
      manually_overridden: true,
      updated_at: new Date().toISOString(),
    }).eq('id', fixtureId);
    if (dbError) return { error: 'Failed to update status. Please try again.' };

    try {
      await auditLog(
        adminId,
        ADMIN_ACTIONS.SET_FIXTURE_STATUS,
        'fixture',
        fixtureId,
        { status: fixture.status },
        { status },
      );
    } catch (e) { console.error('Audit log failed:', e); }

    revalidatePath('/admin/fixtures');
    revalidatePath('/fixtures');
    return { success: true };
  } catch (err) {
    return { error: (err as Error).message };
  }
}
