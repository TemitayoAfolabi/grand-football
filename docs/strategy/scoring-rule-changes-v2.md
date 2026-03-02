# Scoring Rule Changes v2 — Strategy & Design Spec

> **Date:** 2026-03-02
> **Status:** Draft
> **Author:** Strategy & Design Agent

---

## Table of Contents

1. [Rule 1: Star Game x2 on Exact Only — Confirmation](#rule-1-star-game-x2-on-exact-only--confirmation)
2. [Rule 2: Correct Team Goals — New 1pt Rule](#rule-2-correct-team-goals--new-1pt-rule)
3. [Rule 3: Late Submission Penalty — New Negative Points](#rule-3-late-submission-penalty--new-negative-points)
4. [Updated Scoring Hierarchy](#updated-scoring-hierarchy)
5. [Implementation Checklist](#implementation-checklist)

---

## Rule 1: Star Game x2 on Exact Only — Confirmation

### Status: ✅ Already Implemented — No Changes Required

The codebase already correctly implements this rule across all layers:

| Layer | File | Evidence |
|---|---|---|
| TypeScript engine | `src/lib/scoring/engine.ts` | Star exact → 10pts (`STAR_EXACT`), star outcome → 3pts (`STAR_OUTCOME`), star BTTS → 1pt (`STAR_BTTS_REVERSE`) |
| Constants | `src/lib/constants.ts` | `STAR_EXACT: 10`, `STAR_OUTCOME: 3`, `STAR_BTTS_REVERSE: 1` |
| PL/pgSQL | `supabase/migrations/00006_admin_leaderboard_edit.sql` | Identical branching logic: exact → 10, outcome → 3, BTTS → 1 |
| Tests | `src/lib/scoring/engine.test.ts` | Explicit assertions: "star game outcome is still 3, NOT doubled", "star game BTTS reverse is still 1, NOT doubled" |

**Verdict:** No code changes needed. The x2 multiplier applies exclusively to exact score predictions on star games.

---

## Rule 2: Correct Team Goals — New 1pt Rule

### User Story

**US-SCORING-002: Correct Team Goals Consolation Point**

> **As a** player who predicted the wrong match outcome,
> **I want to** receive 1 consolation point when I correctly predicted the exact number of goals for at least one team,
> **So that** close predictions are rewarded even when the overall outcome was wrong.

### Acceptance Criteria

| # | Criterion | Example |
|---|---|---|
| AC-1 | When the predicted outcome is **wrong** AND the predicted home goals equals the actual home goals, the player receives **1 point** with reason code `CORRECT_TEAM_GOALS`. | Pred: 2-1 (H), Actual: 2-3 (A) → home goals match (2=2) → 1pt |
| AC-2 | When the predicted outcome is **wrong** AND the predicted away goals equals the actual away goals, the player receives **1 point** with reason code `CORRECT_TEAM_GOALS`. | Pred: 1-3 (A), Actual: 1-0 (H) → away goals? No. Home goals match (1=1) → 1pt |
| AC-3 | When the predicted outcome is **wrong** AND **both** team goal counts match, this is by definition an exact score match and is already handled by the Exact Score rule (5/10 pts). This case **cannot** occur at this hierarchy level because exact score is checked first. | N/A — logically impossible at this step |
| AC-4 | This rule is checked **only** when the outcome is wrong. If the outcome is correct (OUTCOME/STAR_OUTCOME), the player already receives 3 pts and this rule does **not** apply. | Pred: 2-1 (H), Actual: 3-1 (H) → outcome correct → 3pts, not 1pt |
| AC-5 | This rule is checked **after** BTTS Reverse. If BTTS Reverse already matched (all 4 scores > 0, wrong outcome), the player gets `BTTS_REVERSE` (1pt). Correct Team Goals is only reached if BTTS Reverse did **not** match. | Pred: 2-1 (H), Actual: 1-3 (A) → all 4 > 0 → BTTS_REVERSE takes priority |
| AC-6 | On a **star game**, this rule awards **1 point** (not doubled) with reason code `STAR_CORRECT_TEAM_GOALS`. | Star game, Pred: 2-0 (H), Actual: 2-3 (A) → 1pt STAR_CORRECT_TEAM_GOALS |
| AC-7 | The rule also applies when the BTTS check **fails** because one or more of the 4 scores is 0, but a team's goal count still matches. | Pred: 1-0 (H), Actual: 1-2 (A) → predicted away=0 so no BTTS, but home goals match (1=1) → 1pt |
| AC-8 | The explanation text and short label are added to the explanations system. | See Design Spec below |

### Design Spec

#### Scoring Hierarchy (Updated)

```
1. Exact Score       → 5pts  (EXACT_SCORE)    / 10pts (STAR_EXACT)
2. Correct Outcome   → 3pts  (OUTCOME)        / 3pts  (STAR_OUTCOME)
3. BTTS Reverse      → 1pt   (BTTS_REVERSE)   / 1pt   (STAR_BTTS_REVERSE)
4. Correct Team Goals→ 1pt   (CORRECT_TEAM_GOALS) / 1pt (STAR_CORRECT_TEAM_GOALS)  ← NEW
5. Wrong             → 0pts  (WRONG)          / 0pts  (STAR_WRONG)
```

#### New Reason Codes

| Code | Points | Description |
|---|---|---|
| `CORRECT_TEAM_GOALS` | 1 | Wrong outcome, but correctly predicted at least one team's goal tally |
| `STAR_CORRECT_TEAM_GOALS` | 1 | Same, on a star game (not doubled) |

#### Files to Modify

| File | Change |
|---|---|
| `src/lib/scoring/types.ts` | Add `'CORRECT_TEAM_GOALS'` and `'STAR_CORRECT_TEAM_GOALS'` to `ReasonCode` union |
| `src/lib/scoring/engine.ts` | Insert step 4 between BTTS Reverse and Wrong: check `predicted.homeScore === actual.homeScore \|\| predicted.awayScore === actual.awayScore` |
| `src/lib/scoring/explanations.ts` | Add entries to `REASON_EXPLANATIONS` and `REASON_LABELS` |
| `src/lib/constants.ts` | Add `CORRECT_TEAM_GOALS: 1` and `STAR_CORRECT_TEAM_GOALS: 1` to `SCORING` |
| `src/lib/scoring/engine.test.ts` | Add test section for Correct Team Goals (normal + star + edge cases) |
| `src/lib/scoring/explanations.test.ts` | Add new codes to `ALL_REASON_CODES` array, add point-value assertions |
| `supabase/migrations/00007_correct_team_goals.sql` | Update `calculate_fixture_scores` PL/pgSQL to add the new branch |
| `src/hooks/use-provisional-scoring.ts` | No structural changes needed (already uses `calculatePoints` which will return new codes) |

#### Engine Logic Change (TypeScript)

```typescript
// In calculatePoints(), after BTTS Reverse check, before Wrong:

// 4. Correct Team Goals: wrong outcome, at least one team's goals match
if (
  predOutcome !== actualOutcome &&
  (predicted.homeScore === actual.homeScore ||
   predicted.awayScore === actual.awayScore)
) {
  return isStarGame
    ? { points: 1, reasonCode: 'STAR_CORRECT_TEAM_GOALS' }
    : { points: 1, reasonCode: 'CORRECT_TEAM_GOALS' };
}
```

#### Engine Logic Change (PL/pgSQL)

```sql
-- After BTTS Reverse ELSIF, before ELSE (Wrong):

ELSIF v_pred_outcome <> v_actual_outcome
      AND (v_pred.pred_home = v_fixture.home_score
           OR v_pred.pred_away = v_fixture.away_score) THEN
  IF v_fixture.is_star_game THEN
    v_points := 1;
    v_reason := 'STAR_CORRECT_TEAM_GOALS';
  ELSE
    v_points := 1;
    v_reason := 'CORRECT_TEAM_GOALS';
  END IF;
```

#### Explanation Text

```typescript
CORRECT_TEAM_GOALS:
  'Wrong outcome, but you correctly predicted the goals for one team. +1 point'
STAR_CORRECT_TEAM_GOALS:
  'Star Game — wrong outcome, but you correctly predicted the goals for one team. +1 point'

// Labels
CORRECT_TEAM_GOALS: 'Correct Team Goals'
STAR_CORRECT_TEAM_GOALS: '⭐ Correct Team Goals'
```

### Edge Cases

| # | Scenario | Pred | Actual | Result | Reason |
|---|---|---|---|---|---|
| E-1 | Home goals match, wrong outcome | 2-1 (H) | 2-3 (A) | 1pt | BTTS_REVERSE takes priority (all 4 > 0). This case would be BTTS_REVERSE, not CORRECT_TEAM_GOALS. |
| E-2 | Home goals match, wrong outcome, predicted away=0 | 1-0 (H) | 1-2 (A) | 1pt | Predicted away=0 → BTTS fails → falls to CORRECT_TEAM_GOALS (home 1=1) |
| E-3 | Away goals match, actual home=0 | 2-1 (H) | 0-1 (A) | 1pt | Actual home=0 → BTTS fails → CORRECT_TEAM_GOALS (away 1=1) |
| E-4 | Both team goals match | 2-1 | 2-1 | 5/10pt | This is exact score — handled at step 1, never reaches step 4 |
| E-5 | No team goals match, no BTTS | 3-0 (H) | 0-2 (A) | 0pt | Neither home nor away goals match → WRONG |
| E-6 | Correct outcome, one team goals match | 2-1 (H) | 3-1 (H) | 3pt | Outcome correct → OUTCOME (3pts), correct team goals rule not reached |
| E-7 | Both teams' goals match but still wrong outcome? | Impossible | — | — | If both home and away match, the score is exact → caught at step 1 |
| E-8 | Predicted 0-0 draw, actual 0-1 away win | 0-0 (D) | 0-1 (A) | 1pt | Outcome wrong, BTTS fails (predicted away=0, actual home=0), but home goals match (0=0) → CORRECT_TEAM_GOALS |
| E-9 | Predicted 0-0 draw, actual 2-0 home win | 0-0 (D) | 2-0 (H) | 1pt | Outcome wrong, BTTS fails, but away goals match (0=0) → CORRECT_TEAM_GOALS |
| E-10 | Star game, home goals match | 2-0 (H) | 2-3 (A), star | 1pt | BTTS fails (pred away=0) → STAR_CORRECT_TEAM_GOALS |
| E-11 | BTTS Reverse AND correct team goals overlap | 2-1 (H) | 2-3 (A) | 1pt | All 4 > 0 AND home goals match → BTTS_REVERSE wins (higher priority in hierarchy), both give 1pt |
| E-12 | High-scoring, zero-match | 5-0 (H) | 0-4 (A) | 0pt | No team goals match → WRONG |

### Important Interaction: BTTS Reverse vs Correct Team Goals

When **both** conditions are met (all 4 scores > 0 AND at least one team's goals match), BTTS Reverse takes priority because it is checked first in the hierarchy. Both award 1 point, so the player's score is the same either way. The distinction matters only for the **reason code** (analytics/tracking). This is the correct behavior: BTTS Reverse is the more specific condition (requires all 4 scores > 0), so it should take precedence.

Cases where Correct Team Goals fires **instead of** BTTS Reverse:
- When at least one of the 4 scores is 0 (BTTS condition fails)
- But one team's predicted goals still matches (e.g., pred 1-0, actual 1-2 → home goals match but pred away=0)

---

## Rule 3: Late Submission Penalty — New Negative Points

### User Story

**US-SCORING-003: Late Submission Penalty**

> **As a** league administrator,
> **I want** players who submit predictions after the first fixture of the gameweek has kicked off to receive a point penalty,
> **So that** there is a fair competitive incentive to submit predictions on time.

### Acceptance Criteria

| # | Criterion | Detail |
|---|---|---|
| AC-1 | The penalty is triggered when a player's **latest** `submitted_at` (or `updated_at`) timestamp for any prediction in the gameweek is **after** the `kickoff_time` of the **earliest fixture** in that gameweek. | Compares `MAX(predictions.submitted_at)` for user in GW against `MIN(fixtures.kickoff_time)` for GW |
| AC-2 | If the submission is **≤ 1 hour** after first kickoff: **-1 point** penalty. | `submitted_at - first_kickoff ≤ interval '1 hour'` |
| AC-3 | If the submission is **> 1 hour and ≤ 3 hours** after first kickoff: **-3 points** penalty. | `interval '1 hour' < diff ≤ interval '3 hours'` |
| AC-4 | If the submission is **> 3 hours** after first kickoff: **-5 points** penalty. | `diff > interval '3 hours'` |
| AC-5 | The penalty is applied **once per gameweek per user** — it is a flat gameweek-level adjustment, not per-fixture. | Single row per user per gameweek in penalty tracking |
| AC-6 | Predictions submitted **before** the first kickoff incur **no penalty** (0 points). | Normal case, no action needed |
| AC-7 | The penalty is stored separately from per-fixture `score_records` — it is a **gameweek-level adjustment**. | New table or column; see design spec |
| AC-8 | The penalty is visible in the weekly leaderboard breakdown so the player understands why their total is reduced. | UI shows penalty line item |
| AC-9 | The penalty applies to the **most recent submission** timestamp. If a user submits on time, then edits a prediction after kickoff, the edit timestamp triggers the penalty. | Uses `MAX(submitted_at)` or `MAX(updated_at)` — whichever is later |
| AC-10 | Admin can override/remove the penalty for a specific user/gameweek via manual edit. | `manually_edited` flag on penalty record |
| AC-11 | The penalty reason code is `LATE_SUBMISSION_1H`, `LATE_SUBMISSION_3H`, or `LATE_SUBMISSION_5H` for tracking/display. | Distinct codes per tier |

### Design Spec

#### Penalty Tiers

| Tier | Window | Penalty | Reason Code |
|---|---|---|---|
| 1 | 0 < diff ≤ 1 hour | -1 point | `LATE_SUBMISSION_1H` |
| 2 | 1 hour < diff ≤ 3 hours | -3 points | `LATE_SUBMISSION_3H` |
| 3 | diff > 3 hours | -5 points | `LATE_SUBMISSION_5H` |

#### Nature of This Rule

This is fundamentally different from per-fixture scoring rules:

- **Per-fixture scoring** (Rules 1-2): Evaluated per prediction, stored in `score_records`, calculated in `calculatePoints()`.
- **Late submission penalty** (Rule 3): Evaluated per user per gameweek, based on timestamp comparison, stored separately. It is a **gameweek-level adjustment**.

Therefore, this rule should **not** be added to `calculatePoints()` in the scoring engine. It belongs in a separate function/layer.

#### New Database Table

```sql
CREATE TABLE public.late_penalties (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  season_id       uuid NOT NULL REFERENCES public.seasons(id),
  gameweek        integer NOT NULL CHECK (gameweek >= 1 AND gameweek <= 50),
  penalty_points  integer NOT NULL CHECK (penalty_points <= 0),
  reason_code     text NOT NULL CHECK (reason_code IN (
    'LATE_SUBMISSION_1H', 'LATE_SUBMISSION_3H', 'LATE_SUBMISSION_5H'
  )),
  first_kickoff   timestamptz NOT NULL,
  latest_submit   timestamptz NOT NULL,
  delay_minutes   integer NOT NULL,
  manually_edited boolean NOT NULL DEFAULT false,
  calculated_at   timestamptz NOT NULL DEFAULT now(),

  UNIQUE (user_id, season_id, gameweek)
);

CREATE INDEX idx_late_penalties_user_season ON public.late_penalties (user_id, season_id);
CREATE INDEX idx_late_penalties_gameweek ON public.late_penalties (season_id, gameweek);

COMMENT ON TABLE public.late_penalties IS
  'Per-user per-gameweek late submission penalties. Separate from fixture-level score_records.';
```

#### New PL/pgSQL Function

```sql
CREATE OR REPLACE FUNCTION public.calculate_late_penalties(
  p_season_id uuid,
  p_gameweek integer
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_first_kickoff timestamptz;
  v_user RECORD;
  v_latest_submit timestamptz;
  v_diff interval;
  v_penalty integer;
  v_reason text;
  v_count integer := 0;
BEGIN
  -- 1. Find the earliest kickoff in this gameweek
  SELECT MIN(kickoff_time) INTO v_first_kickoff
  FROM public.fixtures
  WHERE season_id = p_season_id AND gameweek = p_gameweek;

  IF v_first_kickoff IS NULL THEN
    RETURN 0; -- No fixtures in this gameweek
  END IF;

  -- 2. For each user who has predictions in this gameweek
  FOR v_user IN
    SELECT DISTINCT p.user_id
    FROM public.predictions p
    JOIN public.fixtures f ON f.id = p.fixture_id
    WHERE f.season_id = p_season_id AND f.gameweek = p_gameweek
      AND NOT EXISTS (
        SELECT 1 FROM public.late_penalties lp
        WHERE lp.user_id = p.user_id
          AND lp.season_id = p_season_id
          AND lp.gameweek = p_gameweek
          AND lp.manually_edited = true
      )
  LOOP
    -- 3. Find their latest submission/update time for this GW
    SELECT GREATEST(MAX(p.submitted_at), MAX(p.updated_at)) INTO v_latest_submit
    FROM public.predictions p
    JOIN public.fixtures f ON f.id = p.fixture_id
    WHERE p.user_id = v_user.user_id
      AND f.season_id = p_season_id
      AND f.gameweek = p_gameweek;

    -- 4. Calculate delay
    IF v_latest_submit <= v_first_kickoff THEN
      -- On time, remove any previous non-manual penalty
      DELETE FROM public.late_penalties
      WHERE user_id = v_user.user_id
        AND season_id = p_season_id
        AND gameweek = p_gameweek
        AND manually_edited = false;
      CONTINUE;
    END IF;

    v_diff := v_latest_submit - v_first_kickoff;

    IF v_diff <= interval '1 hour' THEN
      v_penalty := -1;
      v_reason := 'LATE_SUBMISSION_1H';
    ELSIF v_diff <= interval '3 hours' THEN
      v_penalty := -3;
      v_reason := 'LATE_SUBMISSION_3H';
    ELSE
      v_penalty := -5;
      v_reason := 'LATE_SUBMISSION_5H';
    END IF;

    -- 5. Upsert penalty
    INSERT INTO public.late_penalties (
      user_id, season_id, gameweek, penalty_points, reason_code,
      first_kickoff, latest_submit, delay_minutes, calculated_at
    ) VALUES (
      v_user.user_id, p_season_id, p_gameweek, v_penalty, v_reason,
      v_first_kickoff, v_latest_submit,
      EXTRACT(EPOCH FROM v_diff)::integer / 60,
      now()
    )
    ON CONFLICT (user_id, season_id, gameweek) DO UPDATE SET
      penalty_points  = EXCLUDED.penalty_points,
      reason_code     = EXCLUDED.reason_code,
      first_kickoff   = EXCLUDED.first_kickoff,
      latest_submit   = EXCLUDED.latest_submit,
      delay_minutes   = EXCLUDED.delay_minutes,
      calculated_at   = EXCLUDED.calculated_at
    WHERE late_penalties.manually_edited = false;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;
```

#### TypeScript Utility (for client-side preview / provisional display)

```typescript
// src/lib/scoring/late-penalty.ts

export interface LatePenaltyInput {
  latestSubmittedAt: Date;
  firstKickoff: Date;
}

export type LatePenaltyCode =
  | 'LATE_SUBMISSION_1H'
  | 'LATE_SUBMISSION_3H'
  | 'LATE_SUBMISSION_5H'
  | null;

export interface LatePenaltyResult {
  penalty: number;     // 0, -1, -3, or -5
  reasonCode: LatePenaltyCode;
  delayMinutes: number;
}

export function calculateLatePenalty(input: LatePenaltyInput): LatePenaltyResult {
  const diffMs = input.latestSubmittedAt.getTime() - input.firstKickoff.getTime();

  if (diffMs <= 0) {
    return { penalty: 0, reasonCode: null, delayMinutes: 0 };
  }

  const delayMinutes = Math.floor(diffMs / 60_000);
  const ONE_HOUR_MS = 60 * 60 * 1000;
  const THREE_HOURS_MS = 3 * 60 * 60 * 1000;

  if (diffMs <= ONE_HOUR_MS) {
    return { penalty: -1, reasonCode: 'LATE_SUBMISSION_1H', delayMinutes };
  }

  if (diffMs <= THREE_HOURS_MS) {
    return { penalty: -3, reasonCode: 'LATE_SUBMISSION_3H', delayMinutes };
  }

  return { penalty: -5, reasonCode: 'LATE_SUBMISSION_5H', delayMinutes };
}
```

#### Constants Addition

```typescript
// In src/lib/constants.ts, add to SCORING:
CORRECT_TEAM_GOALS: 1,
STAR_CORRECT_TEAM_GOALS: 1,
LATE_PENALTY_1H: -1,
LATE_PENALTY_3H: -3,
LATE_PENALTY_5H: -5,
```

#### Files to Create/Modify

| File | Change |
|---|---|
| `supabase/migrations/00007_scoring_v2.sql` | New migration: create `late_penalties` table, `calculate_late_penalties()` function, update `calculate_fixture_scores()` with correct team goals branch |
| `src/lib/scoring/late-penalty.ts` | **New file**: `calculateLatePenalty()` function |
| `src/lib/scoring/late-penalty.test.ts` | **New file**: Tests for late penalty calculation |
| `src/lib/constants.ts` | Add penalty and correct team goals constants to `SCORING` |
| `src/lib/database.types.ts` | Regenerate to include `late_penalties` table |
| `src/hooks/use-provisional-scoring.ts` | Integrate late penalty into weekly/season totals |
| Leaderboard UI components | Display penalty as a line item in breakdown |

#### Leaderboard Integration

The `useProvisionalScoring` hook and server-side leaderboard queries need to:

1. **Sum fixture points** from `score_records` (existing behavior).
2. **Subtract late penalty** from `late_penalties` for that user/gameweek.
3. Display the penalty as a distinct line item in `fixture_breakdown` (or a new `penalty_breakdown` field).

```typescript
// In useProvisionalScoring, after computing weeklyPoints:
// weeklyPoints += latePenalty (which is negative, so effectively subtracts)
```

### Edge Cases

| # | Scenario | Result |
|---|---|---|
| E-1 | User submits all predictions 1 day before kickoff | No penalty (0 pts) |
| E-2 | User submits 30 minutes after first kickoff | -1 point (within 1 hour) |
| E-3 | User submits exactly 1 hour after first kickoff | -1 point (≤ 1 hour, boundary inclusive) |
| E-4 | User submits 1 hour and 1 second after first kickoff | -3 points (> 1 hour) |
| E-5 | User submits exactly 3 hours after first kickoff | -3 points (≤ 3 hours, boundary inclusive) |
| E-6 | User submits 3 hours and 1 second after first kickoff | -5 points (> 3 hours) |
| E-7 | User submits on time, then **edits** a prediction 2 hours after first kickoff | -3 points (uses latest of `submitted_at` / `updated_at`) |
| E-8 | User submits predictions for some fixtures before kickoff, others after | Penalty based on the **latest** `submitted_at`/`updated_at` across all predictions in the GW |
| E-9 | First fixture of GW is postponed; next earliest is 3 hours later | First kickoff = earliest **non-cancelled/non-postponed** fixture. Need to filter by valid statuses. |
| E-10 | All fixtures in GW postponed | No first kickoff → no penalty possible |
| E-11 | User has no predictions in the GW | No penalty (nothing to penalise) |
| E-12 | Admin manually removes penalty | `manually_edited = true` → function skips on recalculation |
| E-13 | User's clock is wrong (submitted_at is server-side `now()`) | Not an issue — `submitted_at` is set by DB default (`DEFAULT now()`), not client clock |
| E-14 | Multiple submissions across the GW at different times | Only the **latest** timestamp matters |
| E-15 | Gameweek spans multiple days (e.g., Fri–Mon fixtures) | Penalty is based on first kickoff (Friday), not individual fixture kickoffs |

### Critical Design Decision: Postponed Fixtures

Edge case E-9 requires filtering out postponed/cancelled fixtures when determining "first kickoff":

```sql
SELECT MIN(kickoff_time) INTO v_first_kickoff
FROM public.fixtures
WHERE season_id = p_season_id
  AND gameweek = p_gameweek
  AND status NOT IN ('POSTPONED', 'CANCELLED');
```

If all fixtures are postponed/cancelled → no valid first kickoff → no penalty.

---

## Updated Scoring Hierarchy

### Per-Fixture Scoring (in `calculatePoints()`)

```
Priority  Rule                   Normal    Star Game    Reason Code
───────── ────────────────────── ───────── ──────────── ──────────────────────────
1         Exact Score            5 pts     10 pts       EXACT_SCORE / STAR_EXACT
2         Correct Outcome        3 pts     3 pts        OUTCOME / STAR_OUTCOME
3         BTTS Reverse           1 pt      1 pt         BTTS_REVERSE / STAR_BTTS_REVERSE
4  [NEW]  Correct Team Goals     1 pt      1 pt         CORRECT_TEAM_GOALS / STAR_CORRECT_TEAM_GOALS
5         Wrong                  0 pts     0 pts        WRONG / STAR_WRONG
—         No Prediction          0 pts     0 pts        NO_PREDICTION
```

### Gameweek-Level Adjustments (separate from per-fixture)

```
Adjustment                 Points    Reason Code
────────────────────────── ───────── ────────────────────
Late Submission (≤1h)      -1 pt     LATE_SUBMISSION_1H
Late Submission (1-3h)     -3 pts    LATE_SUBMISSION_3H
Late Submission (>3h)      -5 pts    LATE_SUBMISSION_5H
```

### Total Gameweek Score Formula

```
GW_TOTAL = SUM(fixture_points from score_records) + late_penalty (0 or negative)
```

---

## Implementation Checklist

### Phase 1: Correct Team Goals (Rule 2)

- [ ] Add `CORRECT_TEAM_GOALS` and `STAR_CORRECT_TEAM_GOALS` to `ReasonCode` type
- [ ] Add new branch to `calculatePoints()` in engine.ts
- [ ] Add constants to `SCORING` in constants.ts
- [ ] Add explanation text and labels in explanations.ts
- [ ] Write engine tests (normal, star, edge cases)
- [ ] Update explanations tests
- [ ] Write and apply SQL migration (update `calculate_fixture_scores`)
- [ ] Verify provisional scoring hook works with new codes (no changes expected)
- [ ] Run full test suite

### Phase 2: Late Submission Penalty (Rule 3)

- [ ] Write and apply SQL migration (create `late_penalties` table + `calculate_late_penalties()` function)
- [ ] Create `src/lib/scoring/late-penalty.ts` with `calculateLatePenalty()`
- [ ] Create `src/lib/scoring/late-penalty.test.ts`
- [ ] Add penalty constants to `SCORING`
- [ ] Regenerate database types
- [ ] Update `useProvisionalScoring` to integrate penalties
- [ ] Update leaderboard queries to include penalty
- [ ] Update leaderboard UI to display penalty line item
- [ ] Handle postponed fixture edge case in first-kickoff query
- [ ] Write integration tests
- [ ] Run full test suite

### Phase 3: Verification

- [ ] Confirm Rule 1 still passes all existing tests
- [ ] Confirm Rule 2 scoring is consistent between TS engine and PL/pgSQL
- [ ] Confirm Rule 3 penalty calculation is consistent between TS and PL/pgSQL
- [ ] Manual QA on staging environment
