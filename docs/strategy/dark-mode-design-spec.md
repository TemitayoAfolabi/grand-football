# Grand Football — Premium Dark Mode Design Specification

> **Document Owner:** Strategy & Design Agent  
> **Last Updated:** 2026-02-27  
> **Status:** Final  
> **Supersedes:** Light-mode MVP spec (ui-ux-spec.md §3 Color Palette)

---

## 1. Color Tokens

All tokens defined as CSS custom properties. Dark mode is **default**; light mode is a future opt-in via `data-theme="light"` on `<html>`.

### 1.1 Core Palette

| Token | Hex | RGB | Usage |
|-------|-----|-----|-------|
| `--bg-primary` | `#0B0F1A` | `11 15 26` | Page background (deep navy-black) |
| `--bg-secondary` | `#111827` | `17 24 39` | Alternate section backgrounds, nav bar fill |
| `--surface-DEFAULT` | `#1A2235` | `26 34 53` | Cards, modals, dropdowns |
| `--surface-elevated` | `#212D45` | `33 45 69` | Hovered/elevated cards, active states |
| `--surface-glass` | `rgba(26, 34, 53, 0.7)` | — | Glassmorphism panels (+ `backdrop-blur-xl`) |
| `--border-DEFAULT` | `#2A3454` | `42 52 84` | Card borders, dividers |
| `--border-subtle` | `#1E2740` | `30 39 64` | Lighter separation lines |
| `--border-strong` | `#3D4F7C` | `61 79 124` | Focused inputs, active borders |

### 1.2 Text Hierarchy

| Token | Hex | Contrast on `--surface-DEFAULT` | Usage |
|-------|-----|------|-------|
| `--text-primary` | `#F1F5F9` | 13.2:1 ✅ | Headings, primary body text |
| `--text-secondary` | `#94A3B8` | 5.8:1 ✅ | Supporting text, labels, meta |
| `--text-tertiary` | `#64748B` | 3.5:1 ✅ (large) | Timestamps, placeholders, disabled (large text only) |
| `--text-disabled` | `#475569` | 2.4:1 | Disabled elements only (paired with icon indicators) |
| `--text-inverse` | `#0B0F1A` | — | Text on bright accent backgrounds |

### 1.3 Accent Colors

| Token | Hex | Usage |
|-------|-----|-------|
| `--accent-DEFAULT` | `#22C55E` | Primary accent — electric green. CTA buttons, active nav, links |
| `--accent-hover` | `#16A34A` | Button hover state |
| `--accent-muted` | `rgba(34, 197, 94, 0.15)` | Accent tinted backgrounds (badges, subtle highlights) |
| `--accent-glow` | `rgba(34, 197, 94, 0.25)` | Box-shadow glow for focused/active elements |
| `--gold` | `#F5C518` | Star Games, premium highlights, monthly bonus badge |
| `--gold-muted` | `rgba(245, 197, 24, 0.15)` | Gold badge backgrounds |

### 1.4 Semantic Colors

| Token | Hex | Usage |
|-------|-----|-------|
| `--success` | `#22C55E` | Exact score, bonus earned, saved confirmations |
| `--success-muted` | `rgba(34, 197, 94, 0.15)` | Success backgrounds |
| `--warning` | `#F59E0B` | "Locks soon" countdowns, bonus at risk |
| `--warning-muted` | `rgba(245, 158, 11, 0.15)` | Warning backgrounds |
| `--error` | `#EF4444` | Errors, missed predictions |
| `--error-muted` | `rgba(239, 68, 68, 0.15)` | Error backgrounds |
| `--info` | `#3B82F6` | Informational badges, outcome indicators |
| `--info-muted` | `rgba(59, 130, 246, 0.15)` | Info backgrounds |
| `--live` | `#EF4444` | Live match pulse indicator |

### 1.5 Podium / Rank Colors

