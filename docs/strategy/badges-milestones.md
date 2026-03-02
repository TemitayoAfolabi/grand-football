# Grand Football — Badges & Milestones System

> **Document Owner:** Strategy & Design Agent
> **Last Updated:** 2026-02-28
> **Status:** Draft (Phase 2 Feature)
> **Feature Type:** Engagement / Gamification

---

## Overview

Badges are collectible achievements that reward users for reaching milestones, demonstrating skill, maintaining consistency, and participating in social features. They add a layer of fun meta-progression on top of the core prediction game.

The system is **non-scoring** — badges do not alter points, rankings, or bonuses. They are purely cosmetic and social: visible on profiles, leaderboards, and in celebration moments. This keeps the competitive integrity of the league intact while adding engagement depth.

### Design Goals

| Goal | How Badges Achieve It |
|------|-----------------------|
| **Increase engagement** | Collecting badges gives users secondary goals beyond winning — even players lower on the leaderboard have things to chase |
| **Reward consistency** | Participation streaks and monthly presence badges incentivize submitting predictions every gameweek |
| **Celebrate rare moments** | Predicting a 0–0 draw or nailing a 4–3 scoreline deserves a trophy case moment |
| **Social proof** | Badges displayed on the leaderboard and profile encourage friendly rivalry and bragging rights |
| **Deepen fun** | Fun badge names and descriptions with football-themed copy make the app feel alive |

### Key Constraints

- **~30 users** — badge criteria must be reachable by a small league, avoiding thresholds tuned for thousands of users.
- **Non-scoring** — badges never award points or alter leaderboard standings.
- **Retroactive** — when the feature launches, users should receive badges for milestones they have already achieved based on historical data.
- **Server-authoritative** — badges are awarded by the backend (Supabase function), never client-side, to prevent manipulation.

---

## 1. User Stories

### US-BDG-1: User Earns a Badge Automatically

**Priority:** P1

**As a** user, **I want to** automatically earn badges when I reach milestones **so that** I feel rewarded for my achievements without extra effort.

**Acceptance Criteria:**

```gherkin
Given I have met the unlock criteria for a badge
When scoring completes for a fixture (or the relevant event fires)
Then the badge is awarded to my profile
And I see a celebration notification on my next page load
And the badge appears in my badge collection

Given I have already earned a badge
When I meet the same criteria again (e.g., another correct score)
Then no duplicate badge is awarded
And no duplicate notification is shown

Given the badge system launches for the first time
When the retroactive scan runs
Then I receive all badges for milestones I have already achieved
And I see a summary: "You earned X badges from your history!"
```

---

### US-BDG-2: User Views Their Badge Collection

**Priority:** P1

**As a** user, **I want to** see all my earned badges and upcoming badges I haven't unlocked yet **so that** I know what I've achieved and what I'm working toward.

**Acceptance Criteria:**

```gherkin
Given I navigate to the Badges section (via profile or dedicated tab)
Then I see my earned badges displayed with name, icon, rarity tier, and date earned
And I see locked badges (greyed out) with their name and unlock criteria
And badges are grouped by category (Accuracy, Streaks, Participation, etc.)

Given I tap on an earned badge
Then I see a detail view with: badge name, description, rarity tier, unlock criteria, date earned

Given I tap on a locked badge
Then I see the unlock criteria and my current progress (e.g., "3 / 5 exact scores")
```

---

### US-BDG-3: User Sees Badges on the Leaderboard

**Priority:** P1

**As a** user, **I want to** see other users' featured badges on the leaderboard **so that** I can compare achievements and feel motivated.

**Acceptance Criteria:**

```gherkin
Given I am viewing the leaderboard
Then each user row shows up to 3 "featured badges" as small icons next to their name

Given I tap on a user's badge icon on the leaderboard
Then I see a tooltip/popover with the badge name and rarity

Given a user has more than 3 badges
Then only their 3 rarest/most recent badges are shown on the leaderboard
And I can view all their badges by tapping their profile
```

---

### US-BDG-4: User Receives Badge Celebration

**Priority:** P2

**As a** user, **I want to** see a fun celebration when I earn a badge **so that** the achievement feels special and memorable.

**Acceptance Criteria:**

```gherkin
Given I have earned a new badge since my last visit
When I load any page in the app
Then a badge celebration modal appears showing:
  - Badge icon (large, animated)
  - Badge name and rarity tier
  - A short congratulatory message
  - A "View Collection" button and a "Dismiss" button

Given I have earned multiple badges since my last visit
Then the celebration shows them one at a time (swipeable) or as a stacked summary
And after dismissing, they are marked as "seen"

Given I dismiss the celebration
Then it does not appear again for the same badge(s)
```

---

### US-BDG-5: User Sets a Featured Badge

**Priority:** P2

**As a** user, **I want to** choose which badges appear next to my name on the leaderboard **so that** I can show off the badges I'm most proud of.

**Acceptance Criteria:**

```gherkin
Given I have earned more than 3 badges
When I navigate to my badge collection
Then I see a "Set Featured" toggle on each badge (max 3)

Given I toggle a 4th badge as featured
Then the oldest featured badge is deselected
And I see a message: "You can feature up to 3 badges"

Given I have not manually set featured badges
Then the system auto-selects my 3 rarest badges (highest tier first, then most recent)
```

---

### US-BDG-6: Admin Views Badge Statistics

**Priority:** P2

**As an** admin, **I want to** see badge award statistics **so that** I can understand engagement and verify the system is working correctly.

**Acceptance Criteria:**

```gherkin
Given I am on the admin panel
When I navigate to the Badge Stats section
Then I see: total badges awarded, badges per category, rarest unearned badges
And a list of most recent badge awards (user + badge + timestamp)

Given I suspect a badge was incorrectly awarded
When I view the badge audit log
Then I see the trigger event that caused the award
```

---

## 2. Badge Rarity Tiers

Four tiers with distinct visual treatment and increasing difficulty:

| Tier | Color Token | Gradient | Glow | Border | Expected % of Users Who Earn |
|------|-------------|----------|------|--------|------------------------------|
| **Common** | `--text-secondary` / `#94A3B8` | None (flat muted bg) | None | `--border-DEFAULT` | 70–100% |
| **Rare** | `--info` / `#3B82F6` | `linear-gradient(135deg, #3B82F6 0%, #1D4ED8 100%)` | `0 0 12px rgba(59,130,246,0.3)` | `#3B82F6` | 30–60% |
| **Epic** | `#A855F7` (purple) | `linear-gradient(135deg, #A855F7 0%, #7C3AED 100%)` | `0 0 16px rgba(168,85,247,0.35)` | `#A855F7` | 10–30% |
| **Legendary** | `--gold` / `#F5C518` | `gradient-gold` (`linear-gradient(135deg, #F5C518 0%, #D4A017 100%)`) | `0 0 20px rgba(245,197,24,0.4)` | `#F5C518` | < 10% |

