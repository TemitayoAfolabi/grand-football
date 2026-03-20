# Admin Fixture Gameweek Management — Design Specification

> **Document Owner:** Strategy & Design Agent
> **Date:** 2026-03-20
> **Status:** Ready for Architecture Review
> **Feature Area:** `/admin/fixtures`

---

## 1. Problem Statement

When matches are postponed or rescheduled, the admin currently has no UI to:
- Reassign a fixture to a different gameweek
- Mark a fixture as POSTPONED or CANCELLED
- Restore a postponed fixture back into an active gameweek

The only workaround today is running ad-hoc database scripts, which is slow, error-prone, and leaves no audit trail in the admin panel.

---

## 2. User Stories

### US-1 — Move Fixture to a Different Gameweek

> **As an admin, I want to reassign a fixture to a different gameweek so that the app reflects the rescheduled match date.**

**Priority:** Must Have

**Acceptance Criteria:**

```
Given a fixture in any status (SCHEDULED, TIMED, POSTPONED, CANCELLED)
When I open its "Manage" panel and set a target gameweek number
And I confirm the action
Then:
  - fixtures.gameweek is updated to the target value
  - fixtures.manually_overridden is set to true
  - An audit log entry is written with action MOVE_FIXTURE_GAMEWEEK,
    recording old_gameweek and new_gameweek
  - The fixture now appears under the target gameweek in all views
  - The cron sync job will NOT revert this change (manually_overridden = true)
```

```
Given the fixture has existing predictions
When I open the Manage panel before confirming
Then I see a warning: "X player(s) have predictions for this fixture.
  Their predictions will follow the fixture to GW [N] and remain editable
  until GW [N]'s deadline."
```

```
Given the fixture has status POSTPONED or CANCELLED
When I assign it to a gameweek and set status to SCHEDULED or TIMED
Then the fixture becomes active in the new gameweek
And the GW deadline for the new gameweek auto-recalculates (if no custom deadline is set)
```

```
Given the fixture has status FINISHED and has score_records
When I attempt to move it to a different gameweek
Then I see an elevated warning:
  "This fixture is FINISHED with a result. Moving it will reclassify all
  player scores into GW [N] on the leaderboard. This cannot be easily undone."
And I must check a confirmation checkbox before the Save button enables
```

```
Given any fixture
When I save a gameweek move
Then the source gameweek's deadline is NOT automatically changed
  (admin manually adjusts the deadline if needed)
And the system shows a follow-up nudge:
  "You may want to update the GW [old GW] deadline now that this
  fixture has moved."
```

---

### US-2 — Mark Fixture as Postponed

> **As an admin, I want to mark a fixture as POSTPONED so that players see it's not happening and scoring does not run for it.**

**Priority:** Must Have

**Acceptance Criteria:**

```
Given a fixture with status SCHEDULED or TIMED
When I click the Postpone quick-action button
And I confirm within the inline two-step confirm panel
Then:
  - fixtures.status = 'POSTPONED'
  - fixtures.manually_overridden = true
  - Audit log entry written with action SET_FIXTURE_STATUS
  - Fixture is excluded from user-facing GW deadline calculation
    (earliest non-postponed kickoff is used)
  - Fixture no longer shows in the user fixture list (existing filter
    at fixtures/page.tsx already excludes POSTPONED)
  - Any existing predictions for this fixture are retained (not deleted)
```

```
Given a SCHEDULED/TIMED fixture
When I open the Postpone confirmation panel
And the fixture has predictions
Then I see: "X player(s) have predictions for this fixture.
  They will be hidden from users until the fixture is reassigned or reinstated.
  No points will be awarded for a POSTPONED fixture."
```

```
Given a fixture with status IN_PLAY, PAUSED, or FINISHED
When I look at the fixture card in admin
Then the Postpone quick-action button is NOT shown
(Cannot postpone a kicked-off fixture via this shortcut;
 admin must use the full Manage panel with elevated warning)
```

---

### US-3 — Mark Fixture as Cancelled

