-- ============================================================================
-- Grand Football — Star Game Voting Feature
-- Migration: 00003_star_game_voting.sql
-- Created: 2026-02-27
-- Description: Star Game community voting tables, indexes, RLS, functions, triggers
-- ============================================================================

-- ============================================================================
-- 1. TABLES
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1.1 star_game_vote_sessions — one voting session per season per gameweek
-- ----------------------------------------------------------------------------
CREATE TABLE public.star_game_vote_sessions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id        uuid NOT NULL REFERENCES public.seasons(id) ON DELETE CASCADE,
  gameweek         integer NOT NULL CHECK (gameweek >= 1 AND gameweek <= 50),
  status           text NOT NULL DEFAULT 'DRAFT'
                     CHECK (status IN ('DRAFT', 'OPEN', 'CLOSED')),
  resolution_mode  text DEFAULT NULL
                     CHECK (resolution_mode IS NULL OR resolution_mode IN ('COMMUNITY_VOTE', 'ADMIN_PICK', 'ADMIN_OVERRIDE', 'AUTO_ALL', 'NO_VOTES')),
  deadline         timestamptz NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT one_session_per_season_gameweek UNIQUE (season_id, gameweek)
);

CREATE INDEX idx_star_game_vote_sessions_season ON public.star_game_vote_sessions (season_id);
CREATE INDEX idx_star_game_vote_sessions_status ON public.star_game_vote_sessions (status);
CREATE INDEX idx_star_game_vote_sessions_deadline ON public.star_game_vote_sessions (deadline);

COMMENT ON TABLE public.star_game_vote_sessions IS 'Star Game voting sessions. One session per season per gameweek.';

-- ----------------------------------------------------------------------------
-- 1.2 star_game_votes — up to 2 votes per user per session
-- ----------------------------------------------------------------------------
CREATE TABLE public.star_game_votes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  uuid NOT NULL REFERENCES public.star_game_vote_sessions(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  fixture_id  uuid NOT NULL REFERENCES public.fixtures(id) ON DELETE CASCADE,
  voted_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT unique_vote_per_user_per_fixture UNIQUE (session_id, user_id, fixture_id)
);

CREATE INDEX idx_star_game_votes_session ON public.star_game_votes (session_id);
CREATE INDEX idx_star_game_votes_user ON public.star_game_votes (user_id);
CREATE INDEX idx_star_game_votes_fixture ON public.star_game_votes (fixture_id);

COMMENT ON TABLE public.star_game_votes IS 'Star Game votes. Up to 2 votes per user per session.';


-- ============================================================================
-- 2. TRIGGER: enforce max 2 votes per user per session
-- ============================================================================

CREATE OR REPLACE FUNCTION public.enforce_star_game_max_votes()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  vote_count integer;
BEGIN
  SELECT COUNT(*) INTO vote_count
  FROM public.star_game_votes
  WHERE session_id = NEW.session_id
    AND user_id = NEW.user_id;

  IF vote_count >= 2 THEN
    RAISE EXCEPTION 'Maximum 2 star game votes per user per gameweek'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_enforce_star_game_max_votes
  BEFORE INSERT ON public.star_game_votes
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_star_game_max_votes();


-- ============================================================================
-- 3. HELPER FUNCTIONS
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 3.1 is_star_game_voting_open() — check if a session is accepting votes
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_star_game_voting_open(p_session_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.star_game_vote_sessions
    WHERE id = p_session_id
      AND status = 'OPEN'
      AND deadline > now()
  );
$$;

COMMENT ON FUNCTION public.is_star_game_voting_open IS 'Returns true if the Star Game voting session is OPEN and the deadline has not passed.';

