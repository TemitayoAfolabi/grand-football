# Grand Football — User Stories

> **Document Owner:** Strategy & Design Agent
> **Last Updated:** 2026-02-27
> **Status:** Final (MVP)
>
> **Priority Key:**
> - **P0** — Must have for MVP launch
> - **P1** — Should have (implement if time permits before launch)
> - **P2** — Nice to have / Phase 2

---

## Epic 1: Authentication & User Management

### US-1.1: Invite-Only Registration

**Priority:** P0

**As an** admin, **I want to** pre-approve a list of email addresses so that **only** invited users can access the app.

**Description:**
The admin maintains an allowlist of ~30 email addresses in the database. Only users whose email appears on this list can complete authentication. Uninvited users see a clear rejection message.

**Acceptance Criteria:**

```gherkin
Given an allowlist of approved email addresses exists in the database
When a user attempts to sign in with an email NOT on the allowlist
Then the system rejects authentication
And displays the message "This league is invite-only. Contact the admin to request access."

Given an allowlist of approved email addresses exists in the database
When a user attempts to sign in with an email that IS on the allowlist
Then the system allows authentication to proceed

Given the admin adds a new email to the allowlist
When that user signs in for the first time
Then a user profile is created with default display name = email prefix
And the user is prompted to set a display name
```

**Edge Cases:**
- Email matching must be case-insensitive (`John@Example.com` == `john@example.com`)
- If the admin removes an email from the allowlist, the user's existing session is not terminated, but they cannot sign in again after session expiry
- Duplicate email entries in the allowlist must be prevented

---

### US-1.2: Magic Link Authentication

**Priority:** P0

**As a** user, **I want to** sign in via a magic link sent to my email so that I don't need to remember a password.

**Acceptance Criteria:**

```gherkin
Given I am an approved user
When I enter my email and tap "Send Magic Link"
Then I receive an email within 60 seconds containing a one-time sign-in link
And the link expires after 10 minutes

Given I have received a magic link email
When I tap the link within 10 minutes
Then I am authenticated and redirected to the Dashboard

Given I have received a magic link email
When I tap the link after 10 minutes
Then I see an "Expired link" message with an option to request a new one
```

**Edge Cases:**
- If the user requests multiple magic links, only the most recent one should be valid
- Magic links must be single-use (tapping a second time shows "Link already used")

---

### US-1.3: Google OAuth Sign-In

**Priority:** P0

**As a** user, **I want to** sign in with my Google account so that authentication is fast and familiar.

**Acceptance Criteria:**

```gherkin
Given I am on the sign-in screen
When I tap "Sign in with Google"
Then I am redirected to Google's OAuth consent screen

Given I have completed Google OAuth
And my Google account email is on the allowlist
When the OAuth callback is processed
Then I am authenticated and redirected to the Dashboard

Given I have completed Google OAuth
And my Google account email is NOT on the allowlist
When the OAuth callback is processed
Then I see the message "This league is invite-only. Contact the admin to request access."
And no user profile is created
```

**Edge Cases:**
- If a user previously signed in with magic link and later uses Google with the same email, the accounts must be linked (same user profile)

---

### US-1.4: User Profile Setup

**Priority:** P1

**As a** user, **I want to** set a display name so that the leaderboard shows a recognizable name instead of my email.

**Acceptance Criteria:**

```gherkin
Given I am a first-time user
When I complete authentication
Then I am shown a profile setup screen with a display name field pre-filled with my email prefix

Given I am on the profile setup screen
When I enter a display name (3–20 characters, alphanumeric + spaces)
And tap "Save"
Then my display name is stored and used across the app

Given I want to change my display name later
When I navigate to Settings and edit my display name
Then the new name is reflected on the leaderboard and all views
```

**Edge Cases:**
- Display names do not need to be unique (two users can both be "Temi")
- Profanity filtering is out of scope for MVP
- If a user skips profile setup, their display name defaults to email prefix

---

### US-1.5: Session Management

**Priority:** P0

**As a** user, **I want** my session to persist so that I don't have to sign in every time I open the app.

