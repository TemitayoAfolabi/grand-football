# Grand Football — Edge Cases

> **Document Owner:** Strategy & Design Agent
> **Last Updated:** 2026-02-27
> **Status:** Final (MVP)

---

## 1. Match Postponed

**Scenario:** A Premier League match is postponed before or during play (e.g., weather, safety, scheduling conflict).

### Detection
- The external API (football-data.org) updates the fixture status to `POSTPONED`.
- The regular 6-hour cron sync picks up the status change.

### Handling

| Aspect | Rule |
|--------|------|
| **Fixture display** | Fixture shows status "Postponed" with a canceled-style visual treatment. |
| **Existing predictions** | Preserved. Predictions already submitted remain in the database, linked to the original fixture record. |
| **Scoring** | No scoring occurs. The scoring engine skips fixtures with status ≠ `FINISHED`. |
| **Monthly bonus** | Postponed fixtures are **excluded** from the monthly fixture count. If a user predicted 19 of 20 fixtures, and the 20th was postponed, they need 19/19 to earn the bonus. |
| **Rescheduled match** | When the API provides a new date, the fixture record is updated (new `kickoff_time`). Existing predictions are carried forward — users can edit them again before the new kickoff. |
| **Star Game** | If a postponed fixture was a Star Game, it retains Star Game status when rescheduled. The admin can change this before the new kickoff. |

### User Communication
- Dashboard shows: "ARS vs CHE — Postponed. New date TBC."
- If rescheduled: "ARS vs CHE — Rescheduled to [new date]. Your prediction is carried over — you can edit it before kickoff."

---

## 2. Match Cancelled

**Scenario:** A match is permanently cancelled (not rescheduled). This is rare in the Premier League but possible.

### Detection
- API status changes to `CANCELLED`.

### Handling

