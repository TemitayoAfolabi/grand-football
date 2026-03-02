# Grand Football — Non-Functional Requirements

> **Document Owner:** Strategy & Design Agent
> **Last Updated:** 2026-02-27
> **Status:** Final (MVP)

---

## 1. Performance

### 1.1 Page Load Times

| Metric | Target | Measurement |
|--------|--------|-------------|
| **First Contentful Paint (FCP)** | ≤ 1.5s | Lighthouse on 4G throttling |
| **Largest Contentful Paint (LCP)** | ≤ 2.5s | Lighthouse on 4G throttling |
| **Time to Interactive (TTI)** | ≤ 3.0s | Lighthouse on 4G throttling |
| **Cumulative Layout Shift (CLS)** | ≤ 0.1 | Lighthouse |
| **First Input Delay (FID)** | ≤ 100ms | Chrome User Experience Report |
| **Total Bundle Size (JS)** | ≤ 200KB gzipped | Build output |
| **Initial HTML payload** | ≤ 50KB | Network tab |

**Rationale:** With only 30 users, server load is negligible. These targets are primarily about mobile UX on potentially spotty connections (e.g., user on phone at a football pub).

### 1.2 API Response Times

| Endpoint Category | Target (p95) | Notes |
|-------------------|-------------|-------|
| **Authentication** | ≤ 500ms | Magic link send; Google OAuth redirect is external |
| **Read: Dashboard** | ≤ 300ms | Single query for rank + upcoming fixtures + bonus status |
| **Read: Fixture list** | ≤ 300ms | Fixtures for one gameweek (~10 fixtures) |
| **Read: Leaderboard** | ≤ 500ms | Aggregation query across all users + all fixtures |
| **Read: Match detail** | ≤ 200ms | Single fixture + single score_record |
| **Write: Save prediction** | ≤ 300ms | Single upsert |
| **Write: Admin actions** | ≤ 1,000ms | Override, recalculate (acceptable to be slower) |
| **Background: Fixture sync** | ≤ 30s | Cron job (fetches ~380 fixtures/season) |
| **Background: Score calculation (per fixture)** | ≤ 5s | Processes ~30 score_records |
| **Background: Monthly bonus** | ≤ 10s | Evaluates ~30 users |

### 1.3 Client-Side Performance

| Metric | Target |
|--------|--------|
| **JavaScript execution time** | ≤ 500ms on page load (mobile) |
| **Memory usage** | ≤ 50MB (no memory leaks over 30-minute session) |
| **Image assets** | All images ≤ 50KB each; use WebP with PNG fallback; lazy load below-the-fold |
| **Font loading** | Inter loaded via `font-display: swap`; FOUT acceptable over FOIT |

---

## 2. Availability & Reliability

### 2.1 Uptime Targets

| Component | Target | Rationale |
|-----------|--------|-----------|
| **Web app (Vercel)** | 99.5% monthly (~3.6h downtime/month) | Vercel's SLA is 99.99%; our target accounts for deployment windows and edge cases |
| **Database (Supabase)** | 99.5% monthly | Supabase free tier; no SLA guarantee, but historically reliable |
| **Fixture sync cron** | 95% success rate | Dependent on external API; retries handle transient failures |

### 2.2 Acceptable Downtime Windows

| Scenario | Acceptable? | Mitigation |
|----------|-------------|------------|
| Planned maintenance (deploy) | ≤ 30s per deploy | Vercel zero-downtime deploys |
| Supabase outage | ≤ 1 hour | App shows cached data (stale but visible via SSR cache) |
| External API outage | ≤ 24 hours | Existing data persists; scoring delayed, not lost |
| Total outage on match day | **Not acceptable** for > 15 minutes before kickoff | Monitor and prioritize rapid resolution |

### 2.3 Data Durability

| Data | Backup Strategy | Recovery |
|------|----------------|----------|
| **User accounts** | Supabase managed (Postgres WAL) | Automatic |
| **Predictions** | Supabase daily backup (free tier) | Restore from backup |
| **Scores** | Supabase daily backup + deterministic re-calculation | Recalculate from fixture results + predictions |
| **Fixtures** | Re-sync from external API | Cron job re-fetches |

---

## 3. Data Freshness

