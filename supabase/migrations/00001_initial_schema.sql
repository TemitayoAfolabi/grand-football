-- ============================================================================
-- Grand Football — Initial Database Schema
-- Migration: 00001_initial_schema.sql
-- Created: 2026-02-27
-- Description: Complete schema with tables, indexes, RLS, functions, triggers
-- ============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- 1. TABLES
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1.1 profiles — extends auth.users
-- ----------------------------------------------------------------------------
CREATE TABLE public.profiles (
  id          uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text NOT NULL DEFAULT '' CHECK (char_length(display_name) BETWEEN 0 AND 20),
  is_admin    boolean NOT NULL DEFAULT false,
  avatar_url  text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.profiles IS 'User profiles extending Supabase auth.users. One row per user.';

-- ----------------------------------------------------------------------------
-- 1.2 allowlist — approved emails for invite-only access
-- ----------------------------------------------------------------------------
CREATE TABLE public.allowlist (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email      text NOT NULL UNIQUE,
  added_by   uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT allowlist_email_lowercase CHECK (email = lower(email))
);

CREATE INDEX idx_allowlist_email_lower ON public.allowlist (lower(email));

COMMENT ON TABLE public.allowlist IS 'Invite-only email allowlist. Only emails here can sign in.';

-- ----------------------------------------------------------------------------
-- 1.3 seasons — PL season records
-- ----------------------------------------------------------------------------
CREATE TABLE public.seasons (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL UNIQUE,
  is_active  boolean NOT NULL DEFAULT false,
  start_date date,
  end_date   date,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enforce at most one active season
CREATE UNIQUE INDEX idx_seasons_single_active ON public.seasons (is_active) WHERE is_active = true;

COMMENT ON TABLE public.seasons IS 'Premier League seasons. Only one can be active at a time.';

-- ----------------------------------------------------------------------------
-- 1.4 fixtures — PL fixtures synced from football-data.org
-- ----------------------------------------------------------------------------
CREATE TABLE public.fixtures (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id           uuid NOT NULL REFERENCES public.seasons(id),
  api_fixture_id      integer NOT NULL UNIQUE,
  home_team           text NOT NULL,
  away_team           text NOT NULL,
  home_team_crest     text,
  away_team_crest     text,
  kickoff_time        timestamptz NOT NULL,
  status              text NOT NULL DEFAULT 'SCHEDULED'
                        CHECK (status IN (
                          'SCHEDULED', 'TIMED', 'IN_PLAY', 'PAUSED',
                          'FINISHED', 'POSTPONED', 'CANCELLED', 'SUSPENDED'
                        )),
  home_score          integer CHECK (home_score IS NULL OR (home_score >= 0 AND home_score <= 99)),
  away_score          integer CHECK (away_score IS NULL OR (away_score >= 0 AND away_score <= 99)),
  gameweek            integer NOT NULL CHECK (gameweek >= 1 AND gameweek <= 50),
  is_star_game        boolean NOT NULL DEFAULT false,
  manually_overridden boolean NOT NULL DEFAULT false,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_fixtures_season_gameweek ON public.fixtures (season_id, gameweek);
CREATE INDEX idx_fixtures_season_status ON public.fixtures (season_id, status);
CREATE INDEX idx_fixtures_kickoff ON public.fixtures (kickoff_time);
CREATE INDEX idx_fixtures_finished ON public.fixtures (id) WHERE status = 'FINISHED';

COMMENT ON TABLE public.fixtures IS 'Premier League fixtures synced from football-data.org API.';

-- ----------------------------------------------------------------------------
-- 1.5 predictions — user score predictions
-- ----------------------------------------------------------------------------
CREATE TABLE public.predictions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  fixture_id   uuid NOT NULL REFERENCES public.fixtures(id) ON DELETE CASCADE,
  home_score   integer NOT NULL CHECK (home_score >= 0 AND home_score <= 99),
  away_score   integer NOT NULL CHECK (away_score >= 0 AND away_score <= 99),
  submitted_at timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),

  UNIQUE (user_id, fixture_id)
);

CREATE INDEX idx_predictions_fixture ON public.predictions (fixture_id);
CREATE INDEX idx_predictions_user ON public.predictions (user_id);

COMMENT ON TABLE public.predictions IS 'User score predictions. One per user per fixture. Locked at kickoff.';

-- ----------------------------------------------------------------------------
-- 1.6 score_records — scoring engine output
-- ----------------------------------------------------------------------------
CREATE TABLE public.score_records (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  fixture_id      uuid NOT NULL REFERENCES public.fixtures(id) ON DELETE CASCADE,
  predicted_home  integer,
  predicted_away  integer,
  actual_home     integer NOT NULL,
  actual_away     integer NOT NULL,
  is_star_game    boolean NOT NULL DEFAULT false,
  points_awarded  integer NOT NULL DEFAULT 0,
  reason_code     text NOT NULL
                    CHECK (reason_code IN (
                      'EXACT_SCORE', 'OUTCOME', 'BTTS_REVERSE', 'WRONG',
                      'STAR_EXACT', 'STAR_OUTCOME', 'STAR_BTTS_REVERSE', 'STAR_WRONG',
                      'NO_PREDICTION'
                    )),
  calculated_at   timestamptz NOT NULL DEFAULT now(),

  UNIQUE (user_id, fixture_id)
);

CREATE INDEX idx_score_records_fixture ON public.score_records (fixture_id);
CREATE INDEX idx_score_records_user ON public.score_records (user_id);
CREATE INDEX idx_score_records_reason ON public.score_records (reason_code);

COMMENT ON TABLE public.score_records IS 'Scoring engine output. One per user per fixture. Idempotent upserts.';

-- ----------------------------------------------------------------------------
-- 1.7 monthly_bonuses — monthly bonus records
-- ----------------------------------------------------------------------------
CREATE TABLE public.monthly_bonuses (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  season_id         uuid NOT NULL REFERENCES public.seasons(id),
  month             date NOT NULL,
  eligible          boolean NOT NULL,
  bonus_points      integer NOT NULL DEFAULT 0,
  fixtures_total    integer NOT NULL,
  predictions_total integer NOT NULL,
  calculated_at     timestamptz NOT NULL DEFAULT now(),

  UNIQUE (user_id, season_id, month)
);

CREATE INDEX idx_monthly_bonuses_season_month ON public.monthly_bonuses (season_id, month);

COMMENT ON TABLE public.monthly_bonuses IS 'Monthly bonus eligibility and award records.';

-- ----------------------------------------------------------------------------
-- 1.8 prediction_history — audit trail for prediction edits
-- ----------------------------------------------------------------------------
CREATE TABLE public.prediction_history (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prediction_id uuid NOT NULL REFERENCES public.predictions(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  fixture_id    uuid NOT NULL REFERENCES public.fixtures(id) ON DELETE CASCADE,
  home_score    integer NOT NULL,
  away_score    integer NOT NULL,
  changed_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_prediction_history_prediction ON public.prediction_history (prediction_id);
CREATE INDEX idx_prediction_history_user_fixture ON public.prediction_history (user_id, fixture_id);

COMMENT ON TABLE public.prediction_history IS 'Immutable audit trail of prediction edits.';

-- ----------------------------------------------------------------------------
-- 1.9 admin_audit_log — admin action audit trail
-- ----------------------------------------------------------------------------
CREATE TABLE public.admin_audit_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id    uuid NOT NULL REFERENCES public.profiles(id),
  action      text NOT NULL
                CHECK (action IN (
                  'TOGGLE_STAR', 'OVERRIDE_RESULT', 'RECALCULATE',
                  'ADD_USER', 'REMOVE_USER', 'NEW_SEASON'
                )),
  target_type text NOT NULL,
  target_id   uuid,
  old_value   jsonb,
  new_value   jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_log_admin ON public.admin_audit_log (admin_id);
CREATE INDEX idx_audit_log_action ON public.admin_audit_log (action);
CREATE INDEX idx_audit_log_created ON public.admin_audit_log (created_at DESC);

COMMENT ON TABLE public.admin_audit_log IS 'Immutable log of all admin actions.';


-- ============================================================================
-- 2. HELPER FUNCTIONS
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 2.1 is_admin() — check if current user is admin
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND is_admin = true
  );
$$;

COMMENT ON FUNCTION public.is_admin IS 'Returns true if the authenticated user is an admin.';

-- ----------------------------------------------------------------------------
-- 2.2 is_fixture_open() — check if predictions are still accepted
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_fixture_open(p_fixture_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.fixtures
    WHERE id = p_fixture_id AND kickoff_time > now()
  );
$$;

COMMENT ON FUNCTION public.is_fixture_open IS 'Returns true if the fixture has not yet kicked off (predictions still open).';


-- ============================================================================
-- 3. ROW-LEVEL SECURITY (RLS)
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.allowlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fixtures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.predictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.score_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monthly_bonuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prediction_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- 3.1 profiles
-- ----------------------------------------------------------------------------
CREATE POLICY "profiles_select_all"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "profiles_insert_own"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

CREATE POLICY "profiles_update_own"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- ----------------------------------------------------------------------------
-- 3.2 allowlist
-- ----------------------------------------------------------------------------
CREATE POLICY "allowlist_select_admin"
  ON public.allowlist FOR SELECT
  TO authenticated
  USING (public.is_admin());

CREATE POLICY "allowlist_insert_admin"
  ON public.allowlist FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "allowlist_delete_admin"
  ON public.allowlist FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- Also allow the allowlist to be checked during auth flow (service role handles this)
-- The Supabase service role bypasses RLS by default.

-- ----------------------------------------------------------------------------
-- 3.3 seasons
-- ----------------------------------------------------------------------------
CREATE POLICY "seasons_select_all"
  ON public.seasons FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "seasons_insert_admin"
  ON public.seasons FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "seasons_update_admin"
  ON public.seasons FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ----------------------------------------------------------------------------
-- 3.4 fixtures
-- ----------------------------------------------------------------------------
CREATE POLICY "fixtures_select_all"
  ON public.fixtures FOR SELECT
  TO authenticated
  USING (true);

-- Fixtures are inserted/updated by cron jobs using the service role,
-- which bypasses RLS. No authenticated user INSERT/UPDATE policies needed.

-- ----------------------------------------------------------------------------
-- 3.5 predictions
-- ----------------------------------------------------------------------------
CREATE POLICY "predictions_select_own"
  ON public.predictions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR public.is_admin());

CREATE POLICY "predictions_insert_own"
  ON public.predictions FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND public.is_fixture_open(fixture_id)
  );

