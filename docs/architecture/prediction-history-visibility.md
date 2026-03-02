# Grand Football — Prediction History Visibility: Technical Architecture

> **Document Owner:** Architecture & Security Agent
> **Last Updated:** 2026-03-02
> **Status:** Ready for Implementation
> **Companion:** [Strategy & Design Spec](../strategy/prediction-history-visibility.md)

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Database Changes (Migration 00013)](#2-database-changes-migration-00013)
3. [API Design](#3-api-design)
4. [Frontend Architecture](#4-frontend-architecture)
5. [Security Architecture](#5-security-architecture)
6. [Implementation Sequence](#6-implementation-sequence)

---

## 1. Architecture Overview

### Enforcement Model: Dual-Layer (API Primary + RLS Safety Net)

```
┌────────────────────────────────────────────────────────┐
│  Client (Next.js App Router)                           │
│  /predictions/[userId]?gw=N&seasonId=X                 │
│           │                                            │
│     Server Component (RSC)                             │
│           │                                            │
│     ┌─────▼──────────────────────────┐                 │
│     │  API Route Handler             │  ◄── Layer 1    │
│     │  /api/predictions/history/     │      Visibility  │
│     │  [userId]/route.ts             │      enforced    │
│     │                                │      in code     │
│     │  1. Auth check                 │                  │
│     │  2. supabase.rpc(              │                  │
│     │       'can_view_gw_preds')     │                  │
│     │  3. If blocked → 200 + hidden  │                  │
│     │  4. If allowed → return data   │                  │
│     └─────┬──────────────────────────┘                  │
│           │                                             │
│     ┌─────▼──────────────────────────┐                  │
│     │  Supabase (Postgres)           │  ◄── Layer 2    │
│     │  RLS on predictions table      │      Safety net  │
│     │  • Own predictions: always     │      (fallback   │
│     │  • Others: kicked-off OR       │       guard)     │
│     │    gameweek visible            │                  │
│     └────────────────────────────────┘                  │
└─────────────────────────────────────────────────────────┘
```

**Why dual-layer?**

1. The visibility matrix requires a self-referencing check on `predictions` (does the *viewer* have predictions in this GW?). Encoding this purely in RLS with a subquery against the same table risks poor performance and planner confusion.
2. API-layer logic is easier to test, debug, and log.
3. RLS remains as a defence-in-depth safety net — even if the API has a bug, the database will not leak predictions that haven't kicked off for a non-admin, non-owner viewer.

### Key Design Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | Keep existing RLS policy `predictions_select_own_or_kicked_off` **as-is** | It already prevents leaking un-kicked-off predictions to non-owners. The new gameweek-level logic layers on top at the API level. No RLS modification needed. |
| 2 | New Postgres functions for visibility logic | Encapsulates business rules in SQL → callable from both API (via `supabase.rpc()`) and future RLS upgrades. |
| 3 | API returns `visibility: 'visible' | 'hidden' | 'own'` | Client can render the correct UI state without re-implementing the business logic. |
| 4 | Server Component page (RSC) calls API route internally via `fetch` | Keeps a single source of truth for the data-fetching + visibility logic. The RSC doesn't duplicate the query. |

---

## 2. Database Changes (Migration 00013)

### File: `supabase/migrations/00013_prediction_history_visibility.sql`

```sql
-- ============================================================================
-- Grand Football — Prediction History Visibility Functions
-- Migration: 00013_prediction_history_visibility.sql
-- Created: 2026-03-02
-- Description: Adds Postgres functions to support the prediction history
--              visibility feature. Provides gameweek-level first-kickoff
--              lookup, viewer permission checks, and a composite index
--              for efficient MIN(kickoff_time) queries.
-- ============================================================================

-- ============================================================================
-- 1. INDEX: Composite index on fixtures for fast MIN(kickoff_time) by GW
-- ============================================================================
-- The existing idx_fixtures_season_gameweek covers (season_id, gameweek) but
-- does not include kickoff_time or status. This covering index lets Postgres
-- resolve get_gameweek_first_kickoff with an index-only scan.
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_fixtures_season_gw_kickoff
  ON public.fixtures (season_id, gameweek, kickoff_time ASC)
  WHERE status NOT IN ('POSTPONED', 'CANCELLED');

COMMENT ON INDEX idx_fixtures_season_gw_kickoff IS
  'Covering index for fast MIN(kickoff_time) lookups per gameweek, excluding postponed/cancelled fixtures.';


-- ============================================================================
-- 2. INDEX: Composite index on predictions for "has user predicted in GW?"
-- ============================================================================
-- Needed for can_view_gameweek_predictions to efficiently check whether the
-- viewer has any predictions for fixtures in a given gameweek.
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_predictions_user_fixture
  ON public.predictions (user_id, fixture_id);

COMMENT ON INDEX idx_predictions_user_fixture IS
  'Composite index on (user_id, fixture_id) for efficient per-user prediction existence checks.';


-- ============================================================================
-- 3. FUNCTION: get_gameweek_first_kickoff
-- ============================================================================
-- Returns the earliest kickoff_time of non-postponed/non-cancelled fixtures
-- in the given gameweek. Returns NULL if all fixtures are postponed/cancelled
-- or the gameweek has no fixtures.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_gameweek_first_kickoff(
  p_season_id uuid,
  p_gameweek  integer
)
RETURNS timestamptz
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT MIN(f.kickoff_time)
  FROM public.fixtures f
  WHERE f.season_id = p_season_id
    AND f.gameweek  = p_gameweek
    AND f.status NOT IN ('POSTPONED', 'CANCELLED');
$$;

COMMENT ON FUNCTION public.get_gameweek_first_kickoff IS
  'Returns the earliest kickoff time for active (non-postponed, non-cancelled) fixtures in a gameweek. Returns NULL if no active fixtures exist.';


-- ============================================================================
-- 4. FUNCTION: has_user_predicted_in_gameweek
-- ============================================================================
-- Returns TRUE if the given user has at least one prediction for any fixture
-- in the specified gameweek. Used internally by can_view_gameweek_predictions.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.has_user_predicted_in_gameweek(
  p_user_id   uuid,
  p_season_id uuid,
  p_gameweek  integer
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.predictions p
    JOIN public.fixtures f ON f.id = p.fixture_id
    WHERE p.user_id    = p_user_id
      AND f.season_id  = p_season_id
      AND f.gameweek   = p_gameweek
  );
$$;

COMMENT ON FUNCTION public.has_user_predicted_in_gameweek IS
  'Returns true if the user has at least one prediction for any fixture in the gameweek.';


-- ============================================================================
-- 5. FUNCTION: can_view_gameweek_predictions
-- ============================================================================
-- Core visibility function. Determines whether p_viewer_id can see
-- p_target_user_id's predictions for the given gameweek.
--
-- Returns TRUE when:
--   (a) Viewing own predictions (viewer == target), OR
--   (b) Viewer is admin, OR
--   (c) First kickoff for the gameweek has passed (now() >= first_kickoff), OR
--   (d) First kickoff has NOT passed AND viewer has NOT predicted in this GW.
--
-- Returns FALSE when:
--   (e) First kickoff has NOT passed AND viewer HAS predicted in this GW, OR
--   (f) No active fixtures in the GW (first_kickoff IS NULL) AND viewer != target
--       AND viewer is not admin — treat as future/empty GW → hidden.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.can_view_gameweek_predictions(
  p_viewer_id      uuid,
  p_target_user_id uuid,
  p_season_id      uuid,
  p_gameweek       integer
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_first_kickoff timestamptz;
  v_viewer_has_predicted boolean;
BEGIN
  -- (a) Always allow viewing own predictions
  IF p_viewer_id = p_target_user_id THEN
    RETURN TRUE;
  END IF;

  -- (b) Admins bypass all visibility restrictions
  IF EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = p_viewer_id AND is_admin = true
  ) THEN
    RETURN TRUE;
  END IF;

  -- Get first kickoff for the gameweek
  v_first_kickoff := public.get_gameweek_first_kickoff(p_season_id, p_gameweek);

  -- (f) No active fixtures → treat as future/unavailable GW
  IF v_first_kickoff IS NULL THEN
    RETURN FALSE;
  END IF;

  -- (c) First kickoff has passed → all predictions visible
  IF now() >= v_first_kickoff THEN
    RETURN TRUE;
  END IF;

  -- Before first kickoff: check if viewer has predicted
  v_viewer_has_predicted := public.has_user_predicted_in_gameweek(
    p_viewer_id, p_season_id, p_gameweek
  );

  -- (d) Viewer has NOT predicted → can see others' predictions
  -- (e) Viewer HAS predicted → cannot see others' predictions
  RETURN NOT v_viewer_has_predicted;
END;
$$;

COMMENT ON FUNCTION public.can_view_gameweek_predictions IS
  'Determines whether a viewer can see a target user''s predictions for a gameweek. Implements the full visibility matrix: own=always, admin=always, post-kickoff=always, pre-kickoff depends on whether viewer has predicted.';


-- ============================================================================
-- 6. FUNCTION: get_gameweek_prediction_summary
-- ============================================================================
-- Returns aggregate stats for a user's predictions in a gameweek.
-- Used to populate the summary strip on the prediction history page.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_gameweek_prediction_summary(
  p_user_id   uuid,
  p_season_id uuid,
  p_gameweek  integer
)
RETURNS TABLE (
  total_points   bigint,
  exact_count    bigint,
  outcome_count  bigint,
  wrong_count    bigint,
  predicted_count bigint,
  fixture_count  bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    COALESCE(SUM(sr.points_awarded), 0) AS total_points,
    COUNT(*) FILTER (WHERE sr.reason_code IN ('EXACT', 'STAR_EXACT')) AS exact_count,
    COUNT(*) FILTER (WHERE sr.reason_code IN ('OUTCOME', 'STAR_OUTCOME')) AS outcome_count,
    COUNT(*) FILTER (WHERE sr.reason_code IN ('WRONG', 'STAR_WRONG')) AS wrong_count,
    (SELECT COUNT(*)
     FROM public.predictions p2
     JOIN public.fixtures f2 ON f2.id = p2.fixture_id
     WHERE p2.user_id   = p_user_id
       AND f2.season_id = p_season_id
       AND f2.gameweek  = p_gameweek) AS predicted_count,
    (SELECT COUNT(*)
     FROM public.fixtures f3
     WHERE f3.season_id = p_season_id
       AND f3.gameweek  = p_gameweek
       AND f3.status NOT IN ('POSTPONED', 'CANCELLED')) AS fixture_count
  FROM public.score_records sr
  JOIN public.fixtures f ON f.id = sr.fixture_id
  WHERE sr.user_id   = p_user_id
    AND f.season_id  = p_season_id
    AND f.gameweek   = p_gameweek;
$$;

COMMENT ON FUNCTION public.get_gameweek_prediction_summary IS
  'Returns aggregated prediction stats (total points, exact/outcome/wrong counts, predicted/fixture counts) for a user in a gameweek.';
```

### Why NOT Update the RLS Policy

The existing RLS policy `predictions_select_own_or_kicked_off` already provides the safety-net behaviour:

```sql
-- Existing (from migration 00010)
USING (
  auth.uid() = user_id          -- own predictions: always
  OR public.is_admin()          -- admin: always
  OR public.is_fixture_kicked_off(fixture_id)  -- kicked-off: always
)
```

This policy is **per-fixture**. The new feature's **pre-kickoff visibility for non-submitters** is a *relaxation* relative to this policy (it allows seeing others' predictions before any individual fixture kicks off, as long as the gameweek's first kickoff hasn't passed and the viewer hasn't predicted). We handle this relaxation **at the API level only**, using a service-role client to bypass RLS when the `can_view_gameweek_predictions` check passes.

This means:
- If the API logic has a bug and fails to call `can_view_gameweek_predictions`, the RLS policy still blocks access to un-kicked-off fixtures' predictions.
- The RLS never *over-blocks* data returned by the API, because the API uses the **service role** (bypasses RLS) only after the visibility check passes.

**Service role usage pattern:**

```typescript
// In the API route
const canView = await supabase.rpc('can_view_gameweek_predictions', { ... });
if (canView) {
  // Use service-role client to fetch predictions (bypasses RLS)
  const serviceClient = createServiceClient();
  const { data: predictions } = await serviceClient.from('predictions')...
} else {
  // Return hidden state — do NOT query predictions at all
}
```

> **IMPORTANT:** The API route MUST use the regular (anon/auth) client for the `can_view_gameweek_predictions` RPC call (which runs as SECURITY DEFINER, so it has its own privileges), and only switch to the service client for the data fetch after the check passes.

---

## 3. API Design

### 3.1 Endpoint: `GET /api/predictions/history/[userId]`

**File:** `src/app/api/predictions/history/[userId]/route.ts`

#### Request

| Parameter | Source | Type | Required | Validation |
|-----------|--------|------|----------|------------|
| `userId` | Path | `string (uuid)` | Yes | UUID format, must exist in `profiles` |
| `gw` | Query | `string (integer)` | Yes | 1–50 |
| `seasonId` | Query | `string (uuid)` | Yes | UUID format, must be active season or valid season |

**Example:**
```
GET /api/predictions/history/550e8400-e29b-41d4-a716-446655440000?gw=12&seasonId=abc123
```

#### Response Schema

```typescript
/** Successful response (HTTP 200) */
interface PredictionHistoryResponse {
  /** Target user's profile */
  profile: {
    id: string;
    display_name: string;
    avatar_url: string | null;
    featured_badges: string[];
  };

  /**
   * Visibility state:
   * - 'own'     → Viewer is looking at their own predictions
   * - 'visible' → Predictions are visible (post-kickoff OR pre-kickoff non-submitter)
   * - 'hidden'  → Predictions blocked (pre-kickoff, viewer has predicted)
   */
  visibility: 'visible' | 'hidden' | 'own';

  /** ISO 8601 timestamp of the first kickoff in the gameweek, or null */
  first_kickoff: string | null;

  /** Whether the viewing user has submitted predictions for this GW */
  viewer_has_predicted: boolean;

  /** All fixtures in the gameweek (always returned regardless of visibility) */
  fixtures: Array<{
    id: string;
    home_team: string;
    away_team: string;
    home_team_crest: string | null;
    away_team_crest: string | null;
    kickoff_time: string;
    status: string;
    home_score: number | null;
    away_score: number | null;
    is_star_game: boolean;
    gameweek: number;
  }>;

  /**
   * Target user's predictions for this GW.
   * - When visibility='hidden': empty array []
   * - When visibility='visible' or 'own': populated with prediction data
   */
  predictions: Array<{
    fixture_id: string;
    home_score: number;
    away_score: number;
    submitted_at: string;
  }>;

  /**
   * Score records for finished fixtures.
   * - When visibility='hidden': empty array []
   * - When visibility='visible' or 'own': populated for finished fixtures
   */
  score_records: Array<{
    fixture_id: string;
    predicted_home: number | null;
    predicted_away: number | null;
    actual_home: number;
    actual_away: number;
    points_awarded: number;
    reason_code: string;
  }>;

  /** Aggregated summary stats (null when visibility='hidden') */
  summary: {
    total_points: number;
    exact_count: number;
    outcome_count: number;
    wrong_count: number;
    predicted_count: number;
    fixture_count: number;
  } | null;
}
```

#### Error Responses

| Status | Condition | Body |
|--------|-----------|------|
| 401 | Not authenticated | `{ "error": "Unauthorized" }` |
| 400 | Invalid `gw`, missing `seasonId`, malformed UUID | `{ "error": "<message>" }` |
| 404 | `userId` not found in `profiles` | `{ "error": "User not found" }` |

#### Implementation Pseudocode

```typescript
// src/app/api/predictions/history/[userId]/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: { userId: string } },
) {
  // 1. Auth check
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 2. Validate params
  const targetUserId = params.userId;
  const gameweek = parseInt(request.nextUrl.searchParams.get('gw') ?? '', 10);
  const seasonId = request.nextUrl.searchParams.get('seasonId');

  if (!seasonId || !isValidUuid(seasonId)) {
    return NextResponse.json({ error: 'Valid seasonId is required' }, { status: 400 });
  }
  if (isNaN(gameweek) || gameweek < 1 || gameweek > 50) {
    return NextResponse.json({ error: 'Invalid gameweek' }, { status: 400 });
  }
  if (!isValidUuid(targetUserId)) {
    return NextResponse.json({ error: 'Invalid userId' }, { status: 400 });
  }

  // 3. Verify target user exists
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, display_name, avatar_url, featured_badges')
    .eq('id', targetUserId)
    .single();

  if (!profile) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  // 4. Get first kickoff for the gameweek
  const { data: firstKickoff } = await supabase.rpc('get_gameweek_first_kickoff', {
    p_season_id: seasonId,
    p_gameweek: gameweek,
  });

  // 5. Determine visibility
  const isOwnProfile = user.id === targetUserId;
  let visibility: 'own' | 'visible' | 'hidden';

  if (isOwnProfile) {
    visibility = 'own';
  } else {
    const { data: canView } = await supabase.rpc('can_view_gameweek_predictions', {
      p_viewer_id: user.id,
      p_target_user_id: targetUserId,
      p_season_id: seasonId,
      p_gameweek: gameweek,
    });
    visibility = canView ? 'visible' : 'hidden';
  }

  // 6. Check if viewer has predicted (for UI banner)
  const { data: viewerHasPredicted } = await supabase.rpc(
    'has_user_predicted_in_gameweek',
    { p_user_id: user.id, p_season_id: seasonId, p_gameweek: gameweek },
  );

  // 7. Fetch fixtures (always returned)
  const serviceClient = createServiceClient();
  const { data: fixtures } = await serviceClient
    .from('fixtures')
    .select('id, home_team, away_team, home_team_crest, away_team_crest, kickoff_time, status, home_score, away_score, is_star_game, gameweek')
    .eq('season_id', seasonId)
    .eq('gameweek', gameweek)
    .order('kickoff_time', { ascending: true });

  // 8. Fetch predictions + score records (only if visible)
  let predictions: any[] = [];
  let scoreRecords: any[] = [];
  let summary = null;

  if (visibility !== 'hidden') {
    const fixtureIds = (fixtures ?? []).map((f) => f.id);

    if (fixtureIds.length > 0) {
      const { data: preds } = await serviceClient
        .from('predictions')
        .select('fixture_id, home_score, away_score, submitted_at')
        .eq('user_id', targetUserId)
        .in('fixture_id', fixtureIds);
      predictions = preds ?? [];

      const finishedIds = (fixtures ?? [])
        .filter((f) => f.status === 'FINISHED')
        .map((f) => f.id);

      if (finishedIds.length > 0) {
        const { data: scores } = await serviceClient
          .from('score_records')
          .select('fixture_id, predicted_home, predicted_away, actual_home, actual_away, points_awarded, reason_code')
          .eq('user_id', targetUserId)
          .in('fixture_id', finishedIds);
        scoreRecords = scores ?? [];
      }
    }

    // Fetch summary stats
    const { data: summaryData } = await supabase.rpc(
      'get_gameweek_prediction_summary',
      { p_user_id: targetUserId, p_season_id: seasonId, p_gameweek: gameweek },
    );
    if (summaryData && summaryData.length > 0) {
      const row = summaryData[0];
      summary = {
        total_points: Number(row.total_points),
        exact_count: Number(row.exact_count),
        outcome_count: Number(row.outcome_count),
        wrong_count: Number(row.wrong_count),
        predicted_count: Number(row.predicted_count),
        fixture_count: Number(row.fixture_count),
      };
    }
  }

  // 9. Return response
  return NextResponse.json({
    profile,
    visibility,
    first_kickoff: firstKickoff ?? null,
    viewer_has_predicted: viewerHasPredicted ?? false,
    fixtures: fixtures ?? [],
    predictions,
    score_records: scoreRecords,
    summary,
  });
}

function isValidUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
```

### 3.2 Service Client Utility

A new server-only utility for the Supabase service role client. **This must NEVER be imported in client components.**

**File:** `src/lib/supabase/service.ts`

```typescript
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';

/**
 * Creates a Supabase client using the service_role key.
 * BYPASSES RLS — only use after server-side authorization checks.
 * Server-only: must never be imported in client components.
 */
export function createServiceClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}
```

### 3.3 TypeScript Types

**File:** `src/lib/types/prediction-history.ts`

```typescript
import type { ReasonCode } from '@/lib/scoring/types';

/** Visibility state for a gameweek's predictions */
export type PredictionVisibility = 'visible' | 'hidden' | 'own';

/** Fixture shape returned by the prediction history API */
export interface HistoryFixture {
  id: string;
  home_team: string;
  away_team: string;
  home_team_crest: string | null;
  away_team_crest: string | null;
  kickoff_time: string;
  status: string;
  home_score: number | null;
  away_score: number | null;
  is_star_game: boolean;
  gameweek: number;
}

/** Prediction in history context */
export interface HistoryPrediction {
  fixture_id: string;
  home_score: number;
  away_score: number;
  submitted_at: string;
}

/** Score record in history context */
export interface HistoryScoreRecord {
  fixture_id: string;
  predicted_home: number | null;
  predicted_away: number | null;
  actual_home: number;
  actual_away: number;
  points_awarded: number;
  reason_code: ReasonCode;
}

/** Summary stats for a user's gameweek */
export interface GameweekSummary {
  total_points: number;
  exact_count: number;
  outcome_count: number;
  wrong_count: number;
  predicted_count: number;
  fixture_count: number;
}

/** Profile shape in history context */
export interface HistoryProfile {
  id: string;
  display_name: string;
  avatar_url: string | null;
  featured_badges: string[];
}

/** Full API response */
export interface PredictionHistoryResponse {
  profile: HistoryProfile;
  visibility: PredictionVisibility;
  first_kickoff: string | null;
  viewer_has_predicted: boolean;
  fixtures: HistoryFixture[];
  predictions: HistoryPrediction[];
  score_records: HistoryScoreRecord[];
  summary: GameweekSummary | null;
}
```

---

## 4. Frontend Architecture

### 4.1 Route Structure

```
src/app/(authenticated)/predictions/
├── [userId]/
│   ├── page.tsx              ← Server Component (entry point)
│   ├── prediction-history.tsx ← Client Component (interactive shell)
│   └── loading.tsx           ← Skeleton loader
└── me/
    └── page.tsx              ← Redirect to /predictions/{currentUserId}
```

### 4.2 Component Tree & Data Flow

```
<PredictionsPage>                          ← RSC: auth, season, gameweeks, initial fetch
│
├── <h1> "{displayName}'s Predictions" / "Your Predictions"
│
├── <GameweekSelector>                     ← Reuse existing (client component)
│     gameweeks={uniqueGameweeks}
│     selected={currentGw}
│     basePath={`/predictions/${userId}`}
│
├── <PredictionHistory>                    ← New client component
│   │  Props: { initialData: PredictionHistoryResponse, userId, seasonId }
│   │
│   ├── <VisibilityBanner>                 ← New component (conditional)
│   │     visibility={data.visibility}
│   │     firstKickoff={data.first_kickoff}
│   │     viewerHasPredicted={data.viewer_has_predicted}
│   │
│   ├── <SummaryStrip>                     ← New component using StatCard
│   │     summary={data.summary}
│   │
│   └── <div className="space-y-3">       ← Fixture card list
│         {data.fixtures.map(fixture =>
│           <FixtureCard                   ← Reuse existing
│             fixture={fixture}
│             prediction={predMap.get(fixture.id)}      ← Target user's prediction
│             scoreRecord={scoreMap.get(fixture.id)}
│             showPrediction={visibility !== 'hidden'}
│           />
│         )}
│       </div>
│
└── (when no predictions and visibility !== 'hidden')
    <EmptyState>                           ← Reuse existing
      "No predictions submitted for Gameweek {N}"
    </EmptyState>
```

### 4.3 Page Component (Server Component)

**File:** `src/app/(authenticated)/predictions/[userId]/page.tsx`

```tsx
import { createClient } from '@/lib/supabase/server';
import { redirect, notFound } from 'next/navigation';
import { EmptyState } from '@/components/empty-state';
import { GameweekSelector } from '@/app/(authenticated)/fixtures/gameweek-selector';
import { PredictionHistory } from './prediction-history';
import { History } from 'lucide-react';
import type { Metadata } from 'next';

interface Props {
  params: { userId: string };
  searchParams: { gw?: string; seasonId?: string };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const supabase = createClient();
  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('id', params.userId)
    .single();

  return {
    title: profile
      ? `${profile.display_name}'s Predictions`
      : 'Prediction History',
  };
}

export const dynamic = 'force-dynamic';

export default async function PredictionHistoryPage({ params, searchParams }: Props) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // Resolve season
  const { data: season } = await supabase
    .from('seasons')
    .select('*')
    .eq('is_active', true)
    .single();

  if (!season) {
    return (
      <EmptyState icon={History} title="No Active Season"
        description="Waiting for the admin to start a new season." />
    );
  }

  const seasonId = searchParams.seasonId ?? season.id;

  // Get available gameweeks
  const { data: gwRows } = await supabase
    .from('fixtures')
    .select('gameweek')
    .eq('season_id', seasonId)
    .order('gameweek', { ascending: true });

  const uniqueGameweeks = [...new Set(gwRows?.map((g) => g.gameweek))];
  if (uniqueGameweeks.length === 0) {
    return (
      <EmptyState icon={History} title="No Fixtures"
        description="No fixtures available yet for this season." />
    );
  }

  // Default to latest GW with a kicked-off fixture, or last available
  const selectedGw = searchParams.gw
    ? parseInt(searchParams.gw, 10)
    : uniqueGameweeks[uniqueGameweeks.length - 1];

  // Fetch prediction history data via internal API
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  const apiUrl = `${baseUrl}/api/predictions/history/${params.userId}?gw=${selectedGw}&seasonId=${seasonId}`;
  const res = await fetch(apiUrl, {
    headers: { cookie: request.headers.get('cookie') ?? '' },
    cache: 'no-store',
  });

  if (res.status === 404) notFound();
  if (!res.ok) throw new Error('Failed to fetch prediction history');

  const data = await res.json();

  return (
    <div className="space-y-6">
      <GameweekSelector
        gameweeks={uniqueGameweeks}
        selected={selectedGw}
        basePath={`/predictions/${params.userId}`}
        queryKey="gw"
      />
      <PredictionHistory
        data={data}
        isOwnProfile={user.id === params.userId}
        userId={params.userId}
        seasonId={seasonId}
        currentGameweek={selectedGw}
      />
    </div>
  );
}
```

> **Note:** The RSC fetches data from the API route. An alternative implementation would be to inline the Supabase queries directly in the RSC and call the same `can_view_gameweek_predictions` RPC. Either approach works — the key requirement is that visibility is always checked server-side before data is returned.

### 4.4 `/predictions/me` Redirect

**File:** `src/app/(authenticated)/predictions/me/page.tsx`

```tsx
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export default async function PredictionsMePage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  redirect(`/predictions/${user.id}`);
}
```

### 4.5 New Components

#### 4.5.1 `PredictionHistory` (Client Component)

**File:** `src/app/(authenticated)/predictions/[userId]/prediction-history.tsx`

```tsx
'use client';

import { FixtureCard } from '@/components/fixture-card';
import { EmptyState } from '@/components/empty-state';
import { VisibilityBanner } from './visibility-banner';
import { SummaryStrip } from './summary-strip';
import { FileX2 } from 'lucide-react';
import type { PredictionHistoryResponse } from '@/lib/types/prediction-history';

interface Props {
  data: PredictionHistoryResponse;
  isOwnProfile: boolean;
  userId: string;
  seasonId: string;
  currentGameweek: number;
}

export function PredictionHistory({ data, isOwnProfile }: Props) {
  const { visibility, fixtures, predictions, score_records, summary, profile } = data;

  const predMap = new Map(predictions.map((p) => [p.fixture_id, p]));
  const scoreMap = new Map(score_records.map((s) => [s.fixture_id, s]));

  const showPredictions = visibility !== 'hidden';
  const displayName = isOwnProfile ? 'Your' : `${profile.display_name}'s`;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-h1 text-text-primary">{displayName} Predictions</h1>
        {summary && showPredictions && (
          <p className="mt-1 text-body-sm text-text-secondary">
            {summary.predicted_count} of {summary.fixture_count} predicted
          </p>
        )}
      </div>

      {/* Visibility banner */}
      <VisibilityBanner
        visibility={visibility}
        firstKickoff={data.first_kickoff}
        viewerHasPredicted={data.viewer_has_predicted}
        targetDisplayName={profile.display_name}
      />

      {/* Summary strip */}
      {summary && showPredictions && <SummaryStrip summary={summary} />}

      {/* Fixture cards */}
      {fixtures.length > 0 ? (
        <div className="space-y-3">
          {fixtures.map((fixture, i) => (
            <div
              key={fixture.id}
              className="animate-fade-in-up opacity-0"
              style={{ animationDelay: `${i * 50}ms` }}
            >
              <FixtureCard
                fixture={fixture}
                prediction={showPredictions ? (predMap.get(fixture.id) ?? null) : null}
                scoreRecord={showPredictions ? (scoreMap.get(fixture.id) ?? null) : null}
                showPrediction={showPredictions}
              />
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={FileX2}
          title="No Fixtures"
          description="No fixtures available for this gameweek yet."
        />
      )}

      {/* No predictions empty state (when visible but user made no predictions) */}
      {showPredictions && fixtures.length > 0 && predictions.length === 0 && (
        <div className="rounded-card border border-border bg-surface p-6 text-center">
          <p className="text-body text-text-secondary">
            {isOwnProfile
              ? "You didn't submit any predictions for this gameweek."
              : `${profile.display_name} didn't submit any predictions for this gameweek.`
            }
          </p>
        </div>
      )}
    </div>
  );
}
```

#### 4.5.2 `VisibilityBanner`

**File:** `src/app/(authenticated)/predictions/[userId]/visibility-banner.tsx`

```tsx
'use client';

import { Lock, Info, Clock } from 'lucide-react';
import { Countdown } from '@/components/countdown';
import type { PredictionVisibility } from '@/lib/types/prediction-history';

interface Props {
  visibility: PredictionVisibility;
  firstKickoff: string | null;
  viewerHasPredicted: boolean;
  targetDisplayName: string;
}

export function VisibilityBanner({
  visibility,
  firstKickoff,
  viewerHasPredicted,
  targetDisplayName,
}: Props) {
  // State B: Hidden — viewer has predicted, before kickoff
  if (visibility === 'hidden' && firstKickoff) {
    return (
      <div
        className="flex items-start gap-3 rounded-card border border-warning/30 bg-warning/10 p-4"
        role="alert"
      >
        <Lock className="mt-0.5 h-5 w-5 shrink-0 text-warning" aria-hidden="true" />
        <div>
          <p className="text-body font-medium text-text-primary">
            Predictions hidden until first kickoff
          </p>
          <p className="mt-1 text-body-sm text-text-secondary">
            You've already submitted your predictions, so {targetDisplayName}'s
            picks are hidden to keep things fair.
          </p>
          <div className="mt-2 flex items-center gap-1.5 text-body-sm text-text-secondary">
            <Clock className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Reveals in: </span>
            <Countdown targetDate={firstKickoff} />
          </div>
        </div>
      </div>
    );
  }

  // State C: Visible, before kickoff, viewer has NOT predicted
  if (visibility === 'visible' && firstKickoff && !viewerHasPredicted) {
    const kickoffDate = new Date(firstKickoff);
    if (kickoffDate > new Date()) {
      return (
        <div
          className="flex items-start gap-3 rounded-card border border-info/30 bg-info/10 p-4"
          role="status"
        >
          <Info className="mt-0.5 h-5 w-5 shrink-0 text-info" aria-hidden="true" />
          <div>
            <p className="text-body font-medium text-text-primary">
              These predictions are locked in
            </p>
            <p className="mt-1 text-body-sm text-text-secondary">
              You haven't submitted your predictions yet. These users have
              already committed their picks.
            </p>
          </div>
        </div>
      );
    }
  }

  // State A / post-kickoff: no banner needed
  return null;
}
```

#### 4.5.3 `SummaryStrip`

**File:** `src/app/(authenticated)/predictions/[userId]/summary-strip.tsx`

```tsx
import { StatCard } from '@/components/stat-card';
import { Target, Eye, X, Trophy } from 'lucide-react';
import type { GameweekSummary } from '@/lib/types/prediction-history';

interface Props {
  summary: GameweekSummary;
}

export function SummaryStrip({ summary }: Props) {
  return (
    <div className="grid grid-cols-2 gap-3 tablet:grid-cols-4">
      <StatCard icon={Trophy} label="Total" value={`${summary.total_points} pts`} />
      <StatCard icon={Target} label="Exact" value={summary.exact_count} />
      <StatCard icon={Eye} label="Outcome" value={summary.outcome_count} />
      <StatCard icon={X} label="Wrong" value={summary.wrong_count} />
    </div>
  );
}
```

### 4.6 Component Modifications

#### 4.6.1 `LeaderboardTable` — Add Clickable User Links

Wrap the display name in a `<Link>` to navigate to the prediction history page:

```tsx
// In leaderboard-table.tsx — modify the Name column
import Link from 'next/link';

// Replace the <span> for display_name with:
<Link
  href={`/predictions/${entry.user_id}`}
  className={cn(
    'truncate text-body font-medium hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 rounded',
    isCurrentUser ? 'text-accent' : 'text-text-primary',
  )}
>
  {entry.display_name || 'Anonymous'}
  {isCurrentUser && (
    <span className="ml-1.5 text-caption text-text-secondary">(you)</span>
  )}
</Link>
```

#### 4.6.2 `NAV_ITEMS` — Add "My Predictions" Link

```typescript
// In src/lib/constants.ts — add to NAV_ITEMS array:
{ href: '/predictions/me', label: 'My Predictions', icon: 'History' },
```

### 4.7 Loading Skeleton

**File:** `src/app/(authenticated)/predictions/[userId]/loading.tsx`

```tsx
export default function Loading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Header skeleton */}
      <div className="space-y-2">
        <div className="h-8 w-48 rounded bg-surface-elevated" />
        <div className="h-4 w-32 rounded bg-surface-elevated" />
      </div>

      {/* Summary strip skeleton */}
      <div className="grid grid-cols-2 gap-3 tablet:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-20 rounded-card bg-surface-elevated" />
        ))}
      </div>

      {/* Fixture card skeletons */}
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-32 rounded-card bg-surface-elevated" />
        ))}
      </div>
    </div>
  );
}
```

---

## 5. Security Architecture

### 5.1 Threat Model

| Threat | Attack Vector | Mitigation |
|--------|--------------|------------|
| **T1: Direct API call to bypass UI** | User crafts a `GET /api/predictions/history/{victim}?gw=15&seasonId=X` before kickoff | `can_view_gameweek_predictions` checked server-side in API route handler. Returns `visibility: 'hidden'` and empty predictions array. |
| **T2: RLS bypass via Supabase client** | User uses stolen anon key + JWT to query `predictions` directly | Existing RLS policy `predictions_select_own_or_kicked_off` blocks access to un-kicked-off fixtures' predictions by default. |
| **T3: Clock manipulation** | User sets device clock forward to trigger client-side kickoff logic | All visibility decisions are made server-side using `now()` (Postgres server time). Client only renders based on the server's `visibility` field. |
| **T4: Race condition at kickoff boundary** | Request arrives at 14:59:59.999, Postgres evaluates `now()` at 15:00:00.001 | Postgres `now()` is transaction-start time → consistent within the request. Worst case: a 1-second window where the check sees the new state. This is acceptable — no data leak since kickoff has legitimately passed. |
| **T5: Service role key leak** | `SUPABASE_SERVICE_ROLE_KEY` exposed to client | Key is server-only env var (no `NEXT_PUBLIC_` prefix). `createServiceClient()` is only importable in server modules. Next.js tree-shaking prevents client bundling. |
| **T6: User ID enumeration** | Attacker iterates UUIDs to discover valid user IDs | UUIDs are non-sequential (v4). The 404 response for invalid UUIDs is acceptable — the same response would come from the profiles table RLS policy. Rate limiting via Supabase/Vercel Edge handles brute force. |
| **T7: Prediction deletion exploit** | User deletes predictions to become "non-submitter" and spy on others | Current system does not allow prediction deletion (no DELETE RLS policy). Only INSERT/UPDATE are permitted. This is enforced at the database level. |

### 5.2 Clock Skew Handling

```
Timeline:
  Server clock:  14:59:58  →  14:59:59  →  15:00:00  →  15:00:01
  Client clock:  15:00:01  →  15:00:02  →  15:00:03  →  15:00:04
                                            ↑ actual kickoff

