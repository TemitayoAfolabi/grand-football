# Grand Football — Star Man Voting Feature

> **Document Owner:** Strategy & Design Agent
> **Last Updated:** 2026-02-27
> **Status:** Draft (Phase 2 Feature)
> **Feature Type:** Social / Engagement (non-scoring)

---

## Overview

"Star Man" is a once-per-season community vote where users nominate the player they consider the best performer of the season. The admin controls the voting lifecycle — setting up nominees, opening/closing voting — and voting automatically closes **2 hours before the active season's `start_date`**.

> **Clarification:** Since the request specifies "2 hours before the start of the season," this is interpreted as a **pre-season vote** for the predicted best player of the upcoming season. Voting occurs before the season begins — a "who will be the star man?" prediction — which gives it a forward-looking, fun, speculative quality that aligns with the prediction nature of the app.

---

## 1. User Stories

### US-SM-1: Admin Creates a Voting Session

**Priority:** P1

**As an** admin, **I want to** create a Star Man voting session with a list of player nominees **so that** users have a curated set of candidates to vote on.

**Acceptance Criteria:**

```gherkin
Given I am an admin on the Star Man admin page
When I create a new voting session
Then I must select the active season it belongs to
And I must add at least 2 player nominees (name + team)
And the voting deadline defaults to 2 hours before the season's start_date
And the session is saved with status "DRAFT"

Given a voting session exists in DRAFT status
When I add or remove nominees
Then the nominee list is updated immediately
And an audit log entry is created

Given I am creating a voting session
When the active season has no start_date set
Then I see an error: "Cannot create voting — the active season has no start date."
And the session cannot be saved
```

**Notes:**
- Admin enters player name (free text, max 50 chars) and team name (free text or selected from known PL teams).
- No limit on nominees, but minimum is 2.
- One voting session per season (enforced by unique constraint on `season_id`).

---

### US-SM-2: Admin Opens Voting

**Priority:** P1

**As an** admin, **I want to** open voting for users **so that** they can begin submitting their Star Man votes.

**Acceptance Criteria:**

```gherkin
Given a voting session exists in DRAFT status with at least 2 nominees
When I tap "Open Voting"
Then the session status changes to "OPEN"
And all authenticated users can see the voting page
And an audit log entry is created: action = "OPEN_STAR_MAN_VOTING"

Given a voting session is already OPEN
When I view the admin Star Man page
Then I see a "Close Voting" button and the current vote tallies

Given the voting session has fewer than 2 nominees
When I try to open voting
Then I see an error: "Add at least 2 nominees before opening voting."
```

---

### US-SM-3: User Casts a Star Man Vote

**Priority:** P1

**As a** user, **I want to** vote for my predicted Star Man of the season **so that** I can participate in the community vote.

**Acceptance Criteria:**

```gherkin
Given voting is OPEN and the deadline has not passed
When I navigate to the Star Man voting page
Then I see all nominees displayed as selectable cards (player name + team + team crest)
And I can select exactly one nominee

Given I have selected a nominee
When I tap "Submit Vote"
Then my vote is recorded
And I see a confirmation: "Vote submitted! You picked [Player Name]."
And I can see who I voted for on subsequent visits

Given I have already voted and the deadline has not passed
When I return to the voting page
Then I see my current selection highlighted
And I can change my vote by selecting a different nominee and tapping "Change Vote"

Given voting is OPEN
When the current time is past the voting deadline (2h before season start)
Then I cannot submit or change my vote
And I see: "Voting has closed."
```

---

### US-SM-4: Voting Deadline Enforcement

**Priority:** P1

**As the** system, **I want to** enforce the voting deadline (2 hours before season `start_date`) **so that** no votes are accepted after the cutoff.

**Acceptance Criteria:**

```gherkin
Given the active season has start_date = "2025-08-16"
Then the voting deadline is "2025-08-15T22:00:00Z" (assuming midnight UTC start)

Given the voting deadline has passed
When a user attempts to submit or update a vote via the API
Then the request is rejected with HTTP 403
And the response message is "Voting has closed."

Given the voting deadline is within 24 hours
When a user views the voting page
Then a countdown timer is displayed: "Voting closes in X hours, Y minutes"

Given the voting deadline has passed
When the admin views the voting session
Then the session status is shown as "CLOSED" (auto-closed)
And the admin can still view all votes and results
```

