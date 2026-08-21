-- Grand Football — Matchday Drama social features

CREATE TABLE IF NOT EXISTS public.mini_leagues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id uuid NOT NULL REFERENCES public.seasons(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(trim(name)) BETWEEN 3 AND 40),
  invite_code text NOT NULL UNIQUE CHECK (char_length(invite_code) = 8),
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.mini_league_members (
  mini_league_id uuid NOT NULL REFERENCES public.mini_leagues(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (mini_league_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.scorer_picks (
  fixture_id uuid NOT NULL REFERENCES public.fixtures(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  player_name text NOT NULL CHECK (char_length(trim(player_name)) BETWEEN 2 AND 60),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (fixture_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.match_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fixture_id uuid NOT NULL REFERENCES public.fixtures(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reaction text NOT NULL CHECK (reaction IN ('called_it', 'robbed', 'how')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (fixture_id, user_id, reaction)
);

CREATE INDEX IF NOT EXISTS idx_mini_league_members_user ON public.mini_league_members(user_id);
CREATE INDEX IF NOT EXISTS idx_scorer_picks_fixture ON public.scorer_picks(fixture_id);
CREATE INDEX IF NOT EXISTS idx_match_reactions_fixture ON public.match_reactions(fixture_id);

ALTER TABLE public.mini_leagues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mini_league_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scorer_picks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read mini leagues" ON public.mini_leagues FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can read mini league members" ON public.mini_league_members FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can read scorer picks" ON public.scorer_picks FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can read match reactions" ON public.match_reactions FOR SELECT TO authenticated USING (true);

COMMENT ON TABLE public.mini_leagues IS 'Invite-code groups with a filtered season leaderboard.';
COMMENT ON TABLE public.scorer_picks IS 'Optional Golden Boot side-quest picks. Player results can be resolved when scorer event data is available.';
COMMENT ON TABLE public.match_reactions IS 'Lightweight live match reactions, intentionally not a free-form chat.';
