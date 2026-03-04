# Admin Predictions View — Design Specification

**Feature:** Admin all-predictions table  
**Date:** 2026-03-04  
**Status:** Ready for Architecture review

---

## 1. User Stories & Acceptance Criteria

### US-01 — View all predictions for the current game week
**As an admin, I want to see every user's predictions for the current game week by default, so I can monitor submitted entries at any time.**

Acceptance criteria:
- AC-01.1: Navigating to `/admin/predictions` opens the page with the active season's current game week pre-selected.
- AC-01.2: The table shows one row per (user × fixture) prediction in that game week.
- AC-01.3: Predictions are visible regardless of whether the game week deadline has passed.
- AC-01.4: The page is accessible only to users where `is_admin = true`; non-admins receive a redirect to `/`.

### US-02 — Switch between game weeks
**As an admin, I want to switch to any game week in the active season so I can audit historical and upcoming predictions.**

Acceptance criteria:
- AC-02.1: A game week selector displays all game weeks that have at least one fixture in the active season (GW1–GWN).
- AC-02.2: Selecting a different game week re-fetches and re-renders the table for that game week without a full page navigation.
- AC-02.3: The currently selected game week is visually highlighted in the selector.
- AC-02.4: The URL search param `?gw=<number>` is updated so the view is bookmarkable/shareable.

### US-03 — View predictions across all users
**As an admin, I want to see predictions from every registered user, including users who have not yet submitted predictions for a game week, so I can identify non-participants.**

Acceptance criteria:
- AC-03.1: Every user in `profiles` is represented in the table (even if they have no prediction for a given fixture — shown as "—").
- AC-03.2: The total number of users who have submitted ≥1 prediction for the selected game week is shown as a summary stat.

### US-04 — Filter and search within the table
**As an admin, I want to filter the table by user name or fixture so I can quickly find a specific prediction.**

Acceptance criteria:
- AC-04.1: A text search box filters rows by user display name (case-insensitive, debounced 300 ms).
- AC-04.2: A fixture dropdown (or segment) limits rows to a single fixture within the game week.
- AC-04.3: Both filters are combinable and clear independently.

### US-05 — See submission timestamps
**As an admin, I want to see when each prediction was submitted and last updated so I can detect late edits or suspicious patterns.**

Acceptance criteria:
- AC-05.1: `submitted_at` and `updated_at` columns are shown in the table (formatted as local date + time).
- AC-05.2: If `submitted_at ≠ updated_at`, the updated timestamp is visually distinguished (e.g., amber badge "Edited").

---

## 2. UX / UI Specification

### 2.1 Route & Navigation

- **Route:** `/admin/predictions`
- Added to `adminNavItems` in [src/app/(authenticated)/admin/layout.tsx](src/app/(authenticated)/admin/layout.tsx) as:
  ```ts
  { href: '/admin/predictions', label: 'Predictions', icon: ClipboardList }
  ```
- Insert alphabetically between "Leaderboard" and "Scoring".

### 2.2 Page Layout

```
┌─────────────────────────────────────────────────────────────────┐
│ [Shield icon]  Admin Panel                                      │
│ Overview | Users | Fixtures | Predictions* | Scoring | ...      │
├─────────────────────────────────────────────────────────────────┤
│  Predictions  (ClipboardList icon)                              │
│                                                                 │
│  Season: 2025/26                                                │
│                                                                 │
│  ╔═══ Game Week Selector (pill row) ══════════════════════════╗ │
│  ║  GW1  GW2  … [GW29]  GW30  …  GW38                        ║ │
│  ╚════════════════════════════════════════════════════════════╝ │
│                                                                 │
│  ┌─────────── Summary Stats ──────────────────────────────┐    │
│  │  8 fixtures  ·  16 participants  ·  Deadline: past     │    │
│  └────────────────────────────────────────────────────────┘    │
│                                                                 │
│  [🔍 Search user...]   [Fixture: All ▾]   [Export CSV]         │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  User  │  Fixture         │  Prediction │ Actual │ Pts │   │
│  │        │                  │  H – A      │ H – A  │     │   │
│  │ …      │ …                │ …           │ …      │ …   │   │
│  └─────────────────────────────────────────────────────────┘   │
│  [← Prev GW]                                   [Next GW →]     │
└─────────────────────────────────────────────────────────────────┘
```

### 2.3 Game Week Selector

- Horizontally scrollable pill row (same treatment as existing gameweek nav patterns in the app).
- Pills show `GW<n>`. Current game week is auto-selected on load.
- "Current" determined by: the game week belonging to the earliest fixture whose `kickoff_time > now()` in the active season; falls back to the highest-numbered game week if all are past.
- Clicking a pill updates the `?gw=` param and re-fetches.
- Prev / Next GW arrow buttons at the page footer for keyboard-friendly navigation.

### 2.4 Summary Stats Bar

A compact row of `<StatCard>`-style chips above the table:

