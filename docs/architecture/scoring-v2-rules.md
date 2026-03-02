# Grand Football — Scoring V2: Architecture Specification

> **Document Owner:** Architecture & Security Agent
> **Created:** 2026-03-02
> **Status:** Draft
> **Migration:** `00011_scoring_v2.sql`

---

## Table of Contents

1. [Overview](#1-overview)
2. [Scoring Hierarchy Update](#2-scoring-hierarchy-update)
3. [Rule A: Correct Team Goals](#3-rule-a-correct-team-goals)
4. [Rule B: Late Submission Penalty](#4-rule-b-late-submission-penalty)
5. [Data Model Changes](#5-data-model-changes)
6. [Migration Plan (00011)](#6-migration-plan-00011)
7. [API Contract Changes](#7-api-contract-changes)
8. [Security Considerations](#8-security-considerations)
9. [File Change Map](#9-file-change-map)
10. [Open Questions](#10-open-questions)

---

## 1. Overview

Two new scoring rules are being added:

| Rule | Scope | Points | Where Calculated |
|------|-------|--------|------------------|
| **Correct Team Goals** | Per-fixture | +1 | `calculatePoints()` (TS) + `calculate_fixture_scores()` (PL/pgSQL) |
| **Late Submission Penalty** | Per-user per-gameweek | −1 / −3 / −5 | New dedicated function `calculate_late_penalties()` (PL/pgSQL) + new TS utility |

Key design constraint: the two rules live in **different scopes** — fixture-level vs. gameweek-level — and must be stored, calculated, and surfaced independently.

---

## 2. Scoring Hierarchy Update

The per-fixture scoring cascade becomes a **5-tier priority chain** (evaluated top-to-bottom, first match wins):

| Priority | Reason Code | Star Variant | Points | Star Points | Condition |
|----------|-------------|-------------|--------|-------------|-----------|
| 1 | `EXACT_SCORE` | `STAR_EXACT` | 5 | 10 | `pred_home == actual_home AND pred_away == actual_away` |
| 2 | `OUTCOME` | `STAR_OUTCOME` | 3 | 3 | `getOutcome(pred) == getOutcome(actual)` (but not exact) |
| 3 | `BTTS_REVERSE` | `STAR_BTTS_REVERSE` | 1 | 1 | Wrong outcome AND all 4 scores > 0 |
| **4** | **`CORRECT_TEAM_GOALS`** | **`STAR_CORRECT_TEAM_GOALS`** | **1** | **1** | Wrong outcome, NOT BTTS Reverse, but `pred_home == actual_home` OR `pred_away == actual_away` |
| 5 | `WRONG` | `STAR_WRONG` | 0 | 0 | None of the above |

### Priority & Mutual Exclusivity

- BTTS Reverse (priority 3) and Correct Team Goals (priority 4) both require a **wrong outcome**.
- When both conditions hold simultaneously (wrong outcome + all 4 scores > 0 + at least one team's goals match), **BTTS Reverse wins** because it is evaluated first.
- Correct Team Goals can only trigger when the BTTS Reverse condition is NOT met (i.e., at least one side predicted or scored 0).

### Star Game Behavior

Correct Team Goals is **not doubled** for star games. Points are always 1, consistent with BTTS Reverse.

---

## 3. Rule A: Correct Team Goals

### 3.1 Condition Logic (Pseudocode)

```
IF outcome is wrong
  AND NOT (all four scores > 0)            ← i.e., not BTTS Reverse
  AND (pred_home == actual_home OR pred_away == actual_away)
THEN → CORRECT_TEAM_GOALS (1 pt)
```

### 3.2 Examples

| Predicted | Actual | Outcome Match? | BTTS? | Team Goal Match? | Result |
|-----------|--------|---------------|-------|-----------------|--------|
| 2-1 | 2-0 | ✗ (Home vs Home) wait... 2>1=Home, 2>0=Home → Outcome matches, so this is OUTCOME | — | — | OUTCOME (3pts) |
| 1-0 | 2-0 | ✗ (H vs H) → same outcome → OUTCOME | — | — | OUTCOME |
| 2-1 | 0-1 | ✗ (H vs A) | No (pred_away=1>0, actual_home=0) | pred_away == actual_away (1==1) | **CORRECT_TEAM_GOALS (1pt)** |
| 1-0 | 0-2 | ✗ (H vs A) | No (actual_home=0) | Neither match | WRONG (0pt) |
| 2-1 | 1-3 | ✗ (H vs A) | Yes (all>0) | pred_home=2≠1, pred_away=1≠3 | BTTS_REVERSE (1pt) |
| 2-1 | 1-2 | ✗ (H vs A) | Yes (all>0) | pred_away=1≠2, pred_home=2≠1 | BTTS_REVERSE (1pt) |
| 3-0 | 0-3 | ✗ (H vs A) | No (prd_away=0, act_home=0) | Neither (3≠0, 0≠3) | WRONG (0pt) |
| 0-2 | 0-0 | ✗ (A vs D) | No (pred_home=0, actual scores don't matter for BTTS since pred_home=0) | pred_home==actual_home (0==0) | **CORRECT_TEAM_GOALS (1pt)** |

### 3.3 Edge Case: 0 == 0 Match

Predicting 0 goals and the team scoring 0 goals **does count** as a correct team goal prediction. This is intentional — the user correctly predicted that team would score 0.

### 3.4 TS Engine Changes (Conceptual)

In `calculatePoints()`, after the BTTS Reverse check and before the WRONG fallthrough:

```
// NEW PRIORITY 4: Correct Team Goals
IF (wrong outcome AND NOT btts_reverse)
  AND (predicted.homeScore === actual.homeScore OR predicted.awayScore === actual.awayScore)
  → return { points: 1, reasonCode: isStarGame ? 'STAR_CORRECT_TEAM_GOALS' : 'CORRECT_TEAM_GOALS' }
```

### 3.5 PL/pgSQL Changes (Conceptual)

In `calculate_fixture_scores()`, add an `ELSIF` branch after the BTTS Reverse block:

```
ELSIF v_pred_outcome <> v_actual_outcome
      AND NOT (v_pred.pred_home > 0 AND v_pred.pred_away > 0
               AND v_fixture.home_score > 0 AND v_fixture.away_score > 0)
      AND (v_pred.pred_home = v_fixture.home_score
           OR v_pred.pred_away = v_fixture.away_score)
THEN
  v_points := 1;
  v_reason := CASE WHEN v_fixture.is_star_game THEN 'STAR_CORRECT_TEAM_GOALS' ELSE 'CORRECT_TEAM_GOALS' END;
```

---

## 4. Rule B: Late Submission Penalty

### 4.1 Core Concept

This is a **gameweek-level adjustment**, not a per-fixture score. It is stored in a separate table from `score_records` and joined into leaderboard queries.

### 4.2 Deadline Definition

```
gameweek_deadline = MIN(kickoff_time) FROM fixtures
                    WHERE season_id = <season> AND gameweek = <gw>
```

This is the **earliest kickoff** in the gameweek. All predictions for the entire gameweek should be submitted before this time.

### 4.3 User's Latest Submission Time

```
user_latest_submission = MAX(GREATEST(submitted_at, updated_at)) FROM predictions p
                         JOIN fixtures f ON f.id = p.fixture_id
                         WHERE p.user_id = <user>
                           AND f.season_id = <season>
                           AND f.gameweek = <gw>
```

`GREATEST(submitted_at, updated_at)` captures both initial submissions and edits. If a user submits on time but edits a prediction late, the penalty applies.

### 4.4 Penalty Tiers

| Tier | Condition | Penalty |
|------|-----------|---------|
| 0 | `user_latest_submission <= gameweek_deadline` | 0 (no penalty) |
| 1 | `user_latest_submission <= deadline + 1 hour` | −1 |
| 2 | `user_latest_submission <= deadline + 3 hours` | −3 |
| 3 | `user_latest_submission > deadline + 3 hours` | −5 |

### 4.5 When Is It Calculated?

Late penalties are calculated **once all fixtures in a gameweek are FINISHED**. This is the same trigger point as when the gameweek is considered "complete."

**Trigger options (recommended: Option A):**

- **Option A — Cron-triggered:** The existing `POST /api/cron/calculate-scores` route, after processing fixture scores, checks if all fixtures in the gameweek are now FINISHED. If so, it calls `calculate_late_penalties(p_season_id, p_gameweek)`.
- **Option B — Admin-triggered:** An admin action explicitly triggers late penalty calculation.

Option A is preferred because it is automatic and consistent with the current scoring flow.

### 4.6 Idempotency

`calculate_late_penalties()` uses `ON CONFLICT (user_id, season_id, gameweek) DO UPDATE`, making it safe to call multiple times.

### 4.7 Provisional (Client-Side) Late Penalty

The `useProvisionalScoring` hook should also compute provisional late penalties client-side for the live leaderboard. This requires:
- Knowing the gameweek deadline (earliest kickoff from the fixtures array already available)
- Knowing the current user's latest submission time (available from prediction data or a new lightweight query)

For the live leaderboard, only the **current user's** late penalty is shown as a warning banner. Other users' penalties are not shown until finalized.

---

## 5. Data Model Changes

### 5.1 New Table: `late_penalties`

```
TABLE public.late_penalties (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  season_id      uuid NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  gameweek       integer NOT NULL CHECK (gameweek >= 1 AND gameweek <= 50),
  penalty_points integer NOT NULL CHECK (penalty_points <= 0),  -- always 0 or negative
  latest_submission_at  timestamptz,     -- the timestamp that triggered the penalty
  gameweek_deadline_at  timestamptz,     -- earliest kickoff in the gameweek
  tier           smallint NOT NULL DEFAULT 0 CHECK (tier >= 0 AND tier <= 3),
  calculated_at  timestamptz NOT NULL DEFAULT now(),

  UNIQUE (user_id, season_id, gameweek)
);

CREATE INDEX idx_late_penalties_season_gw ON late_penalties (season_id, gameweek);
CREATE INDEX idx_late_penalties_user ON late_penalties (user_id);
```

**Design rationale:**
- Separate table (not a column on `score_records`) because this is a gameweek-level concept, not fixture-level.
- Stores `latest_submission_at` and `gameweek_deadline_at` for auditability/debugging.
- `tier` column for quick filtering and display without recalculating from timestamps.
- `penalty_points` is always ≤ 0 for clarity; it is **added** (not subtracted) to totals.

### 5.2 New Reason Codes

Add to the `ReasonCode` type:

```
'CORRECT_TEAM_GOALS' | 'STAR_CORRECT_TEAM_GOALS'
```

These are stored in `score_records.reason_code` (existing `text` column — no schema change needed).

### 5.3 New Constants

Add to `SCORING`:

```
CORRECT_TEAM_GOALS: 1
STAR_CORRECT_TEAM_GOALS: 1
LATE_PENALTY_TIER_1: -1
LATE_PENALTY_TIER_2: -3
LATE_PENALTY_TIER_3: -5
```

### 5.4 No Changes to Existing Tables

- `predictions`: no changes (already has `submitted_at`, `updated_at`)
- `fixtures`: no changes (already has `kickoff_time`, `gameweek`)
- `score_records`: no schema changes (reason_code is `text`, new codes just work)

---

## 6. Migration Plan (00011)

File: `supabase/migrations/00011_scoring_v2.sql`

### Section 1: Create `late_penalties` table

- Table definition per §5.1
- Unique constraint on `(user_id, season_id, gameweek)`
- Indexes

### Section 2: RLS policies on `late_penalties`

- **SELECT:** Authenticated users can read all rows (`USING (true)`) — penalties are public within the app, same as score_records.
- **INSERT / UPDATE / DELETE:** Only via `SECURITY DEFINER` functions (no direct user writes). Use a blanket deny (`USING (false)`) for INSERT/UPDATE/DELETE with authenticated role.

### Section 3: Replace `calculate_fixture_scores()` with Correct Team Goals branch

- `CREATE OR REPLACE FUNCTION public.calculate_fixture_scores(p_fixture_id uuid)` — same signature, same `SECURITY DEFINER`, adds the new `ELSIF` branch between BTTS_REVERSE and WRONG.
- Must preserve the `manually_edited` skip logic from migration 00006.

### Section 4: Create `calculate_late_penalties()` function

```sql
CREATE OR REPLACE FUNCTION public.calculate_late_penalties(
  p_season_id uuid,
  p_gameweek  integer
)
RETURNS integer  -- number of penalty records upserted
LANGUAGE plpgsql
SECURITY DEFINER
```

Logic:
1. Compute `v_deadline` = `MIN(kickoff_time)` from `fixtures` where `season_id = p_season_id AND gameweek = p_gameweek`.
2. For each user with predictions in this gameweek, compute `v_latest` = `MAX(GREATEST(submitted_at, updated_at))`.
3. Determine `v_tier` and `v_penalty` based on the difference `v_latest - v_deadline`.
4. `INSERT INTO late_penalties ... ON CONFLICT (user_id, season_id, gameweek) DO UPDATE SET ...`.
5. Also insert a row with `penalty_points = 0, tier = 0` for users who submitted on time (enables querying "no penalty" explicitly).
6. Return count of rows upserted.

### Section 5: Update `get_gameweek_leaderboard()` to include late penalty

The gameweek leaderboard must now return an additional column and factor the penalty into the total:

```
RETURNS TABLE (
  rank            bigint,
  user_id         uuid,
  display_name    text,
  avatar_url      text,
  gameweek_points bigint,      -- fixture points only (unchanged)
  late_penalty    integer,     -- NEW: 0 or negative
  adjusted_total  bigint,      -- NEW: gameweek_points + late_penalty
  exact_count     bigint,
  outcome_count   bigint
)
```

- Join `late_penalties` with `LEFT JOIN` (users with no penalty record get 0).
- `adjusted_total` = `gameweek_points + COALESCE(lp.penalty_points, 0)`.
- **Ranking changes:** Rank by `adjusted_total DESC` (then exact_count, outcome_count as tiebreakers).

### Section 6: Update `get_season_leaderboard()` to include cumulative late penalties

```
RETURNS TABLE (
  ...existing columns...,
  total_late_penalty  bigint,  -- NEW: SUM of all gameweek penalties
  adjusted_total      bigint   -- NEW: total_points + total_late_penalty
)
```

- `total_late_penalty = COALESCE(SUM(lp.penalty_points), 0)` grouped by user across all gameweeks in the season.
- `adjusted_total = total_points + total_late_penalty`.
- **Ranking changes:** Rank by `adjusted_total DESC`.
- Existing `total_points` column is preserved for display ("fixture points before penalties").

### Section 7: Comments

Add `COMMENT ON TABLE` and `COMMENT ON FUNCTION` for all new objects.

### Section 8: Enable Realtime on `late_penalties`

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE public.late_penalties;
```

This allows the client-side live leaderboard to reactively update when penalties are calculated.

---

## 7. API Contract Changes

### 7.1 `get_gameweek_leaderboard` RPC Response (Breaking Change)

**Before:**
```typescript
{ rank, user_id, display_name, avatar_url, gameweek_points, exact_count, outcome_count }
```

**After:**
```typescript
{ rank, user_id, display_name, avatar_url, gameweek_points, late_penalty, adjusted_total, exact_count, outcome_count }
```

| New Field | Type | Description |
|-----------|------|-------------|
| `late_penalty` | `integer` | 0 or negative (−1, −3, −5) |
| `adjusted_total` | `bigint` | `gameweek_points + late_penalty` |

**Ranking is now by `adjusted_total`.**

### 7.2 `get_season_leaderboard` RPC Response (Breaking Change)

**After:**
```typescript
{ rank, user_id, display_name, avatar_url, total_points, total_late_penalty, adjusted_total, exact_count, outcome_count, zero_count }
```

| New Field | Type | Description |
|-----------|------|-------------|
| `total_late_penalty` | `bigint` | Cumulative penalties across all gameweeks |
| `adjusted_total` | `bigint` | `total_points + total_late_penalty` |

**Ranking is now by `adjusted_total`.**

### 7.3 `calculate_late_penalties` RPC (New)

```typescript
calculate_late_penalties: {
  Args: { p_season_id: string; p_gameweek: number }
  Returns: number  // count of records upserted
}
```

Called by the cron route and admin actions only (via service role key).

### 7.4 Provisional Scoring (Client-Side)

The `useProvisionalScoring` hook return type gains:

```typescript
interface ProvisionalEntry {
  ...existing fields...,
  late_penalty: number;       // NEW
  adjusted_total: number;     // NEW: total_points + late_penalty
}
```

### 7.5 Explanations (New Entries)

```typescript
CORRECT_TEAM_GOALS: 'Wrong outcome, but you correctly predicted at least one team\'s goals. +1 point'
STAR_CORRECT_TEAM_GOALS: 'Star Game — wrong outcome, but you correctly predicted at least one team\'s goals. +1 point'
```

Short labels:
```typescript
CORRECT_TEAM_GOALS: 'Correct Team Goals'
STAR_CORRECT_TEAM_GOALS: '⭐ Correct Team Goals'
```

---

## 8. Security Considerations

### 8.1 `late_penalties` RLS

| Policy | Action | Role | Rule |
|--------|--------|------|------|
| `late_penalties_select` | SELECT | authenticated | `USING (true)` — all authenticated users can view all penalties (same visibility model as `score_records`) |
| `late_penalties_deny_insert` | INSERT | authenticated | `WITH CHECK (false)` — users cannot insert penalties directly |
| `late_penalties_deny_update` | UPDATE | authenticated | `USING (false)` — users cannot modify penalties |
| `late_penalties_deny_delete` | DELETE | authenticated | `USING (false)` — users cannot delete penalties |

All writes go through `calculate_late_penalties()` which is `SECURITY DEFINER` (runs as the function owner, bypassing RLS).

### 8.2 `calculate_late_penalties()` Security

- **`SECURITY DEFINER`**: Required to bypass RLS for writes to `late_penalties`.
- **Caller restriction**: Only callable via service role key (cron routes, admin actions). The function itself does not enforce caller identity — this is enforced at the API layer (cron secret / admin check).
- **Idempotent**: Safe to re-run. Uses `ON CONFLICT ... DO UPDATE`.

### 8.3 `calculate_fixture_scores()` Security

No change to security model. Already `SECURITY DEFINER`. The new `CORRECT_TEAM_GOALS` branch is just an additional scoring path within the same function.

### 8.4 Timestamp Integrity

- `submitted_at` and `updated_at` on `predictions` are set server-side (`DEFAULT now()` and trigger `handle_updated_at()`). Users cannot forge timestamps via the client.
- The `kickoff_time` on fixtures is synced from the football-data.org API. Admins can override it but this is audited.

### 8.5 Negative Points Safety

- `penalty_points CHECK (penalty_points <= 0)` — database constraint prevents positive "penalties."
- Constants are negative in TS code to prevent sign errors.
- A user's `adjusted_total` **can go negative** if penalties exceed fixture points. This is intentional.

---

## 9. File Change Map

### 9.1 Database / Migrations

| File | Changes |
|------|---------|
| `supabase/migrations/00011_scoring_v2.sql` | **New file.** Create `late_penalties` table + RLS; replace `calculate_fixture_scores()` with CTG branch; create `calculate_late_penalties()`; update `get_gameweek_leaderboard()` and `get_season_leaderboard()` to include penalty columns; enable Realtime on `late_penalties`. |

### 9.2 TypeScript Scoring Engine

| File | Changes |
|------|---------|
| `src/lib/scoring/types.ts` | Add `'CORRECT_TEAM_GOALS'` and `'STAR_CORRECT_TEAM_GOALS'` to `ReasonCode` union. |
| `src/lib/scoring/engine.ts` | Add priority-4 branch between BTTS Reverse and WRONG returns. |
| `src/lib/scoring/explanations.ts` | Add entries in `REASON_EXPLANATIONS` and `REASON_LABELS` for the two new codes. |
| `src/lib/constants.ts` | Add `CORRECT_TEAM_GOALS: 1`, `STAR_CORRECT_TEAM_GOALS: 1`, `LATE_PENALTY_TIER_1: -1`, `LATE_PENALTY_TIER_2: -3`, `LATE_PENALTY_TIER_3: -5` to `SCORING`. |

### 9.3 Provisional Scoring Hook

| File | Changes |
|------|---------|
| `src/hooks/use-provisional-scoring.ts` | 1) Add `late_penalty` and `adjusted_total` to `ProvisionalEntry` interface. 2) Compute provisional late penalty per user (compare max submission time against min kickoff in the fixtures array). 3) Factor penalty into weekly totals and season totals. |

### 9.4 Database Types (Generated)

| File | Changes |
|------|---------|
| `src/lib/database.types.ts` | Regenerate via `supabase gen types typescript`. Will pick up: `late_penalties` table types, updated RPC return types for `get_gameweek_leaderboard` and `get_season_leaderboard`, new `calculate_late_penalties` RPC. |

### 9.5 Leaderboard UI Components

| File | Changes |
|------|---------|
| `src/app/(authenticated)/leaderboard/weekly-leaderboard.tsx` | Map `late_penalty` and `adjusted_total` from the RPC response. Display penalty indicator next to gameweek points (e.g., "42 pts (−3 late)"). Use `adjusted_total` for the points column. |
| `src/app/(authenticated)/leaderboard/page.tsx` | Map new fields from `get_season_leaderboard`. Display cumulative late penalty in season table. |
| `src/components/leaderboard-table.tsx` | Add optional `late_penalty` prop to entry type. Render penalty badge/chip when non-zero. |
| `src/components/live-leaderboard.tsx` | Pass late penalty data through from provisional scoring hook. |

### 9.6 Cron / API Routes

| File | Changes |
|------|---------|
| `src/app/api/cron/calculate-scores/route.ts` | After processing all fixtures, check if any gameweek is now fully FINISHED. If so, call `calculate_late_penalties(season_id, gameweek)` for that gameweek. |

### 9.7 Admin

| File | Changes |
|------|---------|
| `src/app/(authenticated)/admin/actions.ts` | Add ability to manually trigger `calculate_late_penalties` for a specific gameweek (admin recalculation support). |

### 9.8 Tests

| File | Changes |
|------|---------|
| `src/lib/scoring/engine.test.ts` | Add test cases for CORRECT_TEAM_GOALS: basic cases, 0==0 edge case, BTTS Reverse takes priority, star game variant, boundary between BTTS and CTG. |
| New: `src/lib/scoring/late-penalty.test.ts` | Unit tests for the client-side late penalty utility: on-time, tier 1/2/3 boundaries, no predictions, edge case at exactly 1h / 3h. |

### 9.9 Documentation

| File | Changes |
|------|---------|
| `docs/architecture/api-contracts.md` | Update RPC response schemas for `get_gameweek_leaderboard`, `get_season_leaderboard`. Add `calculate_late_penalties` RPC. |
| `docs/strategy/scoring-rule-changes-v2.md` | Update with final architecture decisions (this document serves as source of truth). |

---

## 10. Open Questions

| # | Question | Recommendation |
|---|----------|----------------|
| 1 | Should `0 == 0` count as a correct team goal? | **Yes.** Predicting a clean sheet is a valid prediction. Spec confirms this. |
| 2 | Should late penalty be visible before the gameweek is fully finished? | **Yes, provisionally.** Show a warning banner client-side using the provisional hook. The DB record is only written when the gameweek completes. |
| 3 | If a user submits no predictions at all, do they get a late penalty? | **No.** Late penalty only applies if the user has predictions. No predictions = no penalty (they already get 0 points for NO_PREDICTION on every fixture). |
| 4 | Can an admin override/waive a late penalty? | **Not in v1.** Can be added later via an `admin_override` boolean on the `late_penalties` table. For now, admin can manually edit the row via Supabase dashboard if needed. |
| 5 | Should the `get_monthly_leaderboard` also factor in late penalties? | **Yes.** Apply the same `LEFT JOIN` pattern. Update in migration 00011 alongside the other leaderboard functions. |
| 6 | Historical backfill: should existing gameweeks get CTG retroactively? | **Recommended.** Run `calculate_fixture_scores` for all existing FINISHED fixtures after migration. Existing BTTS_REVERSE scores are unaffected (BTTS still has priority). Only predictions that were previously WRONG and match one team's goals will change to +1. Manually_edited rows are protected. |
| 7 | Historical backfill: should existing gameweeks get late penalties? | **Yes.** Run `calculate_late_penalties` for all completed gameweeks in the active season. The timestamps are already stored. |

---

*End of specification.*
