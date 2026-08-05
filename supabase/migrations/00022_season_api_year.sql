-- Store the football-data.org season key alongside the display name.
-- The API uses the year a campaign starts: 2026 means the 2026/27 season.
ALTER TABLE public.seasons
  ADD COLUMN IF NOT EXISTS api_season integer;

-- Preserve existing data when upgrading an already-running installation.
-- All historical seasons created by this app have a start_date; the name
-- fallback supports older rows created before start_date was populated.
UPDATE public.seasons
SET api_season = COALESCE(
  NULLIF(substring(name FROM '(20[0-9]{2})'), '')::integer,
  EXTRACT(YEAR FROM start_date)::integer
)
WHERE api_season IS NULL;

ALTER TABLE public.seasons
  ALTER COLUMN api_season SET NOT NULL,
  ADD CONSTRAINT seasons_api_season_range
    CHECK (api_season BETWEEN 2000 AND 2100),
  ADD CONSTRAINT seasons_api_season_unique UNIQUE (api_season);

-- A season is first created and populated with fixtures while inactive. Only
-- after that succeeds do we switch the player-facing active season.
CREATE OR REPLACE FUNCTION public.activate_prepared_season(p_season_id uuid)
RETURNS public.seasons
LANGUAGE plpgsql
AS $$
DECLARE
  v_season public.seasons;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.seasons WHERE id = p_season_id) THEN
    RAISE EXCEPTION 'Season % does not exist', p_season_id;
  END IF;

  UPDATE public.seasons
  SET is_active = false
  WHERE is_active = true;

  UPDATE public.seasons
  SET is_active = true
  WHERE id = p_season_id
  RETURNING * INTO v_season;

  RETURN v_season;
END;
$$;

REVOKE ALL ON FUNCTION public.activate_prepared_season(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.activate_prepared_season(uuid) TO service_role;