### Visual Differentiation

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  COMMON          RARE            EPIC           LEGENDARY       │
│  ┌──────┐       ┌──────┐       ┌──────┐       ┌──────┐        │
│  │  ○   │       │  ◈   │       │  ◆   │       │  ★   │        │
│  │ gray │       │ blue │       │purple│       │ gold │        │
│  │ flat │       │ glow │       │ glow │       │ glow │        │
│  │      │       │      │       │pulse │       │pulse │        │
│  └──────┘       └──────┘       └──────┘       └──────┘        │
│  No border      Blue border    Purple border  Gold border      │
│  Static         Static         Subtle pulse   Shimmer + pulse  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

- **Common:** Flat `--surface-elevated` background, muted icon tint, no animation.
- **Rare:** Blue-tinted background (`--info-muted`), soft glow shadow, icon in `--info` color.
- **Epic:** Purple-tinted background (`rgba(168,85,247,0.15)`), moderate glow, subtle 3s pulse animation on the glow.
- **Legendary:** Gold-tinted background (`--gold-muted`), strong glow, shimmer animation (diagonal light sweep every 4s) + gentle pulse.

### Small Badge Icon (Leaderboard)

| Tier | Size | Shape | Treatment |
|------|------|-------|-----------|
| Common | 20×20px | Circle | Gray fill, muted icon |
| Rare | 20×20px | Circle | Blue ring border |
| Epic | 20×20px | Circle | Purple ring + subtle glow |
| Legendary | 22×22px | Circle | Gold ring + shimmer |

### New CSS Tokens

| Token | Value | Usage |
|-------|-------|-------|
| `--badge-common` | `#94A3B8` | Common badge accent |
| `--badge-common-muted` | `rgba(148, 163, 184, 0.15)` | Common badge background |
| `--badge-rare` | `#3B82F6` | Rare badge accent |
| `--badge-rare-muted` | `rgba(59, 130, 246, 0.15)` | Rare badge background |
| `--badge-epic` | `#A855F7` | Epic badge accent |
| `--badge-epic-muted` | `rgba(168, 85, 247, 0.15)` | Epic badge background |
| `--badge-legendary` | `#F5C518` | Legendary badge accent (= `--gold`) |
| `--badge-legendary-muted` | `rgba(245, 197, 24, 0.15)` | Legendary badge background (= `--gold-muted`) |

---

## 3. Badge Categories & Definitions

### 3.1 Accuracy Badges

Awarded for correct score predictions (`reason_code = 'EXACT_SCORE'` or `'STAR_EXACT'`).

| Badge | Tier | Icon | Unlock Criteria | Description |
|-------|------|------|-----------------|-------------|
| **First Blood** | Common | 🎯 | Get your first exact score prediction correct | "Everyone remembers their first." |
| **Sharp Shooter** | Common | 🎯🎯 | Get 5 exact score predictions correct (cumulative, season) | "Five nailed — you're dialing in." |
| **Sniper** | Rare | 🔫 | Get 15 exact score predictions correct (cumulative, season) | "Clinical. Deadly. 15 bullseyes." |
| **Oracle** | Epic | 🔮 | Get 30 exact score predictions correct (cumulative, season) | "You don't predict the future — you write it." |
| **Psychic** | Legendary | 🧠 | Get 50 exact score predictions correct (cumulative, season) | "50 exact scores. Are you from the future?" |
| **Star Sniper** | Rare | ⭐🎯 | Get 5 exact score predictions correct on Star Games | "You thrive under the bright lights." |
| **Star Master** | Epic | ⭐⭐ | Get 15 exact score predictions correct on Star Games | "Star Games? More like YOUR games." |

### 3.2 Outcome Badges

Awarded for correct outcome predictions (`reason_code IN ('OUTCOME', 'STAR_OUTCOME', 'EXACT_SCORE', 'STAR_EXACT')`).

| Badge | Tier | Icon | Unlock Criteria | Description |
|-------|------|------|-----------------|-------------|
| **Good Eye** | Common | 👀 | Get 10 correct outcomes (including exact scores) in a season | "You can read the game." |
| **Trend Setter** | Rare | 📈 | Get 50 correct outcomes in a season | "50 right calls. The stats don't lie." |
| **The Analyst** | Epic | 📊 | Get 100 correct outcomes in a season | "100 outcomes called. Pundits wish they were you." |

### 3.3 Streak Badges

Awarded for consecutive gameweeks where the user scores at least one exact score, or consecutive correct outcomes within a gameweek.

| Badge | Tier | Icon | Unlock Criteria | Description |
|-------|------|------|-----------------|-------------|
| **Hot Streak** | Common | 🔥 | Get at least 1 exact score in 3 consecutive gameweeks | "Three in a row — you're heating up." |
| **On Fire** | Rare | 🔥🔥 | Get at least 1 exact score in 5 consecutive gameweeks | "Five weeks running. Someone call the fire brigade." |
| **Unstoppable** | Epic | 🔥🔥🔥 | Get at least 1 exact score in 8 consecutive gameweeks | "Eight weeks of perfection. Unstoppable force." |
| **Perfect Gameweek** | Epic | 💯 | Get every prediction correct (exact or outcome) in a single gameweek with ≥5 fixtures | "A whole gameweek without a wrong call. Flawless." |

### 3.4 Participation & Consistency Badges

Awarded for submitting predictions consistently.

| Badge | Tier | Icon | Unlock Criteria | Description |
|-------|------|------|-----------------|-------------|
| **Committed** | Common | 📝 | Submit predictions for every fixture in 5 consecutive gameweeks | "Five weeks, zero missed. That's commitment." |
| **Iron Will** | Rare | 🛡️ | Submit predictions for every fixture in 15 consecutive gameweeks | "15 gameweeks straight — nothing gets past you." |
| **Ever Present** | Epic | 🏛️ | Submit predictions for every fixture in an entire season (all 38 gameweeks) | "38 gameweeks. Not one missed. A true ever-present." |
| **Bonus Hunter** | Common | 💰 | Earn the monthly prediction bonus 3 times in a season | "Three bonus months — the grind pays off." |
| **Bonus King** | Rare | 👑💰 | Earn the monthly prediction bonus in every month of the season (Aug–May) | "Every single month. Relentless consistency." |

