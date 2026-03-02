# Grand Football — API Contracts

> **Document Owner:** Architecture & Security Agent
> **Last Updated:** 2026-02-27
> **Status:** Final (MVP)

---

## 1. General Conventions

### 1.1 Base URL

```
Production: https://grand-football.vercel.app/api
Local:      http://localhost:3000/api
```

### 1.2 Authentication

All endpoints (except `/auth/*` and `/api/cron/*`) require a valid Supabase session. The session token is sent as an `httpOnly` cookie managed by `@supabase/ssr`.

```
Cookie: sb-<project-ref>-auth-token=<JWT>
```

### 1.3 Error Response Format

All errors follow a consistent structure:

```typescript
interface ApiError {
  error: {
    code: string;        // Machine-readable (e.g., "PREDICTION_LOCKED")
    message: string;     // Human-readable
    details?: unknown;   // Optional additional context
  };
}
```

### 1.4 Standard HTTP Status Codes

| Code | Meaning | Usage |
|------|---------|-------|
| `200` | OK | Successful GET, PATCH |
| `201` | Created | Successful POST (new resource) |
| `400` | Bad Request | Validation errors |
| `401` | Unauthorized | Missing or invalid session |
| `403` | Forbidden | Insufficient permissions (non-admin, locked prediction) |
| `404` | Not Found | Resource does not exist |
| `409` | Conflict | Duplicate resource (e.g., duplicate allowlist email) |
| `429` | Too Many Requests | Rate limit exceeded |
| `500` | Internal Server Error | Unexpected server error |

### 1.5 Common TypeScript Types

```typescript
// Shared types used across endpoints

type UUID = string;

interface Timestamp {
  /** ISO 8601 UTC timestamp */
  value: string; // e.g., "2026-03-07T15:00:00Z"
}

type FixtureStatus =
  | 'SCHEDULED'
  | 'TIMED'
  | 'IN_PLAY'
  | 'PAUSED'
  | 'FINISHED'
  | 'POSTPONED'
  | 'CANCELLED'
  | 'SUSPENDED';

type ReasonCode =
  | 'EXACT_SCORE'
  | 'OUTCOME'
  | 'BTTS_REVERSE'
  | 'WRONG'
  | 'STAR_EXACT'
  | 'STAR_OUTCOME'
  | 'STAR_BTTS_REVERSE'
  | 'STAR_WRONG'
  | 'NO_PREDICTION';

interface Profile {
  id: UUID;
  displayName: string;
  isAdmin: boolean;
  avatarUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

interface Season {
  id: UUID;
  name: string;
  isActive: boolean;
  startDate: string | null;
  endDate: string | null;
  createdAt: string;
}

interface Fixture {
  id: UUID;
  seasonId: UUID;
  apiFixtureId: number;
  homeTeam: string;
  awayTeam: string;
  homeTeamCrest: string | null;
  awayTeamCrest: string | null;
  kickoffTime: string;
  status: FixtureStatus;
  homeScore: number | null;
  awayScore: number | null;
  gameweek: number;
  isStarGame: boolean;
  manuallyOverridden: boolean;
  createdAt: string;
  updatedAt: string;
}

interface Prediction {
  id: UUID;
  userId: UUID;
  fixtureId: UUID;
  homeScore: number;
  awayScore: number;
  submittedAt: string;
  updatedAt: string;
}

interface ScoreRecord {
  id: UUID;
  userId: UUID;
  fixtureId: UUID;
  predictedHome: number | null;
  predictedAway: number | null;
  actualHome: number;
  actualAway: number;
  isStarGame: boolean;
  pointsAwarded: number;
  reasonCode: ReasonCode;
  calculatedAt: string;
}

interface MonthlyBonus {
  id: UUID;
  userId: UUID;
  seasonId: UUID;
  month: string;
  eligible: boolean;
  bonusPoints: number;
  fixturesTotal: number;
  predictionsTotal: number;
  calculatedAt: string;
}

interface AllowlistEntry {
  id: UUID;
  email: string;
  addedBy: UUID;
  createdAt: string;
}

interface AuditLogEntry {
  id: UUID;
  adminId: UUID;
  action: string;
  targetType: string;
  targetId: UUID | null;
  oldValue: unknown;
  newValue: unknown;
  createdAt: string;
}
```

---

