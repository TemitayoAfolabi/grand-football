# Grand Football

An invite-only Premier League prediction game for a private group of ~30 players. Participants predict exact scorelines for each gameweek's fixtures and earn points based on accuracy — building toward a season-long leaderboard competition.

---

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Scoring System](#scoring-system)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Database](#database)
- [Authentication](#authentication)
- [Admin Panel](#admin-panel)
- [API Routes](#api-routes)
- [Testing](#testing)
- [Scripts](#scripts)
- [Deployment](#deployment)
- [Troubleshooting](#troubleshooting)

---

## Features

- **Score Predictions** — Submit exact home/away scoreline predictions for every fixture before the deadline
- **Dynamic Leaderboard** — Season-long and monthly leaderboards ranked by points, with tie-breaking rules
- **Live Match Updates** — Real-time scoring during active gameweeks with live standings
- **Star Games** — Designated high-value fixtures where an exact score is worth 10 pts (double)
- **Monthly Bonus** — +10 pts for players who submit all predictions on time every fixture in the calendar month
- **Badges & Milestones** — Earned for achievements (e.g. perfect gameweek, consecutive bonuses)
- **Late Submission Penalties** — Points deducted if predictions are submitted after the gameweek deadline
- **Prediction Leakage Prevention** — Other users' predictions are hidden until a player has submitted their own (or kickoff passes)
- **Admin Tooling** — Full fixture/season management, leaderboard editing with audit trail, score overrides

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | [Next.js 14](https://nextjs.org/) (App Router, React Server Components) |
| Database & Auth | [Supabase](https://supabase.com/) (PostgreSQL, Row Level Security, Auth) |
| Styling | [Tailwind CSS](https://tailwindcss.com/) with custom design tokens |
| Deployment | [Vercel](https://vercel.com/) with cron jobs |
| Testing | [Vitest](https://vitest.dev/) |
| Language | TypeScript |

---

## Project Structure

```
src/
├── app/
│   ├── (authenticated)/          # All player-facing pages (require login)
│   │   ├── page.tsx              # Dashboard — stats, upcoming fixtures, bonus tracker
│   │   ├── leaderboard/          # Season & monthly leaderboard
│   │   ├── fixtures/             # Gameweek fixture list with prediction form
│   │   ├── match/[id]/           # Individual match detail & predictions view
│   │   ├── profile/[id]/         # Player profile & prediction history
│   │   ├── rules/                # Scoring rules explanation page
│   │   ├── settings/             # User account settings
│   │   └── admin/                # Admin-only management pages (see Admin Panel)
│   ├── api/
│   │   ├── predictions/          # CRUD for prediction submissions
│   │   ├── live-fixtures/        # Polling endpoint for live match scores
│   │   └── cron/
│   │       ├── sync-fixtures/    # Syncs fixture data from external football API
│   │       ├── calculate-scores/ # Scores all predictions for finished fixtures
│   │       └── monthly-bonus/    # Awards monthly bonus points (runs on 1st of month)
│   ├── auth/                     # Supabase Auth callback handlers
│   └── login/                   # Magic link + Google OAuth login page
├── components/                   # Shared UI components
│   ├── bonus-tracker.tsx         # Monthly bonus progress bar
│   ├── countdown.tsx             # Live countdown to deadline/kickoff
│   ├── fixture-card.tsx          # Fixture card with score & prediction display
│   ├── leaderboard-table.tsx     # Full leaderboard table
│   ├── live-leaderboard.tsx      # Live provisional leaderboard during gameweek
│   ├── prediction-form.tsx       # Score input form with deadline enforcement
│   └── podium.tsx                # Top-3 podium display
├── hooks/
│   └── use-provisional-scoring.ts  # Client-side live score + penalty calculation
├── lib/
│   ├── scoring/
│   │   ├── engine.ts             # Core points calculation (mirrors DB function)
│   │   ├── late-penalty.ts       # Late submission penalty tiers
│   │   ├── explanations.ts       # Human-readable reason code labels
│   │   └── types.ts              # Scoring type definitions
│   ├── constants.ts              # All point values and thresholds
│   ├── database.types.ts         # Auto-generated Supabase TypeScript types
│   └── utils.ts                  # Shared utilities (outcome calculation, formatting)
├── middleware.ts                  # Auth guard — redirects unauthenticated users
supabase/
└── migrations/                   # Ordered SQL migrations (00001 → 00021)
docs/
├── architecture/                 # Technical specs, DB schema, API contracts
└── strategy/                     # User stories, UX specs, design decisions
scripts/                          # One-off data migration & seeding scripts
```

---

## Scoring System

Points are awarded per fixture using a **4-tier priority chain** (first match wins):

| Priority | Condition | Regular | ⭐ Star Game |
|---|---|---|---|
| 1 | **Exact score** — both goals correct | **5 pts** | **10 pts** |
| 2 | **Correct outcome** — right result (W/D/L) | **3 pts** | 3 pts |
| 3 | **Correct team goals** — wrong outcome but one team's tally matches | **1 pt** | 1 pt |
| 4 | **Wrong** — none of the above | 0 pts | 0 pts |

### Monthly Bonus
**+10 pts** if every prediction in the calendar month was submitted **before the gameweek deadline** (admin-set, or the earliest kickoff as a fallback). A single late or missing prediction forfeits the entire month's bonus.

### Late Submission Penalty
Applied once per gameweek based on how late the user's latest prediction was:

| Late by | Penalty |
|---|---|
| ≤ 1 hour | −1 pt |
| 1–3 hours | −3 pts |
| > 3 hours | −5 pts |

### Tie-Breaking (Leaderboard)
1. Total points ↓
2. Exact score count ↓
3. Correct outcome count ↓
4. Zero-point matches ↑ (fewest)

---

## Getting Started

### Prerequisites

- Node.js 18+
- A [Supabase](https://supabase.com/) project
- [Supabase CLI](https://supabase.com/docs/guides/cli)

### Install & run

```bash
npm install
npm run dev
```

App runs at `http://localhost:3000`.

### Apply database migrations

```bash
npx supabase db push
```

---

## Environment Variables

Create a `.env.local` file in the project root:

```env
NEXT_PUBLIC_SUPABASE_URL=https://<your-project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>
NEXT_PUBLIC_SITE_URL=http://localhost:3000
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
CRON_SECRET=<a-random-secret-for-cron-route-auth>
```

> `CRON_SECRET` is used to authenticate calls to `/api/cron/*` routes. Set the same value in your Vercel environment and in any cron job configuration.

---

## Database

Powered by **Supabase (PostgreSQL)** with Row Level Security (RLS) on every table.

### Core Tables

| Table | Purpose |
|---|---|
| `profiles` | Player display names, avatars, admin flag |
| `allowlist` | Email allowlist controlling who can register |
| `seasons` | Season records with active flag |
| `fixtures` | Match data — teams, kickoff, status, scores, star game flag |
| `predictions` | Player predictions per fixture (home/away score + timestamps) |
| `score_records` | Calculated points per player per fixture with reason codes |
| `gameweek_deadlines` | Admin-configurable per-gameweek submission deadlines |
| `late_penalties` | Calculated late submission penalties per player per gameweek |
| `monthly_bonuses` | Monthly bonus eligibility and award records |
| `user_badges` | Earned badges per player |
| `leaderboard_audit_log` | Audit trail for any manual leaderboard edits |

### Key Database Functions

| Function | Purpose |
|---|---|
| `calculate_fixture_scores(fixture_id)` | Scores all predictions for a finished fixture |
| `calculate_late_penalties(season_id, gameweek)` | Calculates and stores late penalties |
| `calculate_monthly_bonus(season_id, month)` | Awards monthly bonus to eligible players |
| `get_season_leaderboard(season_id)` | Full ranked season leaderboard |
| `get_monthly_leaderboard(season_id, month)` | Monthly ranked leaderboard |
| `get_gameweek_deadline(season_id, gameweek)` | Returns effective deadline (admin or earliest kickoff) |

---

## Authentication

- **Magic link** — passwordless email OTP (10-minute expiry)
- **Google OAuth** — PKCE flow via Supabase Auth
- **Allowlist gating** — only emails in the `allowlist` table can sign up or log in
- **Sessions** — 30-day persistent sessions managed by Supabase
- **Route protection** — `src/middleware.ts` redirects unauthenticated users to `/login`

---

## Admin Panel

Accessible at `/admin/*` for users with `profiles.is_admin = true`.

| Route | Purpose |
|---|---|
| `/admin/users` | Manage the player allowlist and user accounts |
| `/admin/fixtures` | Add, edit, postpone and manage fixtures |
| `/admin/seasons` | Create and activate seasons |
| `/admin/scoring` | Audit calculated scores and trigger recalculation |
| `/admin/leaderboard` | Manually edit scores with a required reason (creates audit log entry) |
| `/admin/predictions` | View all players' predictions for any gameweek |
| `/admin/deadlines` | Set custom per-gameweek submission deadlines |
| `/admin/voting` | Manage star game and star man voting (Phase 2) |

---

## API Routes

| Route | Method | Purpose |
|---|---|---|
| `/api/predictions` | `POST` / `PUT` | Submit or update a prediction (enforces deadline) |
| `/api/live-fixtures` | `GET` | Returns currently live fixture scores for polling |
| `/api/cron/sync-fixtures` | `POST` | Fetches latest fixture data from football API |
| `/api/cron/calculate-scores` | `POST` | Scores finished fixtures and calculates late penalties |
| `/api/cron/monthly-bonus` | `POST` | Calculates and awards monthly bonuses (runs 1st of month) |

All `/api/cron/*` routes require `Authorization: Bearer <CRON_SECRET>`.

---

## Testing

Tests use [Vitest](https://vitest.dev/) and are focused on the deterministic scoring engine.

```bash
npm test            # run all tests
npm run test:watch  # watch mode
npm run coverage    # generate coverage report (100% threshold on scoring module)
```

Test files live alongside the source they cover in `src/lib/scoring/`.

---

## Scripts

Utility scripts in `/scripts` for one-off data operations. Run with Node:

```bash
node scripts/<script-name>.mjs
```

| Script | Purpose |
|---|---|
| `seed-historical-data.mjs` | Seeds historical fixture and score data |
| `seed-real-users.mjs` | Seeds real player profiles for a new season |
| `parse-gw-results.mjs` | Parses gameweek results from raw data files |
| `verify-api.mjs` | Verifies the external football API is reachable |
| `fix-historical-deltas.mjs` | Recalculates score deltas after historical corrections |
| `protect-historical-scores.mjs` | Marks old score records as manually locked |

---

## Deployment

Deployed on **Vercel**. The `vercel.json` wires up the three cron jobs:

| Job | Schedule | Route |
|---|---|---|
| Sync fixtures | Every 30 min during season | `/api/cron/sync-fixtures` |
| Calculate scores | Every 5 min during season | `/api/cron/calculate-scores` |
| Monthly bonus | 1st of each month at 00:05 UTC | `/api/cron/monthly-bonus` |

Set all environment variables in the Vercel dashboard under **Settings → Environment Variables**.

---

## Troubleshooting

**Next.js dev error: `Cannot find module './276.js'`**

Multiple `next dev` processes running simultaneously can corrupt the `.next` cache. Fix:

```bash
pkill -f "next dev" 2>/dev/null || true
pkill -f "node.*next/dist/bin/next" 2>/dev/null || true
rm -rf .next
npm run dev
```

Avoid running parallel dev servers. `npm run dev` is pinned to port `3000`.

