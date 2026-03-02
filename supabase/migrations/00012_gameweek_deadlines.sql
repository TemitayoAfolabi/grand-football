-- ============================================================================
-- Grand Football — Configurable Gameweek Submission Deadlines
-- Migration: 00012_gameweek_deadlines.sql
-- Created: 2026-03-02
-- Description: Adds a gameweek_deadlines table so admins can set a custom
--              submission deadline for each gameweek. If not set, the deadline
--              defaults to the earliest kickoff in the gameweek.
--              Updates calculate_late_penalties to respect the custom deadline.
-- ============================================================================

-- 1. Create gameweek_deadlines table
CREATE TABLE IF NOT EXISTS public.gameweek_deadlines (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id  uuid NOT NULL REFERENCES public.seasons(id) ON DELETE CASCADE,
  gameweek   integer NOT NULL CHECK (gameweek >= 1 AND gameweek <= 50),
  deadline   timestamptz NOT NULL,
  set_by     uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (season_id, gameweek)
);

CREATE INDEX idx_gameweek_deadlines_season ON public.gameweek_deadlines (season_id);

COMMENT ON TABLE public.gameweek_deadlines IS
  'Admin-configurable per-gameweek submission deadlines. Falls back to earliest kickoff if not set.';

-- 2. RLS
ALTER TABLE public.gameweek_deadlines ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read (need it for the UI warnings)
CREATE POLICY "gameweek_deadlines_select"
  ON public.gameweek_deadlines FOR SELECT
  TO authenticated
  USING (true);

-- Only admins can write (enforced via SECURITY DEFINER functions / admin client)
-- No direct insert/update/delete policies for non-admins

-- 3. Helper function: get the effective deadline for a gameweek
--    Returns the admin-set deadline if it exists, otherwise the earliest kickoff.
CREATE OR REPLACE FUNCTION public.get_gameweek_deadline(
  p_season_id uuid,
  p_gameweek integer
)
RETURNS timestamptz
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT COALESCE(
    (SELECT gd.deadline
     FROM public.gameweek_deadlines gd
     WHERE gd.season_id = p_season_id AND gd.gameweek = p_gameweek),
    (SELECT MIN(f.kickoff_time)
     FROM public.fixtures f
     WHERE f.season_id = p_season_id
       AND f.gameweek = p_gameweek
       AND f.status NOT IN ('POSTPONED', 'CANCELLED'))
  );
$$;

COMMENT ON FUNCTION public.get_gameweek_deadline IS
  'Returns the submission deadline for a gameweek: admin-set if available, otherwise earliest kickoff.';

-- 4. Update calculate_late_penalties to use get_gameweek_deadline
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
  -- Use the effective deadline (admin-set or earliest kickoff)
  v_deadline := public.get_gameweek_deadline(p_season_id, p_gameweek);

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
'Calculates and upserts late submission penalties for all users in a given gameweek. Uses admin-set deadline if available, else earliest kickoff. Idempotent. Tiers: ON_TIME (0), LATE_1H (-1), LATE_3H (-3), LATE_MAX (-5).';