**Technical Note:** Deadline enforcement is server-side. The `voting_deadline` is stored as `timestamptz` and compared against `now()` in both RLS policies and server actions. The deadline is computed as `season.start_date::timestamptz - interval '2 hours'`.

---

### US-SM-5: Admin Views Vote Results

**Priority:** P1

**As an** admin, **I want to** see the full vote tallies and individual votes **so that** I can monitor the voting and announce results.

**Acceptance Criteria:**

```gherkin
Given a voting session exists (any status)
When I view the admin Star Man page
Then I see each nominee with their total vote count
And nominees are sorted by vote count descending
And I can expand each nominee to see which users voted for them

Given voting is CLOSED
When I view the results
Then the winner is highlighted at the top
And if there is a tie, all tied nominees are shown as co-winners
```

---

### US-SM-6: User Views Star Man Results

**Priority:** P1

**As a** user, **I want to** see the Star Man voting results after voting closes **so that** I know who the community picked.

**Acceptance Criteria:**

```gherkin
Given voting is CLOSED
When I navigate to the Star Man page
Then I see the winner displayed prominently (player name, team, vote count)
And I see the full results list (all nominees ranked by votes)
And I see a badge next to my own vote: "Your pick"
And individual user votes are NOT visible to non-admin users (only aggregated counts)

Given voting is OPEN
When I view the Star Man page
Then I do NOT see other users' votes or running tallies
And I only see the nominee list and my own selection (if voted)
```

---

### US-SM-7: Admin Manually Closes or Reopens Voting

**Priority:** P2

**As an** admin, **I want to** manually close or reopen voting **so that** I have full control over the voting lifecycle.

**Acceptance Criteria:**

```gherkin
Given voting is OPEN
When I tap "Close Voting Early"
Then the session status changes to "CLOSED"
And no further votes are accepted
And an audit log entry is created

Given voting is CLOSED (manually or by deadline)
When I tap "Reopen Voting"
Then the session status changes to "OPEN"
And users can vote again until the deadline or next manual close
And an audit log entry is created

Given I reopen voting after the deadline has passed
Then votes are still not accepted (deadline takes precedence over status)
And the UI shows a warning: "Note: The deadline has passed. Reopening will not allow votes unless the deadline is extended."
```

---

### US-SM-8: No Voting Session Exists — Graceful Empty State

**Priority:** P1

**As a** user, **I want to** see a clear message when no Star Man voting is active **so that** I'm not confused by an empty page.

**Acceptance Criteria:**

```gherkin
Given no voting session exists for the active season
When I navigate to the Star Man page
Then I see an empty state: illustration + "No Star Man vote this season yet. Check back later!"

Given voting exists but is in DRAFT status
When a non-admin user navigates to the Star Man page
Then they see the same empty state (DRAFT sessions are not visible to regular users)
```

---

## 2. UI/UX Design Specification

### 2.1 Navigation Placement

**Decision:** Star Man voting gets a **dedicated page** accessible from the dashboard as a **promotional card** and from the **bottom nav as a contextual entry** (not a permanent 5th tab).

| Surface | Placement | Visibility |
|---------|-----------|------------|
| **Dashboard** | Promotional card below stat cards, above upcoming fixtures | Only when voting is OPEN or CLOSED (results) |
| **Bottom Nav (Mobile)** | No change — keep existing 4 tabs | — |
| **Top Nav (Desktop)** | No change — keep existing nav items | — |
| **Settings page** | No entry needed | — |
| **Admin panel** | New "Star Man" card/link on the admin dashboard | Always visible to admins |
| **Direct URL** | `/star-man` | Accessible via link |

**Rationale:**
- Adding a 5th tab to the bottom nav would crowd the mobile UI for a feature that is only relevant once per season (during the pre-season voting window plus results viewing).
- A dashboard promotional card is high-visibility and contextual — it appears when relevant and disappears when not.
- The admin gets a permanent link since they manage the lifecycle.