### 3.5 Leaderboard & Ranking Badges

Awarded based on leaderboard standings. Checked at the end of each gameweek/season.

| Badge | Tier | Icon | Unlock Criteria | Description |
|-------|------|------|-----------------|-------------|
| **Podium Finish** | Common | 🏅 | Finish in the top 3 of any gameweek leaderboard | "Your first taste of the podium." |
| **Gameweek Champion** | Rare | 🏆 | Finish 1st in any gameweek leaderboard | "Champions of the week!" |
| **Serial Winner** | Epic | 🏆🏆 | Win 5 gameweek leaderboards in a season | "Five crowns in one season. Dynasty mode." |
| **Season Runner-Up** | Rare | 🥈 | Finish 2nd in the overall season standings | "So close. Use it as fuel." |
| **Season Champion** | Legendary | 🏆👑 | Finish 1st in the overall season standings | "The undisputed champion. Legend status." |
| **Top 3 Season** | Rare | 🥉 | Finish in the top 3 of the overall season standings | "A podium season — you belong at the top." |
| **Back-to-Back** | Legendary | 🏆🏆👑 | Win the season championship in 2 consecutive seasons | "Consecutive titles. A true dynasty." |

### 3.6 Social & Voting Badges

Awarded for participation in Star Man and Star Games voting.

| Badge | Tier | Icon | Unlock Criteria | Description |
|-------|------|------|-----------------|-------------|
| **Citizen** | Common | 🗳️ | Cast your first Star Games vote | "Democracy in action." |
| **Regular Voter** | Common | 🗳️✓ | Cast Star Games votes in 10 gameweeks | "Your voice matters — and you use it." |
| **Kingmaker** | Rare | 👑🗳️ | Cast Star Games votes in 30 gameweeks | "30 votes. You shape the game." |
| **Star Man Scout** | Common | 🌟 | Cast your first Star Man vote | "You've picked your star." |
| **Star Whisperer** | Rare | 🌟🔮 | Vote for the winning Star Man nominee | "You called the Star Man before anyone." |

### 3.7 Fun & Rare Situation Badges

Awarded for predicting unusual or specific scorelines correctly.

| Badge | Tier | Icon | Unlock Criteria | Description |
|-------|------|------|-----------------|-------------|
| **Nil-Nil Nostradamus** | Rare | 🚫⚽ | Correctly predict a 0–0 draw (exact score) | "The bravest prediction: nothing happens." |
| **Goalfest Guru** | Rare | ⚽⚽⚽ | Correctly predict an exact score where total goals ≥ 6 (e.g., 4–2, 3–3) | "Chaos merchant. You saw the goals coming." |
| **Giant Killer** | Rare | 🗡️ | Correctly predict an exact away win with a 2+ goal margin where the away team is bottom half (based on league table at the time) | "Nobody believed the upset — except you." |
| **Contrarian** | Rare | 🔄 | Be the **only** user in the league to correctly predict the exact score for a fixture | "When you stood alone and got it right." |
| **Heartbreaker** | Common | 💔 | Predict the correct outcome but be off by exactly 1 goal in both home and away scores (e.g., predicted 2–1, actual 3–2) | "So close it hurts." |
| **BTTS Specialist** | Rare | ↔️ | Earn the BTTS Reverse bonus 10 times in a season | "Wrong result, right vibes. 10 BTTS rescues." |
| **The Underdog** | Epic | 🐺 | Go from last place in the season standings to top half by end of a season | "Written off. Wrote back." |
| **Early Bird** | Common | 🐤 | Submit a prediction more than 7 days before kickoff | "Prepared. Confident. Early." |
| **Squeaky Bum Time** | Common | ⏰ | Submit a prediction within 5 minutes of the lockout deadline | "Just in time. Barely." |

### 3.8 Milestone Badges

Awarded for cumulative all-time achievements across seasons.

| Badge | Tier | Icon | Unlock Criteria | Description |
|-------|------|------|-----------------|-------------|
| **Century** | Rare | 💯 | Earn 100 total points in a single season | "Triple digits. The ton is up." |
| **Double Century** | Epic | 2️⃣💯 | Earn 200 total points in a single season | "200 points? That's generational talent." |
| **Veteran** | Common | ⚔️ | Complete 2 full seasons | "Two seasons deep. You're a veteran now." |
| **Grand Master** | Legendary | 🎖️ | Complete 5 full seasons | "Five seasons. A Grand Football institution." |
| **1000 Club** | Legendary | 🏅1K | Earn 1,000 total points across all seasons | "One thousand points. Elite company." |

---

## 4. UI/UX Design Spec

### 4.1 Where Badges Appear

| Location | Display Format | Details |
|----------|---------------|---------|
| **Leaderboard (rows)** | Up to 3 small badge icons (20px) next to display name | Auto-selected (rarest) or user-chosen featured badges |
| **Profile / Badge Collection** | Full grid of all badges, grouped by category | Earned badges in full color; locked badges greyed with progress |
| **Badge Celebration Modal** | Large animated badge icon (80px) with backdrop blur | Triggered on first page load after earning a badge |
| **Match Detail** | Micro-badge if the fixture triggered a badge (e.g., "Nil-Nil Nostradamus" next to the 0–0 result) | Only shown for the user who earned it |
| **Dashboard (Recent)** | "Latest Badge" chip in the user's stat summary area | Shows most recently earned badge with date |
| **Podium / Season End** | Special display of Season Champion / Runner-Up badges | Larger, animated, integrated into the podium component |

### 4.2 Badge Collection Screen

Accessible from the bottom nav (new "Badges" icon under Profile or as a Profile sub-screen) or via Settings.

