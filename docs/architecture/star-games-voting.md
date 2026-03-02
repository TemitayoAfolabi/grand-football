# Grand Football — Star Games Voting: Technical Architecture Specification

> **Document Owner:** Architecture & Security Agent
> **Last Updated:** 2026-02-27
> **Status:** Ready for Implementation
> **Depends On:** `00001_initial_schema.sql`, `00002_star_man_voting.sql`
> **Strategy Ref:** `docs/strategy/star-games-voting.md`

---

## Table of Contents

1. [Database Migration](#1-database-migration)
2. [Security Design](#2-security-design)
3. [API Contracts (Server Actions)](#3-api-contracts-server-actions)
4. [Zod Validation Schemas](#4-zod-validation-schemas)
5. [Constants](#5-constants)
6. [TypeScript Types (database.types.ts additions)](#6-typescript-types)
7. [File Structure](#7-file-structure)
8. [Data Flow Diagrams](#8-data-flow-diagrams)
9. [Cron Job Specification](#9-cron-job-specification)
10. [Testing Strategy](#10-testing-strategy)

---

## 1. Database Migration

**File:** `supabase/migrations/00003_star_game_voting.sql`

```sql
-- ============================================================================
-- Grand Football — Star Games Voting Feature
-- Migration: 00003_star_game_voting.sql
-- Created: 2026-02-27
-- Description: Star Games community voting tables, indexes, RLS, functions,
--              triggers, and audit log extensions.
-- Depends on: 00001_initial_schema.sql, 00002_star_man_voting.sql
-- ============================================================================


-- ============================================================================
-- 1. TABLES
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1.1 star_game_vote_sessions — one voting session per gameweek per season
-- ----------------------------------------------------------------------------
CREATE TABLE public.star_game_vote_sessions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id       uuid NOT NULL REFERENCES public.seasons(id) ON DELETE CASCADE,
  gameweek        integer NOT NULL CHECK (gameweek >= 1 AND gameweek <= 50),
  status          text NOT NULL DEFAULT 'DRAFT'
                    CHECK (status IN ('DRAFT', 'OPEN', 'CLOSED')),
  resolution_mode text
                    CHECK (resolution_mode IS NULL OR resolution_mode IN (
                      'COMMUNITY_VOTE', 'ADMIN_PICK', 'ADMIN_OVERRIDE', 'AUTO_ALL', 'NO_VOTES'
                    )),
  deadline        timestamptz NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT one_session_per_season_gameweek UNIQUE (season_id, gameweek)
);

CREATE INDEX idx_sgv_sessions_season_gw ON public.star_game_vote_sessions (season_id, gameweek);
CREATE INDEX idx_sgv_sessions_status ON public.star_game_vote_sessions (status) WHERE status = 'OPEN';
CREATE INDEX idx_sgv_sessions_deadline ON public.star_game_vote_sessions (deadline) WHERE status = 'OPEN';

COMMENT ON TABLE public.star_game_vote_sessions IS
  'Star Games voting sessions. One session per gameweek per season. Users vote for 2 fixtures to become Star Games.';

-- ----------------------------------------------------------------------------
-- 1.2 star_game_votes — user votes (each user picks exactly 2 fixtures)
-- Each row = 1 fixture pick. A user has exactly 2 rows per session.
-- ----------------------------------------------------------------------------
CREATE TABLE public.star_game_votes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  uuid NOT NULL REFERENCES public.star_game_vote_sessions(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  fixture_id  uuid NOT NULL REFERENCES public.fixtures(id) ON DELETE CASCADE,
  voted_at    timestamptz NOT NULL DEFAULT now(),

  -- One vote per user per fixture per session
  CONSTRAINT unique_vote_per_user_fixture UNIQUE (session_id, user_id, fixture_id)
);

CREATE INDEX idx_sgv_votes_session ON public.star_game_votes (session_id);
CREATE INDEX idx_sgv_votes_user ON public.star_game_votes (user_id);
CREATE INDEX idx_sgv_votes_fixture ON public.star_game_votes (fixture_id);
CREATE INDEX idx_sgv_votes_session_user ON public.star_game_votes (session_id, user_id);

COMMENT ON TABLE public.star_game_votes IS
  'Star Games votes. Each user picks exactly 2 fixtures per session. Enforced at application level.';


-- ============================================================================
-- 2. ENFORCE MAX 2 VOTES PER USER PER SESSION (database-level trigger)
-- ============================================================================
-- Application code also enforces this, but the trigger is a safety net.

CREATE OR REPLACE FUNCTION public.enforce_max_star_game_votes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count integer;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM public.star_game_votes
  WHERE session_id = NEW.session_id
    AND user_id = NEW.user_id;

  -- On INSERT: existing count must be < 2
  -- (this function fires BEFORE INSERT, so the new row is not yet counted)
  IF v_count >= 2 THEN
    RAISE EXCEPTION 'User % already has 2 votes in session %', NEW.user_id, NEW.session_id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_enforce_max_star_game_votes
  BEFORE INSERT ON public.star_game_votes
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_max_star_game_votes();


-- ============================================================================
-- 3. HELPER FUNCTIONS
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 3.1 is_star_game_voting_open() — check if a session accepts votes
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

COMMENT ON FUNCTION public.is_star_game_voting_open IS
  'Returns true if the Star Games voting session is OPEN and the deadline has not passed.';

-- ----------------------------------------------------------------------------
-- 3.2 get_star_game_vote_results() — vote tallies with deterministic ranking
-- Tie-break: vote_count DESC → kickoff_time ASC → created_at ASC → home_team ASC
-- Uses ROW_NUMBER (not RANK) to guarantee exactly 1 fixture per rank position.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_star_game_vote_results(p_session_id uuid)
RETURNS TABLE (
  fixture_id    uuid,
  home_team     text,
  away_team     text,
  home_team_crest text,
  away_team_crest text,
  kickoff_time  timestamptz,
  vote_count    bigint,
  rank          bigint
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT
    f.id            AS fixture_id,
    f.home_team,
    f.away_team,
    f.home_team_crest,
    f.away_team_crest,
    f.kickoff_time,
    COUNT(v.id)     AS vote_count,
    ROW_NUMBER() OVER (
      ORDER BY COUNT(v.id) DESC,
               f.kickoff_time ASC,
               f.created_at ASC,
               f.home_team ASC
    ) AS rank
  FROM public.fixtures f
  LEFT JOIN public.star_game_votes v
    ON v.fixture_id = f.id
    AND v.session_id = p_session_id
  WHERE f.season_id = (
          SELECT season_id FROM public.star_game_vote_sessions WHERE id = p_session_id
        )
    AND f.gameweek = (
          SELECT gameweek FROM public.star_game_vote_sessions WHERE id = p_session_id
        )
    AND f.status NOT IN ('POSTPONED', 'CANCELLED')
  GROUP BY f.id, f.home_team, f.away_team, f.home_team_crest, f.away_team_crest,
           f.kickoff_time, f.created_at
  ORDER BY vote_count DESC, f.kickoff_time ASC, f.created_at ASC, f.home_team ASC;
$$;

COMMENT ON FUNCTION public.get_star_game_vote_results IS
  'Returns deterministic vote tallies and rankings for a Star Games voting session. Tie-break: earliest kickoff → earliest created_at → alphabetical home_team.';

-- ----------------------------------------------------------------------------
-- 3.3 get_star_game_user_votes() — retrieve a user's votes for a session
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_star_game_user_votes(p_session_id uuid, p_user_id uuid)
RETURNS TABLE (
  vote_id     uuid,
  fixture_id  uuid,
  home_team   text,
  away_team   text,
  voted_at    timestamptz
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT
    v.id         AS vote_id,
    v.fixture_id,
    f.home_team,
    f.away_team,
    v.voted_at
  FROM public.star_game_votes v
  JOIN public.fixtures f ON f.id = v.fixture_id
  WHERE v.session_id = p_session_id
    AND v.user_id = p_user_id
  ORDER BY f.kickoff_time ASC;
$$;

COMMENT ON FUNCTION public.get_star_game_user_votes IS
  'Returns the fixtures a user voted for in a Star Games voting session.';


-- ============================================================================
-- 4. UPDATE admin_audit_log CHECK CONSTRAINT
-- ============================================================================
-- Drop existing constraint (from 00002) and re-create with new action types.

ALTER TABLE public.admin_audit_log DROP CONSTRAINT IF EXISTS admin_audit_log_action_check;

ALTER TABLE public.admin_audit_log ADD CONSTRAINT admin_audit_log_action_check
  CHECK (action IN (
    -- Original actions (00001)
    'TOGGLE_STAR', 'OVERRIDE_RESULT', 'RECALCULATE',
    'ADD_USER', 'REMOVE_USER', 'NEW_SEASON',
    -- Star Man actions (00002)
    'CREATE_STAR_MAN_SESSION', 'ADD_STAR_MAN_NOMINEE', 'REMOVE_STAR_MAN_NOMINEE',
    'OPEN_STAR_MAN_VOTING', 'CLOSE_STAR_MAN_VOTING',
    -- Star Games Voting actions (00003)
    'CREATE_STAR_GAME_VOTE_SESSION',
    'OPEN_STAR_GAME_VOTING',
    'CLOSE_STAR_GAME_VOTING',
    'OVERRIDE_STAR_GAMES',
    'MANUAL_STAR_GAME_PICK',
    'DELETE_STAR_GAME_VOTE_SESSION',
    'AUTO_CLOSE_STAR_GAME_VOTING'
  ));


-- ============================================================================
-- 5. ROW-LEVEL SECURITY (RLS)
-- ============================================================================

ALTER TABLE public.star_game_vote_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.star_game_votes ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- 5.1 star_game_vote_sessions
-- All authenticated users can read sessions (needed for voting UI).
-- Only admins can create/update sessions.
-- ----------------------------------------------------------------------------
CREATE POLICY "sgv_sessions_select_all"
  ON public.star_game_vote_sessions FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "sgv_sessions_insert_admin"
  ON public.star_game_vote_sessions FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "sgv_sessions_update_admin"
  ON public.star_game_vote_sessions FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "sgv_sessions_delete_admin"
  ON public.star_game_vote_sessions FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- ----------------------------------------------------------------------------
-- 5.2 star_game_votes
-- Users can read their own votes. Admins can read all votes.
-- Users can insert/delete their own votes ONLY when voting is open.
-- No UPDATE policy — vote changes are delete + re-insert (atomic swap).
-- ----------------------------------------------------------------------------
CREATE POLICY "sgv_votes_select_own_or_admin"
  ON public.star_game_votes FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id
    OR public.is_admin()
  );

CREATE POLICY "sgv_votes_insert_own"
  ON public.star_game_votes FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND public.is_star_game_voting_open(session_id)
  );

CREATE POLICY "sgv_votes_delete_own"
  ON public.star_game_votes FOR DELETE
  TO authenticated
  USING (
    auth.uid() = user_id
    AND public.is_star_game_voting_open(session_id)
  );


-- ============================================================================
-- 6. TRIGGERS
-- ============================================================================

-- Reuse the set_updated_at() function from 00002_star_man_voting.sql
-- (already exists in the database).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_sgv_sessions_updated_at'
  ) THEN
    CREATE TRIGGER trg_sgv_sessions_updated_at
      BEFORE UPDATE ON public.star_game_vote_sessions
      FOR EACH ROW
      EXECUTE FUNCTION public.set_updated_at();
  END IF;
END;
$$;


-- ============================================================================
-- 7. VALIDATE FIXTURE BELONGS TO SESSION'S GAMEWEEK (trigger)
-- ============================================================================
-- Ensures votes reference fixtures actually in the session's gameweek/season.

CREATE OR REPLACE FUNCTION public.validate_star_game_vote_fixture()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_session record;
  v_fixture record;
BEGIN
  -- Get session details
  SELECT season_id, gameweek INTO v_session
  FROM public.star_game_vote_sessions
  WHERE id = NEW.session_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Voting session % not found', NEW.session_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  -- Get fixture details
  SELECT season_id, gameweek, status INTO v_fixture
  FROM public.fixtures
  WHERE id = NEW.fixture_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fixture % not found', NEW.fixture_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  -- Verify fixture belongs to session's season + gameweek
  IF v_fixture.season_id <> v_session.season_id
     OR v_fixture.gameweek <> v_session.gameweek THEN
    RAISE EXCEPTION 'Fixture % does not belong to gameweek % of the session''s season',
      NEW.fixture_id, v_session.gameweek
      USING ERRCODE = 'check_violation';
  END IF;

  -- Verify fixture is not postponed/cancelled
  IF v_fixture.status IN ('POSTPONED', 'CANCELLED') THEN
    RAISE EXCEPTION 'Cannot vote for a % fixture', v_fixture.status
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_star_game_vote_fixture
  BEFORE INSERT ON public.star_game_votes
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_star_game_vote_fixture();
```

### Migration Notes

- **Idempotent constraint drop:** The `ALTER TABLE ... DROP CONSTRAINT IF EXISTS` ensures safe re-runs.
- **`ROW_NUMBER()` vs `RANK()`:** We use `ROW_NUMBER()` deliberately to guarantee no tied rank positions — the tie-breaking cascade (kickoff → created_at → home_team) is deterministic.
- **Max 2 votes:** Enforced both at the database level (trigger) and application level (server action). Defense in depth.
- **Vote change strategy:** Delete-then-insert (not UPDATE) — simpler, avoids partial-update complexity, and the RLS policy for DELETE mirrors INSERT conditions.
- **Fixture validation trigger:** Prevents cross-gameweek or invalid fixture votes at the database level, even if app-level validation is bypassed.

---

## 2. Security Design

### 2.1 Row-Level Security Summary

| Table | Operation | Policy | Rule |
|-------|-----------|--------|------|
| `star_game_vote_sessions` | SELECT | `sgv_sessions_select_all` | All authenticated users |
| `star_game_vote_sessions` | INSERT | `sgv_sessions_insert_admin` | `is_admin()` |
| `star_game_vote_sessions` | UPDATE | `sgv_sessions_update_admin` | `is_admin()` |
| `star_game_vote_sessions` | DELETE | `sgv_sessions_delete_admin` | `is_admin()` |
| `star_game_votes` | SELECT | `sgv_votes_select_own_or_admin` | `auth.uid() = user_id OR is_admin()` |
| `star_game_votes` | INSERT | `sgv_votes_insert_own` | `auth.uid() = user_id AND is_star_game_voting_open(session_id)` |
| `star_game_votes` | DELETE | `sgv_votes_delete_own` | `auth.uid() = user_id AND is_star_game_voting_open(session_id)` |

### 2.2 Server-Side Validation Rules

Every Server Action MUST enforce these checks **before** any database mutation:

| Action | Validations |
|--------|-------------|
| `createStarGameVoteSession` | 1. Caller is admin (`requireAdmin()`)<br>2. Active season exists<br>3. Gameweek number valid (1–50, Zod)<br>4. No existing session for this season+gameweek (DB unique constraint as backstop)<br>5. ≥1 playable fixture in the gameweek |
| `openStarGameVoting` | 1. Caller is admin<br>2. Session exists and status = `DRAFT`<br>3. Deadline is in the future<br>4. ≥3 playable fixtures (if <3, use AUTO_ALL or ADMIN_PICK instead) |
| `closeStarGameVoting` | 1. Caller is admin<br>2. Session exists and status = `OPEN`<br>3. Optimistic concurrency: `UPDATE ... WHERE status = 'OPEN'` |
| `castStarGameVotes` | 1. Caller is authenticated<br>2. Session exists and status = `OPEN` and deadline > now()<br>3. Exactly 2 fixture IDs (Zod tuple)<br>4. Both fixture IDs are UUIDs (Zod)<br>5. Both fixtures belong to the session's season + gameweek<br>6. Both fixtures are playable (not POSTPONED/CANCELLED)<br>7. Both fixture IDs are distinct<br>8. User doesn't already have 2 votes (or delete existing first) |
| `applyStarGameResults` | 1. Caller is admin<br>2. Session exists and status = `CLOSED`<br>3. Uses `get_star_game_vote_results()` for deterministic ranking |
| `overrideStarGames` | 1. Caller is admin<br>2. Session exists and status = `CLOSED`<br>3. Exactly 2 fixture IDs (Zod tuple, or 1 if gameweek has <2 fixtures)<br>4. Fixtures belong to the session's gameweek<br>5. Fixtures are playable |
| `manualStarGamePick` | 1. Caller is admin<br>2. No existing session for this gameweek (or session in DRAFT)<br>3. Exactly 2 fixture IDs (or fewer for small gameweeks)<br>4. Fixtures belong to gameweek and are playable |
| `deleteStarGameVoteSession` | 1. Caller is admin<br>2. Session exists and status = `DRAFT` (cannot delete OPEN/CLOSED) |

### 2.3 CSRF Protection

- All mutations use **Next.js Server Actions** which include built-in CSRF protection via the `__next_action_id` header.
- No raw API routes are exposed for voting (except the cron endpoint which uses `CRON_SECRET`).

### 2.4 Rate Limiting Considerations

| Concern | Mitigation |
|---------|------------|
| Vote spam | Max 2 votes per session enforced by DB trigger + app logic. Changing votes = delete + re-insert, limited by RLS to `is_star_game_voting_open()`. |
| Session creation spam | RLS: only admins. Unique constraint: one per season+gameweek. |
| Brute-force vote changes | Acceptable — small league (~30 users), vote changes are idempotent, audit trail exists. |
| Cron endpoint abuse | Protected by `CRON_SECRET` bearer token. |

**No additional rate limiting is required** for the ~30 user league. If the user base grows beyond 100, consider Vercel Edge middleware rate limiting on Server Action endpoints.

### 2.5 Data Privacy

- Admin can see all votes (transparent in a small league).
- Non-admin users can **only** see their own votes and the aggregated tallies (not who voted for what).
- Vote tallies are visible to all users **after** the user has voted (prevents bandwagoning) or after voting closes.
- Controlled entirely by the `sgv_votes_select_own_or_admin` RLS policy.

### 2.6 Service Role Usage

The following operations use `createAdminClient()` (bypasses RLS):

| Operation | Reason |
|-----------|--------|
| `applyStarGameResults` | Must UPDATE `fixtures.is_star_game` (no user INSERT/UPDATE RLS on fixtures) |
| `overrideStarGames` | Same as above |
| `manualStarGamePick` | Creates CLOSED session + sets fixtures in one transaction |
| Cron auto-close | Runs without a user context; needs to update sessions and fixtures |
| Audit log writes | `admin_audit_log` INSERT requires admin RLS — service role is simpler from cron context |

All other operations (session reads, vote reads, vote inserts) use the **user's Supabase client** with RLS.

---

## 3. API Contracts (Server Actions)

### File: `src/app/(authenticated)/admin/star-games/actions.ts`

#### 3.1 `createStarGameVoteSession`

```typescript
'use server';

export async function createStarGameVoteSession(
  formData: FormData,
): Promise<{ error?: string; success?: boolean }> {
  // Input: gameweek (number) from formData
  // 1. requireAdmin()
  // 2. Get active season
  // 3. Validate gameweek (Zod: createStarGameVoteSessionSchema)
  // 4. Check no existing session for season+gameweek
  // 5. Count playable fixtures in gameweek
  //    - If 0: error "No fixtures in this gameweek"
  //    - If 1: create CLOSED session, resolution_mode = 'ADMIN_PICK', admin picks manually
  //    - If 2: create CLOSED session, resolution_mode = 'AUTO_ALL', mark both as star games
  //    - If ≥3: create DRAFT session, deadline = 2h before earliest kickoff
  // 6. Insert star_game_vote_sessions
  // 7. auditLog(adminId, 'CREATE_STAR_GAME_VOTE_SESSION', ...)
  // 8. revalidatePath('/admin/star-games', '/fixtures')
  // Returns: { success: true } or { error: string }
}
```

**Signature & Contract:**
| Field | Type | Source |
|-------|------|--------|
| `gameweek` | `number` (1–50) | `formData.get('gameweek')` |

**Returns:** `{ success: true }` or `{ error: string }`

---

#### 3.2 `openStarGameVoting`

```typescript
export async function openStarGameVoting(
  formData: FormData,
): Promise<{ error?: string; success?: boolean }> {
  // Input: sessionId (uuid) from formData
  // 1. requireAdmin()
  // 2. Validate sessionId (Zod)
  // 3. Get session, verify status = 'DRAFT'
  // 4. Verify deadline is in the future
  // 5. Count playable fixtures — require ≥3
  // 6. UPDATE status = 'OPEN'
  // 7. auditLog(adminId, 'OPEN_STAR_GAME_VOTING', ...)
  // 8. revalidatePath(...)
}
```

| Field | Type | Source |
|-------|------|--------|
| `sessionId` | `string` (UUID) | `formData.get('sessionId')` |

---

#### 3.3 `closeStarGameVoting`

```typescript
export async function closeStarGameVoting(
  formData: FormData,
): Promise<{ error?: string; success?: boolean }> {
  // Input: sessionId (uuid) from formData
  // 1. requireAdmin()
  // 2. Validate sessionId (Zod)
  // 3. Optimistic: UPDATE status = 'CLOSED' WHERE status = 'OPEN'
  // 4. If rowCount = 0: error "Session is not open or already closed"
  // 5. Call applyVoteResults(sessionId) — internal helper
  // 6. auditLog(adminId, 'CLOSE_STAR_GAME_VOTING', ...)
  // 7. revalidatePath(...)
}
```

---

#### 3.4 `overrideStarGames`

```typescript
export async function overrideStarGames(
  formData: FormData,
): Promise<{ error?: string; success?: boolean }> {
  // Input: sessionId (uuid), fixtureId1 (uuid), fixtureId2 (uuid) from formData
  // 1. requireAdmin()
  // 2. Validate (Zod: overrideStarGamesSchema)
  // 3. Verify session exists and status = 'CLOSED'
  // 4. Verify both fixtures belong to session's gameweek+season, are playable
  // 5. Clear is_star_game on all fixtures in games's gameweek
  // 6. Set is_star_game = true, manually_overridden = true on the 2 fixtures
  // 7. Update session resolution_mode = 'ADMIN_OVERRIDE'
  // 8. auditLog(adminId, 'OVERRIDE_STAR_GAMES', ...)
  // 9. revalidatePath(...)
}
```

| Field | Type | Source |
|-------|------|--------|
| `sessionId` | `string` (UUID) | `formData.get('sessionId')` |
| `fixtureId1` | `string` (UUID) | `formData.get('fixtureId1')` |
| `fixtureId2` | `string` (UUID) | `formData.get('fixtureId2')` |

---

#### 3.5 `manualStarGamePick`

```typescript
export async function manualStarGamePick(
  formData: FormData,
): Promise<{ error?: string; success?: boolean }> {
  // Input: gameweek (number), fixtureId1 (uuid), fixtureId2 (uuid) from formData
  // 1. requireAdmin()
  // 2. Validate (Zod: manualStarGamePickSchema)
  // 3. Get active season
  // 4. Verify no existing session OR existing session in DRAFT (delete it)
  // 5. Verify fixtures belong to gameweek, are playable
  // 6. Create session with status = 'CLOSED', resolution_mode = 'ADMIN_PICK'
  // 7. Clear is_star_game on all fixtures in gameweek
  // 8. Set is_star_game = true, manually_overridden = true on selected fixtures
  // 9. auditLog(adminId, 'MANUAL_STAR_GAME_PICK', ...)
  // 10. revalidatePath(...)
}
```

| Field | Type | Source |
|-------|------|--------|
| `gameweek` | `number` (1–50) | `formData.get('gameweek')` |
| `fixtureId1` | `string` (UUID) | `formData.get('fixtureId1')` |
| `fixtureId2` | `string` (UUID) | `formData.get('fixtureId2')` |

---

#### 3.6 `deleteStarGameVoteSession`

```typescript
export async function deleteStarGameVoteSession(
  formData: FormData,
): Promise<{ error?: string; success?: boolean }> {
  // Input: sessionId (uuid)
  // 1. requireAdmin()
  // 2. Validate sessionId (Zod)
  // 3. Verify session exists and status = 'DRAFT'
  // 4. DELETE session (CASCADE deletes any votes)
  // 5. auditLog(adminId, 'DELETE_STAR_GAME_VOTE_SESSION', ...)
  // 6. revalidatePath(...)
}
```

---

#### 3.7 Internal Helper: `applyVoteResults`

```typescript
/** Internal — not exported as a Server Action. Called by closeStarGameVoting and cron. */
async function applyVoteResults(sessionId: string): Promise<{
  resolution_mode: string;
  star_fixture_ids: string[];
}> {
  // 1. Call get_star_game_vote_results(sessionId) via admin client RPC
  // 2. If no results or all vote_count = 0:
  //    - Set resolution_mode = 'NO_VOTES', return
  // 3. Take top 2 fixtures by rank
  // 4. Clear is_star_game on all fixtures in the gameweek
  // 5. Set is_star_game = true, manually_overridden = false on top 2
  // 6. Update session resolution_mode = 'COMMUNITY_VOTE'
  // 7. Return { resolution_mode, star_fixture_ids }
}
```

---

### File: `src/app/(authenticated)/star-games/actions.ts` (user actions)

#### 3.8 `castStarGameVotes`

```typescript
'use server';

export async function castStarGameVotes(
  formData: FormData,
): Promise<{ error?: string; success?: boolean }> {
  // Input: sessionId (uuid), fixtureId1 (uuid), fixtureId2 (uuid) from formData
  // 1. Authenticate user (supabase.auth.getUser())
  // 2. Validate (Zod: castStarGameVotesSchema)
  // 3. Verify fixtureId1 !== fixtureId2
  // 4. Check is_star_game_voting_open(sessionId) via RPC
  // 5. Verify both fixtures belong to session's gameweek+season via query
  // 6. Verify both fixtures are playable (not POSTPONED/CANCELLED)
  // 7. Delete existing votes for this user+session (atomic replacement)
  // 8. Insert 2 new vote rows
  // 9. revalidatePath('/fixtures', '/')
  // Returns: { success: true } or { error: string }
}
```

| Field | Type | Source |
|-------|------|--------|
| `sessionId` | `string` (UUID) | `formData.get('sessionId')` |
| `fixtureId1` | `string` (UUID) | `formData.get('fixtureId1')` |
| `fixtureId2` | `string` (UUID) | `formData.get('fixtureId2')` |

**Vote Change Flow:**
1. User has existing votes → delete them first
2. Insert 2 new rows
3. This is an atomic "replace all" operation, not a partial update

---

## 4. Zod Validation Schemas

**File: `src/lib/validations.ts` — additions**

```typescript
// ── Star Games Voting ───────────────────────────────────────────────────

/** Star Games: create voting session */
export const createStarGameVoteSessionSchema = z.object({
  gameweek: z
    .number({ coerce: true })
    .int('Gameweek must be a whole number')
    .min(1, 'Gameweek must be at least 1')
    .max(50, 'Gameweek cannot exceed 50'),
});

export type CreateStarGameVoteSessionInput = z.infer<typeof createStarGameVoteSessionSchema>;

/** Star Games: generic session ID param (open, close, delete) */
export const starGameSessionIdSchema = z.object({
  sessionId: z.string().uuid('Invalid session ID'),
});

export type StarGameSessionIdInput = z.infer<typeof starGameSessionIdSchema>;

/** Star Games: cast votes (user picks exactly 2 fixtures) */
export const castStarGameVotesSchema = z
  .object({
    sessionId: z.string().uuid('Invalid session ID'),
    fixtureId1: z.string().uuid('Invalid fixture ID'),
    fixtureId2: z.string().uuid('Invalid fixture ID'),
  })
  .refine((data) => data.fixtureId1 !== data.fixtureId2, {
    message: 'You must select 2 different fixtures',
    path: ['fixtureId2'],
  });

export type CastStarGameVotesInput = z.infer<typeof castStarGameVotesSchema>;

/** Star Games: override star games (admin picks 2 fixtures) */
export const overrideStarGamesSchema = z
  .object({
    sessionId: z.string().uuid('Invalid session ID'),
    fixtureId1: z.string().uuid('Invalid fixture ID'),
    fixtureId2: z.string().uuid('Invalid fixture ID'),
  })
  .refine((data) => data.fixtureId1 !== data.fixtureId2, {
    message: 'You must select 2 different fixtures',
    path: ['fixtureId2'],
  });

export type OverrideStarGamesInput = z.infer<typeof overrideStarGamesSchema>;

/** Star Games: manual pick (admin directly picks star games, no voting) */
export const manualStarGamePickSchema = z
  .object({
    gameweek: z
      .number({ coerce: true })
      .int('Gameweek must be a whole number')
      .min(1, 'Gameweek must be at least 1')
      .max(50, 'Gameweek cannot exceed 50'),
    fixtureId1: z.string().uuid('Invalid fixture ID'),
    fixtureId2: z.string().uuid('Invalid fixture ID'),
  })
  .refine((data) => data.fixtureId1 !== data.fixtureId2, {
    message: 'You must select 2 different fixtures',
    path: ['fixtureId2'],
  });

export type ManualStarGamePickInput = z.infer<typeof manualStarGamePickSchema>;
```

---

## 5. Constants

**File: `src/lib/constants.ts` — additions**

```typescript
/** Star Games Voting statuses */
export const STAR_GAME_VOTE_STATUS = {
  DRAFT: 'DRAFT',
  OPEN: 'OPEN',
  CLOSED: 'CLOSED',
} as const;

/** Star Games Voting resolution modes */
export const STAR_GAME_RESOLUTION_MODE = {
  COMMUNITY_VOTE: 'COMMUNITY_VOTE',
  ADMIN_PICK: 'ADMIN_PICK',
  ADMIN_OVERRIDE: 'ADMIN_OVERRIDE',
  AUTO_ALL: 'AUTO_ALL',
  NO_VOTES: 'NO_VOTES',
} as const;

/** Hours before first kickoff that Star Games voting closes */
export const STAR_GAME_VOTE_DEADLINE_HOURS = 2;

/** Maximum number of star game votes per user per session */
export const STAR_GAME_MAX_VOTES = 2;

/** Number of star games per gameweek (top N from voting) */
export const STAR_GAMES_PER_GAMEWEEK = 2;

/** Minimum playable fixtures required for community voting (below this → auto/manual) */
export const STAR_GAME_MIN_FIXTURES_FOR_VOTING = 3;
```

**ADMIN_ACTIONS additions:**
```typescript
// Add to existing ADMIN_ACTIONS object:
export const ADMIN_ACTIONS = {
  // ... existing actions ...
  CREATE_STAR_GAME_VOTE_SESSION: 'CREATE_STAR_GAME_VOTE_SESSION',
  OPEN_STAR_GAME_VOTING: 'OPEN_STAR_GAME_VOTING',
  CLOSE_STAR_GAME_VOTING: 'CLOSE_STAR_GAME_VOTING',
  OVERRIDE_STAR_GAMES: 'OVERRIDE_STAR_GAMES',
  MANUAL_STAR_GAME_PICK: 'MANUAL_STAR_GAME_PICK',
  DELETE_STAR_GAME_VOTE_SESSION: 'DELETE_STAR_GAME_VOTE_SESSION',
  AUTO_CLOSE_STAR_GAME_VOTING: 'AUTO_CLOSE_STAR_GAME_VOTING',
} as const;
```

---

## 6. TypeScript Types

**File: `src/lib/database.types.ts` — additions to `public.Tables`**

The following type stubs must be added (or regenerated via `supabase gen types`):

```typescript
star_game_vote_sessions: {
  Row: {
    id: string
    season_id: string
    gameweek: number
    status: string
    resolution_mode: string | null
    deadline: string
    created_at: string
    updated_at: string
  }
  Insert: {
    id?: string
    season_id: string
    gameweek: number
    status?: string
    resolution_mode?: string | null
    deadline: string
    created_at?: string
    updated_at?: string
  }
  Update: {
    id?: string
    season_id?: string
    gameweek?: number
    status?: string
    resolution_mode?: string | null
    deadline?: string
    created_at?: string
    updated_at?: string
  }
  Relationships: [
    {
      foreignKeyName: "star_game_vote_sessions_season_id_fkey"
      columns: ["season_id"]
      isOneToOne: false
      referencedRelation: "seasons"
      referencedColumns: ["id"]
    }
  ]
}

star_game_votes: {
  Row: {
    id: string
    session_id: string
    user_id: string
    fixture_id: string
    voted_at: string
  }
  Insert: {
    id?: string
    session_id: string
    user_id: string
    fixture_id: string
    voted_at?: string
  }
  Update: {
    id?: string
    session_id?: string
    user_id?: string
    fixture_id?: string
    voted_at?: string
  }
  Relationships: [
    {
      foreignKeyName: "star_game_votes_session_id_fkey"
      columns: ["session_id"]
      isOneToOne: false
      referencedRelation: "star_game_vote_sessions"
      referencedColumns: ["id"]
    },
    {
      foreignKeyName: "star_game_votes_user_id_fkey"
      columns: ["user_id"]
      isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },
    {
      foreignKeyName: "star_game_votes_fixture_id_fkey"
      columns: ["fixture_id"]
      isOneToOne: false
      referencedRelation: "fixtures"
      referencedColumns: ["id"]
    }
  ]
}
```

**Functions additions:**
```typescript
is_star_game_voting_open: {
  Args: { p_session_id: string }
  Returns: boolean
}
get_star_game_vote_results: {
  Args: { p_session_id: string }
  Returns: {
    fixture_id: string
    home_team: string
    away_team: string
    home_team_crest: string | null
    away_team_crest: string | null
    kickoff_time: string
    vote_count: number
    rank: number
  }[]
}
get_star_game_user_votes: {
  Args: { p_session_id: string; p_user_id: string }
  Returns: {
    vote_id: string
    fixture_id: string
    home_team: string
    away_team: string
    voted_at: string
  }[]
}
```

---

## 7. File Structure

### New Files

```
supabase/migrations/
  00003_star_game_voting.sql              # Database migration

src/app/(authenticated)/star-games/
  actions.ts                              # User Server Actions (castStarGameVotes)
  page.tsx                                # (Optional redirect to /fixtures — voting lives on fixtures page)

src/app/(authenticated)/admin/star-games/
  actions.ts                              # Admin Server Actions (create, open, close, override, manual pick, delete)
  page.tsx                                # Admin Star Games management page
  layout.tsx                              # Admin section layout (if needed)

src/app/api/cron/close-star-votes/
  route.ts                                # Cron: auto-close expired voting sessions

src/components/
  star-game-voting-section.tsx            # User voting UI (fixture cards, selection, submit)
  star-game-vote-card.tsx                 # Dashboard prompt card for active voting
  star-game-results.tsx                   # Post-close voting results display
```

### Modified Files

```
src/lib/constants.ts                      # New constants (statuses, resolution modes, deadlines)
src/lib/validations.ts                    # New Zod schemas
src/lib/database.types.ts                 # New table + function types (regenerated)

src/app/(authenticated)/fixtures/page.tsx # Integrate StarGameVotingSection
src/app/(authenticated)/page.tsx          # Integrate StarGameVoteCard on dashboard
src/app/(authenticated)/admin/layout.tsx  # Add "Star Games" nav link
src/app/(authenticated)/admin/page.tsx    # Add Star Games section/link

vercel.json                               # Add cron schedule for close-star-votes
```

---

## 8. Data Flow Diagrams

### 8.1 User Voting Flow

```
┌──────────┐     ┌───────────────────┐     ┌──────────────────────┐
│  User    │     │  Fixtures Page    │     │  Server Action       │
│  Browser │     │  (React SSR)      │     │  castStarGameVotes   │
└────┬─────┘     └────────┬──────────┘     └──────────┬───────────┘
     │                    │                           │
     │  Navigate to       │                           │
     │  /fixtures?gw=12   │                           │
     │───────────────────>│                           │
     │                    │                           │
     │                    │  Server: Query            │
     │                    │  - star_game_vote_sessions│
     │                    │    WHERE season+gw, OPEN  │
     │                    │  - fixtures in gameweek   │
     │                    │  - user's existing votes  │
     │                    │  - vote tallies (if voted)│
     │                    │<──────────────────────────│
     │                    │                           │
     │  Render:           │                           │
     │  - Voting section  │                           │
     │  - Fixture cards   │                           │
     │  - Selection state │                           │
     │<───────────────────│                           │
     │                    │                           │
     │  Select 2 fixtures │                           │
     │  Click "Submit"    │                           │
     │───────────────────>│                           │
     │                    │  formData:                │
     │                    │  sessionId + 2 fixtureIds │
     │                    │──────────────────────────>│
     │                    │                           │
     │                    │                 Validate: │
     │                    │                 - Auth    │
     │                    │                 - Zod     │
     │                    │                 - Session │
     │                    │                   OPEN?   │
     │                    │                 - Fixtures│
     │                    │                   valid?  │
     │                    │                           │
     │                    │                 DELETE     │
     │                    │                 old votes │
     │                    │                           │
     │                    │                 INSERT    │
     │                    │                 2 new rows│
     │                    │                           │
     │                    │  { success: true }        │
     │                    │<──────────────────────────│
     │                    │                           │
     │  revalidatePath    │                           │
     │  Updated UI with   │                           │
     │  "Your picks" +    │                           │
     │  vote tallies      │                           │
     │<───────────────────│                           │
     │                    │                           │
```

### 8.2 Admin Management Flow

```
┌──────────┐     ┌───────────────────────────────────────────────┐
│  Admin   │     │                Admin Panel                    │
│  Browser │     │            /admin/star-games                  │
└────┬─────┘     └───────────────────┬───────────────────────────┘
     │                               │
     │  1. Select gameweek           │
     │──────────────────────────────>│
     │                               │
     │  Display: fixtures, session   │
     │  status (or "no session")     │
     │<──────────────────────────────│
     │                               │
     ├── PATH A: Community Vote ─────┤
     │                               │
     │  2. "Create Voting Session"   │
     │──────────────────────────────>│
     │         createStarGameVoteSession(gameweek)
     │         → Session created (DRAFT)
     │                               │
     │  3. "Open Voting"             │
     │──────────────────────────────>│
     │         openStarGameVoting(sessionId)
     │         → Session status: OPEN
     │         → Users can now vote
     │                               │
     │  4. Wait for deadline...      │
     │     OR "Close Voting Early"   │
     │──────────────────────────────>│
     │         closeStarGameVoting(sessionId)
     │         → Session status: CLOSED
     │         → Top 2 fixtures get is_star_game=true
     │                               │
     │  5. (Optional) "Override"     │
     │──────────────────────────────>│
     │         overrideStarGames(sessionId, fixture1, fixture2)
     │         → New fixtures get is_star_game=true
     │         → resolution_mode = ADMIN_OVERRIDE
     │                               │
     ├── PATH B: Manual Pick ────────┤
     │                               │
     │  2. "Manual Pick"             │
     │  Select 2 fixtures            │
     │──────────────────────────────>│
     │         manualStarGamePick(gameweek, fixture1, fixture2)
     │         → Session created CLOSED, mode=ADMIN_PICK
     │         → 2 fixtures get is_star_game=true
     │                               │
```

### 8.3 Auto-Close Flow (Cron)

```
┌──────────────┐     ┌─────────────────────────────┐     ┌──────────────┐
│  Vercel Cron │     │  /api/cron/close-star-votes  │     │  Supabase    │
│  (every 15m) │     │  (Route Handler)             │     │  (PostgreSQL)│
└──────┬───────┘     └──────────────┬───────────────┘     └──────┬───────┘
       │                            │                            │
       │  POST + CRON_SECRET        │                            │
       │───────────────────────────>│                            │
       │                            │                            │
       │                            │  SELECT * FROM             │
       │                            │  star_game_vote_sessions   │
       │                            │  WHERE status = 'OPEN'     │
       │                            │  AND deadline <= now()      │
       │                            │───────────────────────────>│
       │                            │                            │
       │                            │  [session_1, session_2...] │
       │                            │<───────────────────────────│
       │                            │                            │
       │                            │  FOR EACH expired session: │
       │                            │                            │
       │                            │  1. UPDATE status='CLOSED' │
       │                            │     WHERE status='OPEN'    │
       │                            │     (optimistic lock)      │
       │                            │───────────────────────────>│
       │                            │                            │
       │                            │  2. RPC:                   │
       │                            │  get_star_game_vote_results│
       │                            │───────────────────────────>│
       │                            │                            │
       │                            │  3. IF votes > 0:          │
       │                            │     Top 2 → is_star_game   │
       │                            │     mode = COMMUNITY_VOTE  │
       │                            │  ELSE:                     │
       │                            │     mode = NO_VOTES        │
       │                            │───────────────────────────>│
       │                            │                            │
       │                            │  4. INSERT audit_log       │
       │                            │    (action=AUTO_CLOSE_...) │
       │                            │───────────────────────────>│
       │                            │                            │
       │  { processed: N }          │                            │
       │<───────────────────────────│                            │
       │                            │                            │
```

### 8.4 Vote Change Flow

```
User has existing votes [FixA, FixB] → wants to change to [FixA, FixC]

1. Client submits: castStarGameVotes(sessionId, fixtureA, fixtureC)
2. Server Action:
   a. Verify session OPEN + deadline > now()
   b. DELETE FROM star_game_votes WHERE session_id = $1 AND user_id = $2
      → Deletes both existing rows [FixA, FixB]
   c. INSERT INTO star_game_votes (session_id, user_id, fixture_id)
      VALUES ($1, $2, fixtureA), ($1, $2, fixtureC)
      → Inserts 2 new rows [FixA, FixC]
3. Net effect: FixB loses 1 vote, FixC gains 1 vote, FixA unchanged
```

---

## 9. Cron Job Specification

### 9.1 `/api/cron/close-star-votes`

**Schedule:** `*/15 * * * *` (every 15 minutes)

**vercel.json addition:**
```json
{
  "path": "/api/cron/close-star-votes",
  "schedule": "*/15 * * * *"
}
```

**Route Handler Pseudocode:**

```typescript
// src/app/api/cron/close-star-votes/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { STAR_GAME_VOTE_STATUS, STAR_GAME_RESOLUTION_MODE, STAR_GAMES_PER_GAMEWEEK } from '@/lib/constants';

export async function POST(request: NextRequest) {
  // 1. Verify CRON_SECRET
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();
  let processed = 0;

  // 2. Find all OPEN sessions past their deadline
  const { data: expiredSessions } = await supabase
    .from('star_game_vote_sessions')
    .select('id, season_id, gameweek')
    .eq('status', STAR_GAME_VOTE_STATUS.OPEN)
    .lte('deadline', new Date().toISOString());

  if (!expiredSessions || expiredSessions.length === 0) {
    return NextResponse.json({ message: 'No expired sessions', processed: 0 });
  }

  for (const session of expiredSessions) {
    // 3. Optimistic close: only succeeds if still OPEN
    const { data: updated, error: closeError } = await supabase
      .from('star_game_vote_sessions')
      .update({ status: 'CLOSED' })
      .eq('id', session.id)
      .eq('status', 'OPEN')  // optimistic concurrency
      .select('id')
      .single();

    if (closeError || !updated) continue; // Already closed by admin

    // 4. Get vote results
    const { data: results } = await supabase.rpc('get_star_game_vote_results', {
      p_session_id: session.id,
    });

    let resolutionMode: string;
    const starFixtureIds: string[] = [];

    if (!results || results.length === 0 || results.every(r => r.vote_count === 0)) {
      // No votes
      resolutionMode = STAR_GAME_RESOLUTION_MODE.NO_VOTES;
    } else {
      // Apply top 2
      resolutionMode = STAR_GAME_RESOLUTION_MODE.COMMUNITY_VOTE;
      const topFixtures = results.slice(0, STAR_GAMES_PER_GAMEWEEK);

      // Clear existing star games in this gameweek
      await supabase
        .from('fixtures')
        .update({ is_star_game: false, manually_overridden: false })
        .eq('season_id', session.season_id)
        .eq('gameweek', session.gameweek);

      // Set top 2 as star games
      for (const fix of topFixtures) {
        await supabase
          .from('fixtures')
          .update({ is_star_game: true, manually_overridden: false })
          .eq('id', fix.fixture_id);
        starFixtureIds.push(fix.fixture_id);
      }
    }

    // 5. Update resolution mode
    await supabase
      .from('star_game_vote_sessions')
      .update({ resolution_mode: resolutionMode })
      .eq('id', session.id);

    // 6. Audit log (use null admin_id for system actions)
    // Note: admin_audit_log has NOT NULL on admin_id, so we use a
    // system sentinel or skip. For this design, we log with the 
    // action type and a null target_id is acceptable.
    // ALTERNATIVE: Create a system profile for cron actions.
    // For now, we'll skip the audit log for cron auto-close
    // and rely on the session's updated_at + resolution_mode as the audit trail.
    // The status transition OPEN→CLOSED with resolution_mode is the audit.

    processed++;
  }

  return NextResponse.json({ message: `Processed ${processed} sessions`, processed });
}
```

**Cron Audit Note:** The `admin_audit_log.admin_id` is `NOT NULL`, which prevents logging system-triggered actions. Two options:

| Option | Approach | Recommendation |
|--------|----------|----------------|
| A | Create a `SYSTEM` profile row in `profiles` for cron/automated actions | **Recommended** — clean audit trail |
| B | Make `admin_id` nullable and update the constraint | Breaking change to existing schema |
| C | Skip audit log for auto-close; rely on `session.resolution_mode` + `updated_at` as implicit audit | Acceptable for v1 |

**Recommended:** Option A — insert a system profile during migration:
```sql
-- In 00003_star_game_voting.sql, add:
-- A system profile for automated/cron actions (only if not exists)
INSERT INTO auth.users (id, email) 
  VALUES ('00000000-0000-0000-0000-000000000000', 'system@grandfoot.ball')
  ON CONFLICT (id) DO NOTHING;

INSERT INTO public.profiles (id, display_name, is_admin)
  VALUES ('00000000-0000-0000-0000-000000000000', 'System', true)
  ON CONFLICT (id) DO NOTHING;
```
**Note:** This may not work with Supabase Auth's auth.users table. A simpler alternative: make admin_id nullable for just the cron case, or use Option C for v1.

**Final Decision for v1:** Use **Option C** — the session's state transitions (status + resolution_mode + updated_at) are sufficient audit for auto-close. Admin-initiated closes still get full audit log entries.

---

## 10. Testing Strategy

### 10.1 Database-Level Tests (via `psql` or migration test)

| Test | Assertion |
|------|-----------|
| Insert session with duplicate season+gameweek | UNIQUE violation |
| Insert 3rd vote for same user+session | Trigger raises exception |
| Vote for fixture in wrong gameweek | Trigger raises exception |
| Vote for POSTPONED fixture | Trigger raises exception |
| `is_star_game_voting_open()` returns true for OPEN + future deadline | Boolean true |
| `is_star_game_voting_open()` returns false for OPEN + past deadline | Boolean false |
| `is_star_game_voting_open()` returns false for CLOSED session | Boolean false |
| `get_star_game_vote_results()` deterministic tie-breaking | Verify ROW_NUMBER ordering |
| RLS: non-admin cannot INSERT session | Policy violation |
| RLS: user cannot INSERT vote when session CLOSED | Policy violation |
| RLS: user cannot see other users' votes | Empty result set |
| RLS: admin can see all votes | Full result set |

### 10.2 Server Action Tests

| Test | Mock/Setup | Assertion |
|------|------------|-----------|
| `castStarGameVotes` with invalid UUIDs | Zod validation | Returns `{ error: '...' }` |
| `castStarGameVotes` with same fixture twice | Zod refine | Returns `{ error: 'You must select 2 different fixtures' }` |
| `castStarGameVotes` when session CLOSED | Mock session | Returns `{ error: 'Voting is closed...' }` |
| `castStarGameVotes` when deadline passed | Mock deadline | Returns `{ error: 'Voting is closed...' }` |
| `castStarGameVotes` happy path | Open session + valid fixtures | Returns `{ success: true }`, 2 rows in DB |
| Vote change (re-vote) | Existing votes | Old votes deleted, new votes inserted |
| `createStarGameVoteSession` for gameweek with 2 fixtures | 2 fixtures | Session created CLOSED, AUTO_ALL, both fixtures marked |
| `closeStarGameVoting` concurrent calls | Two parallel calls | One succeeds, one returns error |

### 10.3 Integration / E2E Tests

| Test | Flow |
|------|------|
| Full voting lifecycle | Admin creates → opens → user votes → cron closes → fixtures marked |
| Override flow | Community vote → admin overrides → different fixtures marked |
| Manual pick flow | Admin picks directly → fixtures marked, no voting |
| Edge case: 0 votes | Open → auto-close with no votes → NO_VOTES mode, no star games |

---

## Appendix A: Complete Migration File Reference

The complete, production-ready migration SQL is provided in **Section 1**. Key design decisions:

| Decision | Rationale |
|----------|-----------|
| Separate vote rows (not array) | Enables efficient SQL aggregation, indexing, and LEFT JOIN tallying |
| DB trigger for max-2 enforcement | Defense-in-depth alongside app validation |
| DB trigger for fixture-gameweek validation | Prevents data corruption even if app logic has a bug |
| `ROW_NUMBER()` over `RANK()` | Deterministic single-winner per position — no ties in output |
| `DELETE + INSERT` for vote changes | Simpler than UPDATE, RLS DELETE policy mirrors INSERT conditions |
| No UPDATE policy on votes | Eliminates partial-update bugs; atomic replace is cleaner |
| Partial index on `status = 'OPEN'` | Cron query only hits a tiny index for expired sessions |

## Appendix B: Query Patterns

### Get active voting session for a gameweek

```sql
SELECT s.*, 
       (SELECT COUNT(*) FROM star_game_votes v WHERE v.session_id = s.id) as total_votes,
       (SELECT COUNT(DISTINCT user_id) FROM star_game_votes v WHERE v.session_id = s.id) as unique_voters
FROM star_game_vote_sessions s
JOIN seasons se ON se.id = s.season_id AND se.is_active = true
WHERE s.gameweek = $1;
```

### Get user's vote status for a session

```sql
SELECT v.fixture_id, f.home_team, f.away_team
FROM star_game_votes v
JOIN fixtures f ON f.id = v.fixture_id
WHERE v.session_id = $1 AND v.user_id = $2;
```

### Admin: Get all votes with user details

```sql
SELECT p.display_name, 
       array_agg(f.home_team || ' vs ' || f.away_team ORDER BY f.kickoff_time) as picks
FROM star_game_votes v
JOIN profiles p ON p.id = v.user_id
JOIN fixtures f ON f.id = v.fixture_id
WHERE v.session_id = $1
GROUP BY p.id, p.display_name
ORDER BY p.display_name;
```

### Cron: Find expired sessions

```sql
SELECT id, season_id, gameweek
FROM star_game_vote_sessions
WHERE status = 'OPEN' AND deadline <= now();
```
