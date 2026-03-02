-- Migration: 00007_badges
-- Description: Create user_badges table, featured_badges on profiles, RLS policies, and helper function

-- 1. Create user_badges table
CREATE TABLE IF NOT EXISTS user_badges (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  badge_id text NOT NULL,
  earned_at timestamptz DEFAULT now() NOT NULL,
  season_id uuid REFERENCES seasons(id) ON DELETE SET NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  UNIQUE(user_id, badge_id, season_id)
);

-- 2. Indexes
CREATE INDEX IF NOT EXISTS idx_user_badges_user_id ON user_badges(user_id);
CREATE INDEX IF NOT EXISTS idx_user_badges_badge_id ON user_badges(badge_id);

-- Partial unique index for career badges (season_id IS NULL)
-- Ensures a user can only earn a given career badge once
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_badges_career_unique
  ON user_badges(user_id, badge_id)
  WHERE season_id IS NULL;

-- 3. Add featured_badges column to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS featured_badges text[] DEFAULT '{}';

-- Constraint: maximum 3 featured badges
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'featured_badges_max_3'
  ) THEN
    ALTER TABLE profiles ADD CONSTRAINT featured_badges_max_3
      CHECK (array_length(featured_badges, 1) IS NULL OR array_length(featured_badges, 1) <= 3);
  END IF;
END
$$;

-- 4. RLS policies
ALTER TABLE user_badges ENABLE ROW LEVEL SECURITY;

-- Authenticated users can view all badges (needed for leaderboard, profiles)
CREATE POLICY "Authenticated users can view badges"
  ON user_badges
  FOR SELECT
  TO authenticated
  USING (true);

-- No INSERT/UPDATE/DELETE policies for authenticated role
-- Only service_role (server-side) can write to user_badges

-- 5. Helper function: count badges for a user
CREATE OR REPLACE FUNCTION count_user_badges(p_user_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT COALESCE(COUNT(*)::integer, 0)
  FROM user_badges
  WHERE user_id = p_user_id;
$$;

-- 6. Documentation
COMMENT ON TABLE user_badges IS 'Stores badges earned by users. Badges can be season-specific (season_id set) or career-wide (season_id NULL). Only writeable by service_role.';
COMMENT ON COLUMN user_badges.badge_id IS 'Identifier matching a badge definition in the application code (e.g. first_prediction, perfect_score, champion).';
COMMENT ON COLUMN user_badges.metadata IS 'Optional JSON payload with context about how the badge was earned (e.g. gameweek, score).';
COMMENT ON COLUMN profiles.featured_badges IS 'Up to 3 badge_ids chosen by the user to display on their profile.';
