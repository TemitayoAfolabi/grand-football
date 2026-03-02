-- ============================================================================
-- Grand Football — Live Scores & Live Leaderboard
-- Migration: 00010_live_scores.sql
-- Created: 2026-03-01
-- Description: Add live score columns to fixtures, sync_log table,
--              updated RLS policies for prediction visibility post-kickoff,
--              Supabase Realtime enablement, and safety-net triggers.
-- ============================================================================


-- ============================================================================
-- 1. NEW COLUMNS ON fixtures
-- ============================================================================

ALTER TABLE public.fixtures
  ADD COLUMN IF NOT EXISTS live_home_score smallint
    CHECK (live_home_score IS NULL OR (live_home_score >= 0 AND live_home_score <= 99)),
  ADD COLUMN IF NOT EXISTS live_away_score smallint
    CHECK (live_away_score IS NULL OR (live_away_score >= 0 AND live_away_score <= 99)),
  ADD COLUMN IF NOT EXISTS match_minute smallint
    CHECK (match_minute IS NULL OR (match_minute >= 0 AND match_minute <= 200));

COMMENT ON COLUMN public.fixtures.live_home_score IS
  'Transient in-play home score. Non-null only during IN_PLAY/PAUSED. Cleared on FINISHED.';
COMMENT ON COLUMN public.fixtures.live_away_score IS
  'Transient in-play away score. Non-null only during IN_PLAY/PAUSED. Cleared on FINISHED.';
COMMENT ON COLUMN public.fixtures.match_minute IS
  'Current match minute during live play. NULL when not live or unavailable from API.';


-- ============================================================================
-- 2. NEW INDEXES
-- ============================================================================

-- Fast lookup: "are any matches currently live?"
CREATE INDEX IF NOT EXISTS idx_fixtures_live_active
  ON public.fixtures (status)
  WHERE status IN ('IN_PLAY', 'PAUSED', 'SUSPENDED');

-- Fast lookup: date-range queries on kickoff_time
CREATE INDEX IF NOT EXISTS idx_fixtures_kickoff_time
  ON public.fixtures (kickoff_time);

-- Compound index for predictions post-kickoff query
CREATE INDEX IF NOT EXISTS idx_predictions_fixture_user
  ON public.predictions (fixture_id, user_id);


-- ============================================================================
-- 3. sync_log TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.sync_log (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ran_at            timestamptz NOT NULL DEFAULT now(),
  mode              text NOT NULL
                      CHECK (mode IN ('live', 'match_day', 'full', 'skipped')),
  status            text NOT NULL
                      CHECK (status IN ('success', 'error')),
  fixtures_updated  integer NOT NULL DEFAULT 0,
  scores_calculated integer NOT NULL DEFAULT 0,
  api_calls_made    integer NOT NULL DEFAULT 0,
  error_message     text,
  duration_ms       integer NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sync_log_ran_at ON public.sync_log (ran_at DESC);

COMMENT ON TABLE public.sync_log IS
  'Audit log for every sync-fixtures cron invocation. Used by admin health dashboard.';

-- RLS: only admins can read sync_log
ALTER TABLE public.sync_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sync_log_select_admin"
  ON public.sync_log FOR SELECT
  TO authenticated
  USING (public.is_admin());

-- INSERT via service role only (cron jobs bypass RLS).


-- ============================================================================
-- 4. HELPER FUNCTION: is_fixture_kicked_off
-- ============================================================================

CREATE OR REPLACE FUNCTION public.is_fixture_kicked_off(p_fixture_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.fixtures
    WHERE id = p_fixture_id
    AND kickoff_time <= now()
  );
$$;

COMMENT ON FUNCTION public.is_fixture_kicked_off IS
  'Returns true if the fixture has kicked off (kickoff_time <= NOW). Used by RLS for post-kickoff prediction visibility.';


-- ============================================================================
-- 5. UPDATED RLS POLICIES FOR PREDICTIONS
-- ============================================================================

-- Drop the existing select policy
DROP POLICY IF EXISTS "predictions_select_own" ON public.predictions;

-- New policy: see own predictions always, OR any prediction for kicked-off
-- fixtures, OR admin sees all.
CREATE POLICY "predictions_select_own_or_kicked_off"
  ON public.predictions FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id
    OR public.is_admin()
    OR public.is_fixture_kicked_off(fixture_id)
  );


-- ============================================================================
-- 6. ENABLE SUPABASE REALTIME ON fixtures TABLE
-- ============================================================================

ALTER PUBLICATION supabase_realtime ADD TABLE public.fixtures;

-- Required for Realtime DELETE events to include the full old row
ALTER TABLE public.fixtures REPLICA IDENTITY FULL;


-- ============================================================================
-- 7. SAFETY-NET TRIGGER: clear live columns on FINISHED
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_fixture_finished()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'FINISHED' AND OLD.status <> 'FINISHED' THEN
    NEW.live_home_score := NULL;
    NEW.live_away_score := NULL;
    NEW.match_minute := NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_fixture_finished
  BEFORE UPDATE ON public.fixtures
  FOR EACH ROW
  WHEN (NEW.status = 'FINISHED' AND OLD.status IS DISTINCT FROM 'FINISHED')
  EXECUTE FUNCTION public.handle_fixture_finished();

COMMENT ON FUNCTION public.handle_fixture_finished IS
  'Safety-net trigger: clears live score columns when a fixture transitions to FINISHED.';


-- ============================================================================
-- 8. AUTO-PRUNE sync_log (keep last 30 days)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.prune_sync_log()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_deleted integer;
BEGIN
  DELETE FROM public.sync_log
  WHERE ran_at < now() - interval '30 days';
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

COMMENT ON FUNCTION public.prune_sync_log IS
  'Deletes sync_log entries older than 30 days. Call from a monthly cron.';
