'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { loginSchema, emailSchema } from '@/lib/validations';

/**
 * Sign in with email and password.
 * No emails are sent during this flow.
 */
export async function loginWithPassword(formData: FormData): Promise<{
  error?: string;
  success?: boolean;
  forcePasswordChange?: boolean;
}> {
  const raw = {
    email: formData.get('email') as string,
    password: formData.get('password') as string,
  };

  const parsed = loginSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? 'Invalid input' };
  }

  const { email, password } = parsed.data;

  const normalizedEmail = email.toLowerCase().trim();

  // Check allowlist first (using admin client to bypass RLS)
  const admin = createAdminClient();
  const { data: allowlisted } = await admin
    .from('allowlist')
    .select('id')
    .eq('email', normalizedEmail)
    .maybeSingle();

  if (!allowlisted) {
    return { error: 'This email is not authorized. Contact the admin for access.' };
  }

  // Sign in with Supabase Auth
  const supabase = createClient();
  const { error: authError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (authError) {
    if (authError.message.includes('Invalid login credentials')) {
      return { error: 'Invalid email or password.' };
    }
    if (authError.message.includes('Email not confirmed')) {
      return { error: 'Please check your email to confirm your account first.' };
    }
    if (authError.message.includes('rate')) {
      return { error: 'Too many login attempts. Please try again in a few minutes.' };
    }
    return { error: 'Something went wrong. Please try again.' };
  }

  // Check if user must change password
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const { data: profile } = await admin
      .from('profiles')
      .select('force_password_change')
      .eq('id', user.id)
      .single();

    if (profile?.force_password_change) {
      return { success: true, forcePasswordChange: true };
    }
  }

  return { success: true };
}

/**
 * Request a password reset email.
 * This is the ONLY flow that sends an email after initial account creation.
 */
export async function requestPasswordReset(formData: FormData): Promise<{
  error?: string;
  success?: boolean;
}> {
  const parsed = emailSchema.safeParse({
    email: formData.get('email') as string,
  });

  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? 'Invalid email' };
  }

  const { email } = parsed.data;

  const normalizedEmail = email.toLowerCase().trim();

  // Check allowlist before sending reset email
  const admin = createAdminClient();
  const { data: allowlisted } = await admin
    .from('allowlist')
    .select('id')
    .eq('email', normalizedEmail)
    .maybeSingle();

  if (!allowlisted) {
    // Don't reveal whether the email exists — always show success
    return { success: true };
  }

  // Use admin client to bypass "email logins disabled" setting
  const { error: resetError } = await admin.auth.resetPasswordForEmail(normalizedEmail, {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/auth/callback?next=/auth/set-password`,
  });

  if (resetError) {
    console.error('Password reset error:', resetError.message);
  }

  // Always show success for security (don't reveal if email exists)
  return { success: true };
}

/**
 * Check whether the given email is on the allowlist.
 * Uses the service-role client to bypass RLS.
 */
export async function checkAllowlist(email: string): Promise<{ allowed: boolean }> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('allowlist')
    .select('id')
    .eq('email', email.toLowerCase().trim())
    .maybeSingle();

  if (error) {
    console.error('Allowlist check failed:', error.message);
    return { allowed: false };
  }

  return { allowed: !!data };
}
