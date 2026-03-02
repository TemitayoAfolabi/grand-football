# Grand Football — Prediction History Visibility: Strategy & Design

> **Document Owner:** Strategy & Design Agent
> **Last Updated:** 2026-03-02
> **Status:** Draft
>
> **Priority Key:**
> - **P0** — Must have for launch
> - **P1** — Should have (implement if time permits)
> - **P2** — Nice to have / future iteration

---

## Table of Contents

1. [Overview](#1-overview)
2. [Visibility Matrix](#2-visibility-matrix)
3. [User Stories & Acceptance Criteria](#3-user-stories--acceptance-criteria)
4. [Edge Cases](#4-edge-cases)
5. [UI/UX Design Specifications](#5-uiux-design-specifications)
6. [Technical Considerations](#6-technical-considerations)
7. [Key Design Decisions](#7-key-design-decisions)

---

## 1. Overview

### Problem Statement

Users currently have no way to view other users' predictions. The `/fixtures` page only displays the authenticated user's own predictions, and the RLS policy `predictions_select_own_or_kicked_off` restricts visibility to own predictions or those for individually kicked-off fixtures. There is no dedicated prediction history page and no mechanism for cross-user prediction browsing.

### Goal

Enable full prediction history visibility across all users, with a carefully designed anti-spoiler rule for the current gameweek that prevents users who have already submitted predictions from viewing other users' predictions before the first game kicks off.

### Anti-Spoiler Rationale

The visibility rule for the current gameweek before kickoff is designed to prevent "spoiler" advantages:

- **User who HAS submitted predictions:** Cannot see others' predictions before kickoff. This prevents regret-driven attempts to change strategy after seeing what others predicted.
- **User who has NOT submitted predictions:** Can see others' predictions freely. Since those other users have already committed their predictions and cannot change them, no competitive advantage is gained.
- **After kickoff:** All predictions are visible to everyone, as no changes are possible.

---

## 2. Visibility Matrix

The visibility anchor is the **kickoff timestamp of the first non-postponed/non-cancelled fixture in the gameweek**.

| Scenario | Gameweek State | Viewing User | Target Predictions | Visible? |
|----------|---------------|-------------|-------------------|----------|
| A | Past GW (first kickoff has passed) | Any user | Any user's predictions | **Yes** |
| B | Current GW, **after** first kickoff | Any user | Any user's predictions | **Yes** |
| C | Current GW, **before** first kickoff | User has **NOT** submitted predictions for this GW | Other users' predictions | **Yes** |
| D | Current GW, **before** first kickoff | User **HAS** submitted predictions for this GW | Other users' predictions | **No** |
| E | Current GW, **before** first kickoff | Any user | Their **own** predictions | **Yes** (always) |
| F | Future GW (no fixtures kicked off, not the current displayed GW) | Any user | Other users' predictions | **No** |

### Definition: "Has Submitted Predictions"

A user is considered to have submitted predictions for a gameweek if they have **at least one** row in the `predictions` table for any fixture in that gameweek. Partial submissions (e.g., 3 of 10 fixtures predicted) still count as "has submitted."

### Definition: "First Kickoff"

```sql
MIN(kickoff_time) FROM fixtures
WHERE season_id = :season_id
  AND gameweek = :gameweek
  AND status NOT IN ('POSTPONED', 'CANCELLED')
```

This aligns with the existing `get_gameweek_deadline()` function's fallback logic.

---

## 3. User Stories & Acceptance Criteria

### Epic: Prediction History Visibility

---

#### US-PH.1: View Own Prediction History (All Gameweeks)

**Priority:** P0

**As a** registered user, **I want to** view my own prediction history for any past or current gameweek **so that** I can review my performance and track how my predictions compared to actual results.

**Acceptance Criteria:**

```gherkin
Scenario: User views their own predictions for a past gameweek
  Given I am logged in
  And Gameweek 5 has fully completed (all fixtures finished)
  When I navigate to the prediction history page and select Gameweek 5
  Then I see all my predictions for Gameweek 5
  And each prediction shows the fixture (teams, kickoff time)
  And each prediction shows my predicted score
  And each prediction shows the actual result
  And each prediction shows the points I was awarded

Scenario: User views their own predictions for the current gameweek
  Given I am logged in
  And Gameweek 12 is the current gameweek
  And I have submitted predictions for some fixtures in Gameweek 12
  When I navigate to the prediction history page and select Gameweek 12
  Then I see all my predictions for Gameweek 12
  And fixtures that have kicked off show actual scores and points awarded
  And fixtures that have not kicked off show my predicted score with a "Locked in" indicator

Scenario: User views a gameweek where they made no predictions
  Given I am logged in
  And I did not submit any predictions for Gameweek 3
  When I navigate to the prediction history page and select Gameweek 3
  Then I see a message "You didn't submit any predictions for Gameweek 3"
  And the fixture list is still shown with actual results (but no prediction column for me)
```

---

#### US-PH.2: View Other Users' Predictions for Past Gameweeks

**Priority:** P0

**As a** registered user, **I want to** view any other user's predictions for past gameweeks **so that** I can compare strategies and learn from others' prediction patterns.

**Acceptance Criteria:**

```gherkin
Scenario: User views another user's predictions for a fully completed gameweek
  Given I am logged in
  And Gameweek 8 first kickoff was on 2025-10-19T12:30:00Z (in the past)
  When I navigate to the prediction history page for user "JohnDoe" and select Gameweek 8
  Then I see all of JohnDoe's predictions for Gameweek 8
  And each row shows: fixture, JohnDoe's predicted score, actual result, and points awarded
  And I see JohnDoe's total points for that gameweek

Scenario: User views another user's predictions for a past gameweek where that user made no predictions
  Given I am logged in
  And Gameweek 4 is a past gameweek
  And user "JaneDoe" did not submit any predictions for Gameweek 4
  When I navigate to the prediction history page for "JaneDoe" and select Gameweek 4
  Then I see a message "JaneDoe didn't submit any predictions for Gameweek 4"
  And the fixture list still shows actual results
```

---

#### US-PH.3: View Other Users' Predictions for Current Gameweek — Before First Kickoff (User Has NOT Predicted)

**Priority:** P0

**As a** registered user who has **not yet** submitted predictions for the current gameweek, **I want to** see other users' predictions **so that** I can see what others have committed to (since they can no longer change their predictions to match mine).

**Acceptance Criteria:**

```gherkin
Scenario: Non-submitter views others' predictions before kickoff
  Given I am logged in
  And Gameweek 15 is the current gameweek
  And the first fixture in Gameweek 15 kicks off at 15:00 today
  And the current time is 10:00 (before first kickoff)
  And I have NOT submitted any predictions for Gameweek 15
  And user "Alice" has submitted predictions for Gameweek 15
  When I navigate to the prediction history page for "Alice" and select Gameweek 15
  Then I see all of Alice's predictions for Gameweek 15
  And each prediction shows the fixture and Alice's predicted score
  And no actual results are shown (matches haven't started)
  And a banner reads "Predictions are locked — these users have already submitted"
```

---

#### US-PH.4: Block Other Users' Predictions for Current Gameweek — Before First Kickoff (User HAS Predicted)

**Priority:** P0

**As a** registered user who **has** submitted predictions for the current gameweek, **I should not** be able to see other users' predictions before the first game kicks off **so that** I am not tempted to change my strategy after seeing others' picks.

**Acceptance Criteria:**

```gherkin
Scenario: Submitter cannot view others' predictions before kickoff
  Given I am logged in
  And Gameweek 15 is the current gameweek
  And the first fixture in Gameweek 15 kicks off at 15:00 today
  And the current time is 10:00 (before first kickoff)
  And I HAVE submitted predictions for Gameweek 15 (at least one fixture)
  When I navigate to the prediction history page for "Alice" and select Gameweek 15
  Then I see a message "Predictions for this gameweek will be revealed after the first kickoff at 15:00"
  And I do NOT see any of Alice's individual predictions
  And the API returns no prediction data for other users in this gameweek

Scenario: Submitter can still see their own predictions before kickoff
  Given I am logged in
  And I HAVE submitted predictions for Gameweek 15
  And the current time is before first kickoff
  When I view my own prediction history for Gameweek 15
  Then I see all my own predictions as normal
```

---

#### US-PH.5: View All Predictions After First Kickoff (Current Gameweek)

**Priority:** P0

**As a** registered user, **I want to** see all users' predictions for the current gameweek once the first game has kicked off **so that** I can follow along and compare predictions in real time.

**Acceptance Criteria:**

```gherkin
Scenario: All predictions visible after first kickoff
  Given I am logged in
  And Gameweek 15 is the current gameweek
  And the first fixture kicked off at 15:00
  And the current time is 15:01
  When I navigate to the prediction history page and select Gameweek 15
  Then I can see predictions from all users who submitted for Gameweek 15
  And this is true regardless of whether I submitted my own predictions or not

Scenario: Visibility transitions at kickoff time
  Given I am logged in
  And I have submitted predictions for Gameweek 15
  And the page is open before kickoff showing the "hidden" state
  When the first kickoff time passes
  Then the page auto-refreshes or prompts me to reload
  And other users' predictions become visible
```

---

#### US-PH.6: Browse Users from Leaderboard

**Priority:** P0

**As a** registered user, **I want to** click on a user's name in the leaderboard and see their prediction history **so that** I can quickly compare my predictions with top-ranked players.

**Acceptance Criteria:**

```gherkin
Scenario: Navigate from leaderboard to user prediction history
  Given I am on the leaderboard page
  When I click on user "Alice" in the leaderboard table
  Then I am navigated to the prediction history page for Alice
  And the most recent completed gameweek is pre-selected
  And I see Alice's predictions and points for that gameweek

Scenario: Leaderboard profile link shows correct user
  Given I am on the leaderboard
  When I click on my own row in the leaderboard
  Then I am taken to my own prediction history page
```

---

#### US-PH.7: Gameweek Navigation in Prediction History

**Priority:** P0

**As a** registered user, **I want to** navigate between gameweeks on the prediction history page **so that** I can browse any gameweek's predictions without returning to another page.

**Acceptance Criteria:**

```gherkin
Scenario: Navigate between gameweeks
  Given I am on the prediction history page for user "Alice" viewing Gameweek 8
  When I select Gameweek 9 from the gameweek selector
  Then the page updates to show Alice's predictions for Gameweek 9
  And the URL updates to reflect the new gameweek (e.g., ?gw=9)

Scenario: Default gameweek selection
  Given I navigate to a user's prediction history page without specifying a gameweek
  Then the most recent gameweek with at least one kicked-off fixture is pre-selected

Scenario: Future gameweek has no predictions to show
  Given user "Alice" has no predictions for Gameweek 20 (a future gameweek)
  When I navigate to Gameweek 20 on Alice's prediction history
  Then I see "No fixtures available for this gameweek yet"
```

---

#### US-PH.8: All Users Prediction Summary per Gameweek

**Priority:** P1

**As a** registered user, **I want to** see a summary view of all users' predictions for a given gameweek on a single page **so that** I can quickly compare everyone's picks side by side.

**Acceptance Criteria:**

```gherkin
Scenario: View all-users summary for a past gameweek
  Given I am logged in
  And Gameweek 10 is a past gameweek (fully kicked off)
  When I navigate to the "All Predictions" view for Gameweek 10
  Then I see a table with fixtures as rows and users as columns
  And each cell shows the user's predicted score
  And actual results are shown in a header column
  And users are sorted by total gameweek points (descending)

Scenario: Current gameweek respects visibility rules in summary view
  Given Gameweek 15 is the current gameweek
  And the first kickoff hasn't happened yet
  And I have submitted predictions
  When I try to access the "All Predictions" summary for Gameweek 15
  Then my own predictions are shown
  And other users' predictions are hidden with a lock icon
  And a banner reads "Other predictions will be revealed after kickoff"
```

---

#### US-PH.9: Historical Data from Gameweek 1

**Priority:** P0

**As a** registered user, **I want to** see prediction history going back to Gameweek 1 of the current season **so that** the feature is complete and not limited to only recent gameweeks.

**Acceptance Criteria:**

```gherkin
Scenario: All historical gameweeks are available
  Given the current season started at Gameweek 1
  And the current gameweek is 25
  When I open the gameweek selector on the prediction history page
  Then I see all gameweeks from 1 to 25 available for selection
  And predictions for all historical gameweeks are accessible

Scenario: Season boundary
  Given the previous season has ended
  And a new season has started
  When I view the prediction history page
  Then only the current active season's gameweeks are shown by default
  And there is an option to view previous seasons (P2 — future enhancement)
```

---

## 4. Edge Cases

### 4.1 All Fixtures Postponed in a Gameweek

**Scenario:** Every fixture in Gameweek 15 has status `POSTPONED` or `CANCELLED`.

**Expected Behaviour:** There is no "first kickoff" timestamp (it resolves to `NULL`). All predictions remain in a pre-kickoff state. The visibility rule treats this as "before first kickoff" indefinitely. Users who have not predicted can see others' predictions; users who have predicted cannot. If all fixtures are eventually rescheduled and one kicks off, normal rules resume.

### 4.2 Partial Postponements

**Scenario:** Gameweek 15 has 10 fixtures; 2 are postponed. The first non-postponed fixture kicks off at Saturday 12:30.

**Expected Behaviour:** The first kickoff is Saturday 12:30. Visibility rules use this timestamp. Postponed fixtures' predictions are still shown (they were submitted before postponement).

### 4.3 Kickoff Time Changes

**Scenario:** The first fixture's kickoff time is moved from Saturday 12:30 to Sunday 14:00 after users have already submitted predictions.

**Expected Behaviour:** The "first kickoff" is recalculated dynamically via `MIN(kickoff_time)`. The visibility window adjusts automatically. If a later fixture is now the earliest, that time becomes the anchor. Users who submitted predictions remain blocked from seeing others until the new first kickoff.

### 4.4 User Submits Prediction After Viewing Others

**Scenario:** User has NOT submitted predictions, views other users' predictions, then submits their own predictions — all before first kickoff.

**Expected Behaviour:** After submitting, the user can no longer see other users' predictions for the current gameweek (the page should reflect this immediately on next load/navigation). The API enforces this server-side. This is acceptable because the user chose to view others' predictions while they were allowed to, and then made their own choice.

### 4.5 Race Condition: Submission at Kickoff Boundary

**Scenario:** User submits their prediction at 14:59:59 and the first kickoff is at 15:00:00.

**Expected Behaviour:** Server-side checks are authoritative. If the request arrives and is processed before 15:00:00, the submission is accepted and the user is blocked from seeing others for the remaining fraction of a second. After 15:00:00, all predictions become visible. No special handling needed — the window is negligibly small.

### 4.6 User Deletes/Resubmits All Predictions

**Scenario:** User had predictions, deleted all of them before kickoff, and now has zero predictions in the gameweek.

**Expected Behaviour:** If the system allows prediction deletion (currently it does not — predictions can only be updated, not deleted), then having zero predictions means the user is treated as "has not submitted" and can see others' predictions. **Current system:** Predictions cannot be deleted, only updated. Once submitted, the user permanently counts as "has submitted" for that gameweek.

### 4.7 Admin User Viewing Predictions

**Scenario:** An admin user wants to see all predictions regardless of visibility rules.

**Expected Behaviour:** Admins bypass all visibility restrictions (consistent with existing `is_admin()` checks in RLS). Admin always sees all predictions for any gameweek.

### 4.8 User Has Predictions in Only Some Fixtures

**Scenario:** Gameweek 15 has 10 fixtures. User submitted predictions for only 3.

**Expected Behaviour:** The user is considered "has submitted" (at least one prediction exists). They cannot see other users' predictions before first kickoff. Their 3 predictions are visible to others who haven't submitted. The 7 missing fixtures show as "No prediction" for this user.

### 4.9 Different Kickoff Times Within a Gameweek

**Scenario:** Gameweek 15 has fixtures on Saturday 12:30, Saturday 15:00, and Sunday 14:00.

**Expected Behaviour:** The visibility anchor is the **first** kickoff (Saturday 12:30). Once Saturday 12:30 passes, all predictions for the **entire** gameweek become visible — including predictions for the Sunday 14:00 match. This is by design: the gameweek is treated as a single unit for visibility purposes.

### 4.10 Clock Skew Between Client and Server

**Scenario:** The user's device clock is 5 minutes ahead of the server, causing the client to believe kickoff has passed while the server disagrees.

**Expected Behaviour:** Server-side enforcement is authoritative. The API checks `now()` against the first kickoff timestamp. The client may show an optimistic "loading" state, but the API will return the correct visibility. The UI should gracefully handle a "still hidden" response even if the client thinks kickoff has passed.

---

## 5. UI/UX Design Specifications

### 5.1 New Route: `/predictions/[userId]`

A new page at `/predictions/[userId]` displays a user's prediction history. The path uses the user's UUID. When `userId` matches the authenticated user, it shows "Your Predictions" header; otherwise it shows the target user's display name.

**URL structure:**
- `/predictions/me` → Redirects to `/predictions/{currentUserId}` (convenience alias)
- `/predictions/{userId}` → Shows prediction history for the given user
- `/predictions/{userId}?gw=12` → Shows a specific gameweek
- `/predictions/{userId}?gw=12&seasonId=...` → Explicit season (default: active season)

### 5.2 Page Layout

```
┌─────────────────────────────────────────────────────────────┐
│  ← Back                              [Season Badge: 24/25]  │
│                                                              │
│  [Avatar] Alice's Predictions                                │
│  Gameweek 12 · 3 of 10 correct                             │
│                                                              │
│  ┌─ Gameweek Selector ──────────────────────────────────┐   │
│  │  ‹ 11 │ [12] │ 13 ›                                 │   │
│  └───────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌─ Summary Strip ──────────────────────────────────────┐   │
│  │  Total: 24 pts  │  Exact: 2  │  Outcome: 3  │  ×: 5 │   │
│  └───────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌─ Fixture Card ───────────────────────────────────────┐   │
│  │  Arsenal  2 - 1  Chelsea               [FT]          │   │
│  │  ─────────────────────────────────────                │   │
│  │  Prediction: 2 - 1  │  +3 pts (Exact Score)          │   │
│  └───────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌─ Fixture Card ───────────────────────────────────────┐   │
│  │  Liverpool  0 - 0  Man Utd              [FT]          │   │
│  │  ─────────────────────────────────────                │   │
│  │  Prediction: 1 - 0  │  +1 pt (Correct Outcome)       │   │
│  └───────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌─ Fixture Card (No prediction) ───────────────────────┐   │
│  │  Wolves  1 - 3  Brighton                [FT]          │   │
│  │  ─────────────────────────────────────                │   │
│  │  No prediction submitted                  │  0 pts    │   │
│  └───────────────────────────────────────────────────────┘   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 5.3 Component Reuse

| Component | Existing | Reuse/Extend |
|-----------|----------|-------------|
| `GameweekSelector` | Yes (`/fixtures/gameweek-selector.tsx`) | Reuse as-is — already supports `gameweeks` array and `selected` prop |
| `FixtureCard` | Yes (`fixture-card.tsx`) | Extend: add a `viewerPrediction` prop to show another user's prediction instead of only the form |
| `ScoreDisplay` | Yes (`score-display.tsx`) | Reuse as-is for points/reason display |
| `EmptyState` | Yes (`empty-state.tsx`) | Reuse for "no predictions" states |
| `Badge` | Yes (`ui/badge.tsx`) | Reuse for season badge, score reason badges |
| `StatCard` | Yes (`stat-card.tsx`) | Reuse for summary strip (Total, Exact, Outcome) |
| `LeaderboardTable` | Yes (`leaderboard-table.tsx`) | Extend: add clickable user rows linking to `/predictions/[userId]` |

### 5.4 Visibility States (UI)

#### State A: Predictions Visible

Standard view as shown in §5.2. All fixture cards show the user's predictions, actual results (if available), and points.

#### State B: Predictions Hidden (Current GW, Before Kickoff, Viewer Has Predicted)

```
┌─────────────────────────────────────────────────────────────┐
│  [Avatar] Alice's Predictions                                │
│  Gameweek 15                                                 │
│                                                              │
│  ┌─ Info Banner ────────────────────────────────────────┐   │
│  │  🔒 Predictions are hidden until the first kickoff    │   │
│  │  Reveals at: Saturday 12:30 PM                        │   │
│  │                                                       │   │
│  │  You've already submitted your predictions, so other  │   │
│  │  users' picks are hidden to keep things fair.         │   │
│  └───────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌─ Fixture Card (blurred/locked) ──────────────────────┐   │
│  │  Arsenal  vs  Chelsea           Sat 12:30             │   │
│  │  ─────────────────────────────────────                │   │
│  │  Prediction: 🔒 Hidden                                │   │
│  └───────────────────────────────────────────────────────┘   │
│  ...                                                         │
└─────────────────────────────────────────────────────────────┘
```

#### State C: Predictions Visible (Current GW, Before Kickoff, Viewer Has NOT Predicted)

Same as State A, but with a contextual banner:

```
┌─────────────────────────────────────────────────────────┐
│  ℹ️  These predictions are locked in. You haven't       │
│     submitted your predictions yet.                      │
│     [Submit your predictions →]                          │
└─────────────────────────────────────────────────────────┘
```

### 5.5 Mobile Layout

- Single column, full-width fixture cards
- Gameweek selector: horizontal scroll with pill-style buttons (existing pattern)
- Summary strip: 2×2 grid of `StatCard` components
- Avatar + username in a compact header bar
- Sticky gameweek selector on scroll

### 5.6 Desktop Layout

- Max content width: `max-w-3xl` (consistent with existing pages)
- Summary strip: horizontal 4-column layout
- Side-by-side comparison view possible in P2 (future)

### 5.7 Navigation Integration

| Entry Point | Action | Destination |
|-------------|--------|-------------|
| Leaderboard table row | Click on user name/avatar | `/predictions/{userId}?gw={latestCompletedGw}` |
| Live leaderboard row | Click on user name/avatar | `/predictions/{userId}?gw={currentGw}` |
| Own profile / nav menu | "My Predictions" link | `/predictions/me` |
| Dashboard | New "Prediction History" quick link | `/predictions/me` |

### 5.8 Loading & Skeleton States

- Gameweek selector: render immediately (data available from fixtures query)
- Summary strip: skeleton cards with shimmer animation (4 cards)
- Fixture cards: 3–5 skeleton cards stacked with staggered fade-in
- Consistent with existing `loading.tsx` pattern and `animate-fade-in-up` class

### 5.9 Accessibility

| Requirement | Implementation |
|-------------|---------------|
| Screen reader: hidden predictions | `aria-label="Prediction hidden until kickoff"` on locked icons |
| Screen reader: points breakdown | Each fixture card includes an `aria-label` summarizing prediction, result, and points |
| Keyboard navigation | All interactive elements (gameweek pills, user links) are focusable and operable with Enter/Space |
| Color independence | Points display uses text labels ("Exact Score", "Correct Outcome") in addition to color coding |
| Reduced motion | Fade animations respect `prefers-reduced-motion: reduce` |

### 5.10 Empty & Error States

| State | Display |
|-------|---------|
| User has no predictions for selected GW | EmptyState: "No predictions submitted for {gwLabel}" with fixture list showing results only |
| User doesn't exist | 404 page (existing `not-found.tsx`) |
| API error | Toast notification + retry button |
| No active season | EmptyState: "No Active Season" (existing pattern) |
| Future GW with no fixtures | EmptyState: "No fixtures available for this gameweek yet" |

---

## 6. Technical Considerations

### 6.1 RLS Policy Update

The current policy `predictions_select_own_or_kicked_off` operates at the **per-fixture** level (checking if individual fixtures have kicked off). The new feature requires **gameweek-level** visibility logic. The RLS policy must be updated or supplemented.

**Proposed new RLS logic (pseudocode):**

```sql
-- User can SELECT a prediction row IF:
--   1. It's their own prediction (auth.uid() = user_id), OR
--   2. User is admin, OR
--   3. The prediction's fixture belongs to a gameweek where:
--      a. The first kickoff in that gameweek has passed (now() >= MIN(kickoff_time)), OR
--      b. The first kickoff has NOT passed AND the viewing user has NO predictions
--         for ANY fixture in that gameweek
```

**Note:** Complex RLS with subqueries on `predictions` (self-referencing) and `fixtures` can cause performance issues. Consider implementing visibility checks at the **API layer** (server-side function) rather than purely in RLS, while maintaining RLS as a safety net. A Postgres function `can_view_gameweek_predictions(viewer_id, season_id, gameweek)` can encapsulate the logic and be called from both the API and a simplified RLS policy.

### 6.2 New API Endpoint

**`GET /api/predictions/history/[userId]?gw={gameweek}&seasonId={seasonId}`**

Returns predictions for the given user and gameweek, respecting visibility rules.

**Response shape:**
```typescript
{
  predictions: Array<{
    fixture_id: string;
    home_score: number;
    away_score: number;
    submitted_at: string;
  }>;
  fixtures: Array<Fixture>;
  score_records: Array<ScoreRecord>;
  profile: { id: string; display_name: string; avatar_url: string | null };
  visibility: 'visible' | 'hidden' | 'own';
  first_kickoff: string | null;    // ISO timestamp
  viewer_has_predicted: boolean;
}
```

### 6.3 New Database Function

```sql
CREATE OR REPLACE FUNCTION public.can_view_gameweek_predictions(
  p_viewer_id uuid,
  p_target_user_id uuid,
  p_season_id uuid,
  p_gameweek integer
) RETURNS boolean
```

Returns `true` if the viewer can see the target user's predictions for the given gameweek. Encapsulates the full visibility matrix.

### 6.4 Performance Considerations

- **Index needed:** `predictions(user_id, fixture_id)` compound index already exists (`idx_predictions_fixture_user`)
- **Index needed:** `fixtures(season_id, gameweek, kickoff_time)` — verify or create
- **Cache first kickoff:** The first kickoff time per gameweek changes infrequently. Cache in the API layer for 60 seconds to avoid repeated `MIN()` queries
- **Pagination:** Not needed for MVP (max 10 fixtures per gameweek). If the "all users" summary view (P1) is implemented, consider virtual scrolling for wide tables

---

## 7. Key Design Decisions

| # | Decision | Rationale | Alternatives Considered |
|---|----------|-----------|------------------------|
| 1 | Visibility anchor is **first kickoff of the gameweek**, not per-fixture kickoff | Simplifies mental model for users. A gameweek is one "round" and should be treated atomically for visibility. Per-fixture visibility would be confusing ("I can see predictions for the 12:30 game but not the 15:00 game"). | Per-fixture kickoff (current RLS); manual deadline from `gameweek_deadlines` |
| 2 | "Has submitted" means **at least one prediction** in the gameweek | Simple to check, prevents gaming via partial submissions. If you've committed to any prediction, you're "in" and blocked from viewing. | Require all fixtures predicted; percentage threshold |
| 3 | Enforce visibility at **API layer + RLS safety net** | Complex conditional logic (self-referencing `predictions` table in RLS) is hard to optimize. API-layer logic is testable and debuggable. RLS remains as a fallback guard. | Pure RLS (performance risk); pure API (no safety net) |
| 4 | Single-user view (P0) before all-users grid (P1) | The single-user view is simpler to build, test, and covers the core use case. The all-users grid is a nice-to-have comparison tool. | Build grid view first; combined view |
| 5 | Link from leaderboard to prediction history | Natural navigation path — users see the leaderboard and want to drill into a specific player's predictions. Creates discoverability without a new top-level nav item. | Separate search/browse page; user profile pages |
| 6 | `/predictions/me` convenience alias | Avoid requiring the user to know their own UUID. Simple redirect. | Use `/predictions` without userId (ambiguous); use display name in URL (not unique) |
| 7 | Do NOT allow prediction deletion | Prevents gaming the visibility rule (delete predictions to become "non-submitter" and spy on others, then resubmit). This is the current system behaviour and should be preserved. | Allow deletion (creates exploit) |

---

## Appendix A: Glossary

| Term | Definition |
|------|-----------|
| **First kickoff** | `MIN(kickoff_time)` of non-postponed, non-cancelled fixtures in a gameweek |
| **Current gameweek** | The gameweek currently being displayed/selected, which may or may not have started |
| **Has submitted** | User has ≥1 prediction row for any fixture in the gameweek |
| **Visibility anchor** | The timestamp that determines when the prediction visibility transition occurs |

---

## Appendix B: Migration Checklist

- [ ] Create `can_view_gameweek_predictions()` Postgres function
- [ ] Update or supplement RLS policy on `predictions` table
- [ ] Add compound index on `fixtures(season_id, gameweek, kickoff_time)` if missing
- [ ] Create API route `/api/predictions/history/[userId]`
- [ ] Create page `/predictions/[userId]/page.tsx`
- [ ] Extend `FixtureCard` with `viewerPrediction` prop
- [ ] Add clickable user links to `LeaderboardTable`
- [ ] Add "My Predictions" link to navigation
- [ ] Write integration tests for all 6 visibility matrix scenarios
- [ ] Write E2E test for the submission → visibility-blocked transition (Edge Case 4.4)
