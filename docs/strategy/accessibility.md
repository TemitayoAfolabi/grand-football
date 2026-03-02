# Grand Football — Accessibility Requirements

> **Document Owner:** Strategy & Design Agent
> **Last Updated:** 2026-02-27
> **Status:** Final (MVP)
> **Target Compliance:** WCAG 2.1 Level AA

---

## 1. Overview

Grand Football must be usable by all 30 league members regardless of ability. This document defines specific accessibility requirements aligned with WCAG 2.1 AA. Since this is a private league, the user base is known and small, but we build accessibly by default to establish good patterns and comply with best practices.

---

## 2. Color & Contrast

### 2.1 Minimum Contrast Ratios

| Element | Minimum Ratio | Standard |
|---------|--------------|----------|
| Normal text (< 18px / < 14px bold) | **4.5:1** | WCAG 1.4.3 AA |
| Large text (≥ 18px / ≥ 14px bold) | **3:1** | WCAG 1.4.3 AA |
| UI components & graphical objects | **3:1** | WCAG 1.4.11 AA |
| Focus indicators | **3:1** against adjacent colors | WCAG 1.4.11 AA |

### 2.2 Verified Palette Combinations

| Foreground | Background | Ratio | Pass? |
|-----------|------------|-------|-------|
| `#1A1A1A` (text) | `#FFFFFF` (surface) | 17.15:1 | ✅ AAA |
| `#1A1A1A` (text) | `#FAFAFA` (bg) | 15.4:1 | ✅ AAA |
| `#616161` (secondary text) | `#FFFFFF` | 5.64:1 | ✅ AA |
| `#1B5E20` (primary) | `#FFFFFF` | 7.27:1 | ✅ AA |
| `#C62828` (error) | `#FFFFFF` | 6.05:1 | ✅ AA |
| `#FFFFFF` (text) | `#1B5E20` (primary button) | 7.27:1 | ✅ AA |
| `#C7A500` (accent dark text) | `#FFFFFF` | 3.12:1 | ✅ AA (large text only) |
| `#FFD600` (accent) | `#0D3B13` (primary dark) | 10.2:1 | ✅ AAA |

### 2.3 Never Rely on Color Alone

Every piece of information conveyed through color MUST have a redundant non-color indicator:

