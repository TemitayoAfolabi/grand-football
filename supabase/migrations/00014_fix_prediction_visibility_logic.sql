-- ============================================================================
-- Grand Football — Fix Prediction Visibility Logic (Inverted)
-- Migration: 00014_fix_prediction_visibility_logic.sql
-- Created: 2026-03-02
-- Description: Fixes inverted visibility logic in can_view_gameweek_predictions
--              and get_gameweek_predictions_with_visibility. The original 00013
--              migration had the before-kickoff rules backwards:
--
--              BROKEN (00013):
--                - Viewer has NOT predicted → CAN see others (allows copying)
--                - Viewer HAS predicted → CANNOT see others
--
--              FIXED (this migration):
--                - Viewer has NOT predicted → CANNOT see others (prevents copying)
--                - Viewer HAS predicted → CAN see others (already committed)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Fix can_view_gameweek_predictions
--
-- The final RETURN was `NOT v_viewer_has_predicted` which allowed non-predictors
-- to see others' predictions (enabling copying). Now returns
-- `v_viewer_has_predicted` so only users who have already committed their own
-- predictions can view others'.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_view_gameweek_predictions(
  p_viewer_id uuid,
  p_target_user_id uuid,
  p_season_id uuid,
  p_gameweek integer
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_first_kickoff timestamptz;
  v_viewer_has_predicted boolean;
BEGIN
  -- Rule 1: Always see own predictions
  IF p_viewer_id = p_target_user_id THEN
    RETURN true;
  END IF;

  -- Rule 2: Admins can always see everything
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = p_viewer_id AND is_admin = true) THEN
    RETURN true;
  END IF;

  -- Get the first kickoff time for this gameweek
  v_first_kickoff := public.get_gameweek_first_kickoff(p_season_id, p_gameweek);

  -- If no fixtures exist in this GW, nothing to see
  IF v_first_kickoff IS NULL THEN
    RETURN false;
  END IF;

  -- Rule 3: After first kickoff → everyone can see
  IF v_first_kickoff <= now() THEN
    RETURN true;
  END IF;

  -- Rule 4: Before first kickoff → depends on viewer's submission status
  v_viewer_has_predicted := public._has_user_predicted_in_gameweek(
    p_viewer_id, p_season_id, p_gameweek
  );

  -- FIX: Viewer who HAS predicted → can see others (already committed, no advantage)
  --      Viewer who has NOT predicted → cannot see others (prevents copying)
  RETURN v_viewer_has_predicted;
END;
$$;

COMMENT ON FUNCTION public.can_view_gameweek_predictions IS
  'Core visibility check: determines if a viewer can see a target user''s predictions for a gameweek. '
  'Rules: own=always, admin=always, past GW=always, future GW: visible only if viewer HAS already predicted (prevents copying).';

-- ----------------------------------------------------------------------------
-- 2. Fix get_gameweek_predictions_with_visibility
--
-- The before-kickoff IF/ELSE block was inverted: it set v_all_visible=false
-- when the viewer HAD predicted and v_all_visible=true when they had NOT.
-- Now correctly shows predictions only to users who have already committed.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_gameweek_predictions_with_visibility(
  p_viewer_id uuid,
  p_season_id uuid,
  p_gameweek integer
)
RETURNS TABLE (
  fixture_id uuid,
  user_id uuid,
  display_name text,
  avatar_url text,
  home_score integer,
  away_score integer,
  submitted_at timestamptz,
  can_view boolean,
  is_own boolean,
  points_awarded integer,
  reason_code text,
  visibility text,
  first_kickoff timestamptz,
  viewer_has_predicted boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_first_kickoff timestamptz;
  v_viewer_predicted boolean;
  v_all_visible boolean;
  v_is_admin boolean;
  v_visibility text;
BEGIN
  -- Pre-compute visibility state for the whole gameweek
  v_first_kickoff := public.get_gameweek_first_kickoff(p_season_id, p_gameweek);

  -- Check if viewer is admin (compute once)
  v_is_admin := EXISTS (SELECT 1 FROM public.profiles WHERE id = p_viewer_id AND is_admin = true);

  -- If no fixtures, return empty
  IF v_first_kickoff IS NULL THEN
    RETURN;
  END IF;

  -- Always compute viewer predicted status (needed for metadata)
  v_viewer_predicted := public._has_user_predicted_in_gameweek(
    p_viewer_id, p_season_id, p_gameweek
  );

  -- Determine visibility
  IF v_first_kickoff <= now() THEN
    -- After first kickoff: all visible
    v_all_visible := true;
    v_visibility := 'visible';
  ELSE
    -- Before first kickoff: depends on viewer's submission
    -- FIX: Viewer who HAS predicted → can see others (already committed)
    --      Viewer who has NOT predicted → cannot see others (prevents copying)
    IF v_viewer_predicted THEN
      v_all_visible := true;
      v_visibility := 'visible';
    ELSE
      v_all_visible := false;
      v_visibility := 'hidden';
    END IF;
  END IF;

  -- Admin override
  IF v_is_admin THEN
    v_all_visible := true;
    v_visibility := 'visible';
  END IF;

  -- Return predictions with visibility flags, score records, and metadata
  RETURN QUERY
  SELECT
    pred.fixture_id,
    pred.user_id,
    prof.display_name,
    prof.avatar_url,
    CASE
      WHEN pred.user_id = p_viewer_id THEN pred.home_score
      WHEN v_all_visible THEN pred.home_score
      ELSE NULL::integer
    END AS home_score,
    CASE
      WHEN pred.user_id = p_viewer_id THEN pred.away_score
      WHEN v_all_visible THEN pred.away_score
      ELSE NULL::integer
    END AS away_score,
    pred.submitted_at,
    CASE
      WHEN pred.user_id = p_viewer_id THEN true
      WHEN v_all_visible THEN true
      ELSE false
    END AS can_view,
    (pred.user_id = p_viewer_id) AS is_own,
    -- Score records for finished fixtures (D-01 fix: bypasses score_records RLS)
    CASE
      WHEN pred.user_id = p_viewer_id THEN sr.points_awarded
      WHEN v_all_visible THEN sr.points_awarded
      ELSE NULL::integer
    END AS points_awarded,
    CASE
      WHEN pred.user_id = p_viewer_id THEN sr.reason_code
      WHEN v_all_visible THEN sr.reason_code
      ELSE NULL::text
    END AS reason_code,
    -- Visibility metadata (D-05/D-06 fix: single source of truth from DB now())
    v_visibility AS visibility,
    v_first_kickoff AS first_kickoff,
    v_viewer_predicted AS viewer_has_predicted
  FROM public.predictions pred
  JOIN public.fixtures f ON f.id = pred.fixture_id
  JOIN public.profiles prof ON prof.id = pred.user_id
  LEFT JOIN public.score_records sr
    ON sr.user_id = pred.user_id AND sr.fixture_id = pred.fixture_id
  WHERE f.season_id = p_season_id
    AND f.gameweek = p_gameweek
  ORDER BY prof.display_name ASC, f.kickoff_time ASC;
END;
$$;

COMMENT ON FUNCTION public.get_gameweek_predictions_with_visibility IS
  'Returns all predictions for a gameweek with visibility enforcement and score records. '
  'Hidden predictions return NULL scores/points and can_view=false. '
  'Before kickoff: viewers who HAVE predicted can see others (already committed); viewers who have NOT predicted cannot (prevents copying). '
  'Includes visibility metadata (visibility, first_kickoff, viewer_has_predicted) on every row to avoid redundant round-trips.';
