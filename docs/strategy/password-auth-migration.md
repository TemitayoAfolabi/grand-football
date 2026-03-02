# Password-Based Authentication — Design Document

**Status:** Draft  
**Created:** 2026-02-28  
**Author:** Strategy & Design Agent  
**Stakeholders:** Admin, ~30 users  

---

## Table of Contents

1. [Overview](#1-overview)
2. [User Stories & Acceptance Criteria](#2-user-stories--acceptance-criteria)
3. [UI/UX Design Specifications](#3-uiux-design-specifications)
4. [Edge Cases & Error Handling](#4-edge-cases--error-handling)
5. [Migration Strategy](#5-migration-strategy)
6. [Accessibility Requirements](#6-accessibility-requirements)
7. [Technical Reference](#7-technical-reference)

---

## 1. Overview

### 1.1 Current State

The app currently supports two login methods:

- **Magic link (OTP email):** User enters email → receives magic link → clicks to sign in (`src/app/login/page.tsx` calls `signInWithOtp`)
- **Google OAuth:** "Continue with Google" button calls `signInWithOAuth({ provider: 'google' })`
- **Allowlist gating:** `allowlist` table restricts who may authenticate. Checked in middleware (`src/middleware.ts`) and at the auth callback (`src/app/auth/callback/route.ts`)
- **Admin user management:** Admin adds/removes emails from the `allowlist` table (`src/app/(authenticated)/admin/users/page.tsx`)

### 1.2 Target State

- **Login method:** Email + password only. No magic links, no OTP, no Google OAuth.
- **Account provisioning:** Admin pre-creates all 30 user accounts via the Admin panel. Each user receives exactly ONE email (invite link to set their password).
- **First login:** User clicks invite link → sets password → redirected to app.
- **Subsequent logins:** Email + password form. No email sent.
- **Optional:** "Forgot password" flow sends a one-time reset link.

### 1.3 Supabase Auth Capabilities Used

| Capability | Method |
|---|---|
| Admin creates user | `supabase.auth.admin.createUser({ email, email_confirm: true })` |
| Invite email | `supabase.auth.admin.inviteUserByEmail(email)` |
| Password sign-in | `supabase.auth.signInWithPassword({ email, password })` |
| Password update | `supabase.auth.updateUser({ password })` |
| Password reset email | `supabase.auth.resetPasswordForEmail(email)` |
| Sign out | `supabase.auth.signOut()` |

---

## 2. User Stories & Acceptance Criteria

### US-01: Admin Creates User Account

> **As an** admin  
> **I want to** create a new user account by entering their email address  
> **So that** the user receives an invite email to set their password and join the app  

**Acceptance Criteria:**

| # | Given | When | Then |
|---|---|---|---|
| AC-01.1 | Admin is on `/admin/users` page | Admin enters a valid email and clicks "Create User" | A new `auth.users` entry is created via `supabase.auth.admin.inviteUserByEmail(email)`, the email is added to the `allowlist`, and the user receives a "Set your password" invite email |
| AC-01.2 | Admin is on `/admin/users` page | Admin enters a valid email and clicks "Create User" | A `profiles` row is created with a default `display_name` of `''` and `is_admin = false` |
| AC-01.3 | Admin enters an email that already exists in `auth.users` | Admin clicks "Create User" | An error message is displayed: "This user already exists." No duplicate is created |
| AC-01.4 | Admin enters an invalid email format | Admin clicks "Create User" | Client-side validation prevents submission; shows "Please enter a valid email address" |
| AC-01.5 | Admin successfully creates a user | — | An audit log entry is written with action `CREATE_USER`, target_type `user`, and the new email as `new_value` |
| AC-01.6 | Admin is on `/admin/users` page | — | The user list shows each user's email, account status (invited / active), and creation date |

**Notes:**
- `supabase.auth.admin.inviteUserByEmail(email)` creates the user in `auth.users` AND sends the invite email in one call.
- The invite link contains a token that expires (configurable, default 24h).
- The `on_auth_user_created` trigger already creates a `profiles` row.

---

### US-02: User Receives Invite Email

> **As a** newly created user  
> **I want to** receive a single invite email with a link to set my password  
> **So that** I can create my credentials and start using the app  

**Acceptance Criteria:**

| # | Given | When | Then |
|---|---|---|---|
| AC-02.1 | Admin has created the user account | — | The user receives exactly ONE email with subject "You've been invited to Grand Football" |
| AC-02.2 | The invite email is received | User opens the email | The email contains a branded message, a prominent "Set Your Password" CTA button linking to `{site_url}/auth/callback?token_hash=...&type=invite&next=/auth/set-password` |
| AC-02.3 | The invite email is received | User does NOT click the link within the expiry period (24 hours) | The link expires and can no longer be used (see Edge Case EC-01) |

---

### US-03: User Sets Initial Password

> **As a** newly invited user  
> **I want to** set my password after clicking the invite link  
> **So that** I can log into the app going forward  

**Acceptance Criteria:**

| # | Given | When | Then |
|---|---|---|---|
| AC-03.1 | User clicks a valid invite link | The `/auth/callback` route exchanges the token for a session | User is redirected to `/auth/set-password` |
| AC-03.2 | User is on `/auth/set-password` | User enters a password meeting requirements (≥8 chars) and confirms it | Password is saved via `supabase.auth.updateUser({ password })`, user is redirected to `/` (dashboard) |
| AC-03.3 | User is on `/auth/set-password` | User enters a password < 8 characters | Error shown: "Password must be at least 8 characters" |
| AC-03.4 | User is on `/auth/set-password` | Password and confirmation don't match | Error shown: "Passwords do not match" |
| AC-03.5 | User has set their password | User navigates to `/login` next time | User can sign in with email + password (no further email sent) |
| AC-03.6 | User is on `/auth/set-password` | User reloads the page while still having a valid session | The page re-renders with the form (session preserved) |

---

### US-04: User Logs In with Email + Password

> **As a** registered user  
> **I want to** sign in with my email and password  
> **So that** I can access the app without needing an email each time  

**Acceptance Criteria:**

| # | Given | When | Then |
|---|---|---|---|
| AC-04.1 | User is on `/login` | User enters correct email and password and clicks "Sign In" | `supabase.auth.signInWithPassword({ email, password })` succeeds, user is redirected to `/` |
| AC-04.2 | User is on `/login` | User enters incorrect password | Error shown: "Invalid email or password" (generic to prevent enumeration) |
| AC-04.3 | User is on `/login` | User enters an email not in the allowlist | Error shown: "Invalid email or password" (same generic message) |
| AC-04.4 | User is on `/login` | No magic link option or Google OAuth button is visible | Only email field, password field, "Sign In" button, and "Forgot password?" link are shown |
| AC-04.5 | User signs in successfully | — | No email is sent. Session cookie is set. Middleware validates session on subsequent requests |
| AC-04.6 | User is on `/login` | User presses Enter in the password field | The form submits (keyboard accessible) |

---

### US-05: User Changes Password

> **As a** logged-in user  
> **I want to** change my password from the settings page  
> **So that** I can keep my account secure  

**Acceptance Criteria:**

| # | Given | When | Then |
|---|---|---|---|
| AC-05.1 | User is on `/settings` | User clicks "Change Password" | A "Change Password" section/modal appears with fields: Current Password, New Password, Confirm New Password |
| AC-05.2 | User fills in all fields correctly | User clicks "Update Password" | `supabase.auth.updateUser({ password: newPassword })` is called, success message shown: "Password updated successfully" |
| AC-05.3 | User enters a new password < 8 characters | User clicks "Update Password" | Error shown: "New password must be at least 8 characters" |
| AC-05.4 | New password and confirmation don't match | User clicks "Update Password" | Error shown: "Passwords do not match" |
| AC-05.5 | User successfully changes password | User signs out and signs back in | The new password works; the old password does not |

**Note:** Supabase `updateUser` requires an active session. If `secure_password_change` is enabled in Supabase config, the current password is validated server-side by Supabase's reauthentication mechanism. We will enable this.

---

### US-06: Admin Resets a User's Password

> **As an** admin  
> **I want to** trigger a password reset for a user  
> **So that** if a user is locked out or forgets their password, I can help them regain access  

**Acceptance Criteria:**

| # | Given | When | Then |
|---|---|---|---|
| AC-06.1 | Admin is on `/admin/users` | Admin clicks "Reset Password" next to a user | A confirmation prompt appears: "Send password reset email to {email}?" |
| AC-06.2 | Admin confirms the reset | — | `supabase.auth.admin.generateLink({ type: 'recovery', email })` is called (or `resetPasswordForEmail`). The user receives a password reset email |
| AC-06.3 | Admin confirms the reset | — | An audit log entry is written with action `RESET_USER_PASSWORD` |
| AC-06.4 | The user clicks the reset link | — | User is taken to `/auth/set-password` to set a new password (same flow as initial setup) |

---

### US-07: User Gets Locked Out After Too Many Attempts

> **As the** system  
> **I want to** rate-limit failed login attempts  
> **So that** brute-force attacks are mitigated  

**Acceptance Criteria:**

| # | Given | When | Then |
|---|---|---|---|
| AC-07.1 | A user (or attacker) has failed 30 sign-in attempts in a 5-minute window from the same IP | Another attempt is made | Supabase returns HTTP 429. The UI shows: "Too many login attempts. Please try again in a few minutes." |
| AC-07.2 | The rate limit window has passed (5 minutes) | User attempts to sign in again | Sign-in proceeds normally |
| AC-07.3 | Rate limit is triggered | — | The error is distinguishable from incorrect credentials in the response status code (429 vs 400) so the UI can show the appropriate message |

**Note:** Supabase GoTrue enforces `sign_in_sign_ups = 30` per 5 minutes per IP (already configured in `config.toml`). No custom rate-limiting middleware is needed, but the UI must handle 429 responses gracefully.

---

### US-08: User Forgot Password (Self-Service)

> **As a** user who has forgotten my password  
> **I want to** request a password reset email  
> **So that** I can regain access without contacting the admin  

**Acceptance Criteria:**

| # | Given | When | Then |
|---|---|---|---|
| AC-08.1 | User is on `/login` | User clicks "Forgot password?" | User is taken to `/login/forgot-password` |
| AC-08.2 | User is on `/login/forgot-password` | User enters their email and clicks "Send Reset Link" | `supabase.auth.resetPasswordForEmail(email, { redirectTo })` is called |
| AC-08.3 | The email exists in the system | — | User receives a password reset email with a link to `/auth/callback?type=recovery` |
| AC-08.4 | The email does NOT exist | — | The same success message is shown ("If an account exists, we've sent a reset link") to prevent email enumeration |
| AC-08.5 | User clicks the reset link | `/auth/callback` exchanges the token | User is redirected to `/auth/set-password` to set a new password |
| AC-08.6 | Reset link has expired | User clicks to link | Redirected to `/login?error=expired` with message "This link has expired. Please request a new one." |

---

## 3. UI/UX Design Specifications

### 3.1 Login Page Redesign (`/login`)

**Current state:** Email input + "Send Magic Link" button + "Continue with Google" button  
**New state:** Email input + Password input + "Sign In" button + "Forgot password?" link

#### Layout (mobile-first, max-width 400px centered)

```
┌──────────────────────────────────┐
│         ⚽ (logo, 80×80)         │
│                                  │
│        Grand Football            │
│   Premier League predictions     │
│      for the elite few           │
│                                  │
│  ┌────────────────────────────┐  │
│  │  [Error/Success Alert]     │  │
│  └────────────────────────────┘  │
│                                  │
│  ┌────────────────────────────┐  │
│  │ Email address              │  │
│  │ ┌──────────────────────┐   │  │
│  │ │ you@example.com      │   │  │
│  │ └──────────────────────┘   │  │
│  │                            │  │
│  │ Password                   │  │
│  │ ┌──────────────────────┐   │  │
│  │ │ ••••••••    👁        │   │  │
│  │ └──────────────────────┘   │  │
│  │                            │  │
│  │ ┌──────────────────────┐   │  │
│  │ │     Sign In          │   │  │
│  │ └──────────────────────┘   │  │
│  │                            │  │
│  │   Forgot password?         │  │
│  └────────────────────────────┘  │
└──────────────────────────────────┘
```

#### Component Details

| Element | Spec |
|---|---|
| Email field | `<Input type="email" label="Email address" autoComplete="email" required />` |
| Password field | `<Input type="password" label="Password" autoComplete="current-password" required />` with show/hide toggle (eye icon) |
| Sign In button | `<Button type="submit" size="lg" className="w-full">Sign In</Button>` — full width, primary accent green |
| Forgot password link | `<Link>` below the button, `text-body-sm text-text-secondary hover:text-accent` centered |
| Error alert | Uses existing `<Alert variant="error">` component. Generic: "Invalid email or password" for auth failures; specific for rate limiting |
| Loading state | Button shows spinner via `loading={isPending}` prop (existing pattern) |

#### What to Remove

- `handleMagicLink()` function and OTP call
- `handleGoogle()` function and OAuth call
- The `<GlowDivider>` "or" separator
- The Google OAuth `<Button>` with SVG
- The `emailSent` success state ("Check your email" alert)

#### What to Add

- Password `<Input>` field with visibility toggle
- `handlePasswordLogin()` function calling `signInWithPassword`
- "Forgot password?" `<Link>` to `/login/forgot-password`
- Handling for HTTP 429 rate-limit responses

#### Error Messages Map

| Scenario | Message |
|---|---|
| Wrong email/password | "Invalid email or password" |
| Rate limited (429) | "Too many login attempts. Please try again in a few minutes." |
| Email not on allowlist | "Invalid email or password" (same, no enumeration) |
| Network error | "Something went wrong. Please check your connection and try again." |
| Account not yet activated (no password set) | "Your account hasn't been set up yet. Check your email for the invite link." |

---

### 3.2 Set Password Page (`/auth/set-password`)

**New page.** Displayed after a user clicks an invite link or password reset link.

#### Layout

```
┌──────────────────────────────────┐
│         ⚽ (logo, 80×80)         │
│                                  │
│      Set Your Password           │
│  Create a password to access     │
│       Grand Football             │
│                                  │
│  ┌────────────────────────────┐  │
│  │ New Password               │  │
│  │ ┌──────────────────────┐   │  │
│  │ │ ••••••••    👁        │   │  │
│  │ └──────────────────────┘   │  │
│  │ Min. 8 characters          │  │
│  │                            │  │
│  │ Confirm Password           │  │
│  │ ┌──────────────────────┐   │  │
│  │ │ ••••••••    👁        │   │  │
│  │ └──────────────────────┘   │  │
│  │                            │  │
│  │ ┌──────────────────────┐   │  │
│  │ │   Set Password        │   │  │
│  │ └──────────────────────┘   │  │
│  └────────────────────────────┘  │
└──────────────────────────────────┘
```

#### Component Details

| Element | Spec |
|---|---|
| Heading | `text-h1`: "Set Your Password" |
| Subtitle | `text-body-sm text-text-secondary` |
| New Password field | `<Input type="password" label="New Password" autoComplete="new-password" required minLength={8} />` with hint "Min. 8 characters" and visibility toggle |
| Confirm Password field | `<Input type="password" label="Confirm Password" autoComplete="new-password" required />` with visibility toggle |
| Submit button | `<Button type="submit" size="lg" className="w-full">Set Password</Button>` |
| Validation | Client-side: min 8 chars, passwords match. Server-side: Supabase enforces `minimum_password_length` |

#### Behaviour

1. `/auth/callback` exchanges the invite/recovery token for a session.
2. Redirects to `/auth/set-password`.
3. Page checks for active session. If no session → redirect to `/login?error=expired`.
4. On submit: calls `supabase.auth.updateUser({ password })`.
5. On success: redirect to `/` (dashboard).

---

### 3.3 Change Password Section in Settings (`/settings`)

**Added to existing settings page** as a new `<Card>` section between "Display Name" and "About".

#### Layout (within existing settings page)

```
┌────────────────────────────────────┐
│ 🔒 Change Password                │
├────────────────────────────────────┤
│ Current Password                   │
│ ┌──────────────────────────────┐   │
│ │ ••••••••                     │   │
│ └──────────────────────────────┘   │
│                                    │
│ New Password                       │
│ ┌──────────────────────────────┐   │
│ │ ••••••••                     │   │
│ └──────────────────────────────┘   │
│ Min. 8 characters                  │
│                                    │
│ Confirm New Password               │
│ ┌──────────────────────────────┐   │
│ │ ••••••••                     │   │
│ └──────────────────────────────┘   │
│                                    │
│ ┌──────────────────────────────┐   │
│ │       Update Password        │   │
│ └──────────────────────────────┘   │
└────────────────────────────────────┘
```

#### Behaviour

1. User fills in Current Password, New Password, Confirm New Password.
2. Client validates: new password ≥ 8 chars, confirmation matches.
3. Calls a server action that uses `supabase.auth.updateUser({ password: newPassword })`.
4. If `secure_password_change = true` in Supabase config, Supabase will require reauthentication. The server action should call `supabase.auth.reauthenticate()` first if needed, or rely on Supabase's built-in nonce confirmation.
5. On success: show `<Alert variant="success">Password updated successfully</Alert>`.
6. On failure: show error (e.g., "Current password is incorrect").

---

### 3.4 Forgot Password Page (`/login/forgot-password`)

**New page.**

#### Layout

```
┌──────────────────────────────────┐
│         ⚽ (logo, 80×80)         │
│                                  │
│      Reset Your Password         │
│  Enter your email and we'll      │
│  send you a reset link           │
│                                  │
│  ┌────────────────────────────┐  │
│  │ Email address              │  │
│  │ ┌──────────────────────┐   │  │
│  │ │ you@example.com      │   │  │
│  │ └──────────────────────┘   │  │
│  │                            │  │
│  │ ┌──────────────────────┐   │  │
│  │ │   Send Reset Link    │   │  │
│  │ └──────────────────────┘   │  │
│  │                            │  │
│  │   ← Back to login         │  │
│  └────────────────────────────┘  │
│                                  │
│  ┌────────────────────────────┐  │
│  │ ✅ If an account with     │  │
│  │ that email exists, we've   │  │
│  │ sent a reset link.         │  │
│  │ Check your inbox.          │  │
│  └────────────────────────────┘  │
└──────────────────────────────────┘
```

#### Behaviour

1. User enters email, clicks "Send Reset Link".
2. Calls `supabase.auth.resetPasswordForEmail(email, { redirectTo: origin + '/auth/callback' })`.
3. **Always** shows the success message regardless of whether the email exists (prevents enumeration).
4. If the user exists, they receive a recovery email with a link.
5. Clicking the link → `/auth/callback` exchanges token → redirect to `/auth/set-password`.

---

### 3.5 Admin User Management Page Redesign (`/admin/users`)

**Current state:** "Add to Allowlist" form (email only) + list of allowlisted emails  
**New state:** "Create User" form (email only, but creates auth account + allowlist entry) + user list with status and actions

#### Layout

```
┌────────────────────────────────────┐
│ User Management                    │
├────────────────────────────────────┤
│ Create New User                    │
├────────────────────────────────────┤
│ ┌──────────────────────────────┐   │
│ │ user@example.com             │   │
│ └──────────────────────────────┘   │
│ ┌────────┐                         │
│ │Create  │                         │
│ └────────┘                         │
└────────────────────────────────────┘

┌────────────────────────────────────┐
│ Users                         [30] │
├────────────────────────────────────┤
│ john@example.com                   │
│ Status: Active · Joined 15/01/26   │
│                    [Reset PW] [🗑] │
├────────────────────────────────────┤
│ jane@example.com                   │
│ Status: Invited · Created 28/02/26 │
│              [Resend Invite] [🗑]  │
├────────────────────────────────────┤
│ bob@example.com                    │
│ Status: Active · Joined 20/01/26   │
│                    [Reset PW] [🗑] │
└────────────────────────────────────┘
```

#### User Status Definitions

| Status | Condition | Badge Color |
|---|---|---|
| **Invited** | User created but has not set password / never signed in | `<Badge>` yellow/amber |
| **Active** | User has set password and signed in at least once | `<Badge>` green |

#### New Actions per User

| Action | Condition | Behavior |
|---|---|---|
| **Resend Invite** | Status = Invited | Calls `supabase.auth.admin.inviteUserByEmail(email)` again. Shows confirmation. Audit logged |
| **Reset Password** | Status = Active | Calls `supabase.auth.admin.generateLink({ type: 'recovery', email })` or `resetPasswordForEmail`. Sends reset email. Audit logged |
| **Remove** | Any | Shows confirmation dialog → Removes from allowlist + deletes from `auth.users` (via `supabase.auth.admin.deleteUser(id)`). Audit logged |

#### Changes from Current

- Rename "Add to Allowlist" → "Create New User"
- The action behind the form changes from `addToAllowlist` (insert into allowlist only) to `createUser` (invite via Supabase Admin API + insert into allowlist)
- Add status column determined by checking `auth.users` via admin API
- Add "Resend Invite" and "Reset Password" action buttons
- "Remove" now also deletes the `auth.users` entry

---

### 3.6 Error States Summary

| Page | Error | Display |
|---|---|---|
| `/login` | Invalid credentials | `<Alert variant="error">` "Invalid email or password" |
| `/login` | Rate limited | `<Alert variant="error">` "Too many login attempts. Please try again in a few minutes." |
| `/login` | Network failure | `<Alert variant="error">` "Something went wrong. Please check your connection and try again." |
| `/login?error=not_allowed` | Allowlist rejection | `<Alert variant="error">` "Your email is not on the invite list. Contact the league admin." |
| `/login?error=expired` | Expired link | `<Alert variant="error">` "This link has expired. Please request a new one." |
| `/auth/set-password` | No session | Redirect to `/login?error=expired` |
| `/auth/set-password` | Password too short | Inline error: "Password must be at least 8 characters" |
| `/auth/set-password` | Passwords don't match | Inline error: "Passwords do not match" |
| `/settings` (change pw) | Wrong current password | `<Alert variant="error">` "Current password is incorrect" |
| `/settings` (change pw) | New password too short | Inline error: "New password must be at least 8 characters" |
| `/admin/users` | Duplicate user | `<Alert variant="error">` "This user already exists." |
| `/admin/users` | Invite failed | `<Alert variant="error">` "Failed to create user. Please try again." |
| `/login/forgot-password` | Any | Always shows: "If an account with that email exists, we've sent a reset link." |

---

## 4. Edge Cases & Error Handling

### EC-01: Expired Invite Link

**Scenario:** User clicks an invite link after the token has expired (default: 24 hours).

**Behavior:**
1. `/auth/callback` attempts `exchangeCodeForSession(code)`.
2. Supabase returns an error (invalid/expired token).
3. User is redirected to `/login?error=expired`.
4. Login page shows: "This link has expired. Please request a new one."

**Resolution:** Admin can click "Resend Invite" on the admin panel, or the user can use "Forgot password?" to trigger a recovery email (since their account exists, just has no password set yet).

---

### EC-02: Admin Creates User That Already Exists

**Scenario:** Admin enters an email address that is already registered in `auth.users`.

**Behavior:**
1. Server action calls `supabase.auth.admin.listUsers()` or checks by email before creating.
2. If user exists in `auth.users` → return error: "This user already exists."
3. If user exists only in `allowlist` but not `auth.users` → create the auth account and proceed.
4. If user exists in `auth.users` but not in `allowlist` → add to allowlist and show: "User account exists. Added to allowlist."

---

### EC-03: User Forgets Password

**Scenario:** User cannot remember their password.

**Two paths:**
1. **Self-service:** User clicks "Forgot password?" on login → enters email → receives recovery email → sets new password.
2. **Admin-assisted:** Admin clicks "Reset Password" next to the user on `/admin/users` → user receives recovery email.

---

### EC-04: Rate Limiting

**Scenario:** Excessive failed login attempts from one IP.

**Supabase Config (from `config.toml`):**
- `sign_in_sign_ups = 30` per 5 minutes per IP
- `email_sent = 2` per hour (for password reset emails)

**Behavior:**
- After 30 failed attempts in 5 min: HTTP 429 response. UI shows rate-limit message.
- Password reset emails: max 2 per hour per email. If exceeded, Supabase silently drops the email (UI still shows generic success to prevent enumeration).

**Production recommendation:** Consider lowering `sign_in_sign_ups` to `10` per 5 minutes for better security, given only ~30 legitimate users.

---

### EC-05: Session Management

**Current behavior (preserved):**
- JWT expiry: 3600 seconds (1 hour).
- Refresh token rotation: enabled.
- Refresh token reuse interval: 10 seconds.
- Middleware calls `updateSession()` which refreshes tokens automatically.

**Changes:**
- Sessions created via `signInWithPassword` work the same as current sessions.
- No session changes needed for existing token refresh logic.
- When admin deletes a user from `auth.users`, their sessions are automatically invalidated by Supabase.

---

### EC-06: User Clicks Invite Link After Already Setting Password

**Scenario:** A user sets their password, then later clicks the invite link from their email again.

**Behavior:**
1. The invite token has already been consumed; it's a one-time use token.
2. `/auth/callback` fails to exchange the code → redirects to `/login?error=expired`.
3. User can sign in normally with their email + password.

---

### EC-07: Multiple Invite Resends

**Scenario:** Admin clicks "Resend Invite" multiple times for the same user.

**Behavior:**
- Each call to `inviteUserByEmail` generates a new token, invalidating the previous one.
- Only the latest invite link is valid.
- Rate limit: 2 emails per hour applies. If exceeded, the admin sees an error: "Email rate limit reached. Try again later."

---

### EC-08: User Tries to Access Set-Password Page Without Valid Session

**Scenario:** User navigates directly to `/auth/set-password` without a valid invite/recovery token.

**Behavior:**
1. Page checks for active session via `supabase.auth.getUser()`.
2. No session → redirect to `/login?error=expired`.
3. Has session → show the set-password form.

---

## 5. Migration Strategy

### 5.1 Handling Existing Users (Magic Link / Google OAuth)

**Current state:** ~30 users have accounts in `auth.users` created via magic link or Google OAuth. They have no passwords set.

**Migration approach: Admin-Triggered Password Reset**

| Step | Action | Details |
|---|---|---|
| 1 | Deploy new code | New login page (email+password), set-password page, updated admin panel. Keep the `/auth/callback` route (it handles both invite and recovery tokens) |
| 2 | Disable magic link & Google OAuth | Remove `signInWithOtp` and `signInWithOAuth` calls from code. Disable Google provider in Supabase Dashboard (`auth.external.google.enabled = false`) |
| 3 | Admin triggers bulk password reset | Admin panel: new "Send Password Reset to All" button, or individually per user. Calls `supabase.auth.admin.generateLink({ type: 'recovery', email })` for each user |
| 4 | Existing users receive reset email | Each user gets ONE email: "Reset your password for Grand Football" with a link |
| 5 | Users set passwords | Clicking the link → `/auth/callback` → `/auth/set-password` → set password → done |
| 6 | Normal login | Users now log in with email + password on all subsequent visits |

**Alternative (simpler):** Since there are only ~30 users, admin can re-invite each via `inviteUserByEmail`. This effectively sends a "set your password" email to each existing user.

### 5.2 Session Invalidation

**Decision:** Invalidate all existing sessions during migration.

**Rationale:** 
- Forces all users to set a password before continuing.
- Prevents edge case where a user with an active session (from magic link/Google) never sets a password.

**Implementation:**
- After deploying the new code, call `supabase.auth.admin.signOut(userId, 'global')` for each existing user via a one-time migration script.
- Alternatively: reduce JWT expiry temporarily to force re-auth, then revert.

**Recommended approach:** Run a one-time script:

```typescript
// scripts/migrate-to-password-auth.ts
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function migrate() {
  // 1. Get all users
  const { data: { users } } = await supabase.auth.admin.listUsers();
  
  // 2. Sign out all users (invalidate sessions)
  for (const user of users) {
    await supabase.auth.admin.signOut(user.id, 'global');
    console.log(`Signed out: ${user.email}`);
  }
  
  // 3. Send password setup emails to all users
  for (const user of users) {
    if (user.email) {
      const { error } = await supabase.auth.admin.generateLink({
        type: 'recovery',
        email: user.email,
        options: { redirectTo: `${SITE_URL}/auth/callback` },
      });
      if (error) console.error(`Failed for ${user.email}:`, error.message);
      else console.log(`Recovery email sent to: ${user.email}`);
      
      // Respect rate limits - small delay between sends
      await new Promise(r => setTimeout(r, 2000));
    }
  }
}
```

### 5.3 Data Migration Plan

| Asset | Migration Needed? | Details |
|---|---|---|
| `auth.users` | No schema change | Existing rows remain. Password field gets populated when users set passwords |
| `profiles` | No change | `profiles.id` references `auth.users.id`. Unaffected |
| `allowlist` | No change | Still used for access control. Existing entries remain valid |
| `predictions`, `scores`, etc. | No change | All data tied to `profiles.id`, not to auth method |
| Supabase config | Yes | Disable Google OAuth provider, update email templates, set `minimum_password_length = 8` |
| `.env.local` | Possibly | Remove Google OAuth env vars if present. No new env vars needed (service role key already exists) |

### 5.4 Deployment Order

1. **Create** `/auth/set-password` page.
2. **Update** `/auth/callback/route.ts` to handle `type=invite` and `type=recovery` → redirect to `/auth/set-password`.
3. **Update** `/login/page.tsx` — replace magic link + Google with email + password.
4. **Create** `/login/forgot-password/page.tsx`.
5. **Update** `/settings/page.tsx` — add Change Password card.
6. **Update** `/admin/users/page.tsx` — new Create User form + user statuses + actions.
7. **Update** admin `actions.ts` — new `createUser`, `resendInvite`, `resetUserPassword` server actions.
8. **Update** `middleware.ts` — add `/auth/set-password` to `PUBLIC_PATHS` (user has a session but needs to set password).
9. **Update** `supabase/config.toml` — set `minimum_password_length = 8`, enable `secure_password_change = true`.
10. **Deploy** to Vercel.
11. **Run** migration script to sign out all users and send recovery emails.
12. **Disable** Google OAuth in Supabase Dashboard.

---

## 6. Accessibility Requirements

### 6.1 Form Field Labels & ARIA

| Requirement | Implementation |
|---|---|
| Every input has a visible `<label>` | The existing `<Input>` component accepts a `label` prop that renders a `<label>` element. All new fields must use this |
| Password visibility toggle | Button must have `aria-label="Show password"` / `aria-label="Hide password"` toggling with state. Use `aria-pressed` for toggle state |
| Required fields | Add `aria-required="true"` (the existing `required` HTML attribute handles this natively) |
| Error association | Error messages must be linked to their field via `aria-describedby`. The `<Input>` component should accept an `error` prop that renders an `<span id="field-error">` and sets `aria-describedby` on the input |
| Form-level errors | `<Alert>` component should use `role="alert"` to announce errors to screen readers (verify existing implementation) |
| Success messages | `<Alert variant="success">` should use `role="status"` for polite announcements |

### 6.2 Specific ARIA Attributes by Page

#### Login Page (`/login`)

```html
<form aria-label="Sign in to Grand Football">
  <input type="email" id="email" aria-label="Email address" aria-required="true" autocomplete="email" />
  <input type="password" id="password" aria-label="Password" aria-required="true" autocomplete="current-password" />
  <button type="button" aria-label="Show password" aria-pressed="false">👁</button>
  <button type="submit">Sign In</button>
  <a href="/login/forgot-password">Forgot password?</a>
</form>
```

#### Set Password Page (`/auth/set-password`)

```html
<form aria-label="Set your password">
  <input type="password" id="new-password" aria-label="New password" aria-required="true" 
         aria-describedby="password-hint" autocomplete="new-password" />
  <span id="password-hint">Minimum 8 characters</span>
  <input type="password" id="confirm-password" aria-label="Confirm password" 
         aria-required="true" autocomplete="new-password" />
  <button type="submit">Set Password</button>
</form>
```

#### Forgot Password Page (`/login/forgot-password`)

```html
<form aria-label="Reset your password">
  <input type="email" id="email" aria-label="Email address" aria-required="true" autocomplete="email" />
  <button type="submit">Send Reset Link</button>
</form>
<div role="status" aria-live="polite">
  <!-- Success message appears here -->
</div>
```

### 6.3 Keyboard Navigation

| Requirement | Implementation |
|---|---|
| Tab order | All form fields follow natural DOM order: email → password → show/hide toggle → submit button → forgot password link |
| Enter to submit | Forms submit on Enter (native `<form>` + `<button type="submit">` behavior) |
| Escape key | If a modal is used for password change, Escape closes it and returns focus to the trigger button |
| Focus management | On page load, auto-focus the first empty input field (`autoFocus` on email field) |
| Focus on error | When a form submission fails, move focus to the first error message or the first invalid field |
| Skip links | Not needed for these simple single-purpose pages (no complex navigation to skip) |
| Visible focus | Existing Tailwind `focus-visible:ring` styles must be applied to the password toggle button and all interactive elements |

### 6.4 Color & Contrast

| Element | Foreground | Background | Contrast Ratio |
|---|---|---|---|
| Error text (`text-error`) | #EF4444 (red-500) | Dark surface | Must meet WCAG AA (4.5:1). Verify against `bg-surface-glass` |
| Success text | Green accent | Dark surface | Must meet WCAG AA (4.5:1) |
| Input labels (`text-text-secondary`) | — | — | Verify ≥ 4.5:1 against `bg-surface-glass` |
| Placeholder text | — | — | Placeholder alone is NOT sufficient for field identification (labels required) |

### 6.5 Screen Reader Announcements

| Event | Announcement Method |
|---|---|
| Login error | `role="alert"` → immediate announcement |
| Login success (redirect) | No announcement needed (page navigation) |
| Password set success | `role="status"` → polite announcement before redirect |
| Password change success | `role="status"` → "Password updated successfully" |
| Rate limit error | `role="alert"` → immediate announcement |
| Forgot password email sent | `role="status"` → polite announcement |

---

## 7. Technical Reference

### 7.1 Files to Create

| File | Purpose |
|---|---|
| `src/app/auth/set-password/page.tsx` | Set/reset password form (used after invite link and recovery link) |
| `src/app/login/forgot-password/page.tsx` | Forgot password email form |
| `scripts/migrate-to-password-auth.mjs` | One-time migration script: signs out all users, sends recovery emails |

### 7.2 Files to Modify

| File | Changes |
|---|---|
| `src/app/login/page.tsx` | Replace magic link + Google OAuth with email + password form |
| `src/app/login/actions.ts` | Replace `checkAllowlist` with `signInWithPassword` server action (or remove if using client-side auth) |
| `src/app/auth/callback/route.ts` | Handle `type=invite` and `type=recovery` → redirect to `/auth/set-password` instead of `/` |
| `src/middleware.ts` | Add `/auth/set-password` to `PUBLIC_PATHS` |
| `src/app/(authenticated)/settings/page.tsx` | Add "Change Password" card section |
| `src/app/(authenticated)/settings/actions.ts` | Add `changePassword` server action |
| `src/app/(authenticated)/admin/users/page.tsx` | Redesign: Create User form, user status, Reset Password / Resend Invite actions |
| `src/app/(authenticated)/admin/actions.ts` | Add `createUser`, `resendInvite`, `resetUserPassword` server actions |
| `src/lib/constants.ts` | Add `ADMIN_ACTIONS.CREATE_USER`, `ADMIN_ACTIONS.RESEND_INVITE`, `ADMIN_ACTIONS.RESET_USER_PASSWORD` |
| `src/lib/validations.ts` | Add `passwordSchema` (min 8 chars) |
| `supabase/config.toml` | Set `minimum_password_length = 8`, `secure_password_change = true`, disable external providers |

### 7.3 Supabase Dashboard Settings (Production)

| Setting | Value |
|---|---|
| Auth → Providers → Email | Enabled, `enable_confirmations = false` (admin pre-confirms), `minimum_password_length = 8` |
| Auth → Providers → Google | **Disabled** |
| Auth → Email Templates → Invite | Customize subject: "You've been invited to Grand Football", body with branded template and "Set Your Password" CTA |
| Auth → Email Templates → Recovery | Customize subject: "Reset your Grand Football password", body with branded template and "Reset Password" CTA |
| Auth → Rate Limits | `sign_in_sign_ups = 10` (recommended reduction from 30) |
| Auth → URL Configuration | `site_url` = production URL, redirect URLs include `/auth/callback` |

### 7.4 Validation Schema Addition

```typescript
// src/lib/validations.ts (addition)
export const passwordSchema = z.object({
  password: z.string().min(8, 'Password must be at least 8 characters'),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(8, 'New password must be at least 8 characters'),
  confirmNewPassword: z.string(),
}).refine((data) => data.newPassword === data.confirmNewPassword, {
  message: 'Passwords do not match',
  path: ['confirmNewPassword'],
});
```

### 7.5 New Admin Actions

```typescript
// Pseudocode for new server actions in src/app/(authenticated)/admin/actions.ts

export async function createUser(formData: FormData) {
  const adminId = await requireAdmin();
  const email = formData.get('email');
  // 1. Validate email
  // 2. Check if user already exists in auth.users
  // 3. Call supabase.auth.admin.inviteUserByEmail(email)
  //    → Creates auth.users entry + sends invite email
  // 4. Add to allowlist
  // 5. Audit log: CREATE_USER
}

export async function resendInvite(formData: FormData) {
  const adminId = await requireAdmin();
  const email = formData.get('email');
  // 1. Call supabase.auth.admin.inviteUserByEmail(email)
  // 2. Audit log: RESEND_INVITE
}

export async function resetUserPassword(formData: FormData) {
  const adminId = await requireAdmin();
  const email = formData.get('email');
  // 1. Call supabase.auth.admin.generateLink({ type: 'recovery', email })
  //    or use resetPasswordForEmail with admin context
  // 2. Audit log: RESET_USER_PASSWORD
}

export async function deleteUser(formData: FormData) {
  const adminId = await requireAdmin();
  const userId = formData.get('userId');
  const email = formData.get('email');
  // 1. Delete from auth.users: supabase.auth.admin.deleteUser(userId)
  //    → Cascades to profiles via FK
  // 2. Delete from allowlist
  // 3. Audit log: REMOVE_USER
}
```

---

## Appendix A: Decision Log

| Decision | Chosen Option | Rationale |
|---|---|---|
| Admin creates users via invite (not temp password) | `inviteUserByEmail` | Sends branded email with secure token. No plaintext passwords shared. One API call handles user creation + email |
| Keep allowlist table | Yes | Defense in depth. Even if someone obtains credentials, they must be on the allowlist. Also used in middleware for runtime checks |
| Disable Google OAuth | Yes, remove from code + disable in Supabase | Clean single auth method. Eliminates complexity of mixed auth states |
| Invalidate all sessions during migration | Yes | Forces all 30 users to set passwords. Prevents anyone from staying on the old auth indefinitely |
| Self-service forgot password | Yes | Reduces admin burden. Standard UX. Only sends email when explicitly requested by user |
| `minimum_password_length = 8` | 8 characters | Balances security and usability for a casual prediction league |
| Generic error messages on login | "Invalid email or password" | Prevents email enumeration attacks |
| `secure_password_change = true` | Enable | Requires re-auth before password change to prevent session hijacking from changing password |

---

## Appendix B: Test Scenarios

| # | Scenario | Expected Result |
|---|---|---|
| T-01 | Admin creates user with valid email | User appears in list with "Invited" status, invite email sent |
| T-02 | Admin creates user with existing email | Error: "This user already exists" |
| T-03 | User clicks valid invite link | Redirected to set-password page |
| T-04 | User clicks expired invite link | Redirected to login with "expired" error |
| T-05 | User sets password (valid, ≥8 chars) | Redirected to dashboard, can log in next time |
| T-06 | User sets password (too short) | Error: "Password must be at least 8 characters" |
| T-07 | User sets password (mismatch) | Error: "Passwords do not match" |
| T-08 | User logs in with correct credentials | Redirected to dashboard |
| T-09 | User logs in with wrong password | Error: "Invalid email or password" |
| T-10 | User logs in with non-allowlisted email | Error: "Invalid email or password" |
| T-11 | 31 rapid login attempts from same IP | 429 → "Too many login attempts" |
| T-12 | User changes password from settings | Success message, old password stops working |
| T-13 | User uses forgot password flow | Receives email, sets new password, can log in |
| T-14 | Admin resets user's password | User receives recovery email |
| T-15 | Admin resends invite to pending user | New invite email sent, old link invalidated |
| T-16 | Admin removes user | User deleted from auth.users + allowlist, sessions invalidated |
| T-17 | Navigate to /auth/set-password without session | Redirected to /login?error=expired |
| T-18 | Magic link URL attempted (old bookmark) | Returns error (endpoint removed or returns 404) |
| T-19 | Google OAuth URL attempted | Returns error (provider disabled) |
| T-20 | Screen reader navigates login form | All fields announced with labels, errors announced via role="alert" |