### 2.2 Route Structure

| Route | Description | Access |
|-------|-------------|--------|
| `/star-man` | User voting / results page | All authenticated users |
| `/admin/star-man` | Admin voting management | Admin only |

### 2.3 User Voting Page — `/star-man`

#### State: Voting OPEN (before deadline)

```
┌──────────────────────────────────┐
│  ← Back to Dashboard             │
│                                  │
│  ⭐ Star Man Vote                │
│  Who will be the star of the     │
│  2025-2026 season?               │
│                                  │
│  ⏱ Voting closes in 2d 5h 30m   │
│                                  │
│  ┌──────────────────────────────┐│
│  │  🟢  [Crest]  Erling Haaland ││
│  │      Manchester City         ││
│  │                    [●]       ││  ← Radio-style selection
│  └──────────────────────────────┘│
│  ┌──────────────────────────────┐│
│  │  [Crest]  Mohamed Salah      ││
│  │      Liverpool               ││
│  │                    [ ]       ││
│  └──────────────────────────────┘│
│  ┌──────────────────────────────┐│
│  │  [Crest]  Bukayo Saka        ││
│  │      Arsenal                 ││
│  │                    [ ]       ││
│  └──────────────────────────────┘│
│  ┌──────────────────────────────┐│
│  │  [Crest]  Cole Palmer        ││
│  │      Chelsea                 ││
│  │                    [ ]       ││
│  └──────────────────────────────┘│
│  ...more nominees...             │
│                                  │
│  [ Submit Vote ]                 │
│                                  │
└──────────────────────────────────┘
```

**Component Details:**

- **Page header:** Star icon + "Star Man Vote" title + season name subtitle + countdown timer
- **Nominee cards:** Each card shows the player name (bold), team name (secondary text), and an optional team crest image. Cards use the existing `Card` component with the dark surface style (`bg-surface`, `border-border-subtle`).
- **Selection:** Radio-button interaction — tapping a card selects it and deselects the previous. The selected card gets an accent border (`border-accent`) and a filled radio indicator.
- **Submit button:** Primary button (`bg-accent text-bg-primary`). Disabled until a nominee is selected.
- **Already voted:** If the user has already voted, their selection is pre-highlighted and the button text changes to "Change Vote".

#### State: Voting CLOSED (results)

```
┌──────────────────────────────────┐
│  ← Back to Dashboard             │
│                                  │
│  ⭐ Star Man — Results           │
│  2025-2026 Season                │
│                                  │
│  ┌──────────────────────────────┐│
│  │         🏆                    ││
│  │     Erling Haaland            ││
│  │     Manchester City           ││
│  │     18 votes                  ││
│  │                               ││
│  │     ✨ Community Star Man ✨   ││
│  └──────────────────────────────┘│
│                                  │
│  Runner-up Results               │
│  ┌──────────────────────────────┐│
│  │  2. Mohamed Salah    8 votes ││
│  │  3. Bukayo Saka      3 votes ││
│  │  4. Cole Palmer      1 vote  ││
│  │     Your pick ←              ││
│  └──────────────────────────────┘│
│                                  │
└──────────────────────────────────┘
```

**Component Details:**

- **Winner card:** Large, prominent card with a trophy icon and the accent glow treatment (`shadow-glow-sm`). Player name in `text-h1`, vote count displayed.
- **Results list:** Remaining nominees ranked by vote count. Each row shows rank, player name, and vote count. The user's own pick has a subtle "Your pick" badge.
- **Tie handling:** If multiple nominees share the top vote count, they are all shown as co-winners in the winner section with a note: "It's a tie!"

#### State: No Voting Available (empty state)

```
┌──────────────────────────────────┐
│  ← Back to Dashboard             │
│                                  │
│  ⭐ Star Man Vote                │
│                                  │
│     [ Star icon illustration ]   │
│                                  │
│  No Star Man vote this season    │
│  yet. Check back later!          │
│                                  │
└──────────────────────────────────┘
```

Uses the existing `EmptyState` component pattern.

### 2.4 Dashboard Promotional Card

