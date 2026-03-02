-- ============================================================================
-- Grand Football — Star Man Voting Feature
-- Migration: 00002_star_man_voting.sql
-- Created: 2026-02-27
-- Description: Star Man community voting tables, indexes, RLS, functions, triggers
-- ============================================================================

-- ============================================================================
-- 1. TABLES
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1.1 star_man_sessions — one voting session per season
-- ----------------------------------------------------------------------------
CREATE TABLE public.star_man_sessions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id   uuid NOT NULL REFERENCES public.seasons(id) ON DELETE CASCADE,
  status      text NOT NULL DEFAULT 'DRAFT'
                CHECK (status IN ('DRAFT', 'OPEN', 'CLOSED')),
  deadline    timestamptz NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT one_session_per_season UNIQUE (season_id)
);

CREATE INDEX idx_star_man_sessions_season ON public.star_man_sessions (season_id);
CREATE INDEX idx_star_man_sessions_status ON public.star_man_sessions (status);

COMMENT ON TABLE public.star_man_sessions IS 'Star Man voting sessions. One session per season.';

-- ----------------------------------------------------------------------------
-- 1.2 star_man_nominees — candidates for each session
-- ----------------------------------------------------------------------------
CREATE TABLE public.star_man_nominees (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  uuid NOT NULL REFERENCES public.star_man_sessions(id) ON DELETE CASCADE,
  player_name text NOT NULL CHECK (char_length(player_name) BETWEEN 1 AND 50),
  team_name   text NOT NULL CHECK (char_length(team_name) BETWEEN 1 AND 50),
  created_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT unique_player_per_session UNIQUE (session_id, player_name)
);

CREATE INDEX idx_star_man_nominees_session ON public.star_man_nominees (session_id);

COMMENT ON TABLE public.star_man_nominees IS 'Star Man nominee players for each voting session.';

-- ----------------------------------------------------------------------------
-- 1.3 star_man_votes — one vote per user per session
-- ----------------------------------------------------------------------------
CREATE TABLE public.star_man_votes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  uuid NOT NULL REFERENCES public.star_man_sessions(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  nominee_id  uuid NOT NULL REFERENCES public.star_man_nominees(id) ON DELETE CASCADE,
  voted_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT one_vote_per_user_per_session UNIQUE (session_id, user_id)
);

CREATE INDEX idx_star_man_votes_session ON public.star_man_votes (session_id);
CREATE INDEX idx_star_man_votes_nominee ON public.star_man_votes (nominee_id);
CREATE INDEX idx_star_man_votes_user ON public.star_man_votes (user_id);

COMMENT ON TABLE public.star_man_votes IS 'Star Man votes. One vote per user per session.';


-- ============================================================================
-- 2. HELPER FUNCTIONS
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 2.1 is_voting_open() — check if a session is still accepting votes
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_voting_open(p_session_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.star_man_sessions
    WHERE id = p_session_id
      AND status = 'OPEN'
      AND deadline > now()
  );
$$;

COMMENT ON FUNCTION public.is_voting_open IS 'Returns true if the Star Man voting session is OPEN and the deadline has not passed.';

-- ----------------------------------------------------------------------------
-- 2.2 get_star_man_results() — vote tallies for a session
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_star_man_results(p_session_id uuid)
RETURNS TABLE (
  nominee_id    uuid,
  player_name   text,
  team_name     text,
  vote_count    bigint,
  rank          bigint
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT
    n.id AS nominee_id,
    n.player_name,
    n.team_name,
    COUNT(v.id) AS vote_count,
    RANK() OVER (ORDER BY COUNT(v.id) DESC) AS rank
  FROM public.star_man_nominees n
  LEFT JOIN public.star_man_votes v ON v.nominee_id = n.id
  WHERE n.session_id = p_session_id
  GROUP BY n.id, n.player_name, n.team_name
  ORDER BY vote_count DESC, n.player_name ASC;
$$;

COMMENT ON FUNCTION public.get_star_man_results IS 'Returns vote tallies and rankings for a Star Man voting session.';


-- ============================================================================
-- 3. UPDATE admin_audit_log CHECK CONSTRAINT
-- ============================================================================

-- Drop existing constraint and re-create with new action types
ALTER TABLE public.admin_audit_log DROP CONSTRAINT IF EXISTS admin_audit_log_action_check;

ALTER TABLE public.admin_audit_log ADD CONSTRAINT admin_audit_log_action_check
  CHECK (action IN (
    'TOGGLE_STAR', 'OVERRIDE_RESULT', 'RECALCULATE',
    'ADD_USER', 'REMOVE_USER', 'NEW_SEASON',
    'CREATE_STAR_MAN_SESSION', 'ADD_STAR_MAN_NOMINEE', 'REMOVE_STAR_MAN_NOMINEE',
    'OPEN_STAR_MAN_VOTING', 'CLOSE_STAR_MAN_VOTING'
  ));


-- ============================================================================
-- 4. ROW-LEVEL SECURITY (RLS)
-- ============================================================================

ALTER TABLE public.star_man_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.star_man_nominees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.star_man_votes ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- 4.1 star_man_sessions
-- ----------------------------------------------------------------------------
CREATE POLICY "star_man_sessions_select_all"
  ON public.star_man_sessions FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "star_man_sessions_insert_admin"
  ON public.star_man_sessions FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "star_man_sessions_update_admin"
  ON public.star_man_sessions FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ----------------------------------------------------------------------------
-- 4.2 star_man_nominees
-- ----------------------------------------------------------------------------
CREATE POLICY "star_man_nominees_select_all"
  ON public.star_man_nominees FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "star_man_nominees_insert_admin"
  ON public.star_man_nominees FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "star_man_nominees_delete_admin"
  ON public.star_man_nominees FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- ----------------------------------------------------------------------------
-- 4.3 star_man_votes
-- ----------------------------------------------------------------------------
CREATE POLICY "star_man_votes_select_own_or_admin"
  ON public.star_man_votes FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR public.is_admin());

CREATE POLICY "star_man_votes_insert_own"
  ON public.star_man_votes FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND public.is_voting_open(session_id)
  );

CREATE POLICY "star_man_votes_update_own"
  ON public.star_man_votes FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id AND public.is_voting_open(session_id))
  WITH CHECK (auth.uid() = user_id AND public.is_voting_open(session_id));


-- ============================================================================
-- 5. TRIGGERS
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 5.1 Auto-close voting when deadline passes (on session read)
-- This is handled application-side. If needed, a cron can also close.
-- Instead, we add an updated_at trigger for sessions.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Only create the trigger if it doesn't already exist on other tables
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_star_man_sessions_updated_at'
  ) THEN
    CREATE TRIGGER trg_star_man_sessions_updated_at
      BEFORE UPDATE ON public.star_man_sessions
      FOR EACH ROW
      EXECUTE FUNCTION public.set_updated_at();
  END IF;
END;
$$;
