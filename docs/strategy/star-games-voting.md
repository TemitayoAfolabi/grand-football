# Grand Football — Star Games Voting Feature

> **Document Owner:** Strategy & Design Agent
> **Last Updated:** 2026-02-27
> **Status:** Draft (Phase 2 Feature)
> **Feature Type:** Community Engagement / Scoring Enhancement

---

## Overview

"Star Games Voting" is a **per-gameweek** community voting feature where users vote for the **2 fixtures** they want designated as **Star Games**. Star Games carry enhanced scoring — an exact score prediction earns **10 points** instead of the normal 5.

Currently, admins manually toggle `is_star_game` on individual fixtures. This feature **replaces/augments** that manual process by introducing a democratic voting mechanism with full admin override capability.

> **Important:** This feature is distinct from **Star Man Voting** (which is a once-per-season vote for the best player). Star Games Voting is about **fixtures**, not players, and occurs **every gameweek**.

### Optional Variant: "Champion Pick + Community Vote" (Your Suggestion)

Instead of users voting for **both** Star Games, the **previous gameweek winner** ("Gameweek Champion") gets the right to **pick 1 Star Game** for the upcoming gameweek. The community then votes for the **remaining 1 Star Game** from the fixtures not already selected by the champion.

This creates a fun weekly loop:
- After GW ends: announce champion + give them a perk.
- Before next GW: champion makes a pick, everyone else votes, then Star Games lock in before kickoff.

### Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Default votes per user per gameweek | **Exactly 2** | Matches the number of star games per gameweek; forces meaningful selection |
| Hybrid mode votes per user per gameweek | **Exactly 1** | Champion picks 1 Star Game; community only needs to decide the remaining slot |
| Voting deadline | **2 hours before first kickoff** of the gameweek | Prevents tactical last-minute voting after lineups/news |
| Admin workflow | **Dual-mode** — community vote OR manual pick | Flexibility for edge cases where community voting isn't appropriate |
| Tie-breaking | **Earlier kickoff time wins** | Deterministic, fair, no admin intervention needed |
| Minimum participation | **None** (even 1 vote counts) | Small league (~30 users), low threshold appropriate |

---

## 1. User Stories

### US-SGV-1: Admin Creates a Star Games Voting Session

**Priority:** P1

**As an** admin, **I want to** create a Star Games voting session for a specific gameweek **so that** users can vote on which fixtures become Star Games.

**Acceptance Criteria:**

```gherkin
Given I am an admin on the Star Games Voting admin page
When I select a gameweek from the active season
Then I see all fixtures in that gameweek listed
And I can create a voting session for that gameweek

Given I am creating a voting session for a gameweek
When I tap "Create Voting Session"
Then a session is created with status "DRAFT"
And the voting deadline defaults to 2 hours before the earliest kickoff_time in that gameweek
And all non-postponed, non-cancelled fixtures in the gameweek become voteable candidates
And an audit log entry is created: action = "CREATE_STAR_GAME_VOTE_SESSION"

Given a voting session already exists for this gameweek
When I try to create another voting session for the same gameweek
Then I see an error: "A voting session already exists for Gameweek [N]."

Given the gameweek has fewer than 2 playable fixtures
When I try to create a voting session
Then I see a warning: "This gameweek has fewer than 2 fixtures. Star games will be assigned automatically."
And the session is created with mode = "ADMIN_PICK" (no community voting)

Given the gameweek has exactly 2 playable fixtures
When I create a voting session
Then I see a notice: "Only 2 fixtures — both will automatically be Star Games."
And both fixtures are immediately marked as star games (no voting needed)
And the session is created with status "CLOSED" and resolution_mode = "AUTO_ALL"
```

**Notes:**
- One voting session per season + gameweek combination (enforced by unique constraint).
- The admin can adjust the deadline before opening voting.
- Fixtures with status `POSTPONED` or `CANCELLED` are excluded from voting candidates.

---

### US-SGV-2: Admin Opens Voting

**Priority:** P1

**As an** admin, **I want to** open a Star Games voting session **so that** users can begin voting.

**Acceptance Criteria:**

```gherkin
Given a Star Games voting session exists in DRAFT status
And the gameweek has at least 3 playable fixtures
When I tap "Open Voting"
Then the session status changes to "OPEN"
And all authenticated users can see the voting interface on the Fixtures page
And an audit log entry is created: action = "OPEN_STAR_GAME_VOTING"

Given a Star Games voting session exists in DRAFT status
And the voting deadline has already passed
When I try to open voting
Then I see an error: "Cannot open voting — the deadline has already passed."
And the session remains in DRAFT status

Given a Star Games voting session is OPEN
When a user navigates to the Fixtures page for that gameweek
Then they see a "Vote for Star Games" banner/section above the fixture list
```

---

### US-SGV-3: Admin Closes Voting Early

**Priority:** P1

**As an** admin, **I want to** manually close voting before the auto-deadline **so that** I can finalize star games early if needed.

**Acceptance Criteria:**

```gherkin
Given a Star Games voting session is OPEN
When I tap "Close Voting"
Then the session status changes to "CLOSED"
And the top 2 voted fixtures are automatically marked as is_star_game = true
And previously-set star games for this gameweek (if any) are cleared first
And an audit log entry is created: action = "CLOSE_STAR_GAME_VOTING"
And users can no longer submit or change votes

Given I close voting and there is a tie for 2nd place
When the system resolves the tie
Then the fixture with the earlier kickoff_time wins the tie
And the tie-breaking is noted in the audit log
```

---

### US-SGV-4: Admin Overrides Community-Selected Star Games

**Priority:** P1

**As an** admin, **I want to** override the community-voted star games **so that** I can correct the selection if needed (e.g., fixture postponed after voting).

**Acceptance Criteria:**

```gherkin
Given a Star Games voting session is CLOSED
And star games have been set from community votes
When I navigate to the Star Games Voting admin panel for that gameweek
Then I see the current star games highlighted
And I see an "Override" toggle/button

Given I am overriding the community selection
When I select 2 different fixtures and tap "Apply Override"
Then the previously selected star games have is_star_game = false
And the newly selected fixtures have is_star_game = true
And the session's resolution_mode is updated to "ADMIN_OVERRIDE"
And an audit log entry is created: action = "OVERRIDE_STAR_GAMES"
  with old_value = [previous fixture IDs] and new_value = [new fixture IDs]

Given I have overridden the star games
When I view the voting results
Then I still see the original community vote tallies (preserved for transparency)
And a banner shows: "Star Games overridden by admin. Community vote: [Fixture A], [Fixture B]."
```