-- ----------------------------------------------------------------------------
-- 3.2 get_star_game_vote_results() — vote tallies for a session
-- Tie-break: earliest kickoff, then earliest fixture created_at
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_star_game_vote_results(p_session_id uuid)
RETURNS TABLE (
  fixture_id      uuid,
  home_team       text,
  away_team       text,
  home_team_crest text,
  away_team_crest text,
  kickoff_time    timestamptz,
  vote_count      bigint,
  rank            bigint
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  WITH session_info AS (
    SELECT s.season_id, s.gameweek
    FROM public.star_game_vote_sessions s
    WHERE s.id = p_session_id
  )
  SELECT
    f.id AS fixture_id,
    f.home_team,
    f.away_team,
    f.home_team_crest,
    f.away_team_crest,
    f.kickoff_time,
    COUNT(v.id) AS vote_count,
    ROW_NUMBER() OVER (
      ORDER BY COUNT(v.id) DESC, f.kickoff_time ASC, f.created_at ASC
    ) AS rank
  FROM public.fixtures f
  CROSS JOIN session_info si
  LEFT JOIN public.star_game_votes v ON v.fixture_id = f.id AND v.session_id = p_session_id
  WHERE f.season_id = si.season_id
    AND f.gameweek = si.gameweek
    AND f.status NOT IN ('POSTPONED', 'CANCELLED')
  GROUP BY f.id, f.home_team, f.away_team, f.home_team_crest, f.away_team_crest, f.kickoff_time, f.created_at
  ORDER BY vote_count DESC, f.kickoff_time ASC, f.created_at ASC;
$$;

COMMENT ON FUNCTION public.get_star_game_vote_results IS 'Returns vote tallies and rankings for a Star Game voting session. Tie-break by earliest kickoff then created_at.';


-- ============================================================================
-- 4. UPDATE admin_audit_log CHECK CONSTRAINT
-- ============================================================================

ALTER TABLE public.admin_audit_log DROP CONSTRAINT IF EXISTS admin_audit_log_action_check;

ALTER TABLE public.admin_audit_log ADD CONSTRAINT admin_audit_log_action_check
  CHECK (action IN (
    'TOGGLE_STAR', 'OVERRIDE_RESULT', 'RECALCULATE',
    'ADD_USER', 'REMOVE_USER', 'NEW_SEASON',
    'CREATE_STAR_MAN_SESSION', 'ADD_STAR_MAN_NOMINEE', 'REMOVE_STAR_MAN_NOMINEE',
    'OPEN_STAR_MAN_VOTING', 'CLOSE_STAR_MAN_VOTING',
    'CREATE_STAR_GAME_VOTE_SESSION', 'OPEN_STAR_GAME_VOTING', 'CLOSE_STAR_GAME_VOTING',
    'APPLY_STAR_GAME_RESULTS', 'OVERRIDE_STAR_GAMES', 'MANUAL_STAR_GAME_PICK',
    'DELETE_STAR_GAME_VOTE_SESSION', 'AUTO_CLOSE_STAR_GAME_VOTING'
  ));


-- ============================================================================
-- 5. ROW-LEVEL SECURITY (RLS)
-- ============================================================================

ALTER TABLE public.star_game_vote_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.star_game_votes ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- 5.1 star_game_vote_sessions
-- ----------------------------------------------------------------------------
CREATE POLICY "star_game_vote_sessions_select_all"
  ON public.star_game_vote_sessions FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "star_game_vote_sessions_insert_admin"
  ON public.star_game_vote_sessions FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "star_game_vote_sessions_update_admin"
  ON public.star_game_vote_sessions FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "star_game_vote_sessions_delete_admin"
  ON public.star_game_vote_sessions FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- ----------------------------------------------------------------------------
-- 5.2 star_game_votes
-- ----------------------------------------------------------------------------
CREATE POLICY "star_game_votes_select_all"
  ON public.star_game_votes FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "star_game_votes_insert_own"
  ON public.star_game_votes FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND public.is_star_game_voting_open(session_id)
  );

CREATE POLICY "star_game_votes_delete_own"
  ON public.star_game_votes FOR DELETE
  TO authenticated
  USING (
    auth.uid() = user_id
    AND public.is_star_game_voting_open(session_id)
  );


-- ============================================================================
-- 6. TRIGGERS
-- ============================================================================

-- updated_at trigger for star_game_vote_sessions
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_star_game_vote_sessions_updated_at'
  ) THEN
    CREATE TRIGGER trg_star_game_vote_sessions_updated_at
      BEFORE UPDATE ON public.star_game_vote_sessions
      FOR EACH ROW
      EXECUTE FUNCTION public.set_updated_at();
  END IF;
END;
$$;
