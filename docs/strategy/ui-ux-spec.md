# Grand Football — UI/UX Design Specification

> **Document Owner:** Strategy & Design Agent
> **Last Updated:** 2026-02-27
> **Status:** Final (MVP)

---

## 1. Design Principles

1. **Mobile-first:** All layouts designed for 375px viewport first, progressively enhanced for larger screens.
2. **Minimal friction:** Predict a score in ≤3 taps from the Dashboard.
3. **Transparency:** Scoring is always explainable — every point has a visible rationale.
4. **Glanceability:** The most important info (rank, upcoming matches, bonus status) is visible without scrolling on mobile.
5. **Accessibility-forward:** High contrast, large tap targets, never rely on color alone.

---

## 2. Responsive Breakpoints

| Name | Min Width | Target Devices |
|------|-----------|----------------|
| **Mobile** | 0 – 639px | Phones (primary) |
| **Tablet** | 640px – 1023px | Tablets, small laptops |
| **Desktop** | 1024px+ | Laptops, desktops |

All components use a fluid grid with CSS `clamp()` for typography and spacing. No fixed pixel widths for content containers.

---

## 3. Color Palette

### Primary Palette

| Role | Token | Hex | Usage |
|------|-------|-----|-------|
| **Primary** | `--color-primary` | `#1B5E20` | Buttons, active nav, primary actions (deep green — football pitch) |
| **Primary Light** | `--color-primary-light` | `#4CAF50` | Hover states, secondary indicators |
| **Primary Dark** | `--color-primary-dark` | `#0D3B13` | Header background, text on light bg |
| **Accent** | `--color-accent` | `#FFD600` | Star Game indicators, bonus badges, highlights (gold) |
| **Accent Dark** | `--color-accent-dark` | `#C7A500` | Accent text on white backgrounds (meets contrast) |

### Semantic Palette

| Role | Token | Hex | Usage |
|------|-------|-----|-------|
| **Success** | `--color-success` | `#2E7D32` | Exact score indicators, bonus earned |
| **Warning** | `--color-warning` | `#F57F17` | "Locks soon" countdown, bonus at risk |
| **Error** | `--color-error` | `#C62828` | Errors, missed predictions |
| **Info** | `--color-info` | `#1565C0` | Informational badges, tooltips |

### Neutral Palette

| Role | Token | Hex | Usage |
|------|-------|-----|-------|
| **Background** | `--color-bg` | `#FAFAFA` | Page background |
| **Surface** | `--color-surface` | `#FFFFFF` | Cards, modals |
| **Border** | `--color-border` | `#E0E0E0` | Dividers, input borders |
| **Text Primary** | `--color-text` | `#1A1A1A` | Body text (contrast ratio 15.4:1 on white) |
| **Text Secondary** | `--color-text-secondary` | `#616161` | Supporting text (contrast ratio 5.6:1 on white) |
| **Text Disabled** | `--color-text-disabled` | `#9E9E9E` | Disabled elements |

### Dark Mode (Phase 2)

Not in scope for MVP. The neutral palette above provides excellent readability in light mode. Dark mode tokens can be added later as CSS custom property overrides.

### Contrast Compliance