CREATE POLICY "predictions_update_own"
  ON public.predictions FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id AND public.is_fixture_open(fixture_id))
  WITH CHECK (auth.uid() = user_id AND public.is_fixture_open(fixture_id));

-- ----------------------------------------------------------------------------
-- 3.6 score_records
-- ----------------------------------------------------------------------------
CREATE POLICY "score_records_select_own"
  ON public.score_records FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR public.is_admin());

-- INSERT/UPDATE only via service role (scoring engine)

-- ----------------------------------------------------------------------------
-- 3.7 monthly_bonuses
-- ----------------------------------------------------------------------------
CREATE POLICY "monthly_bonuses_select_all"
  ON public.monthly_bonuses FOR SELECT
  TO authenticated
  USING (true);

-- INSERT/UPDATE only via service role

-- ----------------------------------------------------------------------------
-- 3.8 prediction_history
-- ----------------------------------------------------------------------------
CREATE POLICY "prediction_history_select_own"
  ON public.prediction_history FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR public.is_admin());

CREATE POLICY "prediction_history_insert_own"
  ON public.prediction_history FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- 3.9 admin_audit_log
-- ----------------------------------------------------------------------------
CREATE POLICY "audit_log_select_admin"
  ON public.admin_audit_log FOR SELECT
  TO authenticated
  USING (public.is_admin());