| Aspect | Rule |
|--------|------|
| **Fixture display** | Shows "Cancelled" with a strikethrough or muted visual treatment. |
| **Existing predictions** | Retained for record-keeping but marked as void. |
| **Scoring** | No scoring occurs. `reason_code = VOID` (no points, doesn't count for or against). |
| **Monthly bonus** | Cancelled fixtures are **excluded** from the monthly count (same as postponed). |
| **Leaderboard** | No impact. It's as if the fixture never existed for scoring purposes. |

---

## 3. Match Rescheduled to a Different Gameweek

**Scenario:** A match originally in Gameweek 20 is moved to Gameweek 25 (e.g., due to cup commitments).

### Handling

| Aspect | Rule |
|--------|------|
| **Fixture record** | The fixture's `gameweek` and `kickoff_time` are updated by the API sync. Single fixture record; no duplication. |
| **Predictions** | Existing predictions carry over. If the user predicted when it was GW 20, the prediction is still valid for the rescheduled GW 25 date. The user can edit it before the new kickoff. |
| **Display** | The fixture appears under its new gameweek. An annotation: "Rescheduled from GW 20" helps users understand why. |
| **Monthly bonus** | The fixture counts toward the **month in which it is actually played** (based on new `kickoff_time`), not the original month. |
| **Scoring** | Standard scoring applies when the match is played. |

### Edge Case within Edge Case
- If a user submitted a prediction in January (original date) and the match moves to March, the prediction exists for 2+ months. The user might forget they already predicted. The fixture card should show "Predicted: 2-1 (edit before kickoff)" clearly.

---

## 4. Double Gameweek

**Scenario:** A team plays twice in the same gameweek (common when rescheduled matches are inserted).

### Handling

| Aspect | Rule |
|--------|------|
| **Fixture display** | Both fixtures appear normally under the same gameweek. Each is a separate fixture with its own prediction. |
| **Predictions** | Users predict each fixture independently. The "Predict All" bulk feature lists all fixtures in the gameweek. |
| **Scoring** | Each fixture scored independently. A user can earn points from both. |
| **Leaderboard** | Double gameweek points are simply additive — no special weighting. |
| **Monthly bonus** | Both fixtures count toward the monthly total. If a user misses one of the two, the bonus is at risk. |
| **Star Game** | Either, both, or neither of the double-gameweek fixtures can be Star Games (admin choice). |

### User Communication
- Fixture list shows a subtle "DGW" (Double Gameweek) badge next to teams playing twice.
- Dashboard "Upcoming" section may show more fixtures than usual for that gameweek.

---

## 5. External API Returns Wrong Data

**Scenario:** The football-data.org API reports an incorrect score or incorrect fixture details.

### Detection Options
- Admin notices the discrepancy (most likely for 30-user league).
- Users report incorrect points (transparency via Match Detail screen makes this easy to spot).

### Handling

| Aspect | Rule |
|--------|------|
| **Prevention** | The `manually_overridden` flag on a fixture prevents API data from overwriting admin corrections. |
| **Correction** | Admin uses the Override Result feature (US-7.3) to set the correct score. |
| **Recalculation** | After override, the scoring engine auto-recalculates all score_records for that fixture. |
| **Audit trail** | Override logged: "Fixture #123 overridden by admin. Old: 2-1, New: 3-1, at [timestamp]". |
| **Leaderboard** | Automatically updated after recalculation. |
| **Notification** | No automatic notification in MVP. Admin can communicate via the league group chat (external). Phase 2: in-app notifications for score corrections. |

### Prevention Strategy
- The 6-hour sync interval means data is not blindly consumed in real-time. If an API reports wrong live data, the next sync may self-correct once the match is fully finalized.
- Scoring engine only runs on `status = FINISHED`, giving the API time to finalize.

---

## 6. User Joins Mid-Season

**Scenario:** A new user is added to the allowlist after the season has already started.

### Handling

| Aspect | Rule |
|--------|------|
| **Access** | Admin adds their email to the allowlist. User can sign in immediately. |
| **Past fixtures** | The user has no predictions for past fixtures. Score records show `reason_code = NO_PREDICTION` for all past finished fixtures. |
| **Leaderboard** | The user starts with 0 points and appears at the bottom of the leaderboard. Past missed fixtures are not retroactively penalized beyond 0 points (which is the same as wrong predictions). |
| **Monthly bonus** | The user cannot earn the monthly bonus for any month where fixtures occurred before their join date (they couldn't have predicted those fixtures). Starting from their first full month, they can earn bonuses. |
| **Tie-breaking** | The user's "fewest 0-point matches" count will be high (all unpredicted matches count as 0-point matches), which naturally places them lower in tie-break scenarios. |

### Admin Discretion
- The admin may choose to only invite new users between seasons for fairness. This is a social decision, not enforced by the system.
- No "handicap" system in MVP.

---

## 7. API Rate Limiting or Downtime

**Scenario:** The football-data.org API is rate-limited, unreachable, or returns errors during sync.

### Handling

| Aspect | Rule |
|--------|------|
| **Sync failure** | The cron job logs the error with details (HTTP status, response body, timestamp). |
| **Retry** | No immediate retry in the same job execution. The next scheduled run (6 hours later) retries automatically. |
| **Stale data** | If fixtures cannot be updated, the existing data in the database remains unchanged. Users see slightly stale fixture info but can still submit predictions for fixtures already in the DB. |
| **Admin alert** | If 3 consecutive sync failures occur, an alert is logged. Phase 2: email notification to admin. |
| **User impact** | Minimal for 30 users. Fixtures only change when matches are rescheduled or results come in. A 6-12 hour delay is acceptable. |
| **Scoring delay** | If the API is down after a match finishes, scoring is delayed until the next successful sync that retrieves the final score. The leaderboard will show "Points pending" for those matches. |

---

## 8. Simultaneous Prediction Edits

**Scenario:** A user opens the prediction form on two devices and submits different predictions from each.

### Handling

- **Last write wins.** The second save overwrites the first.
- Both submissions are recorded in the prediction history (audit trail).
- The `submitted_at` timestamp reflects the most recent save.
- No conflict resolution UI needed for MVP (single-user predictions — users are only competing with themselves on timing).

---

## 9. Kickoff Time Changes

**Scenario:** A match's kickoff time is moved (e.g., due to TV scheduling, VAR delays in prior match, weather delay).

### Handling

| Original Time | New Time | Impact |
|---------------|----------|--------|
| Moved **later** | Same day, later kickoff | Lock time extends. Users who haven't predicted get more time. Users who already predicted can still edit. |
| Moved **earlier** | Same day, earlier kickoff | Lock time moves up. Users may lose prediction time. If they predicted before the change, their prediction stands. If they haven't predicted and kickoff passes, they've missed it. |
| Moved to **different day** | Future date | Treated like a reschedule (see Section 3). |

### Mitigation
- The 6-hour cron sync updates kickoff times. For same-day changes, this may not be fast enough.
- Phase 2: Increase sync frequency to every 1 hour on match days (Vercel Cron supports this on pro plan).
- MVP: Accept that same-day kickoff changes may not be reflected instantly. Admin can manually update a fixture's kickoff time if needed.

---

## 10. Score Input Edge Cases

### Very High Scores
- The system accepts 0–99 for each team's predicted goals.
- While a score like "15-12" is implausible, the system does not enforce plausibility in MVP.
- This prevents disputes about what score is "too high."

### Score = 0-0
- Valid prediction. If the match ends 0-0 and user predicted 0-0, it's an Exact Score (5 points, or 10 for Star Game).
- BTTS Reverse cannot apply when actual score is 0-0 (since actual_home and actual_away are both 0).

### Identical Prediction and Actual with Draw
- User predicts 1-1, actual is 1-1 → Exact Score (5 points).
- User predicts 2-2, actual is 1-1 → Correct Outcome (Draw = Draw → 3 points).

---

## 11. Scoring Engine Idempotency

**Scenario:** The scoring engine runs twice for the same fixture (e.g., cron overlap, manual recalculation).

### Handling

- The scoring engine **upserts** score_records keyed on `(user_id, fixture_id)`.
- Running the engine twice produces identical results.
- The `calculated_at` timestamp is updated on re-run, but `points_awarded` and `reason_code` remain the same (assuming no data change).
- If fixture data changed between runs (e.g., override), the new calculation takes precedence.

---

## 12. Season Transition

**Scenario:** The Premier League season ends and a new season begins.

### Handling

| Aspect | Rule |
|--------|------|
| **Trigger** | Admin clicks "Start New Season" (see US-7.5). |
| **Data archival** | Current season's data (fixtures, predictions, scores, leaderboards) is retained under a `season_id`. Nothing is deleted. |
| **Leaderboard reset** | The leaderboard resets to 0 for all users for the new season. |
| **Historical access** | Users can view past season leaderboards by selecting a season from a dropdown (Phase 2). MVP: past data is in the DB but not exposed in UI. |
| **Fixtures** | New season fixtures begin syncing from the API. Old fixtures retain their season_id. |
| **User accounts** | All user accounts carry over. No re-registration needed. |

---

## 13. Timezone Handling

**Scenario:** Users are in different timezones (likely, even among 30 UK-based users — some may travel).

### Handling

- All times stored in the database as **UTC**.
- The frontend converts to the user's local timezone using the browser's `Intl.DateTimeFormat` or a library like `date-fns-tz`.
- Kickoff countdown ("Locks in X minutes") is computed client-side from UTC kickoff time.
- The server ignores the client's timezone entirely — lock enforcement is UTC-based.

---

## 14. Browser / Device Compatibility

**Scenario:** A user tries to access the app on an unsupported browser.

### Handling

- Target: Latest 2 versions of Chrome, Safari, Firefox, Edge.
- PWA features require service worker support (all modern browsers).
- If JavaScript is disabled: the SSR'd Next.js page shows content but forms won't function. A `<noscript>` message: "JavaScript is required for Grand Football."
- iOS Safari quirks: test number input behavior, viewport scaling, and PWA "Add to Home Screen."

---

## 15. Data Integrity Edge Cases

### Duplicate Fixture from API
- The API may return the same fixture under different IDs (e.g., after reschedule).
- The sync logic deduplicates by `api_fixture_id`. If a new ID appears for the same match (home_team + away_team + season), admin intervention may be needed.

### Prediction Without a Fixture
- The database enforces a foreign key from predictions to fixtures. It's impossible to create a prediction for a non-existent fixture.

### Fixture Deleted from API
- If a fixture disappears from the API response, the sync does NOT delete it from the local DB. Fixtures are only soft-deleted via status change (`CANCELLED`).

---

## Edge Case Summary Matrix

| Edge Case | Detection | Auto-Handled? | Admin Action Needed? |
|-----------|-----------|---------------|---------------------|
| Match postponed | API status change | ✅ | Optional: update comms |
| Match cancelled | API status change | ✅ | Optional: confirm |
| Rescheduled GW | API data update | ✅ | No |
| Double gameweek | API fixture data | ✅ | Optional: Star Games |
| Wrong API data | User/admin report | ❌ | Required: Override |
| User joins mid-season | Admin adds to list | ✅ | Required: add email |
| API downtime | Sync failure logs | ✅ (retries) | Monitor logs |
| Kickoff time change | API data update | Partial (6hr delay) | Optional: manual update |
| Season transition | Manual trigger | ❌ | Required: Start New Season |
| Scoring idempotency | System design | ✅ | No |