| Token | Hex | Usage |
|-------|-----|-------|
| `--podium-gold` | `#F5C518` | 1st place |
| `--podium-silver` | `#C0C0C0` | 2nd place |
| `--podium-bronze` | `#CD7F32` | 3rd place |
| `--podium-gold-glow` | `rgba(245, 197, 24, 0.3)` | 1st place card glow |
| `--podium-silver-glow` | `rgba(192, 192, 192, 0.2)` | 2nd place card glow |
| `--podium-bronze-glow` | `rgba(205, 127, 50, 0.2)` | 3rd place card glow |

### 1.6 Gradient Presets

| Name | Value | Usage |
|------|-------|-------|
| `gradient-hero` | `linear-gradient(135deg, #0B0F1A 0%, #1A2235 50%, #111827 100%)` | Dashboard hero section |
| `gradient-card-accent` | `linear-gradient(135deg, rgba(34,197,94,0.08) 0%, transparent 60%)` | Featured card top-left glow |
| `gradient-gold` | `linear-gradient(135deg, #F5C518 0%, #D4A017 100%)` | Star Game badge fill |
| `gradient-surface` | `linear-gradient(180deg, #1A2235 0%, #151C2E 100%)` | Subtle card depth |
| `gradient-nav` | `linear-gradient(180deg, rgba(11,15,26,0.95) 0%, rgba(11,15,26,0.85) 100%)` | Bottom nav glass fill |

---

## 2. Typography Scale

**Font:** Inter (already loaded). Add weight `800` for display scores.

| Role | Token | Mobile | Desktop | Weight | Line Height | Letter Spacing |
|------|-------|--------|---------|--------|-------------|----------------|
| **Display** | `text-display` | 40px | 56px | 800 | 1.0 | -0.02em |
| **H1** | `text-h1` | 28px | 36px | 700 | 1.15 | -0.01em |
| **H2** | `text-h2` | 22px | 28px | 700 | 1.2 | -0.01em |
| **H3** | `text-h3` | 18px | 22px | 600 | 1.3 | 0 |
| **Body** | `text-body` | 15px | 16px | 400 | 1.6 | 0 |
| **Body Small** | `text-body-sm` | 13px | 14px | 400 | 1.5 | 0 |
| **Caption** | `text-caption` | 11px | 12px | 500 | 1.4 | 0.02em |
| **Score** | `text-score` | 36px | 48px | 800 | 1.0 | -0.02em |
| **Rank** | `text-rank` | 24px | 32px | 800 | 1.0 | -0.01em |
| **Stat Value** | `text-stat` | 20px | 24px | 700 | 1.1 | 0 |
| **Stat Label** | `text-stat-label` | 11px | 12px | 500 | 1.4 | 0.05em |
| **Nav Label** | `text-nav` | 10px | 14px | 500 | 1.0 | 0.03em |
| **Countdown** | `text-countdown` | 14px | 16px | 600 | 1.0 | 0.05em |

All `text-stat-label`, `text-caption`, `text-nav` should be uppercase-transformed with tracking.

---

## 3. Component Redesign List

### 3.1 `Card`
- **Background:** `--surface-DEFAULT` with `border border-border-DEFAULT`
- **Add:** Optional `variant` prop: `default | elevated | glass | accent | gold`
  - `elevated`: `--surface-elevated` bg + stronger shadow
  - `glass`: `--surface-glass` bg + `backdrop-blur-xl` + subtle border glow
  - `accent`: Faint `gradient-card-accent` overlay in top-left corner
  - `gold`: `--gold-muted` bg + `--gold` border (for Star Games)
- **Shadow:** `0 1px 3px rgba(0,0,0,0.3), 0 1px 2px rgba(0,0,0,0.2)` default; `0 4px 16px rgba(0,0,0,0.4)` elevated
- **Hover (where cards are clickable):** translate `Y -1px`, shadow intensifies, 200ms `ease-out`
- **Border radius:** Keep `8px` → increase to `12px`

