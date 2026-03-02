# Grand Football — Database Schema

> **Document Owner:** Architecture & Security Agent
> **Last Updated:** 2026-02-27
> **Status:** Final (MVP)

---

## 1. Entity Relationship Diagram

```
┌──────────────────┐       ┌──────────────────┐
│   auth.users     │       │    allowlist      │
│  (Supabase)      │       │                  │
│──────────────────│       │──────────────────│
│  id (uuid) PK    │       │  id (uuid) PK    │
│  email           │◄──┐   │  email (unique)  │
│  ...             │   │   │  added_by        │
└───────┬──────────┘   │   │  created_at      │
        │              │   └──────────────────┘
        │ 1:1          │
        ▼              │
┌──────────────────┐   │   ┌──────────────────┐
│    profiles      │   │   │     seasons      │
│──────────────────│   │   │──────────────────│
│  id (uuid) PK   │───┘   │  id (uuid) PK    │
│  = auth.users.id │       │  name            │
│  display_name    │       │  is_active       │
│  is_admin        │       │  created_at      │
│  created_at      │       └────────┬─────────┘
│  updated_at      │                │ 1:N
└───────┬──────────┘                │
        │                           │
        │ 1:N                       ▼
        │              ┌──────────────────────┐
        │              │      fixtures        │
        │              │──────────────────────│
        │              │  id (uuid) PK        │
        │              │  season_id FK ───────│──▶ seasons.id
        │              │  api_fixture_id      │
        │              │  home_team           │
        │              │  away_team           │
        │              │  kickoff_time (UTC)  │
        │              │  status              │
        │              │  home_score          │
        │              │  away_score          │
        │              │  gameweek            │
        │              │  is_star_game        │
        │              │  manually_overridden │
        │              │  created_at          │
        │              │  updated_at          │
        │              └──────────┬───────────┘
        │                         │ 1:N
        │         ┌───────────────┼───────────────┐
        │         │               │               │
        │         ▼               ▼               ▼
        │  ┌─────────────┐ ┌─────────────┐ ┌─────────────────┐
        │  │ predictions │ │score_records│ │prediction_history│
        │  │─────────────│ │─────────────│ │─────────────────│
        │  │ id PK       │ │ id PK       │ │ id PK           │
        ├─▶│ user_id FK  │ │ user_id FK  │ │ prediction_id FK│
        │  │ fixture_id  │ │ fixture_id  │ │ user_id FK      │
        │  │ home_score  │ │ predicted_  │ │ fixture_id FK   │
        │  │ away_score  │ │   home/away │ │ home_score      │
        │  │ submitted_at│ │ actual_     │ │ away_score      │
        │  │ updated_at  │ │   home/away │ │ changed_at      │
        │  └─────────────┘ │ is_star_game│ └─────────────────┘
        │                  │ points      │
        │                  │ reason_code │
        │                  │ calculated  │
        │                  └─────────────┘
        │
        │ 1:N
        ▼
┌──────────────────────┐    ┌──────────────────────┐
│   monthly_bonuses    │    │   admin_audit_log    │
│──────────────────────│    │──────────────────────│
│  id (uuid) PK       │    │  id (uuid) PK        │
│  user_id FK ────────│    │  admin_id FK ────────│
│  season_id FK       │    │  action              │
│  month (date)       │    │  target_type         │
│  eligible (bool)    │    │  target_id           │
│  bonus_points       │    │  old_value (jsonb)   │
│  fixtures_total     │    │  new_value (jsonb)   │
│  predictions_total  │    │  created_at          │
│  calculated_at      │    └──────────────────────┘
└──────────────────────┘
```

---

## 2. Table Definitions

### 2.1 `profiles`

Extends Supabase `auth.users`. Created automatically on first sign-in.

| Column | Type | Constraints | Default | Description |
|--------|------|-------------|---------|-------------|
| `id` | `uuid` | PK, FK → `auth.users(id)` ON DELETE CASCADE | — | User ID from Supabase Auth |
| `display_name` | `text` | NOT NULL, CHECK (length 3–20) | Email prefix | User-facing name |
| `is_admin` | `boolean` | NOT NULL | `false` | Admin role flag |
| `avatar_url` | `text` | — | `null` | Profile image URL (from Google OAuth) |
| `created_at` | `timestamptz` | NOT NULL | `now()` | Account creation |
| `updated_at` | `timestamptz` | NOT NULL | `now()` | Last profile update |