**Acceptance Criteria:**

```gherkin
Given I have authenticated
When I close the browser/app and reopen it within 30 days
Then I am still authenticated and see the Dashboard

Given my session has been inactive for more than 30 days
When I open the app
Then I am redirected to the sign-in screen

Given I tap "Sign Out" in settings
When the sign-out process completes
Then my session is cleared and I am redirected to the sign-in screen
```

---

## Epic 2: Fixture Management

### US-2.1: Auto-Fetch Premier League Fixtures

**Priority:** P0

**As a** system, **I want to** automatically fetch Premier League fixtures from an external API so that users always see up-to-date match schedules.

**Acceptance Criteria:**

```gherkin
Given the Vercel cron job runs every 6 hours
When the job executes
Then it fetches fixtures for the current season from football-data.org (or equivalent)
And upserts them into the fixtures table (create new, update existing)
And stores: home_team, away_team, kickoff_time, status, gameweek, api_fixture_id

Given a fixture's status changes in the API (e.g., SCHEDULED → IN_PLAY → FINISHED)
When the next sync runs
Then the fixture status is updated in the database

Given a fixture's score is available (status = FINISHED)
When the sync runs
Then home_score and away_score are updated
And a "score_confirmed" event is triggered for the scoring engine
```

**Edge Cases:**
- If the external API is unavailable, the cron job logs the error and retries on the next scheduled run. No fixtures are deleted.
- If the API returns data that conflicts with manually overridden data (see US-7.3), the manual override takes precedence (a flag `manually_overridden = true` prevents API updates).
- Timezone handling: all kickoff times stored as UTC.

---

### US-2.2: View Upcoming Fixtures

**Priority:** P0

**As a** user, **I want to** see a list of upcoming Premier League fixtures so that I know which matches to predict.

**Acceptance Criteria:**

```gherkin
Given I am authenticated
When I navigate to the Fixtures screen
Then I see fixtures grouped by gameweek
And each fixture shows: home team, away team, kickoff date/time (in my local timezone), prediction status (Predicted / Not Predicted)

Given there are fixtures in multiple gameweeks
When I view the Fixtures screen
Then the current/next gameweek is shown by default
And I can navigate to past or future gameweeks

Given a fixture is a Star Game
When it appears in the fixture list
Then it is visually distinguished with a star icon AND a text label "Star Game"
```

**Edge Cases:**
- If no fixtures are available (off-season), show an empty state: "No upcoming fixtures. Check back when the season starts!"
- Fixtures in the past (already finished) show the final score and the user's prediction

---

### US-2.3: Real-Time Fixture Status

**Priority:** P1

**As a** user, **I want to** see live match status updates so that I know when matches are in progress and when results are final.

**Acceptance Criteria:**

```gherkin
Given a match is in progress (status = IN_PLAY or PAUSED)
When I view the fixture
Then I see a "LIVE" badge
And the current score (updated every 5 minutes via polling or Supabase Realtime)

Given a match has finished (status = FINISHED)
When I view the fixture
Then I see the final score
And my prediction points are displayed next to it
```

---

## Epic 3: Predictions

### US-3.1: Submit a Prediction

**Priority:** P0

**As a** user, **I want to** predict the score for an upcoming match so that I can earn points.

**Acceptance Criteria:**

```gherkin
Given I am viewing an upcoming fixture (status = SCHEDULED, kickoff_time > NOW)
When I tap on the fixture
Then I see input fields for home goals and away goals (numeric, 0–99)

Given I have entered a valid prediction (both home and away goals)
When I tap "Save Prediction"
Then the prediction is saved with a submitted_at timestamp
And the fixture shows "Predicted ✓" in the list
And I see a confirmation message "Prediction saved!"

Given I have NOT entered both scores
When I tap "Save Prediction"
Then I see a validation error: "Please enter both home and away scores"
```

**Edge Cases:**
- Goals must be non-negative integers (0–99). Decimal values and negative numbers are rejected.
- If the user enters a score like "15-12," the system accepts it — no plausibility check in MVP.

---

### US-3.2: Edit a Prediction