When voting is OPEN, a promotional card appears on the dashboard between the stat cards row and the "Upcoming Fixtures" section:

```
┌──────────────────────────────────┐
│  ⭐ Star Man Vote is OPEN!       │
│  Who's your pick for the season? │
│  Voting closes in 2d 5h          │
│                        [Vote →]  │
└──────────────────────────────────┘
```

- Uses accent/gold border and background tint (`bg-accent/5 border-accent/30`).
- When voting is CLOSED, transforms into a results teaser:

```
┌──────────────────────────────────┐
│  ⭐ Star Man — Erling Haaland!   │
│  Chosen by the community 🏆      │
│                      [Results →] │
└──────────────────────────────────┘
```

- When no voting session exists or is in DRAFT, this card is not rendered.

### 2.5 Admin Star Man Management — `/admin/star-man`

#### Admin Dashboard Card

A new card on the admin overview page (`/admin`):

```
┌──────────────────────────────────┐
│  ⭐ Star Man Voting              │
│  Status: OPEN (18 of 30 voted)   │
│                      [Manage →]  │
└──────────────────────────────────┘
```

#### Management Page Layout

```
┌──────────────────────────────────┐
│  ⭐ Star Man Voting               │
│  Season: 2025-2026               │
│  Status: [OPEN]   Deadline: ...  │
│                                  │
│  ┌──────────────────────────────┐│
│  │  Actions                      ││
│  │  [ Open Voting ] or           ││
│  │  [ Close Voting ]             ││
│  └──────────────────────────────┘│
│                                  │
│  ┌──────────────────────────────┐│
│  │  Nominees            [+ Add] ││
│  │                               ││
│  │  Erling Haaland (Man City) [×]││
│  │  Mohamed Salah (Liverpool) [×]││
│  │  Bukayo Saka (Arsenal)     [×]││
│  │  Cole Palmer (Chelsea)     [×]││
│  └──────────────────────────────┘│
│                                  │
│  ┌──────────────────────────────┐│
│  │  Vote Results                 ││
│  │                               ││
│  │  Erling Haaland    18 votes  ││
│  │    ├ Temi, John, Alice, ...  ││
│  │  Mohamed Salah     8 votes   ││
│  │    ├ Bob, Carol, ...         ││
│  │  Bukayo Saka       3 votes   ││
│  │    ├ Dave, Eve, Frank        ││
│  │  Cole Palmer       1 vote    ││
│  │    ├ Grace                   ││
│  │                               ││
│  │  Total: 30/30 users voted    ││
│  └──────────────────────────────┘│
│                                  │
└──────────────────────────────────┘
```

**Key Admin Controls:**

- **Add nominee:** Modal/inline form with Player Name (text) + Team (text) fields.
- **Remove nominee:** Only allowed when session is in DRAFT. Once OPEN, nominees cannot be removed (deleting a nominee that users already voted for would cause data issues). Admin sees a disabled remove button with tooltip: "Cannot remove nominees after voting opens."
- **Open/Close toggle:** Single button that changes based on current status.
- **Vote results:** Always visible to admin. Shows each nominee's vote count and expandable list of voter display names.
- **Voter participation:** "18 of 30 voted" counter.

### 2.6 Visual Design Integration

| Element | Token / Style |
|---------|---------------|
| Star Man icon | `Star` from lucide-react, colored `text-gold` / `text-accent` |
| Nominee card (unselected) | `bg-surface border-border-subtle rounded-card` |
| Nominee card (selected) | `bg-accent/10 border-accent rounded-card ring-1 ring-accent/50` |
| Winner card | `bg-surface border-accent shadow-glow-sm rounded-card` |
| Countdown timer | `text-warning` when < 24h, `text-text-secondary` otherwise |
| "Your pick" badge | `Badge variant="outline"` with star icon |
| Dashboard promo card | `bg-accent/5 border-accent/30 rounded-card` |
| Submit button | Existing primary button style |
| Results rank numbers | `text-h3 text-text-primary` for #1, `text-body text-text-secondary` for others |

### 2.7 Responsive Behavior