> **As an admin, I want to mark a fixture as CANCELLED so that it is permanently removed from active gameplay.**

**Priority:** Must Have

**Acceptance Criteria:**

```
Given a fixture with status SCHEDULED, TIMED, or POSTPONED
When I use the Manage panel to set status to CANCELLED and confirm
Then:
  - fixtures.status = 'CANCELLED'
  - fixtures.manually_overridden = true
  - Audit log entry written
  - Fixture excluded from user-facing GW deadline calculation
  - Fixture excluded from user fixture list (existing filter handles this)
  - Existing predictions are retained (no scoring will ever run for
    a CANCELLED fixture)
```

```
Given a CANCELLED fixture
When I look at the admin fixtures page filtered to its gameweek
Then it appears in the fixture list with a "Cancelled" status badge
And its card shows a [Manage] button to allow reassignment
  (in case admin made an error or match is later reinstated)
```

---

### US-4 — Restore Postponed/Cancelled Fixture

> **As an admin, I want to reassign a postponed or cancelled fixture to an active gameweek so that players can predict the match once rescheduled.**

**Priority:** Must Have

**Acceptance Criteria:**

```
Given a POSTPONED or CANCELLED fixture visible in the admin page
When I use the Manage panel to set:
  - A target gameweek number
  - Status = SCHEDULED or TIMED
And I confirm
Then the fixture is active in the target gameweek
And any existing predictions for this fixture are now active
  under the new gameweek
And if the target GW deadline has not yet passed, players can
  edit or create predictions for this fixture
```

```
Given the target gameweek's deadline has already passed
When I restore a postponed fixture into it
Then I see an inline warning:
  "GW [N]'s deadline has already passed. Players will not be able to
  submit new predictions for this fixture unless you extend the deadline."
And the action can still proceed (admin decides)
```

---

### US-5 — View All Postponed/Cancelled Fixtures in One Place

> **As an admin, I want to easily find all fixtures not currently assigned to an active gameweek so I can manage postponements efficiently.**

**Priority:** Should Have

**Acceptance Criteria:**

```
Given the admin navigates to /admin/fixtures
When there are any POSTPONED or CANCELLED fixtures in the current season
Then a "Postponed & Cancelled" section is shown at the top of the page
  (collapsed by default, expandable with a toggle)
And it shows a count badge: "Postponed & Cancelled (N)"
```

```
Given the "Postponed & Cancelled" section is expanded
Then each fixture in that section shows:
  - Team names, original kickoff date, original gameweek
  - Status badge (POSTPONED or CANCELLED in appropriate colour)
  - A [Manage] button to open the inline Manage panel
```

```
Given there are no postponed or cancelled fixtures
Then the "Postponed & Cancelled" section is not shown
```

---

## 3. UX Design Specification

### 3.1 Existing Page Context

The `/admin/fixtures` page uses a vertical list of `Card` components. Existing inline actions (Star toggle, Override result) follow a pattern of:
- Action buttons in the card header row
- Click → inline form panel expands below the card content
- Confirm → data saved, panel closes

All new controls follow this same expansion pattern. No modals or overlays are introduced — this keeps the admin experience keyboard-navigable and consistent.

---

### 3.2 Changes to Each Fixture Card Row

Add a new button to the right-side action cluster on every fixture card:

```
[★ Star]  [Override]  [Manage ▾]
```

- `[Manage ▾]` (Lucide icon: `Settings2` or `SlidersHorizontal`)
- Button variant: `ghost`, size: `sm`
- When the Manage panel is open, the button changes to `[Close ✕]` (variant: `ghost`)
- The button is ALWAYS visible regardless of fixture status
  (unlike Star/Override which are conditionally shown)

**Status Badge** — the existing status line in the card subtitle should be enhanced:

```
GW 28 · [POSTPONED]  ·  Sat 15 Mar 15:00
```

