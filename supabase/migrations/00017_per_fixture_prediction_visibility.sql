-- ============================================================================
-- Grand Football — Per-Fixture Prediction Visibility
-- Migration: 00017_per_fixture_prediction_visibility.sql
-- Created: 2026-03-13
-- Description: Fixes the prediction visibility logic to be per-fixture instead
--              of per-gameweek. The previous gameweek-level approach allowed
--              users to see all predictions once the FIRST fixture kicked off,
--              even though they could still submit predictions for LATER fixtures.
--              This created a window for copying others' predictions.
--
--              NEW LOGIC (per-fixture):
--              For each fixture's predictions, a viewer can see others' predictions if:
--                1. It's their own prediction (always visible)
--                2. The viewer is an admin (always visible)
--                3. The fixture has individually kicked off (kickoff_time <= now())
--                4. The viewer has submitted their prediction for THIS specific fixture
--                   (they've committed and can't change it, so no advantage)
--
--              This prevents the cheating scenario where User A sees everyone's
--              predictions for Sunday's games after the Saturday 3pm games kick off,
--              but before submitting predictions for Sunday.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Update get_gameweek_predictions_with_visibility to use per-fixture logic
--
-- Changes:
-- - Remove gameweek-level v_all_visible flag
-- - Check visibility per-fixture based on:
--   a) Fixture has kicked off (f.kickoff_time <= now())
--   b) OR viewer has predicted for this specific fixture
-- - Update visibility metadata to reflect mixed state ('partial' when some
--   fixtures are visible and some are hidden)
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
  v_last_kickoff timestamptz;
  v_viewer_predicted_any boolean;
  v_is_admin boolean;
  v_visibility text;
BEGIN
  -- Get first kickoff for metadata
  v_first_kickoff := public.get_gameweek_first_kickoff(p_season_id, p_gameweek);

  -- If no fixtures, return empty
  IF v_first_kickoff IS NULL THEN
    RETURN;
  END IF;

  -- Check if viewer is admin (compute once)
  v_is_admin := EXISTS (SELECT 1 FROM public.profiles WHERE id = p_viewer_id AND is_admin = true);

  -- Check if viewer has predicted for ANY fixture in this gameweek (for metadata)
  v_viewer_predicted_any := public._has_user_predicted_in_gameweek(
    p_viewer_id, p_season_id, p_gameweek
  );

  -- Get last kickoff to determine if all fixtures have kicked off
  SELECT MAX(f.kickoff_time)
  INTO v_last_kickoff
  FROM public.fixtures f
  WHERE f.season_id = p_season_id
    AND f.gameweek = p_gameweek
    AND f.status NOT IN ('POSTPONED', 'CANCELLED');

  -- Determine overall visibility status for metadata/banner
  -- 'visible' = all fixtures kicked off (or admin)
  -- 'hidden' = no fixtures kicked off and viewer hasn't predicted any
  -- 'partial' = some fixtures kicked off or viewer has predicted some
  IF v_is_admin THEN
    v_visibility := 'visible';
  ELSIF v_last_kickoff IS NOT NULL AND v_last_kickoff <= now() THEN
    -- All fixtures have kicked off
    v_visibility := 'visible';
  ELSIF v_first_kickoff <= now() THEN
    -- Some fixtures have kicked off (partial)
    v_visibility := 'partial';
  ELSIF v_viewer_predicted_any THEN
    -- No fixtures kicked off but viewer has predicted some
    v_visibility := 'partial';
  ELSE
    -- No fixtures kicked off, viewer hasn't predicted
    v_visibility := 'hidden';
  END IF;

  -- Return predictions with PER-FIXTURE visibility enforcement
  -- Each prediction is visible if:
  --   1. It's the viewer's own prediction
  --   2. Viewer is admin
  --   3. The fixture has kicked off (f.kickoff_time <= now())
  --   4. Viewer has submitted their prediction for THIS fixture
  RETURN QUERY
  SELECT
    pred.fixture_id,
    pred.user_id,
    prof.display_name,
    prof.avatar_url,
    -- Home score: visible if own, admin, fixture kicked off, or viewer predicted THIS fixture
    CASE
      WHEN pred.user_id = p_viewer_id THEN pred.home_score
      WHEN v_is_admin THEN pred.home_score
      WHEN f.kickoff_time <= now() THEN pred.home_score
      WHEN EXISTS (
        SELECT 1 FROM public.predictions vp
        WHERE vp.user_id = p_viewer_id AND vp.fixture_id = pred.fixture_id
      ) THEN pred.home_score
      ELSE NULL::integer
    END AS home_score,
    -- Away score: same logic
    CASE
      WHEN pred.user_id = p_viewer_id THEN pred.away_score
      WHEN v_is_admin THEN pred.away_score
      WHEN f.kickoff_time <= now() THEN pred.away_score
      WHEN EXISTS (
        SELECT 1 FROM public.predictions vp
        WHERE vp.user_id = p_viewer_id AND vp.fixture_id = pred.fixture_id
      ) THEN pred.away_score
      ELSE NULL::integer
    END AS away_score,
    pred.submitted_at,
    -- can_view flag: same logic
    CASE
      WHEN pred.user_id = p_viewer_id THEN true
      WHEN v_is_admin THEN true
      WHEN f.kickoff_time <= now() THEN true
      WHEN EXISTS (
        SELECT 1 FROM public.predictions vp
        WHERE vp.user_id = p_viewer_id AND vp.fixture_id = pred.fixture_id
      ) THEN true
      ELSE false
    END AS can_view,
    (pred.user_id = p_viewer_id) AS is_own,
    -- Score records: same visibility logic
    CASE
      WHEN pred.user_id = p_viewer_id THEN sr.points_awarded
      WHEN v_is_admin THEN sr.points_awarded
      WHEN f.kickoff_time <= now() THEN sr.points_awarded
      WHEN EXISTS (
        SELECT 1 FROM public.predictions vp
        WHERE vp.user_id = p_viewer_id AND vp.fixture_id = pred.fixture_id
      ) THEN sr.points_awarded
      ELSE NULL::integer
    END AS points_awarded,
    CASE
      WHEN pred.user_id = p_viewer_id THEN sr.reason_code
      WHEN v_is_admin THEN sr.reason_code
      WHEN f.kickoff_time <= now() THEN sr.reason_code
      WHEN EXISTS (
        SELECT 1 FROM public.predictions vp
        WHERE vp.user_id = p_viewer_id AND vp.fixture_id = pred.fixture_id
      ) THEN sr.reason_code
      ELSE NULL::text
    END AS reason_code,
    -- Visibility metadata
    v_visibility AS visibility,
    v_first_kickoff AS first_kickoff,
    v_viewer_predicted_any AS viewer_has_predicted
  FROM public.predictions pred
  JOIN public.fixtures f ON f.id = pred.fixture_id
  JOIN public.profiles prof ON prof.id = pred.user_id
  LEFT JOIN public.score_records sr
    ON sr.user_id = pred.user_id AND sr.fixture_id = pred.fixture_id
  WHERE f.season_id = p_season_id
    AND f.gameweek = p_gameweek
  ORDER BY f.kickoff_time ASC, prof.display_name ASC;
