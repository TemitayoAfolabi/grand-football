# Grand Football — System Design

> **Document Owner:** Architecture & Security Agent
> **Last Updated:** 2026-02-27
> **Status:** Final (MVP)

---

## 1. High-Level System Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                         CLIENTS                                  │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐                │
│  │ Mobile PWA │  │  Tablet    │  │  Desktop   │                │
│  │ (primary)  │  │  Browser   │  │  Browser   │                │
│  └─────┬──────┘  └─────┬──────┘  └─────┬──────┘                │
│        └───────────────┬───────────────┘                        │
└────────────────────────┼────────────────────────────────────────┘
                         │ HTTPS
                         ▼
┌────────────────────────────────────────────────────────────────┐
│                    VERCEL EDGE NETWORK                          │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              Next.js 14 (App Router)                      │  │
│  │                                                           │  │
│  │  ┌─────────────┐ ┌─────────────┐ ┌───────────────────┐  │  │
│  │  │   Server    │ │  API Route  │ │  Middleware        │  │  │
│  │  │  Components │ │  Handlers   │ │  (Auth + RLS)      │  │  │
│  │  │  (SSR)      │ │  /api/*     │ │                    │  │  │
│  │  └─────────────┘ └──────┬──────┘ └───────────────────┘  │  │
│  └─────────────────────────┼────────────────────────────────┘  │
│                             │                                   │
│  ┌──────────────────────────┼───────────────────────────────┐  │
│  │       Vercel Cron Jobs   │                                │  │
│  │  ┌──────────┐ ┌─────────┴──┐ ┌──────────────┐           │  │
│  │  │ Fixture  │ │  Scoring   │ │ Monthly      │           │  │
│  │  │ Sync     │ │  Engine    │ │ Bonus        │           │  │
│  │  │ (6h)     │ │ (post-sync)│ │ (1st/month)  │           │  │
│  │  └────┬─────┘ └────┬──────┘ └──────┬───────┘           │  │
│  └───────┼─────────────┼───────────────┼────────────────────┘  │
└──────────┼─────────────┼───────────────┼────────────────────────┘
           │             │               │
           ▼             ▼               ▼
┌────────────────────────────────────────────────────────────────┐
│                      SUPABASE                                   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                  PostgreSQL Database                       │  │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────────┐  │  │
│  │  │ profiles │ │ fixtures │ │predictions│ │score_records│  │  │
│  │  ├──────────┤ ├──────────┤ ├──────────┤ ├────────────┤  │  │
│  │  │allowlist │ │ seasons  │ │monthly_  │ │prediction_ │  │  │
│  │  │          │ │          │ │bonuses   │ │history     │  │  │
│  │  │          │ │          │ │          │ │admin_audit│  │  │
│  │  └──────────┘ └──────────┘ └──────────┘ └────────────┘  │  │
│  │                                                           │  │
│  │  Row-Level Security (RLS) on ALL tables                   │  │
│  │  Scoring engine as PL/pgSQL function                      │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌──────────────────────┐  ┌────────────────────────────────┐  │
│  │  Supabase Auth       │  │  Supabase Realtime (Phase 2)   │  │
│  │  Magic Link + Google │  │  Live match subscriptions       │  │
│  └──────────────────────┘  └────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────┘
           │
           │ HTTPS (cron job)
           ▼
┌────────────────────────────┐
│  football-data.org API     │
│  (Premier League fixtures) │
│  Free tier: 10 req/min     │
└────────────────────────────┘
```

---

## 2. Component Breakdown

### 2.1 Next.js App Router — Pages & Routes

| Route | Type | Component | Auth Required | Description |
|-------|------|-----------|---------------|-------------|
| `/login` | Page | `LoginPage` | No | Sign-in (magic link + Google) |
| `/` | Page | `DashboardPage` | Yes | Home — rank, upcoming, bonus |
| `/fixtures` | Page | `FixturesPage` | Yes | Gameweek fixture list with predictions |
| `/predict/[fixtureId]` | Page | `PredictPage` | Yes | Standalone prediction form (optional) |
| `/leaderboard` | Page | `LeaderboardPage` | Yes | Season & monthly leaderboards |
| `/match/[fixtureId]` | Page | `MatchDetailPage` | Yes | Score breakdown, rule explanation |
| `/settings` | Page | `SettingsPage` | Yes | Profile, sign out |
| `/rules` | Page | `RulesPage` | Yes | Scoring rules (static) |
| `/admin` | Page | `AdminPage` | Yes (admin) | Admin dashboard |
| `/admin/users` | Page | `AdminUsersPage` | Yes (admin) | Allowlist management |
| `/admin/fixtures` | Page | `AdminFixturesPage` | Yes (admin) | Star Games, overrides |
| `/admin/scoring` | Page | `AdminScoringPage` | Yes (admin) | Recalculate, audit log |
| `/admin/season` | Page | `AdminSeasonPage` | Yes (admin) | Start new season |
| `/auth/callback` | Route Handler | — | No | OAuth callback handler |

### 2.2 API Route Handlers (`app/api/`)

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/predictions` | Submit or update a prediction |
| `GET` | `/api/predictions/[fixtureId]` | Get user's prediction for a fixture |
| `GET` | `/api/fixtures` | List fixtures (with query params) |
| `GET` | `/api/fixtures/[fixtureId]` | Get single fixture detail |
| `GET` | `/api/leaderboard/season` | Season leaderboard |
| `GET` | `/api/leaderboard/monthly` | Monthly leaderboard |
| `GET` | `/api/dashboard` | Dashboard aggregate data |
| `GET` | `/api/bonus/status` | Current month bonus tracker |
| `POST` | `/api/admin/allowlist` | Add email to allowlist |
| `DELETE` | `/api/admin/allowlist` | Remove email from allowlist |
| `GET` | `/api/admin/allowlist` | List allowed emails |
| `PATCH` | `/api/admin/fixtures/[fixtureId]/star` | Toggle Star Game |
| `PATCH` | `/api/admin/fixtures/[fixtureId]/override` | Override fixture result |
| `POST` | `/api/admin/scoring/recalculate` | Recalculate scoring |
| `POST` | `/api/admin/season` | Start new season |
| `GET` | `/api/admin/audit-log` | View admin audit log |
| `PATCH` | `/api/profile` | Update display name |
| `POST` | `/api/cron/sync-fixtures` | Fixture sync (cron-triggered) |
| `POST` | `/api/cron/calculate-scores` | Score calculation (cron-triggered) |
| `POST` | `/api/cron/monthly-bonus` | Monthly bonus (cron-triggered) |

### 2.3 Vercel Cron Jobs

| Job | Schedule | Endpoint | Description |
|-----|----------|----------|-------------|
| Fixture Sync | Every 6 hours (`0 */6 * * *`) | `POST /api/cron/sync-fixtures` | Fetch PL fixtures from football-data.org, upsert into DB |
| Score Calculation | Every 6 hours, 5 min after sync (`5 */6 * * *`) | `POST /api/cron/calculate-scores` | Score all newly FINISHED fixtures |
| Monthly Bonus | 1st of each month at 00:30 UTC (`30 0 1 * *`) | `POST /api/cron/monthly-bonus` | Calculate bonus for previous month |

### 2.4 Middleware

```
middleware.ts (root)
├── Auth check: Verify Supabase session via cookie
├── Redirect unauthenticated users to /login
├── Redirect non-admin users from /admin/* to /
├── Allow public routes: /login, /auth/callback, /api/cron/*
└── Refresh session token if near expiry
```

---

## 3. Data Flow Diagrams

### 3.1 Prediction Submission

```
User                  Next.js API           Supabase (Postgres)
 │                        │                        │
 │  POST /api/predictions │                        │
 │  {fixtureId, home, away} ──────────────────────▶│
 │                        │                        │
 │                        │  1. Verify auth (JWT)  │
 │                        │  2. SELECT fixture     │
 │                        │     WHERE id = ?       │
 │                        │     AND kickoff_time   │
 │                        │         > NOW()        │
 │                        │◀───────────────────────│
 │                        │                        │
 │                        │  3. If locked → 403    │
 │                        │                        │
 │                        │  4. UPSERT prediction  │
 │                        │     (user_id, fixture) │
 │                        │──────────────────────▶ │
 │                        │                        │
 │                        │  5. INSERT prediction_ │
 │                        │     history (audit)    │
 │                        │──────────────────────▶ │
 │                        │                        │
 │  ◀── 200 OK ──────────│                        │
 │  {prediction}          │                        │
```

### 3.2 Fixture Sync (Cron)

```
Vercel Cron             Next.js API          football-data.org      Supabase
    │                       │                       │                  │
    │  POST /api/cron/      │                       │                  │
    │  sync-fixtures        │                       │                  │
    │──────────────────────▶│                       │                  │
    │                       │                       │                  │
    │                       │  GET /v4/competitions/ │                  │
    │                       │  PL/matches?season=    │                  │
    │                       │──────────────────────▶│                  │
    │                       │                       │                  │
    │                       │  ◀── 200 [fixtures]───│                  │
    │                       │                       │                  │
    │                       │  For each fixture:                       │
    │                       │  SELECT * FROM fixtures                  │
    │                       │  WHERE api_fixture_id = ?                │
    │                       │─────────────────────────────────────────▶│
    │                       │                                          │
    │                       │  Skip if manually_overridden = true      │
    │                       │                                          │
    │                       │  UPSERT fixture (status, scores, time)   │
    │                       │─────────────────────────────────────────▶│
    │                       │                                          │
    │                       │  Collect newly FINISHED fixture IDs      │
    │                       │                                          │
    │                       │  For each newly finished fixture:        │
    │                       │  CALL calculate_fixture_scores(id)       │
    │                       │─────────────────────────────────────────▶│
    │                       │                                          │
    │  ◀── 200 OK ─────────│                                          │
    │  {synced: N,          │                                          │
    │   scored: M}          │                                          │
```

### 3.3 Scoring Engine

```
Trigger                  Supabase (PL/pgSQL Function)
(cron or admin)              │
    │                        │
    │  CALL calculate_       │
    │  fixture_scores(       │
    │    fixture_id)         │
    │───────────────────────▶│
    │                        │
    │                        │  1. SELECT fixture (actual scores,
    │                        │     is_star_game, status)
    │                        │
    │                        │  2. ABORT if status ≠ FINISHED
    │                        │
    │                        │  3. SELECT all predictions
    │                        │     WHERE fixture_id = ?
    │                        │
    │                        │  4. For each prediction:
    │                        │     ┌─────────────────────────┐
    │                        │     │ exact match?            │
    │                        │     │  → EXACT_SCORE (5) or   │
    │                        │     │    STAR_EXACT (10)      │
    │                        │     │                         │
    │                        │     │ correct outcome?        │
    │                        │     │  → OUTCOME (3) or       │
    │                        │     │    STAR_OUTCOME (3)     │
    │                        │     │                         │
    │                        │     │ BTTS reverse?           │
    │                        │     │  → BTTS_REVERSE (1) or  │
    │                        │     │    STAR_BTTS_REVERSE (1)│
    │                        │     │                         │
    │                        │     │ else → WRONG (0) or     │
    │                        │     │        STAR_WRONG (0)   │
    │                        │     └─────────────────────────┘
    │                        │
    │                        │  5. UPSERT score_record for each
    │                        │     user (idempotent)
    │                        │
    │                        │  6. Handle NO_PREDICTION for users
    │                        │     with no prediction row
    │                        │
    │  ◀── RETURN count ─────│
```

### 3.4 Monthly Bonus Calculation

```
Vercel Cron             Next.js API              Supabase
(1st of month)              │                        │
    │                       │                        │
    │  POST /api/cron/      │                        │
    │  monthly-bonus        │                        │
    │──────────────────────▶│                        │
    │                       │                        │
    │                       │  1. target_month =     │
    │                       │     previous month     │
    │                       │                        │
    │                       │  2. SELECT COUNT(*)    │
    │                       │     FROM fixtures      │
    │                       │     WHERE month =      │
    │                       │     target_month       │
    │                       │     AND status =       │
    │                       │     'FINISHED'         │
    │                       │────────────────────── ▶│
    │                       │                        │
    │                       │  3. For each user:     │
    │                       │     SELECT COUNT(*)    │
    │                       │     FROM predictions p │
    │                       │     JOIN fixtures f    │
    │                       │     WHERE month match  │
    │                       │     AND f.status =     │
    │                       │     'FINISHED'         │
    │                       │────────────────────── ▶│
    │                       │                        │
    │                       │  4. eligible =         │
    │                       │   user_count ==        │
    │                       │   fixture_count        │
    │                       │                        │
    │                       │  5. UPSERT monthly_    │
    │                       │     bonus record       │
    │                       │────────────────────── ▶│
    │                       │                        │
    │  ◀── 200 OK ─────────│                        │
    │  {processed: 30,      │                        │
    │   awarded: 22}        │                        │
```

---

## 4. API Route Inventory

### 4.1 Public Routes (No Auth)

| Method | Path | Request | Response | Description |
|--------|------|---------|----------|-------------|
| `POST` | `/auth/callback` | OAuth code | Redirect | Supabase OAuth callback |

### 4.2 Authenticated User Routes

| Method | Path | Request Body / Params | Response (200) | Errors |
|--------|------|-----------------------|-----------------|--------|
| `GET` | `/api/dashboard` | — | `{ rank, totalPoints, positionChange, upcomingFixtures[], recentResults[], bonusStatus }` | 401 |
| `GET` | `/api/fixtures?gameweek=N&season_id=X` | Query params | `{ fixtures: Fixture[] }` | 401 |
| `GET` | `/api/fixtures/[fixtureId]` | Path param | `{ fixture: Fixture, prediction?: Prediction, scoreRecord?: ScoreRecord }` | 401, 404 |
| `POST` | `/api/predictions` | `{ fixtureId, homeScore, awayScore }` | `{ prediction: Prediction }` | 401, 403 (locked), 400 (validation), 404 |
| `GET` | `/api/predictions/[fixtureId]` | Path param | `{ prediction?: Prediction }` | 401 |
| `GET` | `/api/leaderboard/season?season_id=X` | Query param | `{ leaderboard: LeaderboardRow[] }` | 401 |
| `GET` | `/api/leaderboard/monthly?month=YYYY-MM` | Query param | `{ leaderboard: MonthlyLeaderboardRow[] }` | 401 |
| `GET` | `/api/bonus/status?month=YYYY-MM` | Query param | `{ predicted, total, onTrack, bonusAwarded? }` | 401 |
| `PATCH` | `/api/profile` | `{ displayName }` | `{ profile: Profile }` | 401, 400 |

### 4.3 Admin Routes

| Method | Path | Request Body / Params | Response (200) | Errors |
|--------|------|-----------------------|-----------------|--------|
| `GET` | `/api/admin/allowlist` | — | `{ emails: AllowlistEntry[] }` | 401, 403 |
| `POST` | `/api/admin/allowlist` | `{ email }` | `{ entry: AllowlistEntry }` | 401, 403, 400, 409 |
| `DELETE` | `/api/admin/allowlist` | `{ email }` | `{ success: true }` | 401, 403, 404 |
| `PATCH` | `/api/admin/fixtures/[id]/star` | `{ isStarGame: boolean }` | `{ fixture: Fixture }` | 401, 403, 400 (post-kickoff) |
| `PATCH` | `/api/admin/fixtures/[id]/override` | `{ homeScore, awayScore }` | `{ fixture: Fixture, recalculated: number }` | 401, 403, 400 |
| `POST` | `/api/admin/scoring/recalculate` | `{ fixtureId?: string }` | `{ fixturesProcessed, recordsUpdated }` | 401, 403 |
| `POST` | `/api/admin/season` | `{ name: "2026-2027" }` | `{ season: Season }` | 401, 403, 400 |
| `GET` | `/api/admin/audit-log?page=N` | Query param | `{ entries: AuditLogEntry[], total }` | 401, 403 |

### 4.4 Cron Routes (Protected by CRON_SECRET)

| Method | Path | Auth | Response |
|--------|------|------|----------|
| `POST` | `/api/cron/sync-fixtures` | `Authorization: Bearer CRON_SECRET` | `{ synced, scored, errors[] }` |
| `POST` | `/api/cron/calculate-scores` | `Authorization: Bearer CRON_SECRET` | `{ fixturesProcessed, recordsCreated }` |
| `POST` | `/api/cron/monthly-bonus` | `Authorization: Bearer CRON_SECRET` | `{ month, usersProcessed, bonusesAwarded }` |

---

## 5. Cron Job Definitions

### `vercel.json`

```json
{
  "crons": [
    {
      "path": "/api/cron/sync-fixtures",
      "schedule": "0 */6 * * *"
    },
    {
      "path": "/api/cron/calculate-scores",
      "schedule": "5 */6 * * *"
    },
    {
      "path": "/api/cron/monthly-bonus",
      "schedule": "30 0 1 * *"
    }
  ]
}
```

| Job | Schedule (UTC) | Runs | Max Duration | Retry |
|-----|----------------|------|-------------|-------|
| `sync-fixtures` | `0 */6 * * *` (00:00, 06:00, 12:00, 18:00) | 4x/day | 30s | Next scheduled run |
| `calculate-scores` | `5 */6 * * *` (00:05, 06:05, 12:05, 18:05) | 4x/day | 10s | Next scheduled run |
| `monthly-bonus` | `30 0 1 * *` (00:30 on 1st) | 1x/month | 10s | Manual re-trigger by admin |

### Cron Authentication

All cron endpoints verify the `CRON_SECRET` environment variable:

```
if (request.headers.get('Authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
  return Response.json({ error: 'Unauthorized' }, { status: 401 });
}
```

Vercel automatically sends this header for configured cron jobs.

---

## 6. Key Architectural Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Rendering** | Server Components (SSR) by default | Fast initial load, SEO not needed but SSR reduces JS bundle |
| **Scoring engine** | PL/pgSQL function in Postgres | Deterministic, auditable, runs close to data, no network hop |
| **State management** | Server Components + React `use()` | No client-side state library needed for 30-user read-heavy app |
| **API layer** | Next.js Route Handlers | Collocated with pages, typed, no separate backend |
| **Auth middleware** | Supabase `@supabase/ssr` + Next.js middleware | Session in httpOnly cookie, automatic refresh |
| **Cron scoring** | Triggered 5min after fixture sync | Ensures fresh fixture data before scoring |
| **Monthly bonus** | Separate cron, not triggered by scoring | Clean separation; bonus is monthly aggregate, not per-fixture |
| **Realtime** | Not in MVP (Phase 2) | Unnecessary complexity for 30 users; 6h sync is sufficient |
| **Image hosting** | Next.js `<Image>` with team logos as static assets | No CDN cost; ~20 small PNGs for PL teams |
| **Error handling** | Consistent JSON error format across all routes | Simplifies client error handling |

---

## 7. Infrastructure & Deployment

```
GitHub Repository
       │
       │  git push to main
       ▼
┌─────────────────┐
│   Vercel         │
│   ┌───────────┐ │
│   │ Build     │ │  next build (SSR + static)
│   │ (< 60s)   │ │
│   └─────┬─────┘ │
│         ▼       │
│   ┌───────────┐ │
│   │ Deploy    │ │  Zero-downtime (atomic swap)
│   │           │ │
│   └───────────┘ │
│                 │
│   Preview on PR │  Auto-deploy for every pull request
└─────────────────┘

Supabase (managed)
  ├── Postgres 15.x
  ├── Auth (JWT, 30-day sessions)
  ├── Migrations via supabase CLI
  └── Dashboard for monitoring
```

### Environment Strategy

| Environment | Vercel | Supabase | Branch |
|-------------|--------|----------|--------|
| Production | `grand-football.vercel.app` | Production project | `main` |
| Preview | `grand-football-*.vercel.app` | Same project (or separate staging project) | PR branches |
| Local | `localhost:3000` | Local via `supabase start` | feature branches |