**Priority:** P0

**As a** user, **I want to** edit my prediction before kickoff so that I can change my mind.

**Acceptance Criteria:**

```gherkin
Given I have a saved prediction for a fixture
And the fixture's kickoff_time > NOW
When I navigate to that fixture
Then I see my current prediction pre-filled in the input fields
And I can modify and save the updated prediction

Given I have a saved prediction for a fixture
And the fixture's kickoff_time > NOW
When I save an updated prediction
Then the submitted_at timestamp is updated to the current time
And a prediction history record is created (for audit purposes)
```

---

### US-3.3: Prediction Lock at Kickoff

**Priority:** P0

**As a** user, **I want** predictions to lock at kickoff so that the game is fair for everyone.

**Acceptance Criteria:**

```gherkin
Given a fixture's kickoff_time has passed (NOW >= kickoff_time)
When I try to submit or edit a prediction for that fixture
Then the input fields are disabled/read-only
And I see the message "Predictions locked — match has started"

Given I am editing a prediction
And kickoff occurs while I am on the prediction screen
When I tap "Save Prediction"
Then the save is rejected
And I see the message "Sorry, predictions locked — match has kicked off"

Given I am viewing the prediction form
When the fixture is within 15 minutes of kickoff
Then I see a warning: "Locks in X minutes" (countdown)
```

**Edge Cases:**
- The lock time is determined by the server clock, not the client clock, to prevent manipulation.
- If kickoff time is updated by the API (e.g., delayed start), the lock time updates accordingly.

---

### US-3.4: Bulk Prediction Entry

**Priority:** P1

**As a** user, **I want to** submit predictions for all fixtures in a gameweek on one screen so that it's quick and convenient.

**Acceptance Criteria:**

```gherkin
Given I am viewing a gameweek
When I tap "Predict All"
Then I see a form with all unpredicted fixtures for that gameweek
And I can enter scores for each fixture inline

Given I have filled in predictions for some (not all) fixtures in the bulk form
When I tap "Save All"
Then only the completed predictions (both home and away filled) are saved
And incomplete entries are left unsaved with a subtle indicator
```

---

## Epic 4: Scoring Engine

### US-4.1: Auto-Calculate Match Points

**Priority:** P0

**As a** system, **I want to** automatically calculate points when a match finishes so that the leaderboard is always up-to-date.

**Description:**
When a fixture status changes to FINISHED and both actual scores are available, the scoring engine runs for every user who submitted a prediction for that fixture.

**Scoring Rules:**

| Scenario | Condition | Points | `reason_code` |
|----------|-----------|--------|----------------|
| Exact Score | `predicted_home == actual_home AND predicted_away == actual_away` | 5 | `EXACT_SCORE` |
| Correct Outcome | Predicted outcome (W/D/L) matches actual outcome, but not exact score | 3 | `OUTCOME` |
| BTTS Reverse | Predicted outcome ≠ actual outcome AND all four scores > 0 | 1 | `BTTS_REVERSE` |
| Wrong | None of the above | 0 | `WRONG` |
| Star Exact | Star Game AND exact score | 10 | `STAR_EXACT` |
| Star Outcome | Star Game AND correct outcome (not exact) | 3 | `STAR_OUTCOME` |
| Star BTTS Reverse | Star Game AND BTTS Reverse conditions met | 1 | `STAR_BTTS_REVERSE` |
| Star Wrong | Star Game AND wrong | 0 | `STAR_WRONG` |
| No Prediction | User did not submit a prediction | 0 | `NO_PREDICTION` |

**Acceptance Criteria:**