CREATE POLICY "audit_log_insert_admin"
  ON public.admin_audit_log FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());


-- ============================================================================
-- 4. SCORING ENGINE (PL/pgSQL)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 4.1 calculate_fixture_scores — core scoring function
-- Deterministic, idempotent, auditable.
-- Called by cron job or admin recalculate action.
-- Uses service role (bypasses RLS).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.calculate_fixture_scores(p_fixture_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_fixture   public.fixtures%ROWTYPE;
  v_pred      RECORD;
  v_points    integer;
  v_reason    text;
  v_count     integer := 0;
  v_pred_outcome text;
  v_actual_outcome text;
BEGIN
  -- 1. Fetch the fixture
  SELECT * INTO v_fixture
  FROM public.fixtures
  WHERE id = p_fixture_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fixture % not found', p_fixture_id;
  END IF;

  -- 2. Only score FINISHED fixtures
  IF v_fixture.status <> 'FINISHED' THEN
    RAISE EXCEPTION 'Fixture % is not FINISHED (status: %)', p_fixture_id, v_fixture.status;
  END IF;

  -- 3. Ensure actual scores are present
  IF v_fixture.home_score IS NULL OR v_fixture.away_score IS NULL THEN
    RAISE EXCEPTION 'Fixture % has NULL scores', p_fixture_id;
  END IF;

  -- 4. Determine actual outcome
  v_actual_outcome := CASE
    WHEN v_fixture.home_score > v_fixture.away_score THEN 'HOME_WIN'
    WHEN v_fixture.home_score < v_fixture.away_score THEN 'AWAY_WIN'
    ELSE 'DRAW'
  END;

  -- 5. Process each user who submitted a prediction
  FOR v_pred IN
    SELECT p.user_id, p.home_score AS pred_home, p.away_score AS pred_away
    FROM public.predictions p
    WHERE p.fixture_id = p_fixture_id
  LOOP
    -- Determine predicted outcome
    v_pred_outcome := CASE
      WHEN v_pred.pred_home > v_pred.pred_away THEN 'HOME_WIN'
      WHEN v_pred.pred_home < v_pred.pred_away THEN 'AWAY_WIN'
      ELSE 'DRAW'
    END;

    -- Apply scoring rules
    IF v_pred.pred_home = v_fixture.home_score
       AND v_pred.pred_away = v_fixture.away_score THEN
      -- EXACT SCORE
      IF v_fixture.is_star_game THEN
        v_points := 10;
        v_reason := 'STAR_EXACT';
      ELSE
        v_points := 5;
        v_reason := 'EXACT_SCORE';
      END IF;

    ELSIF v_pred_outcome = v_actual_outcome THEN
      -- CORRECT OUTCOME (but not exact)
      IF v_fixture.is_star_game THEN
        v_points := 3;
        v_reason := 'STAR_OUTCOME';
      ELSE
        v_points := 3;
        v_reason := 'OUTCOME';
      END IF;

    ELSIF v_pred_outcome <> v_actual_outcome
          AND v_pred.pred_home > 0
          AND v_pred.pred_away > 0
          AND v_fixture.home_score > 0
          AND v_fixture.away_score > 0 THEN
      -- BTTS REVERSE: wrong outcome but all four scores > 0
      IF v_fixture.is_star_game THEN
        v_points := 1;
        v_reason := 'STAR_BTTS_REVERSE';
      ELSE
        v_points := 1;
        v_reason := 'BTTS_REVERSE';
      END IF;

    ELSE
      -- WRONG
      IF v_fixture.is_star_game THEN
        v_points := 0;
        v_reason := 'STAR_WRONG';
      ELSE
        v_points := 0;
        v_reason := 'WRONG';
      END IF;
    END IF;

    -- Upsert score_record (idempotent)
    INSERT INTO public.score_records (
      user_id, fixture_id, predicted_home, predicted_away,
      actual_home, actual_away, is_star_game, points_awarded,
      reason_code, calculated_at
    ) VALUES (
      v_pred.user_id, p_fixture_id, v_pred.pred_home, v_pred.pred_away,
      v_fixture.home_score, v_fixture.away_score, v_fixture.is_star_game,
      v_points, v_reason, now()
    )
    ON CONFLICT (user_id, fixture_id) DO UPDATE SET
      predicted_home  = EXCLUDED.predicted_home,
      predicted_away  = EXCLUDED.predicted_away,
      actual_home     = EXCLUDED.actual_home,
      actual_away     = EXCLUDED.actual_away,
      is_star_game    = EXCLUDED.is_star_game,
      points_awarded  = EXCLUDED.points_awarded,
      reason_code     = EXCLUDED.reason_code,
      calculated_at   = EXCLUDED.calculated_at;

    v_count := v_count + 1;
  END LOOP;

  -- 6. Create NO_PREDICTION records for users who didn't predict
  INSERT INTO public.score_records (
    user_id, fixture_id, predicted_home, predicted_away,
    actual_home, actual_away, is_star_game, points_awarded,
    reason_code, calculated_at
  )
  SELECT
    p.id,
    p_fixture_id,
    NULL,
    NULL,
    v_fixture.home_score,
    v_fixture.away_score,
    v_fixture.is_star_game,
    0,
    'NO_PREDICTION',
    now()
  FROM public.profiles p
  WHERE NOT EXISTS (
    SELECT 1 FROM public.predictions pred
    WHERE pred.user_id = p.id AND pred.fixture_id = p_fixture_id
  )
  ON CONFLICT (user_id, fixture_id) DO UPDATE SET
    predicted_home  = NULL,
    predicted_away  = NULL,
    actual_home     = EXCLUDED.actual_home,
    actual_away     = EXCLUDED.actual_away,
    is_star_game    = EXCLUDED.is_star_game,
    points_awarded  = 0,
    reason_code     = 'NO_PREDICTION',
    calculated_at   = EXCLUDED.calculated_at;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.calculate_fixture_scores IS
'Core scoring engine. Calculates and upserts score_records for all users for a given finished fixture. Idempotent.';


-- ============================================================================
-- 5. LEADERBOARD FUNCTIONS
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 5.1 get_season_leaderboard — ranked leaderboard with tie-breaking
-- Tie-breaking: most exact → most outcomes → fewest zero-point matches
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
  ),
  -- Include monthly bonuses in the total
  bonus_totals AS (
    SELECT
      mb.user_id,
      COALESCE(SUM(mb.bonus_points), 0) AS bonus_total
    FROM public.monthly_bonuses mb
    WHERE mb.season_id = p_season_id
    GROUP BY mb.user_id
  ),
  combined AS (
    SELECT
      us.user_id,
      us.display_name,
      us.avatar_url,
      us.total_points + COALESCE(bt.bonus_total, 0) AS total_points,
      us.exact_count,
      us.outcome_count,
      us.zero_count
    FROM user_stats us
    LEFT JOIN bonus_totals bt ON bt.user_id = us.user_id
  )
  SELECT
    RANK() OVER (
      ORDER BY
        c.total_points DESC,
        c.exact_count DESC,
        c.outcome_count DESC,
        c.zero_count ASC
    ) AS rank,
    c.user_id,
    c.display_name,
    c.avatar_url,
    c.total_points,
    c.exact_count,
    c.outcome_count,
    c.zero_count
  FROM combined c
  ORDER BY rank ASC, c.display_name ASC;