### 3.2 `Button`
- **Primary:** `bg-accent-DEFAULT text-text-inverse`, hover: `bg-accent-hover`, active: scale 0.97
- **Secondary:** `bg-surface-elevated text-text-primary border-border-DEFAULT`, hover: `bg-surface-elevated` brighter
- **Ghost:** Transparent, `text-text-secondary`, hover: `bg-surface-elevated/50`
- **Danger:** `bg-error text-white`, hover: darken 10%
- **All variants:** border-radius `8px`, add `transition-all duration-150`, focus ring uses `--accent-glow` shadow instead of outline offset
- **Add glow on primary:** `shadow: 0 0 20px var(--accent-glow)` on hover

### 3.3 `Badge`
- **All badges:** Use muted semantic background + semantic text. Border should be `transparent` (remove visible border), rely on bg tint.
- **`star`:** `--gold-muted` bg, `--gold` text, add tiny `✦` icon prefix
- **`live`:** `--error-muted` bg, `--live` text, add pulsing red dot (animation)
- **`locked`:** `--surface-elevated` bg, `--text-tertiary` text
- **`success`:** `--success-muted` bg, `--success` text
- **New `points` badge:** `--accent-muted` bg, `--accent-DEFAULT` text (for "+5 pts" displays)

### 3.4 `Input`
- **Background:** `--bg-secondary`
- **Border:** `--border-DEFAULT`, focus: `--accent-DEFAULT` with `box-shadow: 0 0 0 3px var(--accent-glow)`
- **Text:** `--text-primary`; placeholder: `--text-tertiary`
- **Score inputs (prediction form):** Larger: `h-12 w-16`, font `text-score` weight `800`, center-aligned, border-radius `10px`

### 3.5 `Alert`
- Uses muted semantic backgrounds with slightly more opacity (0.12 → 0.15)
- Icon color matches variant semantic color
- Text body uses `--text-primary` (not variant color) for readability
- Title uses variant color

### 3.6 `Skeleton`
- **Background:** `--surface-elevated`
- **Pulse animation:** `--surface-DEFAULT` → `--surface-elevated` oscillation
- **Add shimmer:** Overlay a moving highlight gradient (left→right, 1.5s, infinite)

### 3.7 `Tabs`
- **Tab bar:** Bottom border `--border-subtle`
- **Active tab:** No bottom-border underline → use pill-shaped active indicator: `bg-accent-muted` with `text-accent-DEFAULT` and `font-semibold`
- **Inactive tabs:** `text-text-secondary`, hover: `text-text-primary`
- **Add:** Smooth sliding active indicator (animated `translateX` on the pill background, 200ms `ease-out`)

### 3.8 `BottomNav`
- **Background:** `gradient-nav` + `backdrop-blur-xl` (glassmorphism)
- **Border:** Top border `--border-subtle`, 0.5px appearance
- **Active icon:** `--accent-DEFAULT` color + filled icon variant (if available) + small active dot below icon (4px circle)
- **Inactive:** `--text-tertiary`
- **Add safe area padding:** `pb-[env(safe-area-inset-bottom)]`

### 3.9 `TopNav`
- **Background:** `--bg-secondary` with bottom border `--border-subtle`
- **Logo:** Replace emoji with SVG logo or stylized text using `--text-primary` + `--accent-DEFAULT` for "Grand" word
- **Active link:** `bg-accent-muted text-accent-DEFAULT` pill shape
- **Inactive:** `text-text-secondary`, hover: `text-text-primary bg-surface-elevated/30`