```gherkin
Given a fixture has status = FINISHED with actual scores
When the scoring engine runs
Then for each user with a prediction for this fixture:
  - Points are calculated according to the scoring rules
  - A score_record is created with: user_id, fixture_id, points, reason_code, predicted_home, predicted_away, actual_home, actual_away, is_star_game, calculated_at

Given a user predicted 2-1 and the actual score is 2-1 (non-star game)
When points are calculated
Then the user receives 5 points with reason_code = EXACT_SCORE

Given a user predicted 3-1 and the actual score is 2-0 (non-star game)
When points are calculated
Then the user receives 3 points with reason_code = OUTCOME
(Both predict home win → correct outcome)

Given a user predicted 2-1 and the actual score is 1-3 (non-star game)
When points are calculated
Then the user receives 1 point with reason_code = BTTS_REVERSE
(Predicted home win, actual away win, but both predicted scores > 0 and both actual scores > 0)

Given a user predicted 2-0 and the actual score is 1-3 (non-star game)
When points are calculated
Then the user receives 0 points with reason_code = WRONG
(Predicted away = 0, so BTTS Reverse does not apply)

Given a star game where user predicted 2-1 and actual is 2-1
When points are calculated
Then the user receives 10 points with reason_code = STAR_EXACT

Given a star game where user predicted 3-1 and actual is 2-0
When points are calculated
Then the user receives 3 points with reason_code = STAR_OUTCOME

Given a user did not submit a prediction for a finished fixture
When points are calculated
Then a score_record is created with 0 points and reason_code = NO_PREDICTION
```

**Edge Cases:**
- Scoring must be idempotent: running the engine twice for the same fixture produces the same result (upsert, not duplicate insert)
- If a fixture result is corrected (e.g., API initially reports wrong score), recalculation must be possible (see US-7.4)
- Score = 0-0 actual: BTTS Reverse cannot apply (actual_home = 0 and actual_away = 0)

---

### US-4.2: Score Breakdown Storage

**Priority:** P0

**As a** system, **I want to** store a detailed breakdown for every score calculation so that there is a full audit trail.

**Acceptance Criteria:**

```gherkin
Given the scoring engine has calculated points for a user-fixture pair
When the score_record is stored
Then it includes ALL of the following fields:
  - id (unique)
  - user_id
  - fixture_id
  - predicted_home
  - predicted_away
  - actual_home
  - actual_away
  - is_star_game (boolean)
  - points_awarded
  - reason_code (EXACT_SCORE | OUTCOME | BTTS_REVERSE | WRONG | STAR_EXACT | STAR_OUTCOME | STAR_BTTS_REVERSE | STAR_WRONG | NO_PREDICTION)
  - calculated_at (timestamp)
```

---

## Epic 5: Leaderboards

### US-5.1: Season Leaderboard

**Priority:** P0

**As a** user, **I want to** see the season leaderboard so that I know my ranking among all players.

**Acceptance Criteria:**

```gherkin
Given I am authenticated
When I navigate to the Leaderboard screen
Then I see a table/list showing all users ranked by total season points (descending)
And each row shows: rank, display name, total points, number of exact scores, number of correct outcomes

Given two users have the same total points
When the leaderboard is rendered
Then tie-breaking is applied in order:
  1. Most exact scores (higher = better)
  2. Most correct outcomes (higher = better)
  3. Fewest 0-point matches (lower = better)
And if still tied, they share the same rank

Given I am viewing the leaderboard
When I find my own row
Then it is visually highlighted (e.g., distinct background color AND a "You" label for accessibility)
```

**Edge Cases:**
- If a user has no predictions at all, they appear at the bottom with 0 points
- The leaderboard updates within 5 minutes of a match finishing

---

### US-5.2: Monthly Leaderboard

**Priority:** P0

**As a** user, **I want to** see a monthly leaderboard so that I can track performance over a shorter time period.

**Acceptance Criteria:**

```gherkin
Given I navigate to the Monthly Leaderboard tab
When I select a month (default = current month)
Then I see users ranked by points earned in that month only (including monthly bonus if awarded)

Given the month has ended
When the monthly bonus has been calculated
Then eligible users show "+10 bonus" next to their monthly total
And ineligible users show "No bonus — missed X fixture(s)"

Given I want to view a past month
When I select a different month from the dropdown
Then the leaderboard updates to show that month's rankings
```

---

### US-5.3: Leaderboard Position Change Indicator

**Priority:** P2

**As a** user, **I want to** see how my leaderboard position has changed since the last gameweek so that I can track momentum.

**Acceptance Criteria:**