| Breakpoint | Adaptation |
|------------|------------|
| **Mobile (< 640px)** | Single column nominee list, full-width cards, bottom-aligned submit button |
| **Tablet (640–1023px)** | Two-column nominee grid |
| **Desktop (1024px+)** | Two-column nominee grid, max-width 640px centered |

### 2.8 Animations

- Nominee card selection: 150ms border/background color transition
- Results page: Winner card fades in with a subtle scale-up (`animate-fade-in-up`)
- Dashboard promo card: Pulsing star icon (subtle, `animate-pulse` on the star only)

---

## 3. Acceptance Criteria Summary

### Definition of Done

| # | Criterion | Verification |
|---|-----------|-------------|
| 1 | Admin can create a voting session with ≥ 2 nominees for the active season | Manual test on `/admin/star-man` |
| 2 | Admin can open and close voting | Status toggle works, audit log created |
| 3 | Users see the voting page only when session is OPEN or CLOSED | Navigate to `/star-man` in all states |
| 4 | Users can vote for exactly one nominee | Submit vote, verify in DB |
| 5 | Users can change their vote before the deadline | Change vote, verify DB updated |
| 6 | Voting automatically locks 2 hours before season `start_date` | Attempt vote after deadline → rejected |
| 7 | Server-side deadline enforcement (cannot bypass via API) | Direct API call after deadline → HTTP 403 |
| 8 | Admin sees full vote tallies with voter names | Check admin results view |
| 9 | Users see aggregated results (no individual votes) after voting closes | Check user results page |
| 10 | Ties are displayed as co-winners | Simulate tie, verify display |
| 11 | Empty state shown when no voting session exists | Remove session, check `/star-man` |
| 12 | Dashboard promotional card appears when voting is OPEN or CLOSED | Check dashboard in both states |
| 13 | One voting session per season (unique constraint) | Attempt to create a second → error |
| 14 | Nominees cannot be removed after voting opens | Attempt removal when OPEN → disabled |
| 15 | All UI meets WCAG 2.1 AA contrast and keyboard navigation standards | Accessibility audit |
| 16 | Audit log records all admin actions (create, open, close, add/remove nominee) | Check `admin_audit_log` table |

---

## 4. Edge Cases

### 4.1 Admin Has Not Set Up Voting

| Scenario | Handling |
|----------|---------|
| No voting session exists for the active season | Users see empty state on `/star-man`. Dashboard promo card is hidden. |
| Voting session exists but is in DRAFT | Same as above — DRAFT sessions are invisible to non-admin users. |

### 4.2 User Tries to Vote After Deadline

| Scenario | Handling |
|----------|---------|
| Client-side: deadline passed | Submit button is disabled. Countdown replaced with "Voting has closed." |
| Server-side: late request (clock skew, cached page) | Server action checks `now() >= voting_deadline` and rejects with a clear error message. RLS policy also blocks the insert/update. |
| Race condition: user clicks submit right at the deadline | Server-side `now()` is the authority. If the server receives the request after the deadline, it is rejected. |

### 4.3 Tie in Voting

| Scenario | Handling |
|----------|---------|
| Two or more nominees share the highest vote count | All tied nominees are displayed as co-winners. The winner card section shows "It's a tie!" and lists all tied nominees equally. There is no automated tiebreaker — the admin can decide socially (e.g., announce in the group chat) or accept the tie. |
| All nominees have zero votes | No winner is declared. Results page shows "No votes were cast." |

### 4.4 Season Has No `start_date`

| Scenario | Handling |
|----------|---------|
| Admin tries to create a voting session | Blocked with error: "Cannot create voting — the active season has no start date. Set the season start date first." |
| Season `start_date` removed after voting session created | The voting session retains its computed `voting_deadline`. If the season start date is later re-set, admin should recreate the session. The system does NOT auto-update the deadline. |

### 4.5 Season Changes While Voting Is Active

| Scenario | Handling |
|----------|---------|
| Admin deactivates the season (sets `is_active = false`) | Voting session is orphaned but still exists. Users navigating to `/star-man` see empty state (query filters by active season). |
| Admin creates a new active season | No voting session exists for the new season. Empty state shown. Old season's voting data is preserved. |

### 4.6 User Joins After Voting Closes