**Indexes:**
- `PK`: `id`

**RLS Policies:**
| Policy | Operation | Check |
|--------|-----------|-------|
| `profiles_select_own` | SELECT | `auth.uid() = id` (users see own profile) |
| `profiles_select_all` | SELECT | `true` (all authenticated users can see all profiles for leaderboard) |
| `profiles_update_own` | UPDATE | `auth.uid() = id` |
| `profiles_insert_own` | INSERT | `auth.uid() = id` |

---

### 2.2 `allowlist`

Controls which emails can register/sign in.

| Column | Type | Constraints | Default | Description |
|--------|------|-------------|---------|-------------|
| `id` | `uuid` | PK | `gen_random_uuid()` | Row ID |
| `email` | `text` | NOT NULL, UNIQUE | — | Approved email (stored lowercase) |
| `added_by` | `uuid` | FK → `profiles(id)` | — | Admin who added this email |
| `created_at` | `timestamptz` | NOT NULL | `now()` | When added |

**Indexes:**
- `UNIQUE`: `email`
- `idx_allowlist_email_lower`: `LOWER(email)` (for case-insensitive lookup)

**RLS Policies:**
| Policy | Operation | Check |
|--------|-----------|-------|
| `allowlist_select_admin` | SELECT | `EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)` |
| `allowlist_insert_admin` | INSERT | Same admin check |
| `allowlist_delete_admin` | DELETE | Same admin check |

---

### 2.3 `seasons`

Tracks Premier League seasons for multi-season support.

| Column | Type | Constraints | Default | Description |
|--------|------|-------------|---------|-------------|
| `id` | `uuid` | PK | `gen_random_uuid()` | Season ID |
| `name` | `text` | NOT NULL, UNIQUE | — | e.g., "2025-2026" |
| `is_active` | `boolean` | NOT NULL | `false` | Only one active season at a time |
| `start_date` | `date` | — | — | Season start |
| `end_date` | `date` | — | — | Season end |
| `created_at` | `timestamptz` | NOT NULL | `now()` | Creation date |

**Indexes:**
- `PK`: `id`
- Partial unique: `UNIQUE (is_active) WHERE is_active = true` (enforces one active season)

**RLS Policies:**
| Policy | Operation | Check |
|--------|-----------|-------|
| `seasons_select_all` | SELECT | `true` (all authenticated) |
| `seasons_insert_admin` | INSERT | Admin check |
| `seasons_update_admin` | UPDATE | Admin check |

---

### 2.4 `fixtures`

Premier League fixtures synced from football-data.org.

| Column | Type | Constraints | Default | Description |
|--------|------|-------------|---------|-------------|
| `id` | `uuid` | PK | `gen_random_uuid()` | Internal fixture ID |
| `season_id` | `uuid` | NOT NULL, FK → `seasons(id)` | — | Season reference |
| `api_fixture_id` | `integer` | NOT NULL, UNIQUE | — | External ID from football-data.org |
| `home_team` | `text` | NOT NULL | — | Home team name |
| `away_team` | `text` | NOT NULL | — | Away team name |
| `home_team_crest` | `text` | — | — | Team crest URL |
| `away_team_crest` | `text` | — | — | Team crest URL |
| `kickoff_time` | `timestamptz` | NOT NULL | — | Scheduled kickoff (UTC) |
| `status` | `text` | NOT NULL, CHECK | `'SCHEDULED'` | One of: SCHEDULED, TIMED, IN_PLAY, PAUSED, FINISHED, POSTPONED, CANCELLED, SUSPENDED |
| `home_score` | `integer` | CHECK (0–99) | `null` | Final home goals |
| `away_score` | `integer` | CHECK (0–99) | `null` | Final away goals |
| `gameweek` | `integer` | NOT NULL, CHECK (1–50) | — | Matchday/gameweek number |
| `is_star_game` | `boolean` | NOT NULL | `false` | Admin-designated Star Game |
| `manually_overridden` | `boolean` | NOT NULL | `false` | Prevents API overwrite |
| `created_at` | `timestamptz` | NOT NULL | `now()` | Row created |
| `updated_at` | `timestamptz` | NOT NULL | `now()` | Last updated |

