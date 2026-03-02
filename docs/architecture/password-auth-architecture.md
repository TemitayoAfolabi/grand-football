# Password-Based Authentication — Technical Architecture & Security Specification

**Project:** Grand Football  
**Date:** 2026-02-28  
**Status:** Specification (Pre-Implementation)  
**Migration:** Magic Link / OAuth → Admin-Invite Password Auth

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [System Architecture](#2-system-architecture)
3. [Auth Flow Diagrams](#3-auth-flow-diagrams)
4. [Data Model Changes](#4-data-model-changes)
5. [Security Controls](#5-security-controls)
6. [API Contracts (Server Actions)](#6-api-contracts-server-actions)
7. [Middleware Changes](#7-middleware-changes)
8. [Route Structure](#8-route-structure)
9. [Component Hierarchy](#9-component-hierarchy)
10. [Supabase Dashboard Configuration](#10-supabase-dashboard-configuration)
11. [File Inventory](#11-file-inventory)
12. [Migration Checklist](#12-migration-checklist)

---

## 1. Executive Summary

### Current State
- **Login:** Magic link OTP (email) + Google OAuth
- **User creation:** Admin adds email to `allowlist` table; user self-authenticates via magic link
- **Auth callback:** `/auth/callback` exchanges PKCE code for session (OAuth + magic link)
- **Middleware:** Checks session, allowlist membership, admin status on every request

### Target State
- **Login:** Email + password only (no magic link, no OTP, no OAuth)
- **User creation:** Admin calls `supabase.auth.admin.createUser()` which creates the auth user, adds to allowlist, and sends an invite email with a recovery/set-password link
- **First login:** User clicks invite link → sets password → redirected to app
- **Password reset:** Optional forgot-password flow via email
- **No emails on normal login:** `signInWithPassword` sends zero emails

### Key Constraints
- Supabase handles all password hashing (bcrypt, server-side)
- Admin API (`service_role` key) is the only way to create users
- Public signup is **disabled** — users cannot self-register
- Maximum 30 users (private league)

---

## 2. System Architecture

### 2.1 High-Level Component Map

```
┌─────────────────────────────────────────────────────────────┐
│                        BROWSER                               │
│                                                              │
│  /login ──────────┐   /auth/confirm ──────┐                 │
│  (email+password)  │   (recovery link)     │                 │
│                    │                        │                 │
│  /settings ────────┤   /auth/callback ─────┤                 │
│  (change password) │   (PKCE exchange)     │                 │
│                    │                        │                 │
│  /admin/users ─────┤   /forgot-password ───┘                 │
│  (create user,     │                                         │
│   reset, resend)   │                                         │
└────────┬───────────┴─────────────┬───────────────────────────┘
         │  Server Actions         │  Route Handlers
         ▼                         ▼
┌─────────────────────────────────────────────────────────────┐
│                    NEXT.JS SERVER                            │
│                                                              │
│  middleware.ts                                               │
│  ├─ Session refresh (updateSession)                          │
│  ├─ Auth check → redirect /login                            │
│  ├─ Allowlist check                                          │
│  ├─ force_password_change check → redirect /auth/confirm    │
│  └─ Admin route check (is_admin RPC)                        │
│                                                              │
│  Server Actions:                                             │
│  ├─ loginWithPassword()     ← anon client                   │
│  ├─ adminCreateUser()       ← admin client (service_role)   │
│  ├─ adminResetUserPassword()← admin client (service_role)   │
│  ├─ adminResendInvite()     ← admin client (service_role)   │
│  ├─ changePassword()        ← server client (user session)  │
│  ├─ requestPasswordReset()  ← anon client                   │
│  └─ setNewPassword()        ← server client (user session)  │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                    SUPABASE                                  │
│                                                              │
│  Auth Service (GoTrue)                                       │
│  ├─ auth.users table (email, encrypted_password, …)         │
│  ├─ signInWithPassword (rate-limited)                       │
│  ├─ admin.createUser (service_role only)                    │
│  ├─ admin.generateLink (service_role only)                  │
│  ├─ resetPasswordForEmail (public, rate-limited)            │
│  └─ updateUser (session-authenticated)                      │
│                                                              │
│  PostgreSQL                                                  │
│  ├─ profiles (id, display_name, is_admin, force_pw_change) │
│  ├─ allowlist (id, email, added_by, created_at)             │
│  └─ admin_audit_log (action, admin_id, …)                   │
│                                                              │
│  Triggers                                                    │
│  └─ on_auth_user_created → handle_new_user() → profiles     │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 Supabase Client Usage Matrix

| Client | File | Key Used | Purpose in New Auth |
|--------|------|----------|---------------------|
| Browser client | `src/lib/supabase/client.ts` | `anon` | `signInWithPassword`, `signOut`, `resetPasswordForEmail`, `exchangeCodeForSession`, `updateUser` (set password from recovery link) |
| Server client | `src/lib/supabase/server.ts` | `anon` + user cookies | `getUser()`, `updateUser()` (change password while authenticated) |
| Admin client | `src/lib/supabase/admin.ts` | `service_role` | `auth.admin.createUser()`, `auth.admin.generateLink()`, allowlist operations |
| Middleware client | `src/lib/supabase/middleware.ts` | `anon` + request cookies | `getUser()` for session validation, allowlist check |

---

## 3. Auth Flow Diagrams

### 3.1 Admin Creates User

```
Admin                    Next.js Server              Supabase Auth        PostgreSQL
  │                          │                           │                    │
  ├─ POST adminCreateUser ──►│                           │                    │
  │   (email, displayName)   │                           │                    │
  │                          ├─ requireAdmin() ─────────►│                    │
  │                          │◄── user verified ─────────┤                    │
  │                          │                           │                    │
  │                          ├─ Check allowlist ─────────┼──► SELECT email ──►│
  │                          │◄── not duplicate ─────────┼◄──────────────────┤
  │                          │                           │                    │
  │                          ├─ admin.createUser() ─────►│                    │
  │                          │   { email, password:rand, │                    │
  │                          │     email_confirm: true,  │                    │
  │                          │     user_metadata: {      │                    │
  │                          │       display_name } }    │                    │
  │                          │                           ├─ INSERT auth.users │
  │                          │                           │──────────────────►│
  │                          │                           │                    │
  │                          │                           │  TRIGGER ──────────┤
  │                          │                           │  handle_new_user() │
  │                          │                           │  INSERT profiles ──┤
  │                          │◄── { user } ──────────────┤                    │
  │                          │                           │                    │
  │                          ├─ INSERT allowlist ────────┼──────────────────►│
  │                          │                           │                    │
  │                          ├─ UPDATE profiles SET ─────┼──────────────────►│
  │                          │   force_password_change   │                    │
  │                          │   = true                  │                    │
  │                          │                           │                    │
  │                          ├─ admin.generateLink() ───►│                    │
  │                          │   type: 'recovery'        │                    │
  │                          │                           ├─ Send invite email │
  │                          │◄── link generated ────────┤   (recovery link) │
  │                          │                           │                    │
  │                          ├─ auditLog() ─────────────┼──────────────────►│
  │                          │                           │                    │
  │◄── { success } ─────────┤                           │                    │
```

### 3.2 User Sets Password (First Login via Invite Link)

```
New User                 Browser                    Next.js Server           Supabase Auth
  │                         │                           │                       │
  ├─ Click invite link ────►│                           │                       │
  │   (/auth/confirm?       │                           │                       │
  │    token_hash=xxx       │                           │                       │
  │    &type=recovery)      │                           │                       │
  │                         │                           │                       │
  │                         ├─ GET /auth/confirm ──────►│                       │
  │                         │                           ├─ verifyOtp() ────────►│
  │                         │                           │  (token_hash,         │
  │                         │                           │   type: recovery)     │
  │                         │                           │◄── session ───────────┤
  │                         │                           │                       │
  │                         │◄── Redirect to            │                       │
  │                         │    /auth/set-password      │                       │
  │                         │                           │                       │
  │                         │ (User now has a session    │                       │
  │                         │  with force_pw_change flag)│                       │
  │                         │                           │                       │
  │  Enter new password ───►│                           │                       │
  │  (8+ chars)             │                           │                       │
  │                         ├─ POST setNewPassword ────►│                       │
  │                         │   (password, confirm)     │                       │
  │                         │                           ├─ updateUser() ───────►│
  │                         │                           │  { password }         │
  │                         │                           │◄── success ───────────┤
  │                         │                           │                       │
  │                         │                           ├─ UPDATE profiles ─────┤
  │                         │                           │   force_password_change│
  │                         │                           │   = false             │
  │                         │                           │                       │
  │                         │◄── Redirect to / ─────────┤                       │
```

### 3.3 Normal Login (Email + Password)

```
User                     Browser                    Next.js Server           Supabase Auth
  │                         │                           │                       │
  ├─ Submit email+password ►│                           │                       │
  │                         ├─ POST loginWithPassword ─►│                       │
  │                         │   (email, password)       │                       │
  │                         │                           ├─ signInWithPassword ─►│
  │                         │                           │  (email, password)    │
  │                         │                           │                       │
  │                         │                           │  [Rate limit check]   │
  │                         │                           │  [Credential verify]  │
  │                         │                           │                       │
  │                         │                           │◄── session or error ──┤
  │                         │                           │                       │
  │                         │   If error:               │                       │
  │                         │◄── { error: "Invalid…" } │                       │
  │                         │                           │                       │
  │                         │   If success:             │                       │
  │                         │◄── redirect to / ─────────┤                       │
  │                         │                           │                       │
  │                         │   Middleware intercepts:   │                       │
  │                         │   ├─ Allowlist check ✓    │                       │
  │                         │   ├─ force_pw_change?     │                       │
  │                         │   │   → redirect /auth/   │                       │
  │                         │   │     set-password      │                       │
  │                         │   └─ Allow through        │                       │
```

### 3.4 Forgot Password Flow

```
User                     Browser                    Next.js Server           Supabase Auth
  │                         │                           │                       │
  ├─ Click "Forgot?" ──────►│                           │                       │
  │                         │  Navigate /forgot-password│                       │
  │                         │                           │                       │
  ├─ Enter email ──────────►│                           │                       │
  │                         ├─ POST requestPasswordReset│                       │
  │                         │   (email)                 │                       │
  │                         │                           ├─ Check allowlist ─────┤
  │                         │                           │                       │
  │                         │                           ├─ resetPasswordForEmail│
  │                         │                           │  (email, redirectTo:  │
  │                         │                           │   /auth/confirm)      │
  │                         │                           │◄── sent ──────────────┤
  │                         │                           │                       │
  │                         │◄── "Check your email" ────┤                       │
  │                         │                           │                       │
  │  Click recovery link ──►│                           │                       │
  │                         ├─ GET /auth/confirm ──────►│                       │
  │                         │                           ├─ verifyOtp ──────────►│
  │                         │                           │◄── session ───────────┤
  │                         │                           │                       │
  │                         │◄── Redirect /auth/        │                       │
  │                         │    set-password            │                       │
  │                         │                           │                       │
  │  Enter new password ───►│                           │                       │
  │                         ├─ POST setNewPassword ────►│                       │
  │                         │                           ├─ updateUser ─────────►│
  │                         │                           │◄── success ───────────┤
  │                         │◄── Redirect /login ───────┤                       │
```

### 3.5 Authenticated Password Change (Settings)

```
User                     Browser                    Next.js Server           Supabase Auth
  │                         │                           │                       │
  ├─ On /settings, expand  ►│                           │                       │
  │   "Change Password"     │                           │                       │
  │                         │                           │                       │
  ├─ Enter current+new pw ─►│                           │                       │
  │                         ├─ POST changePassword ────►│                       │
  │                         │  (currentPassword,        │                       │
  │                         │   newPassword, confirm)   │                       │
  │                         │                           ├─ getUser() ──────────►│
  │                         │                           │◄── user ──────────────┤
  │                         │                           │                       │
  │                         │                           ├─ signInWithPassword ─►│
  │                         │                           │  (verify current pw)  │
  │                         │                           │◄── ok/fail ───────────┤
  │                         │                           │                       │
  │                         │                           ├─ updateUser ─────────►│
  │                         │                           │  { password: newPw }  │
  │                         │                           │◄── success ───────────┤
  │                         │                           │                       │
  │                         │◄── { success } ───────────┤                       │
```

---

## 4. Data Model Changes

### 4.1 `profiles` Table — Add `force_password_change` Column

The `profiles` table needs a boolean flag to track users who haven't yet set their password after being invited.

```sql
-- Migration: 00009_password_auth.sql

-- Add force_password_change flag to profiles
ALTER TABLE public.profiles
  ADD COLUMN force_password_change boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.force_password_change
  IS 'When true, middleware redirects user to /auth/set-password. Set true on admin-invite, false after password set.';
```

### 4.2 `allowlist` Table — No Structural Changes

The `allowlist` table remains unchanged. Its purpose is preserved: only emails in the allowlist can access the app. The change is **operational** — instead of the admin adding an email and the user self-authenticating, the admin creates the user AND adds to allowlist in a single atomic action.

Current schema (unchanged):
```sql
CREATE TABLE public.allowlist (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email      text NOT NULL UNIQUE,
  added_by   uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT allowlist_email_lowercase CHECK (email = lower(email))
);
```

### 4.3 `handle_new_user()` Trigger — Minor Update

Update the trigger function to also read display_name from `user_metadata` (since admin.createUser can pass it):

```sql
-- Part of migration 00009_password_auth.sql

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(
      NEW.raw_user_meta_data->>'display_name',
      NEW.raw_user_meta_data->>'full_name',
      split_part(NEW.email, '@', 1)
    ),
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$;
```

### 4.4 Full Migration File

```sql
-- ============================================================================
-- Migration: 00009_password_auth.sql
-- Description: Add password auth support — force_password_change flag,
--              update handle_new_user trigger to read display_name from metadata.
-- ============================================================================

-- 1. Add force_password_change column to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS force_password_change boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.force_password_change
  IS 'When true, middleware redirects the user to set their password. Set on admin-invite, cleared after password set.';

-- 2. Update the handle_new_user trigger to prefer display_name from user_metadata
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(
      NEW.raw_user_meta_data->>'display_name',
      NEW.raw_user_meta_data->>'full_name',
      split_part(NEW.email, '@', 1)
    ),
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$;

-- Note: The trigger on_auth_user_created already exists from 00001_initial_schema.sql
-- and does not need to be recreated. It will use the updated function.
```

### 4.5 Database Types Update

The `profiles` type in `src/lib/database.types.ts` needs `force_password_change` added:

```typescript
// In profiles Row:
force_password_change: boolean

// In profiles Insert:
force_password_change?: boolean

// In profiles Update:
force_password_change?: boolean
```

> **Note:** Run `npx supabase gen types typescript` after applying the migration to auto-regenerate this file.

---

## 5. Security Controls

### 5.1 Password Hashing

| Aspect | Detail |
|--------|--------|
| Algorithm | bcrypt (Supabase Auth default) |
| Cost factor | 10 (Supabase default) |
| Implementation | Server-side in GoTrue; passwords never stored in application code |
| Wire security | HTTPS enforced (Vercel + Supabase API) |
| Client-side | Plaintext over TLS to Supabase Auth API; no client-side hashing needed |

### 5.2 Password Requirements

| Rule | Value |
|------|-------|
| Minimum length | **8 characters** (up from current 6) |
| Complexity | `letters_digits` — must contain both letters AND digits |
| Max length | 72 (bcrypt limit, enforced by Supabase) |
| Client-side validation | Zod schema mirrors server rules |
| Server enforcement | Supabase Auth rejects weak passwords with a clear error message |

**Supabase config changes:**
```toml
minimum_password_length = 8
password_requirements = "letters_digits"
```

### 5.3 Rate Limiting

| Endpoint | Limit | Config Key |
|----------|-------|------------|
| Sign-in attempts | 30 per 5 min per IP | `sign_in_sign_ups` |
| Password reset emails | 2 per hour | `email_sent` |
| Token refresh | 150 per 5 min per IP | `token_refresh` |
| Token verifications (recovery links) | 30 per 5 min per IP | `token_verifications` |

**Recommended tightening for password auth:**
```toml
[auth.rate_limit]
email_sent = 3           # Allow 3/hour (invite + reset flexibility for admin)
sign_in_sign_ups = 15    # Tighten to 15 per 5 min (brute-force protection)
token_refresh = 150      # Keep as-is
token_verifications = 10  # Tighten (fewer recovery link attempts needed)
```

### 5.4 Brute Force Protection

- **Supabase built-in:** After rate limit is hit, GoTrue returns HTTP 429 with `Retry-After` header
- **Application layer:** Login form disables submit button and shows "Too many attempts, try again later" on 429
- **No account lockout:** Supabase does not lock accounts (by design — prevents denial-of-service via lockout). Rate limiting per IP is the defense
- **Generic error messages:** Login errors always show "Invalid email or password" — never reveal whether an account exists

### 5.5 CSRF Protection

| Layer | Mechanism |
|-------|-----------|
| Next.js Server Actions | Built-in CSRF token validation (origin checking via `__Host-` prefixed cookies) |
| Supabase Auth API | PKCE flow for recovery links; no bearer tokens in URLs |
| Cookie flags | `HttpOnly`, `Secure`, `SameSite=Lax` (set by `@supabase/ssr`) |

No additional CSRF measures needed — Server Actions in Next.js 14 include automatic CSRF protection.

### 5.6 Session Management

| Aspect | Configuration |
|--------|---------------|
| Token type | JWT (access token) + opaque refresh token |
| Access token TTL | 3600 seconds (1 hour) — unchanged |
| Refresh token rotation | Enabled (`enable_refresh_token_rotation = true`) |
| Refresh token reuse interval | 10 seconds (anti-replay) |
| Cookie storage | `sb-<ref>-auth-token` cookie, `HttpOnly`, `Secure`, `SameSite=Lax` |
| Session refresh | Middleware calls `getUser()` on every request which auto-refreshes |

### 5.7 Admin-Only Action Protection

All admin server actions use the `requireAdmin()` guard:

```typescript
async function requireAdmin(): Promise<string> {
  const supabase = createClient();  // server client with user session cookies
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  const { data: isAdmin } = await supabase.rpc('is_admin');
  if (!isAdmin) throw new Error('Forbidden');
  return user.id;
}
```

- `is_admin` is a PostgreSQL RPC function that checks `profiles.is_admin`
- RLS policies on `allowlist` restrict writes to admin users
- Service-role client is only instantiated AFTER admin verification
- All admin actions are logged in `admin_audit_log`

### 5.8 Invite Link Security

| Aspect | Detail |
|--------|--------|
| Link type | Recovery link (one-time use) |
| Expiry | 3600 seconds (1 hour, configurable via `otp_expiry`) |
| Delivery | Email only (Supabase handles sending) |
| PKCE | Token hash in URL, exchanged server-side via `verifyOtp` |
| Reuse | One-time; consumed on verification |

### 5.9 What to Disable

| Feature | Why Disable | Setting |
|---------|-------------|---------|
| Public signup | Users must be admin-created | `enable_signup = false` |
| Magic link / OTP | Replaced by password auth | Remove OTP code from login page |
| Google OAuth | Replaced by password auth | Remove from login page; optionally disable in Supabase dashboard |
| Anonymous sign-ins | Already disabled | `enable_anonymous_sign_ins = false` (unchanged) |

> **Important:** `enable_signup = false` in Supabase config prevents public signups via `signUp()` but DOES NOT prevent `admin.createUser()` (which uses `service_role` key). This is the desired behavior.

---

## 6. API Contracts (Server Actions)

All server actions are in `src/app/login/actions.ts` (public) or `src/app/(authenticated)/admin/actions.ts` (admin) or `src/app/(authenticated)/settings/actions.ts` (authenticated user) or `src/app/auth/actions.ts` (recovery flow).

### 6.1 `loginWithPassword`

**File:** `src/app/login/actions.ts`

```typescript
export async function loginWithPassword(
  formData: FormData
): Promise<{ error?: string; success?: boolean }>
```

**Input Validation (Zod):**
```typescript
const loginSchema = z.object({
  email: z.string().email('Please enter a valid email address').transform(v => v.toLowerCase().trim()),
  password: z.string().min(1, 'Password is required'),
});
```

**Authorization:** None (public action)

**Logic:**
1. Parse & validate input with `loginSchema`
2. Create server Supabase client (from `@/lib/supabase/server`)
3. Call `supabase.auth.signInWithPassword({ email, password })`
4. On success: `redirect('/')` (Next.js redirect)
5. On error: return `{ error: 'Invalid email or password' }` (generic message)

**Error Cases:**
| Case | Return |
|------|--------|
| Invalid email format | `{ error: "Please enter a valid email address" }` |
| Empty password | `{ error: "Password is required" }` |
| Wrong credentials | `{ error: "Invalid email or password" }` |
| Rate limited (429) | `{ error: "Too many login attempts. Please try again later." }` |
| Network/server error | `{ error: "Something went wrong. Please try again." }` |

**Security Notes:**
- Never reveal whether email exists in system
- `signInWithPassword` does NOT send any emails
- Rate limiting enforced by Supabase Auth (30/5min per IP)

---

### 6.2 `adminCreateUser`

**File:** `src/app/(authenticated)/admin/actions.ts`

```typescript
export async function adminCreateUser(
  formData: FormData
): Promise<{ error?: string; success?: boolean }>
```

**Input Validation (Zod):**
```typescript
const adminCreateUserSchema = z.object({
  email: z.string().email('Please enter a valid email address').transform(v => v.toLowerCase().trim()),
  displayName: z.string().min(3, 'Display name must be at least 3 characters')
    .max(20, 'Display name cannot exceed 20 characters').trim(),
});
```

**Authorization:** `requireAdmin()` — must be authenticated admin

**Logic:**
1. `requireAdmin()` — verify caller is admin
2. Parse & validate input
3. Check allowlist for duplicate email
4. Check total user count < `MAX_USERS` (30)
5. Generate cryptographically random temporary password (`crypto.randomUUID()`)
6. Call `adminClient.auth.admin.createUser({ email, password: tempPassword, email_confirm: true, user_metadata: { display_name: displayName } })`
7. Insert into `allowlist` table
8. Set `force_password_change = true` on the new user's profile
9. Call `adminClient.auth.admin.generateLink({ type: 'recovery', email })` — this produces a recovery link
10. Supabase sends the invite/recovery email to the user
11. Audit log the action
12. `revalidatePath('/admin/users')`
13. Return `{ success: true }`

**Error Cases:**
| Case | Return |
|------|--------|
| Not authenticated | `{ error: "Not authenticated" }` |
| Not admin | `{ error: "Forbidden" }` |
| Invalid input | Zod error message |
| Duplicate email | `{ error: "This email is already registered." }` |
| Max users reached | `{ error: "Maximum user limit (30) reached." }` |
| Supabase create error | `{ error: "Failed to create user. Please try again." }` |

**Rollback:** If profile/allowlist insert fails after auth.users creation, delete the auth user via `admin.deleteUser(userId)`.

---

### 6.3 `adminResetUserPassword`

**File:** `src/app/(authenticated)/admin/actions.ts`

```typescript
export async function adminResetUserPassword(
  formData: FormData
): Promise<{ error?: string; success?: boolean }>
```

**Input Validation:**
```typescript
const adminResetPasswordSchema = z.object({
  userId: z.string().uuid('Invalid user ID'),
  email: z.string().email('Invalid email'),
});
```

**Authorization:** `requireAdmin()`

**Logic:**
1. `requireAdmin()`
2. Parse & validate
3. Call `adminClient.auth.admin.generateLink({ type: 'recovery', email })`
4. Set `force_password_change = true` on the user's profile
5. Audit log
6. Return `{ success: true }`

**Error Cases:**
| Case | Return |
|------|--------|
| Not admin | `{ error: "Forbidden" }` |
| User not found | `{ error: "User not found" }` |
| Email send failure | `{ error: "Failed to send reset email." }` |

---

### 6.4 `adminResendInvite`

**File:** `src/app/(authenticated)/admin/actions.ts`

```typescript
export async function adminResendInvite(
  formData: FormData
): Promise<{ error?: string; success?: boolean }>
```

**Input Validation:**
```typescript
const adminResendInviteSchema = z.object({
  userId: z.string().uuid('Invalid user ID'),
  email: z.string().email('Invalid email'),
});
```

**Authorization:** `requireAdmin()`

**Logic:**
1. `requireAdmin()`
2. Parse & validate
3. Verify user exists and `force_password_change = true` (hasn't activated yet)
4. Call `adminClient.auth.admin.generateLink({ type: 'recovery', email })`
5. Audit log
6. Return `{ success: true }`

**Error Cases:**
| Case | Return |
|------|--------|
| Not admin | `{ error: "Forbidden" }` |
| User not found | `{ error: "User not found" }` |
| User already activated | `{ error: "User has already set their password." }` |
| Rate limited | `{ error: "Please wait before sending another invite." }` |

---

### 6.5 `changePassword`

**File:** `src/app/(authenticated)/settings/actions.ts`

```typescript
export async function changePassword(
  formData: FormData
): Promise<{ error?: string; success?: boolean }>
```

**Input Validation:**
```typescript
const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[a-zA-Z]/, 'Password must contain at least one letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
  confirmPassword: z.string(),
}).refine(data => data.newPassword === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
}).refine(data => data.currentPassword !== data.newPassword, {
  message: 'New password must be different from current password',
  path: ['newPassword'],
});
```

**Authorization:** Must be authenticated (checks via `supabase.auth.getUser()`)

**Logic:**
1. Get current user via server client
2. Parse & validate input
3. Verify current password: call `supabase.auth.signInWithPassword({ email: user.email, password: currentPassword })` using a **separate** client instance to avoid disrupting the session
4. If verification fails → return error
5. Call `supabase.auth.updateUser({ password: newPassword })`
6. Audit log (optional, user-initiated)
7. Return `{ success: true }`

**Error Cases:**
| Case | Return |
|------|--------|
| Not authenticated | `{ error: "Not authenticated" }` |
| Invalid current password | `{ error: "Current password is incorrect" }` |
| Weak new password | Zod error message |
| Passwords don't match | `{ error: "Passwords do not match" }` |
| Same as current | `{ error: "New password must be different from current password" }` |

---

### 6.6 `requestPasswordReset`

**File:** `src/app/login/actions.ts` (or `src/app/forgot-password/actions.ts`)

```typescript
export async function requestPasswordReset(
  formData: FormData
): Promise<{ error?: string; success?: boolean }>
```

**Input Validation:**
```typescript
const resetRequestSchema = z.object({
  email: z.string().email('Please enter a valid email address').transform(v => v.toLowerCase().trim()),
});
```

**Authorization:** None (public action — unauthenticated users need this)

**Logic:**
1. Parse & validate email
2. Check allowlist — only send reset emails for allowlisted users
3. Call `supabase.auth.resetPasswordForEmail(email, { redirectTo: '/auth/confirm' })`
4. **Always** return success (even if email not found) to prevent email enumeration
5. Return `{ success: true }`

**Error Cases:**
| Case | Return |
|------|--------|
| Invalid email format | Zod error |
| Email not in allowlist | `{ success: true }` (silent — anti-enumeration) |
| Rate limited | `{ error: "Too many requests. Please try again later." }` |
| Any other error | `{ success: true }` (silent — anti-enumeration) |

**Security Note:** Always return success to prevent oracle attacks. The allowlist check prevents sending emails to non-users (saves email quota).

---

### 6.7 `setNewPassword`

**File:** `src/app/auth/actions.ts`

```typescript
export async function setNewPassword(
  formData: FormData
): Promise<{ error?: string; success?: boolean }>
```

**Input Validation:**
```typescript
const setPasswordSchema = z.object({
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[a-zA-Z]/, 'Password must contain at least one letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
  confirmPassword: z.string(),
}).refine(data => data.password === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});
```

**Authorization:** Must have a valid session (recovery link gives a session after `verifyOtp`)

**Logic:**
1. Get user via server client (session exists from recovery link exchange)
2. If no user → redirect to `/login`
3. Parse & validate input
4. Call `supabase.auth.updateUser({ password })`
5. Set `force_password_change = false` on profiles
6. `redirect('/')` on success

**Error Cases:**
| Case | Return |
|------|--------|
| No session | Redirect to `/login` |
| Weak password | Zod error |
| Passwords don't match | Zod error |
| Supabase error | `{ error: "Failed to set password. Please try again." }` |

---

## 7. Middleware Changes

### 7.1 Current Middleware (`src/middleware.ts`)

```typescript
// Current behavior:
// 1. Allow public paths (/login, /auth/callback)
// 2. Refresh session
// 3. Check auth → redirect to /login if not authenticated
// 4. Check allowlist → sign out + redirect if not allowed
// 5. Check admin for /admin routes
```

### 7.2 Updated Middleware

**Changes needed:**

1. **Add `/auth/confirm` and `/auth/set-password` and `/forgot-password` to `PUBLIC_PATHS`**
2. **Add `force_password_change` redirect** — if user is authenticated but has `force_password_change = true`, redirect to `/auth/set-password` (unless already on that path)
3. **Remove `/auth/callback` from public paths** (no longer needed for magic link — but **keep it** for recovery link PKCE exchange; actually, `/auth/confirm` replaces this)

```typescript
import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

const PUBLIC_PATHS = ['/login', '/auth/confirm', '/auth/set-password', '/forgot-password'];
const PASSWORD_SETUP_PATH = '/auth/set-password';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public paths through (with session refresh)
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    const { response } = await updateSession(request);
    return response;
  }

  // Refresh session and get user
  const { supabase, user, response } = await updateSession(request);

  // Not authenticated → redirect to login
  if (!user) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  // Allowlist check
  const { data: allowlisted } = await supabase
    .from('allowlist')
    .select('id')
    .eq('email', user.email?.toLowerCase() ?? '')
    .maybeSingle();

  if (!allowlisted) {
    await supabase.auth.signOut();
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('error', 'not_allowed');
    return NextResponse.redirect(url);
  }

  // Force password change check
  const { data: profile } = await supabase
    .from('profiles')
    .select('force_password_change')
    .eq('id', user.id)
    .single();

  if (profile?.force_password_change && pathname !== PASSWORD_SETUP_PATH) {
    const url = request.nextUrl.clone();
    url.pathname = PASSWORD_SETUP_PATH;
    return NextResponse.redirect(url);
  }

  // Admin routes check
  if (pathname.startsWith('/admin')) {
    const { data: isAdmin } = await supabase.rpc('is_admin');
    if (!isAdmin) {
      const url = request.nextUrl.clone();
      url.pathname = '/';
      return NextResponse.redirect(url);
    }
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$|api/cron).*)',
  ],
};
```

### 7.3 Middleware Performance Note

The `force_password_change` check adds one DB query per request. For a 30-user app this is negligible. If needed, this could be cached in the JWT custom claims via a Supabase Auth hook, but that's overkill for this scale.

---

## 8. Route Structure

### 8.1 New Routes

| Route | Type | Purpose |
|-------|------|---------|
| `/forgot-password` | Page | Enter email to request password reset |
| `/auth/confirm` | Route Handler (GET) | Receives recovery/invite links, exchanges token via `verifyOtp`, redirects |
| `/auth/set-password` | Page | Set new password (after invite or recovery link) |

### 8.2 Modified Routes

| Route | Change |
|-------|--------|
| `/login` | Replace magic-link + Google OAuth with email + password form + "Forgot password?" link |
| `/admin/users` | Add "Create User" form (email + display name), add "Reset Password" and "Resend Invite" buttons per user |
| `/settings` | Add "Change Password" section |

### 8.3 Removed Routes

| Route | Reason |
|-------|--------|
| `/auth/callback` | No longer needed; replaced by `/auth/confirm` |

### 8.4 Full Route Map

```
/login                          ← Email + password login form
/forgot-password                ← Request password reset email
/auth/confirm                   ← Route handler: verify recovery token, redirect
/auth/set-password             ← Set/reset password form
/(authenticated)/              ← Dashboard (existing)
/(authenticated)/admin/users   ← User management (modified)
/(authenticated)/settings      ← Settings + change password (modified)
```

---

## 9. Component Hierarchy

### 9.1 Login Page (`/login`)

```
LoginPage (page.tsx)
└─ LoginContent (client component)
   ├─ Branding (logo, title)
   ├─ Alert (error display)
   ├─ Card
   │  ├─ form (email + password)
   │  │  ├─ Input (email)
   │  │  ├─ Input (password, type="password")
   │  │  └─ Button ("Sign In")
   │  └─ Link ("Forgot your password?")
   └─ (No Google OAuth button)
   └─ (No magic link)
```

### 9.2 Forgot Password Page (`/forgot-password`)

```
ForgotPasswordPage (page.tsx)
└─ ForgotPasswordContent (client component)
   ├─ Branding
   ├─ Alert (success / error)
   ├─ Card
   │  ├─ form (email)
   │  │  ├─ Input (email)
   │  │  └─ Button ("Send Reset Link")
   │  └─ Link ("Back to login")
   └─ Alert ("Check your email" — after submit)
```

### 9.3 Set Password Page (`/auth/set-password`)

```
SetPasswordPage (page.tsx)
└─ SetPasswordContent (client component)
   ├─ Branding
   ├─ Alert (error)
   ├─ Card
   │  ├─ form (new password + confirm)
   │  │  ├─ Input (password)
   │  │  ├─ Input (confirm password)
   │  │  ├─ Password strength indicator (optional)
   │  │  └─ Button ("Set Password")
   └─ (No navigation — user must set password first)
```

### 9.4 Admin Users Page (`/admin/users`) — Updated

```
AdminUsersPage (page.tsx)
└─ div
   ├─ h2 "User Management"
   │
   ├─ Card "Create New User"            ← NEW
   │  ├─ form (email + displayName)
   │  │  ├─ Input (email)
   │  │  ├─ Input (displayName)
   │  │  └─ Button ("Create & Send Invite")
   │  └─ Alert (success/error)
   │
   ├─ Card "Allowlisted Users"           ← MODIFIED
   │  └─ list of users
   │     └─ per user row:
   │        ├─ email, display name, status badge ("Active" / "Pending")
   │        ├─ Button "Resend Invite" (if pending)  ← NEW
   │        ├─ Button "Reset Password"               ← NEW
   │        └─ Button "Remove" (with confirm)
```

### 9.5 Settings Page — Updated

```
SettingsPage (page.tsx)
└─ div
   ├─ (existing display name section)
   │
   ├─ Card "Change Password"             ← NEW
   │  ├─ form
   │  │  ├─ Input (current password)
   │  │  ├─ Input (new password)
   │  │  ├─ Input (confirm new password)
   │  │  └─ Button ("Change Password")
   │  └─ Alert (success/error)
   │
   ├─ (existing links section)
   ├─ (existing sign-out section)
```

---

## 10. Supabase Dashboard Configuration

### 10.1 Settings to Change in Supabase Dashboard (Production)

Navigate to **Authentication → Providers** in the Supabase Dashboard:

| Setting | Current | New | Location |
|---------|---------|-----|----------|
| Email Auth → Enable Sign Up | ✅ Enabled | ❌ Disabled | Auth → Providers → Email |
| Email Auth → Confirm Email | ❌ Disabled | Keep ❌ Disabled | Auth → Providers → Email |
| Email Auth → Secure Password Change | ❌ Disabled | ✅ Enabled | Auth → Providers → Email |
| Email Auth → Min Password Length | 6 | **8** | Auth → Providers → Email |
| Email Auth → Password Requirements | (none) | **letters_digits** | Auth → Providers → Email |
| Google OAuth | ✅ Enabled | ❌ Disabled | Auth → Providers → Google |
| Auth → URL Configuration → Redirect URLs | includes `/auth/callback` | Add `/auth/confirm`, keep `/auth/callback` temporarily | Auth → URL Config |

### 10.2 Settings to Change in `supabase/config.toml` (Local Dev)

```toml
[auth]
enable_signup = false                    # Was: true — prevent public signups
minimum_password_length = 8              # Was: 6
password_requirements = "letters_digits" # Was: ""

[auth.email]
enable_signup = false                    # Was: true — prevent public email signups
enable_confirmations = false             # Keep as-is (admin confirms on creation)
secure_password_change = true            # Was: false — require recent auth for pw change
max_frequency = "60s"                    # Was: "1s" — rate limit recovery emails

[auth.rate_limit]
email_sent = 3                           # Was: 2 — slight increase for admin invite flow
sign_in_sign_ups = 15                    # Was: 30 — tighten for brute-force protection
token_verifications = 10                 # Was: 30 — fewer recovery link attempts needed
```

### 10.3 Email Templates

Configure the recovery email template to look like an invite:

**Dashboard → Authentication → Email Templates → Reset Password:**

Subject: `You've been invited to Grand Football`

```html
<h2>Welcome to Grand Football!</h2>
<p>You've been invited to join the league. Click the link below to set your password and get started:</p>
<p><a href="{{ .ConfirmationURL }}">Set Your Password</a></p>
<p>This link expires in 1 hour.</p>
```

Alternatively, configure via `config.toml`:

```toml
[auth.email.template.recovery]
subject = "Set your Grand Football password"
content_path = "./supabase/templates/recovery.html"
```

---

## 11. File Inventory

### 11.1 Files to CREATE

| # | Path | Purpose |
|---|------|---------|
| 1 | `supabase/migrations/00009_password_auth.sql` | Add `force_password_change` column, update trigger |
| 2 | `src/app/forgot-password/page.tsx` | Forgot password page (email form) |
| 3 | `src/app/forgot-password/actions.ts` | `requestPasswordReset` server action |
| 4 | `src/app/auth/confirm/route.ts` | Route handler: verify recovery token, redirect to set-password |
| 5 | `src/app/auth/set-password/page.tsx` | Set new password page |
| 6 | `src/app/auth/actions.ts` | `setNewPassword` server action |
| 7 | `supabase/templates/recovery.html` | Custom recovery email template (optional) |

### 11.2 Files to MODIFY

| # | Path | Changes |
|---|------|---------|
| 1 | **`src/app/login/page.tsx`** | Replace magic-link + Google OAuth UI with email + password form. Remove `handleMagicLink()`, `handleGoogle()`. Add password input, "Forgot password?" link. |
| 2 | **`src/app/login/actions.ts`** | Replace `checkAllowlist()` with `loginWithPassword()`. Add `requestPasswordReset()` (or put in forgot-password/actions.ts). |
| 3 | **`src/middleware.ts`** | Add `/auth/confirm`, `/auth/set-password`, `/forgot-password` to `PUBLIC_PATHS`. Add `force_password_change` redirect logic. |
| 4 | **`src/app/(authenticated)/admin/actions.ts`** | Add `adminCreateUser()`, `adminResetUserPassword()`, `adminResendInvite()`. Update `ADMIN_ACTIONS` constants. Keep existing `addToAllowlist`/`removeFromAllowlist` or merge into new flow. |
| 5 | **`src/app/(authenticated)/admin/users/page.tsx`** | Add "Create User" form (email + displayName). Add per-user "Reset Password" and "Resend Invite" buttons. Show user status (active/pending). |
| 6 | **`src/app/(authenticated)/settings/page.tsx`** | Add "Change Password" card with current/new/confirm fields. |
| 7 | **`src/app/(authenticated)/settings/actions.ts`** | Add `changePassword()` server action. |
| 8 | **`src/lib/validations.ts`** | Add `loginSchema`, `changePasswordSchema`, `setPasswordSchema`, `adminCreateUserSchema`, `adminResetPasswordSchema`, `adminResendInviteSchema`, `resetRequestSchema`. |
| 9 | **`src/lib/constants.ts`** | Add `ADMIN_ACTIONS.CREATE_USER`, `ADMIN_ACTIONS.RESET_PASSWORD`, `ADMIN_ACTIONS.RESEND_INVITE`. Add `PASSWORD_MIN_LENGTH = 8`. |
| 10 | **`src/lib/database.types.ts`** | Add `force_password_change` to `profiles` Row/Insert/Update types (auto-generated). |
| 11 | **`supabase/config.toml`** | Update `enable_signup`, `minimum_password_length`, `password_requirements`, `secure_password_change`, rate limits. |

### 11.3 Files to DELETE

| # | Path | Reason |
|---|------|--------|
| 1 | **`src/app/auth/callback/route.ts`** | No longer needed — magic link / OAuth callback replaced by `/auth/confirm` route handler for recovery links. |

> **Note:** If you want to be cautious, keep `/auth/callback/route.ts` during a transition period and have it redirect to `/login`. Then delete later.

### 11.4 Files UNCHANGED

- `src/lib/supabase/client.ts` — No changes needed
- `src/lib/supabase/server.ts` — No changes needed
- `src/lib/supabase/admin.ts` — No changes needed
- `src/lib/supabase/middleware.ts` — No changes needed
- `src/app/layout.tsx` — No changes needed
- `src/app/(authenticated)/layout.tsx` — No changes needed
- All fixture/prediction/leaderboard/badge components — No changes needed

---

## 12. Migration Checklist

### Phase 1: Database & Config
- [ ] Create migration `00009_password_auth.sql`
- [ ] Run migration against local Supabase
- [ ] Regenerate `database.types.ts` via `npx supabase gen types typescript`
- [ ] Update `supabase/config.toml` with new auth settings
- [ ] Update `src/lib/constants.ts` with new admin actions and password constants
- [ ] Update `src/lib/validations.ts` with new Zod schemas

### Phase 2: Core Auth
- [ ] Create `/auth/confirm/route.ts` (recovery link handler)
- [ ] Create `/auth/set-password/page.tsx` + `/auth/actions.ts`
- [ ] Create `/forgot-password/page.tsx` + `actions.ts`
- [ ] Rewrite `/login/page.tsx` for email + password
- [ ] Rewrite `/login/actions.ts` with `loginWithPassword`
- [ ] Update middleware for new public paths + `force_password_change` redirect

### Phase 3: Admin User Management
- [ ] Add `adminCreateUser`, `adminResetUserPassword`, `adminResendInvite` to admin actions
- [ ] Update admin users page with new create user form and per-user actions

### Phase 4: Settings
- [ ] Add `changePassword` action to settings
- [ ] Update settings page with change password form

### Phase 5: Cleanup
- [ ] Delete `/auth/callback/route.ts` (or redirect to `/login`)
- [ ] Remove Google OAuth code from login page
- [ ] Remove magic link code from login page
- [ ] Disable Google OAuth in Supabase dashboard
- [ ] Disable public signup in Supabase dashboard
- [ ] Set password requirements in Supabase dashboard
- [ ] Configure recovery email template

### Phase 6: Testing
- [ ] Test admin creates user → user receives email → sets password → logs in
- [ ] Test normal login (email + password)
- [ ] Test forgot password flow
- [ ] Test change password (settings)
- [ ] Test `force_password_change` redirect
- [ ] Test admin reset password
- [ ] Test admin resend invite
- [ ] Test rate limiting (exceed login attempts)
- [ ] Test invalid credentials (generic error message)
- [ ] Test allowlist enforcement
- [ ] Test admin-only route protection
- [ ] Test removal of user (allowlist + what happens to auth user)
- [ ] Test recovery link expiry (1 hour)
- [ ] Verify no emails sent during normal login

---

## Appendix A: Recovery Link Flow (Supabase Internals)

When `admin.generateLink({ type: 'recovery', email })` is called:
1. Supabase generates a one-time token (OTP hash)
2. Constructs a URL: `{SITE_URL}/auth/confirm?token_hash={hash}&type=recovery`
3. Sends an email to the user with this link (using the recovery template)
4. User clicks link → hits `/auth/confirm` route handler
5. Route handler calls `supabase.auth.verifyOtp({ token_hash, type: 'recovery' })`
6. On success: session is created, user is redirected to `/auth/set-password`
7. User sets password via `supabase.auth.updateUser({ password })`

## Appendix B: Password Validation (Dual Enforcement)

Passwords are validated at **two** levels:

1. **Client-side (Zod):** Immediate feedback, no network call
   ```typescript
   z.string()
     .min(8, 'Password must be at least 8 characters')
     .regex(/[a-zA-Z]/, 'Must contain at least one letter')
     .regex(/[0-9]/, 'Must contain at least one number')
   ```

2. **Server-side (Supabase Auth):** GoTrue enforces `minimum_password_length = 8` and `password_requirements = "letters_digits"`. Returns `422 Unprocessable Entity` with descriptive error if password is weak.

Both must pass. Client-side is for UX; server-side is the security boundary.

## Appendix C: `auth/confirm` Route Handler Implementation Sketch

```typescript
// src/app/auth/confirm/route.ts
import { NextResponse } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { Database } from '@/lib/database.types';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const token_hash = searchParams.get('token_hash');
  const type = searchParams.get('type') as 'recovery' | 'email' | null;

  if (!token_hash || type !== 'recovery') {
    return NextResponse.redirect(`${origin}/login?error=expired`);
  }

  const cookieStore = cookies();
  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        },
      },
    },
  );

  const { error } = await supabase.auth.verifyOtp({
    token_hash,
    type: 'recovery',
  });

  if (error) {
    return NextResponse.redirect(`${origin}/login?error=expired`);
  }

  // Recovery link verified — user now has a session
  // Redirect to set-password page
  return NextResponse.redirect(`${origin}/auth/set-password`);
}
```