---

### US-SGV-5: Admin Manually Picks Star Games (No Voting)

**Priority:** P1

**As an** admin, **I want to** manually designate star games without community voting **so that** I have full control when voting isn't appropriate.

**Acceptance Criteria:**

```gherkin
Given I am on the Star Games Voting admin page for a gameweek
And no voting session exists yet
When I tap "Manual Pick" instead of "Create Voting Session"
Then I see all fixtures in the gameweek as selectable cards
And I can select exactly 2 fixtures

Given I have selected 2 fixtures for manual star game designation
When I tap "Confirm Star Games"
Then a voting session is created with status = "CLOSED" and resolution_mode = "ADMIN_PICK"
And the 2 selected fixtures have is_star_game = true
And an audit log entry is created: action = "MANUAL_STAR_GAME_PICK"

Given a gameweek with fewer than 2 fixtures
When I use manual pick
Then I can select all available fixtures (1 or 0) as star games
And a note displays: "Fewer than 2 fixtures available for this gameweek."
```

---

### US-SGV-6: User Views and Votes for Star Games

**Priority:** P1

**As a** user, **I want to** vote for the 2 fixtures I think should be Star Games **so that** my voice counts in the community decision.

**Acceptance Criteria:**

```gherkin
Given a Star Games voting session is OPEN for the current gameweek
When I navigate to the Fixtures page
Then I see a "Vote for Star Games" section at the top
And all voteable fixtures are displayed as selectable cards
And each card shows: home_team vs away_team, team crests, kickoff time
And I see the instruction: "Pick 2 fixtures to be Star Games (2× exact score points!)"

Given I am viewing the Star Games voting section
When I tap a fixture card to select it
Then the card highlights with a gold star indicator
And a running count shows: "1 of 2 selected" or "2 of 2 selected"

Given I have selected 2 fixtures
When I tap "Submit Votes"
Then my votes are recorded
And I see a confirmation: "Votes submitted! You voted for [Team A vs Team B] and [Team C vs Team D]."
And the fixture cards I voted for show a "Your pick" indicator

Given I try to select a 3rd fixture
When I tap a 3rd fixture card
Then the 3rd card does NOT get selected
And I see a tooltip/message: "You can only pick 2 fixtures. Deselect one first."

Given I have NOT selected exactly 2 fixtures
When the "Submit Votes" button is shown
Then it remains disabled with text: "Select 2 fixtures to vote"
```

---

### US-SGV-7: User Changes Votes Before Deadline

**Priority:** P1

**As a** user, **I want to** change my Star Games votes before the deadline **so that** I can change my mind.

**Acceptance Criteria:**

```gherkin
Given I have already voted and the voting deadline has NOT passed
When I navigate to the Star Games voting section
Then I see my current selections highlighted with "Your pick" indicators
And I see a "Change Votes" button

Given I have tapped "Change Votes"
When I deselect a fixture and select a different one
And I tap "Update Votes"
Then my votes are updated (old votes replaced)
And I see a confirmation: "Votes updated!"
And an audit trail records the change (user_id, old_votes, new_votes, timestamp)

Given I have already voted and the voting deadline HAS passed
When I navigate to the Star Games voting section
Then I see my votes with a "Locked" indicator
And there is no option to change votes
And I see: "Voting closed. Results will be applied shortly."
```

---

### US-SGV-8: Voting Auto-Closes Before First Kickoff

**Priority:** P1

**As the** system, **I want to** automatically close voting 2 hours before the first kickoff **so that** star games are determined in time.

**Acceptance Criteria:**

```gherkin
Given a Star Games voting session is OPEN
And the current time reaches the voting deadline (2h before first kickoff)
When the auto-close mechanism triggers
Then the session status changes to "CLOSED"
And the top 2 voted fixtures are marked as is_star_game = true
And any previous is_star_game flags for this gameweek are cleared
And the resolution_mode is set to "COMMUNITY_VOTE"

Given the auto-close triggers and there are 0 votes (nobody voted)
When the system processes the results
Then the session is closed with resolution_mode = "NO_VOTES"
And no fixtures are marked as star games
And the admin is notified (flag in admin panel): "No votes received for GW [N]. Manually assign star games."

Given the auto-close mechanism
When the system checks for expiring sessions
Then it uses a cron job that runs every 15 minutes
And it processes all OPEN sessions where deadline <= now()
```

**Implementation Note:** The auto-close is implemented via the existing cron infrastructure (Vercel cron or Supabase pg_cron). A new cron endpoint `/api/cron/close-star-votes` runs every 15 minutes.

---

### US-SGV-9: Voting Results Determine Star Games

**Priority:** P1

**As the** system, **I want to** apply voting results to the fixtures table **so that** the scoring engine correctly applies Star Game multipliers.

**Acceptance Criteria:**

```gherkin
Given voting has closed (manually or automatically)
When the system tallies votes
Then each fixture's total vote count is calculated
And the top 2 fixtures by vote count are identified

Given the top 2 fixtures have been identified
When the system applies the results
Then those fixtures have is_star_game = true
And all other fixtures in the gameweek have is_star_game = false
And the fixtures' manually_overridden field remains false (set to true only on admin override)

Given a tie exists for 2nd place (e.g., Fixture B and Fixture C both have 8 votes)
When the tie is broken
Then the fixture with the earlier kickoff_time is chosen
And if kickoff times are also equal, the fixture created first (by fixtures.created_at) wins

Given voting results are applied
When the scoring engine later runs for finished fixtures
Then it reads is_star_game from the fixtures table
And awards 10 points for exact score on star games (existing behavior, no engine changes needed)
```

---

### US-SGV-10: User Views Voting Results After Close

**Priority:** P2

**As a** user, **I want to** see the Star Games voting results **so that** I know which fixtures were selected and how the community voted.

**Acceptance Criteria:**

```gherkin
Given voting is CLOSED for a gameweek
When I navigate to the Fixtures page for that gameweek
Then I see the Star Games highlighted with a gold star badge (existing behavior)
And I see a "Community Vote Results" expandable section

Given I expand the "Community Vote Results" section
Then I see all fixtures ranked by vote count
And each entry shows: fixture name, vote count, percentage of total votes
And the top 2 fixtures are highlighted as "Selected as Star Games"
And if the admin overrode the results, I see: "Admin override — original community picks: [X], [Y]"

Given voting has not yet occurred for a gameweek
When I view the Fixtures page
Then I see no voting results section
And star games (if any) show the standard gold star badge without vote tallies
```

