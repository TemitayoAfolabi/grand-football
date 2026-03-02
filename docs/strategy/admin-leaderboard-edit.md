# Admin Leaderboard Edit with Public Audit Trail

> **Status**: Draft  
> **Date**: 2026-02-28  
> **Scope**: Admin score correction feature + public transparency log

---

## 1. User Stories

### US-1: Admin edits a score record

**As** an admin, **I want** to adjust the `points_awarded` for a specific user's fixture score record, **so that** I can correct scoring engine errors or apply manual overrides.

**Acceptance Criteria:**

1. Admin navigates to `/admin/leaderboard` and sees a searchable/filterable list of score records.
2. Admin can filter by gameweek, user, or fixture.
3. Admin selects a score record and sees current values (`points_awarded`, `reason_code`, fixture details, prediction).
4. Admin enters a new `points_awarded` value and a **mandatory reason note** (min 10 chars).
5. On submit, the `score_records.points_awarded` is updated, and an `admin_audit_log` entry is created with action `EDIT_SCORE_RECORD`.
6. The leaderboard reflects the updated points immediately after revalidation.
7. If the new value equals the old value, the form shows an error and does not submit.

### US-2: All users see a leaderboard-edit indicator

**As** a user, **I want** to see when admin edits have been made to the leaderboard, **so that** I trust the scoring is transparent and fair.

**Acceptance Criteria:**

1. On the leaderboard page, if any `EDIT_SCORE_RECORD` audit entries exist for the active season, an info banner appears below the heading: _"Some scores have been manually adjusted by an admin. [View changes](#)"_.
2. The banner links to an inline expandable section or modal showing the public audit log.
3. Users who have NOT had any edits see nothing different about their own rows.

### US-3: All users can view the leaderboard edit log

**As** a user, **I want** to read a log of all leaderboard edits, **so that** I can see who was affected, what changed, and why.

**Acceptance Criteria:**

1. The log shows each edit with: affected player's display name, fixture (home vs away, gameweek), old points, new points, admin's reason note, and timestamp.
2. The log does NOT expose admin identity (just "Admin" label) to prevent social dynamics.
3. Entries are sorted newest-first.
4. The log only shows `EDIT_SCORE_RECORD` actions — no other admin actions are exposed.
5. The log is accessible from the leaderboard page and requires authenticated access (not public internet).

### US-4: Admin views full edit history on admin page

**As** an admin, **I want** to see the full edit history on `/admin/leaderboard` including which admin made each change, **so that** I have complete accountability.

**Acceptance Criteria:**

1. The admin leaderboard page shows a "Recent Edits" section with full audit details including admin display name.
2. Admins can see all fields: admin name, affected user, fixture, old/new points, reason, timestamp.

---

## 2. UI/UX Design Spec

### 2.1 Admin Page: `/admin/leaderboard`

**Layout** (follows existing admin page patterns):

```
┌─────────────────────────────────────────────────┐
│ ← Admin / Score Corrections                     │
├─────────────────────────────────────────────────┤
│ Filters:                                         │
│ [Gameweek ▼]  [User search ____]  [Search btn]  │
├─────────────────────────────────────────────────┤
│ Score Records Table                              │
│ ┌───┬──────────┬───────────┬───┬────────┬─────┐ │
│ │ GW│ Player   │ Fixture   │Pts│ Reason │ Edit│ │
│ ├───┼──────────┼───────────┼───┼────────┼─────┤ │
│ │ 12│ Temi     │ ARS v CHE │ 5 │ EXACT  │ [✏]│ │
│ │ 12│ Temi     │ LIV v MUN │ 0 │ WRONG  │ [✏]│ │
│ └───┴──────────┴───────────┴───┴────────┴─────┘ │
├─────────────────────────────────────────────────┤
│ Recent Edits (last 20)                           │
│ ┌───────────────────────────────────────────────┐│
│ │ 28 Feb 12:30 · Admin: You                    ││
│ │ Temi · ARS v CHE (GW12)                      ││
│ │ 0 → 5 pts · "Scoring bug: BTTS not applied"  ││
│ └───────────────────────────────────────────────┘│
└─────────────────────────────────────────────────┘
```

**Edit Flow** — clicking the ✏ pencil icon opens an inline edit or modal:

```
┌────────────────────────────────────┐
│ Edit Score: Temi — ARS v CHE (GW12)│
├────────────────────────────────────┤
│ Prediction: 2-1                    │
│ Actual:     2-1                    │
│ Current Points: 0 (WRONG)         │
│                                    │
│ New Points: [___5__]               │
│ Reason:     [Scoring bug: BTTS ___]│
│             (required, min 10 chars)│
│                                    │
│         [Cancel]  [Save Edit]      │
└────────────────────────────────────┘
```

**Components:**

| Component | Type | Notes |
|---|---|---|
| `AdminScoreCorrections` | Server component (page) | Fetches score records with filters |
| `ScoreRecordTable` | Client component | Filterable table of score records |
| `EditScoreDialog` | Client component | Modal/inline form for editing points |
| `AdminEditHistory` | Server component | Recent edits section |