### 3.10 `FixtureCard`
- **Default state:** `Card` variant `default`
- **Star Game:** `Card` variant `gold` — faint gold gradient left border (3px solid `--gold`) or top accent stripe
- **Live match:** Add subtle red pulsing left-border or top-bar (2px `--live`)
- **Team crests:** Increase to `32×32`, add subtle circular bg behind crest (`--surface-elevated` circle)
- **Score display (in-card):** Use `text-h2` weight `800`, monospace-style spacing
- **Prediction row:** Slightly indented, `text-body-sm`, muted separator
- **Points display:** Use new `points` Badge component, right-aligned
- **Hover:** Entire card lifts (translateY -1px) with shadow increase

### 3.11 `PredictionForm`
- **Score inputs:** Larger (`h-12 w-16`), `text-score` size, `--bg-secondary` fill, prominent border
- **Dash separator:** Use `—` in `--text-tertiary`, `text-h3` size
- **Save button:** Small `primary` button with checkmark icon on success
- **"Saved!" feedback:** Use green checkmark icon + text, fade out after 2s
- **"Locks in" countdown:** Use `text-countdown` style, `--warning` color when < 1 hour

### 3.12 `LeaderboardTable`
- **Top 3 rows:** Special treatment (see §4 Podium component below)
- **Current user row:** `--accent-muted` background + left-border `2px solid --accent-DEFAULT`
- **Points column:** `text-stat` size, `--accent-DEFAULT` color
- **Rank numbers (4+):** `text-rank` size, `--text-secondary`
- **Alternating row bg:** None — use consistent `--surface-DEFAULT` with border
- **Row hover:** `bg-surface-elevated` transition

### 3.13 `ScoreDisplay`
- **Score numbers:** `text-score` (36/48px), weight `800`, `--text-primary`
- **Separator:** `:` in `--text-tertiary`, slightly smaller
- **Team names:** `text-body` weight `600`
- **Add team crests** flanking the team names (if available from fixture data)

### 3.14 `BonusTracker`
- **Progress bar track:** `--bg-secondary`, height `6px`, border-radius `full`
- **Progress fill:** Gradient from `--accent-DEFAULT` to `--gold` when eligible
- **Not eligible fill:** `--accent-DEFAULT` solid
- **Add percentage label** inside or beside the bar
- **Eligible state:** Add sparkle/shine animation on the bar + gold badge

### 3.15 `Countdown`
- **Style:** `text-countdown`, monospaced appearance (`font-variant-numeric: tabular-nums`)
- **Color:** `--text-secondary` default; `--warning` when < 1 hour; `--error` when < 5 minutes
- **"Locked" state:** `--error` color, add Lock icon inline
- **Add:** Subtle tick animation on second change (opacity pulse, 100ms)

### 3.16 `GameweekSelector`
- **Pills:** Replace bg-primary active with `bg-accent-DEFAULT text-text-inverse` pill
- **Inactive pills:** `bg-surface-elevated text-text-secondary`, border: `--border-DEFAULT`
- **Current gameweek indicator:** Add a small dot above the pill for "current" GW
- **Scrollbar:** Hide native scrollbar, add fade gradient on edges for overflow hint

### 3.17 `MonthlyLeaderboard`
- **Month selector:** Chevron buttons become `ghost` buttons with `--text-secondary` color
- **Month label:** `text-h3` weight `600`
- **Loading state:** Use shimmer Skeleton rows

---

## 4. New Components Needed

### 4.1 `Podium` (Leaderboard top-3 visual)
- **Layout:** Three columns, center (1st) taller than sides (2nd left, 3rd right)
- **Each podium block:** Contains avatar/initials circle, display name, points, rank medal icon
- **1st:** `--podium-gold` medal, `--podium-gold-glow` shadow, slightly larger
- **2nd:** `--podium-silver` medal, `--podium-silver-glow` shadow
- **3rd:** `--podium-bronze` medal, `--podium-bronze-glow` shadow
- **Height:** 1st = 140px, 2nd = 110px, 3rd = 90px pedestals (mobile), scale up 1.2× desktop
- **Animation:** Pedestals rise on mount (staggered, 300ms each, `ease-out`)
- **Used on:** Leaderboard page, above the table