## 2. User Endpoints

### 2.1 `GET /api/dashboard`

Returns aggregate data for the authenticated user's dashboard.

**Auth:** Required (user)

**Response `200`:**

```typescript
interface DashboardResponse {
  rank: number;
  totalPoints: number;
  positionChange: number; // +2 means improved by 2 places
  upcomingFixtures: Array<{
    fixture: Fixture;
    prediction: Prediction | null;
    isLocked: boolean;
    lockCountdownMinutes: number | null;
  }>;
  recentResults: Array<{
    fixture: Fixture;
    prediction: Prediction | null;
    scoreRecord: ScoreRecord | null;
  }>;
  bonusStatus: {
    month: string; // "2026-03"
    predicted: number;
    total: number;
    onTrack: boolean;
    bonusAwarded: boolean | null; // null if month not ended
  };
}
```

---

### 2.2 `GET /api/fixtures`

Returns fixtures filtered by gameweek and/or season.

**Auth:** Required (user)

**Query Parameters:**

| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `gameweek` | `number` | No | Current/next GW | Gameweek number |
| `season_id` | `UUID` | No | Active season | Season ID |
| `status` | `FixtureStatus` | No | All | Filter by status |

**Response `200`:**

```typescript
interface FixturesResponse {
  fixtures: Array<{
    fixture: Fixture;
    prediction: Prediction | null;
    scoreRecord: ScoreRecord | null;
    isLocked: boolean;
  }>;
  currentGameweek: number;
  totalGameweeks: number;
}
```

---

### 2.3 `GET /api/fixtures/[fixtureId]`

Returns a single fixture with the user's prediction and score record.

**Auth:** Required (user)

**Path Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `fixtureId` | `UUID` | Fixture ID |

**Response `200`:**

```typescript
interface FixtureDetailResponse {
  fixture: Fixture;
  prediction: Prediction | null;
  scoreRecord: ScoreRecord | null;
  isLocked: boolean;
}
```

**Response `404`:**

```json
{
  "error": {
    "code": "FIXTURE_NOT_FOUND",
    "message": "Fixture not found."
  }
}
```

---

### 2.4 `POST /api/predictions`

Submit or update a score prediction.

**Auth:** Required (user)

**Request Body:**

```typescript
interface CreatePredictionRequest {
  fixtureId: UUID;
  homeScore: number; // integer, 0–99
  awayScore: number; // integer, 0–99
}
```

**Validation Rules:**
- `fixtureId`: must exist, must reference a valid fixture
- `homeScore`: integer, 0 ≤ x ≤ 99
- `awayScore`: integer, 0 ≤ x ≤ 99
- Fixture `kickoff_time` must be in the future (server clock)

**Response `200` (updated existing):**

```typescript
interface PredictionResponse {
  prediction: Prediction;
  isNew: boolean;
}
```

**Response `201` (new prediction):**

Same as 200 with `isNew: true`.

**Error Responses:**

```json
// 400 — Validation error
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid prediction data.",
    "details": {
      "homeScore": "Must be an integer between 0 and 99.",
      "awayScore": "Required."
    }
  }
}

// 403 — Prediction locked
{
  "error": {
    "code": "PREDICTION_LOCKED",
    "message": "Predictions are locked — match has kicked off."
  }
}

// 404 — Fixture not found
{
  "error": {
    "code": "FIXTURE_NOT_FOUND",
    "message": "Fixture not found."
  }
}
```

---

### 2.5 `GET /api/predictions/[fixtureId]`

Get the authenticated user's prediction for a specific fixture.

**Auth:** Required (user)

**Response `200`:**

```typescript
interface GetPredictionResponse {
  prediction: Prediction | null;
}
```

---

### 2.6 `GET /api/leaderboard/season`

Returns the season leaderboard with tie-breaking applied.

**Auth:** Required (user)

**Query Parameters:**

| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `season_id` | `UUID` | No | Active season | Season ID |

**Response `200`:**

```typescript
interface SeasonLeaderboardResponse {
  season: Season;
  leaderboard: Array<{
    rank: number;
    userId: UUID;
    displayName: string;
    avatarUrl: string | null;
    totalPoints: number;
    exactScoreCount: number;
    correctOutcomeCount: number;
    zeroPointCount: number;
    isCurrentUser: boolean;
  }>;
}
```