```
┌─────────────────────────────────────────────┐
│  ← Badges                          [All ▾]  │
│─────────────────────────────────────────────│
│                                             │
│  ┌─────────────── Progress ──────────────┐  │
│  │  🏅 14 / 38 badges earned             │  │
│  │  ████████████░░░░░░░░░  37%           │  │
│  │  Common: 8  Rare: 4  Epic: 2  Leg: 0 │  │
│  └───────────────────────────────────────┘  │
│                                             │
│  ── 🎯 ACCURACY ──────────────────────────  │
│                                             │
│  ┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐   │
│  │  🎯  │  │  🎯🎯│  │  🔫  │  │ 🔮░░ │   │
│  │First │  │Sharp │  │Sniper│  │Oracle│   │
│  │Blood │  │Shoot.│  │      │  │3/30  │   │
│  │ ✅   │  │ ✅   │  │ ✅   │  │ 🔒   │   │
│  └──────┘  └──────┘  └──────┘  └──────┘   │
│                                             │
│  ── 🔥 STREAKS ───────────────────────────  │
│                                             │
│  ┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐   │
│  │  🔥  │  │ 🔥🔥░│  │🔥🔥🔥│  │  💯  │   │
│  │ Hot  │  │  On  │  │Unstop│  │Perfct│   │
│  │Streak│  │ Fire │  │pable │  │  GW  │   │
│  │ ✅   │  │ 3/5  │  │ 🔒   │  │ 🔒   │   │
│  └──────┘  └──────┘  └──────┘  └──────┘   │
│                                             │
│  ── 🏆 LEADERBOARD ──────────────────────  │
│  ...                                        │
└─────────────────────────────────────────────┘
```

**Badge Card States:**

| State | Visual | Content |
|-------|--------|---------|
| **Earned** | Full-color icon, tier-colored border, ✅ indicator | Badge name, earned date, tier label |
| **In Progress** | Semi-transparent icon, progress bar below | Badge name, progress (e.g., "3/5"), tier label |
| **Locked** | Greyscale icon, dashed border, 🔒 indicator | Badge name, criteria summary, tier label |

### 4.3 Badge Celebration Modal

```
┌─────────────────────────────────────────────┐
│                                             │
│          ✨  backdrop-blur overlay  ✨       │
│                                             │
│        ┌─────────────────────────┐          │
│        │                         │          │
│        │      ✦ NEW BADGE ✦     │          │
│        │                         │          │
│        │         ┌────┐          │          │
│        │         │ 🎯 │  ← 80px │          │
│        │         │    │  animated│          │
│        │         └────┘          │          │
│        │                         │          │
│        │    "First Blood"        │          │
│        │    ── COMMON ──         │          │
│        │                         │          │
│        │  "Everyone remembers    │          │
│        │   their first."         │          │
│        │                         │          │
│        │  ┌─────────────────┐    │          │
│        │  │ View Collection │    │          │
│        │  └─────────────────┘    │          │
│        │  ┌─────────────────┐    │          │
│        │  │     Dismiss     │    │          │
│        │  └─────────────────┘    │          │
│        └─────────────────────────┘          │
│                                             │
└─────────────────────────────────────────────┘
```

**Animation sequence** (total ~1.2s):

1. Backdrop fades in (200ms, `ease-out`)
2. Badge icon scales from 0 → 1.15 → 1.0 (spring-like bounce, 400ms)
3. Tier-colored particle burst around the badge (CSS keyframes, 300ms) — gold particles for Legendary, purple for Epic, blue sparks for Rare, subtle gray shimmer for Common
4. Text fades in from below (200ms, `ease-out`, 200ms delay after icon lands)
5. Buttons fade in (200ms, staggered 100ms each)

**For Legendary badges:** Add a slow shimmer animation that loops on the badge icon after the entrance animation settles.

### 4.4 Leaderboard Badge Display

```
┌──────────────────────────────────────────────┐
│ #  Name                 Badges      Points   │
│──────────────────────────────────────────────│
│ 1  🥇 Temi             🏆 🔮 🔥    187      │
│ 2  🥈 Chidi             🎯 🛡️ 🗳️    174      │
│ 3  🥉 Fola              🏅 🔫 💰    168      │
│ 4     Ade               🎯 👀       155      │
│ 5     Buki              🎯          142      │
│──────────────────────────────────────────────│
```

- Badge icons are rendered as 20×20px circles with tier-colored borders.
- On tap/hover, a popover shows badge name and tier.
- If a user has 0 badges, the space is left empty (no placeholder).

### 4.5 Dashboard "Latest Badge" Chip

Displayed in the user's stat summary area near rank and points:

```
┌──────────────────────────────────────┐
│  Your Rank: #4        Total: 155 pts │
│  Latest Badge: 🔫 Sniper (Rare)     │
└──────────────────────────────────────┘
```

Tapping the chip navigates to the badge collection screen.

### 4.6 Badge Detail Sheet (Bottom Sheet on Mobile)

```
┌─────────────────────────────────────────────┐
│                                             │
│         ┌────┐                              │
│         │ 🔮 │  80px, tier-colored ring     │
│         └────┘                              │
│                                             │
│         Oracle                              │
│         ── EPIC ──                          │
│                                             │
│  "You don't predict the future              │
│   — you write it."                          │
│                                             │
│  ┌─────────────────────────────────┐        │
│  │ Criteria: 30 exact scores in    │        │
│  │           a season              │        │
│  │ Progress: 22 / 30              │        │
│  │ ███████████████░░░░░  73%       │        │
│  └─────────────────────────────────┘        │
│                                             │
│  Earned: Not yet                            │
│  Category: Accuracy                         │
│                                             │
└─────────────────────────────────────────────┘
```

For earned badges, replace the progress section with:

```
│  Earned: 14 March 2026                      │
│  Category: Accuracy                         │
│  Trigger: Chelsea 2–1 Wolves (GW 30)       │
```

---

## 5. Notification & Celebration Strategy

### 5.1 Notification Channels

| Channel | Trigger | Format |
|---------|---------|--------|
| **In-App Celebration Modal** | User loads any page after earning a badge | Full modal with animation (see §4.3) |
| **In-App Toast** | Fallback for repeat visits / less disruptive option | Small toast at top: "🎯 You earned First Blood!" (auto-dismiss 5s) |
| **Push Notification (Phase 3)** | Badge earned while user is not active | "[App] 🏆 You earned a new badge: Sniper!" |

### 5.2 Celebration Tier Scaling

| Tier | Celebration Level | Details |
|------|-------------------|---------|
| **Common** | Subtle | Modal with simple fade-in, small particle burst. Auto-dismiss after 5s if untapped. |
| **Rare** | Moderate | Modal with bounce animation, blue particle burst. Stays until dismissed. |
| **Epic** | Impactful | Modal with bounce + purple glow pulse, larger particle effect. Screen edges flash purple briefly. |
| **Legendary** | Maximum | Full-screen takeover: confetti rain animation (gold + white), dramatic zoom-in on badge, shimmer loops on badge icon. Stays until dismissed. Optional: brief haptic vibration on supported devices. |

### 5.3 Celebration Queue

If multiple badges are earned simultaneously (e.g., after retroactive scan or a big gameweek):