### 4.2 `StatCard`
- **Purpose:** Replaces raw Card+icon combos on Dashboard for Rank/Points/Streak
- **Layout:** Icon bg circle (accent-muted) + value (`text-stat`) + label (`text-stat-label` uppercase)
- **Optional:** Trend arrow (up/down/neutral) for rank change with color coding

### 4.3 `AvatarCircle`
- **Purpose:** User avatar or initials fallback
- **Sizes:** `sm` (28px), `md` (36px), `lg` (48px), `xl` (64px)
- **Fallback:** First letter of display name, `--accent-muted` bg, `--accent-DEFAULT` text
- **Border:** 2px solid transparent; podium winners get `--podium-*` border color
- **Used in:** Leaderboard rows, podium, settings, top nav (future)

### 4.4 `PointsBurst` (Micro-animation)
- **Purpose:** Brief celebratory animation when points are revealed on Match Detail
- **Visual:** Number counts up from 0 → final value, with small particle/confetti burst
- **Trigger:** On mount of score record section in Match Detail
- **Duration:** 800ms count-up, 400ms particle fade

### 4.5 `LivePulse`
- **Purpose:** Animated indicator for live matches
- **Visual:** Small red circle with expanding/fading ring pulse
- **Size:** 8px core dot, ring expands to 16px
- **Animation:** 1.5s infinite ease-out pulse
- **Used in:** Badge `live` variant, FixtureCard live state

### 4.6 `GlowDivider`
- **Purpose:** Subtle accent-colored horizontal rule for section separation
- **Visual:** 1px line with centered `--accent-DEFAULT` glow (radial gradient fade)
- **Used in:** Dashboard between sections, Match Detail between sections

### 4.7 `EmptyState`
- **Purpose:** Consistent empty state display across pages
- **Layout:** Icon (large, muted) + headline + subtext + optional CTA button
- **Used in:** No fixtures, no predictions, no leaderboard data

### 4.8 `MatchTimeline` (Enhancement — Match Detail)
- **Purpose:** Visual timeline showing prediction vs actual score with point breakdown
- **Layout:** Vertical steps: "Your Prediction" → "Actual Result" → "Points Breakdown"
- **Each step:** Icon, label, value, connecting line between steps
- **Color coding:** Steps colored by outcome (exact = green, correct outcome = blue, wrong = red)

---

## 5. Animation Specifications

### 5.1 Micro-Interactions

| Animation | Trigger | Duration | Easing | Properties |
|-----------|---------|----------|--------|------------|
| `card-hover` | Mouse enter on clickable card | 200ms | `ease-out` | `translateY(-2px)`, `box-shadow` increase |
| `card-press` | Active/click on card | 100ms | `ease-in-out` | `scale(0.98)` |
| `button-press` | Active on any button | 100ms | `ease-in-out` | `scale(0.97)` |
| `button-glow` | Hover on primary button | 200ms | `ease-out` | `box-shadow: 0 0 20px var(--accent-glow)` |
| `tab-slide` | Tab change | 200ms | `ease-out` | Active pill `translateX` to new position |
| `badge-appear` | Badge enters DOM | 150ms | `ease-out` | `scale(0.8) → 1`, `opacity(0 → 1)` |
| `score-tick` | Countdown second tick | 100ms | `ease-in-out` | Opacity `1 → 0.7 → 1` |
| `progress-fill` | Bonus tracker on mount | 600ms | `ease-out` | Width `0% → target%` |
| `save-check` | Prediction saved | 300ms | `spring(1, 80, 10)` | Checkmark: `scale(0) → 1`, `opacity(0 → 1)` |
| `skeleton-shimmer` | While loading | 1.5s infinite | `linear` | Gradient highlight moves left→right |

### 5.2 Page Transitions