Status badges by status:
| Status | Badge Variant | Colour cue |
|--------|--------------|------------|
| SCHEDULED / TIMED | `default` | Neutral |
| IN_PLAY / PAUSED / SUSPENDED | `live` | Green (pulsing) |
| FINISHED | `success` | Subdued green |
| POSTPONED | `warning` | Amber |
| CANCELLED | `error` | Red |

---

### 3.3 Postpone Quick-Action (Fast Path)

For SCHEDULED and TIMED fixtures only, add a dedicated quick-action button alongside the existing action cluster:

```
[★ Star]  [⏸ Postpone]  [Manage ▾]
```

- `[⏸ Postpone]` (Lucide icon: `PauseCircle`)
- Button variant: `ghost`, size: `sm`, with `text-warning` colour
- Not shown for fixtures that have already kicked off (IN_PLAY, PAUSED, FINISHED, etc.)

**Two-step inline confirmation flow:**

1. **Step 1 — First click:** The button label changes to `"Confirm postpone?"` with a danger colour, and two mini-buttons appear inline:
   - `[Yes, postpone]` (variant: `destructive`, size: `xs`)
   - `[Cancel]` (variant: `ghost`, size: `xs`)
   - If the fixture has predictions, a one-line warning is shown:
     `"⚠ X prediction(s) exist — they will be paused."`
   - The step-1 state auto-resets after 8 seconds of inactivity (focus trap reset)

2. **Step 2 — Confirm click:** The server action fires.
   - Loading state: button shows spinner, both step-2 buttons disabled
   - On success: card refreshes; status badge updates to `POSTPONED`
   - On error: inline error message under the buttons

---

### 3.4 Inline "Manage Gameweek" Panel

Triggered by clicking `[Manage ▾]` on any fixture. Expands directly below the card content, separated by a `border-t border-border` divider — identical DOM structure to the existing override form.

**Panel contents:**

```
┌──────────────────────────────────────────────────────────┐
│  Manage Fixture                                          │
│                                                          │
│  Gameweek        [  28  ▲▼ ]   (number input, 1–50)     │
│                                                          │
│  Status          [ SCHEDULED       ▼ ]                   │
│                  → SCHEDULED / TIMED / POSTPONED /       │
│                    CANCELLED  (only these 4 in dropdown) │
│                                                          │
│  ⚠  [Warning banner — conditional, see §3.4.1]          │
│                                                          │
│  [ ] I confirm this change                               │
│          (checkbox — required before Save enables)       │
│                                                          │
│  [Save Changes]    [Cancel]                              │
└──────────────────────────────────────────────────────────┘
```

**Field details:**

| Field | Type | Default | Constraints |
|-------|------|---------|-------------|
| Gameweek | `<input type="number">` | Current GW | 1–50, integer only |
| Status | `<select>` | Current status | SCHEDULED, TIMED, POSTPONED, CANCELLED |

Note: IN_PLAY, PAUSED, FINISHED, SUSPENDED are intentionally excluded from the Status dropdown — the admin should not manually set live/finished states via this panel (they use Override Result for scores). If the fixture is already FINISHED, those statuses remain visible as read-only display only (the dropdown still shows SCHEDULED/TIMED/POSTPONED/CANCELLED as the options for correction).

**Save button state:**
- Disabled until: (a) the confirmation checkbox is checked AND (b) at least one field has changed from its current value
- Shows a spinner while the server action is in-flight
- Disabled while `isPending`

---

#### 3.4.1 Warning Banner Rules

The warning banner appears inside the Manage panel. It is contextual — the correct warning is shown based on state:

| Condition | Warning text | Severity |
|-----------|-------------|----------|
| Fixture has N predictions AND GW is changing | "**X player(s)** have predictions for this fixture. Their predictions will move to GW [target] and remain editable until that gameweek's deadline." | Info (blue border) |
| Target GW deadline has already passed | "GW [N]'s prediction deadline has passed. Players will not be able to update their predictions for this fixture in the new gameweek." | Warning (amber border) |
| Fixture is FINISHED | "⚠ This fixture is FINISHED. Moving it will reclassify all **X score records** into GW [target] on the leaderboard. This is a high-impact change." | Destructive (red border) |
| Fixture is FINISHED AND GW is changing | Show the FINISHED warning only (it covers the predictions warning implicitly) | Destructive |
| POSTPONED → SCHEDULED and target GW deadline has passed | Show the "deadline passed" warning | Warning |