1. Badges are queued in order: Legendary → Epic → Rare → Common.
2. After the first celebration is dismissed, the next one auto-appears (500ms delay between).
3. A "Skip All" button appears after the 2nd badge for convenience.
4. Maximum 5 individual celebrations; if >5, show the top 5 rarest and summarize the rest: "...and 3 more Common badges!"

### 5.4 Seen Tracking

- A `badge_awards.seen_at` column tracks whether the user has seen the celebration.
- On page load, the client queries for `seen_at IS NULL` records.
- After dismissing, the client calls an API to set `seen_at = NOW()`.
- This is eventually consistent — if the API call fails, the celebration may re-show on the next visit (acceptable).

---

## 6. Database Schema

### 6.1 New Tables

```sql
-- Badge definitions (seeded, not user-modifiable)
CREATE TABLE public.badge_definitions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        text NOT NULL UNIQUE,
  name        text NOT NULL,
  description text NOT NULL,
  category    text NOT NULL CHECK (category IN (
    'ACCURACY', 'OUTCOME', 'STREAK', 'PARTICIPATION',
    'LEADERBOARD', 'SOCIAL', 'FUN', 'MILESTONE'
  )),
  tier        text NOT NULL CHECK (tier IN ('COMMON', 'RARE', 'EPIC', 'LEGENDARY')),
  icon        text NOT NULL,              -- emoji or icon identifier
  criteria    jsonb NOT NULL DEFAULT '{}', -- machine-readable criteria for engine
  sort_order  integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.badge_definitions
  IS 'Static badge catalog. Seeded via migration. Admin cannot create badges (v1).';

-- Badge awards (one per user per badge)
CREATE TABLE public.badge_awards (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  badge_id        uuid NOT NULL REFERENCES public.badge_definitions(id) ON DELETE CASCADE,
  season_id       uuid REFERENCES public.seasons(id),  -- NULL for all-time badges
  trigger_fixture uuid REFERENCES public.fixtures(id), -- NULL for non-fixture badges
  trigger_detail  jsonb DEFAULT '{}',     -- extra context (e.g., {"gameweek": 12, "score": "0-0"})
  is_featured     boolean NOT NULL DEFAULT false,
  seen_at         timestamptz,            -- NULL = celebration not yet shown
  awarded_at      timestamptz NOT NULL DEFAULT now(),

  UNIQUE (user_id, badge_id, season_id)   -- one award per badge per season (or all-time if season_id IS NULL)
);

CREATE INDEX idx_badge_awards_user ON public.badge_awards (user_id);
CREATE INDEX idx_badge_awards_unseen ON public.badge_awards (user_id) WHERE seen_at IS NULL;
CREATE INDEX idx_badge_awards_featured ON public.badge_awards (user_id) WHERE is_featured = true;

COMMENT ON TABLE public.badge_awards
  IS 'Tracks which users have earned which badges, when, and whether celebration was seen.';
```

### 6.2 RLS Policies

```sql
ALTER TABLE public.badge_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.badge_awards ENABLE ROW LEVEL SECURITY;

-- Badge definitions: everyone can read
CREATE POLICY "badge_definitions_select_all"
  ON public.badge_definitions FOR SELECT
  TO authenticated
  USING (true);

-- Badge awards: everyone can see all awards (public leaderboard display)
CREATE POLICY "badge_awards_select_all"
  ON public.badge_awards FOR SELECT
  TO authenticated
  USING (true);

-- Badge awards: only the system/service role inserts (never client)
-- No INSERT policy for authenticated — awards are server-side only

-- Badge awards: users can update their own (for is_featured, seen_at)
CREATE POLICY "badge_awards_update_own"
  ON public.badge_awards FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
```

### 6.3 Badge Evaluation Function (Supabase Edge Function / Postgres)

The badge engine runs **after scoring completes** for a fixture. It evaluates all badge criteria for all affected users.

```
Trigger flow:
  fixture finishes → scoring engine runs → badge engine runs
                                          ↓
                          For each user with a score_record for this fixture:
                            → Check accuracy badges (count exact scores)
                            → Check streak badges (consecutive GW exact scores)
                            → Check fun badges (0-0, high-scoring, contrarian, etc.)
                            → Check participation badges (consecutive GW predictions)
                            → Check leaderboard badges (after GW standings computed)
                            → Check social badges (voting history)
                            → Check milestone badges (cumulative points)
                          ↓
                          Upsert into badge_awards (idempotent — skip if already earned)
```

### 6.4 Admin Audit Log Extension

Add new action type to the `admin_audit_log.action` check constraint:

```sql
ALTER TABLE public.admin_audit_log
  DROP CONSTRAINT admin_audit_log_action_check,
  ADD CONSTRAINT admin_audit_log_action_check
    CHECK (action IN (
      'TOGGLE_STAR', 'OVERRIDE_RESULT', 'RECALCULATE',
      'ADD_USER', 'REMOVE_USER', 'NEW_SEASON',
      'RETROACTIVE_BADGE_SCAN', 'REVOKE_BADGE'
    ));
```

---

## 7. Badge Evaluation Logic (Pseudocode)

### 7.1 After Fixture Scoring