### 2.2 Leaderboard Page: Edit Indicator Banner

Inserted between the `<h1>` and the `<Tabs>` on the leaderboard page:

```
┌─────────────────────────────────────────────────┐
│ ℹ️  Some scores have been manually adjusted.     │
│     View changes ›                               │
└─────────────────────────────────────────────────┘
```

- Uses the existing `Alert` component (`src/components/ui/alert.tsx`) with `variant="info"`.
- "View changes" toggles an expandable section below the banner or navigates to `/leaderboard?tab=audit`.
- Banner only renders when a server query finds ≥1 `EDIT_SCORE_RECORD` entries for the active season.
- **Query**: Count audit entries where `action = 'EDIT_SCORE_RECORD'` AND the target `score_record` belongs to a fixture in the active season.

### 2.3 Public Audit Log (on Leaderboard Page)

Rendered as an expandable accordion or a fourth tab ("Edit Log"):

**Option chosen: Expandable section below banner** (avoids cluttering tabs for a rarely-used view).

```
┌─────────────────────────────────────────────────┐
│ Score Corrections                        [Close]│
├─────────────────────────────────────────────────┤
│ 28 Feb 2026 · GW12                              │
│ Temi · Arsenal vs Chelsea                        │
│ Points: 0 → 5 · "Scoring bug: BTTS not applied" │
│─────────────────────────────────────────────────│
│ 25 Feb 2026 · GW11                              │
│ Alex · Liverpool vs Man Utd                      │
│ Points: 3 → 5 · "Exact score missed by engine"  │
└─────────────────────────────────────────────────┘
```

**Fields shown to regular users:**