---

### 2.7 `GET /api/leaderboard/monthly`

Returns the monthly leaderboard including bonus information.

**Auth:** Required (user)

**Query Parameters:**

| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `month` | `string` | No | Current month | Format: `YYYY-MM` |
| `season_id` | `UUID` | No | Active season | Season ID |

**Response `200`:**

```typescript
interface MonthlyLeaderboardResponse {
  month: string;
  season: Season;
  leaderboard: Array<{
    rank: number;
    userId: UUID;
    displayName: string;
    avatarUrl: string | null;
    monthlyPoints: number;
    bonusPoints: number;
    totalMonthlyPoints: number; // monthlyPoints + bonusPoints
    exactScoreCount: number;
    correctOutcomeCount: number;
    bonusEligible: boolean | null; // null if month not ended
    fixturesMissed: number;
    isCurrentUser: boolean;
  }>;
}
```

---

### 2.8 `GET /api/bonus/status`

Returns the current user's bonus tracker for a given month.

**Auth:** Required (user)

**Query Parameters:**

| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `month` | `string` | No | Current month | Format: `YYYY-MM` |

**Response `200`:**

```typescript
interface BonusStatusResponse {
  month: string;
  predicted: number;
  total: number;
  onTrack: boolean;
  bonusAwarded: boolean | null; // null if not yet calculated
  missedFixtures: Array<{
    fixtureId: UUID;
    homeTeam: string;
    awayTeam: string;
    kickoffTime: string;
  }>;
}
```

---

### 2.9 `PATCH /api/profile`

Update the authenticated user's display name.

**Auth:** Required (user)

**Request Body:**

```typescript
interface UpdateProfileRequest {
  displayName: string; // 3–20 characters, alphanumeric + spaces
}
```

**Validation Rules:**
- `displayName`: 3–20 characters, matches `/^[a-zA-Z0-9 ]{3,20}$/`, trimmed

**Response `200`:**

```typescript
interface ProfileResponse {
  profile: Profile;
}
```

**Error Response `400`:**

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Display name must be 3–20 characters (letters, numbers, spaces)."
  }
}
```

---

## 3. Admin Endpoints

All admin endpoints require `is_admin = true` on the user's profile. Non-admin users receive `403 Forbidden`.

### 3.1 `GET /api/admin/allowlist`

List all allowed emails.

**Auth:** Required (admin)

**Response `200`:**

```typescript
interface AllowlistResponse {
  entries: AllowlistEntry[];
  count: number;
}
```

---

### 3.2 `POST /api/admin/allowlist`

Add an email to the allowlist.

**Auth:** Required (admin)

**Request Body:**

```typescript
interface AddAllowlistRequest {
  email: string; // valid email format
}
```

**Response `201`:**

```typescript
interface AddAllowlistResponse {
  entry: AllowlistEntry;
}
```

**Error Responses:**

```json
// 400 — Invalid email
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid email format."
  }
}