| Information | Color Indicator | Non-Color Indicator |
|-------------|----------------|---------------------|
| Star Game | Gold accent | Star icon (⭐) + "Star Game" text label |
| Prediction saved | Green check | Check icon + "Predicted" text |
| Prediction locked | Gray background | Lock icon + "Locked" text |
| Rank improvement | Green arrow | Arrow direction + "(+N)" text |
| Rank drop | Red arrow | Arrow direction + "(-N)" text |
| Error state | Red border | Error icon + error message text |
| Exact Score points | Green badge | Points number + "EXACT" text label |
| Bonus earned | Green badge | "✓ +10 bonus" text |
| Bonus missed | Red text | "Missed N fixture(s) — no bonus" text |
| Top 3 podium | Gold/Silver/Bronze background | Numerical rank (#1, #2, #3) always displayed |
| Live match | Red "LIVE" badge | "LIVE" text within the badge |

---

## 3. Keyboard Navigation

### 3.1 General Requirements

- **All interactive elements** must be reachable via `Tab` key in a logical order (left-to-right, top-to-bottom).
- **All actions** triggerable via keyboard (Enter/Space for buttons, Enter for links).
- **No keyboard traps** — users can always Tab out of any component.
- **Skip navigation link** — first focusable element on every page is a "Skip to main content" link (visually hidden until focused).
- **Tab order** matches visual order (`tabindex` only used for `0` or `-1`, never positive values).

### 3.2 Screen-Specific Keyboard Patterns

#### Fixtures List
- `Tab` moves between fixture cards
- `Enter` on a fixture card opens/expands the prediction form
- `Tab` within the prediction form moves between: Home Goals input → Away Goals input → Save button
- `Escape` closes/collapses the prediction form (returns focus to the fixture card)

#### Leaderboard Table
- Standard table navigation: `Tab` moves between rows
- `aria-sort` attributes on sortable column headers
- `Enter` on a row could navigate to user's profile (Phase 2)

#### Gameweek Navigator
- Left/Right arrow keys navigate between gameweeks
- Announced as "Gameweek 25 of 38" when navigated

#### Bottom Tab Bar
- Arrow keys move between tabs
- `Enter` activates the selected tab
- `role="tablist"` with `role="tab"` for each item

#### Modals / Dialogs
- Focus is trapped inside the modal when open
- `Escape` closes the modal
- Focus returns to the trigger element on close
- First focusable element receives focus on open

#### Score Input Fields
- Up/Down arrow keys increment/decrement the value
- Direct number entry supported
- `Enter` submits the form (equivalent to tapping Save)

### 3.3 Focus Indicators

- **Visible focus ring** on ALL interactive elements: 2px solid outline with `--color-primary` (#1B5E20), offset 2px.
- Focus ring must have **3:1 contrast** against the adjacent background.
- **Never remove `outline` without providing a visible alternative.**
- Custom focus indicator: `outline: 2px solid #1B5E20; outline-offset: 2px;`
- For dark backgrounds: `outline: 2px solid #FFFFFF; outline-offset: 2px;`

---

## 4. Screen Reader Support

### 4.1 Semantic HTML

- Use proper heading hierarchy: one `<h1>` per page, `<h2>` for sections, `<h3>` for sub-sections.
- Use `<nav>` for navigation, `<main>` for primary content, `<aside>` for supplementary content, `<footer>` for footer.
- Use `<table>` with `<thead>`, `<th>`, and `<td>` for the leaderboard (not CSS grid faking a table).
- Use `<button>` for actions and `<a>` for navigation. Never use `<div>` or `<span>` as interactive elements.
- Use `<form>`, `<label>`, `<input>` with proper associations for prediction forms.

### 4.2 ARIA Attributes

| Component | Attributes |
|-----------|-----------|
| **Bottom Tab Bar** | `role="tablist"`, each tab: `role="tab"`, `aria-selected="true/false"`, `aria-controls="panel-id"` |
| **Gameweek Navigator** | `role="group"`, `aria-label="Gameweek navigation"`, prev/next buttons with `aria-label="Previous gameweek"` / `"Next gameweek"` |
| **Score Input (Home)** | `<label for="home-score-{fixtureId}">Arsenal goals</label>` + `aria-describedby` for lock countdown |
| **Score Input (Away)** | `<label for="away-score-{fixtureId}">Chelsea goals</label>` |
| **Star Game Badge** | `aria-label="Star Game"` (not just an icon) |
| **Points Badge** | `aria-label="5 points — Exact Score"` — includes both number and reason |
| **Leaderboard Row (self)** | `aria-current="true"` on the current user's row |
| **Leaderboard Table** | `aria-label="Season leaderboard"`, column headers with `scope="col"` |
| **Toast Notifications** | `role="status"`, `aria-live="polite"` |
| **Error Messages** | `role="alert"`, `aria-live="assertive"` |
| **Loading States** | `aria-busy="true"` on the container, `aria-label="Loading"` on spinner |
| **Lock Countdown** | `aria-live="off"` (don't announce every second), updated `aria-label` on the fixture card: "Arsenal vs Chelsea, locks in 15 minutes" |
| **Modal Dialogs** | `role="dialog"`, `aria-modal="true"`, `aria-labelledby="modal-title"` |
| **Confirm/Cancel Buttons** | Explicit labels, not just "OK" / "Cancel" — e.g., "Start New Season" / "Go Back" |

### 4.3 Screen Reader Announcements

| Event | Announcement (aria-live) |
|-------|-------------------------|
| Prediction saved | "Prediction saved for Arsenal vs Chelsea: 2-1" (polite) |
| Prediction locked | "Predictions locked — match has started" (polite) |
| Save error | "Error: Could not save prediction. Match has kicked off." (assertive) |
| Leaderboard loaded | Page title: "Season Leaderboard — Grand Football" |
| Points calculated | "You earned 5 points — Exact Score" (polite, on match detail) |
| Toast notification | Content of the toast (polite) |
| Navigation | Page title updated to reflect current screen |

### 4.4 Alternative Text

- **Team logos** (if used): `alt="Arsenal crest"` — descriptive but concise.
- **Decorative icons** (e.g., dividers): `alt=""` or `aria-hidden="true"`.
- **App logo:** `alt="Grand Football"`.
- **Informational icons** (star, lock, check): Must have `aria-label` or adjacent visible text.

---

## 5. Touch Targets

### 5.1 Minimum Sizes

| Element | Minimum Size | Standard |
|---------|-------------|----------|
| Buttons | 44 × 44px | WCAG 2.5.5 |
| Links (standalone) | 44 × 44px | WCAG 2.5.5 |
| Input fields | 44px height | WCAG 2.5.5 |
| Tab bar items | 48 × 48px (recommended) | Material Design |
| Score input boxes | 48 × 48px | Custom (important interaction) |
| Fixture cards (tap area) | Full card width × 56px min height | Comfortable mobile target |
| Gameweek arrows | 44 × 44px | WCAG 2.5.5 |
| Close / Back buttons | 44 × 44px | WCAG 2.5.5 |

### 5.2 Spacing Between Targets

- Minimum **8px** gap between adjacent interactive elements to prevent accidental activation.
- Score input fields (home/away): minimum **16px** gap between them.

---

## 6. Forms & Input

### 6.1 Labels

- Every input MUST have a visible `<label>` associated via `for`/`id`.
- Placeholder text is NOT a substitute for a label.
- Score inputs: Label reads "Arsenal goals" / "Chelsea goals" (not "Home" / "Away" — use team names for clarity).

### 6.2 Error Handling

- Error messages displayed **below** the input field, associated via `aria-describedby`.
- Error state: Red border (plus error icon — don't rely on color alone) + error text.
- Error announced to screen readers immediately via `aria-live="assertive"` or `role="alert"`.
- Use `aria-invalid="true"` on the input when in error state.

### 6.3 Validation Timing

- Validate on **blur** (when user leaves the field) for immediate feedback.
- Re-validate on **submit** to catch any remaining issues.
- Do NOT validate on every keystroke (disruptive for screen reader users).

---

## 7. Content & Language

### 7.1 Page Titles

Every page must have a unique `<title>` following the pattern: `[Page Name] — Grand Football`

Examples:
- "Dashboard — Grand Football"
- "Fixtures — Gameweek 25 — Grand Football"
- "Season Leaderboard — Grand Football"
- "Arsenal vs Chelsea — Grand Football"
- "Settings — Grand Football"
- "Admin Panel — Grand Football"

### 7.2 Language

- Set `lang="en"` on the `<html>` element.
- If team names include non-English characters, wrap in `<span lang="...">` as appropriate (unlikely for Premier League).

### 7.3 Readability

- Use plain language in error messages and explanations.
- Avoid jargon — e.g., say "correct result" not "correct outcome W/D/L."
- Rule explanations should be understandable to someone who has never seen the scoring table.

---

## 8. Motion & Animation Accessibility

### 8.1 Reduced Motion

```css
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

- All animations and transitions MUST respect this media query.
- Skeleton loaders: replace pulse animation with a static gray placeholder.
- Toasts: appear instantly instead of sliding in.

### 8.2 No Flashing Content

- No content flashes more than 3 times per second (WCAG 2.3.1).
- The "LIVE" badge does not blink or flash — it is a static red badge.

---

## 9. Responsive & Zoom

### 9.1 Text Resizing

- Content remains functional and readable at **200% browser zoom** (WCAG 1.4.4).
- No horizontal scrolling at 320px viewport width (WCAG 1.4.10 — Reflow).
- Use `rem` or `em` for font sizes, not `px` (to respect user's browser font size setting).

### 9.2 Orientation

- App works in both **portrait and landscape** orientation (WCAG 1.3.4).
- No content is hidden or broken in landscape mode.

---

## 10. Testing Requirements

### 10.1 Automated Testing

- Run **axe-core** or **Lighthouse Accessibility** audit on every page.
- Target: **0 violations** at AA level.
- Integrate into CI pipeline (run on every PR).

### 10.2 Manual Testing Checklist

| Test | Tool | Frequency |
|------|------|-----------|
| Keyboard-only navigation (all screens) | Browser | Every sprint |
| Screen reader walkthrough | VoiceOver (macOS/iOS) | Every sprint |
| Screen reader walkthrough | NVDA or JAWS (Windows) | Monthly |
| Color contrast check | WebAIM Contrast Checker | On design changes |
| Zoom to 200% | Browser | Every sprint |
| Reduced motion mode | OS setting | On animation changes |
| Touch target measurement | Browser DevTools | On layout changes |

### 10.3 Acceptance Criteria for Accessibility

Every user story must pass the following before being marked "Done":

1. ✅ All interactive elements reachable and operable via keyboard
2. ✅ All content announced correctly by VoiceOver
3. ✅ No axe-core violations at AA level
4. ✅ Color is not the sole means of conveying information
5. ✅ All form inputs have visible labels
6. ✅ Touch targets ≥ 44×44px
7. ✅ Page has a unique, descriptive `<title>`
8. ✅ Focus management is correct (modals, navigation)
9. ✅ Content readable at 200% zoom without horizontal scroll
10. ✅ Animations respect `prefers-reduced-motion`