---

### US-SGV-11: Dashboard Shows Voting Status

**Priority:** P2

**As a** user, **I want to** see Star Games voting status on my dashboard **so that** I don't miss the voting window.

**Acceptance Criteria:**

```gherkin
Given a Star Games voting session is OPEN for the upcoming gameweek
And I have NOT voted yet
When I view my Dashboard
Then I see a prompt card: "Vote for Star Games — GW [N]"
And it shows the voting deadline with a countdown
And tapping it navigates to the Fixtures page with the voting section

Given I have already voted for the current voting session
When I view my Dashboard
Then I see: "Star Games Vote submitted for GW [N] ✓"
And the card is in a muted/completed state

Given no voting session is open
When I view my Dashboard
Then no Star Games voting card is shown
```

---

### US-SGV-12: System Determines the Gameweek Champion (Hybrid Mode)

**Priority:** P2

**As the** system, **I want to** determine the previous gameweek's highest scorer **so that** they can earn the right to pick 1 Star Game for the upcoming gameweek.

**Acceptance Criteria:**

```gherkin
Given gameweek [N] has completed (all fixtures status = FINISHED, or a configurable admin close)
When the system computes gameweek totals for each user
Then the user with the highest total points for gameweek [N] is recorded as the "Gameweek Champion"
And the champion record stores: season_id, gameweek, user_id, total_points, computed_at

Given two or more users are tied on total_points for the gameweek
When the system resolves the tie
Then tie-breaking is applied in order:
  1. Most EXACT scores in that gameweek (higher = better)
  2. Most OUTCOME scores in that gameweek (higher = better)
  3. Fewest NO_PREDICTION in that gameweek (lower = better)
And if still tied, the tie is recorded as co-champions
And the "pick right" is assigned to the first user by deterministic order (e.g., smallest user_id) unless admin changes it
```

**Notes:**
- If you want the "Team of the Week" concept, this champion output is the anchor for the weekly highlight card.
- This story intentionally does not change scoring; it's a computed award/role.

---

### US-SGV-13: Gameweek Champion Picks 1 Star Game (Hybrid Mode)

**Priority:** P2

**As the** gameweek champion, **I want to** choose 1 fixture as a Star Game for the upcoming gameweek **so that** I can influence the weekly scoring drama.

**Acceptance Criteria:**

```gherkin
Given the Star Games session for gameweek [N+1] is configured as mode = "CHAMPION_PLUS_COMMUNITY"
And I am the recorded Gameweek Champion for gameweek [N]
When I view the Star Games banner/section for gameweek [N+1]
Then I see a "Champion Pick" step
And I can select exactly 1 fixture from the voteable candidates

Given I have selected 1 fixture
When I confirm my champion pick
Then that fixture is marked as champion_selected = true for the session
And it is locked (cannot be removed by non-admin users)
And an audit log entry is created: action = "CHAMPION_PICK_STAR_GAME"

Given I am not the champion
When I view the Star Games section
Then I can see which fixture the champion picked (if already picked)
And I cannot change it
```

---

### US-SGV-14: Community Votes For the Remaining Star Game (Hybrid Mode)

**Priority:** P2

**As a** user, **I want to** vote for the remaining Star Game fixture **so that** I still have a say in the weekly Star Game selection.

**Acceptance Criteria:**

```gherkin
Given the Star Games session for gameweek [N] is mode = "CHAMPION_PLUS_COMMUNITY"
And a champion-selected fixture exists
When I view the voteable fixtures
Then the champion-selected fixture is not selectable for community voting
And I am instructed: "Pick 1 more fixture to be a Star Game"

Given I have selected 1 fixture
When I submit my vote
Then my vote is recorded (1 vote total for this session)
And I see a confirmation message

Given the voting deadline arrives (2h before first kickoff)
When the system closes voting
Then the champion-selected fixture is set as Star Game #1
And the top voted community fixture (excluding champion-selected) is set as Star Game #2
And resolution_mode is set to "CHAMPION_PLUS_COMMUNITY"
```

---

### US-SGV-15: Hybrid Mode Fallbacks (No Pick / Late Pick)

**Priority:** P2

**As the** system, **I want to** handle cases where the champion doesn't pick in time **so that** Star Games are still determined fairly.

**Acceptance Criteria:**

```gherkin
Given a session is in mode = "CHAMPION_PLUS_COMMUNITY"
And the champion has not made a pick
When the champion_pick_deadline is reached
Then the session automatically switches to mode = "COMMUNITY_VOTE"
And each user is allowed to vote for exactly 2 fixtures (default behavior)
And a banner explains: "Champion didn't pick. Community will select both Star Games."

Given the champion attempts to pick after the champion_pick_deadline
When they submit their pick
Then the request is rejected with HTTP 403 and message "Champion pick window has closed."
```

**Notes:**
- `champion_pick_deadline` can default to the same value as `voting_deadline`, or earlier (e.g., 6h before first kickoff) to avoid last-minute ambiguity.
- Admin override still applies (US-SGV-4).

---

## 2. UI/UX Design Specification

### 2.1 User Voting Interface

**Location:** Integrated into the existing **Fixtures page** (`/fixtures?gw=N`), appearing as a collapsible section above the fixture list when voting is active.

#### Layout — Voting Open (Mobile)

