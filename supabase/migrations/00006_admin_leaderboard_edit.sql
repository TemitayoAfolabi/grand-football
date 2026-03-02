-- ============================================================================
-- Grand Football — Admin Leaderboard Edit Support
-- Migration: 00006_admin_leaderboard_edit.sql
-- Created: 2026-02-28
-- Description: Adds manually_edited flag to score_records, extends audit log
--              action enum, and adds public read access to leaderboard edits.
-- ============================================================================

-- 1. Add manually_edited flag to score_records
--    When true, the scoring engine will skip this row during recalculation.
ALTER TABLE public.score_records
  ADD COLUMN IF NOT EXISTS manually_edited boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.score_records.manually_edited IS
  'When true, the scoring engine will not overwrite this row during recalculation.';

-- 2. Extend admin_audit_log action CHECK to include EDIT_SCORE_RECORD
ALTER TABLE public.admin_audit_log
  DROP CONSTRAINT IF EXISTS admin_audit_log_action_check;

ALTER TABLE public.admin_audit_log
  ADD CONSTRAINT admin_audit_log_action_check
  CHECK (action IN (
    'TOGGLE_STAR', 'OVERRIDE_RESULT', 'RECALCULATE',
    'ADD_USER', 'REMOVE_USER', 'NEW_SEASON',
    'CREATE_STAR_MAN_SESSION', 'ADD_STAR_MAN_NOMINEE',
    'REMOVE_STAR_MAN_NOMINEE', 'OPEN_STAR_MAN_VOTING',
    'CLOSE_STAR_MAN_VOTING', 'EDIT_SCORE_RECORD'
  ));

-- 3. Allow ALL authenticated users to read EDIT_SCORE_RECORD entries
--    (so the audit trail is visible to everyone on the leaderboard page)
CREATE POLICY "audit_log_select_leaderboard_edits"
  ON public.admin_audit_log FOR SELECT
  TO authenticated
  USING (action = 'EDIT_SCORE_RECORD');

-- 4. Update calculate_fixture_scores to skip manually_edited rows
--    We replace only the cursor loop to add the exclusion filter.
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

    ELSIF v_pred_outcome <> v_actual_outcome
          AND v_pred.pred_home > 0
          AND v_pred.pred_away > 0
          AND v_fixture.home_score > 0
          AND v_fixture.away_score > 0 THEN
      IF v_fixture.is_star_game THEN
        v_points := 1;
        v_reason := 'STAR_BTTS_REVERSE';
      ELSE
        v_points := 1;
        v_reason := 'BTTS_REVERSE';
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
'Core scoring engine. Calculates and upserts score_records for all users for a given finished fixture. Idempotent. Skips manually_edited rows.';