Warning banners are `role="alert"` with `aria-live="polite"` so screen readers announce them when they appear.

**When multiple conditions are met:** Show only the highest-severity warning (destructive > warning > info).

---

#### 3.4.2 Manage Panel Behaviour for FINISHED Fixtures

- The FINISHED warning is shown immediately when the panel opens (no interaction needed to trigger it)
- The confirmation checkbox label changes to:
  `"I understand this will change leaderboard scores across gameweeks"`
- The `[Save Changes]` button uses `variant="destructive"` instead of standard

---

### 3.5 Postponed & Cancelled Fixtures Section

Positioned at the **top** of the fixture list, above the deadline card and the main fixture list.

**Collapsed state (default):**
```
[▸ Postponed & Cancelled (3)]
```
- Rendered as a `<button>` with `aria-expanded="false"` and `aria-controls="postponed-section"`
- Clicking expands the section

**Expanded state:**
```
[▾ Postponed & Cancelled (3)]
─────────────────────────────────────
  Arsenal vs Man City           [POSTPONED]  GW28 · Originally 12 Mar
      [Manage ▾]
─────────────────────────────────────
  Brentford vs Wolves           [CANCELLED]  GW29 · Originally 19 Mar
      [Manage ▾]
─────────────────────────────────────
```

Each entry uses the same `Card` component as the main list, with the Manage panel available inline. The Postpone quick-action button is NOT shown here (the fixture is already postponed/cancelled).

This section is only rendered when there are fixtures with status POSTPONED or CANCELLED in the current season (fetched alongside the main fixtures query with no GW filter).

---

### 3.6 Success & Error Feedback

On successful save:
- The inline panel closes and the card immediately reflects the new gameweek/status
- The `Alert` banner at the top of the page shows:
  - Move: `"GW updated: Arsenal vs Man City moved from GW 28 to GW 31."`
  - Postpone: `"Arsenal vs Man City marked as POSTPONED."`
  - Restore: `"Arsenal vs Man City restored to GW 31 as SCHEDULED."`
- If the source/target gameweek deadline may be affected, append:
  `"You may want to review the GW [N] deadline."`

On error:
- Panel stays open
- `Alert` banner at top shows the error message
- Confirmation checkbox is reset to unchecked (forces deliberate re-confirm)

---

### 3.7 Responsive Behaviour

| Breakpoint | Behaviour |
|------------|-----------|
| Mobile (< 640px) | Manage panel fields stack vertically, full-width inputs |
| Tablet+ | Gameweek and Status fields side-by-side in a 2-column row, buttons right-aligned |

The Postpone quick-action button collapses to icon-only (`aria-label="Postpone fixture"`) at mobile widths to preserve card whitespace.

---

## 4. Accessibility Requirements

### 4.1 Keyboard Navigation

- All new buttons (`[Manage ▾]`, `[⏸ Postpone]`) are reachable via Tab in DOM order
- The Manage panel, when expanded, traps focus within the panel (Tab cycles through: Gameweek input → Status select → Confirmation checkbox → Save → Cancel → back to Gameweek input)
- `Escape` key closes the open panel, returning focus to the `[Manage ▾]` button that opened it
- The two-step Postpone confirmation (step-1 state) also returns focus to the `[⏸ Postpone]` button on Cancel or Escape or timeout

### 4.2 Screen Reader Support