$$;

COMMENT ON FUNCTION public.get_season_leaderboard IS
'Returns the season leaderboard ranked by total points with tie-breaking: exact scores → correct outcomes → fewest zero-point matches.';

-- ----------------------------------------------------------------------------
-- 5.2 get_monthly_leaderboard — monthly leaderboard including bonus
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
  ),
  user_bonus AS (
    SELECT
      mb.user_id,
      mb.eligible AS bonus_eligible,
      mb.bonus_points,
      (mb.fixtures_total - mb.predictions_total) AS fixtures_missed
    FROM public.monthly_bonuses mb
    WHERE mb.season_id = p_season_id
      AND mb.month = date_trunc('month', p_month)::date
  )
  SELECT
    RANK() OVER (
      ORDER BY
        (ums.monthly_points + COALESCE(ub.bonus_points, 0)) DESC,
        ums.exact_count DESC,
        ums.outcome_count DESC
    ) AS rank,
    ums.user_id,
    ums.display_name,
    ums.avatar_url,
    ums.monthly_points,
    COALESCE(ub.bonus_points, 0)::integer AS bonus_points,
    ums.monthly_points + COALESCE(ub.bonus_points, 0) AS total_monthly,
    ums.exact_count,
    ums.outcome_count,
    ub.bonus_eligible,
    COALESCE(ub.fixtures_missed, 0) AS fixtures_missed
  FROM user_monthly_stats ums
  LEFT JOIN user_bonus ub ON ub.user_id = ums.user_id
  ORDER BY rank ASC, ums.display_name ASC;
