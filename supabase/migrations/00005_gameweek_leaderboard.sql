-- ----------------------------------------------------------------------------
-- 5.3 get_gameweek_leaderboard — weekly (gameweek) leaderboard
-- Tie-breaking: most exact → most outcomes
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_gameweek_leaderboard(
  p_season_id uuid,
  p_gameweek  integer
)
RETURNS TABLE (
  rank            bigint,
  user_id         uuid,
  display_name    text,
  avatar_url      text,
  gameweek_points bigint,
  exact_count     bigint,
  outcome_count   bigint
)
LANGUAGE sql
STABLE
AS $$
  WITH user_stats AS (
    SELECT
      sr.user_id,
      p.display_name,
      p.avatar_url,
      COALESCE(SUM(sr.points_awarded), 0) AS gameweek_points,
      COUNT(*) FILTER (WHERE sr.reason_code IN ('EXACT_SCORE', 'STAR_EXACT')) AS exact_count,
      COUNT(*) FILTER (WHERE sr.reason_code IN ('OUTCOME', 'STAR_OUTCOME')) AS outcome_count
    FROM public.score_records sr
    JOIN public.fixtures f ON f.id = sr.fixture_id
    JOIN public.profiles p ON p.id = sr.user_id
    WHERE f.season_id = p_season_id
      AND f.gameweek = p_gameweek
      AND f.status = 'FINISHED'
    GROUP BY sr.user_id, p.display_name, p.avatar_url
  )
  SELECT
    RANK() OVER (
      ORDER BY
        us.gameweek_points DESC,
        us.exact_count DESC,
        us.outcome_count DESC
    ) AS rank,
    us.user_id,
    us.display_name,
    us.avatar_url,
    us.gameweek_points,
    us.exact_count,
    us.outcome_count
  FROM user_stats us
  ORDER BY rank ASC, us.display_name ASC;
$$;

COMMENT ON FUNCTION public.get_gameweek_leaderboard IS
'Returns the gameweek leaderboard ranked by points with tie-breaking: exact scores → correct outcomes.';
