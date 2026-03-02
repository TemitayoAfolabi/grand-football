-- ============================================================================
-- Grand Football — Scoring Rules V2: Late Penalty + CORRECT_TEAM_GOALS
-- Migration: 00011_scoring_rules_v2.sql
-- Created: 2026-03-02
-- Description: Adds late submission penalty table, calculate_late_penalties
--              function, updates calculate_fixture_scores to include the
--              CORRECT_TEAM_GOALS tier, and updates the score_records
--              reason_code CHECK constraint.
-- ============================================================================

-- 1a. Drop ALL check constraints on score_records (handles auto-generated names)
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE rel.relname = 'score_records'
      AND nsp.nspname = 'public'
      AND con.contype = 'c'
  LOOP
    EXECUTE format('ALTER TABLE public.score_records DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

-- 1b. Remap legacy BTTS_REVERSE rows before adding new constraint
UPDATE public.score_records
  SET reason_code = 'CORRECT_TEAM_GOALS'
  WHERE reason_code = 'BTTS_REVERSE';

UPDATE public.score_records
  SET reason_code = 'STAR_CORRECT_TEAM_GOALS'
  WHERE reason_code = 'STAR_BTTS_REVERSE';

-- 1c. Add the new CHECK constraint

ALTER TABLE public.score_records
  ADD CONSTRAINT score_records_reason_code_check
  CHECK (reason_code IN (
    'EXACT_SCORE', 'OUTCOME', 'CORRECT_TEAM_GOALS', 'WRONG',
    'STAR_EXACT', 'STAR_OUTCOME', 'STAR_CORRECT_TEAM_GOALS', 'STAR_WRONG',
    'NO_PREDICTION'
  ));

-- 2. Create late_penalties table
CREATE TABLE IF NOT EXISTS public.late_penalties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  season_id uuid NOT NULL REFERENCES public.seasons(id) ON DELETE CASCADE,
  gameweek integer NOT NULL CHECK (gameweek >= 1 AND gameweek <= 50),
  penalty_points integer NOT NULL CHECK (penalty_points <= 0),
  latest_submission_at timestamptz NOT NULL,
  gameweek_deadline_at timestamptz NOT NULL,
  tier text NOT NULL CHECK (tier IN ('ON_TIME', 'LATE_1H', 'LATE_3H', 'LATE_MAX')),
  calculated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, season_id, gameweek)
);

CREATE INDEX idx_late_penalties_season_gw ON public.late_penalties (season_id, gameweek);

COMMENT ON TABLE public.late_penalties IS 'Per-user per-gameweek late submission penalty records.';

-- 3. RLS for late_penalties
ALTER TABLE public.late_penalties ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read
CREATE POLICY "late_penalties_select"
  ON public.late_penalties FOR SELECT
  TO authenticated
  USING (true);

-- No direct writes; only through SECURITY DEFINER functions