| Stat | Source |
|------|--------|
| **Fixtures in GW** | Count of non-POSTPONED/CANCELLED fixtures |
| **Participants** | Count of distinct `user_id` values in predictions for the GW |
| **Out of** | Total number of active profiles |
| **Deadline status** | "Open" / "Passed" badge based on first kickoff vs. `now()` |

### 2.5 Prediction Table

Layout mode: one row per (user × fixture). Group rows by user (user display name spans multiple fixture rows via `rowspan` or sticky sub-header), or show flat rows with user name repeated — **flat rows recommended** for simpler implementation and sortability.

#### Columns

| # | Column | Source | Notes |
|---|--------|--------|-------|
| 1 | **User** | `profiles.display_name` | Sortable A→Z / Z→A |
| 2 | **Fixture** | `fixtures.home_team` + `away_team` | e.g. "Arsenal vs Chelsea" |
| 3 | **Kickoff** | `fixtures.kickoff_time` | Formatted as `DD MMM HH:mm` |
| 4 | **Prediction** | `predictions.home_score`–`predictions.away_score` | e.g. `2 – 1`; "—" if none submitted |
| 5 | **Actual** | `fixtures.home_score`–`fixtures.away_score` | "TBD" if null |
| 6 | **Points** | `score_records.points` (join on user+fixture if available) | "—" if not yet scored |
| 7 | **Submitted** | `predictions.submitted_at` | Formatted local datetime |
| 8 | **Updated** | `predictions.updated_at` | Show amber "Edited" badge if ≠ `submitted_at` |
| 9 | **Star Game** | `fixtures.is_star_game` | ⭐ icon if true, else empty |

#### Row States

- **No prediction submitted:** prediction cells show "—" in muted text.
- **Before kickoff + no deadline passed:** prediction cells shown normally (admin bypasses restriction).
- **Edited prediction:** "Edited" amber badge in the Updated column.
- **Star game:** Row has a subtle gold left-border accent.

#### Sorting

Default sort: `fixture.kickoff_time ASC`, then `user.display_name ASC`.  
Client-side sort on all columns via clickable column headers (chevron icons).

#### Pagination

- Default page size: 50 rows.
- Simple "Previous / Next" pagination controls at bottom.
- Page size selector: 25 / 50 / 100.
- Total row count displayed: "Showing 1–50 of 248 predictions".

### 2.6 Filters

| Filter | Type | Behaviour |
|--------|------|-----------|
| User search | Text input | Debounced 300 ms; filters `display_name` ILIKE `%term%` client-side (or server-side if >500 rows) |
| Fixture | `<select>` dropdown | "All fixtures" default; options = fixtures in selected GW |
| Only submitted | Toggle | When ON, hides rows with no prediction (i.e., hides the "—" rows) |

Filters are reset when a new game week is selected.

### 2.7 Export

- **Export CSV** button (top-right of table section).
- Exports the currently filtered/GW view as a `.csv` with columns matching the table.
- Client-side generation (`Blob` + `URL.createObjectURL`) — no server action needed.
- Filename: `predictions-gw<N>-<YYYY-MM-DD>.csv`.

### 2.8 Empty States

| Scenario | Message |
|----------|---------|
| No fixtures in selected GW | "No fixtures found for GW{N}." |
| No predictions submitted at all | "No predictions submitted yet for GW{N}." |
| Search returns 0 results | "No users match '{query}'." |

### 2.9 Loading State

- Skeleton rows (6 rows × 9 columns) while data is fetching.
- No full-page spinner; table area transitions smoothly.

---

## 3. Data Access

### 3.1 RLS Bypass

Admins already bypass the `can_view_gameweek_predictions` function (Rule 2 in the function: `is_admin = true → RETURN true`). The page must use the **admin Supabase client** (`createAdminClient()`) — or verify the server action calls `requireAdmin()` before querying — to ensure RLS is not the limiting factor on the `predictions` table SELECT policy.

> **Important:** the existing `predictions` RLS SELECT policy uses `can_view_gameweek_predictions`. An admin calling via `createAdminClient()` (service-role key) bypasses RLS entirely: ✅  
> An admin calling via `createClient()` (anon key) will still have RLS evaluated, but the admin check inside `can_view_gameweek_predictions` handles it correctly: ✅  
> Either approach is valid; prefer `createAdminClient()` in the server action for clarity.

### 3.2 Server Action Signature (proposed)

```ts
// src/app/(authenticated)/admin/actions.ts (addition)

export async function getAdminPredictions(params: {
  seasonId: string;
  gameweek: number;
}): Promise<{
  predictions: AdminPredictionRow[];
  fixtures: FixtureSummary[];
  profiles: ProfileSummary[];
  error?: string;
}>;
```

`AdminPredictionRow` shape:
```ts
interface AdminPredictionRow {
  user_id: string;
  display_name: string;
  fixture_id: string;
  home_team: string;
  away_team: string;
  kickoff_time: string;
  is_star_game: boolean;
  predicted_home: number | null;
  predicted_away: number | null;
  actual_home: number | null;
  actual_away: number | null;
  points: number | null;
  submitted_at: string | null;
  updated_at: string | null;
}
```

