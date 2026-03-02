# Grand Football — Security Architecture

> **Document Owner:** Architecture & Security Agent
> **Last Updated:** 2026-02-27
> **Status:** Final (MVP)

---

## 1. Authentication Flow

### 1.1 Overview

Grand Football uses **Supabase Auth** with two sign-in methods:
1. **Magic Link** (email OTP) — passwordless, primary method
2. **Google OAuth** — one-tap convenience

Both methods are gated by an **email allowlist** — only pre-approved emails can complete authentication.

### 1.2 Magic Link Flow

```
User                    Next.js              Supabase Auth          Email Provider
 │                        │                       │                      │
 │ 1. Enter email         │                       │                      │
 │ ──────────────────────▶│                       │                      │
 │                        │ 2. Check allowlist    │                      │
 │                        │ ──────────────────────▶│                      │
 │                        │                       │                      │
 │                        │ 3. If not allowed:    │                      │
 │ ◀── "Invite only" ────│    return error       │                      │
 │                        │                       │                      │
 │                        │ 4. If allowed:        │                      │
 │                        │    signInWithOtp()    │                      │
 │                        │ ──────────────────────▶│                      │
 │                        │                       │ 5. Send magic link   │
 │                        │                       │ ────────────────────▶│
 │                        │                       │                      │
 │ ◀── "Check email" ────│                       │                      │
 │                        │                       │                      │
 │ 6. Click link in email │                       │                      │
 │ ──────────────────────▶│                       │                      │
 │                        │ 7. exchangeCodeForSession()                  │
 │                        │ ──────────────────────▶│                      │
 │                        │                       │                      │
 │                        │ 8. JWT + Refresh Token │                      │
 │                        │ ◀──────────────────────│                      │
 │                        │                       │                      │
 │                        │ 9. Set httpOnly cookies│                      │
 │ ◀── Redirect / ───────│                       │                      │
```

**Key security points:**
- Magic links expire after **10 minutes**
- Only the most recent magic link is valid (previous links auto-invalidated)
- Links are single-use
- Allowlist check happens **before** Supabase sends the email (prevents auth.users spam)

### 1.3 Google OAuth Flow (PKCE)

```
User                    Next.js              Supabase Auth          Google
 │                        │                       │                   │
 │ 1. Click "Sign in      │                       │                   │
 │    with Google"        │                       │                   │
 │ ──────────────────────▶│                       │                   │
 │                        │ 2. signInWithOAuth()  │                   │
 │                        │    (PKCE flow)        │                   │
 │                        │ ──────────────────────▶│                   │
 │                        │                       │                   │
 │ ◀── Redirect to Google OAuth consent ──────────────────────────── │
 │                        │                       │                   │
 │ 3. Grant consent       │                       │                   │
 │ ──────────────────────────────────────────────────────────────── ▶│
 │                        │                       │                   │
 │ 4. Callback to         │                       │                   │
 │    /auth/callback      │                       │                   │
 │ ──────────────────────▶│                       │                   │
 │                        │ 5. Exchange code +    │                   │
 │                        │    verify PKCE        │                   │
 │                        │ ──────────────────────▶│                   │
 │                        │                       │                   │
 │                        │ 6. Check allowlist    │                   │
 │                        │    (post-auth hook or │                   │
 │                        │     middleware check)  │                   │
 │                        │                       │                   │
 │                        │ 7. If not allowed:    │                   │
 │                        │    sign out + error   │                   │
 │ ◀── "Invite only" ────│                       │                   │
 │                        │                       │                   │
 │                        │ 8. If allowed:        │                   │
 │                        │    set cookies        │                   │
 │ ◀── Redirect / ───────│                       │                   │
```

**Key security points:**
- Uses **PKCE** (Proof Key for Code Exchange) — no client secret exposed
- Allowlist check in the `/auth/callback` route handler — user is signed out if not on the list
- Account linking: if a user signed in via magic link first, Google OAuth with the same email links to the same account (Supabase handles this via email matching)

### 1.4 Session Management

