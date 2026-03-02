# Grand Football — Resolved Open Decisions

> **Document Owner:** Strategy & Design Agent
> **Last Updated:** 2026-02-27
> **Status:** Final (MVP)

---

## Decision 1: Late Submission Policy

| Attribute | Detail |
|-----------|--------|
| **Decision** | Hard lock at kickoff — no late submission window |
| **Status** | ✅ Confirmed for MVP |

### Rationale

- **Simplicity:** A single cutoff (kickoff time) eliminates ambiguity. There is no "grace period" to debate.
- **Dispute-proof:** Every prediction either exists before kickoff or it doesn't. The `submitted_at` timestamp is the single source of truth.
- **Implementation cost:** One comparison (`submitted_at < kickoff_time`) vs. managing partial-penalty tiers.
- **Fairness:** All 30 users operate under the same binary rule.

### Implications

- The UI must clearly display a countdown or "locks in X minutes" indicator per fixture.
- The backend must reject any `POST /predictions` request where `NOW() >= fixture.kickoff_time`.
- If a user begins editing a prediction and kickoff passes before they save, the save is rejected with clear messaging.

---

## Decision 2: Monthly Bonus Eligibility

| Attribute | Detail |
|-----------|--------|
| **Decision** | User must have submitted predictions for **ALL** fixtures in a calendar month to earn the +10 monthly bonus |
| **Status** | ✅ Confirmed for MVP |

### Rationale

- **Encourages full participation:** The bonus rewards engagement, not just accuracy.
- **Clear binary check:** For each fixture in the month, does a prediction row exist for this user? If any fixture is missing → no bonus.
- **Prevents gaming:** Users cannot skip "hard" fixtures and still earn bonuses.

### Eligibility Logic (pseudocode)

```
month_fixtures = fixtures WHERE kickoff_time IN target_month AND status = 'FINISHED'
user_predictions = predictions WHERE user_id = target_user AND fixture_id IN month_fixtures
eligible = COUNT(user_predictions) == COUNT(month_fixtures)
bonus = eligible ? 10 : 0
```

### Edge Cases

- If zero fixtures are played in a month (e.g., international break spans entire month), all users receive the bonus by default (there are no fixtures to miss).
- Postponed fixtures are evaluated based on the **original scheduled month**, not the rescheduled date. See [edge-cases.md](edge-cases.md) for details.
- A user who joins mid-month cannot earn the bonus for that partial month if fixtures occurred before their join date (they physically could not have submitted). The admin may grant a manual exception at their discretion.

---

## Decision 3: Tech Stack

| Attribute | Detail |
|-----------|--------|
| **Decision** | **Option A — Next.js + Supabase (Postgres + Auth) + Vercel + Scheduled Functions** |
| **Status** | ✅ Confirmed for MVP |

### Rationale

| Criterion | Option A (Next.js + Supabase + Vercel) | Option B (Firebase) |
|-----------|-----------------------------------------|---------------------|
| **Auth** | Built-in magic link + Google OAuth via Supabase Auth | Firebase Auth (comparable) |
| **Database** | Postgres — relational, ideal for scoring joins, leaderboard queries, and audit trails | Firestore — document-based, requires denormalization for leaderboard aggregation |
| **Scoring queries** | Single SQL query can compute leaderboard with tie-breakers via `ORDER BY total_points DESC, exact_count DESC, outcome_count DESC, zero_count ASC` | Requires Cloud Functions to aggregate + maintain denormalized leaderboard documents |
| **Cron / Scheduling** | Vercel Cron Jobs (free tier supports daily/hourly) for fixture sync & score calculation | Cloud Scheduler + Cloud Functions (comparable, slightly more config) |
| **Hosting cost** | Vercel free tier handles 30 users effortlessly; Supabase free tier: 500 MB DB, 50k auth users, 2 GB bandwidth | Firebase Spark plan: 1 GB Firestore, limited reads/writes (30 users likely within limits) |
| **PWA** | Next.js has mature PWA support via `next-pwa` | Doable but requires manual service worker setup |
| **SSR** | Native with Next.js App Router | Not applicable (client-side SPA) |
| **Auditability** | Postgres row-level security + native audit columns | Firestore security rules (less granular) |
| **Developer experience** | TypeScript end-to-end, Supabase generates types from schema | TypeScript supported but Firestore typing is weaker |

### Architecture Summary

```
┌─────────────┐     ┌───────────────────┐     ┌──────────────────┐
│  Next.js     │────▶│  Supabase         │────▶│  Football-Data   │
│  (Vercel)    │     │  Postgres + Auth  │     │  API (fixtures)  │
│              │     │  + RLS            │     └──────────────────┘
│  PWA / SSR   │     │  + Edge Functions │
└─────────────┘     └───────────────────┘
       │
       ▼
  Vercel Cron Jobs
  - Sync fixtures (every 6 hours)
  - Calculate scores (after match finish)
  - Monthly bonus (1st of each month)
```

---

## Decision 4: Star Game Selection

| Attribute | Detail |
|-----------|--------|
| **Decision** | Admin-only designation in MVP — no user voting |
| **Status** | ✅ Confirmed for MVP |

### Rationale

- **Simplest implementation:** Admin toggles a boolean `is_star_game` on any fixture.
- **No coordination overhead:** No voting deadline management, no quorum rules.
- **Phase 2 candidate:** Star Game voting is listed as a Phase 2 idea and can be layered on without changing the scoring engine (the engine only reads the `is_star_game` flag regardless of how it was set).

### Constraints

- A Star Game must be designated **before** its kickoff time. The admin UI must prevent toggling Star Game status after kickoff.
- There is no limit on how many Star Games can exist per gameweek in MVP. The admin has full discretion.
- Star Game status is visible to all users once set (no hidden Star Games).

---

## Decision Summary Table

| # | Decision | Choice | Priority |
|---|----------|--------|----------|
| 1 | Late submissions | Hard lock at kickoff, no grace period | P0 |
| 2 | Monthly bonus | Must submit ALL fixtures in the month | P0 |
| 3 | Tech stack | Next.js + Supabase + Vercel | P0 |
| 4 | Star Game selection | Admin-only in MVP | P0 |