Scenario: Client thinks kickoff passed (its clock is fast).

1. Client renders/triggers a fetch.
2. API calls can_view_gameweek_predictions() → Postgres now()=14:59:58 → returns FALSE.
3. API returns { visibility: 'hidden' }.
4. Client shows "hidden" state despite thinking it's past kickoff.
5. Client's Countdown component hits 0 → triggers a re-fetch.
6. On next fetch (after actual kickoff), server returns { visibility: 'visible' }.

The Countdown component already exists and counts down to a target time.
After the countdown expires, the client should trigger a page refresh:
  - Use router.refresh() (Next.js App Router) OR
  - Use window.location.reload()
This is consistent with the existing behavior for prediction form deadline timing.
```

### 5.3 Enforcement Flow Summary

```
┌─────────────────────────────────────┐
│ Client Request                      │
│ GET /api/predictions/history/{uid}  │
└────────────┬────────────────────────┘
             │
             ▼
┌─────────────────────────────────────┐
│ Auth Check (supabase.auth.getUser)  │
│ → 401 if not authenticated          │
└────────────┬────────────────────────┘
             │
             ▼
┌─────────────────────────────────────┐
│ Input Validation                    │
│ → 400 if invalid UUID/GW/seasonId  │
└────────────┬────────────────────────┘
             │
             ▼
