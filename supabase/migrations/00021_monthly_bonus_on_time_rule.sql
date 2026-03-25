-- ============================================================================
-- Grand Football — Monthly Bonus On-Time Rule
-- Migration: 00021_monthly_bonus_on_time_rule.sql
-- Created: 2026-03-25
-- Description: Re-introduces the monthly_bonuses table (dropped in 00004)
--   with a new on_time_predictions column, and implements the on-time rule:
--   a user earns the +10 bonus ONLY if ALL predictions were submitted on time.
--   "On time" = before the EFFECTIVE GAMEWEEK DEADLINE, which is either the
--   admin-configured deadline (gameweek_deadlines table) or the earliest
--   kickoff in the gameweek as a fallback. One late or missed prediction → no bonus.
-- ============================================================================

-- ============================================================================
-- 1. Recreate monthly_bonuses table with on_time_predictions column
-- ============================================================================
CREATE TABLE public.monthly_bonuses (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  season_id             uuid NOT NULL REFERENCES public.seasons(id) ON DELETE CASCADE,
  month                 date NOT NULL,
  eligible              boolean NOT NULL,
  bonus_points          integer NOT NULL DEFAULT 0,
  fixtures_total        integer NOT NULL,
  predictions_total     integer NOT NULL,
  on_time_predictions   integer NOT NULL DEFAULT 0,
  calculated_at         timestamptz NOT NULL DEFAULT now(),

  UNIQUE (user_id, season_id, month)
);

CREATE INDEX idx_monthly_bonuses_season_month ON public.monthly_bonuses (season_id, month);

COMMENT ON TABLE public.monthly_bonuses IS
'Monthly bonus eligibility records. Eligible = all predictions submitted on time (before kickoff).';

-- ============================================================================
-- 2. RLS — authenticated users can read; writes only via SECURITY DEFINER fn
-- ============================================================================
ALTER TABLE public.monthly_bonuses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "monthly_bonuses_select_all"
  ON public.monthly_bonuses FOR SELECT
  TO authenticated
  USING (true);