### 3.3 Query Strategy

Single join query:

```sql
SELECT
  p.id AS profile_id,
  p.display_name,
  f.id AS fixture_id,
  f.home_team, f.away_team, f.kickoff_time, f.is_star_game,
  f.home_score AS actual_home, f.away_score AS actual_away,
  pred.home_score AS predicted_home, pred.away_score AS predicted_away,
  pred.submitted_at, pred.updated_at,
  sr.points
FROM public.profiles p
CROSS JOIN public.fixtures f
LEFT JOIN public.predictions pred
  ON pred.user_id = p.id AND pred.fixture_id = f.id
LEFT JOIN public.score_records sr
  ON sr.user_id = p.id AND sr.fixture_id = f.id
WHERE f.season_id = :seasonId
  AND f.gameweek  = :gameweek
ORDER BY f.kickoff_time ASC, p.display_name ASC;
```

This produces one row per user per fixture, with nulls where no prediction exists — matching the "— for non-submitted" requirement naturally.

---

## 4. Scope Boundaries

### In Scope
- Read-only admin view of all predictions for any game week in the active season.
- Game week selector defaulting to current game week.
- Per-row display of: user, fixture, prediction, actual result, points, timestamps.
- Client-side column sorting.
- Fixture and user filters.
- "Only submitted" toggle.
- CSV export of the current view.
- Summary stats (participant count, fixture count, deadline status).
- Empty and loading states.
- Adding the route to the admin nav.

### Out of Scope
- **Editing predictions** on behalf of users (admin cannot modify predictions here; use the scoring override on `/admin/scoring` for score corrections).
- **Cross-season** prediction browsing (only the active season; historical seasons are out of scope for V1).
- **Real-time live updates** of the table (static fetch on GW change is sufficient; live fixture scores are handled elsewhere).
- **Deleting predictions** via this interface.
- **Prediction analytics / visualisations** (heatmaps, popularity charts) — future feature.
- **Sending notifications** to non-predictors (out of scope for this feature).
- **Non-active seasons** — the season selector is not included in V1.

---

## 5. Edge Cases

| # | Scenario | Expected Behaviour |
|---|----------|--------------------|
| EC-01 | Game week has no fixtures (e.g., international break placeholder) | Show empty state: "No fixtures found for GW{N}." |
| EC-02 | All fixtures in the GW are POSTPONED or CANCELLED | Summary stat shows "0 active fixtures"; table shows empty state message referencing postponements. |
| EC-03 | No users have submitted any predictions for the GW | Table shows all users with "—" in prediction columns; summary shows "0 participants". |
| EC-04 | A user was deleted (`profiles` row removed) | Prediction rows with orphaned `user_id` are ignored (FK cascade deletes them anyway). |
| EC-05 | `score_records` row doesn't exist yet (scoring not run) | Points column shows "—" with muted styling; no error thrown. |
| EC-06 | `submitted_at` equals `updated_at` exactly | "Edited" badge is **not** shown. Only show when `updated_at > submitted_at` by >1 second (clock skew buffer). |
| EC-07 | Admin navigates directly to `/admin/predictions?gw=99` (non-existent GW) | Show empty state; selector highlights no pill (or snaps back to current GW). |
| EC-08 | Very large number of predictions (100 users × 10 fixtures = 1000 rows) | Pagination to 50 rows per page; CSV export still generates full dataset. |
| EC-09 | Active season is not set | Show error banner: "No active season found. Set an active season in Season settings." |
| EC-10 | Game week deadline is a custom `gameweek_deadlines` override, not first kickoff | Deadline status in summary stats must use the same deadline logic as the rest of the app (`gameweek_deadlines` table if present, else first kickoff). |
| EC-11 | Two users share the same `display_name` | Both rows appear; user search matches both. `user_id` is used as the stable key, not display name. |
| EC-12 | Admin is also a participant with their own predictions | Admin's predictions shown normally in the table like any other user. |

---

## 6. Implementation Notes for Architecture Agent

- **Page component:** Server Component for initial data load (SSR), Client Component for interactive filters, GW switching, sorting, and CSV export. Pattern matches existing `/admin/fixtures/page.tsx`.
- **URL state:** Use `useSearchParams` + `router.replace` to keep `?gw=N` in sync. On SSR, read the same param via `searchParams` prop.
- **Server action:** Add `getAdminPredictions` to the existing [src/app/(authenticated)/admin/actions.ts](src/app/(authenticated)/admin/actions.ts). Use `createAdminClient()` for the query.
- **No new DB migration needed**: existing `predictions`, `fixtures`, `profiles`, `score_records` tables cover everything. RLS already grants admins full SELECT access.
- **Component reuse:** `<StatCard>` from `src/components/stat-card.tsx`, `<Badge>` from shadcn/ui, `<Card>` wrapper consistent with other admin pages.
- **Icon:** `ClipboardList` from `lucide-react` (not yet used in admin nav — confirmed available).