```gherkin
Given the leaderboard is displayed
When a user's rank has improved since last gameweek
Then an upward arrow indicator AND text "(+N)" is shown

Given a user's rank has dropped
When the leaderboard is displayed
Then a downward arrow AND text "(-N)" is shown

Given a user's rank is unchanged
When the leaderboard is displayed
Then a dash "—" or "no change" indicator is shown
```

---

## Epic 6: Match Detail / Transparency

### US-6.1: Match Detail View

**Priority:** P0

**As a** user, **I want to** see the full detail of a finished match — including the actual score, my prediction, points awarded, and the rule that was applied — so that scoring is transparent.

**Acceptance Criteria:**

```gherkin
Given I tap on a finished fixture
When the Match Detail screen loads
Then I see:
  - Match: Home Team vs Away Team
  - Actual Score: X - Y
  - My Prediction: A - B (or "No prediction submitted")
  - Points Awarded: N
  - Rule Applied: human-readable explanation (e.g., "Exact Score — you nailed it! +5 points")
  - Star Game indicator (if applicable)

Given the match was a Star Game
When I view the detail
Then I see a "⭐ Star Game" label
And the rule explanation reflects Star Game scoring (e.g., "Star Game Exact Score — +10 points")

Given I did not submit a prediction
When I view the match detail
Then I see "No prediction submitted — 0 points"
```

**Edge Cases:**
- If scoring has not yet been calculated (e.g., match just finished), show "Points pending calculation…"

---

### US-6.2: Rule Explanation Tooltips

**Priority:** P1

**As a** user, **I want to** see a brief explanation of each scoring rule so that I understand how points work without reading external documentation.

**Acceptance Criteria:**

```gherkin
Given I am on the Match Detail screen
When I tap an info icon next to the rule applied
Then I see a tooltip/modal explaining the rule in plain English

Given I am a new user
When I navigate to a "How Scoring Works" page (linked from the nav)
Then I see a complete table of all scoring rules with examples
```

---

## Epic 7: Admin Tools

### US-7.1: Designate Star Games

**Priority:** P0

**As an** admin, **I want to** designate a fixture as a Star Game so that it carries special scoring weight.

**Acceptance Criteria:**

```gherkin
Given I am the admin and viewing the fixture list in the Admin panel
When I toggle the "Star Game" switch on a fixture that has NOT yet kicked off
Then the fixture is marked as a Star Game
And all users see the star indicator on that fixture immediately

Given I try to toggle Star Game on a fixture that has already kicked off
When I interact with the toggle
Then the toggle is disabled
And I see a tooltip: "Cannot change Star Game status after kickoff"

Given a fixture is currently marked as a Star Game (pre-kickoff)
When I toggle it OFF
Then the Star Game designation is removed
And users no longer see the star indicator
```

**Edge Cases:**
- If a Star Game is un-starred after a user has seen it but before kickoff, predictions are unaffected (the user may have predicted differently based on star status — this is accepted in MVP)

---

### US-7.2: Admin Dashboard

**Priority:** P0

**As an** admin, **I want** a simple admin dashboard so that I can manage the league efficiently.

**Acceptance Criteria:**

```gherkin
Given I am the admin
When I navigate to /admin
Then I see sections for:
  - User Management (view approved users, add/remove emails from allowlist)
  - Fixture Management (view fixtures, toggle Star Games)
  - Scoring (trigger recalculation, view score audit log)
  - Season Management (start new season)

Given I am a non-admin user
When I try to navigate to /admin
Then I am redirected to the Dashboard with no error message
(The admin link does not appear in non-admin navigation)
```

---

### US-7.3: Manually Override Fixture Result

**Priority:** P0

**As an** admin, **I want to** manually override a fixture result so that I can correct errors from the external API.

**Acceptance Criteria:**

```gherkin
Given I am the admin
When I select a fixture and tap "Override Result"
Then I can enter the correct home and away scores
And tap "Save Override"

Given I save an override
When the override is processed
Then the fixture is flagged as manually_overridden = true
And the scoring engine is automatically re-triggered for that fixture
And all affected score_records are recalculated
And a log entry is created: "Fixture #123 overridden by admin. Old: 2-1, New: 2-2, at [timestamp]"

Given a fixture has been manually overridden
When the next API sync runs
Then the fixture's score is NOT overwritten by the API data
```