| Data Type | Freshness Target | Mechanism |
|-----------|-----------------|-----------|
| **Fixture schedule** | ≤ 6 hours stale | Cron job every 6 hours |
| **Match results (final score)** | ≤ 6 hours after match ends | Cron job picks up FINISHED status |
| **Score calculation** | ≤ 10 minutes after result sync | Scoring engine triggered by sync or webhook |
| **Leaderboard** | ≤ 5 minutes after scoring | Computed from score_records (may use materialized view or on-demand query) |
| **Monthly bonus** | Calculated on 1st of month | Cron job at 00:00 UTC on the 1st |
| **Star Game designation** | Immediate (real-time) | Admin toggle saved instantly |
| **Predictions lock status** | Real-time (client-side) | Computed from `kickoff_time` vs `Date.now()` |

### Future Improvement (Phase 2)
- Increase fixture sync to every **1 hour** on match days for faster result detection.
- Use Supabase Realtime subscriptions for instant leaderboard updates after scoring.

---

## 4. Security

### 4.1 Authentication & Authorization

| Requirement | Implementation |
|-------------|---------------|
| **Auth provider** | Supabase Auth (magic link + Google OAuth) |
| **Session tokens** | Supabase JWT; stored in `httpOnly` cookie (not localStorage) |
| **Session duration** | 30 days rolling |
| **Allowlist enforcement** | Supabase RLS policy: `auth.email() IN (SELECT email FROM allowlist)` |
| **Admin authorization** | Database role column: `is_admin = true`; checked in RLS policies for admin-only operations |
| **CSRF protection** | SameSite cookie attribute + Supabase PKCE flow |
| **Rate limiting** | Supabase default rate limits + Vercel Edge rate limiting (10 requests/second per IP) |

### 4.2 Data Protection

| Requirement | Implementation |
|-------------|---------------|
| **Encryption in transit** | HTTPS everywhere (Vercel enforces TLS) |
| **Encryption at rest** | Supabase encrypts Postgres at rest by default |
| **PII stored** | Email address, display name only. No passwords (magic link/OAuth). |
| **Data access** | Row-Level Security: users can only read/write their own predictions; all users can read leaderboard/fixtures |
| **Admin data access** | Admin can read all predictions and scores (needed for management) |
| **Prediction privacy** | A user's prediction is private until the match kicks off. After kickoff, predictions are visible (to prevent copying). MVP: predictions are only visible to the user themselves and the admin. Phase 2: show all predictions after kickoff. |

### 4.3 Input Validation

| Input | Validation |
|-------|-----------|
| **Email** | Valid email format; on allowlist |
| **Display name** | 3–20 characters; alphanumeric + spaces; trimmed; XSS-sanitized |
| **Prediction scores** | Integer, 0–99, non-null for both home and away |
| **Fixture override** | Integer, 0–99; admin-only; audit logged |

---

## 5. Scalability

### 5.1 Current Scale

| Metric | Current |
|--------|---------|
| **Users** | ~30 (fixed, invite-only) |
| **Fixtures per season** | ~380 (38 gameweeks × 10 matches) |
| **Predictions per season** | ~11,400 (380 × 30) |
| **Score records per season** | ~11,400 |
| **Monthly bonus records per season** | ~300 (30 users × 10 months) |
| **Total DB rows per season** | ~24,000 |

### 5.2 Growth Projections

The app is designed for a **fixed 30-user league**. Scalability beyond this is not a concern for MVP. However, the architecture (Postgres + Next.js) naturally supports:

| Scenario | Supported Without Changes? |
|----------|---------------------------|
| 100 users | ✅ Yes |
| 500 users | ✅ Yes (may need Supabase paid tier) |
| Multiple leagues | ❌ Requires multi-tenancy schema changes (Phase 2+) |
| Historical seasons (5+ years) | ✅ Yes (~120,000 rows total — trivial for Postgres) |

### 5.3 Database Sizing

| Asset | Estimated Size |
|-------|---------------|
| **Fixtures table** | ~400 rows × ~500 bytes = ~200 KB/season |
| **Predictions table** | ~12,000 rows × ~200 bytes = ~2.4 MB/season |
| **Score records table** | ~12,000 rows × ~300 bytes = ~3.6 MB/season |
| **Users table** | ~30 rows × ~500 bytes = ~15 KB |
| **Total per season** | ~6.2 MB |
| **Supabase free tier limit** | 500 MB |
| **Seasons before limit** | ~80 seasons (not a concern) |

---

## 6. Maintainability

### 6.1 Code Quality

| Requirement | Target |
|-------------|--------|
| **TypeScript** | Strict mode (`strict: true`) across the entire codebase |
| **Linting** | ESLint with Next.js recommended + accessibility plugin (`eslint-plugin-jsx-a11y`) |
| **Formatting** | Prettier with consistent config |
| **Testing** | Unit tests for scoring engine (100% branch coverage); integration tests for API routes; E2E tests for critical flows (sign in, predict, view leaderboard) |
| **Scoring engine coverage** | 100% branch coverage mandatory — every `reason_code` path tested |