| Field | Source |
|---|---|
| Date | `admin_audit_log.created_at` |
| Player name | Join `profiles.display_name` via `new_value->>'user_id'` |
| Fixture | Join `fixtures` via `target_id` (the score_record's fixture_id stored in new_value) |
| Gameweek | From fixture |
| Old points | `old_value->>'points_awarded'` |
| New points | `new_value->>'points_awarded'` |
| Reason | `new_value->>'reason_note'` |

**Not shown to regular users:** admin identity (`admin_id`).

---

## 3. Key Technical Decisions

### D-1: Edit `score_records` directly, not a separate adjustments table

**Decision:** Update `points_awarded` on the existing `score_records` row.

**Rationale:** The leaderboard RPC (`get_season_leaderboard`) already aggregates `score_records.points_awarded`. Adding a separate adjustments table would require modifying the RPC and all leaderboard queries. Editing in-place is simpler; the audit log preserves history.

**Trade-off:** We lose the original computed value in the row itself, but it's preserved in `admin_audit_log.old_value`.

### D-2: Do NOT change `reason_code` when editing points

**Decision:** Only `points_awarded` is editable. `reason_code` stays as the engine computed it.

**Rationale:** `reason_code` reflects what the scoring engine determined (EXACT, OUTCOME, etc.). Changing it would break count-based stats (exact_count, outcome_count). If the reason was wrong, the admin should use the existing "Override Result + Recalculate" flow instead.

**Exception considered:** If needed in future, a new reason_code `ADMIN_OVERRIDE` could be added, but this changes leaderboard tie-breaking logic and is out of scope.

### D-3: New RLS policy for public read of leaderboard edits

**Decision:** Add a new SELECT policy on `admin_audit_log` allowing all authenticated users to read rows where `action = 'EDIT_SCORE_RECORD'`.

```sql
CREATE POLICY "audit_log_select_leaderboard_edits"
  ON public.admin_audit_log FOR SELECT
  TO authenticated
  USING (action = 'EDIT_SCORE_RECORD');
```

This runs alongside the existing `audit_log_select_admin` policy (Postgres OR's multiple policies). Admins see everything; regular users see only score edits.

### D-4: Store structured data in audit log jsonb fields

**Schema for `old_value` / `new_value`:**

```jsonb
-- old_value
{
  "points_awarded": 0,
  "user_id": "uuid",
  "fixture_id": "uuid",
  "display_name": "Temi",
  "fixture_label": "ARS v CHE",
  "gameweek": 12
}

-- new_value
{
  "points_awarded": 5,
  "reason_note": "Scoring bug: BTTS not applied",
  "user_id": "uuid",
  "fixture_id": "uuid"
}
```

Denormalizing `display_name` and `fixture_label` into the jsonb avoids extra joins in the public audit view (performance) and preserves data even if a user changes their name later.

### D-5: Use `target_id` to reference the `score_records.id`

**Decision:** `admin_audit_log.target_id` = the `score_records.id` UUID. `target_type` = `'score_record'`.

This follows the existing pattern (e.g., `target_type: 'fixture'` for override actions).

### D-6: Filter audit entries by season via denormalized gameweek/fixture data

To check if edits exist for the active season, query:

```sql
SELECT COUNT(*) FROM admin_audit_log
WHERE action = 'EDIT_SCORE_RECORD'
  AND (new_value->>'fixture_id')::uuid IN (
    SELECT id FROM fixtures WHERE season_id = $1
  );
```

Alternatively, store `season_id` in `new_value` to avoid the subquery. **Chosen: store `season_id` in `new_value`** for simpler queries.

---

## 4. Edge Cases

| # | Edge Case | Handling |
|---|---|---|
| 1 | Admin sets points to same value | Frontend validation rejects; no audit entry created |
| 2 | Admin edits same record twice | Both edits logged separately; each `old_value` reflects state at time of edit |
| 3 | Score recalculation runs after manual edit | **Recalculate overwrites the manual edit.** Mitigate: show warning on admin page if record was previously manually edited. Consider adding `manually_edited` boolean to `score_records` and skipping those during recalculation |
| 4 | Negative points entered | Validation: `points_awarded` must be ≥ 0 and ≤ 99 (matches fixture score constraint pattern) |
| 5 | Admin edits record for a non-FINISHED fixture | Block: only allow edits on score records linked to FINISHED fixtures |
| 6 | User changes display name after edit | No impact — display name is denormalized in audit log jsonb |
| 7 | Large number of edits | Unlikely (small user group, ~30 users). Paginate if > 50 entries. MVP: show all |
| 8 | Concurrent admin edits on same record | Last write wins (Supabase single-row update is atomic). Both logged. Acceptable for ≤2 admins |
| 9 | Fixture deleted after score edit logged | Audit log retains denormalized fixture label. No broken references in the UI |
| 10 | `reason_note` contains inappropriate content | Admin-only input; trust boundary. No profanity filter needed for ~30-user private group |

---

## 5. Database Changes (Migration `00006`)

```sql
-- 1. Update admin_audit_log CHECK constraint to include new action
ALTER TABLE public.admin_audit_log
  DROP CONSTRAINT IF EXISTS admin_audit_log_action_check;

ALTER TABLE public.admin_audit_log
  ADD CONSTRAINT admin_audit_log_action_check
  CHECK (action IN (
    'TOGGLE_STAR', 'OVERRIDE_RESULT', 'RECALCULATE',
    'ADD_USER', 'REMOVE_USER', 'NEW_SEASON',
    'CREATE_STAR_MAN_SESSION', 'ADD_STAR_MAN_NOMINEE', 'REMOVE_STAR_MAN_NOMINEE',
    'OPEN_STAR_MAN_VOTING', 'CLOSE_STAR_MAN_VOTING',
    'CREATE_STAR_GAME_VOTE_SESSION', 'OPEN_STAR_GAME_VOTING', 'CLOSE_STAR_GAME_VOTING',
    'APPLY_STAR_GAME_RESULTS', 'OVERRIDE_STAR_GAMES', 'MANUAL_STAR_GAME_PICK',
    'DELETE_STAR_GAME_VOTE_SESSION', 'AUTO_CLOSE_STAR_GAME_VOTING',
    'EDIT_SCORE_RECORD'
  ));

-- 2. Public read policy for leaderboard edits
CREATE POLICY "audit_log_select_leaderboard_edits"
  ON public.admin_audit_log FOR SELECT
  TO authenticated
  USING (action = 'EDIT_SCORE_RECORD');

-- 3. Optional: add manually_edited flag to score_records
ALTER TABLE public.score_records
  ADD COLUMN manually_edited boolean NOT NULL DEFAULT false;

-- 4. Index for fast audit log queries by action
CREATE INDEX idx_audit_log_action_edit
  ON public.admin_audit_log (action)
  WHERE action = 'EDIT_SCORE_RECORD';
```

---

## 6. Code Changes Summary

| File | Change |
|---|---|
| `src/lib/constants.ts` | Add `EDIT_SCORE_RECORD` to `ADMIN_ACTIONS` |
| `src/lib/validations.ts` | Add `editScoreSchema` (new_points: int 0-99, reason_note: string min 10) |
| `src/app/(authenticated)/admin/actions.ts` | Add `editScoreRecord` server action |
| `src/app/(authenticated)/admin/leaderboard/page.tsx` | New admin page: score records table + edit history |
| `src/app/(authenticated)/admin/leaderboard/edit-score-dialog.tsx` | Client component: edit modal |
| `src/app/(authenticated)/leaderboard/page.tsx` | Add audit banner + expandable edit log |
| `src/app/(authenticated)/leaderboard/score-corrections-banner.tsx` | New component: info banner + expandable log |
| `supabase/migrations/00006_admin_score_edit.sql` | Schema changes above |

---

## 7. Implementation Order

1. **Migration** — DB changes (constraint, RLS policy, column, index)
2. **Constants + Validation** — `EDIT_SCORE_RECORD` action, `editScoreSchema`
3. **Server Action** — `editScoreRecord` in admin actions
4. **Admin Page** — `/admin/leaderboard` with table, filters, edit dialog, history
5. **Public Banner** — Score corrections banner on leaderboard page
6. **Testing** — Verify RLS (regular user can only see `EDIT_SCORE_RECORD` rows), edge cases