```typescript
async function evaluateBadgesAfterFixture(fixtureId: string) {
  const fixture = await getFixture(fixtureId);
  const scoreRecords = await getScoreRecordsForFixture(fixtureId);

  for (const record of scoreRecords) {
    const userId = record.user_id;

    // --- ACCURACY BADGES ---
    const exactCount = await countExactScores(userId, fixture.season_id);
    awardIfThreshold(userId, 'first-blood', exactCount >= 1, fixture);
    awardIfThreshold(userId, 'sharp-shooter', exactCount >= 5, fixture);
    awardIfThreshold(userId, 'sniper', exactCount >= 15, fixture);
    awardIfThreshold(userId, 'oracle', exactCount >= 30, fixture);
    awardIfThreshold(userId, 'psychic', exactCount >= 50, fixture);

    const starExactCount = await countStarExactScores(userId, fixture.season_id);
    awardIfThreshold(userId, 'star-sniper', starExactCount >= 5, fixture);
    awardIfThreshold(userId, 'star-master', starExactCount >= 15, fixture);

    // --- OUTCOME BADGES ---
    const outcomeCount = await countCorrectOutcomes(userId, fixture.season_id);
    awardIfThreshold(userId, 'good-eye', outcomeCount >= 10, fixture);
    awardIfThreshold(userId, 'trend-setter', outcomeCount >= 50, fixture);
    awardIfThreshold(userId, 'the-analyst', outcomeCount >= 100, fixture);

    // --- STREAK BADGES ---
    const exactStreak = await getConsecutiveGWExactStreak(userId, fixture.season_id);
    awardIfThreshold(userId, 'hot-streak', exactStreak >= 3, fixture);
    awardIfThreshold(userId, 'on-fire', exactStreak >= 5, fixture);
    awardIfThreshold(userId, 'unstoppable', exactStreak >= 8, fixture);

    // --- FUN BADGES ---
    if (record.reason_code === 'EXACT_SCORE' || record.reason_code === 'STAR_EXACT') {
      if (fixture.home_score === 0 && fixture.away_score === 0) {
        award(userId, 'nil-nil-nostradamus', fixture);
      }
      if ((fixture.home_score + fixture.away_score) >= 6) {
        award(userId, 'goalfest-guru', fixture);
      }
    }

    // Contrarian: only one person got exact score
    const exactCountForFixture = scoreRecords.filter(
      r => r.reason_code === 'EXACT_SCORE' || r.reason_code === 'STAR_EXACT'
    ).length;
    if (exactCountForFixture === 1 &&
        (record.reason_code === 'EXACT_SCORE' || record.reason_code === 'STAR_EXACT')) {
      award(userId, 'contrarian', fixture);
    }

    // Heartbreaker
    if (record.reason_code === 'OUTCOME' || record.reason_code === 'STAR_OUTCOME') {
      if (Math.abs(record.predicted_home - fixture.home_score) === 1 &&
          Math.abs(record.predicted_away - fixture.away_score) === 1) {
        award(userId, 'heartbreaker', fixture);
      }
    }

    // BTTS Specialist
    const bttsCount = await countBTTSReverse(userId, fixture.season_id);
    awardIfThreshold(userId, 'btts-specialist', bttsCount >= 10, fixture);

    // --- MILESTONE BADGES ---
    const totalPoints = await getSeasonTotalPoints(userId, fixture.season_id);
    awardIfThreshold(userId, 'century', totalPoints >= 100, fixture);
    awardIfThreshold(userId, 'double-century', totalPoints >= 200, fixture);
  }

  // --- PERFECT GAMEWEEK (check after all fixtures in the GW are scored) ---
  if (await isGameweekFullyScored(fixture.season_id, fixture.gameweek)) {
    await evaluatePerfectGameweek(fixture.season_id, fixture.gameweek);
  }
}
```

### 7.2 After Gameweek Ends (Leaderboard-Based)

```typescript
async function evaluateBadgesAfterGameweek(seasonId: string, gameweek: number) {
  const standings = await getGameweekStandings(seasonId, gameweek);

  // Gameweek winners and podium
  for (const entry of standings) {
    if (entry.rank <= 3) {
      award(entry.userId, 'podium-finish', null);
    }
    if (entry.rank === 1) {
      award(entry.userId, 'gameweek-champion', null);
    }
  }

  // Serial Winner
  for (const entry of standings.filter(e => e.rank === 1)) {
    const gwWins = await countGameweekWins(entry.userId, seasonId);
    awardIfThreshold(entry.userId, 'serial-winner', gwWins >= 5, null);
  }
}
```

### 7.3 After Season Ends

```typescript
async function evaluateBadgesAfterSeason(seasonId: string) {
  const finalStandings = await getSeasonFinalStandings(seasonId);

  for (const entry of finalStandings) {
    if (entry.rank === 1) award(entry.userId, 'season-champion', null);
    if (entry.rank === 2) award(entry.userId, 'season-runner-up', null);
    if (entry.rank <= 3)  award(entry.userId, 'top-3-season', null);

    // Back-to-Back
    if (entry.rank === 1) {
      const prevSeason = await getPreviousSeason(seasonId);
      if (prevSeason) {
        const prevWinner = await getSeasonWinner(prevSeason.id);
        if (prevWinner === entry.userId) {
          award(entry.userId, 'back-to-back', null);
        }
      }
    }

    // Ever Present
    const totalGW = await getTotalGameweeks(seasonId);
    const predictedGW = await getGameweeksWithFullPredictions(entry.userId, seasonId);
    if (predictedGW >= totalGW) {
      award(entry.userId, 'ever-present', null);
    }

    // Bonus King
    const bonusMonths = await countMonthlyBonusesEarned(entry.userId, seasonId);
    const totalSeasonMonths = 10; // Aug–May
    awardIfThreshold(entry.userId, 'bonus-hunter', bonusMonths >= 3, null);
    if (bonusMonths >= totalSeasonMonths) {
      award(entry.userId, 'bonus-king', null);
    }

    // The Underdog
    const wasLastAtAnyPoint = await wasEverLastPlace(entry.userId, seasonId);
    if (wasLastAtAnyPoint && entry.rank <= Math.ceil(finalStandings.length / 2)) {
      award(entry.userId, 'the-underdog', null);
    }

    // Veteran & Grand Master
    const completedSeasons = await countCompletedSeasons(entry.userId);
    awardIfThreshold(entry.userId, 'veteran', completedSeasons >= 2, null);
    awardIfThreshold(entry.userId, 'grand-master', completedSeasons >= 5, null);

    // 1000 Club
    const allTimePoints = await getAllTimePoints(entry.userId);
    awardIfThreshold(entry.userId, '1000-club', allTimePoints >= 1000, null);
  }
}
```

### 7.4 Participation Badges (Checked per Gameweek)

```typescript
async function evaluateParticipationBadges(userId: string, seasonId: string, gameweek: number) {
  const consecutiveFullGW = await getConsecutiveFullPredictionGW(userId, seasonId, gameweek);
  awardIfThreshold(userId, 'committed', consecutiveFullGW >= 5, null);
  awardIfThreshold(userId, 'iron-will', consecutiveFullGW >= 15, null);
}
```

### 7.5 Timing Badges (Checked on Prediction Submit)

```typescript
async function evaluateTimingBadges(userId: string, fixtureId: string, submittedAt: Date) {
  const fixture = await getFixture(fixtureId);
  const msBeforeKickoff = fixture.kickoff_time.getTime() - submittedAt.getTime();

  // Early Bird: > 7 days before kickoff
  if (msBeforeKickoff > 7 * 24 * 60 * 60 * 1000) {
    award(userId, 'early-bird', fixture);
  }

  // Squeaky Bum Time: < 5 minutes before kickoff
  if (msBeforeKickoff > 0 && msBeforeKickoff < 5 * 60 * 1000) {
    award(userId, 'squeaky-bum-time', fixture);
  }
}
```