### 6.2 Documentation

| Artifact | Location |
|----------|----------|
| Decisions | `docs/strategy/decisions.md` |
| User stories | `docs/strategy/user-stories.md` |
| UI/UX spec | `docs/strategy/ui-ux-spec.md` |
| Accessibility | `docs/strategy/accessibility.md` |
| Edge cases | `docs/strategy/edge-cases.md` |
| NFRs | `docs/strategy/nfr.md` (this file) |
| API documentation | Auto-generated from types / OpenAPI (Phase 2) |
| Database schema | `docs/technical/schema.md` (to be created during development) |
| Deployment guide | `docs/technical/deployment.md` (to be created during development) |

### 6.3 Deployment

| Requirement | Target |
|-------------|--------|
| **Deployment method** | Git push to `main` branch → Vercel auto-deploys |
| **Preview deployments** | Vercel preview for every PR |
| **Rollback** | Instant rollback via Vercel dashboard (previous deployment) |
| **Environment variables** | Managed via Vercel dashboard; no secrets in code |
| **Database migrations** | Managed via Supabase migrations CLI (`supabase db push`) |

---

## 7. Hosting Cost

### 7.1 Estimated Monthly Cost (MVP)

| Service | Tier | Monthly Cost |
|---------|------|-------------|
| **Vercel** | Hobby (free) | $0 |
| **Supabase** | Free tier | $0 |
| **football-data.org API** | Free tier (10 requests/minute) | $0 |
| **Domain** (optional) | `.com` domain | ~$12/year ($1/month) |
| **Total** | | **$0 – $1/month** |

### 7.2 When to Upgrade

| Trigger | Action | Cost |
|---------|--------|------|
| Vercel free tier bandwidth exceeded (100 GB) | Upgrade to Pro | $20/month |
| Supabase free tier DB size exceeded (500 MB) | Upgrade to Pro | $25/month |
| API rate limit issues | Upgrade football-data.org plan | $10/month |
| **Projected upgrade timeline** | **Not expected within 3+ years** | — |

---

## 8. Monitoring & Observability

### 8.1 Monitoring Stack (MVP)

| Aspect | Tool | Cost |
|--------|------|------|
| **Application errors** | Vercel built-in error logging | Free |
| **API performance** | Vercel Analytics (Web Vitals) | Free |
| **Database** | Supabase Dashboard (query performance, connections) | Free |
| **Cron job status** | Vercel Cron logs | Free |
| **Uptime monitoring** | BetterUptime or UptimeRobot (free tier) | Free |

### 8.2 Alerting

| Alert | Trigger | Channel |
|-------|---------|---------|
| **App down** | 3 consecutive failed health checks (5-minute interval) | Email to admin |
| **Cron sync failed** | 3 consecutive sync failures | Logged; admin checks logs |
| **Scoring anomaly** | Score_record with unexpected reason_code | Log warning |

### 8.3 Logging Requirements

| Event | Log Level | Retention |
|-------|-----------|-----------|
| Fixture sync success | INFO | 30 days |
| Fixture sync failure | ERROR | 90 days |
| Scoring engine run | INFO | 30 days |
| Admin override | WARN | Permanent |
| Auth failure (not on allowlist) | WARN | 30 days |
| Prediction saved/locked | DEBUG | 7 days |

---

## 9. Compliance & Privacy

| Requirement | Detail |
|-------------|--------|
| **GDPR** | Minimal PII (email + display name). Privacy policy page required. |
| **Data deletion** | Admin can remove a user from the allowlist. Full data deletion available on request (remove predictions, scores, user record). |
| **Cookie consent** | Only essential cookies (auth session). No analytics cookies in MVP → no consent banner needed. |
| **Terms of service** | Simple terms: private league, data stored securely, admin has management rights. |

---

## NFR Summary

| Category | Key Target |
|----------|-----------|
| **Performance** | LCP ≤ 2.5s, API p95 ≤ 500ms |
| **Availability** | 99.5% monthly uptime |
| **Data Freshness** | Results within 6 hours, scoring within 10 minutes |
| **Security** | RLS, HTTPS, httpOnly cookies, allowlist-only access |
| **Cost** | $0–$1/month for MVP |
| **Maintainability** | TypeScript strict, 100% scoring engine test coverage |
| **Scalability** | Handles 30 users trivially; architecture supports 500+ without redesign |
