'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { setPasswordSchema } from '@/lib/validations';

/**
 * Set a new password (from invite link, password reset, or forced change).
 * User must already have a valid session (from the auth callback).
 */
export async function setNewPassword(formData: FormData): Promise<{
  error?: string;
  success?: boolean;
}> {
  const raw = {
    password: formData.get('password') as string,
    confirmPassword: formData.get('confirmPassword') as string,
  };

  const parsed = setPasswordSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? 'Invalid input' };
  }

  const { password } = parsed.data;

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: 'Session expired. Please use the link in your email again.' };
  }

  // Update the password
  const { error: updateError } = await supabase.auth.updateUser({
    password,
  });

  if (updateError) {
    if (updateError.message.includes('same_password')) {
      return { error: 'New password must be different from your current password.' };
    }
    return { error: updateError.message };
  }

  // Clear the force_password_change flag
  const admin = createAdminClient();
  await admin
    .from('profiles')
    .update({ force_password_change: false, updated_at: new Date().toISOString() })
    .eq('id', user.id);

  return { success: true };
}