$$;

COMMENT ON FUNCTION public.get_monthly_leaderboard IS
'Returns the monthly leaderboard for a given month, including bonus points.';


-- ============================================================================
-- 6. MONTHLY BONUS FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION public.calculate_monthly_bonus(
  p_season_id uuid,
  p_month date
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_month_start timestamptz;
  v_month_end   timestamptz;
  v_fixture_count integer;
  v_user RECORD;
  v_pred_count integer;
  v_eligible boolean;
  v_processed integer := 0;
BEGIN
  -- Calculate month boundaries
  v_month_start := date_trunc('month', p_month)::timestamptz;
  v_month_end := (date_trunc('month', p_month) + interval '1 month')::timestamptz;

  -- Count finished fixtures in the month (exclude postponed/cancelled)
  SELECT COUNT(*) INTO v_fixture_count
  FROM public.fixtures
  WHERE season_id = p_season_id
    AND status = 'FINISHED'
    AND kickoff_time >= v_month_start
    AND kickoff_time < v_month_end;

  -- If no fixtures in the month, all users get the bonus
  -- (e.g., international break month)
  FOR v_user IN
    SELECT id FROM public.profiles
  LOOP
    IF v_fixture_count = 0 THEN
      v_eligible := true;
      v_pred_count := 0;
    ELSE
      -- Count user's predictions for finished fixtures in the month
      SELECT COUNT(*) INTO v_pred_count
      FROM public.predictions pred
      JOIN public.fixtures f ON f.id = pred.fixture_id
      WHERE pred.user_id = v_user.id
        AND f.season_id = p_season_id
        AND f.status = 'FINISHED'
        AND f.kickoff_time >= v_month_start
        AND f.kickoff_time < v_month_end;

      v_eligible := (v_pred_count = v_fixture_count);
    END IF;

    -- Upsert monthly bonus record
    INSERT INTO public.monthly_bonuses (
      user_id, season_id, month, eligible, bonus_points,
      fixtures_total, predictions_total, calculated_at
    ) VALUES (
      v_user.id,
      p_season_id,
      v_month_start::date,
      v_eligible,
      CASE WHEN v_eligible THEN 10 ELSE 0 END,
      v_fixture_count,
      v_pred_count,
      now()
    )
    ON CONFLICT (user_id, season_id, month) DO UPDATE SET
      eligible          = EXCLUDED.eligible,
      bonus_points      = EXCLUDED.bonus_points,
      fixtures_total    = EXCLUDED.fixtures_total,
      predictions_total = EXCLUDED.predictions_total,
      calculated_at     = EXCLUDED.calculated_at;

    v_processed := v_processed + 1;
  END LOOP;

  RETURN v_processed;
END;
$$;

COMMENT ON FUNCTION public.calculate_monthly_bonus IS
'Calculates monthly bonus for all users. Eligible users who predicted ALL finished fixtures in the month get +10 points. Idempotent.';


-- ============================================================================
-- 7. TRIGGERS
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 7.1 Auto-update updated_at timestamp
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_fixtures_updated_at
  BEFORE UPDATE ON public.fixtures
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_predictions_updated_at
  BEFORE UPDATE ON public.predictions
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ----------------------------------------------------------------------------
-- 7.2 Auto-create profile on new auth user
-- Extracts display_name from email prefix.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(
      split_part(NEW.raw_user_meta_data->>'full_name', ' ', 1),
      split_part(NEW.email, '@', 1)
    ),
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ----------------------------------------------------------------------------
-- 7.3 Record prediction history on update
-- Captures the OLD values before an update.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_prediction_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Only log if the score actually changed
  IF OLD.home_score <> NEW.home_score OR OLD.away_score <> NEW.away_score THEN
    INSERT INTO public.prediction_history (
      prediction_id, user_id, fixture_id, home_score, away_score, changed_at
    ) VALUES (
      OLD.id, OLD.user_id, OLD.fixture_id, OLD.home_score, OLD.away_score, now()
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_prediction_updated
  BEFORE UPDATE ON public.predictions
  FOR EACH ROW EXECUTE FUNCTION public.handle_prediction_update();


-- ============================================================================
-- 8. INITIAL DATA
-- ============================================================================

-- Insert the first season (admin will set is_active = true)
-- This is a placeholder — adjust name for the actual season.
INSERT INTO public.seasons (name, is_active, start_date, end_date)
VALUES ('2025-2026', true, '2025-08-16', '2026-05-25');