┌─────────────────────────────────────┐
│ Profile Lookup                      │
│ → 404 if user not found            │
└────────────┬────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────┐
│ supabase.rpc('can_view_gameweek_predictions')│
│ SECURITY DEFINER — runs with function       │
│ owner's privileges, not caller's            │
│                                             │
│ Logic:                                      │
│ 1. viewer == target? → true                 │
│ 2. viewer is admin? → true                  │
│ 3. first_kickoff is null? → false           │
│ 4. now() >= first_kickoff? → true           │
│ 5. viewer has predicted? → false            │
│ 6. viewer has NOT predicted? → true         │
└────────────┬────────────────────────────────┘
             │
       ┌─────┴──────┐
       │             │
   canView=true  canView=false
       │             │
       ▼             ▼
  ┌──────────┐  ┌──────────────────┐
  │ Service  │  │ Return JSON:     │
  │ Client   │  │ visibility:hidden│
  │ fetches  │  │ predictions: []  │
  │ data     │  │ score_records: []│
  │ (bypasses│  │ summary: null    │
  │  RLS)    │  │ fixtures: [...]  │
  └──────────┘  └──────────────────┘
       │
       ▼
  ┌──────────────────┐
  │ Return JSON:     │
  │ visibility:own/  │
  │   visible        │
  │ predictions:[..]│
  │ score_records:..│
  │ summary:{...}   │
  │ fixtures:[...]  │
  └──────────────────┘