-- 4. Update calculate_fixture_scores to include CORRECT_TEAM_GOALS tier
CREATE OR REPLACE FUNCTION public.calculate_fixture_scores(p_fixture_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_fixture   public.fixtures%ROWTYPE;
  v_pred      RECORD;
  v_points    integer;
  v_reason    text;
  v_count     integer := 0;
  v_pred_outcome text;
  v_actual_outcome text;
BEGIN
  -- 1. Fetch the fixture
  SELECT * INTO v_fixture
  FROM public.fixtures
  WHERE id = p_fixture_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fixture % not found', p_fixture_id;
  END IF;

  -- 2. Only score FINISHED fixtures
  IF v_fixture.status <> 'FINISHED' THEN
    RAISE EXCEPTION 'Fixture % is not FINISHED (status: %)', p_fixture_id, v_fixture.status;
  END IF;

  -- 3. Ensure actual scores are present
  IF v_fixture.home_score IS NULL OR v_fixture.away_score IS NULL THEN
    RAISE EXCEPTION 'Fixture % has NULL scores', p_fixture_id;
  END IF;

  -- 4. Determine actual outcome
  v_actual_outcome := CASE
    WHEN v_fixture.home_score > v_fixture.away_score THEN 'HOME_WIN'
    WHEN v_fixture.home_score < v_fixture.away_score THEN 'AWAY_WIN'
    ELSE 'DRAW'
  END;

  -- 5. Process each user who submitted a prediction
  --    SKIP users whose score_record is manually_edited
  FOR v_pred IN
    SELECT p.user_id, p.home_score AS pred_home, p.away_score AS pred_away
    FROM public.predictions p
    WHERE p.fixture_id = p_fixture_id
      AND NOT EXISTS (
        SELECT 1 FROM public.score_records sr
        WHERE sr.user_id = p.user_id
          AND sr.fixture_id = p_fixture_id
          AND sr.manually_edited = true
      )
  LOOP
    -- Determine predicted outcome
    v_pred_outcome := CASE
      WHEN v_pred.pred_home > v_pred.pred_away THEN 'HOME_WIN'
      WHEN v_pred.pred_home < v_pred.pred_away THEN 'AWAY_WIN'
      ELSE 'DRAW'
    END;

    -- Apply scoring rules
    IF v_pred.pred_home = v_fixture.home_score
       AND v_pred.pred_away = v_fixture.away_score THEN
      IF v_fixture.is_star_game THEN
        v_points := 10;
        v_reason := 'STAR_EXACT';
      ELSE
        v_points := 5;
        v_reason := 'EXACT_SCORE';
      END IF;

    ELSIF v_pred_outcome = v_actual_outcome THEN
      IF v_fixture.is_star_game THEN
        v_points := 3;
        v_reason := 'STAR_OUTCOME';
      ELSE
        v_points := 3;
        v_reason := 'OUTCOME';
      END IF;

    ELSIF (v_pred.pred_home = v_fixture.home_score
           OR v_pred.pred_away = v_fixture.away_score) THEN
      -- CORRECT TEAM GOALS: wrong outcome, at least one team's goals match
      IF v_fixture.is_star_game THEN
        v_points := 1;
        v_reason := 'STAR_CORRECT_TEAM_GOALS';
      ELSE
        v_points := 1;
        v_reason := 'CORRECT_TEAM_GOALS';
      END IF;

    ELSE
      IF v_fixture.is_star_game THEN
        v_points := 0;
        v_reason := 'STAR_WRONG';
      ELSE
        v_points := 0;
        v_reason := 'WRONG';
      END IF;
    END IF;

    INSERT INTO public.score_records (
      user_id, fixture_id, predicted_home, predicted_away,
      actual_home, actual_away, is_star_game, points_awarded,
      reason_code, calculated_at
    ) VALUES (
      v_pred.user_id, p_fixture_id, v_pred.pred_home, v_pred.pred_away,
      v_fixture.home_score, v_fixture.away_score, v_fixture.is_star_game,
      v_points, v_reason, now()
    )
    ON CONFLICT (user_id, fixture_id) DO UPDATE SET
      predicted_home  = EXCLUDED.predicted_home,
      predicted_away  = EXCLUDED.predicted_away,
      actual_home     = EXCLUDED.actual_home,
      actual_away     = EXCLUDED.actual_away,
      is_star_game    = EXCLUDED.is_star_game,
      points_awarded  = EXCLUDED.points_awarded,
      reason_code     = EXCLUDED.reason_code,
      calculated_at   = EXCLUDED.calculated_at;

    v_count := v_count + 1;
  END LOOP;

  -- 6. Create NO_PREDICTION records for users who didn't predict
  --    Also skip manually_edited rows
  INSERT INTO public.score_records (
    user_id, fixture_id, predicted_home, predicted_away,
    actual_home, actual_away, is_star_game, points_awarded,
    reason_code, calculated_at
  )
  SELECT
    p.id,
    p_fixture_id,
    NULL,
    NULL,
    v_fixture.home_score,
    v_fixture.away_score,
    v_fixture.is_star_game,
    0,
    'NO_PREDICTION',
    now()
  FROM public.profiles p
  WHERE NOT EXISTS (
    SELECT 1 FROM public.predictions pred
    WHERE pred.user_id = p.id AND pred.fixture_id = p_fixture_id
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.score_records sr
    WHERE sr.user_id = p.id
      AND sr.fixture_id = p_fixture_id
      AND sr.manually_edited = true
  )
  ON CONFLICT (user_id, fixture_id) DO UPDATE SET
    predicted_home  = NULL,
    predicted_away  = NULL,
    actual_home     = EXCLUDED.actual_home,
    actual_away     = EXCLUDED.actual_away,
    is_star_game    = EXCLUDED.is_star_game,
    points_awarded  = 0,
    reason_code     = 'NO_PREDICTION',
    calculated_at   = EXCLUDED.calculated_at;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.calculate_fixture_scores IS
'Core scoring engine. Calculates and upserts score_records for all users for a given finished fixture. Idempotent. Skips manually_edited rows. Includes CORRECT_TEAM_GOALS tier.';

-- 5. Create calculate_late_penalties function
CREATE OR REPLACE FUNCTION public.calculate_late_penalties(
  p_season_id uuid,
  p_gameweek integer
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_deadline timestamptz;
  v_count integer := 0;
  v_rec RECORD;
  v_diff_hours numeric;
  v_penalty integer;
  v_tier text;
BEGIN
  -- Find earliest kickoff in the gameweek (exclude POSTPONED/CANCELLED)
  SELECT MIN(kickoff_time) INTO v_deadline
  FROM public.fixtures
  WHERE season_id = p_season_id
    AND gameweek = p_gameweek
    AND status NOT IN ('POSTPONED', 'CANCELLED');

  IF v_deadline IS NULL THEN
    RETURN 0;
  END IF;

  -- For each user, find their latest submission time across all predictions in this GW
  FOR v_rec IN
    SELECT
      p.user_id,
      MAX(GREATEST(p.submitted_at, COALESCE(p.updated_at, p.submitted_at))) AS latest_sub
    FROM public.predictions p
    JOIN public.fixtures f ON f.id = p.fixture_id
    WHERE f.season_id = p_season_id
      AND f.gameweek = p_gameweek
    GROUP BY p.user_id
  LOOP
    v_diff_hours := EXTRACT(EPOCH FROM (v_rec.latest_sub - v_deadline)) / 3600.0;

    IF v_diff_hours <= 0 THEN
      v_penalty := 0;
      v_tier := 'ON_TIME';
    ELSIF v_diff_hours <= 1 THEN
      v_penalty := -1;
      v_tier := 'LATE_1H';
    ELSIF v_diff_hours <= 3 THEN
      v_penalty := -3;
      v_tier := 'LATE_3H';
    ELSE
      v_penalty := -5;
      v_tier := 'LATE_MAX';
    END IF;

    INSERT INTO public.late_penalties (
      user_id, season_id, gameweek, penalty_points,
      latest_submission_at, gameweek_deadline_at, tier, calculated_at
    ) VALUES (
      v_rec.user_id, p_season_id, p_gameweek, v_penalty,
      v_rec.latest_sub, v_deadline, v_tier, now()
    )
    ON CONFLICT (user_id, season_id, gameweek) DO UPDATE SET
      penalty_points       = EXCLUDED.penalty_points,
      latest_submission_at = EXCLUDED.latest_submission_at,
      gameweek_deadline_at = EXCLUDED.gameweek_deadline_at,
      tier                 = EXCLUDED.tier,
      calculated_at        = EXCLUDED.calculated_at;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.calculate_late_penalties IS
'Calculates and upserts late submission penalties for all users in a given gameweek. Idempotent. Tiers: ON_TIME (0), LATE_1H (-1), LATE_3H (-3), LATE_MAX (-5).';