---

## 8. Accessibility Considerations

### 8.1 Color Independence

Every badge tier MUST be distinguishable without relying on color alone:

| Tier | Color | Non-Color Indicator |
|------|-------|---------------------|
| Common | Gray | Text label "COMMON" + no border decoration |
| Rare | Blue | Text label "RARE" + single ring border |
| Epic | Purple | Text label "EPIC" + double ring border |
| Legendary | Gold | Text label "LEGENDARY" + star-shaped border decoration |

### 8.2 ARIA & Screen Reader Support

```html
<!-- Badge icon on leaderboard -->
<span
  role="img"
  aria-label="Sniper badge, Rare tier, earned February 14 2026"
  class="badge-icon badge-rare"
>
  🔫
</span>

<!-- Badge collection item -->
<article
  role="listitem"
  aria-label="Oracle badge, Epic tier, 22 of 30 exact scores needed, 73% progress"
>
  ...
</article>

<!-- Locked badge -->
<article
  role="listitem"
  aria-label="Psychic badge, Legendary tier, locked. Requires 50 exact scores in a season. Current progress: 22 of 50."
  aria-disabled="true"
>
  ...
</article>

<!-- Celebration modal -->
<dialog
  role="alertdialog"
  aria-label="New badge earned: First Blood, Common tier"
  aria-describedby="badge-celebration-desc"
>
  <p id="badge-celebration-desc">Everyone remembers their first. You got your first exact score prediction correct.</p>
  ...
</dialog>
```

### 8.3 Animation Accessibility

- **`prefers-reduced-motion`:** All badge animations (celebration entrance, shimmer, pulse, confetti) are replaced with simple fade-in/opacity changes.
- Confetti rain is completely disabled under reduced motion.
- The celebration modal still appears — only the entrance animation is simplified.

```css
@media (prefers-reduced-motion: reduce) {
  .badge-celebrate { animation: fade-in 200ms ease-out; }
  .badge-shimmer { animation: none; }
  .badge-pulse { animation: none; }
  .confetti { display: none; }
}
```

### 8.4 Keyboard & Focus

- Badge collection grid is navigable via arrow keys (`role="grid"` or `role="list"` with roving tabindex).
- The celebration modal traps focus. `Escape` dismisses it. Focus returns to the trigger element.
- Featured badge toggles are operable via `Space`/`Enter`.
- All badge counts and progress indicators are announced as live regions when updated.

### 8.5 Contrast Compliance

