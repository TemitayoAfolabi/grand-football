-- ============================================================================
-- Grand Football — Prediction History Visibility
-- Migration: 00013_prediction_visibility.sql
-- Created: 2026-03-02
-- Description: Adds functions for controlling prediction visibility based on
--              gameweek kickoff times and user submission status. Includes
--              score_records data in the SECURITY DEFINER function to bypass
--              the score_records RLS policy. All SECURITY DEFINER functions
--              have SET search_path = public for security best practice.
-- ============================================================================

-- ============================================================================
-- 1. HELPER FUNCTIONS
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1.1 get_gameweek_first_kickoff — returns earliest kickoff in a gameweek
-- Excludes postponed/cancelled fixtures.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_gameweek_first_kickoff(
  p_season_id uuid,
  p_gameweek integer
)
RETURNS timestamptz
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT MIN(f.kickoff_time)
  FROM public.fixtures f
  WHERE f.season_id = p_season_id
    AND f.gameweek = p_gameweek
    AND f.status NOT IN ('POSTPONED', 'CANCELLED');
$$;

COMMENT ON FUNCTION public.get_gameweek_first_kickoff IS
  'Returns the earliest kickoff time for non-postponed/cancelled fixtures in a gameweek.';

-- ----------------------------------------------------------------------------
-- 1.2 has_user_predicted_in_gameweek — checks if CALLING user submitted
-- Restricted to auth.uid() only to prevent information leakage (D-04 fix).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.has_user_predicted_in_gameweek(
  p_season_id uuid,
  p_gameweek integer
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.predictions p
    JOIN public.fixtures f ON f.id = p.fixture_id
    WHERE p.user_id = auth.uid()
      AND f.season_id = p_season_id
      AND f.gameweek = p_gameweek
  );
$$;

COMMENT ON FUNCTION public.has_user_predicted_in_gameweek IS
  'Returns true if the calling user (auth.uid()) has submitted at least one prediction for any fixture in the given gameweek. Restricted to own user to prevent information leakage.';

-- ----------------------------------------------------------------------------
-- 1.2b _has_user_predicted_in_gameweek — internal variant
-- Accepts arbitrary user_id, for use inside other SECURITY DEFINER functions.
-- NOT directly callable by authenticated users.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._has_user_predicted_in_gameweek(
  p_user_id uuid,
  p_season_id uuid,
  p_gameweek integer
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.predictions p
    JOIN public.fixtures f ON f.id = p.fixture_id
    WHERE p.user_id = p_user_id
      AND f.season_id = p_season_id
      AND f.gameweek = p_gameweek
  );
$$;

-- Revoke EXECUTE from public and authenticated; only callable from other SECURITY DEFINER functions
REVOKE EXECUTE ON FUNCTION public._has_user_predicted_in_gameweek FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public._has_user_predicted_in_gameweek FROM authenticated;

COMMENT ON FUNCTION public._has_user_predicted_in_gameweek IS
  'Internal: checks if a specific user has predicted in a gameweek. Not callable by authenticated users directly.';

-- ----------------------------------------------------------------------------
-- 1.3 can_view_gameweek_predictions — core visibility check
-- Determines if viewer can see target user's predictions for a gameweek.
--
-- Rules:
--   1. Own predictions: always visible
--   2. Admin: always visible
--   3. Past GW (first kickoff <= now()): always visible
--   4. Current/Future GW (first kickoff > now()):
--      a. Viewer has NOT predicted → CAN see others
--      b. Viewer HAS predicted → CANNOT see others
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

  -- 4a: Viewer has NOT predicted → can see others
  -- 4b: Viewer HAS predicted → cannot see others
  RETURN NOT v_viewer_has_predicted;
END;
$$;

COMMENT ON FUNCTION public.can_view_gameweek_predictions IS
  'Core visibility check: determines if a viewer can see a target user''s predictions for a gameweek. '
  'Rules: own=always, admin=always, past GW=always, future GW: visible only if viewer has NOT predicted yet.';

-- ----------------------------------------------------------------------------
-- 1.4 get_gameweek_predictions_with_visibility
-- Returns all viewable predictions for a gameweek with:
--   - Visibility enforcement (NULL scores when hidden)
--   - Score records for finished fixtures (bypasses score_records RLS, D-01 fix)
--   - Visibility metadata on every row (D-05/D-06 fix: avoids redundant
--     round-trips and client/server clock skew)
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
    IF v_viewer_predicted THEN
      v_all_visible := false;
      v_visibility := 'hidden';
    ELSE
      v_all_visible := true;
      v_visibility := 'visible';
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
  'Includes visibility metadata (visibility, first_kickoff, viewer_has_predicted) on every row to avoid redundant round-trips.';

-- ============================================================================
-- 2. RLS POLICY NOTES
-- ============================================================================
-- We keep the existing predictions_select_own and score_records_select_own
-- policies as safety nets. The get_gameweek_predictions_with_visibility function
-- (SECURITY DEFINER) bypasses both RLS policies and enforces visibility
-- in the function body.

-- ============================================================================
-- 3. INDEXES for performance
-- ============================================================================

-- Composite index for the has_user_predicted_in_gameweek check
CREATE INDEX IF NOT EXISTS idx_predictions_user_fixture_gw
  ON public.predictions (user_id, fixture_id);

-- Composite index for gameweek first kickoff lookups
CREATE INDEX IF NOT EXISTS idx_fixtures_season_gw_kickoff
  ON public.fixtures (season_id, gameweek, kickoff_time)
  WHERE status NOT IN ('POSTPONED', 'CANCELLED');