| Aspect | Configuration |
|--------|---------------|
| **Token type** | Supabase JWT (access token) + opaque refresh token |
| **Storage** | `httpOnly`, `Secure`, `SameSite=Lax` cookies |
| **Access token lifetime** | 1 hour (auto-refreshed via middleware) |
| **Refresh token lifetime** | 30 days (rolling) |
| **Session persistence** | Survives browser restart (cookie-based) |
| **Sign-out** | Clears cookies + revokes refresh token on Supabase |

### 1.5 Middleware Auth Check

```
middleware.ts
├── Skip: /login, /auth/callback, /api/cron/*
├── Read session from cookie
├── If no session → redirect to /login
├── If session expired → attempt refresh
│   ├── If refresh succeeds → update cookie, continue
│   └── If refresh fails → redirect to /login
├── If route starts with /admin/*
│   └── Check profiles.is_admin = true → if false, redirect to /
└── Continue to route
```

---

## 2. Authorization Model

### 2.1 Roles

| Role | Determination | Count | Capabilities |
|------|---------------|-------|-------------|
| **Anonymous** | No session | N/A | View `/login` only |
| **User** | Valid session + email on allowlist | ~29 | View fixtures, submit predictions, view leaderboard, view own scores |
| **Admin** | Valid session + `profiles.is_admin = true` | 1 | All user capabilities + manage allowlist, star games, overrides, recalculate, new season |

### 2.2 Row-Level Security (RLS) Matrix

