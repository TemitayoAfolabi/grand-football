-- Grand Football — resolve Golden Boot scorer picks from API-Football events.

ALTER TABLE public.scorer_picks
  ADD COLUMN IF NOT EXISTS actual_first_scorer text,
  ADD COLUMN IF NOT EXISTS is_correct boolean,
  ADD COLUMN IF NOT EXISTS points_awarded smallint NOT NULL DEFAULT 0
    CHECK (points_awarded BETWEEN 0 AND 1),
  ADD COLUMN IF NOT EXISTS provider_fixture_id integer,
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_scorer_picks_unresolved
  ON public.scorer_picks (fixture_id)
  WHERE resolved_at IS NULL;

COMMENT ON COLUMN public.scorer_picks.actual_first_scorer IS
  'First goalscorer returned by API-Football, or NULL when a completed match had no goals.';
COMMENT ON COLUMN public.scorer_picks.is_correct IS
  'Whether the submitted scorer pick matches the first goalscorer.';
COMMENT ON COLUMN public.scorer_picks.points_awarded IS
  'Golden Boot side-quest points. Separate from the main prediction leaderboard.';
COMMENT ON COLUMN public.scorer_picks.provider_fixture_id IS
  'API-Football fixture ID used to resolve scorer events.';