| Scenario | Handling |
|----------|---------|
| A new user joins after the voting deadline | They can view results but cannot vote (deadline passed). They see the results page like everyone else. |

### 4.7 Admin Adds Nominees After Voting Opens

| Scenario | Handling |
|----------|---------|
| Admin adds a new nominee while voting is OPEN | The new nominee appears in the voting list for all users. Users who already voted are NOT forced to re-vote — their existing vote stands. Users who haven't voted or want to change see the new option. |
| Admin tries to remove a nominee while voting is OPEN | Blocked. Removing a nominee with existing votes would invalidate those votes. |

### 4.8 Very Few Votes Cast

| Scenario | Handling |
|----------|---------|
| Only 2 of 30 users vote | Results still display normally. The winner is whoever has the most votes, even if it's just 1. Participation count shown: "2 of 30 voted." |

---

## 5. Key Decisions

### Decision SM-1: Does Voting Affect Points / Leaderboard?

| Attribute | Detail |
|-----------|--------|
| **Decision** | **No.** Star Man voting is a standalone social/engagement feature. It does not award points or affect the leaderboard in any way. |
| **Status** | ✅ Recommended |

**Rationale:**
- The prediction game is the core feature. Mixing leaderboard points with a popularity vote would muddy the competitive integrity.
- At 30 users, the social fun of voting is its own reward.
- Keeping it separate means zero risk of scoring disputes related to voting.
- **Phase 3 possibility:** Award a non-competitive "Star Man Badge" (cosmetic only) to users who voted for the eventual official PL Player of the Season.

---

### Decision SM-2: Can Users Change Their Vote?

| Attribute | Detail |
|-----------|--------|
| **Decision** | **Yes**, users can change their vote unlimited times before the deadline. |
| **Status** | ✅ Recommended |

**Rationale:**
- Pre-season predictions are speculative. Users may change their mind as more transfer news / pre-season results emerge.
- With 30 users, vote-changing abuse is not a concern.
- Simplifies UX — no "are you sure?" friction.
- The database stores only the current vote (upsert on `user_id + session_id`), not a history of changes.

---

### Decision SM-3: One Vote Per Season or Per Gameweek?

| Attribute | Detail |
|-----------|--------|
| **Decision** | **One vote per season.** |
| **Status** | ✅ Recommended |

**Rationale:**
- The user's request explicitly says "2 hours before the start of the season," which implies a single pre-season event.
- A per-gameweek vote would be a fundamentally different feature (more like "Man of the Match" voting), with much higher complexity and different admin overhead.
- Per-season keeps it simple and special — a once-a-year event.
- **Phase 3 possibility:** Add a monthly/gameweek "Player of the Month" voting feature as a separate, optional module.

---

### Decision SM-4: Are Vote Tallies Visible During Voting?

| Attribute | Detail |
|-----------|--------|
| **Decision** | **No.** Users cannot see running tallies or other users' votes while voting is OPEN. Results are only visible after voting is CLOSED. |
| **Status** | ✅ Recommended |

**Rationale:**
- Showing running tallies creates bandwagon effects — users pile onto the leading candidate instead of voting independently.
- With 30 users, revealing tallies would also effectively reveal who voted for whom (especially low-vote candidates).
- The admin can see tallies at all times for monitoring purposes.

---

### Decision SM-5: Who Sets the Nominees?

| Attribute | Detail |
|-----------|--------|
| **Decision** | **Admin only.** The admin curates the nominee list. Users do not nominate candidates. |
| **Status** | ✅ Recommended |

**Rationale:**
- The admin requested "control over how the voting goes" — curating nominees is the core of that control.
- Open nominations with 30 users would be chaotic (potentially 30 different players) and hard to manage.
- The admin likely knows the league's preferences and can set 5–10 strong candidates.
- Admin can take informal suggestions via the group chat and translate them into the official nominee list.

---

## 6. Database Schema (Proposed)

### New Tables

#### `star_man_sessions`