**Indexes:**
- `PK`: `id`
- `UNIQUE`: `api_fixture_id`
- `idx_fixtures_season_gameweek`: `(season_id, gameweek)`
- `idx_fixtures_season_status`: `(season_id, status)`
- `idx_fixtures_kickoff`: `(kickoff_time)`
- `idx_fixtures_status`: `(status)` WHERE status = 'FINISHED'

**RLS Policies:**
| Policy | Operation | Check |
|--------|-----------|-------|
| `fixtures_select_all` | SELECT | `true` (all authenticated) |
| `fixtures_insert_service` | INSERT | Service role only (cron job) |
| `fixtures_update_service` | UPDATE | Service role only (cron job + admin) |

---

### 2.5 `predictions`

User score predictions. Unique constraint on (user_id, fixture_id).

| Column | Type | Constraints | Default | Description |
|--------|------|-------------|---------|-------------|
| `id` | `uuid` | PK | `gen_random_uuid()` | Prediction ID |
| `user_id` | `uuid` | NOT NULL, FK → `profiles(id)` | — | User who predicted |
| `fixture_id` | `uuid` | NOT NULL, FK → `fixtures(id)` | — | Fixture predicted |
| `home_score` | `integer` | NOT NULL, CHECK (0–99) | — | Predicted home goals |
| `away_score` | `integer` | NOT NULL, CHECK (0–99) | — | Predicted away goals |
| `submitted_at` | `timestamptz` | NOT NULL | `now()` | First submission time |
| `updated_at` | `timestamptz` | NOT NULL | `now()` | Last edit time |

**Indexes:**
- `PK`: `id`
- `UNIQUE`: `(user_id, fixture_id)`
- `idx_predictions_fixture`: `(fixture_id)`
- `idx_predictions_user`: `(user_id)`

**RLS Policies:**
| Policy | Operation | Check |
|--------|-----------|-------|
| `predictions_select_own` | SELECT | `auth.uid() = user_id` |
| `predictions_select_admin` | SELECT | Admin check |
| `predictions_insert_own` | INSERT | `auth.uid() = user_id` AND fixture not locked |
| `predictions_update_own` | UPDATE | `auth.uid() = user_id` AND fixture not locked |

**Lock enforcement (in RLS or application):**
```sql
EXISTS (
  SELECT 1 FROM fixtures 
  WHERE id = fixture_id 
  AND kickoff_time > now()
)
```

---

### 2.6 `score_records`

Points breakdown per user per fixture. Written by scoring engine.

| Column | Type | Constraints | Default | Description |
|--------|------|-------------|---------|-------------|
| `id` | `uuid` | PK | `gen_random_uuid()` | Record ID |
| `user_id` | `uuid` | NOT NULL, FK → `profiles(id)` | — | User |
| `fixture_id` | `uuid` | NOT NULL, FK → `fixtures(id)` | — | Fixture |
| `predicted_home` | `integer` | — | `null` | Predicted home (null if no prediction) |
| `predicted_away` | `integer` | — | `null` | Predicted away (null if no prediction) |
| `actual_home` | `integer` | NOT NULL | — | Actual home goals |
| `actual_away` | `integer` | NOT NULL | — | Actual away goals |
| `is_star_game` | `boolean` | NOT NULL | `false` | Was it a Star Game |
| `points_awarded` | `integer` | NOT NULL | `0` | Points earned |
| `reason_code` | `text` | NOT NULL, CHECK | — | EXACT_SCORE, OUTCOME, BTTS_REVERSE, WRONG, STAR_EXACT, STAR_OUTCOME, STAR_BTTS_REVERSE, STAR_WRONG, NO_PREDICTION |
| `calculated_at` | `timestamptz` | NOT NULL | `now()` | When scoring ran |

