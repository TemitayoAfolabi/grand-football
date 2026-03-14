# Gameweek Deadline Countdown — UX Design Specification

> **Document Owner:** Strategy & Design Agent  
> **Created:** 2026-03-14  
> **Status:** Ready for Implementation  
> **Related Components:** `Countdown`, Dashboard page, Fixtures page  
> **User Story:** Users want to see time remaining until gameweek deadline on Dashboard and Fixtures pages

---

## 1. Executive Summary

Users currently need to check individual fixture kickoff times to know when predictions lock. This creates friction and can lead to missed prediction deadlines. This specification adds a **prominent gameweek-level deadline countdown** to both the Dashboard and Fixtures pages, making the prediction window immediately visible.

### Key Design Decisions:
- **Gameweek-level countdown** (not per-fixture) for clarity
- **Consistent placement** across both pages (top of relevant sections)
- **Progressive urgency styling** as deadline approaches
- **Graceful handling** of edge cases (expired, no active gameweek, etc.)

---

## 2. Current State Analysis

### 2.1 Existing Countdown Component

**Location:** `src/components/countdown.tsx`

**Current Capabilities:**
- ✅ Accepts `targetDate` (string | Date)
- ✅ Auto-updates every second
- ✅ Shows time in adaptive format (days/hours/minutes/seconds)
- ✅ Three urgency levels:
  - **Normal** (> 1 hour): `text-text-secondary` color
  - **Warning** (< 1 hour): `text-warning` color (#ffd166)
  - **Critical** (< 5 minutes): `text-error` color (#ff5d7a)
- ✅ Expired state: Shows "Locked" with Lock icon in red
- ✅ `onExpire` callback support
- ✅ Accessible (uses semantic HTML, proper ARIA)
- ✅ Dark mode compatible

**Component Interface:**
```tsx
interface CountdownProps {
  targetDate: string | Date;
  onExpire?: () => void;
  className?: string;
}
```

**Typography:** Uses `text-countdown` token (9px, weight 600, letter-spacing 0.05em, tabular-nums)

### 2.2 Dashboard Page Analysis

**File:** `src/app/(authenticated)/page.tsx`

**Current Layout (top to bottom):**
1. Header: Greeting + Season name
2. Stat cards: Rank, Points, Badges (3-column grid)
3. Quick action link: "My Prediction History"
4. Live Matches section (conditional)
5. Monthly Bonus Tracker card
6. Star Man card
7. Glow divider
8. Upcoming Fixtures section (5 fixtures, "View all" link)
9. Glow divider
10. Recent Results section (5 fixtures)

**Current Deadline Visibility:**
- ❌ No gameweek deadline shown
- ✅ Individual fixture countdowns visible in fixture cards

**Data Available:**
- ✅ `season` object with active season
- ✅ `upcomingFixtures` array (first 5 upcoming)
- ❌ Gameweek deadline NOT currently fetched

### 2.3 Fixtures Page Analysis

**File:** `src/app/(authenticated)/fixtures/page.tsx`

**Current Layout:**
1. Header: "Fixtures" title + Gameweek label + Season badge
2. Gameweek selector (horizontal scrollable pills)
3. Fixture list (all fixtures for selected gameweek)

**Current Deadline Visibility:**
- ❌ No gameweek deadline shown prominently
- ✅ Gameweek deadline IS computed for late penalty logic
- ✅ Individual fixture countdowns visible in each fixture card

**Data Available:**
- ✅ `gameweekDeadline` already computed (custom from `gameweek_deadlines` table OR earliest kickoff)
- ✅ Selected gameweek number

### 2.4 Gameweek Deadline Logic

**Source:** Fixtures page, lines 104-114

```tsx
const { data: customDeadlineRow } = await supabase
  .from('gameweek_deadlines')
  .select('deadline')
  .eq('season_id', season.id)
  .eq('gameweek', selectedGw)
  .single();

const gameweekDeadline = customDeadlineRow?.deadline
  ?? fixtures
    ?.filter((f) => f.status !== 'POSTPONED' && f.status !== 'CANCELLED')
    .reduce<string | null>(
      (earliest, f) =>
        !earliest || f.kickoff_time < earliest ? f.kickoff_time : earliest,
      null,
    )
  ?? null;
```

**Priority:**
1. Admin-set custom deadline (from `gameweek_deadlines` table)
2. Earliest kickoff time in gameweek (excluding postponed/cancelled)
3. Null if no valid fixtures

---

## 3. UX Design Specifications

### 3.1 Dashboard — Deadline Countdown Placement

#### 3.1.1 Placement Option A: Banner Below Stats (RECOMMENDED)

**Location:** Between Stat Cards and Quick Action link

**Visual Description:**
```
┌─────────────────────────────────────────────┐
│  Good morning, Temi                         │
│  2025/26 Season                             │
├─────────────────────────────────────────────┤
│  [Rank]    [Points]    [Badges]             │  ← Stat Cards
├─────────────────────────────────────────────┤
│  ⏰  GW 29 Predictions Lock In:  2h 34m 18s │  ← NEW COUNTDOWN BANNER
├─────────────────────────────────────────────┤
│  🎯  My Prediction History               >  │
│                                             │
│  [Live Matches]                             │
│  [Monthly Bonus Tracker]                    │
│  ...                                        │
└─────────────────────────────────────────────┘
```

**Component Structure:**
```tsx
<div className="rounded-card border border-border bg-surface px-4 py-3">
  <div className="flex items-center justify-between gap-3">
    <div className="flex items-center gap-2">
      <Clock className="h-4 w-4 text-text-secondary" />
      <span className="text-body-sm text-text-secondary">
        GW {currentGameweek} Predictions Lock In:
      </span>
    </div>
    <Countdown 
      targetDate={gameweekDeadline} 
      className="text-body font-semibold"
    />
  </div>
</div>
```

**Styling:**
- Container: Standard surface card with border
- Label: `text-body-sm`, `text-text-secondary`
- Icon: Clock icon (4x4), `text-text-secondary`
- Countdown: Larger than default (`text-body` instead of `text-countdown`), `font-semibold`
- Spacing: `px-4 py-3` (compact but tappable)
- Color changes based on urgency (handled by Countdown component)

**Why This Placement:**
- ✅ High visibility (above the fold on most devices)
- ✅ Logical flow (stats → deadline → actions)
- ✅ Doesn't disrupt existing layout
- ✅ Consistent with "Quick Action" card styling
- ✅ Clear separation from stat cards

#### 3.1.2 Placement Option B: Integrated with Live Matches Section

**Location:** As header/subtitle of Live Matches section when no live matches

*Not recommended* — less consistent, only visible when no live games

#### 3.1.3 Placement Option C: Inline with Upcoming Fixtures Header

**Location:** Next to "Upcoming Fixtures" section title

*Not recommended* — too far down page for primary info, easy to miss

### 3.2 Fixtures Page — Deadline Countdown Placement

#### 3.2.1 Placement (RECOMMENDED)

**Location:** Between header and gameweek selector

**Visual Description:**
```
┌─────────────────────────────────────────────┐
│  Fixtures                     [2025/26 ⭐]  │  ← Header
│  Gameweek 29                                │
├─────────────────────────────────────────────┤
│  ⏰  Predictions Lock In:  2h 34m 18s       │  ← NEW COUNTDOWN BANNER
├─────────────────────────────────────────────┤
│  [GW 27] [GW 28] [GW 29] [GW 30] ...        │  ← Gameweek Selector
├─────────────────────────────────────────────┤
│  [Fixture Card 1]                           │
│  [Fixture Card 2]                           │
│  ...                                        │
└─────────────────────────────────────────────┘
```

**Component Structure:**
```tsx
{gameweekDeadline && (
  <div className="rounded-card border border-border bg-surface px-4 py-3">
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <Clock className="h-4 w-4 text-text-secondary" />
        <span className="text-body-sm text-text-secondary">
          Predictions Lock In:
        </span>
      </div>
      <Countdown 
        targetDate={gameweekDeadline} 
        className="text-body font-semibold"
      />
    </div>
  </div>
)}
```

**Styling:**
- Identical to Dashboard countdown banner for consistency
- Label shortened to "Predictions Lock In:" (gameweek already shown in header)
- Same urgency colors and sizing

**Why This Placement:**
- ✅ Immediate visibility when landing on page
- ✅ Contextual (right before fixtures list)
- ✅ Doesn't interfere with gameweek navigation
- ✅ Clear hierarchy (page info → deadline → navigation → content)

### 3.3 Responsive Behavior

#### 3.3.1 Mobile (< 640px)

**Dashboard:**
```
┌─────────────────────┐
│  ⏰  GW 29 Locks In:│
│       2h 34m 18s    │
└─────────────────────┘
```
- Stack label and countdown vertically when < 375px wide
- Center-align content
- Same padding (px-4 py-3)

**Fixtures:**
- Same treatment as Dashboard
- Ensure Clock icon doesn't shrink below 16×16

#### 3.3.2 Tablet (640px - 1023px)

- Horizontal layout (no changes from mobile at this breakpoint)
- Countdown font size increases slightly (handled by `text-body` responsive scaling)

#### 3.3.3 Desktop (≥ 1024px)

- No layout changes
- Font sizes scale up per design tokens
- Countdown remains right-aligned

### 3.4 Visual States & Urgency Progression

The Countdown component already handles urgency styling, but the banner should reinforce this:

| Time Remaining | Urgency Level | Countdown Color | Border Treatment | Animation |
|----------------|---------------|-----------------|------------------|-----------|
| > 1 hour       | Normal        | `text-text-secondary` | `border-border` | None |
| 1 hour - 5 min | Warning       | `text-warning` (#ffd166) | `border-warning/30` | Subtle pulse every 10s |
| < 5 minutes    | Critical      | `text-error` (#ff5d7a) | `border-error/40` | Continuous slow pulse |
| Expired        | Locked        | `text-error` + Lock icon | `border-error/40` | None |

**Additional Visual Enhancements (optional):**
- Warning state: Add subtle background tint (`bg-warning-muted`)
- Critical state: Add subtle background tint (`bg-error-muted`)

**Animation Details:**
```css
@keyframes deadline-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}

.deadline-warning {
  animation: deadline-pulse 10s ease-in-out infinite;
}

.deadline-critical {
  animation: deadline-pulse 2s ease-in-out infinite;
}
```

### 3.5 Typography & Sizing

| Element | Mobile | Desktop | Weight | Font Token |
|---------|--------|---------|--------|------------|
| Label text | 13px | 14px | 400 | `text-body-sm` |
| Countdown value | 15px | 16px | 600 | `text-body` (override Countdown default) |
| "Locked" text | 15px | 16px | 600 | `text-body` |
| Clock icon | 16×16 | 16×16 | — | `h-4 w-4` |
| Lock icon (expired) | 14×14 | 14×14 | — | `h-3.5 w-3.5` |

**Rationale:** 
- Countdown is slightly larger than individual fixture countdowns to emphasize importance
- Uses `text-body` instead of `text-countdown` for better readability

---

## 4. Edge Cases & Error States

### 4.1 No Active Season

**Condition:** `season === null`

**Behavior:**
- ❌ Do NOT show countdown banner
- Dashboard already shows "No Active Season" empty state
- Fixtures page already shows "No Active Season" empty state

**Implementation:** No additional work needed, pages already handle this.

### 4.2 No Upcoming Gameweek (Season Ended)

**Condition:** No fixtures with `status IN ('SCHEDULED', 'TIMED')` remain

**Dashboard Behavior:**
```
┌─────────────────────────────────────────────┐
│  ⏰  Season Complete                        │
│     No upcoming gameweeks                   │
└─────────────────────────────────────────────┘
```
- Show banner with "Season Complete" message
- No countdown, use `text-text-tertiary` color
- Trophy icon instead of Clock icon

**Fixtures Behavior:**
- Don't show countdown banner
- User can still navigate to past gameweeks

### 4.3 Gameweek Deadline Passed

**Condition:** `gameweekDeadline < now()`

**Dashboard Behavior:**
```
┌─────────────────────────────────────────────┐
│  🔒  GW 29 Locked                           │
│     Predictions closed                      │
└─────────────────────────────────────────────┘
```
- Show "Locked" banner with Lock icon
- Text: "GW {n} Locked — Predictions closed"
- Use `text-text-tertiary` color (low emphasis, not urgent)
- Border: `border-border-subtle`

**Fixtures Behavior:**
- Same treatment
- Keep banner visible for context (user might be viewing older gameweek intentionally)

### 4.4 Live Matches in Progress

**Condition:** `liveFixtures.length > 0` (fixtures with status IN_PLAY/PAUSED)

**Dashboard Behavior:**
- If gameweek deadline has passed: Show "Locked" banner
- If deadline hasn't passed yet (rare edge case with postponed matches): Show normal countdown
- Live Matches section takes visual priority (already has its own indicator)

**Fixtures Behavior:**
- Show "Locked" banner if deadline passed
- Individual fixture cards already show "Live" badges

### 4.5 Custom Deadline vs. Kickoff Deadline

**Condition:** Admin has set custom deadline via `gameweek_deadlines` table

**Behavior:**
- Use the custom deadline seamlessly
- No visual indication to users that it's custom (they don't need to know)
- Late penalty logic already uses same deadline

**Edge Case:** Custom deadline is AFTER earliest kickoff
- This is valid (admin might allow late predictions for early kickoff match)
- Show countdown to custom deadline
- Individual fixture cards will show "Locked" for matches that kicked off

### 4.6 No Fixtures in Gameweek

**Condition:** `fixtures.length === 0` OR all fixtures postponed/cancelled

**Dashboard Behavior:**
- Don't show countdown banner
- "Upcoming Fixtures" section already shows empty state

**Fixtures Behavior:**
- Don't show countdown banner
- Fixtures section shows "No fixtures scheduled for this gameweek"

### 4.7 Multiple Gameweeks Available (Dashboard)

**Condition:** User has multiple upcoming gameweeks

**Behavior:**
- Show countdown for the NEXT gameweek only (earliest upcoming deadline)
- Label includes gameweek number: "GW 29 Predictions Lock In:"

**Data Logic (Dashboard):**
```tsx
// Find the next gameweek deadline
const { data: nextUpcomingFixture } = await supabase
  .from('fixtures')
  .select('gameweek, kickoff_time')
  .eq('season_id', season.id)
  .in('status', ['SCHEDULED', 'TIMED'])
  .order('kickoff_time', { ascending: true })
  .limit(1)
  .single();

const currentGameweek = nextUpcomingFixture?.gameweek;

// Then fetch/compute deadline for that gameweek
const { data: customDeadline } = await supabase
  .from('gameweek_deadlines')
  .select('deadline')
  .eq('season_id', season.id)
  .eq('gameweek', currentGameweek)
  .single();

const gameweekDeadline = customDeadline?.deadline ?? nextUpcomingFixture?.kickoff_time ?? null;
```

### 4.8 Zero State (Brand New Season)

**Condition:** Season is active but no fixtures loaded yet

**Behavior:**
- Don't show countdown banner
- Maintain clean layout
- No error message (this is rare/temporary)

---

## 5. Accessibility Requirements

### 5.1 Screen Readers

**Countdown Announcement:**
- Container has `role="timer"` and `aria-live="polite"`
- Label text is fully readable: "Gameweek 29 Predictions Lock In: 2 hours 34 minutes"
- Updates are NOT announced on every second (would be too noisy)
- Final minute: Change to `aria-live="assertive"` for urgency

**Implementation:**
```tsx
<div 
  role="timer" 
  aria-live={timeLeft < 60 ? "assertive" : "polite"}
  aria-label={`Gameweek ${gameweek} predictions lock in ${timeLeftLabel}`}
>
  {/* visual content */}
</div>
```

**Time Left Label Format:**
- 2d 5h 30m → "2 days 5 hours 30 minutes"
- 1h 45m 10s → "1 hour 45 minutes 10 seconds"
- 30s → "30 seconds"
- Locked → "Predictions locked for gameweek {n}"

### 5.2 Keyboard Navigation

- Banner itself is NOT focusable (it's informational, not interactive)
- If made interactive in future (e.g., click to expand details), ensure:
  - Focusable via Tab
  - Activated via Enter/Space
  - Focus indicator visible (standard `focus-visible:ring-2`)

### 5.3 Color & Contrast

**Normal State:**
- Label text: `#94A3B8` on `#1A2235` → 5.8:1 ✅ AA
- Countdown: `#94A3B8` on `#1A2235` → 5.8:1 ✅ AA

**Warning State:**
- Countdown: `#ffd166` on `#1A2235` → 9.2:1 ✅ AAA
- Border: `#ffd166` at 30% opacity still distinguishable

**Critical State:**
- Countdown: `#ff5d7a` on `#1A2235` → 7.1:1 ✅ AAA
- Lock icon reinforces meaning (not color-reliant)

**Locked State:**
- Lock icon + "Locked" text ensures meaning without relying on color

### 5.4 Motion & Animation

**Respects `prefers-reduced-motion`:**
```css
@media (prefers-reduced-motion: reduce) {
  .deadline-warning,
  .deadline-critical {
    animation: none;
  }
}
```

**Implementation Note:**
- Add `motion-safe:animate-*` utilities in Tailwind
- Countdown second changes don't animate (text update only)

### 5.5 Focus Management

- No focus trapping or unexpected focus shifts
- Countdown updates don't cause focus loss
- Banner insertion doesn't steal focus from current element

---

## 6. Dark Mode Considerations

**Current State:** Dark mode is the DEFAULT (app uses premium dark design)

**Colors Used:**
- All colors sourced from existing dark mode tokens
- No separate light mode implementation needed for MVP
- Future light mode: Colors will auto-swap via CSS custom properties

**Visual Consistency:**
- Countdown uses same urgency colors as PredictionForm countdown
- Banner style matches existing card/surface patterns

---

## 7. Acceptance Criteria

### 7.1 Dashboard Countdown

- [ ] **AC-D-1:** Countdown banner appears between Stat Cards and Quick Action link
- [ ] **AC-D-2:** Label reads "GW {number} Predictions Lock In:" with Clock icon
- [ ] **AC-D-3:** Countdown shows time in format: `Xd Xh Xm` (> 1 day), `Xh Xm Xs` (≤ 1 day), `Xm Xs` (< 1 hour), `Xs` (< 1 minute)
- [ ] **AC-D-4:** Countdown color changes to warning (yellow) when < 1 hour remaining
- [ ] **AC-D-5:** Countdown color changes to error (red) when < 5 minutes remaining
- [ ] **AC-D-6:** When expired, shows "🔒 GW {n} Locked — Predictions closed"
- [ ] **AC-D-7:** Banner does NOT appear when no active season
- [ ] **AC-D-8:** Banner does NOT appear when no upcoming gameweeks
- [ ] **AC-D-9:** Banner does NOT appear when all fixtures postponed/cancelled
- [ ] **AC-D-10:** Shows countdown for NEXT gameweek (earliest upcoming deadline)
- [ ] **AC-D-11:** Countdown updates every second without layout shift
- [ ] **AC-D-12:** Respects custom deadline from `gameweek_deadlines` table
- [ ] **AC-D-13:** Falls back to earliest kickoff if no custom deadline

### 7.2 Fixtures Page Countdown

- [ ] **AC-F-1:** Countdown banner appears between header/gameweek label and gameweek selector
- [ ] **AC-F-2:** Label reads "Predictions Lock In:" (shorter than Dashboard, gameweek in header)
- [ ] **AC-F-3:** Countdown format identical to Dashboard countdown
- [ ] **AC-F-4:** Urgency colors identical to Dashboard countdown
- [ ] **AC-F-5:** When expired, shows "🔒 Locked — Predictions closed"
- [ ] **AC-F-6:** Banner does NOT appear when `gameweekDeadline === null`
- [ ] **AC-F-7:** Countdown shows deadline for SELECTED gameweek (not always "next")
- [ ] **AC-F-8:** If user navigates to past gameweek, shows "Locked" message
- [ ] **AC-F-9:** If user navigates to future gameweek, shows countdown to that gameweek's deadline
- [ ] **AC-F-10:** Respects custom deadline from `gameweek_deadlines` table
- [ ] **AC-F-11:** Falls back to earliest kickoff in selected gameweek if no custom deadline

### 7.3 Visual & Interaction

- [ ] **AC-V-1:** Banner has rounded corners (`rounded-card`)
- [ ] **AC-V-2:** Banner has standard border (`border-border`)
- [ ] **AC-V-3:** Banner background is `bg-surface`
- [ ] **AC-V-4:** Label text is `text-body-sm` and `text-text-secondary`
- [ ] **AC-V-5:** Countdown text is `text-body` (larger than label), `font-semibold`
- [ ] **AC-V-6:** Clock icon is 16×16 pixels, `text-text-secondary`
- [ ] **AC-V-7:** Layout uses flexbox with `justify-between`
- [ ] **AC-V-8:** Spacing is `px-4 py-3` (compact)
- [ ] **AC-V-9:** On mobile < 375px, label and countdown stack vertically, centered
- [ ] **AC-V-10:** Warning state (< 1 hour) adds subtle pulse animation (if enabled in accessibility settings)
- [ ] **AC-V-11:** Critical state (< 5 min) adds faster pulse animation (if enabled in accessibility settings)

### 7.4 Accessibility

- [ ] **AC-A-1:** Banner has `role="timer"`
- [ ] **AC-A-2:** Banner has `aria-live="polite"` (changes to "assertive" at < 1 minute)
- [ ] **AC-A-3:** Aria label provides full readable time (e.g., "2 hours 34 minutes")
- [ ] **AC-A-4:** Lock icon has `aria-hidden="true"` (text conveys meaning)
- [ ] **AC-A-5:** Clock icon has `aria-hidden="true"` (text conveys meaning)
- [ ] **AC-A-6:** Color contrast meets WCAG 2.1 AA for all states
- [ ] **AC-A-7:** Animations respect `prefers-reduced-motion` media query
- [ ] **AC-A-8:** Countdown updates don't cause focus loss or layout shift

### 7.5 Edge Cases

- [ ] **AC-E-1:** When season complete, Dashboard shows "Season Complete" message instead
- [ ] **AC-E-2:** When all fixtures in gameweek are live, shows "Locked" message
- [ ] **AC-E-3:** When custom deadline is after earliest kickoff, countdown uses custom deadline
- [ ] **AC-E-4:** When fetching deadline fails, banner doesn't appear (graceful degradation)
- [ ] **AC-E-5:** When user switches gameweeks on Fixtures page, countdown updates instantly

### 7.6 Performance

- [ ] **AC-P-1:** Countdown updates don't trigger page re-renders beyond the countdown component
- [ ] **AC-P-2:** Countdown interval clears on component unmount
- [ ] **AC-P-3:** Data fetching for deadline doesn't slow down initial page load (parallel fetching)

---

## 8. Implementation Notes for Development Agent

### 8.1 Dashboard Implementation

**File to Edit:** `src/app/(authenticated)/page.tsx`

**Data Fetching:**
Add to existing `Promise.all` block (around line 55):

```tsx
const [
  // ... existing queries
  nextGameweekRow,
  customGameweekDeadline,
] = await Promise.all([
  // ... existing queries
  
  // Fetch next upcoming gameweek
  supabase
    .from('fixtures')
    .select('gameweek, kickoff_time')
    .eq('season_id', season.id)
    .in('status', ['SCHEDULED', 'TIMED'])
    .order('kickoff_time', { ascending: true })
    .limit(1)
    .single(),
  
  // Fetch custom deadline for that gameweek (if exists)
  supabase
    .from('gameweek_deadlines')
    .select('deadline')
    .eq('season_id', season.id)
    .eq('gameweek', nextGameweekRow.data?.gameweek ?? 0)
    .maybeSingle(),
]);

const currentGameweek = nextGameweekRow.data?.gameweek ?? null;
const gameweekDeadline = customGameweekDeadline.data?.deadline 
  ?? nextGameweekRow.data?.kickoff_time 
  ?? null;
```

**Component Placement:**
Insert between stat cards section and quick action link (around line 215):

```tsx
{/* Stat cards */}
<div className="grid grid-cols-3 gap-3">
  {/* existing stat cards */}
</div>

{/* Gameweek deadline countdown */}
{currentGameweek && gameweekDeadline && (
  <div className="rounded-card border border-border bg-surface px-4 py-3">
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <Clock className="h-4 w-4 text-text-secondary" aria-hidden="true" />
        <span className="text-body-sm text-text-secondary">
          GW {currentGameweek} Predictions Lock In:
        </span>
      </div>
      <Countdown 
        targetDate={gameweekDeadline} 
        className="text-body font-semibold"
      />
    </div>
  </div>
)}

{/* Quick actions */}
<Link href="/predictions/me" ...>
```

**Imports to Add:**
```tsx
import { Clock } from 'lucide-react';
import { Countdown } from '@/components/countdown';
```

### 8.2 Fixtures Page Implementation

**File to Edit:** `src/app/(authenticated)/fixtures/page.tsx`

**Data:** `gameweekDeadline` is ALREADY computed (around line 104)! Just need to add the UI.

**Component Placement:**
Insert between header and gameweek selector (around line 124):

```tsx
{/* Header */}
<div className="flex items-center justify-between">
  {/* existing header */}
</div>

{/* Gameweek deadline countdown */}
{gameweekDeadline && (
  <div className="rounded-card border border-border bg-surface px-4 py-3">
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <Clock className="h-4 w-4 text-text-secondary" aria-hidden="true" />
        <span className="text-body-sm text-text-secondary">
          Predictions Lock In:
        </span>
      </div>
      <Countdown 
        targetDate={gameweekDeadline} 
        className="text-body font-semibold"
      />
    </div>
  </div>
)}

{/* Gameweek selector */}
<GameweekSelector gameweeks={uniqueGameweeks} selected={selectedGw} />
```

**Imports to Add:**
```tsx
import { Clock } from 'lucide-react';
import { Countdown } from '@/components/countdown';
```

(Note: `Countdown` might already be imported if used elsewhere in the file)

### 8.3 Optional Enhancements (Future)

**Enhancement 1: Locked State Variation**
When deadline passed, replace countdown with styled lock message:

```tsx
{gameweekDeadline && (
  new Date(gameweekDeadline) > new Date() ? (
    // Countdown banner
  ) : (
    // Locked banner
    <div className="rounded-card border border-border-subtle bg-surface px-4 py-3">
      <div className="flex items-center gap-2">
        <Lock className="h-4 w-4 text-text-tertiary" />
        <span className="text-body-sm text-text-tertiary">
          GW {currentGameweek} Locked — Predictions closed
        </span>
      </div>
    </div>
  )
)}
```

**Enhancement 2: Pulse Animation**
Add Tailwind animation classes based on countdown urgency. Requires adding custom animation to `tailwind.config.ts`:

```tsx
// In Countdown component or wrapper
className={cn(
  "text-body font-semibold",
  urgency === "critical" && "motion-safe:animate-pulse-slow",
  urgency === "warning" && "motion-safe:animate-pulse-slower"
)}
```

**Enhancement 3: Clickable Banner**
Make banner clickable to scroll to fixtures section or open gameweek info modal.

---

## 9. Open Questions & Recommendations

### 9.1 Questions for Product Owner

1. **Locked State Persistence:** Should "Locked" banner remain visible after deadline, or auto-hide?
   - **Recommendation:** Keep visible with low emphasis styling. Provides context.

2. **Season Complete Message:** Dashboard shows "Season Complete" when no upcoming gameweeks. Should it link to historical data?
   - **Recommendation:** Phase 2 feature. For now, just informational message.

3. **Multiple Live Gameweeks:** If fixtures span multiple gameweeks (rare), which deadline to show?
   - **Recommendation:** Show earliest deadline (next gameweek).

4. **Banner Dismissibility:** Should users be able to dismiss/hide the countdown?
   - **Recommendation:** No. Deadline is critical information that shouldn't be hidden.

### 9.2 Recommendations

1. **Analytics Tracking:**
   - Track how often users view pages with < 1 hour remaining
   - Track prediction submission time vs. deadline (are users procrastinating?)
   - This data can inform future UX improvements

2. **Push Notifications (Future):**
   - "1 hour until GW 29 deadline" notification
   - "15 minutes until deadline — 3 fixtures unpredicted"
   - Requires web push setup (separate feature)

3. **Countdown in Browser Tab (Future):**
   - Update `document.title` with countdown when < 30 minutes
   - Example: "(29m) Grand Football — Dashboard"
   - Good for users who keep tab open

4. **Prediction Status Indicator (Future):**
   - Next to countdown, show "5/8 predicted" progress
   - Example: "GW 29 Locks In: 2h 34m | 5/8 predicted"
   - Requires additional data fetching

5. **Design System Update:**
   - Add `DeadlineBanner` as a reusable component
   - Can be used for other deadline types (Star Man voting, etc.)

---

## 10. Success Metrics

### 10.1 Primary Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| **Missed predictions** | Decrease by 30% | Compare missed predictions before/after feature |
| **Last-minute predictions** | Decrease by 20% | Track predictions submitted in final 15 minutes |
| **Prediction completion rate** | Increase by 15% | % of users predicting all fixtures in a gameweek |

### 10.2 User Satisfaction

- Survey question: "How easy is it to know when predictions close?" (1-5 scale)
- Target: 4.5+ average score
- Current baseline: Unknown (estimate 3.0)

### 10.3 Technical Metrics

- Page load time impact: < 50ms increase
- Countdown render performance: No dropped frames (60 FPS)
- Error rate: < 0.1% of page loads

---

## 11. Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-03-14 | Strategy & Design Agent | Initial specification |

---

## Appendix A: Visual Mockups

### A.1 Dashboard Countdown (Normal State)

```
┌──────────────────────────────────────────────────────────┐
│  [Trophy Icon]     [Chart Icon]      [Award Icon]        │
│     #5                120               3                 │
│     RANK             POINTS          BADGES               │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│  🕐  GW 29 Predictions Lock In:           2h 34m 18s     │
│      [muted text]                         [secondary]    │
└──────────────────────────────────────────────────────────┘
```

### A.2 Dashboard Countdown (Warning State — < 1 hour)

```
┌──────────────────────────────────────────────────────────┐
│  🕐  GW 29 Predictions Lock In:            45m 22s       │
│      [muted text]                         [WARNING 🟡]   │
└──────────────────────────────────────────────────────────┘
```

### A.3 Dashboard Countdown (Critical State — < 5 minutes)

```
┌──────────────────────────────────────────────────────────┐
│  🕐  GW 29 Predictions Lock In:             3m 47s       │
│      [muted text]                        [CRITICAL 🔴]   │
└──────────────────────────────────────────────────────────┘
    ↑ subtle pulsing animation
```

### A.4 Dashboard Countdown (Locked State)

```
┌──────────────────────────────────────────────────────────┐
│  🔒  GW 29 Locked — Predictions closed                   │
│      [muted tertiary text]                               │
└──────────────────────────────────────────────────────────┘
```

### A.5 Fixtures Page Countdown (Normal State)

```
Fixtures                                      [2025/26 ⭐]
Gameweek 29

┌──────────────────────────────────────────────────────────┐
│  🕐  Predictions Lock In:                  2h 34m 18s    │
└──────────────────────────────────────────────────────────┘

[GW 27] [GW 28] [GW 29] [GW 30] [GW 31] ...
```

---

**END OF SPECIFICATION**

This specification is now ready for implementation by the Development Agent. All design decisions are documented, edge cases are addressed, and acceptance criteria are clear and testable.