// 409 — Already exists
{
  "error": {
    "code": "DUPLICATE_EMAIL",
    "message": "This email is already on the allowlist."
  }
}
```

---

### 3.3 `DELETE /api/admin/allowlist`

Remove an email from the allowlist.

**Auth:** Required (admin)

**Request Body:**

```typescript
interface RemoveAllowlistRequest {
  email: string;
}
```

**Response `200`:**

```typescript
interface RemoveAllowlistResponse {
  success: true;
  email: string;
}
```

---

### 3.4 `PATCH /api/admin/fixtures/[fixtureId]/star`

Toggle Star Game designation.

**Auth:** Required (admin)

**Request Body:**

```typescript
interface ToggleStarRequest {
  isStarGame: boolean;
}
```

**Validation:**
- Fixture must exist
- Fixture `kickoff_time` must be in the future (cannot change after kickoff)

**Response `200`:**

```typescript
interface ToggleStarResponse {
  fixture: Fixture;
}
```

**Error Response `400`:**

```json
{
  "error": {
    "code": "FIXTURE_STARTED",
    "message": "Cannot change Star Game status after kickoff."
  }
}
```

---

### 3.5 `PATCH /api/admin/fixtures/[fixtureId]/override`

Override a fixture's final result.

**Auth:** Required (admin)

**Request Body:**

```typescript
interface OverrideResultRequest {
  homeScore: number; // integer, 0–99
  awayScore: number; // integer, 0–99
}
```

**Response `200`:**

```typescript
interface OverrideResultResponse {
  fixture: Fixture;
  recalculated: number; // number of score_records updated
}
```

---

### 3.6 `POST /api/admin/scoring/recalculate`

Trigger recalculation for one or all fixtures.

**Auth:** Required (admin)

**Request Body:**

```typescript
interface RecalculateRequest {
  fixtureId?: UUID; // omit to recalculate all FINISHED fixtures
}
```

**Response `200`:**

```typescript
interface RecalculateResponse {
  fixturesProcessed: number;
  recordsUpdated: number;
}
```

---

### 3.7 `POST /api/admin/season`

Start a new season, archiving the current one.

**Auth:** Required (admin)

**Request Body:**

```typescript
interface NewSeasonRequest {
  name: string; // e.g., "2026-2027"
}
```

**Validation:**
- `name` must be unique
- Current season must exist to be archived

**Response `201`:**

```typescript
interface NewSeasonResponse {
  season: Season;
  archivedSeason: Season; // previous season with is_active = false
}
```

---

### 3.8 `GET /api/admin/audit-log`

View the admin audit trail.

**Auth:** Required (admin)

**Query Parameters:**

| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `page` | `number` | No | `1` | Page number |
| `limit` | `number` | No | `50` | Items per page (max 100) |
| `action` | `string` | No | All | Filter by action type |

**Response `200`:**

```typescript
interface AuditLogResponse {
  entries: AuditLogEntry[];
  total: number;
  page: number;
  totalPages: number;
}
```

---

## 4. Cron Endpoints

Protected by `CRON_SECRET` header. Not accessible via browser.

### 4.1 `POST /api/cron/sync-fixtures`

Fetch fixtures from football-data.org and upsert into database.

**Auth:** `Authorization: Bearer ${CRON_SECRET}`

**Response `200`:**

```typescript
interface SyncFixturesResponse {
  synced: number;
  created: number;
  updated: number;
  skippedOverridden: number;
  newlyFinished: UUID[]; // fixture IDs that just changed to FINISHED
  scored: number; // score_records created for newly finished
  errors: string[];
}
```

---

### 4.2 `POST /api/cron/calculate-scores`

Score all FINISHED fixtures that haven't been scored yet.

**Auth:** `Authorization: Bearer ${CRON_SECRET}`

**Response `200`:**

```typescript
interface CalculateScoresResponse {
  fixturesProcessed: number;
  recordsCreated: number;
  errors: string[];
}
```

---

### 4.3 `POST /api/cron/monthly-bonus`

Calculate monthly bonuses for the previous month.

**Auth:** `Authorization: Bearer ${CRON_SECRET}`

**Response `200`:**

```typescript
interface MonthlyBonusResponse {
  month: string;
  usersProcessed: number;
  bonusesAwarded: number;
  results: Array<{
    userId: UUID;
    eligible: boolean;
    predicted: number;
    total: number;
  }>;
}
```

---

## 5. Rate Limiting Strategy

| Endpoint Group | Limit | Window | Strategy |
|----------------|-------|--------|----------|
| **Auth (magic link send)** | 3 requests | per minute per email | Supabase built-in |
| **Read endpoints** (GET) | 60 requests | per minute per user | Vercel Edge headers |
| **Write endpoints** (POST/PATCH/DELETE) | 20 requests | per minute per user | Vercel Edge headers |
| **Admin endpoints** | 30 requests | per minute per admin | Vercel Edge headers |
| **Cron endpoints** | 1 request | per 5 minutes per IP | CRON_SECRET + timing |

Rate limit headers returned on every response:

```
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 58
X-RateLimit-Reset: 1709827200
```

When rate limited:

```json
// 429 Too Many Requests
{
  "error": {
    "code": "RATE_LIMITED",
    "message": "Too many requests. Please try again in 30 seconds.",
    "details": {
      "retryAfter": 30
    }
  }
}
```

---

## 6. Pagination Convention

Endpoints that return lists use cursor-based or offset pagination:

```typescript
interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  totalPages: number;
  hasMore: boolean;
}
```

For MVP with 30 users and ~380 fixtures, pagination is only needed on the audit log. All other lists fit in a single response.
