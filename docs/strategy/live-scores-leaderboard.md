# Grand Football — Live Scores & Live Leaderboard Strategy & Design

> **Document Owner:** Strategy & Design Agent
> **Last Updated:** 2026-03-01
> **Status:** Draft (Phase 2)
>
> **Priority Key:**
> - **P0** — Must have for Phase 2 launch
> - **P1** — Should have (implement if time permits)
> - **P2** — Nice to have / future iteration

---

## Table of Contents

1. [User Stories](#1-user-stories)
2. [UI/UX Design Specifications](#2-uiux-design-specifications)
3. [Edge Cases](#3-edge-cases)
4. [Non-Functional Requirements](#4-non-functional-requirements)
5. [Key Design Decisions](#5-key-design-decisions)

---

## 1. User Stories

### Epic 10: Enhanced Fixture Sync

#### US-10.1: Adaptive Fixture Sync Frequency

**Priority:** P0

**As a** system, **I want to** increase fixture sync frequency on match days so that fixture schedules, kickoff time changes, and final results are detected faster.

**Description:**
The current 6-hour cron cycle is sufficient for schedule changes but too slow for detecting FINISHED results after matches end. On match days, the system should poll more frequently. On non-match days, the existing 6-hour cycle is retained to conserve API quota.

**Acceptance Criteria:**

```gherkin
Given it is a Premier League match day (fixtures with today's date exist in the DB)
When the adaptive sync cron runs
Then fixtures are polled from football-data.org every 30 minutes

Given it is NOT a match day
When the sync cron runs
Then fixtures are polled every 6 hours (existing behaviour)

Given the football-data.org API returns a rate-limit error (HTTP 429)
When the sync job detects the error
Then it logs the error, skips the current cycle, and retries at the next scheduled interval
And does NOT throw or crash

Given a fixture's status transitions from IN_PLAY → FINISHED during a sync
When the sync detects the transition
Then scores are auto-calculated via calculate_fixture_scores immediately
And the fixture's home_score and away_score are updated in the database
```

**Technical Notes:**
- Vercel Cron free tier supports `*/30 * * * *` (every 30 minutes). The route handler itself checks whether today is a match day; if not, it returns early (`{ skipped: true }`) within ~100ms.
- API budget: 30-min polling on a 3-day gameweek = ~144 requests. Free tier allows 10/min = 14,400/day. No risk of exhaustion.

---

#### US-10.2: Fixture Sync Health Monitoring

**Priority:** P1

**As an** admin, **I want to** see the last successful sync timestamp and any recent failures so that I can detect sync issues without checking Vercel logs.

**Acceptance Criteria:**

```gherkin
Given the sync-fixtures cron has run
When it completes (success or failure)
Then it writes a row to a sync_log table: { ran_at, status, fixtures_synced, errors, duration_ms }

Given the admin views the Admin Panel
When they open the "System Health" section
Then they see: last sync time, last sync status, fixtures synced count, and any error message from the most recent run
```

---

### Epic 11: Live Score Data

#### US-11.1: Poll Live Scores During Active Matches

**Priority:** P0

**As a** system, **I want to** poll for live match scores every 60 seconds during active gameweek windows so that users see near-real-time scores.

**Description:**
A dedicated cron endpoint polls football-data.org for in-progress matches. Live score data is written to a `live_scores` table (or updates `fixtures` directly with a `live_home_score` / `live_away_score` column pair). Supabase Realtime broadcasts changes to connected clients.

**Acceptance Criteria:**

```gherkin
Given one or more fixtures have status IN_PLAY or PAUSED
When the live-scores polling cron fires (every 60 seconds)
Then it fetches current scores from football-data.org for only the active matchday
And updates the live score fields for each in-progress fixture
And Supabase Realtime broadcasts the update to subscribed clients

Given no fixtures are currently IN_PLAY or PAUSED
When the live-scores polling cron fires
Then it performs a lightweight check (single query to local DB)
And returns early without calling the external API

Given a match transitions from IN_PLAY → FINISHED during a live poll
When the system detects the transition
Then the final score is written to home_score / away_score (canonical fields)
And calculate_fixture_scores is called for that fixture
And the live_home_score / live_away_score fields are cleared (or left for reference)
And the leaderboard reflects final scored points within 60 seconds
```

**Technical Notes:**
- 60-second polling = 1 API request per minute, well within the 10 req/min free tier limit.
- Only fetches the current matchday filter: `GET /v4/competitions/PL/matches?matchday={N}&status=LIVE,IN_PLAY,PAUSED,FINISHED` reducing payload size.
- Vercel Cron minimum interval is 1 minute (`* * * * *`), which suits this exactly.

---

#### US-11.2: View Live Scores on Fixture Cards

**Priority:** P0

**As a** user, **I want to** see live scores on fixture cards while matches are in progress so that I can follow the action.

**Acceptance Criteria:**

```gherkin
Given a fixture is IN_PLAY
When I view the Fixtures screen or Dashboard
Then the fixture card shows:
  - A pulsing "LIVE" badge (red dot animation)
  - The current score (e.g., "Arsenal 1 - 0 Chelsea")
  - The match minute (e.g., "63'") if available from the API
  - My prediction alongside for comparison

Given a fixture is PAUSED (half-time)
When I view the fixture card
Then the card shows "HT" (Half Time) badge instead of "LIVE"
And the score at half-time is displayed

Given the live score updates while I am on the Fixtures screen
When new data arrives via Supabase Realtime
Then the score updates in-place with a brief highlight animation (number flash)
And no full page reload occurs

Given I predicted 2-1 and the live score is currently 2-1
When I view the fixture card
Then my prediction is visually highlighted (e.g., green glow) indicating "currently exact match"
And a provisional points indicator shows "+5 pts (provisional)"
```

**Edge Cases:**
- If the API does not provide match minute data, display "LIVE" without a minute indicator.
- If the Supabase Realtime connection drops, the client falls back to polling the `/api/fixtures` endpoint every 30 seconds.

---

#### US-11.3: View Live Match Detail

**Priority:** P1

**As a** user, **I want to** tap a live fixture and see detailed live match information alongside my prediction so that I can track how my prediction is performing in real time.

**Acceptance Criteria:**

```gherkin
Given a fixture is IN_PLAY and I navigate to /match/[fixtureId]
When the Match Detail page loads
Then I see:
  - Live score (auto-updating)
  - Match minute / half indicator
  - My prediction with provisional points calculated client-side
  - Visual comparison: my predicted score vs current live score

Given the match finishes while I am on the Match Detail page
When the status changes to FINISHED
Then the display transitions from "LIVE" to "Full Time"
And the provisional points are replaced with final scored points (once scoring completes)
And a brief celebratory animation plays if I scored 5+ points
```

---

### Epic 12: Live Leaderboard

#### US-12.1: Live Gameweek Leaderboard

**Priority:** P0

**As a** user, **I want to** see a live gameweek leaderboard that updates in real-time based on current match scores so that I can track my position during the gameweek.

**Description:**
The live leaderboard calculates provisional points for all users by running the scoring engine client-side against current live scores for in-progress matches. For finished matches, it uses the final scored points from `score_records`. The two are combined to produce a real-time gameweek ranking.

**Acceptance Criteria:**

```gherkin
Given matches are in progress for the current gameweek
When I navigate to the Leaderboard screen and select "Live GW"
Then I see all users ranked by: final points (from finished matches) + provisional points (from live matches)
And each user's row shows their total provisional GW points and a breakdown badge (e.g., "12 pts — 1 exact, 2 outcomes")

Given a live score changes (e.g., a goal is scored)
When the updated score arrives via Supabase Realtime
Then the leaderboard re-computes provisional points for all users
And rows animate to their new positions (smooth reorder animation)
And my row is always highlighted regardless of position

Given all matches in the gameweek are FINISHED
When scoring has completed for all fixtures
Then the "Live GW" tab automatically transitions to the standard "Weekly" leaderboard
And a banner reads: "Gameweek {N} — Final standings"

Given I am viewing the Live GW leaderboard
When a match is in progress
Then each user's row shows a tooltip or expandable detail with per-fixture breakdown:
  - Fixture: ARS 2-0 CHE (LIVE 63')
  - Prediction: 2-1
  - Provisional: +3 (outcome)
```

**Edge Cases:**
- Users without predictions for a live match get 0 provisional points for that fixture.
- If a user predicted a match that hasn't started yet (SCHEDULED), their provisional points for that fixture are not shown (N/A).
- If Supabase Realtime disconnects, the client shows a "Live updates paused — reconnecting…" banner and falls back to 30-second polling.

---

#### US-12.2: Live Season Leaderboard

**Priority:** P0

**As a** user, **I want to** see the season leaderboard update with provisional points from live matches so that I can see the overall impact during gameweeks.

**Acceptance Criteria:**

```gherkin
Given matches are in progress
When I view the Season leaderboard
Then each user's total shows: (confirmed season points) + (provisional points from live matches)
And provisional points are visually distinguished (e.g., "+3 provisional" in a lighter color or italic)

Given all current-gameweek matches are finished and scored
When I view the Season leaderboard
Then it shows only confirmed points (provisional indicators disappear)

Given a user is ranked #5 on confirmed points but #3 with provisional points
When viewing the live season leaderboard
Then the user sees their live rank as #3 with a "▲2" indicator
And a visual distinction between confirmed rank and live rank
```

---

#### US-12.3: Live Leaderboard Provisional Disclaimer

**Priority:** P0

**As a** user, **I want to** clearly understand that live leaderboard positions are provisional so that I don't confuse them with final standings.

**Acceptance Criteria:**

```gherkin
Given matches are in progress and live leaderboard is displayed
When I view the leaderboard
Then a persistent banner at the top reads:
  "🔴 LIVE — Points are provisional based on current scores. Final standings update when matches end."

Given I am viewing the live leaderboard on mobile
When I see the provisional banner
Then it is compact (single line) and does not obstruct the leaderboard content
And it can be dismissed but reappears on next visit while matches are live
```

---

#### US-12.4: Live Position Change Notifications

**Priority:** P2

**As a** user, **I want to** receive subtle in-app notifications when my leaderboard position changes during live matches so that I stay engaged.

**Acceptance Criteria:**

```gherkin
Given I am on any screen in the app
When my live leaderboard position changes (up or down)
Then a non-intrusive toast appears: "You moved to #3 in the gameweek leaderboard! ▲2"
And the toast auto-dismisses after 4 seconds
And no more than 1 position-change toast is shown per 60 seconds (debounce)
```

---

### Epic 13: Supabase Realtime Integration

#### US-13.1: Realtime Subscription for Fixture Updates

**Priority:** P0

**As a** client application, **I want to** subscribe to Supabase Realtime channels for fixture score changes so that the UI updates without polling.

**Acceptance Criteria:**

```gherkin
Given the user opens the Fixtures or Leaderboard screen
When the page mounts
Then the client subscribes to a Supabase Realtime channel: "fixtures:gameweek:{N}"
And receives INSERT/UPDATE events for rows matching the current gameweek

Given a fixture row is updated in the database (live score change)
When the Realtime channel delivers the event
Then the client updates the relevant fixture card's score display within 2 seconds

Given the user navigates away from the Fixtures screen
When the page unmounts
Then the Realtime subscription is cleaned up (unsubscribed)
And no memory leaks or orphaned listeners remain
```

**Technical Notes:**
- Supabase Realtime free tier supports up to 200 concurrent connections. With ~14 users, this is ample.
- Channel structure: `realtime:fixtures` with a filter on `gameweek = {currentGW}`.
- The Supabase client library handles reconnection automatically.

---

#### US-13.2: Realtime Fallback Mechanism

**Priority:** P0

**As a** client application, **I want to** fall back to HTTP polling if the Realtime connection fails so that users always see reasonably fresh data.

**Acceptance Criteria:**

```gherkin
Given the Supabase Realtime WebSocket connection fails or times out
When the client detects the disconnection
Then it displays a subtle banner: "Live updates paused — refreshing automatically"
And initiates polling GET /api/fixtures?gameweek={N} every 30 seconds

Given the Realtime connection is re-established
When the client reconnects
Then it cancels the polling fallback
And removes the "Live updates paused" banner
And resumes Realtime-driven updates
```

---

## 2. UI/UX Design Specifications

### 2.1 Live Badge System

New badge variants for live match states:

| Badge | Visual | Usage |
|-------|--------|-------|
| **LIVE** | Red background (`#DC2626`), white text, pulsing red dot animation | Fixture card when status = `IN_PLAY` |
| **HT** | Amber background (`#D97706`), white text, static | Fixture card when status = `PAUSED` |
| **FT** | Green background (existing `--color-success`), white text | Fixture card when status = `FINISHED` (existing) |
| **Provisional** | Dashed border, italic text, lighter opacity (0.7) | Leaderboard points that are based on live scores |

#### Live Dot Animation

```css
@keyframes live-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}

.live-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #DC2626;
  animation: live-pulse 1.5s ease-in-out infinite;
}
```

Respects `prefers-reduced-motion`: animation pauses, dot remains static but visible.

---

### 2.2 Live Fixture Card (Updated)

**Enhanced fixture card showing live scores with prediction comparison:**

```
┌─────────────────────────────────────────────┐
│  ⭐ Star Game          🔴 LIVE  63'         │
│                                             │
│  [ARS]  Arsenal        2                    │
│                          -                  │
│  [CHE]  Chelsea        0                    │
│                                             │
│  ─────────────────────────────────────────  │
│  Your prediction        2 - 1               │
│  Provisional            +3 pts (outcome) 🟡 │
└─────────────────────────────────────────────┘
```

**Layout breakdown:**

- **Status row (top):** Star Game badge (left) + LIVE badge with minute (right-aligned)
- **Score section (center):** Team crests, names, and live score in large bold font. Score updates animate with a brief flash (background pulse on the number that changed, 300ms, color: `--color-accent` → transparent).
- **Divider:** Subtle `border-border-subtle`
- **Prediction comparison (bottom):** User's prediction + provisional points with reason code label.

**Provisional points color coding:**

| Provisional Result | Color | Icon |
|-------------------|-------|------|
| Exact match so far | Green (`--color-success`) | ✓ |
| Correct outcome so far | Amber (`--color-warning`) | ~ |
| Currently wrong | Gray (`--color-text-tertiary`) | — |
| No prediction | Gray, italic "No prediction" | — |

**Score Update Animation:**

When a goal is scored and the score changes:
1. The changed score number scales up briefly (1.0 → 1.2 → 1.0 over 400ms)
2. A subtle background flash on the number (gold → transparent over 600ms)
3. If this changes the user's provisional points, the points badge also animates

```css
@keyframes score-flash {
  0% { background-color: rgba(255, 214, 0, 0.3); transform: scale(1.2); }
  100% { background-color: transparent; transform: scale(1); }
}
```

---

### 2.3 Half-Time Fixture Card

```
┌─────────────────────────────────────────────┐
│                      🟠 HT                   │
│                                             │
│  [LIV]  Liverpool      1                    │
│                          -                  │
│  [MUN]  Man United     1                    │
│                                             │
│  ─────────────────────────────────────────  │
│  Your prediction        2 - 1               │
│  Provisional            +3 pts (outcome) 🟡 │
└─────────────────────────────────────────────┘
```

Identical layout to LIVE, but the badge is amber "HT" and no match minute is shown.

---

### 2.4 Live Leaderboard Screen

**Route:** `/leaderboard` (enhanced with live tab)

**Layout (Mobile):**

```
┌─────────────────────────────────────────────┐
│  Leaderboard                                 │
│  [Live GW] [Season] [Monthly ▼]             │
│                                             │
│  ┌─────────────────────────────────────────┐│
│  │ 🔴 LIVE — Provisional points based on   ││
│  │ current scores. Final after FT.          ││
│  └─────────────────────────────────────────┘│
│                                             │
│  GW 28 · 4/10 matches live · 2/10 finished │
│                                             │
│  ┌─────────────────────────────────────────┐│
│  │ #1  Temi ◀YOU          18 pts           ││
│  │     ▲2  ⚡ 3 live      +8 provisional   ││
│  ├─────────────────────────────────────────┤│
│  │ #2  David               17 pts          ││
│  │     ▼1  ⚡ 3 live      +7 provisional   ││
│  ├─────────────────────────────────────────┤│
│  │ #3  Sarah               15 pts          ││
│  │     —   ⚡ 3 live      +5 provisional   ││
│  ├─────────────────────────────────────────┤│
│  │ #4  James               12 pts          ││
│  │     ▲1  ⚡ 2 live      +2 provisional   ││
│  └─────────────────────────────────────────┘│
│                                             │
│  [Tab Bar]                                   │
└─────────────────────────────────────────────┘
```

**Component Hierarchy:**

- `LeaderboardPage` (enhanced)
  - `TabSwitcher` — adds "Live GW" tab (only visible when matches are in progress)
  - `LiveBanner` — provisional disclaimer, dismissable
  - `GameweekStatusBar` — "GW 28 · 4/10 matches live · 2/10 finished"
  - `LiveLeaderboardTable`
    - `LiveLeaderboardRow` (per user)
      - `RankBadge` (live rank)
      - `DisplayName` + "You" indicator
      - `PositionDelta` (▲/▼/— vs confirmed rank)
      - `TotalProvisionalPoints` (confirmed + provisional)
      - `ProvisionalBreakdown` ("+8 provisional" in lighter style)
      - `LiveMatchIndicator` (⚡ icon + count of live matches with predictions)

**Expanded Row Detail (tap to expand):**

```
┌──────────────────────────────────────────┐
│ #1  Temi ◀YOU              18 pts  [▾]  │
│                                          │
│  ✓ ARS 2-0 CHE (FT)    Pred: 2-0  +5   │
│  🔴 LIV 1-1 MUN (63')  Pred: 2-1  +3   │
│  🔴 TOT 0-0 MCI (45')  Pred: 1-0  +0   │
│  ⏳ BHA vs WHU (Sat 5pm) Pred: 2-0  —   │
│  ···6 more fixtures                      │
└──────────────────────────────────────────┘
```

---

### 2.5 Live Season Leaderboard Enhancement

The existing Season leaderboard gains a provisional indicator when matches are live:

```
┌─────────────────────────────────────────────┐
│  #3  Temi ◀YOU                              │
│  182 pts + 8 provisional = 190 pts          │
│  ▲1 from confirmed position                 │
└─────────────────────────────────────────────┘
```

- Confirmed points shown in bold (standard style).
- Provisional addition shown in lighter italic text.
- Combined total shown in standard weight.
- Position delta compares live rank to confirmed rank.

---

### 2.6 Dashboard Live Section

**Enhanced Dashboard when matches are live:**

```
┌─────────────────────────────────────────────┐
│  Good afternoon, Temi                        │
│                                             │
│  ┌─────────────────────────────────────────┐│
│  │ 🏆 Live Rank: #3 (▲1)                  ││
│  │ Season: 182 pts + 8 provisional          ││
│  │ GW 28: 18 pts (3 matches live)           ││
│  └─────────────────────────────────────────┘│
│                                             │
│  Live Matches 🔴                             │
│  ┌─────────────────────────────────────────┐│
│  │ ARS 2-0 CHE  63'  You: 2-1  +3 (out.)  ││
│  ├─────────────────────────────────────────┤│
│  │ LIV 1-1 MUN  58'  You: 2-1  +3 (out.)  ││
│  ├─────────────────────────────────────────┤│
│  │ TOT 0-0 MCI  45'  You: 1-0  +0 (wrong) ││
│  └─────────────────────────────────────────┘│
│                                             │
│  Upcoming Today                              │
│  ┌─────────────────────────────────────────┐│
│  │ BHA vs WHU  5:30pm  Predicted: 2-0 ✓   ││
│  └─────────────────────────────────────────┘│
│                                             │
│  [Tab Bar]                                   │
└─────────────────────────────────────────────┘
```

The "Live Matches" section only appears when there are IN_PLAY/PAUSED fixtures. It replaces the "Recent Results" section during active gameweeks and shows live fixture cards in a compact format with real-time score updates.

---

### 2.7 Connection Status Indicator

A small, non-intrusive indicator shows Realtime connection state:

| State | Visual | Position |
|-------|--------|----------|
| **Connected** | Small green dot (8px) | Top-right of screen, near status bar. Fades in, visible for 3s on connect, then hides. |
| **Reconnecting** | Small amber dot with pulse | Top-right, persistent while reconnecting |
| **Disconnected (polling)** | Amber banner: "Live updates paused — refreshing automatically" | Below nav bar, full-width |

---

### 2.8 Responsive Considerations

#### Mobile (< 640px)
- Live fixture cards: stacked layout (team names above scores).
- Live leaderboard: compact rows, expandable on tap for per-fixture breakdown.
- Provisional banner: single-line, dismissable.

#### Tablet (640px – 1023px)
- Live fixture cards: side-by-side team names with centered score.
- Live leaderboard rows show inline provisional breakdown without expansion.

#### Desktop (1024px+)
- Split view possible: Fixtures on left, Live leaderboard on right.
- Per-fixture breakdown visible inline in leaderboard rows.
- Score update animations can be richer (particle effect on exact match).

---

## 3. Edge Cases

### EC-1: Goal Scored During Half-Time (Status = PAUSED)

**Scenario:** The API reports status `PAUSED` but the score has changed (this can happen if the API updates score slightly after the half-time whistle or there's a VAR decision applied at half-time).

**Handling:**
- Treat any score change as valid regardless of status. Display the updated score.
- Provisional points recalculate based on the new score.
- No special logic needed — the system treats PAUSED the same as IN_PLAY for scoring purposes.

---

### EC-2: Match Goes to Extra Time or Penalties

**Scenario:** This should not happen in the Premier League regular season. However, if fixtures from cup competitions are accidentally included in the API response, extra time or penalties could occur.

**Handling:**
- The system only tracks `score.fullTime` from the API (90-minute result).
- If the API reports `score.fullTime` as the 90-minute result even when extra time is played, no issue.
- If the API reports `score.fullTime` inclusive of extra time, the admin can override via the existing Override Result feature.
- Not expected to impact Premier League fixtures.

---

### EC-3: Multiple Matches Finishing Simultaneously

**Scenario:** 5+ matches finish at roughly the same time (e.g., 3pm Saturday games). The scoring engine needs to process all of them.

**Handling:**
- The live-scores cron detects all IN_PLAY → FINISHED transitions in a single poll cycle.
- It triggers `calculate_fixture_scores` sequentially for each newly finished fixture.
- The scoring RPC is fast (~50ms per fixture for 14 users), so 5 fixtures ≈ 250ms total.
- Supabase Realtime delivers score_record updates, and the client leaderboard recomputes.
- **Risk:** If the cron times out (Vercel 60s limit on Hobby), some scores may not calculate.
- **Mitigation:** The calculate-scores cron (existing, runs every 30 mins on match days) catches any missed fixtures.

---

### EC-4: API Reports Wrong Live Score (Then Corrects)

**Scenario:** The API briefly shows a wrong score (e.g., goal disallowed by VAR but initially counted).

**Handling:**
- The live score updates on the next poll cycle (60 seconds later) with the corrected score.
- Provisional leaderboard points adjust automatically.
- No user action needed. The system is self-correcting.
- **User perception:** A score might flash briefly then revert. The "LIVE" and "provisional" labels set expectations that data is in flux.

---

### EC-5: Supabase Realtime Quota or Connection Limits

**Scenario:** Supabase free tier has limits on Realtime connections (200 concurrent) and messages (2 million/month).

**Handling:**
- With ~14 users, peak concurrent connections are ~14 (each user has 1 Realtime connection).
- Message volume: ~10 fixtures × updates every 60s × 90 minutes × 10 match days/month = ~9,000 messages. Well within 2M limit.
- **If limits are hit:** The client detects `CHANNEL_ERROR` and falls back to HTTP polling.
- **Monitoring:** Log Realtime connection count and message volume. Alert if approaching 80% of limits.

---

### EC-6: Stale Client State After Browser Sleep

**Scenario:** A user opens the app, their phone goes to sleep for 30 minutes during a match, then they wake it up. The Realtime connection may have dropped, and their displayed score is stale.

**Handling:**
- On page visibility change (`visibilitychange` event), if the page becomes visible:
  1. Check Realtime connection status. If disconnected, reconnect.
  2. Immediately fetch fresh fixture data via HTTP (`GET /api/fixtures?gameweek={N}`) to catch up.
  3. Replace stale client state with fresh data.
- The "reconnecting" indicator shows briefly during this process.

---

### EC-7: Provisional Points Disagree with Final Scored Points

**Scenario:** Client-side provisional scoring calculates +3 (outcome), but when the match finishes and the server scores it, the result is +5 (exact). This could happen if the live score was momentarily incorrect during the last poll before FINISHED.

**Handling:**
- When a fixture transitions to FINISHED, the client receives the `score_records` update via Realtime.
- The final scored points replace provisional points, with a brief animation.
- The leaderboard re-ranks based on final points.
- A toast notification: "Match finished: ARS 2-1 CHE — You scored +5 pts! 🎉" confirms the final result.

---

### EC-8: Live Cron Fires But No Matches Are Active

**Scenario:** The live-scores cron runs at 60-second intervals 24/7, but most of the time no matches are live.

**Handling:**
- The cron route handler first queries the local DB: `SELECT COUNT(*) FROM fixtures WHERE status IN ('IN_PLAY', 'PAUSED') AND kickoff_time::date = CURRENT_DATE`.
- If count = 0, it performs a secondary check: any fixtures with `kickoff_time` within the next 15 minutes AND status = `TIMED/SCHEDULED`? If yes, it polls the API to catch imminent kickoffs.
- If neither condition is met, return immediately: `{ skipped: true, reason: 'no_active_matches' }`.
- This ensures the external API is never called unnecessarily.

---

### EC-9: Match Suspended Mid-Game

**Scenario:** A match is suspended (e.g., floodlight failure, crowd trouble) — API status = `SUSPENDED`.

**Handling:**
- Display "SUSPENDED" badge (red, static — no pulse) on the fixture card.
- The current score at time of suspension is shown.
- Provisional points continue to be calculated based on the score at suspension.
- If the match resumes, the API status changes back to `IN_PLAY`, and normal live updates continue.
- If the match is abandoned (changes to `CANCELLED` or `POSTPONED`), edge case handling from existing docs applies (no scoring, excluded from leaderboard).

---

### EC-10: Gameweek Spanning Multiple Days

**Scenario:** A gameweek has Saturday 3pm kickoffs, a Saturday 5:30pm kickoff, Sunday 2pm kickoffs, and a Monday night game. The live leaderboard needs to handle partial completions across multiple days.

**Handling:**
- The Live GW leaderboard shows cumulative provisional points across the entire gameweek.
- On Saturday evening, some matches are FINISHED (scored) and others haven't started yet.
- The leaderboard shows confirmed points for finished matches + provisional points for in-progress matches. Matches not yet started are excluded (N/A).
- The GameweekStatusBar updates: "GW 28 · 0 live · 6/10 finished · 4 upcoming"
- The Live GW tab remains visible until all 10 fixtures in the gameweek are FINISHED and scored.

---

### EC-11: User Opens App After All Matches Finished But Before Scoring Completes

**Scenario:** All Saturday matches just finished. The user opens the app. The scoring engine hasn't run yet (it triggers on the next cron cycle or was slow).

**Handling:**
- Fixtures show "Full Time" with final scores.
- Points show "Pending calculation…" with a spinner icon.
- The Live GW leaderboard shows a note: "Scores being calculated — leaderboard will update shortly."
- Once `score_records` are written, Supabase Realtime pushes the update and the leaderboard populates.

---

## 4. Non-Functional Requirements

### 4.1 Data Freshness (Updated Targets)

| Data Type | Current Target | New Target (Phase 2) | Mechanism |
|-----------|---------------|---------------------|-----------|
| **Fixture schedule** | ≤ 6h stale | ≤ 30 min on match days, ≤ 6h otherwise | Adaptive cron |
| **Live match scores** | N/A | ≤ 60 seconds | Live-scores cron (every 60s) + Supabase Realtime |
| **Score calculation** | ≤ 6h after match ends | ≤ 2 minutes after match ends | Triggered in live-scores cron on FINISHED detection |
| **Live leaderboard** | N/A | ≤ 5 seconds after score change | Client-side recompute on Realtime event |
| **Season leaderboard** | ≤ 5 min after scoring | ≤ 30 seconds after scoring | Supabase Realtime on score_records table |

### 4.2 API Rate Limit Budget

**football-data.org free tier: 10 requests/minute**

| Operation | Frequency | Requests/Min | Requests/Day |
|-----------|-----------|-------------|-------------|
| **Live scores poll** | Every 60s (only during active matches) | 1 | ~90 per match window (1.5h avg) |
| **Fixture sync (match day)** | Every 30 min | 0.03 | ~48 |
| **Fixture sync (non-match day)** | Every 6h | 0.003 | 4 |
| **Match day total (worst case)** | 3pm–10pm window (7h) | — | ~420 + 14 = ~434 |
| **Daily free tier budget** | — | 10/min | **14,400** |
| **Utilization (worst case)** | — | — | **~3%** |

**Conclusion:** The free tier is more than sufficient. Even with 60-second live polling, we use <3% of the daily budget on the busiest match days.

### 4.3 Performance Targets (Live Features)

| Metric | Target | Notes |
|--------|--------|-------|
| **Live score display latency** | ≤ 65 seconds from real-world event | 60s poll interval + ~5s network/processing |
| **Realtime event delivery** | ≤ 2 seconds | Supabase Realtime to client |
| **Client-side provisional scoring** | ≤ 50ms for 14 users × 10 fixtures | Single-threaded JS computation |
| **Leaderboard re-render** | ≤ 100ms after data arrives | React state update + DOM reconciliation |
| **Live cron execution time** | ≤ 10 seconds | API fetch + DB writes for ~10 fixtures |
| **Memory overhead (client)** | ≤ 5MB additional | Realtime subscription + cached fixture data |
| **Fallback poll interval** | 30 seconds | When Realtime disconnects |

### 4.4 Supabase Realtime Resource Usage

| Resource | Free Tier Limit | Expected Usage | Headroom |
|----------|----------------|----------------|----------|
| **Concurrent connections** | 200 | ~14 (peak) | 93% headroom |
| **Messages/month** | 2,000,000 | ~50,000 (est.) | 97.5% headroom |
| **Channel subscriptions** | Unlimited | ~14 per active match window | N/A |
| **Payload size** | 1MB per message | ~500 bytes per fixture update | 99.95% headroom |

### 4.5 Vercel Cron Resource Usage

| Resource | Free Tier Limit | Current Usage | New Usage (Phase 2) | Headroom |
|----------|----------------|---------------|---------------------|----------|
| **Cron jobs** | 2 (Hobby) or unlimited (Pro) | 4 crons | 5–6 crons | Need Pro for >2 crons |
| **Invocations/day** | 100,000 | ~100 | ~1,540 (on match day) | 98.5% headroom |
| **Execution time/invocation** | 60s (Hobby) / 300s (Pro) | <5s | <10s (live cron) | Sufficient |

**Important:** Vercel Hobby plan only allows 2 cron jobs. The app currently has 4 configured in `vercel.json`. Either a Vercel Pro plan ($20/mo) is already in use, or the extra crons are being ignored. Adding a 5th cron (live-scores) requires verifying the plan. **Alternative:** Consolidate the live-scores poll into the sync-fixtures cron with conditional logic based on whether matches are active.

### 4.6 Cost Impact

| Service | Current Cost | Phase 2 Cost | Delta |
|---------|-------------|-------------|-------|
| **Vercel** | $0 (Hobby) or $20 (Pro) | $20 (Pro recommended) | +$0 to +$20/mo |
| **Supabase** | $0 (Free) | $0 (Free) | $0 |
| **football-data.org** | $0 (Free) | $0 (Free) | $0 |
| **Total** | $0–$20/mo | $20/mo | **+$0 to +$20/mo** |

---

## 5. Key Design Decisions

### Decision L-1: Polling vs. WebSocket for Live Scores

| Attribute | Detail |
|-----------|--------|
| **Decision** | **Server-side polling (cron) + client-side Supabase Realtime** |
| **Status** | ✅ Confirmed |

**Options Considered:**

| Option | Pros | Cons |
|--------|------|------|
| **A. Server polls API, writes to DB, Supabase Realtime pushes to clients** | Simple; works with Vercel serverless; rate-limit friendly; single source of truth in DB | ~60s latency from real-world event; cron overhead on non-match days |
| **B. Client-side polling of football-data.org directly** | Lower latency (can poll every 15s) | Rate limit risk with 14 clients (14 req/min at 60s); API key exposed to clients; no single source of truth |
| **C. Third-party WebSocket provider (e.g., Pusher, Ably)** | True real-time (<5s) | Additional service cost; additional complexity; football-data.org doesn't offer WebSocket anyway |

**Rationale for Option A:**
- football-data.org only supports REST polling — there's no WebSocket/SSE endpoint.
- Vercel serverless cannot maintain persistent WebSocket connections to the API.
- Supabase Realtime is free, already in the stack, and handles the "last mile" push to clients.
- 60-second latency is acceptable for a private prediction league (not a betting app).
- A single cron poller means exactly 1 API req/min, staying well within rate limits.

---

### Decision L-2: Live Score Storage Strategy

| Attribute | Detail |
|-----------|--------|
| **Decision** | **Add `live_home_score` and `live_away_score` columns to the `fixtures` table** |
| **Status** | ✅ Confirmed |

**Options Considered:**

| Option | Pros | Cons |
|--------|------|------|
| **A. Separate `live_scores` table** | Clean separation of live vs. final data; easy to truncate | Extra join in queries; separate Realtime channel |
| **B. Add live columns to `fixtures` table** | Single query/subscription for all fixture data; simpler client logic | Table gets wider; need to distinguish live vs. final scores |
| **C. Overwrite `home_score`/`away_score` with live data** | Simplest schema; no new columns | Dangerous — could corrupt final scored data; harder to distinguish provisional vs. final |

**Rationale for Option B:**
- The fixture card already queries the `fixtures` table. Adding two nullable columns (`live_home_score`, `live_away_score`) requires no new joins.
- Supabase Realtime can filter on the `fixtures` table by gameweek — a single subscription gets both live scores and status changes.
- The canonical `home_score`/`away_score` are only written when `status = FINISHED`, preserving data integrity.
- `live_home_score`/`live_away_score` are set to `NULL` when the match is not in progress or after it finishes.
- Client logic: display `live_home_score` if non-null and status is `IN_PLAY`/`PAUSED`; otherwise display `home_score`.

---

### Decision L-3: Provisional Scoring — Server vs. Client

| Attribute | Detail |
|-----------|--------|
| **Decision** | **Client-side provisional scoring using the existing TypeScript scoring engine** |
| **Status** | ✅ Confirmed |

**Options Considered:**

| Option | Pros | Cons |
|--------|------|------|
| **A. Server computes provisional scores (new column/table)** | Single source of truth; no client computation | Additional DB writes every 60s for 14 users × active fixtures; Realtime noise; unnecessary server load |
| **B. Client computes provisional scores from live data** | Zero server overhead; instant re-calculation on each update; uses existing `calculatePoints()` function | Technically provisional data could differ between clients (race condition); requires prediction data on client |
| **C. Hybrid: server pre-computes, client displays** | Best of both worlds | Over-engineered for 14 users |

**Rationale for Option B:**
- The `calculatePoints()` function already exists in [src/lib/scoring/engine.ts](src/lib/scoring/engine.ts) — it's a pure function that takes `(predicted, actual, isStarGame)` and returns points.
- With ~14 users and ~10 fixtures, computing provisional scores client-side is trivial (<1ms).
- The client already knows the user's predictions (loaded on page mount) and receives live scores via Realtime. It has everything needed.
- For the Live GW leaderboard, the client needs **all users' predictions** for the current gameweek. This is acceptable post-kickoff (predictions are no longer secret once locked). A single API call `GET /api/predictions/gameweek/{N}` returns all ~140 prediction rows (14 users × 10 fixtures).
- This avoids any provisional score_records in the DB that might be confused with final scores.

---

### Decision L-4: Cron Consolidation Strategy

| Attribute | Detail |
|-----------|--------|
| **Decision** | **Consolidate live polling into the sync-fixtures cron with adaptive frequency** |
| **Status** | ✅ Confirmed |

**Options Considered:**

| Option | Pros | Cons |
|--------|------|------|
| **A. Separate `live-scores` cron at 1-min interval** | Clean separation of concerns | Additional cron job (may exceed Hobby plan limits); two jobs hitting the same API |
| **B. Consolidate into sync-fixtures with adaptive logic** | Fewer cron jobs; single API interaction point; conditional frequency | More complex route handler logic |

**Rationale for Option B:**
- Vercel Hobby plan limits to 2 cron jobs. The app already has 4 configured (likely on Pro plan or being ignored). Adding a 5th isn't ideal.
- Both jobs hit football-data.org. Consolidating avoids potential race conditions and simplifies rate-limit management.
- The route handler gains a `mode` parameter or auto-detects: if active matches exist, it behaves as a live poller (fetching only the active matchday); otherwise, it performs a full fixture sync.

**Implementation sketch:**

```typescript
// POST /api/cron/sync-fixtures
export async function POST(request: NextRequest) {
  // ... auth check ...

  const hasActiveMatches = await checkForActiveMatches(supabase);
  const hasImminent = await checkForImminentKickoffs(supabase, 15); // 15 min window

  if (hasActiveMatches) {
    // LIVE MODE: fetch only current matchday, update live scores
    return await pollLiveScores(supabase, season);
  } else if (hasImminent || isMatchDay) {
    // MATCH DAY MODE: full sync but more frequent
    return await fullFixtureSync(supabase, season);
  } else {
    // OFF-DAY MODE: skip (will run on 6h schedule anyway)
    return NextResponse.json({ skipped: true });
  }
}
```

**Cron schedule change:**

```json
{
  "path": "/api/cron/sync-fixtures",
  "schedule": "* * * * *"  // Every minute; handler self-throttles
}
```

The handler checks internal state to decide whether to actually call the API or skip.

---

### Decision L-5: Prediction Visibility for Live Leaderboard

| Attribute | Detail |
|-----------|--------|
| **Decision** | **All predictions for kicked-off matches are visible to all users** |
| **Status** | ✅ Confirmed |

**Rationale:**
- Predictions are locked at kickoff. Once locked, there's no gaming advantage in seeing others' predictions.
- The live leaderboard **requires** all users' predictions to compute provisional standings.
- The existing design notes "Phase 2: show all predictions after kickoff" — this implements that.
- A new API endpoint returns all predictions for a given gameweek, but only for fixtures where `kickoff_time <= NOW()`.

**Privacy safeguard:**
- Predictions for future (not-yet-kicked-off) fixtures remain private.
- The API enforces this server-side — the query filters out fixtures that haven't kicked off.

---

### Decision L-6: When to Show the Live Leaderboard Tab

| Attribute | Detail |
|-----------|--------|
| **Decision** | **Show "Live GW" tab when any fixture in the current gameweek is IN_PLAY, PAUSED, or FINISHED-today** |
| **Status** | ✅ Confirmed |

**Rules:**
1. **Show** "Live GW" tab when: `current_gameweek` has at least one fixture with status `IN_PLAY` or `PAUSED`, OR at least one fixture that transitioned to `FINISHED` within the last 2 hours.
2. **Hide** "Live GW" tab when: all fixtures in the gameweek are `FINISHED` AND the last one finished more than 2 hours ago (transition to standard Weekly tab).
3. **Default tab:** If the Live GW tab is visible, it is the default selected tab when navigating to `/leaderboard`.

**Rationale:**
- The 2-hour window after the last FINISHED match ensures users can still see the final live standings before the tab disappears.
- This prevents the Live GW tab from appearing during the week when no matches are in progress.

---

### Decision Summary

| ID | Decision | Rationale |
|----|----------|-----------|
| L-1 | Server polling + Supabase Realtime | football-data.org is REST-only; Vercel is serverless; Supabase Realtime is free |
| L-2 | Live score columns on `fixtures` table | Single subscription; simple client logic; preserves final score integrity |
| L-3 | Client-side provisional scoring | Zero server overhead; reuses existing scoring engine; trivial computation for 14 users |
| L-4 | Consolidate live poll into sync-fixtures cron | Fewer cron jobs; single API interaction point; adaptive frequency |
| L-5 | All predictions visible post-kickoff | Required for live leaderboard; no gaming advantage post-lock |
| L-6 | Live GW tab shown when matches are active or recently finished | Contextual UX; doesn't clutter the UI on non-match days |

---

## Appendix A: Data Flow — Live Score Update

```
                       60s interval
Vercel Cron ──────────────────────────────────────┐
                                                   │
  POST /api/cron/sync-fixtures                     │
       │                                           │
       ▼                                           │
  ┌─────────────────────────┐                      │
  │ 1. Query local DB:      │                      │
  │    any IN_PLAY/PAUSED?  │──── No ──▶ return { skipped: true }
  │                         │                      │
  │ Yes ▼                   │                      │
  │                         │                      │
  │ 2. GET football-data.org│                      │
  │    /v4/competitions/PL/ │                      │
  │    matches?matchday=N   │                      │
  │    &status=LIVE,...     │                      │
  │                         │                      │
  │ 3. For each match:      │                      │
  │    UPDATE fixtures SET  │                      │
  │    live_home_score = ?, │                      │
  │    live_away_score = ?, │                      │
  │    status = ?,          │                      │
  │    match_minute = ?     │                      │
  │    WHERE api_fixture_id │                      │
  │                         │                      │
  │ 4. If IN_PLAY → FINISHED│                      │
  │    SET home_score,      │                      │
  │    away_score (final)   │                      │
  │    CALL calculate_      │                      │
  │    fixture_scores()     │                      │
  └────────┬────────────────┘                      │
           │                                       │
           │  DB write triggers                     │
           │  Supabase Realtime                     │
           ▼                                       │
  ┌─────────────────────────┐                      │
  │  Supabase Realtime      │                      │
  │  Channel: fixtures      │                      │
  │  Filter: gameweek = N   │                      │
  │                         │                      │
  │  Broadcast to ~14       │                      │
  │  connected clients      │                      │
  └────────┬────────────────┘                      │
           │                                       │
           ▼                                       │
  ┌─────────────────────────┐                      │
  │  Client (Browser)       │                      │
  │                         │                      │
  │ 1. Receive Realtime     │                      │
  │    event (fixture row)  │                      │
  │                         │                      │
  │ 2. Update fixture card  │                      │
  │    (live score display) │                      │
  │                         │                      │
  │ 3. Re-run calculatePoints()                    │
  │    for each user ×      │                      │
  │    each live fixture    │                      │
  │                         │                      │
  │ 4. Re-rank live         │                      │
  │    leaderboard          │                      │
  │                         │                      │
  │ 5. Animate changes      │                      │
  └─────────────────────────┘                      │
                                                   │
  ◀────────── Next 60s poll ───────────────────────┘
```

---

## Appendix B: New/Modified Database Objects

### New Columns on `fixtures` Table

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `live_home_score` | `smallint` | Yes | `NULL` | Current live score for home team (only during IN_PLAY/PAUSED) |
| `live_away_score` | `smallint` | Yes | `NULL` | Current live score for away team (only during IN_PLAY/PAUSED) |
| `match_minute` | `smallint` | Yes | `NULL` | Current match minute (e.g., 63). NULL when not live. |

### New Table: `sync_log` (Optional — for US-10.2)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `uuid` | No | `gen_random_uuid()` | Primary key |
| `ran_at` | `timestamptz` | No | `now()` | When the sync ran |
| `mode` | `text` | No | — | `'live'`, `'match_day'`, `'full'`, or `'skipped'` |
| `status` | `text` | No | — | `'success'` or `'error'` |
| `fixtures_updated` | `integer` | No | `0` | Count of fixture rows updated |
| `scores_calculated` | `integer` | No | `0` | Count of score records created |
| `error_message` | `text` | Yes | `NULL` | Error details if status = 'error' |
| `duration_ms` | `integer` | No | `0` | Execution time |

### New API Endpoint

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/predictions/gameweek/[gameweek]` | Returns all users' predictions for kicked-off fixtures in a gameweek. Used by the live leaderboard to compute provisional scores client-side. Excludes predictions for not-yet-kicked-off fixtures. |

**Response shape:**

```typescript
{
  predictions: Array<{
    user_id: string;
    display_name: string;
    fixture_id: string;
    home_score: number;
    away_score: number;
  }>;
  scoreRecords: Array<{
    user_id: string;
    fixture_id: string;
    points_awarded: number;
    reason_code: string;
  }>;
}
```

### Modified Supabase Realtime Configuration

Enable Realtime on the `fixtures` table:

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE fixtures;
```

RLS policy addition — allow all authenticated users to receive Realtime updates for fixtures:

```sql
CREATE POLICY "Users can receive fixture realtime updates"
  ON fixtures FOR SELECT
  TO authenticated
  USING (true);
```

(This policy likely already exists since users can read fixtures.)

---

## Appendix C: Implementation Priority & Phasing

### Phase 2a: Foundation (Week 1–2)

| Task | Story | Priority |
|------|-------|----------|
| Add `live_home_score`, `live_away_score`, `match_minute` columns | L-2 | P0 |
| Create `sync_log` table | US-10.2 | P1 |
| Refactor sync-fixtures cron for adaptive frequency | US-10.1, L-4 | P0 |
| Add live polling logic to sync-fixtures | US-11.1, L-1 | P0 |
| Enable Supabase Realtime on fixtures table | US-13.1 | P0 |
| Create `GET /api/predictions/gameweek/[gw]` endpoint | L-5 | P0 |

### Phase 2b: Client UI (Week 2–3)

| Task | Story | Priority |
|------|-------|----------|
| Update FixtureCard with live score display + animations | US-11.2 | P0 |
| Add HT badge variant | US-11.2 | P0 |
| Implement Supabase Realtime subscription hook | US-13.1 | P0 |
| Implement fallback polling | US-13.2 | P0 |
| Add connection status indicator | 2.7 | P1 |
| Update Dashboard with live section | 2.6 | P0 |

### Phase 2c: Live Leaderboard (Week 3–4)

| Task | Story | Priority |
|------|-------|----------|
| Implement client-side provisional scoring for all users | L-3 | P0 |
| Build Live GW leaderboard tab with real-time re-ranking | US-12.1 | P0 |
| Add per-user expandable breakdown rows | US-12.1 | P1 |
| Update Season leaderboard with provisional indicators | US-12.2 | P0 |
| Add provisional disclaimer banner | US-12.3 | P0 |
| Handle browser sleep / visibility change | EC-6 | P0 |

### Phase 2d: Polish (Week 4)

| Task | Story | Priority |
|------|-------|----------|
| Score update animations | 2.2 | P1 |
| Leaderboard row reorder animations | US-12.1 | P1 |
| Live position change toasts | US-12.4 | P2 |
| Admin sync health panel | US-10.2 | P1 |
| Match Detail live view | US-11.3 | P1 |
| Desktop split-view layout | 2.8 | P2 |