**Indexes:**
- `PK`: `id`
- `UNIQUE`: `(user_id, fixture_id)` (enables idempotent upsert)
- `idx_score_records_user`: `(user_id)`
- `idx_score_records_fixture`: `(fixture_id)`
- `idx_score_records_reason`: `(reason_code)`

**RLS Policies:**
| Policy | Operation | Check |
|--------|-----------|-------|
| `score_records_select_own` | SELECT | `auth.uid() = user_id` |
| `score_records_select_admin` | SELECT | Admin check |
| `score_records_insert_service` | INSERT | Service role only |
| `score_records_update_service` | UPDATE | Service role only |

---

### 2.7 `monthly_bonuses`

Monthly bonus eligibility and award records.

| Column | Type | Constraints | Default | Description |
|--------|------|-------------|---------|-------------|
| `id` | `uuid` | PK | `gen_random_uuid()` | Record ID |
| `user_id` | `uuid` | NOT NULL, FK → `profiles(id)` | — | User |
| `season_id` | `uuid` | NOT NULL, FK → `seasons(id)` | — | Season |
| `month` | `date` | NOT NULL | — | First day of the month (e.g., 2026-01-01) |
| `eligible` | `boolean` | NOT NULL | — | Met all-predictions criterion |
| `bonus_points` | `integer` | NOT NULL | `0` | 10 if eligible, 0 otherwise |
| `fixtures_total` | `integer` | NOT NULL | — | FINISHED fixtures in the month |
| `predictions_total` | `integer` | NOT NULL | — | User's predictions for those fixtures |
| `calculated_at` | `timestamptz` | NOT NULL | `now()` | When calculated |

**Indexes:**
- `PK`: `id`
- `UNIQUE`: `(user_id, season_id, month)`
- `idx_monthly_bonuses_month`: `(season_id, month)`

**RLS Policies:**
| Policy | Operation | Check |
|--------|-----------|-------|
| `monthly_bonuses_select_own` | SELECT | `auth.uid() = user_id` |
| `monthly_bonuses_select_all` | SELECT | `true` (visible on monthly leaderboard) |
| `monthly_bonuses_insert_service` | INSERT | Service role only |
| `monthly_bonuses_update_service` | UPDATE | Service role only |

---

### 2.8 `prediction_history`

Audit trail for prediction edits.

| Column | Type | Constraints | Default | Description |
|--------|------|-------------|---------|-------------|
| `id` | `uuid` | PK | `gen_random_uuid()` | Record ID |
| `prediction_id` | `uuid` | NOT NULL, FK → `predictions(id)` | — | Parent prediction |
| `user_id` | `uuid` | NOT NULL, FK → `profiles(id)` | — | User |
| `fixture_id` | `uuid` | NOT NULL, FK → `fixtures(id)` | — | Fixture |
| `home_score` | `integer` | NOT NULL | — | Previous home score |
| `away_score` | `integer` | NOT NULL | — | Previous away score |
| `changed_at` | `timestamptz` | NOT NULL | `now()` | When the change occurred |

**Indexes:**
- `PK`: `id`
- `idx_prediction_history_prediction`: `(prediction_id)`
- `idx_prediction_history_user_fixture`: `(user_id, fixture_id)`

**RLS Policies:**
| Policy | Operation | Check |
|--------|-----------|-------|
| `prediction_history_select_own` | SELECT | `auth.uid() = user_id` |
| `prediction_history_select_admin` | SELECT | Admin check |
| `prediction_history_insert_service` | INSERT | Service role or `auth.uid() = user_id` |

---

### 2.9 `admin_audit_log`

Records all admin actions for accountability.

| Column | Type | Constraints | Default | Description |
|--------|------|-------------|---------|-------------|
| `id` | `uuid` | PK | `gen_random_uuid()` | Log entry ID |
| `admin_id` | `uuid` | NOT NULL, FK → `profiles(id)` | — | Admin who performed the action |
| `action` | `text` | NOT NULL | — | Action type (e.g., TOGGLE_STAR, OVERRIDE_RESULT, RECALCULATE, ADD_USER, REMOVE_USER, NEW_SEASON) |
| `target_type` | `text` | NOT NULL | — | Entity type (fixture, allowlist, season, score_record) |
| `target_id` | `uuid` | — | — | Entity ID |
| `old_value` | `jsonb` | — | — | Previous state |
| `new_value` | `jsonb` | — | — | New state |
| `created_at` | `timestamptz` | NOT NULL | `now()` | When action occurred |