| Animation | Trigger | Duration | Easing | Properties |
|-----------|---------|----------|--------|------------|
| `page-enter` | Route change | 200ms | `ease-out` | `opacity(0 → 1)`, `translateY(8px → 0)` |
| `stagger-list` | List items on mount | 50ms stagger | `ease-out` | Each item: `opacity(0 → 1)`, `translateY(12px → 0)`, 150ms each |

### 5.3 Celebratory

| Animation | Trigger | Duration | Easing | Properties |
|-----------|---------|----------|--------|------------|
| `podium-rise` | Leaderboard mount | 300ms per pedestal, staggered (2nd→3rd→1st) | `ease-out` | `translateY(40px) → 0`, `opacity(0 → 1)` |
| `points-countup` | Match detail score reveal | 800ms | `ease-out` | Number interpolation `0 → finalValue` |
| `points-burst` | After count-up complete | 400ms | `ease-out` | 6-8 small particles expand outward, fade |
| `live-pulse` | Live match badge | 1.5s infinite | `ease-out` | Ring: `scale(1 → 2)`, `opacity(0.6 → 0)` |

### 5.4 Keyframe Definitions (New)

```css
@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}

@keyframes live-pulse {
  0% { transform: scale(1); opacity: 0.6; }
  100% { transform: scale(2); opacity: 0; }
}

@keyframes podium-rise {
  from { transform: translateY(40px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}

@keyframes points-countup {
  from { opacity: 0; transform: scale(0.5); }
  to { opacity: 1; transform: scale(1); }
}

@keyframes fade-in-up {
  from { opacity: 0; transform: translateY(12px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes card-glow {
  0%, 100% { box-shadow: 0 0 15px var(--accent-glow); }
  50% { box-shadow: 0 0 25px var(--accent-glow); }
}
```

---

## 6. Screen-by-Screen Changes

### 6.1 Login