| Element | ARIA requirement |
|---------|-----------------|
| `[Manage ▾]` toggle button | `aria-expanded="true/false"`, `aria-controls="manage-panel-{fixtureId}"` |
| Expanded panel | `id="manage-panel-{fixtureId}"`, `role="region"`, `aria-label="Manage {home} vs {away}"` |
| Warning banner | `role="alert"`, `aria-live="polite"` |
| FINISHED destructive warning | `role="alert"`, `aria-live="assertive"` |
| Confirmation checkbox | `aria-required="true"`, `aria-describedby` pointing to warning text |
| Save button (disabled) | `aria-disabled="true"` (not the `disabled` attribute, to keep it focusable) |
| Postpone step-1 confirmation | `aria-live="polite"` on the container so screen readers announce the state change |
| Postponed & Cancelled section | `<button aria-expanded aria-controls>` pattern; panel has `role="region"` |
| Status badges | Already use `Badge` component; ensure POSTPONED/CANCELLED badges have distinguishable text, not colour-only |

### 4.3 Colour Contrast

| Element | Requirement |
|---------|-------------|
| POSTPONED badge (amber) | Text on amber background must meet 4.5:1. Use `text-warning-dark` on `bg-warning/20` |
| CANCELLED badge (red) | Text meets 4.5:1 on error background |
| Destructive warning banner | Red border + red icon, BUT also includes an icon (`⚠`) so it's not colour-only |

### 4.4 Touch Targets

All new buttons must be ≥ 44×44px touch target (use `p-2` minimum on icon-only buttons).

### 4.5 Focus Indicators

Follow the existing `focus:ring-2 focus:ring-accent/20` pattern applied to all interactive elements throughout the codebase.

---

## 5. Edge Cases & Data Integrity

### 5.1 Predictions on a Moved Fixture

**Behaviour:** Predictions are stored per `fixture_id`, not per `gameweek`. When a fixture moves gameweek, ALL existing predictions automatically appear under the new gameweek — no data migration needed.

**Implication for editing:** If the new gameweek's deadline has not yet passed, the fixture appears active to users, and they can edit their predictions normally under the new gameweek.

**Implication for late penalty scoring:** The `submitted_at` / `updated_at` timestamp on each prediction is compared against the *active gameweek deadline at score calculation time*. If a player submitted a prediction before the old GW22 deadline but the fixture has moved to GW25 (whose deadline is in the future), their prediction is **not penalised** — `submitted_at` precedes the GW25 deadline, so it scores as on-time. This is the correct and desirable behaviour: players are not penalised for admin rescheduling.

**Edge case — prediction submitted after the new GW's deadline:** If a player edits their prediction after the fixture has been moved AND after the new gameweek's deadline, the new `updated_at` timestamp will incur the standard late penalty. This is correct.

**Policy decision (no DB change needed):** Predictions follow the fixture. No cascade updates required.

---

### 5.2 Score Records on a Moved FINISHED Fixture

**Context:** `score_records` are keyed by `(user_id, fixture_id)`. The leaderboard is aggregated by joining `score_records` through `fixtures.gameweek`. Moving a FINISHED fixture's gameweek **immediately changes which gameweek those score records contribute to** on the leaderboard.

**Required action:** After moving a FINISHED fixture, the admin **must** run the existing "Recalculate Scores" action for both the old and new gameweek to ensure leaderboard consistency. The Manage panel success toast should include:

> "GW changed. **Run score recalculation** for GW [old] and GW [new] to update leaderboard totals."

The `[Recalculate]` button already exists on the admin leaderboard page. This is a manual step — no automatic recalculation is triggered by the move action itself (consistent with existing admin patterns).

---

### 5.3 Moving a Fixture to a Gameweek That Doesn't Exist Yet

If the admin enters a GW number (e.g., 40) that has no other fixtures:

- The action succeeds — the fixture moves to GW 40
- GW 40 will now appear in the GW filter dropdown on the admin page
- The user-facing `/fixtures` page uses the fixture's `gameweek` field directly, so it will appear in GW 40 there too
- No new `gameweek_deadlines` row is created automatically; the deadline defaults to the earliest non-postponed kickoff in GW 40 (which is just this fixture)
- The success banner shows: "Moved to GW 40. This is a new gameweek with only 1 fixture — check the deadline."