END;
$$;

COMMENT ON FUNCTION public.get_gameweek_predictions_with_visibility IS
  'Returns all predictions for a gameweek with PER-FIXTURE visibility enforcement. '
  'For each fixture, predictions are visible if: (1) own prediction, (2) admin, '
  '(3) fixture has kicked off, or (4) viewer has submitted their prediction for that fixture. '
  'This prevents the cheating window where users could see predictions for later fixtures '
  'after early fixtures kicked off but before submitting their own predictions for later games.';


-- ----------------------------------------------------------------------------
-- 2. Update can_view_gameweek_predictions for consistency
--
-- Note: This function operates at gameweek level and is used for determining
-- WHETHER to show a gameweek's predictions page. We update it to return true
-- if ANY fixtures are viewable (kicked off or viewer has predicted for them).
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

  -- Rule 3: After first kickoff → can view the gameweek (individual fixture
  -- visibility is handled by get_gameweek_predictions_with_visibility)
  IF v_first_kickoff <= now() THEN
    RETURN true;
  END IF;

  -- Rule 4: Before any kickoff → depends on viewer's submission status
  v_viewer_has_predicted := public._has_user_predicted_in_gameweek(
    p_viewer_id, p_season_id, p_gameweek
  );

  -- If viewer has predicted for any fixture, they can access the gameweek
  -- (their specific fixture visibility is handled per-fixture)
  RETURN v_viewer_has_predicted;
END;
$$;

COMMENT ON FUNCTION public.can_view_gameweek_predictions IS
  'Determines if a viewer can access a gameweek''s prediction history page. '
  'Returns true if: own profile, admin, any fixtures have kicked off, or viewer has predicted. '
  'Individual fixture visibility within the gameweek is handled by get_gameweek_predictions_with_visibility.';


-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