**Indexes:**
- `PK`: `id`
- `idx_audit_log_admin`: `(admin_id)`
- `idx_audit_log_action`: `(action)`
- `idx_audit_log_created`: `(created_at DESC)`

**RLS Policies:**
| Policy | Operation | Check |
|--------|-----------|-------|
| `audit_log_select_admin` | SELECT | Admin check |
| `audit_log_insert_admin` | INSERT | Admin check or service role |

---

## 3. Enumerated Values

### 3.1 Fixture Status

```sql
CHECK (status IN (
  'SCHEDULED',   -- Fixture scheduled, not started
  'TIMED',       -- Kick-off time confirmed
  'IN_PLAY',     -- Match in progress
  'PAUSED',      -- Half-time or interruption
  'FINISHED',    -- Match completed
  'POSTPONED',   -- Postponed (may be rescheduled)
  'CANCELLED',   -- Permanently cancelled
  'SUSPENDED'    -- Suspended (to be resumed)
))
```

### 3.2 Reason Code

```sql
CHECK (reason_code IN (
  'EXACT_SCORE',       -- Non-star exact match (5 pts)
  'OUTCOME',           -- Non-star correct outcome (3 pts)
  'BTTS_REVERSE',      -- Non-star BTTS reverse (1 pt)
  'WRONG',             -- Non-star wrong (0 pts)
  'STAR_EXACT',        -- Star game exact match (10 pts)
  'STAR_OUTCOME',      -- Star game correct outcome (3 pts)
  'STAR_BTTS_REVERSE', -- Star game BTTS reverse (1 pt)
  'STAR_WRONG',        -- Star game wrong (0 pts)
  'NO_PREDICTION'      -- No prediction submitted (0 pts)
))
```

### 3.3 Admin Action Types

```sql
CHECK (action IN (
  'TOGGLE_STAR',
  'OVERRIDE_RESULT',
  'RECALCULATE',
  'ADD_USER',
  'REMOVE_USER',
  'NEW_SEASON'
))
```

---

## 4. Database Functions

### 4.1 Scoring Engine — `calculate_fixture_scores(fixture_uuid)`

See full implementation in [supabase/migrations/00001_initial_schema.sql](../../supabase/migrations/00001_initial_schema.sql).

### 4.2 Leaderboard Query — `get_season_leaderboard(season_uuid)`

Returns all users ranked with tie-breaking:
1. Total points DESC
2. Exact score count DESC
3. Correct outcome count DESC
4. Zero-point matches ASC

### 4.3 Monthly Leaderboard — `get_monthly_leaderboard(season_uuid, target_month)`

Returns users ranked by points earned in the calendar month, including bonus.

### 4.4 Monthly Bonus — `calculate_monthly_bonus(season_uuid, target_month)`

Evaluates each user for bonus eligibility and upserts monthly_bonus records.

---

## 5. Data Volume Estimates

| Table | Rows/Season | Row Size | Total/Season |
|-------|-------------|----------|-------------|
| `profiles` | ~30 | ~500B | ~15 KB |
| `allowlist` | ~30 | ~200B | ~6 KB |
| `seasons` | 1 | ~200B | ~200B |
| `fixtures` | ~380 | ~500B | ~190 KB |
| `predictions` | ~11,400 | ~200B | ~2.3 MB |
| `score_records` | ~11,400 | ~300B | ~3.4 MB |
| `monthly_bonuses` | ~300 | ~200B | ~60 KB |
| `prediction_history` | ~3,000 (est.) | ~200B | ~600 KB |
| `admin_audit_log` | ~200 (est.) | ~500B | ~100 KB |
| **Total** | | | **~6.7 MB/season** |

Supabase free tier limit: 500 MB → ~74 seasons of headroom.