**Validation:** The gameweek input must be between 1 and 50 inclusive (matching the DB CHECK constraint). Out-of-range values show an inline validation error before the Save button can be clicked.

---

### 5.4 Gameweek Deadline Recalculation After Postponement

When a fixture is marked POSTPONED or CANCELLED, the gameweek deadline logic (both server-side and client-side) already filters out POSTPONED/CANCELLED fixtures when computing "earliest kickoff". This means:

- The deadline naturally recalculates to the new earliest kickoff in that GW
- No admin action required to update the effective deadline
- If there is a **custom deadline** set for that GW (via `gameweek_deadlines` table), the custom deadline takes precedence and is NOT automatically changed

**Edge case — all fixtures in a GW become POSTPONED:** If every fixture in a gameweek is postponed, the effective deadline computation returns `null`. The user-facing page already handles `gameweekDeadline = null` (no countdown banner is shown). The admin page shows "No fixtures in this gameweek." This is handled gracefully already.

---

### 5.5 Cron Sync Protection

The football-data.org sync cron will re-fetch fixture metadata periodically. Any fixture with `manually_overridden = true` is skipped by the sync job.

**Requirement (to verify at implementation time):** Confirm the sync cron checks `manually_overridden` BEFORE updating `gameweek` and `status`. If not, the sync will overwrite the admin's postponement with the API's status. The `manually_overridden` flag set by all actions in this feature provides this protection — verify it in the cron implementation before shipping.

---

### 5.6 Star Game Status During Postponement

If a Star Game (`is_star_game = true`) is postponed:
- The star designation is **retained** on the fixture (no automatic clearing)
- When the fixture is restored to a new gameweek, it remains a Star Game
- The admin may use the existing Star toggle to clear it if desired

Exception: if a Star Game is moved to a gameweek that already has a Star Game, the admin must manually clear one. The system does not enforce a "one star game per GW" constraint at the DB level. Document this as a manual process for the admin.

---

### 5.7 Moving a Fixture When It's IN_PLAY or Live

The Manage panel does NOT restrict access based on status (unlike the Star toggle). An admin CAN open the Manage panel for a live fixture and change its gameweek.

**Warning (required):** If `status` is `IN_PLAY`, `PAUSED`, or `SUSPENDED`, the panel shows an additional warning at the top:

> "⚠ This fixture is currently LIVE. Changing its gameweek while in progress may cause inconsistencies in the live leaderboard. Proceed with caution."

The action is still allowed — it's an admin tool and the admin may have legitimate reasons.

---

### 5.8 Concurrent Admin Sessions

If two admins have the page open simultaneously:

- The last save wins (standard optimistic update pattern; no locking needed)
- The losing admin will see a stale card until they refresh
- The audit log records both actions with timestamps, so changes are traceable

No additional concurrency controls are required for an admin tool.

---

## 6. Server Action Design

Two new server actions, added to `src/app/(authenticated)/admin/actions.ts`.

### 6.1 `moveFixtureGameweek`

```typescript
export async function moveFixtureGameweek(
  fixtureId: string,
  targetGameweek: number,
  newStatus: 'SCHEDULED' | 'TIMED' | 'POSTPONED' | 'CANCELLED',
): Promise<{ error?: string; success?: boolean; warningMessage?: string }>
```

**Server-side logic:**
1. `requireAdmin()` guard
2. Validate: `fixtureId` is non-empty UUID; `targetGameweek` is integer 1–50; `newStatus` is one of the four allowed values
3. Fetch current fixture: `id, gameweek, status, home_team, away_team`
4. Reject if current `status` is `IN_PLAY` or `PAUSED` AND `newStatus` is one of SCHEDULED/TIMED: not allowed to "un-kickoff" a live game via this action — return `{ error: 'Cannot change status of a live or finished fixture to pre-kickoff via gameweek management.' }` … actually reconsider: admin should still be able to correct errors. Provide warning, do not block.
5. Update: `{ gameweek: targetGameweek, status: newStatus, manually_overridden: true, updated_at: now() }`
6. `auditLog(adminId, ADMIN_ACTIONS.MOVE_FIXTURE_GAMEWEEK, 'fixture', fixtureId, { gameweek: old, status: old }, { gameweek: new, status: new })`
7. `revalidatePath('/admin/fixtures')`, `revalidatePath('/fixtures')`
8. If `targetGameweek !== currentGameweek` and current status was FINISHED: set `warningMessage = 'Run score recalculation for GW [old] and GW [new].'`
9. Return `{ success: true, warningMessage }`