---

### US-7.4: Recalculate Points

**Priority:** P0

**As an** admin, **I want to** trigger a recalculation of points for a specific fixture (or all fixtures) so that I can fix any scoring errors.

**Acceptance Criteria:**

```gherkin
Given I am the admin
When I tap "Recalculate" on a specific fixture
Then the scoring engine re-runs for that fixture
And all score_records are updated (upserted) accordingly
And the leaderboard reflects the updated totals

Given I tap "Recalculate All"
When the process completes
Then every finished fixture's scores are recalculated
And a summary is shown: "Recalculated X fixtures. Y score records updated."
```

---

### US-7.5: Start New Season

**Priority:** P1

**As an** admin, **I want to** start a new season so that the league resets for the new Premier League season.

**Acceptance Criteria:**

```gherkin
Given I am the admin
When I tap "Start New Season"
Then I see a confirmation dialog: "This will archive the current season and reset the leaderboard. Are you sure?"

Given I confirm
When the new season is created
Then a new season record is created (e.g., "2026-2027")
And the previous season's data is archived (not deleted)
And the leaderboard resets to 0 for all users
And fixtures for the new season begin syncing
```

---

### US-7.6: Manage User Allowlist

**Priority:** P0

**As an** admin, **I want to** add and remove users from the allowlist so that I control who has access.

**Acceptance Criteria:**

```gherkin
Given I am in the Admin > User Management section
When I enter an email address and tap "Add User"
Then the email is added to the allowlist
And the user can now sign in

Given I select a user and tap "Remove"
When I confirm the removal
Then the email is removed from the allowlist
And the user can no longer sign in (after session expiry)
And their historical data (predictions, scores) is retained
```

---

## Epic 8: Monthly Bonus

### US-8.1: Automatic Monthly Bonus Calculation

**Priority:** P0

**As a** system, **I want to** automatically calculate monthly bonuses on the 1st of each month so that eligible users receive their +10 points.

**Acceptance Criteria:**

```gherkin
Given it is the 1st of a new month (Vercel cron job)
When the monthly bonus job runs for the previous month
Then for each user:
  - Count fixtures in that month where status = FINISHED
  - Count predictions submitted by the user for those fixtures
  - If predictions count == fixtures count → award +10 bonus
  - If predictions count < fixtures count → no bonus
  - Store a monthly_bonus record: user_id, month, eligible (boolean), bonus_points, fixtures_total, predictions_total

Given a user submitted predictions for all 20 fixtures in January
When the January bonus is calculated
Then the user receives +10 bonus points
And the monthly leaderboard for January includes this bonus

Given a user missed 1 out of 20 fixtures in January
When the January bonus is calculated
Then the user receives 0 bonus points
And the monthly leaderboard shows "Missed 1 fixture(s) — no bonus"
```

**Edge Cases:**
- If a fixture is postponed out of the month, it is excluded from the count for that month (see [edge-cases.md](edge-cases.md))
- The bonus job should be idempotent (running it twice for the same month produces the same result)
- If a fixture result is overridden AFTER the bonus was calculated, the bonus is not automatically recalculated (admin can trigger manually if needed)

---

### US-8.2: Monthly Bonus Visibility

**Priority:** P0

**As a** user, **I want to** see whether I'm on track for the monthly bonus so that I can ensure I don't miss any fixtures.

**Acceptance Criteria:**

```gherkin
Given it is mid-month
When I view the Dashboard or Monthly Leaderboard
Then I see a "Monthly Bonus Tracker" showing:
  - "X / Y fixtures predicted this month"
  - If X == Y: "On track for +10 bonus ✓"
  - If X < Y: "Bonus at risk — you missed N fixture(s)"

Given all fixtures for the month have concluded and bonuses have been calculated
When I view the Monthly Leaderboard
Then I see my bonus status: "Earned +10 bonus" or "Missed bonus (missed N fixture(s))"
```