All text-background combinations meet **WCAG 2.1 AA** (minimum 4.5:1 for normal text, 3:1 for large text). Star Game gold (`#FFD600`) is NEVER used as text on a white background — use `--color-accent-dark` (#C7A500) for text or pair gold with a dark background.

---

## 4. Typography

| Role | Font | Size (Mobile) | Size (Desktop) | Weight | Line Height |
|------|------|---------------|----------------|--------|-------------|
| **Heading 1** | Inter | 24px | 32px | 700 | 1.2 |
| **Heading 2** | Inter | 20px | 24px | 700 | 1.3 |
| **Heading 3** | Inter | 16px | 20px | 600 | 1.3 |
| **Body** | Inter | 16px | 16px | 400 | 1.5 |
| **Body Small** | Inter | 14px | 14px | 400 | 1.5 |
| **Caption** | Inter | 12px | 12px | 400 | 1.4 |
| **Score Display** | Inter | 32px | 40px | 700 | 1.1 |
| **Rank Number** | Inter | 20px | 24px | 700 | 1.1 |

Font stack: `'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`

Minimum font size across the app: **14px** (for readability on mobile).

---

## 5. Spacing System

Uses an 8px base unit:

| Token | Value |
|-------|-------|
| `--space-1` | 4px |
| `--space-2` | 8px |
| `--space-3` | 12px |
| `--space-4` | 16px |
| `--space-5` | 24px |
| `--space-6` | 32px |
| `--space-7` | 48px |
| `--space-8` | 64px |

---

## 6. Navigation Structure

### Bottom Tab Bar (Mobile)

The primary navigation on mobile is a persistent bottom tab bar with 4 tabs:

```
┌──────────────────────────────────────────┐
│  [🏠]       [📋]        [🏆]     [⚙️]   │
│  Home     Fixtures   Leaderboard Settings│
└──────────────────────────────────────────┘
```

- **Home (Dashboard):** Overview screen — rank, upcoming matches, bonus tracker
- **Fixtures:** Gameweek-based fixture list with prediction status
- **Leaderboard:** Season and Monthly tabs
- **Settings:** Profile, sign out, help/rules

### Top Nav (Desktop)

On desktop (≥1024px), navigation moves to a horizontal top bar:

```
┌─────────────────────────────────────────────────────────────┐
│  Grand Football    Home   Fixtures   Leaderboard    [Avatar]│
└─────────────────────────────────────────────────────────────┘
```

### Admin Navigation

For the admin user, an "Admin" tab/link appears:
- Mobile: 5th tab or accessible via Settings > Admin Panel
- Desktop: "Admin" link in the top nav

---

## 7. Screen Specifications

### 7.1 Sign-In Screen

**Route:** `/login`

**Layout:**
```
┌─────────────────────────┐
│                         │
│     [Grand Football     │
│        Logo/Name]       │
│                         │
│  ┌───────────────────┐  │
│  │ Email address      │  │
│  └───────────────────┘  │
│  [ Send Magic Link  ]   │
│                         │
│  ─────── or ──────────  │
│                         │
│  [ Sign in with Google ] │
│                         │
│  "Private league.       │
│   Invite-only access."  │
│                         │
└─────────────────────────┘
```

**Component Hierarchy:**
- `SignInPage`
  - `AppLogo` (brand name + optional graphic)
  - `EmailInput` (text field with email validation)
  - `MagicLinkButton` (primary button)
  - `Divider` (with "or" text)
  - `GoogleSignInButton` (outlined button with Google icon)
  - `InviteOnlyNotice` (caption text)

**States:**
- **Default:** Form as shown above
- **Loading (Magic Link):** "Send Magic Link" button shows spinner, disabled. Text: "Sending…"
- **Success (Magic Link):** Form replaced with: "Check your email! We sent a sign-in link to [email]. Link expires in 10 minutes."
- **Error (Not Invited):** Inline alert: "This league is invite-only. Contact the admin to request access."
- **Error (Network):** Inline alert: "Something went wrong. Please try again."

---

### 7.2 Dashboard (Home)

**Route:** `/` or `/dashboard`

**Layout (Mobile):**
```
┌─────────────────────────┐
│  Good morning, Temi      │
│                         │
│  ┌─────────────────────┐│
│  │ 🏆 Your Rank: #3    ││
│  │ Total: 127 pts      ││
│  │ ▲ +2 positions      ││
│  └─────────────────────┘│
│                         │
│  ┌─────────────────────┐│
│  │ Monthly Bonus        ││
│  │ 15/17 predicted      ││
│  │ ✓ On track (+10)    ││
│  └─────────────────────┘│
│                         │
│  Upcoming Fixtures       │
│  ┌─────────────────────┐│
│  │ ARS vs CHE  Sat 3pm ││
│  │ [Predict →]          ││
│  ├─────────────────────┤│
│  │ LIV vs MUN  Sat 5pm ││
│  │ Predicted: 2-1 ✓    ││
│  ├─────────────────────┤│
│  │ ⭐ TOT vs MCI Sun 2 ││
│  │ [Predict →]Star Game ││
│  └─────────────────────┘│
│                         │
│  Recent Results          │
│  ┌─────────────────────┐│
│  │ NEW 1-2 BHA         ││
│  │ You: 1-2  +5 EXACT  ││
│  └─────────────────────┘│
│                         │
│  [Tab Bar]               │
└─────────────────────────┘
```

**Component Hierarchy:**
- `DashboardPage`
  - `GreetingHeader` (display name + time-based greeting)
  - `RankCard` (current rank, total points, position change)
  - `BonusTrackerCard` (predicted count / total count, status)
  - `UpcomingFixturesSection`
    - `FixtureRow` (repeated for next 3-5 fixtures)
      - `TeamNames` (home vs away)
      - `KickoffTime` (localized)
      - `PredictionStatus` (Predict → / Predicted: X-Y / Locked)
      - `StarGameBadge` (conditional)
  - `RecentResultsSection`
    - `ResultRow` (repeated for last 3 results)
      - `ActualScore`
      - `UserPrediction`
      - `PointsBadge`

**States:**
- **Loading:** Skeleton loaders for each card/section
- **Empty (No Upcoming):** "No upcoming fixtures right now. Enjoy the break!"
- **Empty (No Results):** "No results yet. Predictions will be scored after matches finish."
- **Error:** "Couldn't load your dashboard. Pull to refresh or try again later." + Retry button

---

### 7.3 Fixtures Screen

**Route:** `/fixtures`

**Layout (Mobile):**
```
┌─────────────────────────┐
│  Fixtures                │
│  ◀ GW 24  ●  GW 25 ▶   │
│                         │
│  Saturday, 7 Mar        │
│  ┌─────────────────────┐│
│  │ Arsenal    [2] [1]  ││
│  │ Chelsea    Sat 3:00 ││
│  │ Predicted ✓         ││
│  ├─────────────────────┤│
│  │ ⭐ Liverpool [_] [_]││
│  │ Man Utd    Sat 5:30 ││
│  │ Star Game · Predict  ││
│  └─────────────────────┘│
│                         │
│  Sunday, 8 Mar          │
│  ┌─────────────────────┐│
│  │ Tottenham  [_] [_]  ││
│  │ Man City   Sun 2:00 ││
│  │ Predict              ││
│  ├─────────────────────┤│
│  │ Newcastle  1 - 2    ││
│  │ Brighton   Final    ││
│  │ You: 1-2  +5 EXACT  ││
│  └─────────────────────┘│
│                         │
│  [ Predict All (GW 25) ]│
│                         │
│  [Tab Bar]               │
└─────────────────────────┘
```

**Component Hierarchy:**
- `FixturesPage`
  - `GameweekNavigator` (prev/next arrows, current GW label)
  - `DateGroup` (repeated per match day)
    - `DateHeader` (e.g., "Saturday, 7 Mar")
    - `FixtureCard` (repeated per fixture)
      - `TeamRow` (team name + prediction inputs OR final score)
      - `KickoffBadge` (time, or "LIVE", or "Final")
      - `PredictionStatus` (Predicted ✓ / Predict / Locked)
      - `StarGameBadge` (conditional: star icon + "Star Game" text)
      - `PointsBadge` (for finished matches: "+5 EXACT")
  - `BulkPredictButton` (P1: "Predict All" for the gameweek)

**States:**
- **Loading:** Skeleton cards
- **Empty Gameweek:** "No fixtures scheduled for this gameweek."
- **Error:** "Couldn't load fixtures. Tap to retry."

**Interaction: Inline Prediction**
- Tapping a fixture card with status SCHEDULED expands it or navigates to a prediction form.
- MVP approach: Inline number inputs directly on the fixture card (2 small input boxes for home/away goals).
- Tap "Save" button that appears when inputs are changed.
- On save: brief success toast "Prediction saved!"

---

### 7.4 Prediction Form (Inline / Modal)

**Route:** `/fixtures` (inline) or `/predict/:fixtureId` (standalone)

**Layout (Inline on Fixture Card):**
```
┌─────────────────────────┐
│  Arsenal                │
│  ┌───┐                  │
│  │ 2 │  ←  Home Goals   │
│  └───┘                  │
│                         │
│  Chelsea                │
│  ┌───┐                  │
│  │ 1 │  ←  Away Goals   │
│  └───┘                  │
│                         │
│  ⏰ Locks in 2h 15m     │
│  [ Save Prediction ]    │
└─────────────────────────┘
```

**Input Specifications:**
- Input type: `number` with `inputmode="numeric"` and `pattern="[0-9]*"` for mobile numeric keyboard
- Min: 0, Max: 99
- Step: 1
- Input field size: minimum 48x48px tap target
- Clear visual feedback on focus (border color change + outline)

**States:**
- **Empty:** Placeholder "0" in light gray
- **Filled:** User's number displayed
- **Saving:** Button shows spinner, inputs disabled
- **Saved:** Button text changes to "Saved ✓" for 2 seconds, then reverts
- **Locked:** Inputs disabled, gray background. Message: "Predictions locked — match has started"
- **Lock Warning:** Yellow banner: "⏰ Locks in X minutes" (shown when < 60 minutes to kickoff)
- **Error (Validation):** Red border on empty field: "Enter a score"
- **Error (Locked on Save):** Toast: "Sorry, match has kicked off. Prediction not saved."

---

### 7.5 Leaderboard Screen

**Route:** `/leaderboard`

**Layout (Mobile):**
```
┌─────────────────────────┐
│  Leaderboard             │
│  [Season] [Monthly ▼]   │
│                         │
│  ┌─────────────────────┐│
│  │ #1  David    189pts ││
│  │     12 exact · 45 ok││
│  ├─────────────────────┤│
│  │ #2  Sarah    185pts ││
│  │     11 exact · 47 ok││
│  ├─────────────────────┤│
│  │ #3  Temi ◀YOU 182pts││
│  │     ▲+2  10 exact   ││
│  ├─────────────────────┤│
│  │ #4  James   180pts  ││
│  │     10 exact · 40 ok││
│  ├─────────────────────┤│
│  │  ...                 ││
│  └─────────────────────┘│
│                         │
│  [Tab Bar]               │
└─────────────────────────┘
```

**Component Hierarchy:**
- `LeaderboardPage`
  - `TabSwitcher` (Season / Monthly)
  - `MonthSelector` (dropdown, only on Monthly tab)
  - `LeaderboardTable` (accessible `<table>` or `role="table"`)
    - `LeaderboardRow` (repeated per user)
      - `RankBadge` (#1, #2, #3 with special styling for podium)
      - `DisplayName`
      - `YouIndicator` (conditional, for current user's row)
      - `TotalPoints`
      - `StatsSummary` (exact scores count, correct outcomes count)
      - `PositionChange` (P2: arrow + delta)
    - `CurrentUserHighlight` (distinct background on user's own row)

**Design Details:**
- Top 3 ranks: gold (#1), silver (#2), bronze (#3) backgrounds with sufficient contrast. ALSO display rank numbers — color is supplementary, not the only indicator.
- Current user's row: left border accent (4px `--color-primary`) PLUS "You" text label.
- On Monthly tab: show bonus column ("✓ +10" or "—")

**States:**
- **Loading:** Skeleton rows
- **Empty:** "No data yet. Leaderboard populates after the first match results."
- **Error:** "Couldn't load leaderboard. Tap to retry."

---

### 7.6 Match Detail Screen

**Route:** `/match/:fixtureId`

**Layout (Mobile):**
```
┌─────────────────────────┐
│  ◀ Back                  │
│                         │
│  Arsenal  2 - 1  Chelsea│
│         Final           │
│    ⭐ Star Game          │
│                         │
│  ┌─────────────────────┐│
│  │ Your Prediction      ││
│  │                     ││
│  │ Arsenal  2          ││
│  │ Chelsea  1          ││
│  │                     ││
│  │ Points: +10         ││
│  │ Rule: Star Game     ││
│  │ Exact Score — you   ││
│  │ nailed it!          ││
│  │                     ││
│  │ ℹ️ How scoring works ││
│  └─────────────────────┘│
│                         │
│  [Tab Bar]               │
└─────────────────────────┘
```

**Component Hierarchy:**
- `MatchDetailPage`
  - `BackButton` (returns to fixtures or previous page)
  - `MatchHeader`
    - `TeamName` (home)
    - `ActualScore` (large, prominent)
    - `TeamName` (away)
    - `MatchStatus` ("Final", "LIVE", "Postponed")
    - `StarGameBadge` (conditional)
  - `PredictionCard`
    - `UserPrediction` (home score / away score, or "No prediction submitted")
    - `PointsAwarded` (large number with color coding)
    - `RuleExplanation` (human-readable text)
    - `ScoringInfoLink` (links to rules page)

**Rule Explanation Text Templates:**

| reason_code | Text |
|------------|------|
| `EXACT_SCORE` | "Exact Score — you nailed it! +5 points" |
| `STAR_EXACT` | "⭐ Star Game Exact Score — incredible! +10 points" |
| `OUTCOME` | "Correct outcome — right result, not quite the score. +3 points" |
| `STAR_OUTCOME` | "⭐ Star Game correct outcome. +3 points" |
| `BTTS_REVERSE` | "Both teams scored but wrong result — consolation point. +1 point" |
| `STAR_BTTS_REVERSE` | "⭐ Star Game — both teams scored but wrong result. +1 point" |
| `WRONG` | "Wrong prediction. 0 points — better luck next time!" |
| `STAR_WRONG` | "⭐ Star Game — wrong prediction. 0 points" |
| `NO_PREDICTION` | "No prediction submitted. 0 points" |

**States:**
- **Loading:** Skeleton layout
- **Pending Score:** "Points pending calculation…" with spinner
- **Error:** "Couldn't load match details. Tap to retry."

---

### 7.7 Settings Screen

**Route:** `/settings`

**Layout (Mobile):**
```
┌─────────────────────────┐
│  Settings                │
│                         │
│  ┌─────────────────────┐│
│  │ Display Name         ││
│  │ Temi  [Edit]        ││
│  ├─────────────────────┤│
│  │ Email                ││
│  │ temi@example.com    ││
│  ├─────────────────────┤│
│  │ How Scoring Works →  ││
│  ├─────────────────────┤│
│  │ Admin Panel →        ││  ← Only visible to admin
│  ├─────────────────────┤│
│  │ [Sign Out]           ││
│  └─────────────────────┘│
│                         │
│  Grand Football v1.0    │
│                         │
│  [Tab Bar]               │
└─────────────────────────┘
```

---

### 7.8 Admin Panel

**Route:** `/admin`

**Layout (Mobile):**
```
┌─────────────────────────┐
│  ◀ Admin Panel           │
│                         │
│  ┌─────────────────────┐│
│  │ 👥 User Management → ││
│  ├─────────────────────┤│
│  │ ⚽ Fixtures →        ││
│  ├─────────────────────┤│
│  │ 📊 Scoring →         ││
│  ├─────────────────────┤│
│  │ 📅 Season →          ││
│  └─────────────────────┘│
└─────────────────────────┘
```

Sub-screens:
- **User Management:** List of allowlisted emails + add/remove
- **Fixtures:** Fixture list with Star Game toggle + Override Result button
- **Scoring:** Recalculate per fixture or all + Audit log
- **Season:** Start New Season button with confirmation

---

### 7.9 Scoring Rules Page

**Route:** `/rules`

**Layout:**
Static content page with a scoring table, examples for each rule, and a FAQ section.

```
┌─────────────────────────┐
│  How Scoring Works       │
│                         │
│  Regular Matches         │
│  ┌─────────────────────┐│
│  │ Exact Score:   5 pts ││
│  │ Right Result:  3 pts ││
│  │ BTTS Reverse:  1 pt  ││
│  │ Wrong:         0 pts ││
│  └─────────────────────┘│
│                         │
│  ⭐ Star Games           │
│  ┌─────────────────────┐│
│  │ Exact Score:  10 pts ││
│  │ Right Result:  3 pts ││
│  │ BTTS Reverse:  1 pt  ││
│  │ Wrong:         0 pts ││
│  └─────────────────────┘│
│                         │
│  Monthly Bonus           │
│  Predict ALL matches in  │
│  a month → +10 bonus pts │
│                         │
│  Examples...             │
│                         │
│  Tie-Breakers...         │
│                         │
└─────────────────────────┘
```

---

## 8. Component Library Summary

| Component | Usage | Variants |
|-----------|-------|----------|
| `Button` | Primary actions | Primary, Secondary, Outlined, Destructive, Icon-only |
| `Input` | Text/number entry | Default, Error, Disabled, Score (numeric) |
| `Card` | Content containers | Default, Highlighted, Star Game |
| `Badge` | Status indicators | Points (+5, +3, etc.), Star Game, Live, Locked, Predicted |
| `TabBar` | Bottom navigation | 4-tab (user), 5-tab (admin) |
| `TabSwitcher` | Inline tab selection | Season/Monthly |
| `FixtureCard` | Match display | Upcoming, Live, Finished, Prediction inline |
| `LeaderboardRow` | User ranking row | Default, Current user, Podium (top 3) |
| `Toast` | Temporary feedback | Success, Error, Info |
| `Skeleton` | Loading states | Card, Row, Text |
| `EmptyState` | No data | Icon + message + optional action |
| `ErrorState` | Failed loads | Message + Retry button |
| `Modal` | Confirmation dialogs | Basic, Destructive |
| `Countdown` | Time remaining | Lock countdown format: "Xh Ym" or "Xm" |
| `BonusTracker` | Monthly progress | On track, At risk, Earned, Missed |

---

## 9. Iconography

Use a consistent icon set (e.g., Lucide Icons or Heroicons) for:

| Icon | Meaning |
|------|---------|
| Star (filled) | Star Game |
| Check circle | Prediction submitted |
| Lock | Predictions locked |
| Clock | Countdown to lock |
| Arrow up | Rank improved |
| Arrow down | Rank dropped |
| Trophy | Leaderboard / Rank |
| Home | Dashboard |
| List | Fixtures |
| Gear | Settings |
| Info circle | Scoring rule info |
| User | Profile / Admin |
| Refresh | Recalculate |

**Accessibility:** Every icon must have either a visible text label (preferred) or an `aria-label`. Decorative icons use `aria-hidden="true"`.

---

## 10. Motion & Animation

- **Page transitions:** Minimal — prefer instant navigation. Optional: 150ms fade on route change.
- **Toast notifications:** Slide in from top, auto-dismiss after 3 seconds. Must be `role="status"` and `aria-live="polite"`.
- **Skeleton loaders:** Subtle pulse animation on placeholders.
- **Button press:** 100ms scale-down (0.97) on tap for tactile feedback (CSS-only).
- **No blocking animations:** Never delay content display for animation completion.
- **Respect `prefers-reduced-motion`:** All animations disabled when the user's OS setting requests reduced motion.

---

## 11. PWA Requirements

- **Service Worker:** Cache app shell (HTML, CSS, JS, icons) for offline shell loading.
- **Manifest:** `name: "Grand Football"`, `short_name: "GF"`, `theme_color: #1B5E20`, `background_color: #FAFAFA`, `display: "standalone"`.
- **Offline behavior:** Show cached app shell with message: "You're offline. Data will refresh when you reconnect." No offline prediction submission in MVP.
- **Install prompt:** "Add to Home Screen" banner on second visit (browser-native).
- **Icons:** 192x192 and 512x512 PNG icons.
