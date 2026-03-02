# Badge & Milestone System — Architecture Specification

> **Version:** 1.0  
> **Date:** 2026-02-28  
> **Status:** Ready for implementation  
> **Depends on:** migrations 00001–00006, scoring engine, gameweek_leaderboard

---

## Table of Contents

1. [Database Schema](#1-database-schema)
2. [Badge Definitions (Client Catalog)](#2-badge-definitions-client-catalog)
3. [Badge Evaluation Architecture](#3-badge-evaluation-architecture)
4. [API Design (Server Actions)](#4-api-design-server-actions)
5. [Client Architecture (Components)](#5-client-architecture-components)
6. [Security Model](#6-security-model)
7. [File Manifest](#7-file-manifest)

---

## 1. Database Schema

### Migration: `supabase/migrations/00007_badges.sql`

```sql
-- ============================================================================
-- Grand Football — Badge & Milestone System
-- Migration: 00007_badges.sql
-- Created: 2026-02-28
-- Description: user_badges table, featured_badges column on profiles,
--              RLS policies, indexes, and admin audit log extension.
-- ============================================================================

-- ============================================================================
-- 1. USER_BADGES TABLE
-- ============================================================================

CREATE TABLE public.user_badges (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  badge_id   text NOT NULL CHECK (char_length(badge_id) BETWEEN 1 AND 50),
  season_id  uuid REFERENCES public.seasons(id) ON DELETE SET NULL,
  metadata   jsonb NOT NULL DEFAULT '{}',
  earned_at  timestamptz NOT NULL DEFAULT now(),

  -- Each user can only earn a specific badge once per season (or once globally if season_id IS NULL)
  UNIQUE (user_id, badge_id, season_id)
);

-- Partial unique index for badges that have NO season (career badges)
-- Ensures a user can't earn the same career badge twice
CREATE UNIQUE INDEX idx_user_badges_career_unique
  ON public.user_badges (user_id, badge_id)
  WHERE season_id IS NULL;

-- Query patterns: "all badges for user", "all users with badge X", "badges in season"
CREATE INDEX idx_user_badges_user       ON public.user_badges (user_id);
CREATE INDEX idx_user_badges_badge      ON public.user_badges (badge_id);
CREATE INDEX idx_user_badges_season     ON public.user_badges (season_id) WHERE season_id IS NOT NULL;
CREATE INDEX idx_user_badges_earned     ON public.user_badges (earned_at DESC);

COMMENT ON TABLE public.user_badges IS
  'Junction table recording which badges each user has earned. Badge catalog is client-side.';

-- ============================================================================
-- 2. FEATURED BADGES (column on profiles)
-- ============================================================================
-- Up to 3 badge IDs a user can showcase on leaderboard/profile.
-- Stored as a text[] array rather than a separate table to avoid joins
-- on every leaderboard render. Validated in application code (max 3, must be earned).

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS featured_badges text[] NOT NULL DEFAULT '{}';

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_featured_badges_max3
  CHECK (array_length(featured_badges, 1) IS NULL OR array_length(featured_badges, 1) <= 3);

COMMENT ON COLUMN public.profiles.featured_badges IS
  'Up to 3 badge_id strings the user has chosen to display on the leaderboard. Validated in app code that each ID is actually earned.';

-- ============================================================================
-- 3. ROW-LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.user_badges ENABLE ROW LEVEL SECURITY;

-- Everyone can READ all badges (badges are public social proof)
CREATE POLICY "user_badges_select_all"
  ON public.user_badges FOR SELECT
  TO authenticated
  USING (true);

-- Only service role (scoring engine / badge evaluator) can INSERT
-- No authenticated INSERT/UPDATE/DELETE policies = only service role can write
-- (service role bypasses RLS)

-- Explicit deny: no client-side badge awarding
-- (RLS default-deny handles this, but we add a comment for clarity)
COMMENT ON POLICY "user_badges_select_all" ON public.user_badges IS
  'All authenticated users can view all badges. INSERT/UPDATE/DELETE restricted to service role only.';

-- ============================================================================
-- 4. EXTEND ADMIN AUDIT LOG
-- ============================================================================

-- Add AWARD_BADGE and REVOKE_BADGE to the admin_audit_log action check
ALTER TABLE public.admin_audit_log
  DROP CONSTRAINT IF EXISTS admin_audit_log_action_check;

ALTER TABLE public.admin_audit_log
  ADD CONSTRAINT admin_audit_log_action_check
  CHECK (action IN (
    'TOGGLE_STAR', 'OVERRIDE_RESULT', 'RECALCULATE',
    'ADD_USER', 'REMOVE_USER', 'NEW_SEASON',
    'CREATE_STAR_MAN_SESSION', 'ADD_STAR_MAN_NOMINEE',
    'REMOVE_STAR_MAN_NOMINEE', 'OPEN_STAR_MAN_VOTING',
    'CLOSE_STAR_MAN_VOTING', 'EDIT_SCORE_RECORD',
    'AWARD_BADGE', 'REVOKE_BADGE'
  ));

-- ============================================================================
-- 5. HELPER: count_user_badges — used by grand_master check
-- ============================================================================

CREATE OR REPLACE FUNCTION public.count_user_badges(p_user_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT COUNT(DISTINCT badge_id)::integer
  FROM public.user_badges
  WHERE user_id = p_user_id;
$$;

COMMENT ON FUNCTION public.count_user_badges IS
  'Returns the number of distinct badges a user has earned. Used for the grand_master badge check.';
```

### Entity-Relationship Summary

```
profiles (1) ──── (*) user_badges (*) ──── (0..1) seasons
    │
    └── featured_badges text[]   (max 3 badge_id strings)
```

### Database Types Addition (`src/lib/database.types.ts`)

The generated Supabase types will add the following after running `supabase gen types`:

```typescript
// Inside public.Tables:
user_badges: {
  Row: {
    id: string
    user_id: string
    badge_id: string
    season_id: string | null
    metadata: Json
    earned_at: string
  }
  Insert: {
    id?: string
    user_id: string
    badge_id: string
    season_id?: string | null
    metadata?: Json
    earned_at?: string
  }
  Update: {
    id?: string
    user_id?: string
    badge_id?: string
    season_id?: string | null
    metadata?: Json
    earned_at?: string
  }
  Relationships: [
    {
      foreignKeyName: "user_badges_user_id_fkey"
      columns: ["user_id"]
      isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },
    {
      foreignKeyName: "user_badges_season_id_fkey"
      columns: ["season_id"]
      isOneToOne: false
      referencedRelation: "seasons"
      referencedColumns: ["id"]
    }
  ]
}

// profiles.Row gains:
featured_badges: string[]

// profiles.Insert gains:
featured_badges?: string[]

// profiles.Update gains:
featured_badges?: string[]
```

---

## 2. Badge Definitions (Client Catalog)

### File: `src/lib/badges/badge-catalog.ts`

The badge catalog lives entirely in client-side TypeScript. No DB table for definitions — only the `user_badges` junction table stores who earned what.

```typescript
// src/lib/badges/badge-catalog.ts

export type BadgeTier = 'common' | 'rare' | 'epic' | 'legendary';

export type BadgeCategory =
  | 'prediction'   // Based on prediction results
  | 'participation'// Based on submitting predictions / voting
  | 'leaderboard'  // Based on leaderboard positions
  | 'career'       // Lifetime accumulation
  | 'special';     // Meta-badges (grand_master, etc.)

export interface BadgeDefinition {
  /** Unique ID — matches badge_id in user_badges table */
  id: string;
  /** Human-readable name */
  name: string;
  /** Short description shown on badge card */
  description: string;
  /** How to unlock (shown when badge is locked) */
  hint: string;
  /** Visual tier — determines glow color and styling */
  tier: BadgeTier;
  /** Functional category — determines when the badge is evaluated */
  category: BadgeCategory;
  /** Emoji icon (used as badge icon; can be swapped for SVG later) */
  icon: string;
  /** Whether this badge is scoped to a season (true) or career (false) */
  seasonal: boolean;
}

/**
 * Tier metadata — drives visual styling in components.
 */
export const BADGE_TIERS: Record<
  BadgeTier,
  { label: string; glowColor: string; borderColor: string; textColor: string }
> = {
  common: {
    label: 'Common',
    glowColor: 'rgba(34, 197, 94, 0.3)',   // green
    borderColor: 'border-green-500/40',
    textColor: 'text-green-400',
  },
  rare: {
    label: 'Rare',
    glowColor: 'rgba(59, 130, 246, 0.3)',   // blue
    borderColor: 'border-blue-500/40',
    textColor: 'text-blue-400',
  },
  epic: {
    label: 'Epic',
    glowColor: 'rgba(168, 85, 247, 0.3)',   // purple
    borderColor: 'border-purple-500/40',
    textColor: 'text-purple-400',
  },
  legendary: {
    label: 'Legendary',
    glowColor: 'rgba(245, 197, 24, 0.35)',  // gold
    borderColor: 'border-yellow-500/50',
    textColor: 'text-yellow-400',
  },
};

/**
 * Complete badge catalog — 25 badges across 4 tiers.
 * The `id` field is the canonical key stored in the database.
 */
export const BADGE_CATALOG: BadgeDefinition[] = [
  // ── COMMON (green glow) ─────────────────────────────────────────────
  {
    id: 'first_blood',
    name: 'First Blood',
    description: 'Got your first correct exact score prediction',
    hint: 'Predict an exact score correctly',
    tier: 'common',
    category: 'prediction',
    icon: '🎯',
    seasonal: false,
  },
  {
    id: 'good_eye',
    name: 'Good Eye',
    description: 'Got your first correct outcome prediction',
    hint: 'Predict the correct match outcome',
    tier: 'common',
    category: 'prediction',
    icon: '👁️',
    seasonal: false,
  },
  {
    id: 'committed',
    name: 'Committed',
    description: 'Submitted predictions for 5 complete gameweeks',
    hint: 'Submit predictions for every fixture in 5 gameweeks',
    tier: 'common',
    category: 'participation',
    icon: '📋',
    seasonal: true,
  },
  {
    id: 'podium_finish',
    name: 'Podium Finish',
    description: 'Finished top 3 in a gameweek',
    hint: 'Reach the top 3 in any gameweek leaderboard',
    tier: 'common',
    category: 'leaderboard',
    icon: '🏅',
    seasonal: true,
  },
  {
    id: 'star_voter',
    name: 'Star Voter',
    description: 'Cast your first Star Man vote',
    hint: 'Vote in a Star Man session',
    tier: 'common',
    category: 'participation',
    icon: '⭐',
    seasonal: false,
  },
  {
    id: 'early_bird',
    name: 'Early Bird',
    description: 'Submitted all predictions 24h+ before kickoff',
    hint: 'Get all your gameweek predictions in early',
    tier: 'common',
    category: 'participation',
    icon: '🐦',
    seasonal: true,
  },
  {
    id: 'double_up',
    name: 'Double Up',
    description: 'Got 2 exact scores in a single gameweek',
    hint: 'Get 2 exact score predictions right in one gameweek',
    tier: 'common',
    category: 'prediction',
    icon: '✌️',
    seasonal: true,
  },

  // ── RARE (blue glow) ───────────────────────────────────────────────
  {
    id: 'sniper',
    name: 'Sniper',
    description: '10 correct exact scores in your career',
    hint: 'Accumulate 10 exact score predictions',
    tier: 'rare',
    category: 'career',
    icon: '🔫',
    seasonal: false,
  },
  {
    id: 'on_fire',
    name: 'On Fire',
    description: '3-gameweek streak of top-half finishes',
    hint: 'Finish in the top half for 3 consecutive gameweeks',
    tier: 'rare',
    category: 'leaderboard',
    icon: '🔥',
    seasonal: true,
  },
  {
    id: 'iron_will',
    name: 'Iron Will',
    description: 'Predicted every fixture in a calendar month',
    hint: 'Don\'t miss a single prediction for an entire month',
    tier: 'rare',
    category: 'participation',
    icon: '🛡️',
    seasonal: true,
  },
  {
    id: 'gameweek_champion',
    name: 'Gameweek Champion',
    description: 'Finished #1 in a gameweek',
    hint: 'Top the gameweek leaderboard',
    tier: 'rare',
    category: 'leaderboard',
    icon: '👑',
    seasonal: true,
  },
  {
    id: 'nil_nil_oracle',
    name: 'Nil-Nil Oracle',
    description: 'Correctly predicted a 0-0 draw',
    hint: 'Predict a goalless draw that comes true',
    tier: 'rare',
    category: 'prediction',
    icon: '🧘',
    seasonal: false,
  },
  {
    id: 'star_game_ace',
    name: 'Star Game Ace',
    description: 'Got an exact score on a star game',
    hint: 'Nail the exact score in a ⭐ star game',
    tier: 'rare',
    category: 'prediction',
    icon: '🌟',
    seasonal: true,
  },
  {
    id: 'hat_trick',
    name: 'Hat-Trick',
    description: '3 exact scores in one gameweek',
    hint: 'Get 3 exact score predictions right in one gameweek',
    tier: 'rare',
    category: 'prediction',
    icon: '🎩',
    seasonal: true,
  },
  {
    id: 'century',
    name: 'Century',
    description: 'Reached 100 total points in a season',
    hint: 'Accumulate 100 points in a single season',
    tier: 'rare',
    category: 'career',
    icon: '💯',
    seasonal: true,
  },

  // ── EPIC (purple glow) ─────────────────────────────────────────────
  {
    id: 'oracle',
    name: 'Oracle',
    description: '25 correct exact scores in your career',
    hint: 'Accumulate 25 exact score predictions',
    tier: 'epic',
    category: 'career',
    icon: '🔮',
    seasonal: false,
  },
  {
    id: 'unstoppable',
    name: 'Unstoppable',
    description: '5-gameweek streak of top-half leaderboard finishes',
    hint: 'Stay in the top half for 5 consecutive gameweeks',
    tier: 'epic',
    category: 'leaderboard',
    icon: '⚡',
    seasonal: true,
  },
  {
    id: 'perfect_gameweek',
    name: 'Perfect Gameweek',
    description: 'Got every prediction right in a gameweek (all correct outcomes)',
    hint: 'Get every match outcome right in a gameweek',
    tier: 'epic',
    category: 'prediction',
    icon: '💎',
    seasonal: true,
  },
  {
    id: 'serial_winner',
    name: 'Serial Winner',
    description: 'Won 3 different gameweeks in a single season',
    hint: 'Take the #1 spot in 3 different gameweeks',
    tier: 'epic',
    category: 'leaderboard',
    icon: '🏆',
    seasonal: true,
  },
  {
    id: 'the_underdog',
    name: 'The Underdog',
    description: 'Correctly predicted an upset result',
    hint: 'Predict when the lower-ranked team wins away',
    tier: 'epic',
    category: 'prediction',
    icon: '🐺',
    seasonal: false,
  },
  {
    id: 'bonus_hunter',
    name: 'Bonus Hunter',
    description: 'Earned monthly bonus 3 months in a row',
    hint: 'Get the monthly prediction bonus 3 consecutive months',
    tier: 'epic',
    category: 'participation',
    icon: '💰',
    seasonal: true,
  },

  // ── LEGENDARY (gold glow with shimmer) ─────────────────────────────
  {
    id: 'psychic',
    name: 'Psychic',
    description: '50 correct exact scores in your career',
    hint: 'Accumulate 50 exact score predictions',
    tier: 'legendary',
    category: 'career',
    icon: '🧠',
    seasonal: false,
  },
  {
    id: 'season_champion',
    name: 'Season Champion',
    description: 'Won the overall season',
    hint: 'Finish #1 on the season leaderboard',
    tier: 'legendary',
    category: 'leaderboard',
    icon: '🏟️',
    seasonal: true,
  },
  {
    id: 'grand_master',
    name: 'Grand Master',
    description: 'Earned 20 or more other badges',
    hint: 'Collect 20 different badges',
    tier: 'legendary',
    category: 'special',
    icon: '👑',
    seasonal: false,
  },
  {
    id: 'invincible',
    name: 'Invincible',
    description: 'Never finished bottom half for an entire season',
    hint: 'Stay in the top half every single gameweek of a season',
    tier: 'legendary',
    category: 'leaderboard',
    icon: '🛡️',
    seasonal: true,
  },
];

/** Lookup map for O(1) access by badge ID */
export const BADGE_MAP: Record<string, BadgeDefinition> =
  Object.fromEntries(BADGE_CATALOG.map((b) => [b.id, b]));

/** Get badges filtered by tier */
export function getBadgesByTier(tier: BadgeTier): BadgeDefinition[] {
  return BADGE_CATALOG.filter((b) => b.tier === tier);
}

/** Get badges filtered by category */
export function getBadgesByCategory(category: BadgeCategory): BadgeDefinition[] {
  return BADGE_CATALOG.filter((b) => b.category === category);
}
```

---

## 3. Badge Evaluation Architecture

### 3.1 Evaluation Triggers

Badges are evaluated **server-side only**, at well-defined trigger points:

| Trigger Point | When | Badges Checked |
|---|---|---|
| **After `calculate_fixture_scores`** | Admin scores a fixture | `first_blood`, `good_eye`, `nil_nil_oracle`, `star_game_ace`, `the_underdog`, `double_up`, `hat_trick`, `perfect_gameweek`, `sniper`, `oracle`, `psychic` |
| **After gameweek_leaderboard refresh** | All fixtures in a gameweek scored | `podium_finish`, `gameweek_champion`, `on_fire`, `unstoppable`, `serial_winner`, `century`, `invincible` |
| **After `calculate_monthly_bonus`** | End-of-month scoring run | `iron_will`, `bonus_hunter` |
| **On prediction submission** | User submits/updates prediction | `committed`, `early_bird` |
| **On Star Man vote** | User casts a vote | `star_voter` |
| **End of season** | Admin closes season | `season_champion`, `invincible` (final check), `grand_master` |

### 3.2 Badge Evaluation Context

```typescript
// src/lib/badges/types.ts

import type { BadgeDefinition } from './badge-catalog';

/** Context provided to the badge evaluation engine */
export interface BadgeEvalContext {
  /** The user being evaluated */
  userId: string;
  /** Active season ID */
  seasonId: string;
  /** Trigger that caused evaluation */
  trigger:
    | 'fixture_scored'
    | 'gameweek_complete'
    | 'monthly_bonus'
    | 'prediction_submitted'
    | 'star_man_vote'
    | 'season_end';
  /** Optional: specific fixture that was just scored */
  fixtureId?: string;
  /** Optional: specific gameweek number */
  gameweek?: number;
  /** Optional: the month being processed (for monthly badges) */
  month?: string; // ISO date string e.g. '2026-01-01'
}

/** Result of a badge evaluation */
export interface BadgeAwardResult {
  badgeId: string;
  badge: BadgeDefinition;
  seasonId: string | null;
  metadata: Record<string, unknown>;
}

/** Result returned from the evaluate function */
export interface BadgeEvalResult {
  userId: string;
  newBadges: BadgeAwardResult[];
  alreadyEarned: string[];
}
```

### 3.3 Core Evaluation Engine

```typescript
// src/lib/badges/evaluate.ts
//
// Single entry point for badge evaluation. Runs server-side only.
// Called from server actions after scoring events.
//
// Design principles:
// - Idempotent: safe to call multiple times (checks existing badges)
// - Incremental: only checks badges relevant to the trigger
// - Uses service-role client (bypasses RLS for writes)

import { createAdminClient } from '@/lib/supabase/admin';
import { BADGE_CATALOG, BADGE_MAP } from './badge-catalog';
import type { BadgeEvalContext, BadgeEvalResult, BadgeAwardResult } from './types';

/**
 * Main evaluation function. Receives context, queries DB for conditions,
 * and awards any newly earned badges.
 *
 * Returns the list of newly awarded badges (for toast notifications).
 */
export async function evaluateBadges(
  ctx: BadgeEvalContext,
): Promise<BadgeEvalResult> {
  const admin = createAdminClient();

  // 1. Fetch user's existing badges
  const { data: existingBadges } = await admin
    .from('user_badges')
    .select('badge_id')
    .eq('user_id', ctx.userId);

  const earnedSet = new Set(existingBadges?.map((b) => b.badge_id) ?? []);

  // 2. Determine which badges to check based on trigger
  const candidateBadgeIds = getCandidatesForTrigger(ctx.trigger);

  // 3. Filter out already-earned badges
  const toCheck = candidateBadgeIds.filter((id) => !earnedSet.has(id));

  if (toCheck.length === 0) {
    return { userId: ctx.userId, newBadges: [], alreadyEarned: [...earnedSet] };
  }

  // 4. Run individual badge checks
  const newBadges: BadgeAwardResult[] = [];

  for (const badgeId of toCheck) {
    const checker = BADGE_CHECKERS[badgeId];
    if (!checker) continue;

    const result = await checker(ctx, admin);
    if (result) {
      newBadges.push(result);
    }
  }

  // 5. Persist newly awarded badges
  if (newBadges.length > 0) {
    await admin.from('user_badges').insert(
      newBadges.map((b) => ({
        user_id: ctx.userId,
        badge_id: b.badgeId,
        season_id: b.seasonId,
        metadata: b.metadata,
      })),
    );
  }

  // 6. After awarding, re-check grand_master (meta-badge)
  if (newBadges.length > 0 && !earnedSet.has('grand_master')) {
    const totalBadges = earnedSet.size + newBadges.length;
    if (totalBadges >= 20) {
      const grandMasterResult: BadgeAwardResult = {
        badgeId: 'grand_master',
        badge: BADGE_MAP['grand_master']!,
        seasonId: null,
        metadata: { total_badges: totalBadges },
      };
      await admin.from('user_badges').insert({
        user_id: ctx.userId,
        badge_id: 'grand_master',
        season_id: null,
        metadata: { total_badges: totalBadges },
      });
      newBadges.push(grandMasterResult);
    }
  }

  return {
    userId: ctx.userId,
    newBadges,
    alreadyEarned: [...earnedSet],
  };
}

// --- Trigger → Badge mapping ---

function getCandidatesForTrigger(trigger: BadgeEvalContext['trigger']): string[] {
  switch (trigger) {
    case 'fixture_scored':
      return [
        'first_blood', 'good_eye', 'nil_nil_oracle', 'star_game_ace',
        'the_underdog', 'double_up', 'hat_trick', 'perfect_gameweek',
        'sniper', 'oracle', 'psychic',
      ];
    case 'gameweek_complete':
      return [
        'podium_finish', 'gameweek_champion', 'on_fire', 'unstoppable',
        'serial_winner', 'century', 'invincible',
      ];
    case 'monthly_bonus':
      return ['iron_will', 'bonus_hunter'];
    case 'prediction_submitted':
      return ['committed', 'early_bird'];
    case 'star_man_vote':
      return ['star_voter'];
    case 'season_end':
      return [
        'season_champion', 'invincible', 'grand_master',
      ];
    default:
      return [];
  }
}

// --- Individual badge checker type ---

type SupabaseAdmin = ReturnType<typeof createAdminClient>;
type BadgeChecker = (
  ctx: BadgeEvalContext,
  db: SupabaseAdmin,
) => Promise<BadgeAwardResult | null>;

// --- Badge checker implementations (abbreviated signatures) ---
// Full implementations in src/lib/badges/checkers/*.ts

const BADGE_CHECKERS: Record<string, BadgeChecker> = {
  // Loaded dynamically — see section 3.4
};
```

### 3.4 Individual Badge Checkers

Each checker is a pure async function that queries the DB and returns a `BadgeAwardResult | null`.

**File:** `src/lib/badges/checkers/prediction-checkers.ts`

```typescript
// Prediction-based badge checkers
// Each function receives BadgeEvalContext + admin Supabase client

import { BADGE_MAP } from '../badge-catalog';
import type { BadgeEvalContext, BadgeAwardResult } from '../types';

type SupabaseAdmin = ReturnType<typeof import('@/lib/supabase/admin').createAdminClient>;

/** first_blood — First exact score prediction ever */
export async function checkFirstBlood(
  ctx: BadgeEvalContext,
  db: SupabaseAdmin,
): Promise<BadgeAwardResult | null> {
  const { count } = await db
    .from('score_records')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', ctx.userId)
    .in('reason_code', ['EXACT_SCORE', 'STAR_EXACT']);

  if ((count ?? 0) >= 1) {
    return {
      badgeId: 'first_blood',
      badge: BADGE_MAP['first_blood']!,
      seasonId: null, // career badge
      metadata: {},
    };
  }
  return null;
}

/** good_eye — First correct outcome prediction */
export async function checkGoodEye(
  ctx: BadgeEvalContext,
  db: SupabaseAdmin,
): Promise<BadgeAwardResult | null> {
  const { count } = await db
    .from('score_records')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', ctx.userId)
    .in('reason_code', ['OUTCOME', 'STAR_OUTCOME', 'EXACT_SCORE', 'STAR_EXACT']);

  if ((count ?? 0) >= 1) {
    return {
      badgeId: 'good_eye',
      badge: BADGE_MAP['good_eye']!,
      seasonId: null,
      metadata: {},
    };
  }
  return null;
}

/** nil_nil_oracle — Correctly predict a 0-0 draw */
export async function checkNilNilOracle(
  ctx: BadgeEvalContext,
  db: SupabaseAdmin,
): Promise<BadgeAwardResult | null> {
  const { count } = await db
    .from('score_records')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', ctx.userId)
    .in('reason_code', ['EXACT_SCORE', 'STAR_EXACT'])
    .eq('actual_home', 0)
    .eq('actual_away', 0);

  if ((count ?? 0) >= 1) {
    return {
      badgeId: 'nil_nil_oracle',
      badge: BADGE_MAP['nil_nil_oracle']!,
      seasonId: null,
      metadata: {},
    };
  }
  return null;
}

/** star_game_ace — Get exact score on a star game */
export async function checkStarGameAce(
  ctx: BadgeEvalContext,
  db: SupabaseAdmin,
): Promise<BadgeAwardResult | null> {
  const { count } = await db
    .from('score_records')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', ctx.userId)
    .eq('reason_code', 'STAR_EXACT');

  if ((count ?? 0) >= 1) {
    return {
      badgeId: 'star_game_ace',
      badge: BADGE_MAP['star_game_ace']!,
      seasonId: ctx.seasonId,
      metadata: { fixture_id: ctx.fixtureId },
    };
  }
  return null;
}

/** double_up — 2 exact scores in a single gameweek */
export async function checkDoubleUp(
  ctx: BadgeEvalContext,
  db: SupabaseAdmin,
): Promise<BadgeAwardResult | null> {
  if (!ctx.gameweek) return null;

  const { count } = await db
    .from('score_records')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', ctx.userId)
    .in('reason_code', ['EXACT_SCORE', 'STAR_EXACT'])
    .in(
      'fixture_id',
      // Sub-select: fixtures in this gameweek
      (await db
        .from('fixtures')
        .select('id')
        .eq('season_id', ctx.seasonId)
        .eq('gameweek', ctx.gameweek)
      ).data?.map((f) => f.id) ?? [],
    );

  if ((count ?? 0) >= 2) {
    return {
      badgeId: 'double_up',
      badge: BADGE_MAP['double_up']!,
      seasonId: ctx.seasonId,
      metadata: { gameweek: ctx.gameweek },
    };
  }
  return null;
}

/** hat_trick — 3 exact scores in one gameweek */
export async function checkHatTrick(
  ctx: BadgeEvalContext,
  db: SupabaseAdmin,
): Promise<BadgeAwardResult | null> {
  if (!ctx.gameweek) return null;

  const fixtureIds = (
    await db
      .from('fixtures')
      .select('id')
      .eq('season_id', ctx.seasonId)
      .eq('gameweek', ctx.gameweek)
  ).data?.map((f) => f.id) ?? [];

  const { count } = await db
    .from('score_records')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', ctx.userId)
    .in('reason_code', ['EXACT_SCORE', 'STAR_EXACT'])
    .in('fixture_id', fixtureIds);

  if ((count ?? 0) >= 3) {
    return {
      badgeId: 'hat_trick',
      badge: BADGE_MAP['hat_trick']!,
      seasonId: ctx.seasonId,
      metadata: { gameweek: ctx.gameweek },
    };
  }
  return null;
}

/** perfect_gameweek — Every prediction correct outcome in a gameweek */
export async function checkPerfectGameweek(
  ctx: BadgeEvalContext,
  db: SupabaseAdmin,
): Promise<BadgeAwardResult | null> {
  if (!ctx.gameweek) return null;

  const fixtureIds = (
    await db
      .from('fixtures')
      .select('id')
      .eq('season_id', ctx.seasonId)
      .eq('gameweek', ctx.gameweek)
      .eq('status', 'FINISHED')
  ).data?.map((f) => f.id) ?? [];

  if (fixtureIds.length === 0) return null;

  // Count user's correct outcomes (exact also counts as correct outcome)
  const { count: correctCount } = await db
    .from('score_records')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', ctx.userId)
    .in('reason_code', ['EXACT_SCORE', 'STAR_EXACT', 'OUTCOME', 'STAR_OUTCOME'])
    .in('fixture_id', fixtureIds);

  if ((correctCount ?? 0) === fixtureIds.length) {
    return {
      badgeId: 'perfect_gameweek',
      badge: BADGE_MAP['perfect_gameweek']!,
      seasonId: ctx.seasonId,
      metadata: { gameweek: ctx.gameweek, fixture_count: fixtureIds.length },
    };
  }
  return null;
}

/** the_underdog — Correctly predict an upset (away team winning) */
export async function checkTheUnderdog(
  ctx: BadgeEvalContext,
  db: SupabaseAdmin,
): Promise<BadgeAwardResult | null> {
  // An upset = the user predicted away win AND the result was an away win
  // (home advantage means away win is the "upset")
  const { count } = await db
    .from('score_records')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', ctx.userId)
    .in('reason_code', ['EXACT_SCORE', 'STAR_EXACT', 'OUTCOME', 'STAR_OUTCOME'])
    .gt('actual_away', db.rpc as unknown as number); // We need raw SQL for this

  // Because Supabase JS client doesn't support `actual_away > actual_home`
  // directly, we use a raw query approach:
  const { data } = await db.rpc('count_user_badges', { p_user_id: ctx.userId });
  // Actually, for this badge we need a custom approach:

  const { data: upsets } = await db
    .from('score_records')
    .select('id, actual_home, actual_away, predicted_home, predicted_away')
    .eq('user_id', ctx.userId)
    .in('reason_code', ['EXACT_SCORE', 'STAR_EXACT', 'OUTCOME', 'STAR_OUTCOME']);

  const hasUpset = upsets?.some(
    (r) =>
      r.actual_away !== null &&
      r.actual_home !== null &&
      r.actual_away > r.actual_home &&
      r.predicted_away !== null &&
      r.predicted_home !== null &&
      r.predicted_away > r.predicted_home,
  );

  if (hasUpset) {
    return {
      badgeId: 'the_underdog',
      badge: BADGE_MAP['the_underdog']!,
      seasonId: null,
      metadata: {},
    };
  }
  return null;
}
```

**File:** `src/lib/badges/checkers/career-checkers.ts`

```typescript
// Career accumulation badge checkers

import { BADGE_MAP } from '../badge-catalog';
import type { BadgeEvalContext, BadgeAwardResult } from '../types';

type SupabaseAdmin = ReturnType<typeof import('@/lib/supabase/admin').createAdminClient>;

/** sniper — 10 career exact scores */
export async function checkSniper(
  ctx: BadgeEvalContext,
  db: SupabaseAdmin,
): Promise<BadgeAwardResult | null> {
  const { count } = await db
    .from('score_records')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', ctx.userId)
    .in('reason_code', ['EXACT_SCORE', 'STAR_EXACT']);

  if ((count ?? 0) >= 10) {
    return {
      badgeId: 'sniper',
      badge: BADGE_MAP['sniper']!,
      seasonId: null,
      metadata: { exact_count: count },
    };
  }
  return null;
}

/** oracle — 25 career exact scores */
export async function checkOracle(
  ctx: BadgeEvalContext,
  db: SupabaseAdmin,
): Promise<BadgeAwardResult | null> {
  const { count } = await db
    .from('score_records')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', ctx.userId)
    .in('reason_code', ['EXACT_SCORE', 'STAR_EXACT']);

  if ((count ?? 0) >= 25) {
    return {
      badgeId: 'oracle',
      badge: BADGE_MAP['oracle']!,
      seasonId: null,
      metadata: { exact_count: count },
    };
  }
  return null;
}

/** psychic — 50 career exact scores */
export async function checkPsychic(
  ctx: BadgeEvalContext,
  db: SupabaseAdmin,
): Promise<BadgeAwardResult | null> {
  const { count } = await db
    .from('score_records')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', ctx.userId)
    .in('reason_code', ['EXACT_SCORE', 'STAR_EXACT']);

  if ((count ?? 0) >= 50) {
    return {
      badgeId: 'psychic',
      badge: BADGE_MAP['psychic']!,
      seasonId: null,
      metadata: { exact_count: count },
    };
  }
  return null;
}

/** century — 100 total points in a season */
export async function checkCentury(
  ctx: BadgeEvalContext,
  db: SupabaseAdmin,
): Promise<BadgeAwardResult | null> {
  const { data: leaderboard } = await db.rpc('get_season_leaderboard', {
    p_season_id: ctx.seasonId,
  });

  const userEntry = leaderboard?.find((e) => e.user_id === ctx.userId);
  if (userEntry && Number(userEntry.total_points) >= 100) {
    return {
      badgeId: 'century',
      badge: BADGE_MAP['century']!,
      seasonId: ctx.seasonId,
      metadata: { total_points: Number(userEntry.total_points) },
    };
  }
  return null;
}
```

**File:** `src/lib/badges/checkers/leaderboard-checkers.ts`

```typescript
// Leaderboard-based badge checkers

import { BADGE_MAP } from '../badge-catalog';
import type { BadgeEvalContext, BadgeAwardResult } from '../types';

type SupabaseAdmin = ReturnType<typeof import('@/lib/supabase/admin').createAdminClient>;

/** podium_finish — Top 3 in any gameweek */
export async function checkPodiumFinish(
  ctx: BadgeEvalContext,
  db: SupabaseAdmin,
): Promise<BadgeAwardResult | null> {
  if (!ctx.gameweek) return null;

  const { data } = await db.rpc('get_gameweek_leaderboard', {
    p_season_id: ctx.seasonId,
    p_gameweek: ctx.gameweek,
  });

  const userEntry = data?.find((e) => e.user_id === ctx.userId);
  if (userEntry && Number(userEntry.rank) <= 3) {
    return {
      badgeId: 'podium_finish',
      badge: BADGE_MAP['podium_finish']!,
      seasonId: ctx.seasonId,
      metadata: { gameweek: ctx.gameweek, rank: Number(userEntry.rank) },
    };
  }
  return null;
}

/** gameweek_champion — #1 in any gameweek */
export async function checkGameweekChampion(
  ctx: BadgeEvalContext,
  db: SupabaseAdmin,
): Promise<BadgeAwardResult | null> {
  if (!ctx.gameweek) return null;

  const { data } = await db.rpc('get_gameweek_leaderboard', {
    p_season_id: ctx.seasonId,
    p_gameweek: ctx.gameweek,
  });

  const userEntry = data?.find((e) => e.user_id === ctx.userId);
  if (userEntry && Number(userEntry.rank) === 1) {
    return {
      badgeId: 'gameweek_champion',
      badge: BADGE_MAP['gameweek_champion']!,
      seasonId: ctx.seasonId,
      metadata: { gameweek: ctx.gameweek },
    };
  }
  return null;
}

/** on_fire — 3-gameweek streak of top-half finishes */
export async function checkOnFire(
  ctx: BadgeEvalContext,
  db: SupabaseAdmin,
): Promise<BadgeAwardResult | null> {
  if (!ctx.gameweek || ctx.gameweek < 3) return null;

  // Check the last 3 gameweeks including the current one
  const streakLength = await getTopHalfStreak(ctx, db, 3);

  if (streakLength >= 3) {
    return {
      badgeId: 'on_fire',
      badge: BADGE_MAP['on_fire']!,
      seasonId: ctx.seasonId,
      metadata: { streak: 3, ending_gameweek: ctx.gameweek },
    };
  }
  return null;
}

/** unstoppable — 5-gameweek streak of top-half finishes */
export async function checkUnstoppable(
  ctx: BadgeEvalContext,
  db: SupabaseAdmin,
): Promise<BadgeAwardResult | null> {
  if (!ctx.gameweek || ctx.gameweek < 5) return null;

  const streakLength = await getTopHalfStreak(ctx, db, 5);

  if (streakLength >= 5) {
    return {
      badgeId: 'unstoppable',
      badge: BADGE_MAP['unstoppable']!,
      seasonId: ctx.seasonId,
      metadata: { streak: 5, ending_gameweek: ctx.gameweek },
    };
  }
  return null;
}

/** serial_winner — 3 different gameweek #1 finishes in a season */
export async function checkSerialWinner(
  ctx: BadgeEvalContext,
  db: SupabaseAdmin,
): Promise<BadgeAwardResult | null> {
  // Query gameweek_leaderboard materialized view for rank=1 entries
  const { data } = await db
    .from('gameweek_leaderboard')
    .select('gameweek')
    .eq('user_id', ctx.userId)
    .eq('season_id', ctx.seasonId)
    .eq('rank', 1);

  if ((data?.length ?? 0) >= 3) {
    return {
      badgeId: 'serial_winner',
      badge: BADGE_MAP['serial_winner']!,
      seasonId: ctx.seasonId,
      metadata: { winning_gameweeks: data!.map((d) => d.gameweek) },
    };
  }
  return null;
}

/** season_champion — #1 on season leaderboard (end of season only) */
export async function checkSeasonChampion(
  ctx: BadgeEvalContext,
  db: SupabaseAdmin,
): Promise<BadgeAwardResult | null> {
  const { data } = await db.rpc('get_season_leaderboard', {
    p_season_id: ctx.seasonId,
  });

  const userEntry = data?.find((e) => e.user_id === ctx.userId);
  if (userEntry && Number(userEntry.rank) === 1) {
    return {
      badgeId: 'season_champion',
      badge: BADGE_MAP['season_champion']!,
      seasonId: ctx.seasonId,
      metadata: { total_points: Number(userEntry.total_points) },
    };
  }
  return null;
}

/** invincible — Never finished bottom half for entire season */
export async function checkInvincible(
  ctx: BadgeEvalContext,
  db: SupabaseAdmin,
): Promise<BadgeAwardResult | null> {
  // Get all gameweeks that have been played
  const { data: playedGameweeks } = await db
    .from('gameweek_leaderboard')
    .select('gameweek')
    .eq('season_id', ctx.seasonId)
    .eq('user_id', ctx.userId);

  if (!playedGameweeks || playedGameweeks.length === 0) return null;

  // For each gameweek, check if user was in top half
  for (const gw of playedGameweeks) {
    const { data: gwLeaderboard } = await db.rpc('get_gameweek_leaderboard', {
      p_season_id: ctx.seasonId,
      p_gameweek: gw.gameweek,
    });

    if (!gwLeaderboard) continue;

    const totalPlayers = gwLeaderboard.length;
    const userEntry = gwLeaderboard.find((e) => e.user_id === ctx.userId);
    if (!userEntry) return null;
    if (Number(userEntry.rank) > Math.ceil(totalPlayers / 2)) return null;
  }

  return {
    badgeId: 'invincible',
    badge: BADGE_MAP['invincible']!,
    seasonId: ctx.seasonId,
    metadata: { gameweeks_played: playedGameweeks.length },
  };
}

// --- Helper: check top-half streak ---

async function getTopHalfStreak(
  ctx: BadgeEvalContext,
  db: SupabaseAdmin,
  requiredStreak: number,
): Promise<number> {
  if (!ctx.gameweek) return 0;

  let streak = 0;
  for (let gw = ctx.gameweek; gw >= 1 && streak < requiredStreak; gw--) {
    const { data } = await db.rpc('get_gameweek_leaderboard', {
      p_season_id: ctx.seasonId,
      p_gameweek: gw,
    });

    if (!data || data.length === 0) break;

    const totalPlayers = data.length;
    const userEntry = data.find((e) => e.user_id === ctx.userId);
    if (!userEntry) break;

    if (Number(userEntry.rank) <= Math.ceil(totalPlayers / 2)) {
      streak++;
    } else {
      break;
    }
  }

  return streak;
}
```

**File:** `src/lib/badges/checkers/participation-checkers.ts`

```typescript
// Participation-based badge checkers

import { BADGE_MAP } from '../badge-catalog';
import type { BadgeEvalContext, BadgeAwardResult } from '../types';

type SupabaseAdmin = ReturnType<typeof import('@/lib/supabase/admin').createAdminClient>;

/** committed — 5 complete gameweeks of predictions */
export async function checkCommitted(
  ctx: BadgeEvalContext,
  db: SupabaseAdmin,
): Promise<BadgeAwardResult | null> {
  // A "complete gameweek" = user predicted every fixture in that gameweek
  // Get all gameweeks in the season with their fixture counts
  const { data: gameweekCounts } = await db
    .from('fixtures')
    .select('gameweek')
    .eq('season_id', ctx.seasonId);

  if (!gameweekCounts) return null;

  // Count fixtures per gameweek
  const gwFixtureCounts = new Map<number, number>();
  for (const row of gameweekCounts) {
    gwFixtureCounts.set(row.gameweek, (gwFixtureCounts.get(row.gameweek) ?? 0) + 1);
  }

  // Get user's predictions grouped by gameweek
  const { data: predictions } = await db
    .from('predictions')
    .select('fixture_id, fixtures!inner(gameweek, season_id)')
    .eq('user_id', ctx.userId)
    .eq('fixtures.season_id', ctx.seasonId);

  if (!predictions) return null;

  // Count predictions per gameweek
  const gwPredCounts = new Map<number, number>();
  for (const pred of predictions) {
    const gw = (pred.fixtures as unknown as { gameweek: number }).gameweek;
    gwPredCounts.set(gw, (gwPredCounts.get(gw) ?? 0) + 1);
  }

  // Count complete gameweeks
  let completeCount = 0;
  for (const [gw, fixtureCount] of gwFixtureCounts) {
    if ((gwPredCounts.get(gw) ?? 0) >= fixtureCount) {
      completeCount++;
    }
  }

  if (completeCount >= 5) {
    return {
      badgeId: 'committed',
      badge: BADGE_MAP['committed']!,
      seasonId: ctx.seasonId,
      metadata: { complete_gameweeks: completeCount },
    };
  }
  return null;
}

/** early_bird — All predictions submitted 24h+ before kickoff */
export async function checkEarlyBird(
  ctx: BadgeEvalContext,
  db: SupabaseAdmin,
): Promise<BadgeAwardResult | null> {
  if (!ctx.gameweek) return null;

  // Get all fixtures in this gameweek
  const { data: fixtures } = await db
    .from('fixtures')
    .select('id, kickoff_time')
    .eq('season_id', ctx.seasonId)
    .eq('gameweek', ctx.gameweek);

  if (!fixtures || fixtures.length === 0) return null;

  // Get user's predictions for these fixtures
  const fixtureIds = fixtures.map((f) => f.id);
  const { data: predictions } = await db
    .from('predictions')
    .select('fixture_id, submitted_at')
    .eq('user_id', ctx.userId)
    .in('fixture_id', fixtureIds);

  if (!predictions || predictions.length < fixtures.length) return null;

  // Check each prediction was submitted 24h+ before kickoff
  for (const pred of predictions) {
    const fixture = fixtures.find((f) => f.id === pred.fixture_id);
    if (!fixture) return null;

    const kickoff = new Date(fixture.kickoff_time);
    const submitted = new Date(pred.submitted_at);
    const hoursBefore = (kickoff.getTime() - submitted.getTime()) / (1000 * 60 * 60);

    if (hoursBefore < 24) return null;
  }

  return {
    badgeId: 'early_bird',
    badge: BADGE_MAP['early_bird']!,
    seasonId: ctx.seasonId,
    metadata: { gameweek: ctx.gameweek },
  };
}

/** star_voter — Cast first Star Man vote */
export async function checkStarVoter(
  ctx: BadgeEvalContext,
  db: SupabaseAdmin,
): Promise<BadgeAwardResult | null> {
  const { count } = await db
    .from('star_man_votes')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', ctx.userId);

  if ((count ?? 0) >= 1) {
    return {
      badgeId: 'star_voter',
      badge: BADGE_MAP['star_voter']!,
      seasonId: null,
      metadata: {},
    };
  }
  return null;
}

/** iron_will — Predicted every fixture in a calendar month */
export async function checkIronWill(
  ctx: BadgeEvalContext,
  db: SupabaseAdmin,
): Promise<BadgeAwardResult | null> {
  if (!ctx.month) return null;

  const { data: bonus } = await db
    .from('monthly_bonuses')
    .select('eligible')
    .eq('user_id', ctx.userId)
    .eq('season_id', ctx.seasonId)
    .eq('month', ctx.month)
    .single();

  if (bonus?.eligible) {
    return {
      badgeId: 'iron_will',
      badge: BADGE_MAP['iron_will']!,
      seasonId: ctx.seasonId,
      metadata: { month: ctx.month },
    };
  }
  return null;
}

/** bonus_hunter — 3 consecutive months of monthly bonus */
export async function checkBonusHunter(
  ctx: BadgeEvalContext,
  db: SupabaseAdmin,
): Promise<BadgeAwardResult | null> {
  const { data: bonuses } = await db
    .from('monthly_bonuses')
    .select('month, eligible')
    .eq('user_id', ctx.userId)
    .eq('season_id', ctx.seasonId)
    .eq('eligible', true)
    .order('month', { ascending: true });

  if (!bonuses || bonuses.length < 3) return null;

  // Check for 3 consecutive months
  for (let i = 2; i < bonuses.length; i++) {
    const m1 = new Date(bonuses[i - 2]!.month);
    const m2 = new Date(bonuses[i - 1]!.month);
    const m3 = new Date(bonuses[i]!.month);

    // Check months are consecutive (month2 = month1 + 1, month3 = month2 + 1)
    const isConsecutive =
      (m2.getFullYear() * 12 + m2.getMonth()) - (m1.getFullYear() * 12 + m1.getMonth()) === 1 &&
      (m3.getFullYear() * 12 + m3.getMonth()) - (m2.getFullYear() * 12 + m2.getMonth()) === 1;

    if (isConsecutive) {
      return {
        badgeId: 'bonus_hunter',
        badge: BADGE_MAP['bonus_hunter']!,
        seasonId: ctx.seasonId,
        metadata: { months: [bonuses[i - 2]!.month, bonuses[i - 1]!.month, bonuses[i]!.month] },
      };
    }
  }
  return null;
}
```

### 3.5 Checker Registry

**File:** `src/lib/badges/checkers/index.ts`

```typescript
// Central registry of all badge checkers

import type { BadgeEvalContext, BadgeAwardResult } from '../types';
import {
  checkFirstBlood, checkGoodEye, checkNilNilOracle,
  checkStarGameAce, checkDoubleUp, checkHatTrick,
  checkPerfectGameweek, checkTheUnderdog,
} from './prediction-checkers';
import {
  checkSniper, checkOracle, checkPsychic, checkCentury,
} from './career-checkers';
import {
  checkPodiumFinish, checkGameweekChampion, checkOnFire,
  checkUnstoppable, checkSerialWinner, checkSeasonChampion,
  checkInvincible,
} from './leaderboard-checkers';
import {
  checkCommitted, checkEarlyBird, checkStarVoter,
  checkIronWill, checkBonusHunter,
} from './participation-checkers';

type SupabaseAdmin = ReturnType<typeof import('@/lib/supabase/admin').createAdminClient>;
type BadgeChecker = (
  ctx: BadgeEvalContext,
  db: SupabaseAdmin,
) => Promise<BadgeAwardResult | null>;

export const BADGE_CHECKERS: Record<string, BadgeChecker> = {
  // Prediction
  first_blood: checkFirstBlood,
  good_eye: checkGoodEye,
  nil_nil_oracle: checkNilNilOracle,
  star_game_ace: checkStarGameAce,
  double_up: checkDoubleUp,
  hat_trick: checkHatTrick,
  perfect_gameweek: checkPerfectGameweek,
  the_underdog: checkTheUnderdog,

  // Career
  sniper: checkSniper,
  oracle: checkOracle,
  psychic: checkPsychic,
  century: checkCentury,

  // Leaderboard
  podium_finish: checkPodiumFinish,
  gameweek_champion: checkGameweekChampion,
  on_fire: checkOnFire,
  unstoppable: checkUnstoppable,
  serial_winner: checkSerialWinner,
  season_champion: checkSeasonChampion,
  invincible: checkInvincible,

  // Participation
  committed: checkCommitted,
  early_bird: checkEarlyBird,
  star_voter: checkStarVoter,
  iron_will: checkIronWill,
  bonus_hunter: checkBonusHunter,

  // grand_master is handled directly in evaluate.ts (meta-badge)
};
```

### 3.6 Integration with Existing Scoring Flow

The badge evaluator is called from the existing admin scoring actions. The integration points:

```
Admin clicks "Score Fixture"
  └─→ calculateFixtureScores() (existing server action)
       └─→ Supabase RPC: calculate_fixture_scores()
       └─→ NEW: evaluateBadgesForFixture() — loops all users,
            calls evaluateBadges() with trigger='fixture_scored'

Admin clicks "Refresh Gameweek Leaderboard"
  └─→ refreshGameweekLeaderboard() (existing server action)
       └─→ NEW: evaluateBadgesForGameweek() — loops all users,
            calls evaluateBadges() with trigger='gameweek_complete'

User submits prediction
  └─→ submitPrediction() (existing server action)
       └─→ NEW: evaluateBadges() with trigger='prediction_submitted'
            (single user, fire-and-forget)

User casts Star Man vote
  └─→ castStarManVote() (existing server action)
       └─→ NEW: evaluateBadges() with trigger='star_man_vote'
            (single user, fire-and-forget)
```

**Batch evaluation helper** (for post-scoring runs):

```typescript
// src/lib/badges/evaluate-batch.ts

import { createAdminClient } from '@/lib/supabase/admin';
import { evaluateBadges } from './evaluate';
import type { BadgeEvalContext } from './types';

/**
 * Evaluate badges for ALL users after a fixture is scored.
 * Called from admin scoring action.
 */
export async function evaluateBadgesForFixture(
  seasonId: string,
  fixtureId: string,
  gameweek: number,
): Promise<{ userId: string; newBadges: string[] }[]> {
  const admin = createAdminClient();
  const { data: profiles } = await admin.from('profiles').select('id');

  const results: { userId: string; newBadges: string[] }[] = [];

  for (const profile of profiles ?? []) {
    const result = await evaluateBadges({
      userId: profile.id,
      seasonId,
      trigger: 'fixture_scored',
      fixtureId,
      gameweek,
    });

    if (result.newBadges.length > 0) {
      results.push({
        userId: profile.id,
        newBadges: result.newBadges.map((b) => b.badgeId),
      });
    }
  }

  return results;
}

/**
 * Evaluate leaderboard-based badges for all users after a gameweek completes.
 */
export async function evaluateBadgesForGameweek(
  seasonId: string,
  gameweek: number,
): Promise<{ userId: string; newBadges: string[] }[]> {
  const admin = createAdminClient();
  const { data: profiles } = await admin.from('profiles').select('id');

  const results: { userId: string; newBadges: string[] }[] = [];

  for (const profile of profiles ?? []) {
    const result = await evaluateBadges({
      userId: profile.id,
      seasonId,
      trigger: 'gameweek_complete',
      gameweek,
    });

    if (result.newBadges.length > 0) {
      results.push({
        userId: profile.id,
        newBadges: result.newBadges.map((b) => b.badgeId),
      });
    }
  }

  return results;
}
```

---

## 4. API Design (Server Actions)

### 4.1 Badge Query Actions

**File:** `src/app/(authenticated)/badges/actions.ts`

```typescript
'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

// ── Get user badges ─────────────────────────────────────────────────────

export async function getUserBadges(userId: string): Promise<{
  badges: { badge_id: string; earned_at: string; season_id: string | null; metadata: unknown }[];
  error?: string;
}> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { badges: [], error: 'Not authenticated' };

  const { data, error } = await supabase
    .from('user_badges')
    .select('badge_id, earned_at, season_id, metadata')
    .eq('user_id', userId)
    .order('earned_at', { ascending: false });

  if (error) return { badges: [], error: error.message };
  return { badges: data ?? [] };
}

// ── Get featured badges for a user ──────────────────────────────────────

export async function getFeaturedBadges(userId: string): Promise<{
  featuredBadges: string[];
  error?: string;
}> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('profiles')
    .select('featured_badges')
    .eq('id', userId)
    .single();

  if (error) return { featuredBadges: [], error: error.message };
  return { featuredBadges: data?.featured_badges ?? [] };
}

// ── Update featured badges ──────────────────────────────────────────────

const featuredBadgesSchema = z.object({
  badgeIds: z.array(z.string().min(1).max(50)).max(3),
});

export async function updateFeaturedBadges(
  formData: FormData,
): Promise<{ error?: string; success?: boolean }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const raw = formData.get('badgeIds');
  const parsed = featuredBadgesSchema.safeParse({
    badgeIds: raw ? JSON.parse(raw as string) : [],
  });

  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? 'Invalid input' };
  }

  const { badgeIds } = parsed.data;

  // Validate that the user actually owns these badges
  if (badgeIds.length > 0) {
    const { data: ownedBadges } = await supabase
      .from('user_badges')
      .select('badge_id')
      .eq('user_id', user.id)
      .in('badge_id', badgeIds);

    const ownedSet = new Set(ownedBadges?.map((b) => b.badge_id));
    const allOwned = badgeIds.every((id) => ownedSet.has(id));

    if (!allOwned) {
      return { error: 'You can only feature badges you have earned.' };
    }
  }

  const { error: dbError } = await supabase
    .from('profiles')
    .update({ featured_badges: badgeIds })
    .eq('id', user.id);

  if (dbError) return { error: 'Failed to update featured badges.' };

  revalidatePath('/settings');
  revalidatePath('/leaderboard');
  return { success: true };
}
```

### 4.2 Admin Badge Actions

**File:** `src/app/(authenticated)/admin/badge-actions.ts`

```typescript
'use server';

import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

/** Helper: verify admin */
async function requireAdmin(): Promise<string> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  const { data: isAdmin } = await supabase.rpc('is_admin');
  if (!isAdmin) throw new Error('Forbidden');
  return user.id;
}

/** Manually award a badge (admin only, for edge cases) */
export async function adminAwardBadge(
  userId: string,
  badgeId: string,
  seasonId: string | null,
): Promise<{ error?: string; success?: boolean }> {
  try {
    const adminId = await requireAdmin();
    const admin = createAdminClient();

    const { error } = await admin.from('user_badges').insert({
      user_id: userId,
      badge_id: badgeId,
      season_id: seasonId,
      metadata: { manually_awarded: true, awarded_by: adminId },
    });

    if (error) return { error: error.message };

    // Audit log
    await admin.from('admin_audit_log').insert({
      admin_id: adminId,
      action: 'AWARD_BADGE',
      target_type: 'user_badges',
      target_id: userId,
      old_value: null,
      new_value: { badge_id: badgeId, season_id: seasonId },
    });

    revalidatePath('/leaderboard');
    return { success: true };
  } catch (err) {
    return { error: (err as Error).message };
  }
}

/** Revoke a badge (admin only) */
export async function adminRevokeBadge(
  userId: string,
  badgeId: string,
): Promise<{ error?: string; success?: boolean }> {
  try {
    const adminId = await requireAdmin();
    const admin = createAdminClient();

    const { error } = await admin
      .from('user_badges')
      .delete()
      .eq('user_id', userId)
      .eq('badge_id', badgeId);

    if (error) return { error: error.message };

    // Also remove from featured if present
    const { data: profile } = await admin
      .from('profiles')
      .select('featured_badges')
      .eq('id', userId)
      .single();

    if (profile?.featured_badges?.includes(badgeId)) {
      await admin
        .from('profiles')
        .update({
          featured_badges: profile.featured_badges.filter((b: string) => b !== badgeId),
        })
        .eq('id', userId);
    }

    // Audit log
    await admin.from('admin_audit_log').insert({
      admin_id: adminId,
      action: 'REVOKE_BADGE',
      target_type: 'user_badges',
      target_id: userId,
      old_value: { badge_id: badgeId },
      new_value: null,
    });

    revalidatePath('/leaderboard');
    return { success: true };
  } catch (err) {
    return { error: (err as Error).message };
  }
}
```

### 4.3 Integration Points in Existing Actions

**In `src/app/(authenticated)/admin/actions.ts`** — add badge evaluation after scoring:

```typescript
// Inside existing calculateScores server action, after the RPC call:
import { evaluateBadgesForFixture } from '@/lib/badges/evaluate-batch';

// ... after `await admin.rpc('calculate_fixture_scores', { p_fixture_id: fixtureId })`
// Add: 
const badgeResults = await evaluateBadgesForFixture(seasonId, fixtureId, gameweek);
// badgeResults can be logged or returned for admin visibility
```

**In prediction submission action** — check participation badges:

```typescript
// After successful prediction insert/update:
import { evaluateBadges } from '@/lib/badges/evaluate';

// Fire-and-forget (don't block the user)
void evaluateBadges({
  userId: user.id,
  seasonId,
  trigger: 'prediction_submitted',
  gameweek,
});
```

---

## 5. Client Architecture (Components)

### 5.1 Component Hierarchy

```
src/components/badges/
├── badge-icon.tsx          # Single badge with tier glow
├── badge-grid.tsx          # All badges (earned + locked)
├── badge-toast.tsx         # Celebration notification
├── badge-showcase.tsx      # Featured badges (leaderboard/profile)
└── badge-selector.tsx      # Pick featured badges (settings)

src/app/(authenticated)/badges/
├── page.tsx                # Badge collection page
└── actions.ts              # Server actions (from section 4.1)
```

### 5.2 Component Specifications

#### `src/components/badges/badge-icon.tsx`

```tsx
// Badge icon component — renders a single badge with tier-appropriate styling
// Props:
//   badgeId: string — lookup in BADGE_MAP
//   earned: boolean — controls locked/unlocked visual state
//   size: 'sm' | 'md' | 'lg' — 24/40/56px
//   showTooltip: boolean — hover shows name + description
//
// Visual behavior:
//   - Earned: full color icon, tier-colored glow border, tier label
//   - Locked: grayscale icon, dashed border, "?" overlay, muted color
//   - Legendary tier: additional shimmer animation (CSS keyframe)

import { cn } from '@/lib/utils';
import { BADGE_MAP, BADGE_TIERS } from '@/lib/badges/badge-catalog';

interface BadgeIconProps {
  badgeId: string;
  earned: boolean;
  size?: 'sm' | 'md' | 'lg';
  showTooltip?: boolean;
  className?: string;
}

const SIZE_MAP = { sm: 'h-6 w-6', md: 'h-10 w-10', lg: 'h-14 w-14' };
const ICON_SIZE_MAP = { sm: 'text-sm', md: 'text-xl', lg: 'text-3xl' };

export function BadgeIcon({
  badgeId,
  earned,
  size = 'md',
  showTooltip = true,
  className,
}: BadgeIconProps) {
  const badge = BADGE_MAP[badgeId];
  if (!badge) return null;

  const tier = BADGE_TIERS[badge.tier];

  return (
    <div
      className={cn(
        'relative flex items-center justify-center rounded-full border-2 transition-all',
        SIZE_MAP[size],
        earned
          ? `${tier.borderColor} bg-surface-elevated`
          : 'border-dashed border-border bg-surface opacity-40 grayscale',
        badge.tier === 'legendary' && earned && 'badge-shimmer',
        className,
      )}
      style={earned ? { boxShadow: `0 0 12px ${tier.glowColor}` } : undefined}
      title={showTooltip ? (earned ? `${badge.name}: ${badge.description}` : badge.hint) : undefined}
      role="img"
      aria-label={earned ? `${badge.name} badge (${tier.label})` : `Locked badge: ${badge.hint}`}
    >
      <span className={cn(ICON_SIZE_MAP[size], !earned && 'opacity-50')}>
        {earned ? badge.icon : '🔒'}
      </span>
    </div>
  );
}
```

#### `src/components/badges/badge-grid.tsx`

```tsx
// Full badge collection grid — shows all 25 badges (earned glow, locked greyed out)
// Props:
//   earnedBadgeIds: string[] — list of badge IDs the user has earned
//   onBadgeClick?: (badgeId: string) => void — optional click handler
//
// Layout: grouped by tier (Common → Rare → Epic → Legendary)
// Responsive: 4 cols mobile, 6 cols tablet, 8 cols desktop

import { BADGE_CATALOG, BADGE_TIERS, type BadgeTier } from '@/lib/badges/badge-catalog';
import { BadgeIcon } from './badge-icon';

interface BadgeGridProps {
  earnedBadgeIds: string[];
  onBadgeClick?: (badgeId: string) => void;
}

const TIER_ORDER: BadgeTier[] = ['common', 'rare', 'epic', 'legendary'];

export function BadgeGrid({ earnedBadgeIds, onBadgeClick }: BadgeGridProps) {
  const earnedSet = new Set(earnedBadgeIds);

  return (
    <div className="space-y-6">
      {TIER_ORDER.map((tier) => {
        const tierBadges = BADGE_CATALOG.filter((b) => b.tier === tier);
        const tierMeta = BADGE_TIERS[tier];
        const earnedInTier = tierBadges.filter((b) => earnedSet.has(b.id)).length;

        return (
          <div key={tier}>
            <div className="mb-3 flex items-center gap-2">
              <span className={`text-stat-label font-semibold uppercase tracking-wider ${tierMeta.textColor}`}>
                {tierMeta.label}
              </span>
              <span className="text-caption text-text-tertiary">
                {earnedInTier}/{tierBadges.length}
              </span>
            </div>
            <div className="grid grid-cols-4 gap-3 tablet:grid-cols-6 desktop:grid-cols-8">
              {tierBadges.map((badge) => (
                <button
                  key={badge.id}
                  type="button"
                  onClick={() => onBadgeClick?.(badge.id)}
                  className="flex flex-col items-center gap-1.5 rounded-card p-2 transition-colors hover:bg-surface-elevated"
                >
                  <BadgeIcon badgeId={badge.id} earned={earnedSet.has(badge.id)} size="lg" />
                  <span className="text-center text-caption text-text-secondary line-clamp-1">
                    {earnedSet.has(badge.id) ? badge.name : '???'}
                  </span>
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
```

#### `src/components/badges/badge-toast.tsx`

```tsx
// Celebration toast when a badge is earned
// Uses the existing app toast mechanism or renders as a floating notification
//
// Props:
//   badgeId: string
//   onDismiss: () => void
//
// Behavior:
//   - Slides in from top with tier-colored border
//   - Shows badge icon + name + "Badge Earned!" text
//   - Auto-dismisses after 5s
//   - Respects prefers-reduced-motion

'use client';

import { useEffect, useState } from 'react';
import { BADGE_MAP, BADGE_TIERS } from '@/lib/badges/badge-catalog';
import { BadgeIcon } from './badge-icon';
import { cn } from '@/lib/utils';

interface BadgeToastProps {
  badgeId: string;
  onDismiss: () => void;
}

export function BadgeToast({ badgeId, onDismiss }: BadgeToastProps) {
  const [visible, setVisible] = useState(false);
  const badge = BADGE_MAP[badgeId];

  useEffect(() => {
    // Trigger entrance animation
    const showTimer = setTimeout(() => setVisible(true), 50);

    // Auto-dismiss after 5 seconds
    const dismissTimer = setTimeout(() => {
      setVisible(false);
      setTimeout(onDismiss, 300); // Wait for exit animation
    }, 5000);

    return () => {
      clearTimeout(showTimer);
      clearTimeout(dismissTimer);
    };
  }, [onDismiss]);

  if (!badge) return null;

  const tier = BADGE_TIERS[badge.tier];

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'fixed top-4 left-1/2 z-50 -translate-x-1/2 transition-all duration-300',
        visible
          ? 'translate-y-0 opacity-100'
          : '-translate-y-4 opacity-0',
      )}
    >
      <div
        className={cn(
          'flex items-center gap-3 rounded-card border-2 bg-surface px-4 py-3 shadow-lg',
          tier.borderColor,
        )}
        style={{ boxShadow: `0 0 20px ${tier.glowColor}` }}
      >
        <BadgeIcon badgeId={badgeId} earned size="md" showTooltip={false} />
        <div>
          <p className={cn('text-body font-semibold', tier.textColor)}>
            Badge Earned!
          </p>
          <p className="text-body-sm text-text-secondary">{badge.name}</p>
        </div>
      </div>
    </div>
  );
}
```

#### `src/components/badges/badge-showcase.tsx`

```tsx
// Featured badges display — shown on leaderboard rows and profile
// Props:
//   featuredBadgeIds: string[] — up to 3 badge IDs
//   size: 'sm' | 'md' — leaderboard uses sm, profile uses md
//
// Renders a horizontal row of 1-3 earned badge icons

import { BadgeIcon } from './badge-icon';

interface BadgeShowcaseProps {
  featuredBadgeIds: string[];
  size?: 'sm' | 'md';
  className?: string;
}

export function BadgeShowcase({
  featuredBadgeIds,
  size = 'sm',
  className,
}: BadgeShowcaseProps) {
  if (featuredBadgeIds.length === 0) return null;

  return (
    <div className={`flex items-center gap-1 ${className ?? ''}`}>
      {featuredBadgeIds.slice(0, 3).map((id) => (
        <BadgeIcon key={id} badgeId={id} earned size={size} showTooltip />
      ))}
    </div>
  );
}
```

#### `src/components/badges/badge-selector.tsx`

```tsx
// Badge selector for settings page — lets user pick up to 3 featured badges
// Props:
//   earnedBadgeIds: string[] — all earned badges
//   currentFeatured: string[] — currently featured badges
//   onSave: (selectedIds: string[]) => void
//
// UI: grid of earned badges with checkbox/toggle, max 3 selection

'use client';

import { useState } from 'react';
import { BadgeIcon } from './badge-icon';
import { BADGE_MAP } from '@/lib/badges/badge-catalog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface BadgeSelectorProps {
  earnedBadgeIds: string[];
  currentFeatured: string[];
  onSave: (selectedIds: string[]) => void;
  saving?: boolean;
}

export function BadgeSelector({
  earnedBadgeIds,
  currentFeatured,
  onSave,
  saving,
}: BadgeSelectorProps) {
  const [selected, setSelected] = useState<string[]>(currentFeatured);

  function toggle(badgeId: string) {
    setSelected((prev) => {
      if (prev.includes(badgeId)) {
        return prev.filter((id) => id !== badgeId);
      }
      if (prev.length >= 3) return prev; // Max 3
      return [...prev, badgeId];
    });
  }

  return (
    <div className="space-y-4">
      <p className="text-body-sm text-text-secondary">
        Select up to 3 badges to feature on the leaderboard ({selected.length}/3)
      </p>
      <div className="grid grid-cols-5 gap-2">
        {earnedBadgeIds.map((id) => {
          const badge = BADGE_MAP[id];
          if (!badge) return null;
          const isSelected = selected.includes(id);

          return (
            <button
              key={id}
              type="button"
              onClick={() => toggle(id)}
              className={cn(
                'flex flex-col items-center gap-1 rounded-card p-2 transition-all',
                isSelected
                  ? 'bg-accent-muted ring-2 ring-accent'
                  : 'bg-surface hover:bg-surface-elevated',
              )}
            >
              <BadgeIcon badgeId={id} earned size="md" showTooltip />
              <span className="text-caption text-text-secondary line-clamp-1">
                {badge.name}
              </span>
            </button>
          );
        })}
      </div>
      <Button onClick={() => onSave(selected)} loading={saving}>
        Save Featured Badges
      </Button>
    </div>
  );
}
```

### 5.3 Page Components

#### `src/app/(authenticated)/badges/page.tsx`

```tsx
// Badge collection page — displays all badges for the current user
import { createClient } from '@/lib/supabase/server';
import { BadgeGrid } from '@/components/badges/badge-grid';
import { Award } from 'lucide-react';

export const metadata = {
  title: 'Badges',
};

export default async function BadgesPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: userBadges } = await supabase
    .from('user_badges')
    .select('badge_id')
    .eq('user_id', user!.id);

  const earnedIds = userBadges?.map((b) => b.badge_id) ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Award className="h-6 w-6 text-accent" aria-hidden="true" />
        <h1 className="text-h1 text-text-primary">Badges</h1>
        <span className="text-body-sm text-text-secondary">
          {earnedIds.length}/25 earned
        </span>
      </div>
      <BadgeGrid earnedBadgeIds={earnedIds} />
    </div>
  );
}
```

### 5.4 Integration with Existing Components

#### Leaderboard Table Integration

The `LeaderboardTable` component gains a `badgesByUser` prop:

```tsx
// Modified LeaderboardTable interface:
interface LeaderboardEntry {
  rank: number;
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  total_points: number;
  exact_count: number;
  outcome_count: number;
  featured_badges?: string[];  // ← NEW
}

// In the entry row, after display_name:
{entry.featured_badges && entry.featured_badges.length > 0 && (
  <BadgeShowcase featuredBadgeIds={entry.featured_badges} size="sm" />
)}
```

The leaderboard page data fetch adds `featured_badges`:

```tsx
// In leaderboard/page.tsx, modify the season leaderboard query:
// The get_season_leaderboard RPC doesn't return featured_badges,
// so we fetch profiles separately and merge:

const { data: profileBadges } = await supabase
  .from('profiles')
  .select('id, featured_badges');

const badgeMap = new Map(profileBadges?.map((p) => [p.id, p.featured_badges]) ?? []);

const entries = seasonLeaderboard?.map((e) => ({
  ...e,
  total_points: Number(e.total_points),
  exact_count: Number(e.exact_count),
  outcome_count: Number(e.outcome_count),
  featured_badges: badgeMap.get(e.user_id) ?? [],
})) ?? [];
```

#### Settings Page Integration

Add a "Featured Badges" section to the settings page between the Display Name form and the About card:

```tsx
// In settings/page.tsx, add after the display name Card:
<Card>
  <CardHeader>
    <CardTitle>
      <div className="flex items-center gap-2">
        <Award className="h-4 w-4 text-accent" aria-hidden="true" />
        Featured Badges
      </div>
    </CardTitle>
  </CardHeader>
  <BadgeSelector
    earnedBadgeIds={earnedBadgeIds}
    currentFeatured={currentFeatured}
    onSave={handleSaveFeatured}
    saving={savingBadges}
  />
</Card>
```

#### Navigation Integration

Add badges to the nav (optional — can be a sub-page of settings or standalone):

```typescript
// In src/lib/constants.ts, add to NAV_ITEMS:
{ href: '/badges', label: 'Badges', icon: 'Award' },
```

### 5.5 CSS Additions

Add to `src/app/globals.css`:

```css
@layer components {
  /* Badge shimmer animation for Legendary tier */
  .badge-shimmer {
    animation: badge-shimmer 3s ease-in-out infinite;
  }

  @keyframes badge-shimmer {
    0%, 100% {
      box-shadow: 0 0 12px rgba(245, 197, 24, 0.3);
    }
    50% {
      box-shadow: 0 0 20px rgba(245, 197, 24, 0.5), 0 0 40px rgba(245, 197, 24, 0.2);
    }
  }

  /* Reduced motion: disable badge animations */
  @media (prefers-reduced-motion: reduce) {
    .badge-shimmer {
      animation: none;
      box-shadow: 0 0 12px rgba(245, 197, 24, 0.3);
    }
  }
}
```

---

## 6. Security Model

### 6.1 RLS Policy Summary

| Table | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `user_badges` | All authenticated users | Service role only | Service role only | Service role only |
| `profiles.featured_badges` | All auth (via profiles_select_all) | Own user only | Own user only | N/A |

### 6.2 Security Invariants

1. **No client-side badge awarding.** The `user_badges` table has no RLS INSERT/UPDATE/DELETE policies for authenticated users. Only the service role (via `createAdminClient`) can write.

2. **Featured badges validated server-side.** The `updateFeaturedBadges` server action verifies that each badge ID in the request is actually earned by the user before persisting. A malicious client cannot feature badges they haven't earned.

3. **Badge evaluation is server-authoritative.** All badge checks run in server actions or server components using `createAdminClient`. The client never sends "I earned badge X" — it only receives the result.

4. **Admin actions are audit-logged.** Manual `AWARD_BADGE` and `REVOKE_BADGE` actions are recorded in `admin_audit_log` with the admin's ID.

5. **Input validation.** All server action inputs are validated with Zod schemas. Badge IDs are checked against the `BADGE_MAP` catalog.

6. **No points impact.** Badges never modify `score_records`, `points_awarded`, or leaderboard calculations. They are purely cosmetic.

7. **Idempotent evaluation.** The `UNIQUE (user_id, badge_id, season_id)` constraint plus the `idx_user_badges_career_unique` partial index ensure duplicate awards are impossible at the database level. The evaluator also pre-checks existing badges before attempting inserts.

### 6.3 Validation Schema Addition

Add to `src/lib/validations.ts`:

```typescript
/** Featured badges validation */
export const featuredBadgesSchema = z.object({
  badgeIds: z.array(
    z.string()
      .min(1, 'Badge ID is required')
      .max(50, 'Badge ID too long')
  ).max(3, 'Maximum 3 featured badges'),
});

export type FeaturedBadgesInput = z.infer<typeof featuredBadgesSchema>;
```

---

## 7. File Manifest

### New Files

| File | Type | Purpose |
|---|---|---|
| `supabase/migrations/00007_badges.sql` | SQL | Database migration |
| `src/lib/badges/badge-catalog.ts` | TS | Badge definitions + tier metadata |
| `src/lib/badges/types.ts` | TS | TypeScript interfaces |
| `src/lib/badges/evaluate.ts` | TS | Core evaluation engine |
| `src/lib/badges/evaluate-batch.ts` | TS | Batch evaluation for post-scoring |
| `src/lib/badges/checkers/index.ts` | TS | Checker registry |
| `src/lib/badges/checkers/prediction-checkers.ts` | TS | Prediction-based checkers |
| `src/lib/badges/checkers/career-checkers.ts` | TS | Career accumulation checkers |
| `src/lib/badges/checkers/leaderboard-checkers.ts` | TS | Leaderboard-based checkers |
| `src/lib/badges/checkers/participation-checkers.ts` | TS | Participation checkers |
| `src/components/badges/badge-icon.tsx` | TSX | Single badge component |
| `src/components/badges/badge-grid.tsx` | TSX | Full badge collection |
| `src/components/badges/badge-toast.tsx` | TSX | Celebration notification |
| `src/components/badges/badge-showcase.tsx` | TSX | Featured badges row |
| `src/components/badges/badge-selector.tsx` | TSX | Featured badge picker |
| `src/app/(authenticated)/badges/page.tsx` | TSX | Badge collection page |
| `src/app/(authenticated)/badges/actions.ts` | TS | Badge server actions |
| `src/app/(authenticated)/admin/badge-actions.ts` | TS | Admin badge actions |

### Modified Files

| File | Change |
|---|---|
| `src/lib/validations.ts` | Add `featuredBadgesSchema` |
| `src/lib/constants.ts` | Add `AWARD_BADGE`/`REVOKE_BADGE` to `ADMIN_ACTIONS`, optional nav item |
| `src/lib/database.types.ts` | Regenerate with `supabase gen types` (auto) |
| `src/components/leaderboard-table.tsx` | Add `featured_badges` to entry type, render `BadgeShowcase` |
| `src/app/(authenticated)/leaderboard/page.tsx` | Fetch `featured_badges` from profiles, pass to entries |
| `src/app/(authenticated)/settings/page.tsx` | Add `BadgeSelector` section |
| `src/app/(authenticated)/admin/actions.ts` | Call `evaluateBadgesForFixture` after scoring |
| `src/app/globals.css` | Add `.badge-shimmer` animation |

### Implementation Order

1. **Phase 1 — Schema:** Run migration `00007_badges.sql`, regenerate types
2. **Phase 2 — Catalog:** Create `badge-catalog.ts` and `types.ts`
3. **Phase 3 — Evaluation:** Build checkers and `evaluate.ts`
4. **Phase 4 — API:** Create server actions
5. **Phase 5 — Components:** Build UI components
6. **Phase 6 — Integration:** Wire into leaderboard, settings, scoring flow
7. **Phase 7 — Testing:** Unit tests for checkers, integration tests for evaluation