---

## Story Map Summary

| Epic | P0 Stories | P1 Stories | P2 Stories |
|------|-----------|-----------|-----------|
| 1. Auth & User Mgmt | US-1.1, US-1.2, US-1.3, US-1.5 | US-1.4 | — |
| 2. Fixture Mgmt | US-2.1, US-2.2 | US-2.3 | — |
| 3. Predictions | US-3.1, US-3.2, US-3.3 | US-3.4 | — |
| 4. Scoring Engine | US-4.1, US-4.2 | — | — |
| 5. Leaderboards | US-5.1, US-5.2 | — | US-5.3 |
| 6. Match Detail | US-6.1 | US-6.2 | — |
| 7. Admin Tools | US-7.1, US-7.2, US-7.3, US-7.4, US-7.6 | US-7.5 | — |
| 8. Monthly Bonus | US-8.1, US-8.2 | — | — |

**Total:** 22 user stories (17 P0, 4 P1, 1 P2)

---

## Phase 2 Backlog: Gameweek Engagement (Fun + Social)

This section is intentionally **out of MVP scope**. It focuses on making each gameweek feel like a mini-event: something to do before kickoff, during matches, and after the gameweek ends.

### US-9.1: Gameweek Leaderboard + Champion

**Priority:** P2

**As a** user, **I want to** see a gameweek leaderboard and winner **so that** every week has its own bragging rights (even if I'm behind on the season table).

**Acceptance Criteria:**

```gherkin
Given gameweek [N] has at least 1 finished fixture
When I view the Gameweek leaderboard
Then I see users ranked by points earned in gameweek [N] only
And each row shows: rank, display name, GW points, GW exact scores

Given the gameweek has completed
When I view the leaderboard
Then the Gameweek Champion is highlighted
And the app shows "Champion: [Display Name] (+[Points])"
```

---

### US-9.2: Team of the Week (Weekly Highlight Card)

**Priority:** P2

**As a** user, **I want to** see a "Team of the Week" style highlight **so that** each gameweek has a fun recap moment.

**Acceptance Criteria:**

```gherkin
Given gameweek [N] has completed
When I open the Dashboard
Then I see a "Gameweek [N] Recap" card
And it includes:
  - Gameweek Champion
  - Most exact scores (user + count)
  - Biggest swing (user who gained most ranks since previous GW) if available
  - Star Games (and how many users hit STAR_EXACT)
```

---

### US-9.3: Weekly Star Game Perk (Champion Picks 1 Star Game)

**Priority:** P2

**As a** gameweek champion, **I want to** pick 1 Star Game for the next gameweek **so that** winning a week gives me a visible perk and creates weekly drama.

**Notes:**
- See [star-games-voting.md](star-games-voting.md) "Champion Pick + Community Vote" (US-SGV-12..15).
- The other Star Game remains community-voted (or defaults to normal community voting if champion doesn't pick).

---

### US-9.4: Fixture Reactions (Lightweight Banter)

**Priority:** P2

**As a** user, **I want to** react to fixtures (and/or results) **so that** there's quick banter without needing a full chat system.

**Acceptance Criteria:**

```gherkin
Given I am viewing a fixture
When I tap a reaction (e.g., "🔥", "😭", "💀", "🤝")
Then my reaction is recorded for that fixture
And the reaction count increments for everyone

Given I have already reacted
When I tap a different reaction
Then my previous reaction is replaced (1 reaction per user per fixture)
```

---

### US-9.5: Prediction Insights (Consensus + Contrarian Fun)

**Priority:** P2

**As a** user, **I want to** see prediction distributions after kickoff (or after I submit) **so that** I can compare my picks vs the group.

**Acceptance Criteria:**

```gherkin
Given I have submitted a prediction for a fixture
When I view that fixture before kickoff
Then I can optionally see a "Community Picks" summary (e.g., % Home/Draw/Away)

Given the fixture has kicked off (predictions locked)
When I view the fixture
Then I can see full community distribution without affecting fairness
```
