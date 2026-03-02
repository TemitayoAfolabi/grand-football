-- ============================================================================
-- Grand Football — Fix Leaderboard Functions
-- Migration: 00008_fix_leaderboard_no_monthly_bonuses.sql
-- Created: 2026-02-28
-- Description: Re-create get_season_leaderboard and get_monthly_leaderboard
--   without references to the dropped monthly_bonuses table.
--   Also drops the orphaned calculate_monthly_bonus function.
-- ============================================================================

-- Drop the orphaned function that references the dropped monthly_bonuses table
DROP FUNCTION IF EXISTS public.calculate_monthly_bonus(uuid, date);

-- ----------------------------------------------------------------------------
-- Re-create get_season_leaderboard without monthly_bonuses
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_season_leaderboard(p_season_id uuid)
RETURNS TABLE (
  rank            bigint,
  user_id         uuid,
  display_name    text,
  avatar_url      text,
  total_points    bigint,
  exact_count     bigint,
  outcome_count   bigint,
  zero_count      bigint
)
LANGUAGE sql
STABLE
AS $$
  WITH user_stats AS (
    SELECT
      sr.user_id,
      p.display_name,
      p.avatar_url,
      COALESCE(SUM(sr.points_awarded), 0) AS total_points,
      COUNT(*) FILTER (WHERE sr.reason_code IN ('EXACT_SCORE', 'STAR_EXACT')) AS exact_count,
      COUNT(*) FILTER (WHERE sr.reason_code IN ('OUTCOME', 'STAR_OUTCOME')) AS outcome_count,
      COUNT(*) FILTER (WHERE sr.points_awarded = 0) AS zero_count
    FROM public.score_records sr
    JOIN public.fixtures f ON f.id = sr.fixture_id
    JOIN public.profiles p ON p.id = sr.user_id
    WHERE f.season_id = p_season_id
      AND f.status = 'FINISHED'
    GROUP BY sr.user_id, p.display_name, p.avatar_url
  )
  SELECT
    RANK() OVER (
      ORDER BY
        us.total_points DESC,
        us.exact_count DESC,
        us.outcome_count DESC,
        us.zero_count ASC
    ) AS rank,
    us.user_id,
    us.display_name,
    us.avatar_url,
    us.total_points,
    us.exact_count,
    us.outcome_count,
    us.zero_count
  FROM user_stats us
  ORDER BY rank ASC, us.display_name ASC;
$$;

COMMENT ON FUNCTION public.get_season_leaderboard IS
'Returns the season leaderboard ranked by total points with tie-breaking: exact scores → correct outcomes → fewest zero-point matches.';

-- ----------------------------------------------------------------------------
-- Re-create get_monthly_leaderboard without monthly_bonuses
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_monthly_leaderboard(
  p_season_id uuid,
  p_month date
)
RETURNS TABLE (
  rank              bigint,
  user_id           uuid,
  display_name      text,
  avatar_url        text,
  monthly_points    bigint,
  bonus_points      integer,
  total_monthly     bigint,
  exact_count       bigint,
  outcome_count     bigint,
  bonus_eligible    boolean,
  fixtures_missed   bigint
)
LANGUAGE sql
STABLE
AS $$
  WITH month_start AS (
    SELECT date_trunc('month', p_month)::timestamptz AS start_ts,
           (date_trunc('month', p_month) + interval '1 month')::timestamptz AS end_ts
  ),
  user_monthly_stats AS (
    SELECT
      sr.user_id,
      p.display_name,
      p.avatar_url,
      COALESCE(SUM(sr.points_awarded), 0) AS monthly_points,
      COUNT(*) FILTER (WHERE sr.reason_code IN ('EXACT_SCORE', 'STAR_EXACT')) AS exact_count,
      COUNT(*) FILTER (WHERE sr.reason_code IN ('OUTCOME', 'STAR_OUTCOME')) AS outcome_count
    FROM public.score_records sr
    JOIN public.fixtures f ON f.id = sr.fixture_id
    JOIN public.profiles p ON p.id = sr.user_id
    CROSS JOIN month_start ms
    WHERE f.season_id = p_season_id
      AND f.status = 'FINISHED'
      AND f.kickoff_time >= ms.start_ts
      AND f.kickoff_time < ms.end_ts
    GROUP BY sr.user_id, p.display_name, p.avatar_url
  )
  SELECT
    RANK() OVER (
      ORDER BY
        ums.monthly_points DESC,
        ums.exact_count DESC,
        ums.outcome_count DESC
    ) AS rank,
    ums.user_id,
    ums.display_name,
    ums.avatar_url,
    ums.monthly_points,
    0::integer AS bonus_points,
    ums.monthly_points AS total_monthly,
    ums.exact_count,
    ums.outcome_count,
    NULL::boolean AS bonus_eligible,
    0::bigint AS fixtures_missed
  FROM user_monthly_stats ums
  ORDER BY rank ASC, ums.display_name ASC;
$$;

COMMENT ON FUNCTION public.get_monthly_leaderboard IS
'Returns the monthly leaderboard for a given month. Monthly bonus feature has been removed.';
