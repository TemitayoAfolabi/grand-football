-- ============================================================================
-- Grand Football — API-Football Provider Mapping
-- Migration: 00023_api_football_provider.sql
-- ============================================================================

-- Keep the legacy fixture ID intact so historical data and predictions remain
-- stable while API-Football becomes the live-score provider.
ALTER TABLE public.fixtures
  ADD COLUMN IF NOT EXISTS live_provider_fixture_id integer;

CREATE UNIQUE INDEX IF NOT EXISTS idx_fixtures_live_provider_fixture_id
  ON public.fixtures (live_provider_fixture_id)
  WHERE live_provider_fixture_id IS NOT NULL;

COMMENT ON COLUMN public.fixtures.live_provider_fixture_id IS
  'API-Football fixture ID used exclusively for live fixture and score syncs.';