```
┌─────────────────────────────────────────┐
│  Fixtures              GW ◀ 12 ▶        │
├─────────────────────────────────────────┤
│                                         │
│  ┌─────────────────────────────────────┐│
│  │  ⭐ Vote for Star Games             ││
│  │                                     ││
│  │  Pick 2 fixtures to be Star Games   ││
│  │  (2× exact score points!)           ││
│  │                                     ││
│  │  Voting closes in: 1d 4h 23m        ││
│  │                                     ││
│  │  ┌───────────────────────────────┐  ││
│  │  │  ○  Arsenal vs Chelsea        │  ││
│  │  │     Sat 15:00 · 12 votes      │  ││
│  │  └───────────────────────────────┘  ││
│  │  ┌───────────────────────────────┐  ││
│  │  │  ● Liverpool vs Man City  ★   │  ││
│  │  │     Sat 17:30 · 18 votes      │  ││
│  │  └───────────────────────────────┘  ││
│  │  ┌───────────────────────────────┐  ││
│  │  │  ● Spurs vs Man Utd      ★   │  ││
│  │  │     Sun 14:00 · 15 votes      │  ││
│  │  └───────────────────────────────┘  ││
│  │  ┌───────────────────────────────┐  ││
│  │  │  ○  Brighton vs Wolves        │  ││
│  │  │     Sun 14:00 · 6 votes       │  ││
│  │  └───────────────────────────────┘  ││
│  │  ... (remaining fixtures)           ││
│  │                                     ││
│  │  Selected: 2 of 2                   ││
│  │  [ Submit Votes ]  (primary btn)    ││
│  │                                     ││
│  └─────────────────────────────────────┘│
│                                         │
│  ── Fixture Predictions ──              │
│                                         │
│  ┌─────────────────────────────────────┐│
│  │  [Standard FixtureCard]             ││
│  │  Arsenal vs Chelsea                 ││
│  │  ...                                ││
│  └─────────────────────────────────────┘│
│  ...                                    │
└─────────────────────────────────────────┘
```

#### Component Hierarchy

- `FixturesPage`
  - `GameweekSelector` (existing)
  - `StarGameVotingSection` (new — conditional on open session)
    - `VotingHeader` — title, instruction text, countdown timer
    - `VotingFixtureList`
      - `VotingFixtureCard` (per fixture) — team names, crests, kickoff, vote count, selection state
    - `VotingFooter` — selection counter + submit button
  - `FixtureList` (existing — standard prediction fixture cards)

#### Voting Fixture Card States

| State | Visual Treatment |
|-------|-----------------|
| **Unselected** | Default card background (`bg-surface`), hollow circle indicator (○), subtle border |
| **Selected** | Gold left border (`border-l-gold`), filled star indicator (★), gold shimmer background (`bg-gold/5`), checkmark badge |
| **Locked (already voted)** | Show "Your pick ✓" badge in gold, non-interactive until "Change Votes" tapped |
| **Disabled (max reached)** | Slightly muted opacity (0.6) for unselected cards when 2 are already selected |
| **Voting closed** | All cards non-interactive, results overlay with vote counts and percentages |

#### Layout — After Voting (User Has Voted)

```
┌─────────────────────────────────────────┐
│  ⭐ Star Games Vote  ·  GW 12          │
│                                         │
│  Your picks:                            │
│  ★ Liverpool vs Man City                │
│  ★ Spurs vs Man Utd                     │
│                                         │
│  Voting closes in: 1d 4h 23m            │
│  [ Change Votes ]  (secondary btn)      │
└─────────────────────────────────────────┘
```

This is a **collapsed** view. The full voting list is hidden behind the "Change Votes" button to reduce visual noise once the user has voted.

#### Layout — Voting Closed (Results)

```
┌─────────────────────────────────────────┐
│  ⭐ Star Games  ·  GW 12               │
│                                         │
│  ★ Liverpool vs Man City    18 votes    │
│  ★ Spurs vs Man Utd         15 votes    │
│  ┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈  │
│    Arsenal vs Chelsea        12 votes    │
│    Brighton vs Wolves         6 votes    │
│    ...                                  │
│                                         │
│  Your picks: ★ ★  (both selected!)     │
│  ── or ──                               │
│  Your picks: ★ ○  (1 of 2 matched)     │
└─────────────────────────────────────────┘
```

#### Vote Count Visibility

| When | Show Vote Counts? |
|------|-------------------|
| Voting OPEN, user has NOT voted | **No** — prevents bandwagoning; show only after user submits |
| Voting OPEN, user HAS voted | **Yes** — show current tallies as reward for participating |
| Voting CLOSED | **Yes** — full results visible to all |

#### Color & Styling

