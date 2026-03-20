/** Scoring point values */
export const SCORING = {
  EXACT_SCORE: 5,
  OUTCOME: 3,
  CORRECT_TEAM_GOALS: 1,
  WRONG: 0,
  STAR_EXACT: 10,
  STAR_OUTCOME: 3,
  STAR_CORRECT_TEAM_GOALS: 1,
  STAR_WRONG: 0,
  MONTHLY_BONUS: 10,
} as const;

/** Late submission penalty tiers */
export const LATE_PENALTY = {
  ON_TIME: 0,
  LATE_1H: -1,
  LATE_3H: -3,
  LATE_MAX: -5,
  /** Thresholds in milliseconds */
  THRESHOLD_1H: 60 * 60 * 1000,
  THRESHOLD_3H: 3 * 60 * 60 * 1000,
} as const;

/** Application constants */
export const APP_NAME = 'Grand Football';
export const MAX_USERS = 30;
export const TIMEZONE = 'Europe/London';

/** Fixture statuses */
export const FIXTURE_STATUS = {
  SCHEDULED: 'SCHEDULED',
  TIMED: 'TIMED',
  IN_PLAY: 'IN_PLAY',
  PAUSED: 'PAUSED',
  FINISHED: 'FINISHED',
  POSTPONED: 'POSTPONED',
  CANCELLED: 'CANCELLED',
  SUSPENDED: 'SUSPENDED',
} as const;

/** Star Man voting statuses */
export const STAR_MAN_STATUS = {
  DRAFT: 'DRAFT',
  OPEN: 'OPEN',
  CLOSED: 'CLOSED',
} as const;

/** Hours before season start that Star Man voting closes */
export const STAR_MAN_DEADLINE_HOURS = 2;

/** Admin action types */
export const ADMIN_ACTIONS = {
  TOGGLE_STAR: 'TOGGLE_STAR',
  OVERRIDE_RESULT: 'OVERRIDE_RESULT',
  RECALCULATE: 'RECALCULATE',
  ADD_USER: 'ADD_USER',
  REMOVE_USER: 'REMOVE_USER',
  CREATE_USER: 'CREATE_USER',
  RESET_USER_PASSWORD: 'RESET_USER_PASSWORD',
  RESEND_INVITE: 'RESEND_INVITE',
  NEW_SEASON: 'NEW_SEASON',
  CREATE_STAR_MAN_SESSION: 'CREATE_STAR_MAN_SESSION',
  ADD_STAR_MAN_NOMINEE: 'ADD_STAR_MAN_NOMINEE',
  REMOVE_STAR_MAN_NOMINEE: 'REMOVE_STAR_MAN_NOMINEE',
  OPEN_STAR_MAN_VOTING: 'OPEN_STAR_MAN_VOTING',
  CLOSE_STAR_MAN_VOTING: 'CLOSE_STAR_MAN_VOTING',
  EDIT_SCORE_RECORD: 'EDIT_SCORE_RECORD',
  MOVE_FIXTURE_GAMEWEEK: 'MOVE_FIXTURE_GAMEWEEK',
  SET_FIXTURE_STATUS: 'SET_FIXTURE_STATUS',
} as const;

/** Navigation items */
export const NAV_ITEMS = [
  { href: '/', label: 'Dashboard', icon: 'Home' },
  { href: '/fixtures', label: 'Fixtures', icon: 'Calendar' },
  { href: '/leaderboard', label: 'Leaderboard', icon: 'Trophy' },
  { href: '/settings', label: 'Settings', icon: 'Settings' },
] as const;

/** Sync interval constants (milliseconds) */
export const LIVE_SYNC_INTERVAL_MS = 60_000;
export const MATCH_DAY_SYNC_INTERVAL_MS = 30 * 60_000;
export const FULL_SYNC_INTERVAL_MS = 6 * 60 * 60_000;
export const CLIENT_POLL_FALLBACK_MS = 30_000;

/** Football-data.org API base URL */
export const FOOTBALL_DATA_BASE_URL =
  'https://api.football-data.org/v4';