```

### 5.4 Key Security Invariants

1. **Predictions are NEVER returned in the HTTP response when `visibility='hidden'`.**
   - The `predictions` array is `[]`.
   - The `score_records` array is `[]`.
   - The `summary` is `null`.
   - Only `fixtures` (public knowledge) are returned.

2. **Visibility is ALWAYS determined by `now()` on the Postgres server**, never by client-provided timestamps.

3. **The service role client is used ONLY after `can_view_gameweek_predictions` returns `true`**, and only for the specific data needed (target user's predictions for the validated gameweek). It is never exposed to the client.

4. **No prediction deletion** is possible (no DELETE policy on `predictions` table). This closes the "delete-and-spy" exploit.

5. **Admin bypass** is scoped to the `is_admin` column on `profiles`, verified inside the SECURITY DEFINER function (not passed as a parameter).

---

## 6. Implementation Sequence

### Phase 1: Database (Migration 00013)

1. Create `supabase/migrations/00013_prediction_history_visibility.sql` with:
   - `idx_fixtures_season_gw_kickoff` index
   - `idx_predictions_user_fixture` index
   - `get_gameweek_first_kickoff()` function
   - `has_user_predicted_in_gameweek()` function
   - `can_view_gameweek_predictions()` function
   - `get_gameweek_prediction_summary()` function
2. Run migration locally: `supabase db reset` or `supabase migration up`
3. Verify with manual SQL tests against each visibility matrix scenario

### Phase 2: API Layer

1. Create `src/lib/supabase/service.ts` (service role client)
2. Create `src/lib/types/prediction-history.ts` (TypeScript types)
3. Create `src/app/api/predictions/history/[userId]/route.ts`
4. Write integration tests for the API route covering all 6 visibility matrix scenarios
5. Add `SUPABASE_SERVICE_ROLE_KEY` to `.env.local` and Vercel environment

### Phase 3: Frontend — Pages & Components

1. Create `src/app/(authenticated)/predictions/me/page.tsx` (redirect)
2. Create `src/app/(authenticated)/predictions/[userId]/page.tsx` (RSC)
3. Create `src/app/(authenticated)/predictions/[userId]/prediction-history.tsx`
4. Create `src/app/(authenticated)/predictions/[userId]/visibility-banner.tsx`
5. Create `src/app/(authenticated)/predictions/[userId]/summary-strip.tsx`
6. Create `src/app/(authenticated)/predictions/[userId]/loading.tsx`

### Phase 4: Integration & Navigation

1. Modify `LeaderboardTable` — add clickable `<Link>` on user names
2. Add "My Predictions" to `NAV_ITEMS` in `constants.ts`
3. Update nav component to handle the new `History` icon
4. Add auto-refresh on countdown expiry in `VisibilityBanner`

### Phase 5: Testing

1. **Unit tests**: `can_view_gameweek_predictions` function (all 6 visibility matrix rows)
2. **Integration tests**: API endpoint with mocked Supabase
3. **E2E tests**:
   - Navigate leaderboard → prediction history
   - Pre-kickoff hidden state (viewer has predicted)
   - Pre-kickoff visible state (viewer has NOT predicted)
   - Post-kickoff visible state
   - Own predictions always visible
   - `/predictions/me` redirect
   - All-postponed gameweek edge case
   - Submission → visibility-blocked transition (Edge Case 4.4)

---

## Appendix A: SQL Test Queries

Use these to validate the migration manually:

```sql
-- Test: get_gameweek_first_kickoff returns correct time
SELECT public.get_gameweek_first_kickoff('SEASON_UUID', 15);