-- ============================================================================
-- 3. calculate_monthly_bonus — on-time rule
-- ============================================================================
CREATE OR REPLACE FUNCTION public.calculate_monthly_bonus(
  p_season_id uuid,
  p_month     date
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_month_start   timestamptz;
  v_month_end     timestamptz;
  v_fixture_count integer;
  v_user          RECORD;
  v_pred_count    integer;
  v_on_time_count integer;
  v_eligible      boolean;
  v_processed     integer := 0;
BEGIN
  v_month_start := date_trunc('month', p_month)::timestamptz;
  v_month_end   := (date_trunc('month', p_month) + interval '1 month')::timestamptz;

  -- Count finished fixtures in the month (postponed/cancelled are excluded)
  SELECT COUNT(*) INTO v_fixture_count
  FROM public.fixtures
  WHERE season_id = p_season_id
    AND status    = 'FINISHED'
    AND kickoff_time >= v_month_start
    AND kickoff_time <  v_month_end;

  -- Process every registered user
  FOR v_user IN
    SELECT id FROM public.profiles
  LOOP
    IF v_fixture_count = 0 THEN
      -- International break — auto-eligible, nothing to predict
      v_eligible      := true;
      v_pred_count    := 0;
      v_on_time_count := 0;
    ELSE
      -- Total predictions for finished fixtures in the month
      SELECT COUNT(*) INTO v_pred_count
      FROM public.predictions pred
      JOIN public.fixtures f ON f.id = pred.fixture_id
      WHERE pred.user_id   = v_user.id
        AND f.season_id    = p_season_id
        AND f.status       = 'FINISHED'
        AND f.kickoff_time >= v_month_start
        AND f.kickoff_time <  v_month_end;

      -- On-time predictions: latest of submitted_at / updated_at <= effective gameweek deadline.
      -- The effective deadline is the admin-configured deadline (gameweek_deadlines table)
      -- if one exists for that gameweek, or falls back to the earliest kickoff in the GW.
      -- get_gameweek_deadline() encapsulates this logic.
      -- COALESCE(updated_at, submitted_at) protects against any NULL updated_at
      -- (GREATEST(x, NULL) = NULL in PostgreSQL, so we must use COALESCE).
      SELECT COUNT(*) INTO v_on_time_count
      FROM public.predictions pred
      JOIN public.fixtures f ON f.id = pred.fixture_id
      WHERE pred.user_id   = v_user.id
        AND f.season_id    = p_season_id
        AND f.status       = 'FINISHED'
        AND f.kickoff_time >= v_month_start
        AND f.kickoff_time <  v_month_end
        AND GREATEST(
              pred.submitted_at,
              COALESCE(pred.updated_at, pred.submitted_at)
            ) <= public.get_gameweek_deadline(p_season_id, f.gameweek);

      -- Eligible ONLY when every fixture has an on-time prediction
      v_eligible := (v_on_time_count = v_fixture_count);
    END IF;

    INSERT INTO public.monthly_bonuses (
      user_id, season_id, month,
      eligible, bonus_points,
      fixtures_total, predictions_total, on_time_predictions,
      calculated_at
    ) VALUES (
      v_user.id,
      p_season_id,
      v_month_start::date,
      v_eligible,
      CASE WHEN v_eligible THEN 10 ELSE 0 END,
      v_fixture_count,
      v_pred_count,
      v_on_time_count,
      now()
    )
    ON CONFLICT (user_id, season_id, month) DO UPDATE SET
      eligible            = EXCLUDED.eligible,
      bonus_points        = EXCLUDED.bonus_points,
      fixtures_total      = EXCLUDED.fixtures_total,
      predictions_total   = EXCLUDED.predictions_total,
      on_time_predictions = EXCLUDED.on_time_predictions,
      calculated_at       = EXCLUDED.calculated_at;

    v_processed := v_processed + 1;
  END LOOP;

  RETURN v_processed;
END;
$$;

COMMENT ON FUNCTION public.calculate_monthly_bonus IS
'Calculates monthly bonus for all users using the on-time rule: +10 pts only if
ALL predictions were submitted before the effective gameweek deadline (admin-set
deadline if configured, otherwise earliest kickoff in the gameweek). Idempotent.';

-- ============================================================================
-- 4. get_season_leaderboard — add monthly bonus points to totals
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_season_leaderboard(p_season_id uuid)
RETURNS TABLE (
  rank          bigint,
  user_id       uuid,
  display_name  text,
  avatar_url    text,
  total_points  bigint,
  exact_count   bigint,
  outcome_count bigint,
  zero_count    bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH user_stats AS (
    SELECT
      sr.user_id,
      p.display_name,
      p.avatar_url,
      COALESCE(SUM(sr.points_awarded), 0)                                         AS total_points,
      COUNT(*) FILTER (WHERE sr.reason_code IN ('EXACT_SCORE', 'STAR_EXACT'))     AS exact_count,
      COUNT(*) FILTER (WHERE sr.reason_code IN ('OUTCOME', 'STAR_OUTCOME'))       AS outcome_count,
      COUNT(*) FILTER (WHERE sr.points_awarded = 0)                               AS zero_count
    FROM public.score_records sr
    JOIN public.fixtures f ON f.id = sr.fixture_id
    JOIN public.profiles p ON p.id = sr.user_id
    WHERE f.season_id = p_season_id
      AND f.status    = 'FINISHED'
    GROUP BY sr.user_id, p.display_name, p.avatar_url
  ),
  bonus_totals AS (
    SELECT
      mb.user_id,
      COALESCE(SUM(mb.bonus_points), 0) AS bonus_total
    FROM public.monthly_bonuses mb
    WHERE mb.season_id = p_season_id
    GROUP BY mb.user_id
  )
  SELECT
    RANK() OVER (
      ORDER BY
        (us.total_points + COALESCE(bt.bonus_total, 0)) DESC,
        us.exact_count   DESC,
        us.outcome_count DESC,
        us.zero_count    ASC
    )                                                        AS rank,
    us.user_id,
    us.display_name,
    us.avatar_url,
    (us.total_points + COALESCE(bt.bonus_total, 0))          AS total_points,
    us.exact_count,
    us.outcome_count,
    us.zero_count
  FROM user_stats us
  LEFT JOIN bonus_totals bt ON bt.user_id = us.user_id
  ORDER BY rank ASC, us.display_name ASC;
$$;

COMMENT ON FUNCTION public.get_season_leaderboard IS
'Returns the season leaderboard ranked by total points (including monthly on-time bonuses).
Tie-break: exact scores → correct outcomes → fewest zero-point matches.
SECURITY DEFINER to bypass score_records RLS.';

-- ============================================================================
-- 5. get_monthly_leaderboard — expose on_time_predictions from monthly_bonuses
-- ============================================================================
-- DROP required because we are adding new OUT columns (on_time_predictions,
-- fixtures_missed), which changes the return type. PostgreSQL does not allow
-- CREATE OR REPLACE to alter the return row type.
DROP FUNCTION IF EXISTS public.get_monthly_leaderboard(uuid, date);

CREATE OR REPLACE FUNCTION public.get_monthly_leaderboard(
  p_season_id uuid,
  p_month     date
)
RETURNS TABLE (
  rank                bigint,
  user_id             uuid,
  display_name        text,
  avatar_url          text,
  monthly_points      bigint,
  bonus_points        integer,
  total_monthly       bigint,
  exact_count         bigint,
  outcome_count       bigint,
  bonus_eligible      boolean,
  fixtures_missed     bigint,
  on_time_predictions integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH month_start AS (
    SELECT date_trunc('month', p_month)::timestamptz                    AS start_ts,
           (date_trunc('month', p_month) + interval '1 month')::timestamptz AS end_ts
  ),
  user_monthly_stats AS (
    SELECT
      sr.user_id,
      p.display_name,
      p.avatar_url,
      COALESCE(SUM(sr.points_awarded), 0)                                       AS monthly_points,
      COUNT(*) FILTER (WHERE sr.reason_code IN ('EXACT_SCORE', 'STAR_EXACT'))   AS exact_count,
      COUNT(*) FILTER (WHERE sr.reason_code IN ('OUTCOME', 'STAR_OUTCOME'))     AS outcome_count
    FROM public.score_records sr
    JOIN public.fixtures f ON f.id = sr.fixture_id
    JOIN public.profiles p ON p.id = sr.user_id
    CROSS JOIN month_start ms
    WHERE f.season_id    = p_season_id
      AND f.status       = 'FINISHED'
      AND f.kickoff_time >= ms.start_ts
      AND f.kickoff_time <  ms.end_ts
    GROUP BY sr.user_id, p.display_name, p.avatar_url
  ),
  user_bonus AS (
    SELECT
      mb.user_id,
      mb.eligible                                          AS bonus_eligible,
      mb.bonus_points,
      (mb.fixtures_total - mb.predictions_total)::bigint  AS fixtures_missed,
      mb.on_time_predictions
    FROM public.monthly_bonuses mb
    WHERE mb.season_id = p_season_id
      AND mb.month     = date_trunc('month', p_month)::date
  )
  SELECT
    RANK() OVER (
      ORDER BY
        (ums.monthly_points + COALESCE(ub.bonus_points, 0)) DESC,
        ums.exact_count   DESC,
        ums.outcome_count DESC
    )                                                                 AS rank,
    ums.user_id,
    ums.display_name,
    ums.avatar_url,
    ums.monthly_points,
    COALESCE(ub.bonus_points, 0)::integer                             AS bonus_points,
    (ums.monthly_points + COALESCE(ub.bonus_points, 0))               AS total_monthly,
    ums.exact_count,
    ums.outcome_count,
    ub.bonus_eligible,
    COALESCE(ub.fixtures_missed, 0)::bigint                           AS fixtures_missed,
    COALESCE(ub.on_time_predictions, 0)::integer                      AS on_time_predictions
  FROM user_monthly_stats ums
  LEFT JOIN user_bonus ub ON ub.user_id = ums.user_id
  ORDER BY rank ASC, ums.display_name ASC;
$$;

COMMENT ON FUNCTION public.get_monthly_leaderboard IS
'Returns the monthly leaderboard including on-time bonus data (on_time_predictions column).
SECURITY DEFINER to bypass score_records RLS.';
