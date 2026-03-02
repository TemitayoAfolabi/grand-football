# Grand Football — Live Scores & Live Leaderboard: System Architecture

> **Document Owner:** Architecture & Security Agent
> **Last Updated:** 2026-03-01
> **Status:** Draft — Phase 2
> **Depends on:** [Strategy & Design Spec](../strategy/live-scores-leaderboard.md)

---

## Table of Contents

1. [Data Model Changes](#1-data-model-changes)
2. [API Design](#2-api-design)
3. [Supabase Realtime Architecture](#3-supabase-realtime-architecture)
4. [Client Architecture](#4-client-architecture)
5. [Security Controls](#5-security-controls)
6. [Sequence Diagrams](#6-sequence-diagrams)

---

## 1. Data Model Changes

### 1.1 New Columns on `fixtures` Table

Three new nullable columns store transient live data. They are written by the cron poller (service role) and cleared when the match finishes.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `live_home_score` | `smallint` | Yes | `NULL` | In-play home score (non-null only when `status IN ('IN_PLAY','PAUSED')`) |
| `live_away_score` | `smallint` | Yes | `NULL` | In-play away score |
| `match_minute` | `smallint` | Yes | `NULL` | Current match minute (e.g. `63`). `NULL` when not live or API doesn't provide it. |

**Invariants:**

- `live_home_score` / `live_away_score` are only non-NULL when `status IN ('IN_PLAY', 'PAUSED', 'SUSPENDED')`.
- When `status` transitions to `FINISHED`, the cron writes the final scores into the canonical `home_score` / `away_score` and sets the `live_*` columns to `NULL`.
- The client displays `live_home_score` when non-null; falls back to `home_score`.

### 1.2 New Table: `sync_log`

Audit/health table for the adaptive sync cron. One row per cron invocation.

```
sync_log
├── id              uuid PK
├── ran_at          timestamptz NOT NULL DEFAULT now()
├── mode            text NOT NULL  ('live' | 'match_day' | 'full' | 'skipped')
├── status          text NOT NULL  ('success' | 'error')
├── fixtures_updated integer NOT NULL DEFAULT 0
├── scores_calculated integer NOT NULL DEFAULT 0
├── api_calls_made  integer NOT NULL DEFAULT 0
├── error_message   text NULL
├── duration_ms     integer NOT NULL DEFAULT 0
└── created_at      timestamptz NOT NULL DEFAULT now()
```

### 1.3 New Indexes

```
idx_fixtures_live_active   — partial index for fast "any live matches?" check
idx_fixtures_kickoff_today — partial index for match-day detection
idx_sync_log_ran_at        — for admin health dashboard queries
```

### 1.4 Modified RLS Policies

**Predictions — post-kickoff visibility:**

The existing `predictions_select_own` policy restricts reads to `auth.uid() = user_id OR is_admin()`. For the live leaderboard, all authenticated users must see all predictions for fixtures that have kicked off.

**New policy** replaces the existing select policy with a compound rule:

```
predictions_select_own_or_kicked_off:
  USING (
    auth.uid() = user_id            -- own predictions always visible
    OR is_admin()                   -- admins see all
    OR kickoff_time <= now()        -- anyone post-kickoff (joined to fixtures)
  )
```

This is implemented via a helper function to avoid a sub-select in the policy.

### 1.5 Migration SQL

```sql
-- ============================================================================
-- Migration: 00010_live_scores.sql
-- Description: Add live score columns, sync_log table, indexes, and RLS
--              changes for the Live Scores & Live Leaderboard feature.
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
-- Used by the cron handler to decide mode (live vs match_day vs skip).
CREATE INDEX IF NOT EXISTS idx_fixtures_live_active
  ON public.fixtures (status)
  WHERE status IN ('IN_PLAY', 'PAUSED', 'SUSPENDED');

-- Fast lookup: "are there matches today?" for match-day detection.
CREATE INDEX IF NOT EXISTS idx_fixtures_kickoff_today
  ON public.fixtures (kickoff_time::date);

-- Compound index for the predictions post-kickoff query
-- (gameweek leaderboard fetches all predictions for a GW where kickoff <= now).
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

CREATE INDEX idx_sync_log_ran_at ON public.sync_log (ran_at DESC);

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

-- Used by the updated predictions RLS policy to check if a fixture has
-- kicked off, enabling post-kickoff prediction visibility for all users.
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

-- New policy: user can see own predictions always,
-- OR anyone can see predictions for fixtures that have kicked off,
-- OR admins can see all.
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

-- Add the fixtures table to the Supabase Realtime publication.
-- This allows clients to subscribe to INSERT/UPDATE events on fixtures.
-- (The default publication is `supabase_realtime`.)
ALTER PUBLICATION supabase_realtime ADD TABLE public.fixtures;

-- Note: The existing "fixtures_select_all" RLS policy already grants
-- SELECT to all authenticated users, which is required for Realtime
-- to deliver row payloads. No additional policy needed.


-- ============================================================================
-- 7. CONSTRAINT: live columns cleared on FINISHED
-- ============================================================================

-- Trigger to automatically clear live score columns when status → FINISHED.
-- This is a safety net — the cron handler should also do this.
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

-- Optional: run via a monthly cron or Supabase pg_cron extension.
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
```

### 1.6 Entity Relationship Additions

```
fixtures (updated)
├── ...existing columns...
├── live_home_score  smallint NULL  ─── transient, IN_PLAY/PAUSED only
├── live_away_score  smallint NULL  ─── transient, IN_PLAY/PAUSED only
└── match_minute     smallint NULL  ─── transient, IN_PLAY/PAUSED only

sync_log (new)
├── id               uuid PK
├── ran_at           timestamptz
├── mode             text  ('live'|'match_day'|'full'|'skipped')
├── status           text  ('success'|'error')
├── fixtures_updated integer
├── scores_calculated integer
├── api_calls_made   integer
├── error_message    text NULL
└── duration_ms      integer

Relationships:
  (none — sync_log is standalone audit table)
```

---

## 2. API Design

### 2.1 Modified Route: `POST /api/cron/sync-fixtures`

The existing cron route is refactored into an **adaptive multi-mode handler**. The Vercel cron schedule changes from `0 */6 * * *` to `* * * * *` (every minute). The handler self-throttles based on the current state.

#### Mode Detection Logic

```
┌────────────────────────────────┐
│ Query: any IN_PLAY/PAUSED      │
│ fixtures in DB?                │
├────────┬───────────────────────┤
│  Yes   │        No             │
│        │                       │
│  LIVE  │  Query: any fixtures  │
│  MODE  │  kicking off within   │
│        │  15 min? OR any       │
│        │  fixtures today?      │
│        ├──────┬────────────────┤
│        │ Yes  │      No        │
│        │      │                │
│        │ MATCH│   Check last   │
│        │  DAY │   full sync    │
│        │ MODE │   timestamp    │
│        │      ├───────┬────────┤
│        │      │ >6h   │ <6h   │
│        │      │ ago   │ ago   │
│        │      │       │       │
│        │      │ FULL  │ SKIP  │
│        │      │ MODE  │ MODE  │
└────────┴──────┴───────┴────────┘
```

| Mode | Frequency | API Call | Behaviour |
|------|-----------|----------|-----------|
| **LIVE** | Every 60s | `GET /v4/competitions/PL/matches?matchday={N}&status=LIVE,IN_PLAY,PAUSED,FINISHED` | Update `live_home_score`, `live_away_score`, `match_minute`, `status`. Trigger `calculate_fixture_scores()` for any newly FINISHED. |
| **MATCH_DAY** | Every 30 min (self-throttled) | `GET /v4/competitions/PL/matches?season=2025` | Full fixture sync. Handler checks `sync_log` — if last `match_day` or `full` sync was <30 min ago, returns `{ skipped: true }`. |
| **FULL** | Every 6h (self-throttled) | `GET /v4/competitions/PL/matches?season=2025` | Full fixture sync (same as today). Only runs if last sync >6h ago. |
| **SKIP** | — | None | Returns `{ skipped: true, reason: 'no_active_matches' }` in <100ms. |

#### Request

```
POST /api/cron/sync-fixtures
Authorization: Bearer {CRON_SECRET}
```

No body required.

#### Response (success)

```typescript
// LIVE mode response
{
  mode: 'live';
  fixturesUpdated: number;        // how many fixture rows were updated
  newlyFinished: string[];         // fixture IDs that transitioned to FINISHED
  scoresCalculated: number;        // score_records created from newly finished
  durationMs: number;
}

// MATCH_DAY or FULL mode response
{
  mode: 'match_day' | 'full';
  synced: number;
  newlyFinished: number;
  scoresCalculated: number;
  seasonId: string;
  durationMs: number;
}

// SKIP mode response
{
  mode: 'skipped';
  reason: string;
  durationMs: number;
}
```

#### Response (error)

```typescript
{
  error: string;
  mode?: string;
  durationMs?: number;
}
// HTTP 401 — missing/invalid CRON_SECRET
// HTTP 404 — no active season
// HTTP 429 — football-data.org rate limit hit (logged, non-fatal)
// HTTP 500 — unhandled error
// HTTP 502 — football-data.org API error
```

#### TypeScript Interfaces

```typescript
/** Sync mode determined by the adaptive handler */
export type SyncMode = 'live' | 'match_day' | 'full' | 'skipped';

/** Response from the sync-fixtures cron */
export interface SyncFixturesResponse {
  mode: SyncMode;
  fixturesUpdated?: number;
  synced?: number;
  newlyFinished?: string[] | number;
  scoresCalculated?: number;
  seasonId?: string;
  reason?: string;
  durationMs: number;
}

/** Internal: result of mode detection */
export interface SyncModeDetection {
  mode: SyncMode;
  activeFixtureCount: number;
  currentMatchday: number | null;
  lastSyncAge: number | null;  // milliseconds since last non-skip sync
}

/** football-data.org match with live fields */
export interface ApiMatchLive extends ApiMatch {
  minute: number | null;    // match minute, from API v4
  score: {
    fullTime: { home: number | null; away: number | null };
    halfTime: { home: number | null; away: number | null };
  };
}
```

#### Implementation Skeleton

```typescript
// src/app/api/cron/sync-fixtures/route.ts (refactored)

export async function POST(request: NextRequest) {
  const start = Date.now();

  // 1. Verify CRON_SECRET
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();

  try {
    // 2. Detect mode
    const detection = await detectSyncMode(supabase);

    // 3. Execute based on mode
    switch (detection.mode) {
      case 'live':
        return await handleLiveMode(supabase, detection, start);
      case 'match_day':
        return await handleMatchDayMode(supabase, start);
      case 'full':
        return await handleFullMode(supabase, start);
      case 'skipped':
        return await handleSkipMode(supabase, detection, start);
    }
  } catch (err) {
    await logSync(supabase, 'error', { ... });
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

async function detectSyncMode(supabase: SupabaseClient): Promise<SyncModeDetection> {
  // Check for active matches
  const { count: activeCount } = await supabase
    .from('fixtures')
    .select('id', { count: 'exact', head: true })
    .in('status', ['IN_PLAY', 'PAUSED', 'SUSPENDED']);

  if ((activeCount ?? 0) > 0) {
    // Find the current matchday from active fixtures
    const { data: activeFixture } = await supabase
      .from('fixtures')
      .select('gameweek')
      .in('status', ['IN_PLAY', 'PAUSED', 'SUSPENDED'])
      .limit(1)
      .single();

    return {
      mode: 'live',
      activeFixtureCount: activeCount ?? 0,
      currentMatchday: activeFixture?.gameweek ?? null,
      lastSyncAge: null,
    };
  }

  // Check for imminent kickoffs (within 15 min) or today's fixtures
  const now = new Date();
  const in15min = new Date(now.getTime() + 15 * 60 * 1000);

  const { count: imminentCount } = await supabase
    .from('fixtures')
    .select('id', { count: 'exact', head: true })
    .in('status', ['SCHEDULED', 'TIMED'])
    .lte('kickoff_time', in15min.toISOString())
    .gte('kickoff_time', now.toISOString());

  const { count: todayCount } = await supabase
    .from('fixtures')
    .select('id', { count: 'exact', head: true })
    .gte('kickoff_time', startOfDay(now).toISOString())
    .lt('kickoff_time', startOfDay(addDays(now, 1)).toISOString());

  // Check last sync time
  const { data: lastSync } = await supabase
    .from('sync_log')
    .select('ran_at, mode')
    .neq('mode', 'skipped')
    .order('ran_at', { ascending: false })
    .limit(1)
    .single();

  const lastSyncAge = lastSync
    ? now.getTime() - new Date(lastSync.ran_at).getTime()
    : Infinity;

  if ((imminentCount ?? 0) > 0 || (todayCount ?? 0) > 0) {
    // Match day — but only sync if last sync was >30 min ago
    if (lastSyncAge > 30 * 60 * 1000) {
      return { mode: 'match_day', activeFixtureCount: 0, currentMatchday: null, lastSyncAge };
    }
    return { mode: 'skipped', activeFixtureCount: 0, currentMatchday: null, lastSyncAge };
  }

  // Off-day — only sync if last sync was >6h ago
  if (lastSyncAge > 6 * 60 * 60 * 1000) {
    return { mode: 'full', activeFixtureCount: 0, currentMatchday: null, lastSyncAge };
  }

  return { mode: 'skipped', activeFixtureCount: 0, currentMatchday: null, lastSyncAge };
}

async function handleLiveMode(
  supabase: SupabaseClient,
  detection: SyncModeDetection,
  start: number,
): Promise<NextResponse> {
  const apiKey = process.env.FOOTBALL_DATA_API_KEY!;

  // Fetch only the active matchday with live/finished statuses
  const res = await fetch(
    `${FOOTBALL_DATA_BASE_URL}/competitions/PL/matches?matchday=${detection.currentMatchday}&status=LIVE,IN_PLAY,PAUSED,FINISHED`,
    { headers: { 'X-Auth-Token': apiKey }, cache: 'no-store' },
  );

  if (res.status === 429) {
    await logSync(supabase, 'error', { mode: 'live', errorMessage: 'Rate limited (429)', durationMs: Date.now() - start });
    return NextResponse.json({ error: 'Rate limited', mode: 'live' }, { status: 429 });
  }

  if (!res.ok) {
    throw new Error(`API responded with ${res.status}`);
  }

  const { matches } = (await res.json()) as { matches: ApiMatchLive[] };

  // Get existing fixture state to detect transitions
  const { data: existing } = await supabase
    .from('fixtures')
    .select('id, api_fixture_id, status, manually_overridden')
    .eq('gameweek', detection.currentMatchday!);

  const existingMap = new Map(
    (existing ?? []).map((f) => [f.api_fixture_id, f]),
  );

  let fixturesUpdated = 0;
  const newlyFinished: string[] = [];

  for (const match of matches) {
    const ex = existingMap.get(match.id);
    if (!ex || ex.manually_overridden) continue;

    const mappedStatus = mapApiStatus(match.status);
    const isNowFinished = mappedStatus === FIXTURE_STATUS.FINISHED;
    const wasNotFinished = ex.status !== FIXTURE_STATUS.FINISHED;

    if (isNowFinished) {
      // Transition to FINISHED — write canonical scores, clear live fields
      await supabase
        .from('fixtures')
        .update({
          status: FIXTURE_STATUS.FINISHED,
          home_score: match.score.fullTime.home,
          away_score: match.score.fullTime.away,
          live_home_score: null,
          live_away_score: null,
          match_minute: null,
        })
        .eq('id', ex.id);

      if (wasNotFinished) {
        newlyFinished.push(ex.id);
      }
    } else {
      // Still live — update live score fields
      await supabase
        .from('fixtures')
        .update({
          status: mappedStatus,
          live_home_score: match.score.fullTime.home ?? match.score.halfTime.home ?? 0,
          live_away_score: match.score.fullTime.away ?? match.score.halfTime.away ?? 0,
          match_minute: match.minute ?? null,
        })
        .eq('id', ex.id);
    }

    fixturesUpdated++;
  }

  // Auto-score newly finished fixtures
  let scoresCalculated = 0;
  for (const fid of newlyFinished) {
    const { data } = await supabase.rpc('calculate_fixture_scores', { p_fixture_id: fid });
    scoresCalculated += data ?? 0;
  }

  const durationMs = Date.now() - start;
  await logSync(supabase, 'success', {
    mode: 'live', fixturesUpdated, scoresCalculated,
    apiCalls: 1, durationMs,
  });

  return NextResponse.json({
    mode: 'live', fixturesUpdated, newlyFinished, scoresCalculated, durationMs,
  });
}
```

### 2.2 New Route: `GET /api/predictions/gameweek/[gameweek]`

Returns all users' predictions for fixtures that have kicked off in a given gameweek, plus any existing score_records for finished fixtures. This is the data source for client-side provisional scoring.

#### Request

```
GET /api/predictions/gameweek/28
Cookie: sb-access-token=... (authenticated via Supabase middleware)
```

#### Response

```typescript
interface GameweekPredictionsResponse {
  gameweek: number;
  seasonId: string;
  fixtures: FixtureSummary[];
  predictions: PredictionEntry[];
  scoreRecords: ScoreRecordEntry[];
  profiles: ProfileEntry[];
}

interface FixtureSummary {
  id: string;
  home_team: string;
  away_team: string;
  kickoff_time: string;
  status: string;
  home_score: number | null;       // canonical final score
  away_score: number | null;
  live_home_score: number | null;   // live in-play score
  live_away_score: number | null;
  match_minute: number | null;
  is_star_game: boolean;
}

interface PredictionEntry {
  user_id: string;
  fixture_id: string;
  home_score: number;
  away_score: number;
}

interface ScoreRecordEntry {
  user_id: string;
  fixture_id: string;
  points_awarded: number;
  reason_code: string;
}

interface ProfileEntry {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
}
```

#### Security

- **Authentication**: Required. Middleware redirects unauthenticated users.
- **Authorization**: Any authenticated user can call this endpoint. The query only returns predictions where `kickoff_time <= NOW()` (server enforced). Predictions for not-yet-kicked-off fixtures are excluded.
- **RLS**: The updated `predictions_select_own_or_kicked_off` policy ensures the Supabase query only returns permitted rows.

#### Implementation Skeleton

```typescript
// src/app/api/predictions/gameweek/[gameweek]/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

export async function GET(
  _request: NextRequest,
  { params }: { params: { gameweek: string } },
) {
  const gameweek = parseInt(params.gameweek, 10);
  if (isNaN(gameweek) || gameweek < 1 || gameweek > 50) {
    return NextResponse.json({ error: 'Invalid gameweek' }, { status: 400 });
  }

  const supabase = await createServerClient();

  // Get active season
  const { data: season } = await supabase
    .from('seasons')
    .select('id')
    .eq('is_active', true)
    .single();

  if (!season) {
    return NextResponse.json({ error: 'No active season' }, { status: 404 });
  }

  // Fetch fixtures for this gameweek
  const { data: fixtures } = await supabase
    .from('fixtures')
    .select(`
      id, home_team, away_team, kickoff_time, status,
      home_score, away_score, live_home_score, live_away_score,
      match_minute, is_star_game
    `)
    .eq('season_id', season.id)
    .eq('gameweek', gameweek)
    .order('kickoff_time', { ascending: true });

  // Fetch predictions for kicked-off fixtures only
  // RLS policy handles the filtering — but we also filter server-side for safety
  const kickedOffFixtureIds = (fixtures ?? [])
    .filter((f) => new Date(f.kickoff_time) <= new Date())
    .map((f) => f.id);

  let predictions: PredictionEntry[] = [];
  if (kickedOffFixtureIds.length > 0) {
    const { data } = await supabase
      .from('predictions')
      .select('user_id, fixture_id, home_score, away_score')
      .in('fixture_id', kickedOffFixtureIds);
    predictions = data ?? [];
  }

  // Fetch score_records for FINISHED fixtures
  const finishedFixtureIds = (fixtures ?? [])
    .filter((f) => f.status === 'FINISHED')
    .map((f) => f.id);

  let scoreRecords: ScoreRecordEntry[] = [];
  if (finishedFixtureIds.length > 0) {
    const { data } = await supabase
      .from('score_records')
      .select('user_id, fixture_id, points_awarded, reason_code')
      .in('fixture_id', finishedFixtureIds);
    scoreRecords = data ?? [];
  }

  // Fetch all profiles (for display_name in leaderboard)
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, display_name, avatar_url');

  return NextResponse.json({
    gameweek,
    seasonId: season.id,
    fixtures: fixtures ?? [],
    predictions,
    scoreRecords,
    profiles: (profiles ?? []).map((p) => ({
      user_id: p.id,
      display_name: p.display_name,
      avatar_url: p.avatar_url,
    })),
  });
}
```

### 2.3 New Route: `GET /api/fixtures/live`

Lightweight endpoint for the HTTP polling fallback when Realtime disconnects.

#### Request

```
GET /api/fixtures/live?gameweek=28
```

#### Response

```typescript
interface LiveFixturesResponse {
  fixtures: FixtureSummary[];    // same shape as above
  hasLiveMatches: boolean;
  timestamp: string;             // server timestamp for freshness check
}
```

Returns only fixtures for the specified gameweek that are `IN_PLAY`, `PAUSED`, `SUSPENDED`, or were `FINISHED` within the last 2 hours.

#### Implementation

```typescript
// src/app/api/fixtures/live/route.ts

export async function GET(request: NextRequest) {
  const gameweek = request.nextUrl.searchParams.get('gameweek');
  if (!gameweek) {
    return NextResponse.json({ error: 'gameweek required' }, { status: 400 });
  }

  const supabase = await createServerClient();

  const { data: season } = await supabase
    .from('seasons')
    .select('id')
    .eq('is_active', true)
    .single();

  if (!season) {
    return NextResponse.json({ error: 'No active season' }, { status: 404 });
  }

  const { data: fixtures } = await supabase
    .from('fixtures')
    .select(`
      id, home_team, away_team, kickoff_time, status,
      home_score, away_score, live_home_score, live_away_score,
      match_minute, is_star_game
    `)
    .eq('season_id', season.id)
    .eq('gameweek', parseInt(gameweek, 10))
    .in('status', ['IN_PLAY', 'PAUSED', 'SUSPENDED', 'FINISHED', 'TIMED', 'SCHEDULED']);

  const hasLiveMatches = (fixtures ?? []).some((f) =>
    ['IN_PLAY', 'PAUSED', 'SUSPENDED'].includes(f.status),
  );

  return NextResponse.json(
    { fixtures: fixtures ?? [], hasLiveMatches, timestamp: new Date().toISOString() },
    {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    },
  );
}
```

### 2.4 Cron Schedule Changes

**Updated `vercel.json`:**

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "crons": [
    {
      "path": "/api/cron/sync-fixtures",
      "schedule": "* * * * *"
    },
    {
      "path": "/api/cron/calculate-scores",
      "schedule": "5 */6 * * *"
    },
    {
      "path": "/api/cron/monthly-bonus",
      "schedule": "30 0 1 * *"
    },
    {
      "path": "/api/cron/close-star-votes",
      "schedule": "*/15 * * * *"
    }
  ]
}
```

**Change**: `sync-fixtures` moves from `0 */6 * * *` (every 6h) to `* * * * *` (every minute). The handler self-throttles using `sync_log` to achieve the adaptive frequency.

**Implication**: Requires Vercel Pro plan for >2 cron jobs AND every-minute scheduling. The handler is designed to return in <100ms for SKIP mode, so invocation costs are minimal.

---

## 3. Supabase Realtime Architecture

### 3.1 Channel Design

A single Supabase Realtime channel handles all fixture updates for the current gameweek.

```
Channel: postgres_changes
Table:   public.fixtures
Event:   UPDATE
Filter:  gameweek=eq.{currentGameweek}
```

**Why a single channel per gameweek?**
- Supabase Postgres Changes uses table-level subscriptions with row filters.
- Filtering by `gameweek` means clients only receive updates for the relevant gameweek (~10 fixtures), not all ~380 season fixtures.
- With ~14 concurrent users, each subscribed to 1 channel, total concurrent connections = ~14. Well within the 200 connection free-tier limit.

### 3.2 Subscription Setup (Client)

```typescript
// src/hooks/use-live-fixtures.ts

import { useEffect, useRef, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';

interface FixtureRow {
  id: string;
  status: string;
  home_score: number | null;
  away_score: number | null;
  live_home_score: number | null;
  live_away_score: number | null;
  match_minute: number | null;
  is_star_game: boolean;
  gameweek: number;
  updated_at: string;
}

type ConnectionStatus = 'connected' | 'reconnecting' | 'disconnected';

interface UseLiveFixturesReturn {
  fixtures: Map<string, FixtureRow>;
  connectionStatus: ConnectionStatus;
  lastUpdate: Date | null;
}

export function useLiveFixtures(
  gameweek: number,
  initialFixtures: FixtureRow[],
): UseLiveFixturesReturn {
  const supabase = createClient();
  const channelRef = useRef<RealtimeChannel | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const [fixtures, setFixtures] = useState<Map<string, FixtureRow>>(
    () => new Map(initialFixtures.map((f) => [f.id, f])),
  );
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('reconnecting');
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  // Fallback polling
  const startFallbackPolling = useCallback(() => {
    if (pollIntervalRef.current) return;
    pollIntervalRef.current = setInterval(async () => {
      const res = await fetch(`/api/fixtures/live?gameweek=${gameweek}`);
      if (res.ok) {
        const data = await res.json();
        setFixtures(new Map(data.fixtures.map((f: FixtureRow) => [f.id, f])));
        setLastUpdate(new Date());
      }
    }, 30_000);
  }, [gameweek]);

  const stopFallbackPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel(`fixtures-gw-${gameweek}`)
      .on<FixtureRow>(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'fixtures',
          filter: `gameweek=eq.${gameweek}`,
        },
        (payload: RealtimePostgresChangesPayload<FixtureRow>) => {
          const newRow = payload.new as FixtureRow;
          setFixtures((prev) => {
            const next = new Map(prev);
            next.set(newRow.id, newRow);
            return next;
          });
          setLastUpdate(new Date());
        },
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setConnectionStatus('connected');
          stopFallbackPolling();
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setConnectionStatus('disconnected');
          startFallbackPolling();
        } else if (status === 'CLOSED') {
          setConnectionStatus('disconnected');
        }
      });

    channelRef.current = channel;

    // Handle page visibility change (browser sleep)
    const handleVisibility = async () => {
      if (document.visibilityState === 'visible') {
        // Immediately fetch fresh data to catch up
        const res = await fetch(`/api/fixtures/live?gameweek=${gameweek}`);
        if (res.ok) {
          const data = await res.json();
          setFixtures(new Map(data.fixtures.map((f: FixtureRow) => [f.id, f])));
          setLastUpdate(new Date());
        }
        // Check channel status — reconnect if needed
        if (channelRef.current?.state !== 'joined') {
          channelRef.current?.subscribe();
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      stopFallbackPolling();
      channel.unsubscribe();
    };
  }, [gameweek, supabase, startFallbackPolling, stopFallbackPolling]);

  return { fixtures, connectionStatus, lastUpdate };
}
```

### 3.3 What Table Changes to Subscribe To

| Table | Event | Filter | Purpose |
|-------|-------|--------|---------|
| `fixtures` | `UPDATE` | `gameweek=eq.{N}` | Live score changes, status transitions |
| `score_records` | `INSERT` | `fixture_id=in.({ids})` | Final scores written after FINISHED (optional — can also detect via fixtures status change) |

**Note**: Only the `fixtures` subscription is strictly required. When the client sees `status = 'FINISHED'` in a fixture update, it knows to fetch updated `score_records` via a one-time HTTP call to `/api/predictions/gameweek/{N}` or wait for the page to re-render with server data.

**Enabling Realtime on `score_records` is NOT recommended** because:
- `score_records` contains `user_id` — Realtime would need RLS that allows all users to see all records, which conflicts with the existing `score_records_select_own` policy.
- Instead, the client detects FINISHED via the fixture status change and fetches final scores via the predictions/gameweek endpoint.

### 3.4 Payload Optimization

Supabase Realtime Postgres Changes sends the entire updated row by default. For the `fixtures` table, a row is ~500 bytes. With ~10 fixtures updating every 60s, total payload is ~5KB/min per client — negligible.

**Optimizations applied:**

1. **Gameweek filter**: Only receive updates for the current gameweek (not all 380 fixtures).
2. **No `old` record**: Supabase doesn't send the `old` record for `UPDATE` events by default (only `new`). This halves payload.
3. **Client-side dedup**: The client ignores updates where `updated_at` hasn't changed (same row written twice by the cron).
4. **No separate broadcast channel needed**: Postgres Changes is sufficient. A Broadcast channel would add complexity without benefit since the fixtures table already has all the data.

### 3.5 Realtime Publication Configuration

Already handled in the migration SQL (Section 1.5):

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE public.fixtures;
```

The existing `fixtures_select_all` RLS policy (`USING (true)` for authenticated users) is sufficient for Realtime to deliver payloads.

---

## 4. Client Architecture

### 4.1 Component Hierarchy

```
app/(authenticated)/page.tsx (Dashboard)
├── LiveMatchSection                    ← new: shows live fixture cards when matches active
│   ├── useLiveFixtures(gameweek)       ← Realtime hook
│   ├── LiveFixtureCard                 ← enhanced FixtureCard with live score + animation
│   │   ├── LiveBadge                   ← pulsing red dot + "LIVE" / "HT"
│   │   ├── ScoreDisplay                ← animated score updates
│   │   └── ProvisionalPoints           ← client-computed points vs user's prediction
│   └── ConnectionStatusIndicator       ← green/amber dot for Realtime status
├── StatCardGrid (existing)
└── RecentResults / UpcomingFixtures (existing)

app/(authenticated)/fixtures/page.tsx
├── GameweekSelector (existing)
├── useLiveFixtures(gameweek)
└── FixtureList
    └── LiveFixtureCard (or standard FixtureCard for non-live)

app/(authenticated)/leaderboard/page.tsx
├── TabSwitcher                         ← adds "Live GW" tab
│   ├── LiveGWTab                       ← new
│   ├── WeeklyTab (existing)
│   ├── SeasonTab (existing)
│   └── MonthlyTab (existing)
├── LiveBanner                          ← "provisional points" disclaimer
├── GameweekStatusBar                   ← "GW28 · 4/10 live · 2/10 finished"
└── LiveLeaderboardTable                ← new
    ├── useLiveFixtures(gameweek)       ← Realtime hook (shared context)
    ├── useGameweekPredictions(gw)      ← fetches all users' predictions
    ├── useProvisionalScoring()         ← computes live scores for all users
    └── LiveLeaderboardRow[]
        ├── RankBadge
        ├── PositionDelta               ← ▲/▼ vs confirmed rank
        ├── DisplayName + YouIndicator
        ├── TotalPoints (confirmed + provisional)
        └── ExpandableBreakdown         ← per-fixture detail (tap to expand)

app/(authenticated)/match/[fixtureId]/page.tsx
├── useLiveFixtures(gameweek)
├── LiveFixtureDetail                   ← enhanced match page
│   ├── LiveScoreHeader
│   ├── PredictionComparison
│   └── ProvisionalPointsCard
└── OtherPredictions                    ← show all users' predictions post-kickoff
```

### 4.2 State Management Approach

**No global state library** — use React context + hooks for live data sharing.

```typescript
// src/contexts/live-fixtures-context.tsx

'use client';

import { createContext, useContext, type ReactNode } from 'react';
import { useLiveFixtures, type UseLiveFixturesReturn } from '@/hooks/use-live-fixtures';

interface LiveFixturesContextValue extends UseLiveFixturesReturn {
  gameweek: number;
  hasLiveMatches: boolean;
}

const LiveFixturesContext = createContext<LiveFixturesContextValue | null>(null);

export function LiveFixturesProvider({
  gameweek,
  initialFixtures,
  children,
}: {
  gameweek: number;
  initialFixtures: FixtureRow[];
  children: ReactNode;
}) {
  const live = useLiveFixtures(gameweek, initialFixtures);

  const hasLiveMatches = Array.from(live.fixtures.values()).some((f) =>
    ['IN_PLAY', 'PAUSED', 'SUSPENDED'].includes(f.status),
  );

  return (
    <LiveFixturesContext.Provider value={{ ...live, gameweek, hasLiveMatches }}>
      {children}
    </LiveFixturesContext.Provider>
  );
}

export function useLiveFixturesContext() {
  const ctx = useContext(LiveFixturesContext);
  if (!ctx) {
    throw new Error('useLiveFixturesContext must be used within LiveFixturesProvider');
  }
  return ctx;
}
```

**Provider placement**: In the authenticated layout, wrapping the main content area:

```typescript
// src/app/(authenticated)/layout.tsx  (modified)

export default async function AuthenticatedLayout({ children }: { children: ReactNode }) {
  const supabase = await createServerClient();

  // Determine current gameweek (server-side)
  const { data: currentGW } = await supabase.rpc('get_current_gameweek');
  const gameweek = currentGW ?? 1;

  // Fetch initial fixture data (server-side, for SSR)
  const { data: initialFixtures } = await supabase
    .from('fixtures')
    .select('id, status, home_score, away_score, live_home_score, live_away_score, match_minute, is_star_game, gameweek, updated_at')
    .eq('gameweek', gameweek);

  return (
    <LiveFixturesProvider gameweek={gameweek} initialFixtures={initialFixtures ?? []}>
      <Nav />
      <main>{children}</main>
    </LiveFixturesProvider>
  );
}
```

### 4.3 Provisional Scoring — Client-Side

The existing `calculatePoints()` function is pure and stateless. The live leaderboard computes provisional scores by running it against live score data + all users' predictions.

```typescript
// src/hooks/use-provisional-scoring.ts

import { useMemo } from 'react';
import { calculatePoints } from '@/lib/scoring/engine';
import type { FixtureRow } from '@/hooks/use-live-fixtures';
import type { PredictionEntry, ScoreRecordEntry, ProfileEntry } from '@/types/live';

interface ProvisionalLeaderboardEntry {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  confirmedPoints: number;    // from score_records (FINISHED fixtures)
  provisionalPoints: number;  // from live scoring (IN_PLAY/PAUSED fixtures)
  totalPoints: number;        // confirmed + provisional
  exactCount: number;
  outcomeCount: number;
  fixtureBreakdown: FixtureBreakdown[];
}

interface FixtureBreakdown {
  fixtureId: string;
  homeTeam: string;
  awayTeam: string;
  status: string;
  actualHome: number | null;
  actualAway: number | null;
  predictedHome: number | null;
  predictedAway: number | null;
  points: number;
  reasonCode: string;
  isProvisional: boolean;
  matchMinute: number | null;
}

export function useProvisionalScoring(
  fixtures: Map<string, FixtureRow>,
  predictions: PredictionEntry[],
  scoreRecords: ScoreRecordEntry[],
  profiles: ProfileEntry[],
): ProvisionalLeaderboardEntry[] {
  return useMemo(() => {
    // Index predictions by `${userId}-${fixtureId}`
    const predIndex = new Map<string, PredictionEntry>();
    for (const p of predictions) {
      predIndex.set(`${p.user_id}-${p.fixture_id}`, p);
    }

    // Index score records by `${userId}-${fixtureId}`
    const scoreIndex = new Map<string, ScoreRecordEntry>();
    for (const sr of scoreRecords) {
      scoreIndex.set(`${sr.user_id}-${sr.fixture_id}`, sr);
    }

    // Separate fixtures into finished vs live
    const finishedFixtures: FixtureRow[] = [];
    const liveFixtures: FixtureRow[] = [];

    for (const f of fixtures.values()) {
      if (f.status === 'FINISHED') {
        finishedFixtures.push(f);
      } else if (['IN_PLAY', 'PAUSED', 'SUSPENDED'].includes(f.status)) {
        liveFixtures.push(f);
      }
    }

    // Compute per-user scores
    const entries: ProvisionalLeaderboardEntry[] = profiles.map((profile) => {
      let confirmedPoints = 0;
      let provisionalPoints = 0;
      let exactCount = 0;
      let outcomeCount = 0;
      const breakdown: FixtureBreakdown[] = [];

      // Finished fixtures — use score_records
      for (const f of finishedFixtures) {
        const sr = scoreIndex.get(`${profile.user_id}-${f.id}`);
        const pred = predIndex.get(`${profile.user_id}-${f.id}`);
        const points = sr?.points_awarded ?? 0;
        confirmedPoints += points;

        if (sr?.reason_code?.includes('EXACT')) exactCount++;
        if (sr?.reason_code === 'OUTCOME' || sr?.reason_code === 'STAR_OUTCOME') outcomeCount++;

        breakdown.push({
          fixtureId: f.id,
          homeTeam: '', // filled by caller
          awayTeam: '',
          status: f.status,
          actualHome: f.home_score,
          actualAway: f.away_score,
          predictedHome: pred?.home_score ?? null,
          predictedAway: pred?.away_score ?? null,
          points,
          reasonCode: sr?.reason_code ?? 'NO_PREDICTION',
          isProvisional: false,
          matchMinute: null,
        });
      }

      // Live fixtures — compute provisional using calculatePoints
      for (const f of liveFixtures) {
        const pred = predIndex.get(`${profile.user_id}-${f.id}`);
        const liveHome = f.live_home_score ?? 0;
        const liveAway = f.live_away_score ?? 0;

        let points = 0;
        let reasonCode = 'NO_PREDICTION';

        if (pred) {
          const result = calculatePoints(
            { homeScore: pred.home_score, awayScore: pred.away_score },
            { homeScore: liveHome, awayScore: liveAway },
            f.is_star_game,
          );
          points = result.points;
          reasonCode = result.reasonCode;

          if (reasonCode.includes('EXACT')) exactCount++;
          if (reasonCode === 'OUTCOME' || reasonCode === 'STAR_OUTCOME') outcomeCount++;
        }

        provisionalPoints += points;

        breakdown.push({
          fixtureId: f.id,
          homeTeam: '',
          awayTeam: '',
          status: f.status,
          actualHome: liveHome,
          actualAway: liveAway,
          predictedHome: pred?.home_score ?? null,
          predictedAway: pred?.away_score ?? null,
          points,
          reasonCode,
          isProvisional: true,
          matchMinute: f.match_minute,
        });
      }

      return {
        userId: profile.user_id,
        displayName: profile.display_name,
        avatarUrl: profile.avatar_url,
        confirmedPoints,
        provisionalPoints,
        totalPoints: confirmedPoints + provisionalPoints,
        exactCount,
        outcomeCount,
        fixtureBreakdown: breakdown,
      };
    });

    // Sort by total points DESC, then exact count DESC, then outcome count DESC
    entries.sort((a, b) => {
      if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
      if (b.exactCount !== a.exactCount) return b.exactCount - a.exactCount;
      return b.outcomeCount - a.outcomeCount;
    });

    return entries;
  }, [fixtures, predictions, scoreRecords, profiles]);
}
```

### 4.4 Data Fetching Flow for Live Leaderboard

```
1. Page Mount (Server Component)
   └── SSR: fetch fixtures, predictions (kicked-off), score_records, profiles
       └── Pass as props to Client Component

2. Client Mount
   ├── Initialize LiveFixturesProvider with SSR data
   ├── Subscribe to Supabase Realtime (fixtures, current GW)
   └── useProvisionalScoring() computes initial leaderboard

3. Live Update (Realtime event)
   ├── useLiveFixtures → fixture Map updated
   ├── useProvisionalScoring() recomputes (useMemo deps change)
   └── React re-renders → LeaderboardRow animations

4. Match Finishes (status → FINISHED)
   ├── Realtime delivers fixture with status='FINISHED'
   ├── Client triggers refetch of /api/predictions/gameweek/{N}
   │   (to get newly written score_records)
   └── useProvisionalScoring() now uses score_records for that fixture
       instead of provisional calculation
```

### 4.5 Key Hook: `useGameweekPredictions`

```typescript
// src/hooks/use-gameweek-predictions.ts

'use client';

import { useEffect, useState, useCallback } from 'react';
import type {
  GameweekPredictionsResponse,
  PredictionEntry,
  ScoreRecordEntry,
  ProfileEntry,
  FixtureSummary,
} from '@/types/live';

export function useGameweekPredictions(gameweek: number) {
  const [data, setData] = useState<GameweekPredictionsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/predictions/gameweek/${gameweek}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: GameweekPredictionsResponse = await res.json();
      setData(json);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [gameweek]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Expose refetch for use when a match finishes
  return {
    predictions: data?.predictions ?? [],
    scoreRecords: data?.scoreRecords ?? [],
    profiles: data?.profiles ?? [],
    fixtureSummaries: data?.fixtures ?? [],
    loading,
    error,
    refetch: fetchData,
  };
}
```

### 4.6 Shared TypeScript Types

```typescript
// src/types/live.ts

export interface FixtureRow {
  id: string;
  status: string;
  home_score: number | null;
  away_score: number | null;
  live_home_score: number | null;
  live_away_score: number | null;
  match_minute: number | null;
  is_star_game: boolean;
  gameweek: number;
  updated_at: string;
}

export interface FixtureSummary extends FixtureRow {
  home_team: string;
  away_team: string;
  kickoff_time: string;
}

export interface PredictionEntry {
  user_id: string;
  fixture_id: string;
  home_score: number;
  away_score: number;
}

export interface ScoreRecordEntry {
  user_id: string;
  fixture_id: string;
  points_awarded: number;
  reason_code: string;
}

export interface ProfileEntry {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
}

export interface GameweekPredictionsResponse {
  gameweek: number;
  seasonId: string;
  fixtures: FixtureSummary[];
  predictions: PredictionEntry[];
  scoreRecords: ScoreRecordEntry[];
  profiles: ProfileEntry[];
}

export interface ProvisionalLeaderboardEntry {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  confirmedPoints: number;
  provisionalPoints: number;
  totalPoints: number;
  exactCount: number;
  outcomeCount: number;
  fixtureBreakdown: FixtureBreakdown[];
}

export interface FixtureBreakdown {
  fixtureId: string;
  homeTeam: string;
  awayTeam: string;
  status: string;
  actualHome: number | null;
  actualAway: number | null;
  predictedHome: number | null;
  predictedAway: number | null;
  points: number;
  reasonCode: string;
  isProvisional: boolean;
  matchMinute: number | null;
}

export type ConnectionStatus = 'connected' | 'reconnecting' | 'disconnected';
```

---

## 5. Security Controls

### 5.1 RLS Policies for Prediction Visibility Post-Kickoff

**Threat**: A user could try to read other users' predictions for not-yet-kicked-off fixtures to gain an advantage.

**Control**: The updated RLS policy ensures predictions are only visible to other users AFTER the fixture has kicked off:

```sql
-- Replaces the existing predictions_select_own policy
CREATE POLICY "predictions_select_own_or_kicked_off"
  ON public.predictions FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id                       -- always see own
    OR public.is_admin()                       -- admin sees all
    OR public.is_fixture_kicked_off(fixture_id) -- everyone sees post-kickoff
  );
```

**Defense in depth**: The API endpoint (`GET /api/predictions/gameweek/{N}`) also filters server-side:

```typescript
const kickedOffFixtureIds = fixtures
  .filter((f) => new Date(f.kickoff_time) <= new Date())
  .map((f) => f.id);
```

Both layers must pass for prediction data to be returned.

**INSERT/UPDATE policies remain unchanged**: Users can only insert/update their own predictions, and only before kickoff (`is_fixture_open(fixture_id)`).

### 5.2 Rate Limiting

#### 5.2.1 Cron Endpoint (`POST /api/cron/sync-fixtures`)

**Existing control**: `CRON_SECRET` bearer token. No change to this mechanism.

**New control**: The handler self-rate-limits using `sync_log`:
- LIVE mode: max 1 API call per 55 seconds (checked via `sync_log.ran_at`)
- MATCH_DAY mode: max 1 API call per 28 minutes
- FULL mode: max 1 API call per 5.5 hours

If the handler detects it ran too recently, it returns `{ skipped: true }` without calling the external API.

```typescript
// Internal rate limit check
async function shouldSkipDueToRateLimit(
  supabase: SupabaseClient,
  mode: SyncMode,
): Promise<boolean> {
  const minIntervals: Record<SyncMode, number> = {
    live: 55_000,          // 55 seconds
    match_day: 28 * 60_000, // 28 minutes
    full: 5.5 * 3600_000,   // 5.5 hours
    skipped: 0,
  };

  const { data: lastRun } = await supabase
    .from('sync_log')
    .select('ran_at')
    .eq('mode', mode)
    .eq('status', 'success')
    .order('ran_at', { ascending: false })
    .limit(1)
    .single();

  if (!lastRun) return false;

  const elapsed = Date.now() - new Date(lastRun.ran_at).getTime();
  return elapsed < minIntervals[mode];
}
```

#### 5.2.2 Predictions Endpoint (`GET /api/predictions/gameweek/{N}`)

**Rate limit**: This endpoint is called once on page mount and then on match finishes (~10 times per gameweek day). No aggressive rate limiting needed.

**Defense**: Standard Next.js middleware authentication required. The endpoint is read-only and returns data the user is authorized to see (via RLS). If abuse is detected, add Vercel Edge middleware rate limiting:

```typescript
// Optional: rate limit via headers (Vercel Edge)
const RATE_LIMIT_WINDOW = 60_000; // 1 minute
const RATE_LIMIT_MAX = 30;        // 30 requests per minute per user
```

For now, **no explicit rate limiting** on this endpoint. The ~14-user private league doesn't warrant it. Monitor via Vercel Analytics.

#### 5.2.3 Live Fixtures Endpoint (`GET /api/fixtures/live`)

**Rate limit**: This is the fallback polling endpoint. Clients poll every 30 seconds when Realtime is disconnected. With 14 users, worst case = 28 req/min. No rate limit needed.

**Cache header**: `Cache-Control: no-store, max-age=0` prevents CDN/browser caching of stale live data.

### 5.3 CRON_SECRET Protection

**Existing mechanism** (unchanged):

```typescript
const authHeader = request.headers.get('authorization');
if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}
```

**Additional hardening for the now-every-minute cron**:

1. **Environment variable**: `CRON_SECRET` is set in Vercel project settings (encrypted at rest). Never committed to version control.

2. **Middleware exclusion**: The existing middleware config already excludes `/api/cron` from authentication middleware:
   ```typescript
   '/((?!_next|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$|api/cron).*)',
   ```

3. **Vercel Cron origin verification**: Vercel cron requests include the `x-vercel-cron-token` header. For additional safety, verify this too:
   ```typescript
   // Optional: verify Vercel cron origin
   const vercelCronToken = request.headers.get('x-vercel-cron-token');
   if (vercelCronToken && vercelCronToken !== process.env.CRON_SECRET) {
     // Log suspicious request
   }
   ```

4. **IP allowlisting** (optional, Vercel Pro): Restrict `/api/cron/*` to Vercel's internal IP range.

### 5.4 Supabase Realtime Channel Security

**Threat model**: An unauthenticated or unauthorized user subscribes to Realtime channels and receives fixture data or prediction data.

**Controls**:

1. **Authentication required**: Supabase Realtime connections require a valid JWT (anon key or user JWT). The `createClient()` function uses `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Realtime subscriptions are only established after the user is authenticated (the `LiveFixturesProvider` is inside the authenticated layout).

2. **RLS enforcement**: Supabase Realtime respects RLS policies. The `fixtures_select_all` policy requires `authenticated` role. Anonymous connections cannot receive fixture updates.

3. **No sensitive data in fixture payloads**: The `fixtures` table contains public match data (teams, scores, status). Even if intercepted, there's no sensitive user data.

4. **Predictions NOT broadcast via Realtime**: We deliberately chose NOT to enable Realtime on the `predictions` table. Prediction data is fetched via the authenticated API endpoint with server-side filtering. This prevents any possibility of pre-kickoff prediction leaks via Realtime.

5. **Channel naming**: Channels are named `fixtures-gw-{N}`. These are Postgres Changes channels (not Broadcast), so the channel name doesn't matter for security — Supabase enforces RLS on the underlying table query.

6. **Connection limits**: Supabase free tier allows 200 concurrent Realtime connections. With 14 users, each having 1 connection, we're at 7% utilization. No amplification attack risk in a private league.

### 5.5 Data Integrity Safeguards

| Concern | Safeguard |
|---------|-----------|
| Live scores overwriting final scores | `live_home_score`/`live_away_score` are separate columns. Canonical `home_score`/`away_score` are only written on FINISHED transition. Trigger `on_fixture_finished` clears live columns. |
| Provisional scores confused with final | Provisional scoring is client-side only — never written to `score_records`. `score_records` only contains final scores from `calculate_fixture_scores()`. |
| Cron running twice simultaneously | `sync_log` rate limiting prevents duplicate API calls. DB writes are idempotent (upsert on `api_fixture_id`). |
| `calculate_fixture_scores` called on non-FINISHED | The function raises an exception if `status <> 'FINISHED'`. The cron only calls it after verifying the transition. |
| `manually_overridden` fixtures | The cron skips fixtures where `manually_overridden = true`, preserving admin overrides. |

### 5.6 Environment Variables Summary

| Variable | Used By | Sensitivity | Where Set |
|----------|---------|-------------|-----------|
| `CRON_SECRET` | Cron routes | High | Vercel env (encrypted) |
| `FOOTBALL_DATA_API_KEY` | Sync cron | Medium | Vercel env (encrypted) |
| `NEXT_PUBLIC_SUPABASE_URL` | Client Supabase | Low (public) | Vercel env |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Client Supabase | Low (public, RLS-protected) | Vercel env |
| `SUPABASE_SERVICE_ROLE_KEY` | Admin client (cron) | Critical | Vercel env (encrypted) |

No new environment variables are required for the live scores feature.

---

## 6. Sequence Diagrams

### 6.1 Live Score Polling Flow

```
┌──────────┐      ┌────────────┐     ┌─────────────────┐    ┌──────────┐
│  Vercel   │      │  sync-     │     │  football-      │    │ Supabase │
│  Cron     │      │  fixtures  │     │  data.org API   │    │ Postgres │
│ (1/min)   │      │  handler   │     │                 │    │          │
└─────┬─────┘      └──────┬─────┘     └────────┬────────┘    └────┬─────┘
      │                   │                     │                  │
      │  POST /api/cron/  │                     │                  │
      │  sync-fixtures    │                     │                  │
      │  Authorization:   │                     │                  │
      │  Bearer {SECRET}  │                     │                  │
      │──────────────────>│                     │                  │
      │                   │                     │                  │
      │                   │  SELECT COUNT(*)    │                  │
      │                   │  FROM fixtures      │                  │
      │                   │  WHERE status IN    │                  │
      │                   │  ('IN_PLAY',...)    │                  │
      │                   │────────────────────────────────────────>│
      │                   │                     │                  │
      │                   │  count = 3          │                  │
      │                   │<────────────────────────────────────────│
      │                   │                     │                  │
      │                   │  [MODE = LIVE]      │                  │
      │                   │                     │                  │
      │                   │  Check sync_log:    │                  │
      │                   │  last 'live' run?   │                  │
      │                   │────────────────────────────────────────>│
      │                   │                     │                  │
      │                   │  55s ago (OK)       │                  │
      │                   │<────────────────────────────────────────│
      │                   │                     │                  │
      │                   │  GET /v4/competitions│                 │
      │                   │  /PL/matches?       │                  │
      │                   │  matchday=28&status=│                  │
      │                   │  LIVE,IN_PLAY,...   │                  │
      │                   │────────────────────>│                  │
      │                   │                     │                  │
      │                   │  200 OK             │                  │
      │                   │  { matches: [...] } │                  │
      │                   │<────────────────────│                  │
      │                   │                     │                  │
      │                   │  For each match:    │                  │
      │                   │  UPDATE fixtures    │                  │
      │                   │  SET live_home_score│                  │
      │                   │  live_away_score,   │                  │
      │                   │  match_minute,      │                  │
      │                   │  status             │                  │
      │                   │────────────────────────────────────────>│
      │                   │                     │                  │
      │                   │                     │  DB write triggers│
      │                   │                     │  Realtime event   │
      │                   │                     │  to all subscribed│
      │                   │                     │  clients          │
      │                   │                     │                  │
      │                   │  INSERT sync_log    │                  │
      │                   │  (mode='live',      │                  │
      │                   │   status='success') │                  │
      │                   │────────────────────────────────────────>│
      │                   │                     │                  │
      │  200 OK           │                     │                  │
      │  { mode: 'live',  │                     │                  │
      │    fixturesUpdated│                     │                  │
      │    : 3 }          │                     │                  │
      │<──────────────────│                     │                  │
```

### 6.2 Client Receiving Live Update and Recalculating Leaderboard

```
┌──────────┐     ┌──────────────┐    ┌────────────────┐    ┌──────────────────┐
│ Supabase │     │ useLive      │    │ useProvisional │    │ LiveLeaderboard  │
│ Realtime │     │ Fixtures     │    │ Scoring        │    │ Table (React)    │
│ Channel  │     │ Hook         │    │ Hook           │    │                  │
└─────┬────┘     └──────┬───────┘    └───────┬────────┘    └────────┬─────────┘
      │                 │                     │                      │
      │  postgres_changes│                    │                      │
      │  event: UPDATE  │                     │                      │
      │  table: fixtures│                     │                      │
      │  payload: {     │                     │                      │
      │    new: {       │                     │                      │
      │      id: "abc", │                     │                      │
      │      live_home: │                     │                      │
      │        2,       │                     │                      │
      │      live_away: │                     │                      │
      │        1,       │                     │                      │
      │      minute: 67,│                     │                      │
      │      status:    │                     │                      │
      │        "IN_PLAY"│                     │                      │
      │    }            │                     │                      │
      │  }              │                     │                      │
      │────────────────>│                     │                      │
      │                 │                     │                      │
      │                 │  setFixtures(       │                      │
      │                 │    Map.set("abc",   │                      │
      │                 │    newRow)           │                      │
      │                 │  )                  │                      │
      │                 │                     │                      │
      │                 │  fixtures Map       │                      │
      │                 │  changed (useMemo   │                      │
      │                 │  dependency)        │                      │
      │                 │────────────────────>│                      │
      │                 │                     │                      │
      │                 │                     │  For each user:      │
      │                 │                     │  For each live       │
      │                 │                     │  fixture:            │
      │                 │                     │    calculatePoints(  │
      │                 │                     │      predicted,      │
      │                 │                     │      { home: 2,      │
      │                 │                     │        away: 1 },    │
      │                 │                     │      isStarGame      │
      │                 │                     │    )                 │
      │                 │                     │                      │
      │                 │                     │  Sort by total_pts   │
      │                 │                     │  DESC                │
      │                 │                     │                      │
      │                 │                     │  Return sorted       │
      │                 │                     │  entries[]           │
      │                 │                     │─────────────────────>│
      │                 │                     │                      │
      │                 │                     │                      │  Re-render rows
      │                 │                     │                      │  with animation:
      │                 │                     │                      │  - Score flash
      │                 │                     │                      │  - Row reorder
      │                 │                     │                      │  - Rank delta
      │                 │                     │                      │  update
      │                 │                     │                      │
```

**Timing**: End-to-end from DB write to UI update is ~1–3 seconds:
- DB write → Realtime event: ~500ms
- Realtime delivery to client: ~200ms
- `useMemo` recomputation: <5ms (14 users × 10 fixtures = 140 calculations)
- React re-render: ~50ms

### 6.3 Transition from Live to Final Scores

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────────┐
│ football │     │ sync-    │     │ Supabase │     │ Client   │     │ Client       │
│ data.org │     │ fixtures │     │ Postgres │     │ useLive  │     │ Leaderboard  │
│ API      │     │ cron     │     │ + RT     │     │ Fixtures │     │ UI           │
└────┬─────┘     └────┬─────┘     └────┬─────┘     └────┬─────┘     └──────┬───────┘
     │                │                │                 │                   │
     │ Match ends     │                │                 │                   │
     │ (real world)   │                │                 │                   │
     │                │                │                 │                   │
     │        ~60s later...            │                 │                   │
     │                │                │                 │                   │
     │  GET /matches? │                │                 │                   │
     │  matchday=28&  │                │                 │                   │
     │  status=...    │                │                 │                   │
     │<───────────────│                │                 │                   │
     │                │                │                 │                   │
     │  200 OK        │                │                 │                   │
     │  match.status  │                │                 │                   │
     │  = "FINISHED"  │                │                 │                   │
     │  fullTime:     │                │                 │                   │
     │  { home:2,     │                │                 │                   │
     │    away:1 }    │                │                 │                   │
     │───────────────>│                │                 │                   │
     │                │                │                 │                   │
     │                │  UPDATE fixtures                 │                   │
     │                │  SET status='FINISHED',          │                   │
     │                │  home_score=2, away_score=1,     │                   │
     │                │  live_home_score=NULL,           │                   │
     │                │  live_away_score=NULL,           │                   │
     │                │  match_minute=NULL               │                   │
     │                │───────────────>│                 │                   │
     │                │                │                 │                   │
     │                │                │  Realtime:      │                   │
     │                │                │  fixture UPDATE  │                  │
     │                │                │  status=FINISHED │                  │
     │                │                │────────────────>│                   │
     │                │                │                 │                   │
     │                │                │                 │  Detect FINISHED  │
     │                │                │                 │  transition       │
     │                │                │                 │                   │
     │                │  RPC: calculate_fixture_scores   │                   │
     │                │  (p_fixture_id = "abc")          │                   │
     │                │───────────────>│                 │                   │
     │                │                │                 │                   │
     │                │                │  INSERT/UPSERT  │                   │
     │                │                │  score_records  │                   │
     │                │                │  (14 rows)      │                   │
     │                │                │                 │                   │
     │                │  return count  │                 │                   │
     │                │<───────────────│                 │                   │
     │                │                │                 │                   │
     │                │                │                 │  Client detects   │
     │                │                │                 │  FINISHED →       │
     │                │                │                 │  refetch()        │
     │                │                │                 │                   │
     │                │                │                 │  GET /api/        │
     │                │                │                 │  predictions/     │
     │                │                │                 │  gameweek/28      │
     │                │                │                 │─────────────────> │
     │                │                │                 │                   │
     │                │                │                 │  Response includes│
     │                │                │                 │  score_records    │
     │                │                │                 │  for fixture "abc"│
     │                │                │                 │<─────────────────│
     │                │                │                 │                   │
     │                │                │                 │  useProvisional   │
     │                │                │                 │  Scoring now uses │
     │                │                │                 │  score_records    │
     │                │                │                 │  (not calc) for   │
     │                │                │                 │  this fixture     │
     │                │                │                 │                   │
     │                │                │                 │──────────────────>│
     │                │                │                 │                   │
     │                │                │                 │    Replace        │
     │                │                │                 │    "provisional"  │
     │                │                │                 │    with "FINAL"   │
     │                │                │                 │    badge          │
     │                │                │                 │                   │
     │                │                │                 │    Animate:       │
     │                │                │                 │    - LIVE→FT badge│
     │                │                │                 │    - Points flash │
     │                │                │                 │    - Leaderboard  │
     │                │                │                 │      re-rank      │
     │                │                │                 │                   │
     │                │                │                 │    Toast:         │
     │                │                │                 │    "Match finished│
     │                │                │                 │    ARS 2-1 CHE —  │
     │                │                │                 │    You scored     │
     │                │                │                 │    +3 pts!"       │
```

### 6.4 Fallback: Realtime Disconnection and Recovery

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│ Supabase     │     │ useLive      │     │ UI           │
│ Realtime     │     │ Fixtures     │     │              │
│              │     │ Hook         │     │              │
└──────┬───────┘     └──────┬───────┘     └──────┬───────┘
       │                    │                     │
       │  CHANNEL_ERROR /   │                     │
       │  TIMED_OUT         │                     │
       │───────────────────>│                     │
       │                    │                     │
       │                    │  setConnectionStatus│
       │                    │  ('disconnected')   │
       │                    │────────────────────>│
       │                    │                     │
       │                    │                     │  Show amber banner:
       │                    │                     │  "Live updates paused
       │                    │                     │   — refreshing
       │                    │                     │   automatically"
       │                    │                     │
       │                    │  startFallback      │
       │                    │  Polling()          │
       │                    │  (30s interval)     │
       │                    │                     │
       │                    │         ...30s...   │
       │                    │                     │
       │                    │  GET /api/fixtures/ │
       │                    │  live?gameweek=28   │
       │                    │────────────────────>│  (via fetch)
       │                    │                     │
       │                    │  200 OK { fixtures }│
       │                    │<────────────────────│
       │                    │                     │
       │                    │  Update fixture Map │
       │                    │  → UI re-renders    │
       │                    │                     │
       │         ...later, connection restored... │
       │                    │                     │
       │  SUBSCRIBED        │                     │
       │───────────────────>│                     │
       │                    │                     │
       │                    │  setConnectionStatus│
       │                    │  ('connected')      │
       │                    │                     │
       │                    │  stopFallback       │
       │                    │  Polling()          │
       │                    │────────────────────>│
       │                    │                     │
       │                    │                     │  Hide amber banner
       │                    │                     │  Show green dot (3s)
       │                    │                     │
```

### 6.5 Browser Sleep Recovery

```
┌──────────┐     ┌──────────────┐     ┌──────────────┐
│ Browser  │     │ useLive      │     │ /api/fixtures│
│ (sleep → │     │ Fixtures     │     │ /live        │
│  wake)   │     │ Hook         │     │              │
└────┬─────┘     └──────┬───────┘     └──────┬───────┘
     │                   │                    │
     │  visibilitychange │                    │
     │  → 'visible'      │                    │
     │──────────────────>│                    │
     │                   │                    │
     │                   │  Check channel     │
     │                   │  state             │
     │                   │                    │
     │                   │  [if disconnected] │
     │                   │  channel.subscribe()│
     │                   │                    │
     │                   │  Immediate fetch   │
     │                   │  to catch up:      │
     │                   │  GET /api/fixtures/│
     │                   │  live?gameweek=28  │
     │                   │───────────────────>│
     │                   │                    │
     │                   │  200 OK            │
     │                   │  (fresh fixture    │
     │                   │   data)            │
     │                   │<───────────────────│
     │                   │                    │
     │                   │  Replace stale     │
     │                   │  fixture Map       │
     │                   │  with fresh data   │
     │                   │                    │
     │  UI updates with  │                    │
     │  current scores   │                    │
     │<──────────────────│                    │
```

---

## Appendix A: Migration Rollback

If the migration needs to be reverted:

```sql
-- Rollback 00010_live_scores.sql

-- 1. Remove trigger
DROP TRIGGER IF EXISTS on_fixture_finished ON public.fixtures;
DROP FUNCTION IF EXISTS public.handle_fixture_finished();

-- 2. Remove RLS policy and restore original
DROP POLICY IF EXISTS "predictions_select_own_or_kicked_off" ON public.predictions;
CREATE POLICY "predictions_select_own"
  ON public.predictions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR public.is_admin());

-- 3. Remove helper function
DROP FUNCTION IF EXISTS public.is_fixture_kicked_off(uuid);

-- 4. Remove Realtime publication
ALTER PUBLICATION supabase_realtime DROP TABLE public.fixtures;

-- 5. Remove sync_log
DROP TABLE IF EXISTS public.sync_log;
DROP FUNCTION IF EXISTS public.prune_sync_log();

-- 6. Remove new columns
ALTER TABLE public.fixtures
  DROP COLUMN IF EXISTS live_home_score,
  DROP COLUMN IF EXISTS live_away_score,
  DROP COLUMN IF EXISTS match_minute;

-- 7. Remove indexes
DROP INDEX IF EXISTS idx_fixtures_live_active;
DROP INDEX IF EXISTS idx_fixtures_kickoff_today;
DROP INDEX IF EXISTS idx_predictions_fixture_user;
```

---

## Appendix B: Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| **Migration** | Schema changes apply cleanly; rollback works | Run migration against test DB; verify columns, indexes, RLS |
| **RLS policies** | Post-kickoff prediction visibility; pre-kickoff still hidden | Supabase test helpers with `auth.uid()` mocking |
| **Sync cron — mode detection** | Correct mode selected for live/matchday/full/skip scenarios | Unit test `detectSyncMode()` with mocked DB queries |
| **Sync cron — live mode** | Correct fixture updates; FINISHED transition triggers scoring | Integration test with mocked football-data.org responses |
| **Predictions endpoint** | Only returns kicked-off predictions; includes score_records | Integration test with seeded fixtures at various kickoff times |
| **`useLiveFixtures` hook** | Realtime subscription; fallback polling; visibility recovery | React Testing Library with mocked Supabase client |
| **`useProvisionalScoring` hook** | Correct provisional points; mix of live + finished fixtures | Unit test with deterministic fixture/prediction data |
| **`calculatePoints()` | Already tested | Existing test suite covers all scoring branches |
| **End-to-end** | Full live score flow from API poll to UI update | Playwright test with mocked Supabase Realtime |

---

## Appendix C: Monitoring & Observability

| Signal | Source | Alert Threshold |
|--------|--------|----------------|
| Sync cron error rate | `sync_log` where `status = 'error'` | >3 consecutive errors |
| Sync cron duration | `sync_log.duration_ms` | >30s for live mode |
| API rate limit hits | `sync_log` where `error_message LIKE '%429%'` | Any occurrence |
| Realtime connection count | Supabase Dashboard | >50 concurrent (unexpected for 14 users) |
| Stale fixture data | `fixtures.updated_at` for live matches | >5 min without update during IN_PLAY |
| Prediction endpoint latency | Vercel Analytics | p95 >2s |

The admin dashboard should surface `sync_log` data:
- Last successful sync time and mode
- Error count in last 24h
- API calls made today (sum of `api_calls_made`)
- Average duration by mode
