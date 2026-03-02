-- ============================================================================
-- Grand Football — Password Auth Migration
-- Migration: 00009_password_auth.sql
-- Created: 2026-03-01
-- Description: Adds force_password_change column to profiles, updates the
--              handle_new_user() trigger to set it for new users, and adds
--              an index for middleware query performance.
-- ============================================================================

-- ============================================================================
-- 1. ADD force_password_change COLUMN
-- ============================================================================
-- New users created via admin invite must change their temporary password on
-- first login. Existing users are unaffected (default false).
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS force_password_change boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.force_password_change
  IS 'When true, the user must set a new password before accessing the app. '
     'Set to true for admin-created accounts with temporary passwords.';

-- ============================================================================
-- 2. INDEX for middleware query performance
-- ============================================================================
-- The auth middleware checks this flag on every request for the logged-in user.
-- A partial index on rows where force_password_change = true keeps the index
-- small while speeding up the WHERE clause.
CREATE INDEX IF NOT EXISTS idx_profiles_force_password_change
  ON public.profiles (id)
  WHERE force_password_change = true;

-- ============================================================================
-- 3. UPDATE handle_new_user() TRIGGER FUNCTION
-- ============================================================================
-- The original trigger (00001_initial_schema.sql) inserts a profile row when a
-- new auth.users row is created. We replace it to also set
-- force_password_change = true so that admin-invited users are prompted to
-- change their temporary password on first login.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, avatar_url, force_password_change)
  VALUES (
    NEW.id,
    COALESCE(
      split_part(NEW.raw_user_meta_data->>'full_name', ' ', 1),
      split_part(NEW.email, '@', 1)
    ),
    NEW.raw_user_meta_data->>'avatar_url',
    true
  );
  RETURN NEW;
END;
$$;

-- Note: The existing trigger on_auth_user_created (AFTER INSERT ON auth.users)

-- ============================================================================
-- 4. RLS: Allow authenticated users to check their own email in allowlist
-- ============================================================================
-- The middleware and auth callback query the allowlist using the per-user
-- Supabase client (not the service-role client). The existing RLS policy only
-- allows admins to SELECT. We add a policy permitting any authenticated user
-- to see their own allowlist row so the middleware can verify they are allowed.
CREATE POLICY "allowlist_select_own_email"
  ON public.allowlist FOR SELECT
  TO authenticated
  USING (
    lower(email) = lower(auth.jwt() ->> 'email')
  );
-- already references this function, so no trigger recreation is needed.
-- CREATE OR REPLACE FUNCTION … automatically updates the trigger binding.

-- ============================================================================
-- 5. TRIGGER: Prevent non-admins from updating force_password_change
-- ============================================================================
-- Without this, a technical user could bypass the forced password change
-- by POSTing directly to the Supabase REST API.
CREATE OR REPLACE FUNCTION public.protect_force_password_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Allow if the value is not being changed
  IF NEW.force_password_change IS NOT DISTINCT FROM OLD.force_password_change THEN
    RETURN NEW;
  END IF;

  -- Allow if the caller is a service_role (admin client)
  IF current_setting('request.jwt.claims', true)::json ->> 'role' = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- Allow admins
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = OLD.id AND is_admin = true) THEN
    RETURN NEW;
  END IF;

  -- Block non-admin users from changing this flag
  RAISE EXCEPTION 'Only admins can modify force_password_change';
END;
$$;

CREATE TRIGGER protect_force_password_change_trigger
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_force_password_change();