| Column | Type | Constraints | Default | Description |
|--------|------|-------------|---------|-------------|
| `id` | `uuid` | PK | `gen_random_uuid()` | Session ID |
| `season_id` | `uuid` | FK → `seasons(id)`, UNIQUE | — | One session per season |
| `status` | `text` | CHECK (`DRAFT`, `OPEN`, `CLOSED`) | `'DRAFT'` | Voting lifecycle status |
| `voting_deadline` | `timestamptz` | NOT NULL | — | Auto-set to `season.start_date - 2 hours` |
| `created_at` | `timestamptz` | NOT NULL | `now()` | — |
| `updated_at` | `timestamptz` | NOT NULL | `now()` | — |

#### `star_man_nominees`

| Column | Type | Constraints | Default | Description |
|--------|------|-------------|---------|-------------|
| `id` | `uuid` | PK | `gen_random_uuid()` | Nominee ID |
| `session_id` | `uuid` | FK → `star_man_sessions(id)` ON DELETE CASCADE | — | Parent session |
| `player_name` | `text` | NOT NULL, max 50 chars | — | Player's name |
| `team_name` | `text` | NOT NULL, max 50 chars | — | Team name |
| `team_crest_url` | `text` | nullable | — | Optional team crest image URL |
| `created_at` | `timestamptz` | NOT NULL | `now()` | — |

#### `star_man_votes`

| Column | Type | Constraints | Default | Description |
|--------|------|-------------|---------|-------------|
| `id` | `uuid` | PK | `gen_random_uuid()` | Vote ID |
| `session_id` | `uuid` | FK → `star_man_sessions(id)` ON DELETE CASCADE | — | Parent session |
| `user_id` | `uuid` | FK → `profiles(id)` ON DELETE CASCADE | — | Voter |
| `nominee_id` | `uuid` | FK → `star_man_nominees(id)` ON DELETE CASCADE | — | Chosen nominee |
| `voted_at` | `timestamptz` | NOT NULL | `now()` | When vote was cast/changed |
| | | UNIQUE (`session_id`, `user_id`) | — | One vote per user per session |

### RLS Policies

```sql
-- star_man_sessions: all authenticated can read OPEN/CLOSED, admin can read all, admin can insert/update
-- star_man_nominees: all authenticated can read (if session is OPEN/CLOSED), admin can insert/delete
-- star_man_votes: user can read own, admin can read all, user can insert/update own (if deadline not passed)
```

### Admin Audit Log Extension

Add new action types to the `admin_audit_log.action` CHECK constraint:

- `CREATE_STAR_MAN_SESSION`
- `OPEN_STAR_MAN_VOTING`
- `CLOSE_STAR_MAN_VOTING`
- `ADD_STAR_MAN_NOMINEE`
- `REMOVE_STAR_MAN_NOMINEE`

---

## 7. Implementation Notes

### File Structure (Proposed)

```
src/
  app/(authenticated)/
    star-man/
      page.tsx          # User voting / results page
      actions.ts        # Server actions for casting votes
    admin/
      star-man/
        page.tsx        # Admin management page
        actions.ts      # Server actions for session/nominee management
  components/
    star-man-card.tsx          # Dashboard promotional card
    star-man-nominee-card.tsx  # Nominee card (selectable)
    star-man-results.tsx       # Results display component
supabase/
  migrations/
    00002_star_man_voting.sql  # New migration for star man tables
```

### API / Server Actions

| Action | Location | Auth |
|--------|----------|------|
| `createVotingSession` | `/admin/star-man/actions.ts` | Admin only |
| `addNominee` | `/admin/star-man/actions.ts` | Admin only |
| `removeNominee` | `/admin/star-man/actions.ts` | Admin only, DRAFT only |
| `openVoting` | `/admin/star-man/actions.ts` | Admin only |
| `closeVoting` | `/admin/star-man/actions.ts` | Admin only |
| `castVote` | `/star-man/actions.ts` | Authenticated, before deadline |
| `changeVote` | `/star-man/actions.ts` | Authenticated, before deadline |

All mutations use Next.js Server Actions with `revalidatePath` for cache invalidation.

### Performance

- With 30 users and ≤ 15 nominees, all queries are trivially fast.
- No pagination needed.
- Vote tallies computed with a simple `GROUP BY nominee_id` count.