| Table | Anonymous | User (own data) | User (others' data) | Admin | Service Role |
|-------|-----------|-----------------|---------------------|-------|--------------|
| `profiles` | — | SELECT, UPDATE | SELECT (display_name only) | SELECT, UPDATE | ALL |
| `allowlist` | — | — | — | SELECT, INSERT, DELETE | ALL |
| `seasons` | — | SELECT | SELECT | SELECT, INSERT, UPDATE | ALL |
| `fixtures` | — | SELECT | SELECT | SELECT | INSERT, UPDATE |
| `predictions` | — | SELECT, INSERT, UPDATE | — | SELECT | ALL |
| `score_records` | — | SELECT | — | SELECT | INSERT, UPDATE |
| `monthly_bonuses` | — | SELECT (own) | SELECT (all, for leaderboard) | SELECT | INSERT, UPDATE |
| `prediction_history` | — | SELECT | — | SELECT | INSERT |
| `admin_audit_log` | — | — | — | SELECT, INSERT | ALL |

### 2.3 RLS Policy Details

**Admin check helper (used across policies):**

```sql
CREATE FUNCTION is_admin() RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND is_admin = true
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;
```

**Prediction lock check (prevents writes after kickoff):**

```sql
CREATE FUNCTION is_fixture_open(fixture_uuid uuid) RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.fixtures
    WHERE id = fixture_uuid AND kickoff_time > now()
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;
```

### 2.4 API-Level Authorization

Beyond RLS, each API route handler performs explicit checks:

```typescript
// Pattern for admin endpoints
export async function PATCH(request: Request) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return Response.json({ error: { code: 'UNAUTHORIZED' } }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single();

  if (!profile?.is_admin) return Response.json({ error: { code: 'FORBIDDEN' } }, { status: 403 });

  // ... proceed with admin action
}
```

---

## 3. Input Validation

### 3.1 Validation Rules by Endpoint

| Endpoint | Field | Rule | Sanitization |
|----------|-------|------|-------------|
| `POST /api/predictions` | `fixtureId` | UUID format, exists in DB | — |
| | `homeScore` | integer, 0 ≤ x ≤ 99 | `Math.floor()`, strip non-numeric |
| | `awayScore` | integer, 0 ≤ x ≤ 99 | `Math.floor()`, strip non-numeric |
| `PATCH /api/profile` | `displayName` | 3–20 chars, `/^[a-zA-Z0-9 ]+$/` | Trim whitespace, strip HTML |
| `POST /api/admin/allowlist` | `email` | Valid email format, ≤ 254 chars | Lowercase, trim |
| `PATCH /api/admin/fixtures/*/star` | `isStarGame` | boolean | Strict boolean check |
| `PATCH /api/admin/fixtures/*/override` | `homeScore` | integer, 0 ≤ x ≤ 99 | Same as predictions |
| | `awayScore` | integer, 0 ≤ x ≤ 99 | Same as predictions |
| `POST /api/admin/season` | `name` | Non-empty, ≤ 20 chars | Trim, strip HTML |

### 3.2 Validation Library

Use **Zod** for runtime type validation on all API inputs:

```typescript
import { z } from 'zod';

const predictionSchema = z.object({
  fixtureId: z.string().uuid(),
  homeScore: z.number().int().min(0).max(99),
  awayScore: z.number().int().min(0).max(99),
});

const profileSchema = z.object({
  displayName: z.string()
    .trim()
    .min(3, 'Display name must be at least 3 characters')
    .max(20, 'Display name must be at most 20 characters')
    .regex(/^[a-zA-Z0-9 ]+$/, 'Only letters, numbers, and spaces allowed'),
});

const allowlistSchema = z.object({
  email: z.string().email().max(254).transform(v => v.toLowerCase().trim()),
});
```

### 3.3 XSS Prevention

- All user input is validated and sanitized server-side before storage
- React's JSX auto-escapes rendered content (no `dangerouslySetInnerHTML` usage)
- Display names are alphanumeric + spaces only — no HTML or special characters stored
- Content Security Policy headers set via `next.config.js`

---

## 4. CSRF Protection

| Protection Layer | Mechanism |
|-----------------|-----------|
| **SameSite cookies** | `SameSite=Lax` on all auth cookies — prevents cross-origin POST |
| **Supabase PKCE** | OAuth flow uses PKCE code verifier — not vulnerable to CSRF |
| **Origin checking** | API routes verify `Origin` header matches allowed domains |
| **No state-changing GETs** | All mutations use POST/PATCH/DELETE — safe methods return data only |

Since the app uses `httpOnly` cookies with `SameSite=Lax`, and all mutations are POST/PATCH/DELETE, CSRF attacks are mitigated without a separate token. The `SameSite=Lax` attribute ensures cookies are not sent on cross-origin POST requests.

---

## 5. Rate Limiting

### 5.1 Strategy

Rate limiting is applied at two layers:

1. **Vercel Edge** — IP-based rate limiting via headers
2. **Application** — User-based rate limiting via Supabase or in-memory counter

### 5.2 Limits

| Endpoint Category | Limit | Window | Enforcement |
|-------------------|-------|--------|-------------|
| Magic link send | 3 req | per minute per email | Supabase Auth built-in |
| Google OAuth start | 5 req | per minute per IP | Vercel Edge |
| Prediction write | 20 req | per minute per user | Application middleware |
| Profile update | 5 req | per minute per user | Application middleware |
| Admin writes | 30 req | per minute per admin | Application middleware |
| All reads | 60 req | per minute per user | Vercel Edge |
| Cron endpoints | 1 req | per 5 min per secret | CRON_SECRET validation |

### 5.3 Implementation

For MVP (30 users), a simple in-memory rate limiter is sufficient:

```typescript
// lib/rate-limit.ts
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(key);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + windowMs });
    return true; // allowed
  }

  if (entry.count >= limit) return false; // blocked

  entry.count++;
  return true; // allowed
}
```

**Note:** This works on Vercel's serverless architecture because rate limiting is best-effort for MVP. For stricter enforcement, upgrade to Vercel KV or Upstash Redis in Phase 2.

---

## 6. Audit Logging

### 6.1 Logged Actions

| Action | When Logged | Data Captured |
|--------|-------------|---------------|
| `TOGGLE_STAR` | Admin toggles Star Game | `{ fixtureId, oldValue: false, newValue: true }` |
| `OVERRIDE_RESULT` | Admin overrides result | `{ fixtureId, oldScore: "2-1", newScore: "2-2" }` |
| `RECALCULATE` | Admin triggers recalculation | `{ fixtureId or "all", recordsUpdated: N }` |
| `ADD_USER` | Admin adds email to allowlist | `{ email: "user@example.com" }` |
| `REMOVE_USER` | Admin removes email | `{ email: "user@example.com" }` |
| `NEW_SEASON` | Admin starts new season | `{ oldSeason: "2025-2026", newSeason: "2026-2027" }` |

### 6.2 Prediction History (User Audit)

Every prediction edit is recorded in `prediction_history`:
- Previous home/away scores
- Timestamp of the change
- Linked to the user and fixture

This creates an immutable audit trail of all prediction modifications.

### 6.3 Log Retention

| Log Type | Retention |
|----------|-----------|
| Admin audit log | Permanent (never deleted) |
| Prediction history | Permanent (never deleted) |
| Application logs (Vercel) | 30 days (Vercel default) |
| Error logs (Vercel) | 90 days |

---

## 7. Data Privacy Controls

### 7.1 PII Inventory

| Data | Classification | Storage | Access |
|------|---------------|---------|--------|
| Email address | PII | `auth.users` + `allowlist` | User (own), Admin (all) |
| Display name | Semi-PII | `profiles` | All authenticated users |
| Avatar URL | Semi-PII | `profiles` | All authenticated users |
| Predictions | User data | `predictions` | User (own), Admin |
| Scores | User data | `score_records` | User (own), Admin |

### 7.2 Prediction Privacy

| Phase | Visibility |
|-------|-----------|
| **Before kickoff** | Only the owning user can see their prediction |
| **After kickoff (MVP)** | Only the owning user and admin can see it |
| **After kickoff (Phase 2)** | All users can see each other's predictions |

This is enforced via RLS — predictions table has `auth.uid() = user_id` policy.

### 7.3 Data Deletion

On admin request (user removal):
1. Remove email from `allowlist` → prevents future sign-in
2. Existing session continues until expiry (30 days max)
3. Full data deletion flow (if requested):
   - Delete `predictions`, `prediction_history`, `score_records`, `monthly_bonuses` for user
   - Delete `profiles` row
   - Delete `auth.users` entry via Supabase Admin API
   - Leaderboard recalculation triggered

### 7.4 Encryption

| Layer | Protection |
|-------|-----------|
| In transit | TLS 1.3+ (enforced by Vercel and Supabase) |
| At rest | AES-256 (Supabase Postgres default encryption) |
| Cookies | `httpOnly`, `Secure`, `SameSite=Lax` |
| Environment variables | Encrypted at rest in Vercel dashboard |

---

## 8. Security Headers

Configured in `next.config.js`:

```javascript
const securityHeaders = [
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'", // Next.js requires these
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https:",
      "font-src 'self' https://fonts.gstatic.com",
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
      "frame-ancestors 'none'",
    ].join('; '),
  },
];
```

---

## 9. Dependency Security

| Practice | Implementation |
|----------|---------------|
| **Dependency auditing** | `npm audit` in CI pipeline |
| **Lock file** | `package-lock.json` committed to git |
| **Automated updates** | Dependabot or Renovate for security patches |
| **Minimal dependencies** | Only well-maintained, widely-used packages |
| **No secrets in code** | All secrets via Vercel env vars; `.env.example` has descriptions only |

---

## 10. Threat Model Summary

| Threat | Risk (30 users) | Mitigation |
|--------|-----------------|------------|
| Unauthorized access | Medium | Allowlist + Supabase Auth + RLS |
| Prediction tampering | Medium | Server-side lock check (`kickoff_time > now()`) |
| Score manipulation | Low | Scoring engine runs server-side in Postgres function |
| CSRF | Low | SameSite cookies + mutation via POST only |
| XSS | Low | React auto-escaping + CSP headers + input validation |
| SQL injection | Very Low | Parameterized queries via Supabase JS client |
| DDoS | Very Low | Vercel Edge + rate limiting (30-user private app) |
| Data exfiltration | Low | RLS restricts data access per user |
| Admin account compromise | Medium | Single admin; use strong Google account with 2FA |
| Cron job hijacking | Low | CRON_SECRET verification |