| Element | Foreground | Background | Ratio | Pass |
|---------|-----------|------------|-------|------|
| Common tier label | `#94A3B8` | `--surface-DEFAULT` (#1A2235) | 4.6:1 | ✅ AA |
| Rare tier label | `#3B82F6` | `--surface-DEFAULT` (#1A2235) | 4.1:1 | ✅ AA (large text; label is 14px bold) |
| Epic tier label | `#A855F7` | `--surface-DEFAULT` (#1A2235) | 5.2:1 | ✅ AA |
| Legendary tier label | `#F5C518` | `--surface-DEFAULT` (#1A2235) | 8.9:1 | ✅ AAA |
| Progress bar filled | `--accent-DEFAULT` / tier color | `--bg-secondary` | ≥ 3.0:1 | ✅ AA (graphical) |
| Badge name text | `--text-primary` (#F1F5F9) | `--surface-DEFAULT` (#1A2235) | 13.2:1 | ✅ AAA |

---

## 9. Edge Cases

### 9.1 Retroactive Badge Awards

**Scenario:** Badge system launches mid-season with existing user data.

| Aspect | Handling |
|--------|---------|
| **Trigger** | Admin runs a one-time "Retroactive Badge Scan" from the admin panel. |
| **Process** | The badge engine iterates over all historical `score_records`, `predictions`, `monthly_bonuses`, and leaderboard snapshots to evaluate every badge for every user. |
| **Awards** | All earned badges are inserted with `awarded_at = NOW()` (not the historical date, to avoid confusion). |
| **Celebration** | Users see a summary: "Welcome to Badges! You earned X badges from your history!" (single modal, not X individual celebrations). |
| **Audit** | An `admin_audit_log` entry (`RETROACTIVE_BADGE_SCAN`) records the scan with metadata: `{ "badges_awarded": 47, "users_affected": 28 }`. |
| **Idempotency** | Running the scan multiple times is safe — the `UNIQUE (user_id, badge_id, season_id)` constraint prevents duplicates. |

### 9.2 Season Reset

**Scenario:** A new season starts. How do seasonal badges reset?

| Aspect | Handling |
|--------|---------|
| **Season-scoped badges** (accuracy counts, streaks, participation) | Reset with the new season. Users must re-earn them. The `season_id` column differentiates awards across seasons. |
| **All-time badges** (Veteran, Grand Master, 1000 Club) | Never reset. `season_id = NULL` for these. |
| **Leaderboard badges** (Season Champion, etc.) | Awarded once per season. Carry forward permanently as earned. |
| **Display** | The badge collection shows the current season's badges by default, with a dropdown to view past seasons' badges. All-time badges appear in every season view. |

### 9.3 Tied Gameweek Winner

**Scenario:** Two users tie for 1st place in a gameweek.

| Handling |
|---------|
| Both users receive the "Gameweek Champion" badge. The tie-breaking rules (exact scores > outcomes > fewest zeros) apply to determine the single #1 position, but for badge purposes, all users sharing the rank earn the badge. |

**Alternative (if strict):** Apply the same tie-breaking as the leaderboard — only the user who wins after tie-breaking gets the badge. **Recommended:** Award to all tied users (more generous, more fun for a small league).

### 9.4 User Joins Mid-Season

**Scenario:** A new user is added to the allowlist mid-season.

| Aspect | Handling |
|--------|---------|
| **Badges** | They start with 0 badges. Season-scoped badges begin counting from their first fixture. |
| **Ever Present** | They cannot earn "Ever Present" for this season (they missed early gameweeks). |
| **Streaks** | Streaks start from their first prediction. No penalty for gameweeks before they joined. |
| **Retroactive** | No retroactive awards (they have no historical data). |

### 9.5 Badge Awarded During Scoring Recalculation

**Scenario:** Admin triggers a recalculation for a fixture (e.g., wrong score was synced, then corrected).

| Aspect | Handling |
|--------|---------|
| **Recalculation** | The badge engine re-runs for all affected users after the corrected scoring. |
| **New badges** | If the recalculation causes a user to newly meet a badge threshold (e.g., they now have 5 exact scores instead of 4), the badge is awarded. |
| **Lost badges** | If the recalculation drops a user below a threshold (e.g., the corrected score means their prediction was wrong), the badge is **NOT revoked** automatically. Badge revocation requires explicit admin action. |
| **Rationale** | Revoking badges feels punishing and the edge case is rare. If the admin needs to revoke, they can do so manually with an audit log entry. |

### 9.6 Postponed / Cancelled Fixture

**Scenario:** A fixture is postponed or cancelled after predictions were submitted.

| Aspect | Handling |
|--------|---------|
| **Badge evaluation** | Postponed/cancelled fixtures are excluded from badge calculations (same as scoring behavior). |
| **Streak tracking** | The fixture is skipped — it does not break or extend streaks. |
| **Participation** | The fixture is excluded from the "all fixtures predicted" count (same as monthly bonus logic). |

### 9.7 Perfect Gameweek with Star Games

**Scenario:** A gameweek has a Star Game and the user gets all predictions right.

| Handling |
|---------|
| The "Perfect Gameweek" badge counts both regular and Star Game fixtures. Getting a Star Game exact (`STAR_EXACT`) or outcome (`STAR_OUTCOME`) counts as "correct." The badge doesn't require exact scores for every fixture — it requires all outcomes correct (exact scores OR correct outcomes). |

### 9.8 Badge Definition Changes

**Scenario:** We decide to change a badge's unlock criteria after launch (e.g., "Sharp Shooter" from 5 exact scores to 10).

| Aspect | Handling |
|--------|---------|
| **Existing awards** | Users who already earned the badge keep it (no revocation). |
| **New criteria** | Applies going forward only. The `badge_definitions.criteria` JSON is versioned: `{ "threshold": 10, "version": 2 }`. |
| **Migration** | A migration updates the `badge_definitions` row. No `badge_awards` rows are deleted. |
| **Communication** | Changelog entry or in-app note: "Sharp Shooter now requires 10 exact scores (was 5). Existing holders keep their badge." |

### 9.9 Maximum Featured Badges Display

**Scenario:** A user has exactly 3 Legendary badges and wants to feature them all.

| Handling |
|---------|
| Users can feature **up to 3 badges**. If a user has more than 3 Legendary badges (unlikely but theoretically possible across multiple seasons), they must choose which 3 to feature. The system auto-selects the 3 most recently earned if the user hasn't manually set preferences. |

### 9.10 Prediction Edited Before Kickoff

**Scenario:** A user submits an early prediction (earning "Early Bird"), then edits it closer to kickoff.

| Handling |
|---------|
| The "Early Bird" badge is awarded at submission time and is not revoked if the prediction is later edited. The original `submitted_at` is tracked in `prediction_history`. For "Squeaky Bum Time," only the final submission counts (based on `predictions.updated_at`). |

---

## 10. Performance Considerations

| Concern | Mitigation |
|---------|-----------|
| **Badge evaluation cost** | With ~30 users, the evaluation after each fixture involves ~30 iterations, each with a few aggregate queries. Total expected time: < 2s. |
| **Leaderboard with badges** | Badge display requires a JOIN to `badge_awards` + `badge_definitions`. For 30 users × 3 featured badges = 90 rows. Trivial query cost. |
| **Celebration modal on page load** | Single query: `SELECT * FROM badge_awards WHERE user_id = X AND seen_at IS NULL`. Indexed. |
| **Retroactive scan** | One-time expensive operation (evaluates all historical data). Run as a background task with progress tracking. Expected: < 30s for 30 users × 38 GW × 10 fixtures/GW. |
| **Badge definition caching** | Badge definitions are static. Cache in memory or use `stale-while-revalidate` with a long TTL (1 hour). |

---

## 11. Implementation Priority

| Phase | Scope | Badges Included |
|-------|-------|-----------------|
| **Phase 2a** (MVP Badges) | Core badge engine + collection screen + leaderboard display | Accuracy (First Blood, Sharp Shooter, Sniper), Streaks (Hot Streak, On Fire), Participation (Committed), Leaderboard (Podium Finish, Gameweek Champion), Fun (Nil-Nil Nostradamus, Heartbreaker) |
| **Phase 2b** (Full Catalog) | All remaining badges + celebration modal + featured badges | Oracle, Psychic, Star Sniper, Star Master, all Outcome badges, Iron Will, Ever Present, Bonus Hunter/King, Serial Winner, Season Champion/Runner-Up, social badges, remaining fun badges |
| **Phase 2c** (Polish) | Full celebration animations, confetti, retrospective scan, admin stats | Legendary celebrations, retroactive scan, admin badge dashboard, push notifications |
| **Phase 3** (Expansion) | Cross-season badges, new badge categories as app evolves | Veteran, Grand Master, 1000 Club, Back-to-Back, The Underdog |

---

## 12. Open Questions

| # | Question | Recommendation | Status |
|---|----------|----------------|--------|
| 1 | Should badges ever expire? (e.g., seasonal badges vanish after the season) | **No.** Once earned, always earned. Displayed grouped by season. | ✅ Proposed |
| 2 | Should there be a "Badge Leaderboard" (most badges earned)? | **Phase 3.** Fun secondary competition, but not for v1. | ⏳ Deferred |
| 3 | Should users be able to hide their badges? | **Not in v1.** All badges are public. Add privacy toggle in Phase 3 if requested. | ⏳ Deferred |
| 4 | Should the admin be able to create custom badges? | **Not in v1.** Badge definitions are code/migration-managed. Admin custom badges can be Phase 3. | ⏳ Deferred |
| 5 | Should we support "badge of the week" (highlight a badge everyone is chasing)? | **Nice idea for Phase 3.** Could be auto-generated: "This week, 3 users are 1 exact score away from Sniper." | ⏳ Deferred |

---

## 13. Summary

| Metric | Count |
|--------|-------|
| **Total badge definitions** | 38 |
| **Common badges** | 13 |
| **Rare badges** | 14 |
| **Epic badges** | 7 |
| **Legendary badges** | 4 |
| **Categories** | 8 (Accuracy, Outcome, Streak, Participation, Leaderboard, Social, Fun, Milestone) |
| **New database tables** | 2 (`badge_definitions`, `badge_awards`) |
| **New UI screens** | 2 (Badge Collection, Badge Detail) |
| **Modified UI components** | 3 (Leaderboard Table, Dashboard, Podium) |