| Area | Current | New |
|------|---------|-----|
| Background | `bg-background` (white #FAFAFA) | Full-screen `--bg-primary` with subtle radial gradient glow (green accent center, fading) |
| Branding circle | `bg-primary` green circle with ⚽ emoji | Larger (80px), `--surface-elevated` bg, subtle `--accent-glow` ring shadow, replace emoji with SVG football icon or keep styled emoji at 40px |
| Title | `text-2xl font-bold text-text` | `text-h1` weight `700`, `--text-primary`. "Grand" in `--accent-DEFAULT`, "Football" in `--text-primary` |
| Subtitle | `text-text-secondary` | `--text-secondary`, `text-body-sm` |
| Card | White bg surface | `Card` variant `glass` (glassmorphism) |
| Input | White bg, gray border | `--bg-secondary` bg, `--border-DEFAULT` border, glow focus ring |
| Magic Link button | `bg-primary` (dark green) | `bg-accent-DEFAULT` (electric green), `text-text-inverse`, glow on hover |
| Google button | Secondary variant | `--surface-elevated` bg, include Google "G" logo SVG, white text |
| Divider ("or") | Default | `GlowDivider` component with "or" centered label |

### 6.2 Dashboard

| Area | Current | New |
|------|---------|-----|
| Background | `bg-background` (white) | `--bg-primary` |
| Page title | "Dashboard" `text-xl font-bold` | "Dashboard" `text-h1`, `--text-primary`; season name in `--text-secondary` size `text-body-sm` |
| Stat cards (Rank/Points) | Basic Card with icon + number | `StatCard` component: icon in accent-muted circle, value in `text-stat` weight `800` color `--accent-DEFAULT`, uppercase label in `text-stat-label` color `--text-secondary` |
| Bonus tracker | Basic progress bar | Enhanced `BonusTracker`: accent→gold gradient fill when eligible, sparkle animation, clearer percentage readout |
| Section headers | `CardHeader` with link | `text-h3` title, `--text-primary`; "View all" link in `--accent-DEFAULT` with arrow icon |
| Upcoming fixture cards | Basic FixtureCard | Redesigned FixtureCard with larger crests (32px), `text-h2` scores, card hover lift. Star Games get gold variant. |
| Recent results cards | Basic FixtureCard | Points earned shown with `PointsBadge` (green accent). Score reason as muted subtext. |
| Section dividers | None (just spacing) | `GlowDivider` between major sections |
| List animation | None | `stagger-list` animation: items fade-in-up with 50ms stagger |

### 6.3 Fixtures

| Area | Current | New |
|------|---------|-----|
| Page header | "Fixtures" + GW label + season badge | `text-h1` title, gameweek label `text-body-sm --text-secondary`, season badge in `--gold-muted` bg |
| Gameweek selector | Green active pill, white inactive | `--accent-DEFAULT` active pill with `text-text-inverse`, `--surface-elevated` inactive. Hide scrollbar, add edge fade gradients. Current GW has small dot indicator above. |
| Fixture cards | Basic | Full FixtureCard redesign (§3.10). Inline prediction forms get larger score inputs (`h-12 w-16`, `text-score` weight). |
| Prediction form | Small inputs, basic button | Larger, bolder inputs on `--bg-secondary`. Dash `—` separator. Primary button. Success shows animated green check. |
| Star Game cards | Star icon + badge | Gold variant card with gold left-border stripe. Star icon uses `--gold`. |
| Locked state | Text + Lock icon | Muted card styling + `--text-tertiary` score display + lock badge |
| Empty state | Plain text | `EmptyState` component with calendar icon |

### 6.4 Leaderboard

| Area | Current | New |
|------|---------|-----|
| Page header | "Leaderboard" `text-xl` | `text-h1`, `--text-primary` |
| Tabs (Season/Monthly) | Border-bottom active style | Pill-shaped active indicator with `--accent-muted` bg + `--accent-DEFAULT` text. Sliding animation. |
| Top 3 display | Same as other rows (trophy icon for rank ≤3) | **New `Podium` component** above the table. Three columns, center (1st) tallest. Animated pedestals rising on mount. Gold/silver/bronze medals, glow shadows, avatar circles. |
| Rows 4+ | Basic row cards | `--surface-DEFAULT` bg, `--border-DEFAULT` border. Rank in `text-rank` bold. Points in `--accent-DEFAULT` `text-stat`. Hover: `bg-surface-elevated`. |
| Current user row | `bg-primary/5 border-primary/20` | `--accent-muted` bg, left border `2px solid --accent-DEFAULT`, slight glow |
| Stat columns (Exact/Outcome) | Hidden on mobile, icons + text | Keep hidden on mobile. Desktop: add column headers in `text-stat-label` uppercase. Icons use semantic colors. |
| Monthly tab | Basic month selector + same table | Month nav: ghost buttons, `text-h3` month name. Podium for monthly top 3 too. Loading: shimmer skeletons. |

### 6.5 Match Detail

| Area | Current | New |
|------|---------|-----|
| Header | Team names + badges | `text-h1` match title, `--text-primary`. Star badge uses gold variant. Date in `--text-secondary` `text-body-sm`. |
| Final Score card | Basic Card with ScoreDisplay | Enhanced: crests 40×40 flanking score. Score uses `text-display` (40/56px) weight `800`. Card variant `elevated`. Subtle `gradient-card-accent` background overlay. |
| Your Prediction card | Basic Card with ScoreDisplay | Same score styling but slightly smaller (`text-score`). Card variant `default`. If no prediction: `EmptyState` mini-version. |
| Points Awarded card | Badge + large number | **PointsBurst animation**: number counts up 0→final over 800ms, small particle burst. Badge shows reason. Explanation text in `--text-secondary`. Card variant `accent`. |
| Section flow | Stacked cards | **MatchTimeline** layout: vertical timeline connecting "Prediction → Result → Points" with colored step indicators. Green connection line if points earned, red if not. |
| Back navigation | Browser back | Add explicit back button (chevron-left + "Fixtures") at top |

### 6.6 Settings / Profile

| Area | Current | New |
|------|---------|-----|
| Header | Settings icon + "Settings" | `text-h1` "Settings", `--text-primary`, settings icon in `--accent-DEFAULT` |
| Display Name card | Basic Card + form | Card variant `default`. Input uses dark theme styling. Success: green inline toast with check icon. |
| About card | Card with link to rules | Card variant `default`. Link row with chevron-right icon, hover: `bg-surface-elevated`. |
| Rules link | Basic text link | Row with `BookOpen` icon in `--accent-DEFAULT`, label in `--text-primary`, chevron `--text-tertiary`, divider below |
| Sign Out | Red "Danger" button | Card variant `default`. Button stays `danger` variant but full-width. Add confirmation step (are you sure?) or just keep current behavior. |
| **New: Avatar section** | Not present | AvatarCircle (xl size, 64px) showing user initials + display name + email below. Top of page. |
| **New: Theme toggle** | Not present | (Future) "Appearance" row with light/dark/system toggle |

---

## 7. Implementation Notes

### 7.1 Tailwind Config Changes
- Replace `colors` section entirely with new token values
- Add `dark:` variant as default (use `darkMode: 'class'` and add `dark` to `<html>`)
- Add new `fontSize` entries for all typography tokens in §2
- Add new `keyframes` and `animation` entries from §5.4
- Increase `borderRadius.card` from `8px` to `12px`
- Add `backgroundImage` entries for gradient presets
- Add `boxShadow` entries for glow effects

### 7.2 globals.css Changes
- Set `<html>` class to `dark` by default
- Update CSS custom properties to new token values
- Add `@supports (backdrop-filter: blur())` for glassmorphism fallback
- Add `font-variant-numeric: tabular-nums` utility class for countdown/scores
- Add safe-area-inset padding utilities

### 7.3 layout.tsx Changes
- Set `themeColor` to `#0B0F1A` in viewport meta
- Add `dark` class to `<html>`
- Set `background-color: #0B0F1A` on `<body>` as fallback

### 7.4 PWA Manifest Changes
- Update `theme_color` and `background_color` to `#0B0F1A`
- Consider app icon update with dark-friendly variant

### 7.5 Accessibility Checklist
- All `--text-primary` on `--surface-DEFAULT` = 13.2:1 ✅ AA
- All `--text-secondary` on `--surface-DEFAULT` = 5.8:1 ✅ AA
- `--accent-DEFAULT` on `--surface-DEFAULT` = 4.8:1 ✅ AA (large text / UI components)
- `--accent-DEFAULT` on `--bg-primary` = 5.3:1 ✅ AA
- `--gold` on `--surface-DEFAULT` = 5.1:1 ✅ AA (large text); for small text use on `--bg-primary` (6.8:1)
- Never use `--text-tertiary` for small body text (3.5:1 only qualifies for large text)
- All interactive elements maintain `focus-visible` ring with `--accent-glow` 3px spread
- Motion: wrap all animations in `@media (prefers-reduced-motion: no-preference)` — provide instant fallback

### 7.6 Migration Priority
1. **P0:** Tailwind tokens + globals.css + layout dark class (foundation)
2. **P0:** Card, Button, Badge, Input, Alert, Skeleton (base UI)
3. **P1:** BottomNav, TopNav (navigation)
4. **P1:** FixtureCard, PredictionForm, ScoreDisplay (core gameplay)
5. **P1:** LeaderboardTable + new Podium (competitive)
6. **P2:** StatCard, AvatarCircle, EmptyState (polish)
7. **P2:** Animations (micro-interactions, page transitions)
8. **P3:** PointsBurst, MatchTimeline, GlowDivider (delight)
9. **P3:** Login page overhaul