### 6.2 `setFixtureStatus`

```typescript
export async function setFixtureStatus(
  fixtureId: string,
  newStatus: 'POSTPONED' | 'CANCELLED',
): Promise<{ error?: string; success?: boolean }>
```

This is the fast-path action for the two-step Postpone button.

**Server-side logic:**
1. `requireAdmin()` guard
2. Validate: `fixtureId` UUID; `newStatus` is POSTPONED or CANCELLED
3. Fetch current: `id, status, manually_overridden`
4. Update: `{ status: newStatus, manually_overridden: true, updated_at: now() }`
5. `auditLog(adminId, ADMIN_ACTIONS.SET_FIXTURE_STATUS, 'fixture', fixtureId, { status: old }, { status: newStatus })`
6. `revalidatePath('/admin/fixtures')`, `revalidatePath('/fixtures')`
7. Return `{ success: true }`

---

## 7. Audit Log Changes

### 7.1 New ADMIN_ACTIONS constants

Add to `src/lib/constants.ts`:

```typescript
MOVE_FIXTURE_GAMEWEEK: 'MOVE_FIXTURE_GAMEWEEK',
SET_FIXTURE_STATUS: 'SET_FIXTURE_STATUS',
```

### 7.2 DB Migration

The `admin_audit_log.action` column has a `CHECK` constraint listing allowed values. A new migration is required to add the two new action types:

```sql
-- Migration: add gameweek management audit actions
ALTER TABLE public.admin_audit_log
  DROP CONSTRAINT admin_audit_log_action_check;

ALTER TABLE public.admin_audit_log
  ADD CONSTRAINT admin_audit_log_action_check CHECK (action IN (
    'TOGGLE_STAR', 'OVERRIDE_RESULT', 'RECALCULATE',
    'ADD_USER', 'REMOVE_USER', 'CREATE_USER',
    'RESET_USER_PASSWORD', 'RESEND_INVITE',
    'NEW_SEASON', 'EDIT_SCORE_RECORD',
    'CREATE_STAR_MAN_SESSION', 'ADD_STAR_MAN_NOMINEE',
    'REMOVE_STAR_MAN_NOMINEE', 'OPEN_STAR_MAN_VOTING',
    'CLOSE_STAR_MAN_VOTING', 'SET_GAMEWEEK_DEADLINE',
    'CLEAR_GAMEWEEK_DEADLINE',
    -- New:
    'MOVE_FIXTURE_GAMEWEEK',
    'SET_FIXTURE_STATUS'
  ));
```

### 7.3 Audit Log Payload Shapes

**MOVE_FIXTURE_GAMEWEEK:**
```json
{
  "old_value": { "gameweek": 28, "status": "POSTPONED" },
  "new_value": { "gameweek": 31, "status": "SCHEDULED" }
}
```

**SET_FIXTURE_STATUS:**
```json
{
  "old_value": { "status": "SCHEDULED" },
  "new_value": { "status": "POSTPONED" }
}
```

---

## 8. Non-Functional Requirements