- Voting card selected state uses `--color-accent` (#FFD600) gold, consistent with existing Star Game badge treatment.
- Submit button uses primary green (`--color-primary`).
- Countdown timer uses warning orange (`--color-warning`) when < 2 hours remain.
- The voting section has a subtle gold top-border glow to distinguish it from the prediction area.

#### Accessibility

- Each voting fixture card is a focusable checkbox (`role="checkbox"`, `aria-checked`).
- Selection counter is announced via `aria-live="polite"`.
- Color is never the only indicator — selected cards also show a filled star icon and "Selected" text.
- Minimum tap target: 48×48px for each card.
- Keyboard: Space/Enter toggles selection; Tab navigates between cards.

---

### 2.2 Admin Control Panel

**Route:** `/admin/star-games` (new admin section)

#### Layout — No Session Exists

```
┌─────────────────────────────────────────┐
│  Admin: Star Games  ·  GW 12           │
│  Season: 2025-2026                      │
│                                         │
│  Gameweek: ◀ 12 ▶                       │
│                                         │
│  No voting session for this gameweek.   │
│                                         │
│  How would you like to set Star Games?  │
│                                         │
│  ┌───────────────────┐  ┌─────────────┐│
│  │  🗳️ Community Vote │  │  ✋ Manual   ││
│  │                   │  │    Pick     ││
│  │  Let users vote   │  │  Choose     ││
│  │  for 2 star games │  │  yourself   ││
│  └───────────────────┘  └─────────────┘│
│                                         │
│  ── Fixtures in GW 12 ──               │
│  1. Arsenal vs Chelsea      Sat 15:00  │
│  2. Liverpool vs Man City   Sat 17:30  │
│  3. Spurs vs Man Utd        Sun 14:00  │
│  4. Brighton vs Wolves      Sun 14:00  │
│  5. Everton vs Newcastle    Sun 16:30  │
│  ...                                   │
└─────────────────────────────────────────┘
```

#### Layout — Session in DRAFT Status

```
┌─────────────────────────────────────────┐
│  Admin: Star Games  ·  GW 12           │
│  Status: DRAFT                          │
│                                         │
│  Voting Deadline:                       │
│  [ Sat 16 Feb, 13:00 ]  ✏️ Edit        │
│  (2h before Arsenal vs Chelsea)         │
│                                         │
│  Candidates: 7 fixtures                 │
│  (Excluding 0 postponed/cancelled)      │
│                                         │
│  [ Open Voting ]  (primary btn)         │
│  [ Delete Session ]  (danger link)      │
└─────────────────────────────────────────┘
```

#### Layout — Session OPEN

```
┌─────────────────────────────────────────┐
│  Admin: Star Games  ·  GW 12           │
│  Status: OPEN  ·  Closes in 1d 4h      │
│                                         │
│  ── Live Vote Tallies ──               │
│  1. Liverpool vs Man City   18 votes ██ │
│  2. Spurs vs Man Utd        15 votes ██ │
│  3. Arsenal vs Chelsea      12 votes █  │
│  4. Brighton vs Wolves       6 votes ▏  │
│  5. Everton vs Newcastle     3 votes ▏  │
│                                         │
│  Total votes: 22 of 28 users (79%)     │
│                                         │
│  ── Individual Votes ──    [Expand ▼]  │
│  Temi → Liverpool, Spurs               │
│  John → Arsenal, Liverpool             │
│  ...                                   │
│                                         │
│  [ Close Voting Early ]  (warning btn) │
└─────────────────────────────────────────┘
```

#### Layout — Session CLOSED (Results Applied)

```
┌─────────────────────────────────────────┐
│  Admin: Star Games  ·  GW 12           │
│  Status: CLOSED                         │
│  Resolution: Community Vote             │
│                                         │
│  ★ Star Games:                          │
│  1. Liverpool vs Man City   18 votes    │
│  2. Spurs vs Man Utd        15 votes    │
│                                         │
│  ── Full Results ──                     │
│  3. Arsenal vs Chelsea      12 votes    │
│  4. Brighton vs Wolves       6 votes    │
│  5. Everton vs Newcastle     3 votes    │
│                                         │
│  Participation: 22/28 users (79%)       │
│                                         │
│  [ Override Star Games ]  (outlined btn)│
│                                         │
│  ── Audit Log ──           [Expand ▼]  │
│  27 Feb 13:00 — Auto-closed by system  │
│  25 Feb 18:30 — Voting opened by admin │
│  25 Feb 18:28 — Session created        │
└─────────────────────────────────────────┘
```

#### Admin Override Modal

```
┌─────────────────────────────────────────┐
│  Override Star Games — GW 12            │
│                                         │
│  Current star games (from vote):        │
│  ★ Liverpool vs Man City                │
│  ★ Spurs vs Man Utd                     │
│                                         │
│  Select new star games (pick 2):        │
│                                         │
│  ☐ Arsenal vs Chelsea                   │
│  ☐ Liverpool vs Man City                │
│  ☐ Spurs vs Man Utd                     │
│  ☐ Brighton vs Wolves                   │
│  ☐ Everton vs Newcastle                 │
│                                         │
│  Override reason (optional):            │
│  [ __________________________ ]         │
│                                         │
│  [ Cancel ]    [ Apply Override ]        │
└─────────────────────────────────────────┘
```

---

### 2.3 Fixture Card Integration

The existing `FixtureCard` component already shows a gold "Star Game" badge. Additional visual states for voting:

| Scenario | Badge / Indicator |
|----------|-------------------|
| Fixture is a star game (existing) | `Badge variant="star"` — "★ Star Game" in gold |
| Voting is open, fixture is voteable | Small "⭐ Vote" indicator in the status row |
| User voted for this fixture | "Your Star Pick ★" mini-badge below the Star Game badge |
| Fixture became star game via community vote | "★ Star Game · Community Pick" (subtle secondary text) |
| Fixture became star game via admin override | "★ Star Game" (no attribution — admin decisions are not publicized to users) |

---

### 2.4 Dashboard Integration

A new `StarGameVoteCard` component on the Dashboard:

```
┌─────────────────────────────────────────┐
│  ⭐ Star Games Vote · GW 12            │
│                                         │
│  Vote for the next Star Games!          │
│  Closes in: 1d 4h 23m                  │
│                                         │
│  [ Vote Now → ]                         │
└─────────────────────────────────────────┘
```

States:
- **Voting open, not voted:** Gold border card, "Vote Now →" CTA
- **Voting open, already voted:** Muted gold card, "Voted ✓ · Change votes →"
- **Voting closed:** Hidden (star games already shown on fixture cards)
- **No session:** Hidden

---

### 2.5 Bottom Nav Consideration

No new bottom nav tab is needed. Star Games voting is accessed through:
1. **Dashboard** → Star Game Vote prompt card → links to Fixtures page
2. **Fixtures page** → Voting section at top of gameweek view

This avoids navigation bloat, keeps the 4-tab structure, and places voting contextually next to the fixtures it relates to.

---

### 2.6 Responsive Behavior

| Breakpoint | Layout Adaptation |
|------------|-------------------|
| **Mobile (0–639px)** | Single column. Voting cards are full-width stacked. Submit button is sticky at bottom of voting section. |
| **Tablet (640–1023px)** | Voting cards in 2-column grid. Submit button inline at bottom. |
| **Desktop (1024px+)** | Voting section is a sidebar panel alongside the fixtures list, or a top section with 3-column card grid. |

---

## 3. Admin Control Specification

### 3.1 Admin Capabilities Matrix

| Capability | Description | Constraints |
|------------|-------------|-------------|
| **Create voting session** | Initialize a voting session for a gameweek | One per season + gameweek. Requires ≥1 fixture in gameweek. |
| **Set deadline** | Adjust the voting deadline (defaults to 2h before first kickoff) | Cannot be in the past. Cannot be after the first kickoff. |
| **Open voting** | Change session from DRAFT → OPEN | Requires ≥3 fixtures and deadline in the future. |
| **Close voting early** | Change session from OPEN → CLOSED | Triggers result calculation immediately. |
| **View live tallies** | See real-time vote counts per fixture | Available when session is OPEN or CLOSED. |
| **View individual votes** | See which user voted for which fixtures | Available when session is OPEN or CLOSED. Expandable section. |
| **Override star games** | Replace community-selected star games with admin picks | Available after session is CLOSED. Requires exactly 2 fixtures (or fewer if gameweek has <2). |
| **Manual pick (skip voting)** | Directly designate star games without community vote | Creates a CLOSED session with resolution_mode = "ADMIN_PICK". |
| **Delete session** | Remove a DRAFT session entirely | Only available in DRAFT status. Cannot delete OPEN or CLOSED sessions. |
| **View audit log** | See complete history of actions on this voting session | Read-only. Includes timestamps, admin who acted, old/new values. |

### 3.2 Admin Workflow: Community Vote

```
┌──────────┐     ┌──────────┐     ┌──────────────┐     ┌──────────────┐
│  Create  │────▶│  DRAFT   │────▶│    OPEN      │────▶│   CLOSED     │
│  Session │     │          │     │  (users vote)│     │  (results    │
└──────────┘     │ Edit     │     │              │     │   applied)   │
                 │ deadline │     │ Close early  │     │              │
                 │ Delete   │     │   or         │     │ Override     │
                 └──────────┘     │ Auto-close   │     │  (optional)  │
                                  └──────────────┘     └──────────────┘
```

### 3.3 Admin Workflow: Manual Pick

```
┌──────────┐     ┌──────────────┐
│  Manual  │────▶│   CLOSED     │
│  Pick    │     │  mode =      │
│ (select 2│     │  ADMIN_PICK  │
│ fixtures)│     │              │
└──────────┘     │ Override     │
                 │  (edit picks)│
                 └──────────────┘
```

### 3.4 Resolution Modes

| Mode | Description | When Used |
|------|-------------|-----------|
| `COMMUNITY_VOTE` | Top 2 voted fixtures became star games | Normal flow — voting closed (auto or manual) with votes present |
| `ADMIN_PICK` | Admin directly selected star games, no voting occurred | Admin chose "Manual Pick" workflow |
| `ADMIN_OVERRIDE` | Admin replaced community-voted star games | Admin used override after community vote |
| `AUTO_ALL` | All fixtures automatically became star games | Gameweek has exactly 2 fixtures |
| `NO_VOTES` | Voting session closed with zero participation | Auto-close triggered with 0 votes |

### 3.5 Audit Trail Requirements

Every admin action on Star Games Voting writes to the existing `admin_audit_log` table:

| Action | target_type | target_id | old_value | new_value |
|--------|-------------|-----------|-----------|-----------|
| `CREATE_STAR_GAME_VOTE_SESSION` | `star_game_vote_session` | session.id | `null` | `{ gameweek, deadline, fixture_count }` |
| `OPEN_STAR_GAME_VOTING` | `star_game_vote_session` | session.id | `{ status: "DRAFT" }` | `{ status: "OPEN" }` |
| `CLOSE_STAR_GAME_VOTING` | `star_game_vote_session` | session.id | `{ status: "OPEN" }` | `{ status: "CLOSED", resolution_mode, star_fixtures }` |
| `OVERRIDE_STAR_GAMES` | `star_game_vote_session` | session.id | `{ star_fixtures: [...old] }` | `{ star_fixtures: [...new], reason }` |
| `MANUAL_STAR_GAME_PICK` | `star_game_vote_session` | session.id | `null` | `{ star_fixtures: [...], resolution_mode: "ADMIN_PICK" }` |
| `DELETE_STAR_GAME_VOTE_SESSION` | `star_game_vote_session` | session.id | `{ gameweek, status }` | `null` |
| `AUTO_CLOSE_STAR_GAME_VOTING` | `star_game_vote_session` | session.id | `{ status: "OPEN" }` | `{ status: "CLOSED", resolution_mode }` |

The `admin_id` field is set to the acting admin's profile ID, or `null` for system-triggered auto-close actions.

---

## 4. Edge Cases & Business Rules

### EC-SGV-1: Fixture Postponed After Being Voted as Star Game

**Scenario:** A fixture receives the most votes and is marked as a star game, but is then postponed before kickoff.

**Rule:**
1. When the fixture sync cron detects `status = 'POSTPONED'`, the system checks if `is_star_game = true`.
2. If yes, `is_star_game` is set to `false` on the postponed fixture.
3. The **3rd-highest voted fixture** (next in line) is promoted to star game automatically.
4. If no 3rd-place fixture exists (e.g., only 3 fixtures total and one postponed), the gameweek has only 1 star game.
5. An audit log entry records: `"STAR_GAME_POSTPONEMENT_REALLOCATION"`.
6. A flag is raised in the admin panel: "Star Game [Fixture] was postponed. [New Fixture] promoted to Star Game."

**When the postponed fixture is rescheduled:**
- It does NOT automatically regain star game status.
- The admin can manually override if desired.
- If rescheduled to a different gameweek, it's treated as a regular fixture in the new gameweek.

---

### EC-SGV-2: Tie-Breaking Rules

**Scenario:** Two or more fixtures have the same number of votes, creating ambiguity for the 2nd star game slot.

**Tie-Breaking Cascade:**

| Priority | Rule | Rationale |
|----------|------|-----------|
| 1 | **Earlier kickoff time** | Fixture with the earlier kickoff wins — deterministic and fair |
| 2 | **Earlier `created_at` timestamp** | If kickoff times are identical, the fixture synced first wins |
| 3 | **Alphabetical by `home_team`** | Final fallback — guaranteed unique |

**Examples:**
- Fixture A (8 votes, Sat 15:00) vs Fixture B (8 votes, Sun 14:00) → **Fixture A wins** (earlier kickoff)
- Fixture A (8 votes, Sat 15:00) vs Fixture B (8 votes, Sat 15:00) → **Earlier `created_at` wins**

**Transparency:** Tie-breaking is logged in the audit trail but NOT displayed to users. Users see the final result.

---

### EC-SGV-3: Minimum Participation Rules

**Rule:** There is **no minimum participation threshold.** Even a single vote is valid.

**Rationale:** The league has ~30 users. Setting a quorum (e.g., 50% must vote) risks having no star games for a gameweek, which degrades the experience. A single vote from an engaged user is still a valid community signal.

**Edge case — zero votes:**
- If the session auto-closes with 0 votes: No star games are set. Resolution mode = `NO_VOTES`.
- Admin is flagged in the panel: "No votes received for GW [N]."
- Admin can manually pick star games after the fact (override).

---

### EC-SGV-4: Admin Doesn't Create a Voting Session

**Scenario:** The admin forgets or chooses not to create a voting session for a gameweek.

**Rule:**
1. If no voting session exists for a gameweek, **no star games are set for that gameweek** (all fixtures scored normally at base points).
2. The admin panel shows a persistent banner for upcoming gameweeks without sessions: "GW [N] has no Star Games set. Create a voting session or manually pick."
3. The admin can create a session and manually pick star games **at any time before the last fixture in the gameweek kicks off**.
4. If the admin creates a community vote session after some fixtures have already kicked off, only fixtures that haven't kicked off are voteable candidates.

**User experience:** Users see fixtures without any star game designation. No voting section appears on the Fixtures page. This is a valid state — not every gameweek must have star games, though it's expected that most will.

---

### EC-SGV-5: Gameweek with Fewer Than 2 Fixtures

**Scenario:** A gameweek has only 1 fixture (e.g., rescheduled match on a midweek slot) or 0 fixtures.

| Fixture Count | Behavior |
|---------------|----------|
| **0 fixtures** | No session can be created. Admin panel shows "No fixtures in this gameweek." |
| **1 fixture** | Admin can mark it as a star game via Manual Pick. No voting occurs (nothing to vote between). Session created with `resolution_mode = "ADMIN_PICK"`. |
| **2 fixtures** | Both automatically become star games. Session created with `resolution_mode = "AUTO_ALL"`, status = "CLOSED". No voting needed. |
| **≥3 fixtures** | Normal voting flow. Community selects 2 from N candidates. |

---

### EC-SGV-6: Fixture Cancelled After Voting

**Scenario:** A fixture is cancelled (permanently, not postponed) after being designated as a star game.

**Rule:**
- Same as postponement (EC-SGV-1): star game status is removed, next-in-line is promoted.
- If the fixture had predictions, those predictions are voided (existing cancellation logic applies).
- The cancelled fixture's votes are preserved in the tally for audit purposes but it's removed from the result set.

---

### EC-SGV-7: Kickoff Time Changes After Session Created

**Scenario:** A fixture's kickoff time is updated by the API sync after a voting session has been created.

**Rules:**

| Change | Impact |
|--------|--------|
| Kickoff moves **earlier** (new time < deadline) | System recalculates the deadline to be 2h before the new earliest kickoff. If the new deadline has **already passed**, voting is auto-closed immediately. Admin is notified. |
| Kickoff moves **later** | Deadline remains unchanged (conservative approach — voting window doesn't automatically extend). Admin can manually adjust if desired. |
| Fixture moves to a **different gameweek** | Fixture is removed from the voting candidates. If this reduces voteable fixtures to <3, admin is notified. Existing votes for this fixture are voided (not counted). |

---

### EC-SGV-8: User Votes Then a Voted Fixture Is Removed

**Scenario:** A user votes for Fixture A and Fixture B. Fixture A is then postponed/cancelled and removed from candidates.

**Rule:**
- The user's vote for Fixture A is **voided** (not counted in tallies).
- The user's vote for Fixture B remains valid.
- The user effectively has 1 vote instead of 2.
- The user is **not required** to re-vote (their partial vote is valid).
- If the user returns to the voting section before the deadline, they see: "One of your picks ([Fixture A]) was removed. You can select a replacement."
- They can optionally select a new 2nd fixture.

---

### EC-SGV-9: Concurrent Admin Override and Auto-Close Race Condition

**Scenario:** The admin is in the process of closing voting at the exact moment the cron auto-close triggers.

**Rule:**
- The closing operation uses an optimistic concurrency check: `UPDATE ... WHERE status = 'OPEN'`.
- Only one of the two operations will succeed (the first to commit).
- The second gets a "session already closed" result and is a no-op.
- Both admin manual close and cron auto-close produce the same result (top 2 voted → star games), so the outcome is identical regardless of which wins.

---

### EC-SGV-10: Double Gameweek Interaction

**Scenario:** A double gameweek has 12+ fixtures instead of the usual 10.

**Rule:**
- Voting works identically. Users still pick exactly 2 star games from the larger pool.
- The admin creates a single voting session for the gameweek, which includes all fixtures.
- More fixtures means votes are more dispersed, which is fine — the top 2 still win.

---

### EC-SGV-11: User Votes for a Fixture They Haven't Predicted

**Rule:** Star Games voting and score predictions are **completely independent**.
- A user can vote for a fixture without having predicted its score.
- A user can predict a fixture's score without having voted for it as a star game.
- There is no requirement to predict in order to vote, or vice versa.

---

### EC-SGV-12: Season Boundary — Last Gameweek

**Scenario:** The last gameweek of the season.

**Rule:** No special treatment. Voting works identically for the final gameweek. After the final gameweek's star games are resolved, no further voting sessions are created.

---

### EC-SGV-13: Mid-Session Admin Adds/Removes Fixtures

**Scenario:** A new fixture is added to the gameweek (via API sync) while voting is already OPEN.

**Rules:**
- **New fixture added:** Automatically becomes a voteable candidate. Users who haven't voted yet see it. Users who already voted are not affected (their votes stand). The new fixture starts with 0 votes.
- **Fixture removed (postponed/cancelled):** Handled per EC-SGV-8. Existing votes for that fixture are voided.

---

## 5. Database Schema (New Tables)

### 5.1 `star_game_vote_sessions`

| Column | Type | Constraints | Default | Description |
|--------|------|-------------|---------|-------------|
| `id` | `uuid` | PK | `gen_random_uuid()` | Session ID |
| `season_id` | `uuid` | NOT NULL, FK → `seasons(id)` | — | Season reference |
| `gameweek` | `integer` | NOT NULL, CHECK (1–50) | — | Gameweek number |
| `status` | `text` | NOT NULL, CHECK | `'DRAFT'` | DRAFT, OPEN, CLOSED |
| `deadline` | `timestamptz` | NOT NULL | — | Voting deadline (auto: 2h before first kickoff) |
| `resolution_mode` | `text` | CHECK | `null` | COMMUNITY_VOTE, ADMIN_PICK, ADMIN_OVERRIDE, AUTO_ALL, NO_VOTES |
| `created_at` | `timestamptz` | NOT NULL | `now()` | Creation timestamp |
| `updated_at` | `timestamptz` | NOT NULL | `now()` | Last update timestamp |

**Constraints:**
- `UNIQUE (season_id, gameweek)` — one session per gameweek per season
- `CHECK (status IN ('DRAFT', 'OPEN', 'CLOSED'))`
- `CHECK (resolution_mode IS NULL OR resolution_mode IN ('COMMUNITY_VOTE', 'ADMIN_PICK', 'ADMIN_OVERRIDE', 'AUTO_ALL', 'NO_VOTES'))`

**Indexes:**
- `idx_sgv_sessions_season_gw`: `(season_id, gameweek)`
- `idx_sgv_sessions_status`: `(status)` WHERE `status = 'OPEN'` (for cron query)

### 5.2 `star_game_votes`

| Column | Type | Constraints | Default | Description |
|--------|------|-------------|---------|-------------|
| `id` | `uuid` | PK | `gen_random_uuid()` | Vote ID |
| `session_id` | `uuid` | NOT NULL, FK → `star_game_vote_sessions(id)` ON DELETE CASCADE | — | Voting session |
| `user_id` | `uuid` | NOT NULL, FK → `profiles(id)` ON DELETE CASCADE | — | Voting user |
| `fixture_id` | `uuid` | NOT NULL, FK → `fixtures(id)` ON DELETE CASCADE | — | Voted fixture |
| `voted_at` | `timestamptz` | NOT NULL | `now()` | When vote was cast |

**Constraints:**
- `UNIQUE (session_id, user_id, fixture_id)` — one vote per user per fixture per session
- A CHECK or application-level constraint ensures max 2 votes per user per session

**Indexes:**
- `idx_sgv_votes_session`: `(session_id)`
- `idx_sgv_votes_user`: `(user_id)`
- `idx_sgv_votes_fixture`: `(fixture_id)`
- `idx_sgv_votes_session_user`: `(session_id, user_id)` — for efficient "get my votes" query

**Application-Level Constraint (enforced in server action):**
```sql
-- Before inserting, check:
SELECT COUNT(*) FROM star_game_votes
WHERE session_id = $1 AND user_id = $2;
-- Must be < 2
```

### 5.3 RLS Policies

| Table | Policy | Operation | Check |
|-------|--------|-----------|-------|
| `star_game_vote_sessions` | `sgv_sessions_select_all` | SELECT | `true` (all authenticated) |
| `star_game_vote_sessions` | `sgv_sessions_insert_admin` | INSERT | Admin check |
| `star_game_vote_sessions` | `sgv_sessions_update_admin` | UPDATE | Admin check |
| `star_game_votes` | `sgv_votes_select_own` | SELECT | `auth.uid() = user_id` |
| `star_game_votes` | `sgv_votes_select_admin` | SELECT | Admin check |
| `star_game_votes` | `sgv_votes_insert_own` | INSERT | `auth.uid() = user_id` AND session is OPEN AND deadline not passed |
| `star_game_votes` | `sgv_votes_update_own` | UPDATE | `auth.uid() = user_id` AND session is OPEN AND deadline not passed |
| `star_game_votes` | `sgv_votes_delete_own` | DELETE | `auth.uid() = user_id` AND session is OPEN AND deadline not passed |

### 5.4 Helper Functions

```sql
-- Check if star game voting is open for a session
CREATE OR REPLACE FUNCTION public.is_star_game_voting_open(p_session_id uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.star_game_vote_sessions
    WHERE id = p_session_id
      AND status = 'OPEN'
      AND deadline > now()
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Get vote tallies for a session
CREATE OR REPLACE FUNCTION public.get_star_game_vote_results(p_session_id uuid)
RETURNS TABLE (
  fixture_id uuid,
  home_team text,
  away_team text,
  kickoff_time timestamptz,
  vote_count bigint,
  rank bigint
) AS $$
  SELECT
    f.id AS fixture_id,
    f.home_team,
    f.away_team,
    f.kickoff_time,
    COUNT(v.id) AS vote_count,
    ROW_NUMBER() OVER (
      ORDER BY COUNT(v.id) DESC, f.kickoff_time ASC, f.created_at ASC
    ) AS rank
  FROM public.fixtures f
  LEFT JOIN public.star_game_votes v ON v.fixture_id = f.id AND v.session_id = p_session_id
  WHERE f.season_id = (SELECT season_id FROM public.star_game_vote_sessions WHERE id = p_session_id)
    AND f.gameweek = (SELECT gameweek FROM public.star_game_vote_sessions WHERE id = p_session_id)
    AND f.status NOT IN ('POSTPONED', 'CANCELLED')
  GROUP BY f.id, f.home_team, f.away_team, f.kickoff_time, f.created_at
  ORDER BY vote_count DESC, f.kickoff_time ASC, f.created_at ASC;
$$ LANGUAGE sql SECURITY DEFINER STABLE;
```

---

## 6. API / Cron Endpoints

### 6.1 Auto-Close Cron

**Endpoint:** `POST /api/cron/close-star-votes`
**Schedule:** Every 15 minutes
**Auth:** `CRON_SECRET` header (same pattern as existing cron jobs)

**Logic:**
1. Query all `star_game_vote_sessions` where `status = 'OPEN'` AND `deadline <= now()`.
2. For each expired session:
   a. Call `get_star_game_vote_results(session_id)`.
   b. If votes exist: set top 2 fixtures as `is_star_game = true`, clear others in that gameweek.
   c. If no votes: set `resolution_mode = 'NO_VOTES'`.
   d. Update session status to `CLOSED`.
   e. Write audit log entry.
3. Return count of sessions processed.

### 6.2 Fixture Sync Integration

The existing fixture sync cron (`/api/cron/sync-fixtures`) should be extended:
- When a fixture's status changes to `POSTPONED` or `CANCELLED`:
  - Check if `is_star_game = true`. If so, trigger star game reallocation (EC-SGV-1).
  - Check if fixture has votes in an OPEN session. If so, void those votes.
- When a fixture's `kickoff_time` changes:
  - Check if there's an OPEN session for that gameweek. If the new kickoff is earlier and moves the deadline, recalculate (EC-SGV-7).

---

## 7. Summary of Changes to Existing System

| Area | Change | Impact |
|------|--------|--------|
| **`fixtures` table** | No schema change — `is_star_game` and `manually_overridden` already exist | None |
| **Scoring engine** | No change — already reads `is_star_game` from fixtures | None |
| **Fixture cards** | Minor enhancement — show "Community Pick" text for voted star games | Low |
| **Admin panel** | New section: `/admin/star-games` | Medium |
| **Fixtures page** | New voting section above fixture list | Medium |
| **Dashboard** | New `StarGameVoteCard` component | Low |
| **Cron jobs** | New `/api/cron/close-star-votes` endpoint | Low |
| **Fixture sync cron** | Extended to handle star game reallocation on postponement | Low |
| **Navigation** | Admin nav gets new "Star Games" link | Minimal |
| **Database** | 2 new tables: `star_game_vote_sessions`, `star_game_votes` | Medium |

---

## 8. Out of Scope

- **Notifications/push alerts** for voting deadlines (Phase 3)
- **Historical voting analytics** across seasons (Phase 3)
- **Gamification of voting accuracy** (e.g., "You picked 80% of star games correctly") (Phase 3)
- **Weighted votes** (e.g., top-ranked users' votes count more) — explicitly excluded to keep voting egalitarian
- **Anonymous voting** — admin can always see who voted for what (small league, transparency)