-- Test: has_user_predicted_in_gameweek for a user with predictions
SELECT public.has_user_predicted_in_gameweek('USER_UUID', 'SEASON_UUID', 15);

-- Test: can_view_gameweek_predictions — viewer is target (should be TRUE)
SELECT public.can_view_gameweek_predictions(
  'USER_A', 'USER_A', 'SEASON_UUID', 15
);

-- Test: can_view_gameweek_predictions — post-kickoff (should be TRUE)
-- (set a past gameweek)
SELECT public.can_view_gameweek_predictions(
  'USER_A', 'USER_B', 'SEASON_UUID', 1
);

-- Test: can_view_gameweek_predictions — pre-kickoff, viewer has predicted (should be FALSE)
-- (set a future gameweek where USER_A has predictions)
SELECT public.can_view_gameweek_predictions(
  'USER_A', 'USER_B', 'SEASON_UUID', 38
);

-- Test: can_view_gameweek_predictions — pre-kickoff, viewer has NOT predicted (should be TRUE)
-- (set a future gameweek where USER_C has NO predictions)
SELECT public.can_view_gameweek_predictions(
  'USER_C', 'USER_B', 'SEASON_UUID', 38
);
```

## Appendix B: Environment Variables

| Variable | Location | Purpose |
|----------|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | `.env.local`, Vercel | Supabase project URL (existing) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `.env.local`, Vercel | Supabase anon key (existing) |
| `SUPABASE_SERVICE_ROLE_KEY` | `.env.local`, Vercel | Service role key for bypassing RLS (new — must be server-only, no `NEXT_PUBLIC_` prefix) |
| `NEXT_PUBLIC_APP_URL` | `.env.local`, Vercel | App base URL for internal fetch calls in RSC (new) |
