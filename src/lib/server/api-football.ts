import { FIXTURE_STATUS } from '@/lib/constants';

export const API_FOOTBALL_PREMIER_LEAGUE_ID = 39;
const DEFAULT_API_FOOTBALL_BASE_URL = 'https://v3.football.api-sports.io';

export type ProviderFixtureStatus = (typeof FIXTURE_STATUS)[keyof typeof FIXTURE_STATUS];

export interface ProviderFixture {
  providerFixtureId: number;
  gameweek: number;
  kickoffTime: string;
  status: ProviderFixtureStatus;
  homeTeam: string;
  awayTeam: string;
  homeTeamCrest: string | null;
  awayTeamCrest: string | null;
  homeScore: number | null;
  awayScore: number | null;
  liveHomeScore: number | null;
  liveAwayScore: number | null;
  matchMinute: number | null;
}

interface ApiFootballFixture {
  fixture: {
    id: number;
    date: string;
    status: {
      short: string;
      elapsed: number | null;
    };
  };
  league: {
    round: string | null;
  };
  teams: {
    home: { name: string; logo: string | null };
    away: { name: string; logo: string | null };
  };
  goals: { home: number | null; away: number | null };
  score: {
    fulltime: { home: number | null; away: number | null };
  };
}

interface ApiFootballResponse {
  response?: ApiFootballFixture[];
  errors?: Record<string, string> | string[];
}

export type ApiFootballFixtureScope = 'season' | 'today';

export function mapApiFootballStatus(status: string): ProviderFixtureStatus {
  const statusMap: Record<string, ProviderFixtureStatus> = {
    TBD: FIXTURE_STATUS.SCHEDULED,
    NS: FIXTURE_STATUS.SCHEDULED,
    PST: FIXTURE_STATUS.POSTPONED,
    CANC: FIXTURE_STATUS.CANCELLED,
    ABD: FIXTURE_STATUS.SUSPENDED,
    SUSP: FIXTURE_STATUS.SUSPENDED,
    INT: FIXTURE_STATUS.SUSPENDED,
    '1H': FIXTURE_STATUS.IN_PLAY,
    HT: FIXTURE_STATUS.PAUSED,
    '2H': FIXTURE_STATUS.IN_PLAY,
    ET: FIXTURE_STATUS.IN_PLAY,
    BT: FIXTURE_STATUS.PAUSED,
    P: FIXTURE_STATUS.IN_PLAY,
    LIVE: FIXTURE_STATUS.IN_PLAY,
    FT: FIXTURE_STATUS.FINISHED,
    AET: FIXTURE_STATUS.FINISHED,
    PEN: FIXTURE_STATUS.FINISHED,
  };

  return statusMap[status] ?? FIXTURE_STATUS.SCHEDULED;
}

export function isLiveProviderFixture(fixture: ProviderFixture): boolean {
  return fixture.status === FIXTURE_STATUS.IN_PLAY || fixture.status === FIXTURE_STATUS.PAUSED;
}

export function getApiFootballGameweek(round: string | null): number | null {
  const match = round?.match(/(\d+)\s*$/);
  return match ? Number(match[1]) : null;
}

export function mapApiFootballFixture(fixture: ApiFootballFixture): ProviderFixture | null {
  const gameweek = getApiFootballGameweek(fixture.league.round);
  if (!gameweek) return null;

  const status = mapApiFootballStatus(fixture.fixture.status.short);
  const isLive = status === FIXTURE_STATUS.IN_PLAY || status === FIXTURE_STATUS.PAUSED;
  const isFinished = status === FIXTURE_STATUS.FINISHED;
  const homeScore = isFinished
    ? (fixture.score.fulltime.home ?? fixture.goals.home)
    : isLive
      ? fixture.goals.home
      : null;
  const awayScore = isFinished
    ? (fixture.score.fulltime.away ?? fixture.goals.away)
    : isLive
      ? fixture.goals.away
      : null;

  return {
    providerFixtureId: fixture.fixture.id,
    gameweek,
    kickoffTime: fixture.fixture.date,
    status,
    homeTeam: fixture.teams.home.name,
    awayTeam: fixture.teams.away.name,
    homeTeamCrest: fixture.teams.home.logo,
    awayTeamCrest: fixture.teams.away.logo,
    homeScore,
    awayScore,
    liveHomeScore: isLive ? fixture.goals.home : null,
    liveAwayScore: isLive ? fixture.goals.away : null,
    matchMinute: isLive ? fixture.fixture.status.elapsed : null,
  };
}

/**
 * Fetches Premier League fixtures from API-Football. Calls always happen on
 * the server, so the API key is never exposed to a browser.
 */
export async function fetchApiFootballFixtures({
  season,
  scope,
  date = new Date(),
}: {
  season: number;
  scope: ApiFootballFixtureScope;
  date?: Date;
}): Promise<ProviderFixture[]> {
  const apiKey = process.env.API_FOOTBALL_API_KEY;
  if (!apiKey) throw new Error('API_FOOTBALL_API_KEY not configured');

  const baseUrl = process.env.API_FOOTBALL_BASE_URL ?? DEFAULT_API_FOOTBALL_BASE_URL;
  const url = new URL(`${baseUrl}/fixtures`);
  url.searchParams.set('league', String(API_FOOTBALL_PREMIER_LEAGUE_ID));
  url.searchParams.set('season', String(season));

  if (scope === 'today') {
    url.searchParams.set('date', date.toISOString().slice(0, 10));
  }

  const response = await fetch(url, {
    headers: { 'x-apisports-key': apiKey },
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`API-Football responded with ${response.status}`);
  }

  const payload = (await response.json()) as ApiFootballResponse;
  if (payload.errors && Object.keys(payload.errors).length > 0) {
    throw new Error('API-Football returned an error response');
  }

  return (payload.response ?? [])
    .map(mapApiFootballFixture)
    .filter((fixture): fixture is ProviderFixture => fixture !== null);
}