| Requirement | Specification |
|-------------|--------------|
| **Response time** | Server actions must complete within 2 seconds (p95) under normal load. Single-row DB updates should be well within this. |
| **Optimistic UI** | No optimistic updates — wait for server confirmation before reflecting changes in the card (data freshness is critical for admin tools). |
| **Audit completeness** | 100% of gameweek moves and status changes must be recorded in `admin_audit_log`. The action must fail if the audit log insert fails. |
| **Cron sync safety** | After any action in this feature, `manually_overridden = true` MUST be set. This is non-negotiable for data integrity. |
| **Concurrent users** | Two admin users may use the page simultaneously; last-write-wins is acceptable. No distributed locking required. |
| **Input sanitisation** | `fixtureId` must be validated as a UUID server-side. `targetGameweek` validated as integer 1–50. Status validated against explicit string enum. Reject anything else with 400. |
| **No client-side auth** | All mutations go through `requireAdmin()` server action guard. The client never bypasses server-side checks. |

---

## 9. Work Breakdown

All tasks are ≤ 3 days. Ordered by recommended implementation sequence.

| # | Task | Effort | Dependency |
|---|------|--------|-----------|
| **T1** | DB migration: extend `admin_audit_log` CHECK constraint with new action types | 0.5 day | None |
| **T2** | Add `MOVE_FIXTURE_GAMEWEEK` and `SET_FIXTURE_STATUS` to `ADMIN_ACTIONS` constants | 0.25 day | None |
| **T3** | Implement `setFixtureStatus` server action (POSTPONED/CANCELLED fast-path) | 0.5 day | T1, T2 |
| **T4** | Implement `moveFixtureGameweek` server action (full move + status change) | 1 day | T1, T2 |
| **T5** | Add prediction count display helper to the `loadData` fetch in admin/fixtures page (count predictions per fixture for warning banners) | 0.5 day | None |
| **T6** | Build the two-step Postpone quick-action UI component on fixture cards | 0.5 day | T3, T5 |
| **T7** | Build the Manage panel inline form (GW number input, status select, warning banners, confirmation checkbox) | 1.5 days | T4, T5 |
| **T8** | Build the "Postponed & Cancelled" collapsible section at top of admin fixtures page | 0.5 day | T7 |
| **T9** | ARIA attributes, keyboard trap for Manage panel, Escape-to-close, focus return | 0.5 day | T6, T7, T8 |
| **T10** | Manual QA: postpone a future fixture, move it to new GW, verify prediction count warning, verify deadline recalculation, verify audit log entry | 0.5 day | All |

**Total estimated effort:** ~6 days

---

## 10. Out of Scope

The following are explicitly NOT part of this feature:

- **Bulk operations:** Moving multiple fixtures at once (admin manages one fixture at a time)
- **Player notification:** No push notifications or emails to players when a fixture is postponed (out of scope for this iteration)
- **Automatic score recalculation:** When a FINISHED fixture is moved, recalculation is a manual step performed on the admin leaderboard page
- **New gameweek creation UI:** Admin enters any GW number 1–50; there is no separate "create gameweek" flow
- **Cron sync rewrite:** The cron sync job is not changed by this feature; we rely on `manually_overridden = true` to protect admin changes

---

## 11. Open Questions (Resolved)

| Question | Decision |
|----------|----------|
| Should predictions be deleted when a fixture is CANCELLED? | **No.** Predictions are retained. They become inactive (no points scored for a CANCELLED fixture). Retaining them preserves the player's intent and audit history. |
| Should moving a FINISHED fixture trigger automatic score recalculation? | **No.** Admin manually triggers recalculation. Automatic recalculation on every GW move would be a hidden side-effect and could be expensive if the admin makes errors. |
| Should the admin be able to change status TO FINISHED via the Manage panel? | **No.** Setting FINISHED is done via the existing "Override Result" flow which also requires entering a score. The Manage panel only allows SCHEDULED / TIMED / POSTPONED / CANCELLED. |
| One Star Game per GW enforcement? | **No DB constraint.** Admin manually manages this. The system provides no enforcement (consistent with existing pattern where `is_star_game` is a simple boolean with no uniqueness constraint). |
| Should postponed fixtures be permanently hidden from the user-facing GW or shown as "postponed"? | **Hidden.** The existing `fixtures/page.tsx` already filters out POSTPONED and CANCELLED. This behaviour is retained. |

---

*This specification is complete and ready for Architecture & Security review.*
