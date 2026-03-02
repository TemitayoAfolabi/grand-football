'use server';

import { createClient } from '@/lib/supabase/server';
import { displayNameSchema, changePasswordSchema } from '@/lib/validations';
import { revalidatePath } from 'next/cache';

export async function updateProfile(
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
    displayName: (formData.get('displayName') as string) ?? '',
  };

  const parsed = displayNameSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? 'Invalid input' };
  }

  const { displayName } = parsed.data;

  const { error: dbError } = await supabase
    .from('profiles')
    .update({ display_name: displayName, updated_at: new Date().toISOString() })
    .eq('id', user.id);

  if (dbError) {
    return { error: 'Failed to update profile. Please try again.' };
  }

  revalidatePath('/settings');
  revalidatePath('/');
  return { success: true };
}

/**
 * Change password for the authenticated user.
 * Requires the current password for verification.
 */
export async function changePassword(
  formData: FormData,
): Promise<{ error?: string; success?: boolean }> {
  const raw = {
    currentPassword: (formData.get('currentPassword') as string) ?? '',
    newPassword: (formData.get('newPassword') as string) ?? '',
    confirmPassword: (formData.get('confirmPassword') as string) ?? '',
  };

  const parsed = changePasswordSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? 'Invalid input' };
  }

  const { newPassword } = parsed.data;

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: 'Not authenticated' };
  }

  // Verify current password by attempting to sign in
  const { error: verifyError } = await supabase.auth.signInWithPassword({
    email: user.email!,
    password: raw.currentPassword,
  });

  if (verifyError) {
    return { error: 'Current password is incorrect.' };
  }

  // Update to new password
  const { error: updateError } = await supabase.auth.updateUser({
    password: newPassword,
  });

  if (updateError) {
    if (updateError.message.includes('same_password')) {
      return { error: 'New password must be different from your current password.' };
    }
    return { error: updateError.message };
  }

  return { success: true };
}
