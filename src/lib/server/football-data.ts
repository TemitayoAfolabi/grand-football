import { FIXTURE_STATUS, FOOTBALL_DATA_BASE_URL } from '@/lib/constants';
import type { ProviderFixture } from '@/lib/server/api-football';

interface FootballDataMatch {
  id: number;
  matchday: number;
  utcDate: string;
  status: string;
  minute?: number | null;
  score: {
    fullTime: { home: number | null; away: number | null };
  };
  homeTeam: { name: string; crest: string | null };
  awayTeam: { name: string; crest: string | null };
}

function mapFootballDataStatus(status: string): ProviderFixture['status'] {
  const statusMap: Record<string, ProviderFixture['status']> = {
    SCHEDULED: FIXTURE_STATUS.SCHEDULED,
    TIMED: FIXTURE_STATUS.TIMED,
    IN_PLAY: FIXTURE_STATUS.IN_PLAY,
    PAUSED: FIXTURE_STATUS.PAUSED,
    FINISHED: FIXTURE_STATUS.FINISHED,
    POSTPONED: FIXTURE_STATUS.POSTPONED,
    CANCELLED: FIXTURE_STATUS.CANCELLED,
    SUSPENDED: FIXTURE_STATUS.SUSPENDED,
  };

  return statusMap[status] ?? FIXTURE_STATUS.SCHEDULED;
}

export function mapFootballDataFixture(match: FootballDataMatch): ProviderFixture {
  const status = mapFootballDataStatus(match.status);
  const isLive = status === FIXTURE_STATUS.IN_PLAY || status === FIXTURE_STATUS.PAUSED;
  const isFinished = status === FIXTURE_STATUS.FINISHED;

  return {
    providerFixtureId: match.id,
    gameweek: match.matchday,
    kickoffTime: match.utcDate,
    status,
    homeTeam: match.homeTeam.name,
    awayTeam: match.awayTeam.name,
    homeTeamCrest: match.homeTeam.crest,
    awayTeamCrest: match.awayTeam.crest,
    homeScore: isFinished ? match.score.fullTime.home : isLive ? match.score.fullTime.home : null,
    awayScore: isFinished ? match.score.fullTime.away : isLive ? match.score.fullTime.away : null,
    liveHomeScore: isLive ? match.score.fullTime.home : null,
    liveAwayScore: isLive ? match.score.fullTime.away : null,
    matchMinute: isLive ? (match.minute ?? null) : null,
  };
}

/**
 * Uses football-data.org as a live-score fallback when the configured
 * API-Football plan cannot serve the current Premier League season.
 */
export async function fetchFootballDataFixtures({
  season,
  scope,
  date = new Date(),
}: {
  season: number;
  scope: 'season' | 'today';
  date?: Date;
}): Promise<ProviderFixture[]> {
  const apiKey = process.env.FOOTBALL_DATA_API_KEY?.replace(/(?:\\n)+$/g, '').trim();
  if (!apiKey) throw new Error('FOOTBALL_DATA_API_KEY not configured');

  const url = new URL(`${FOOTBALL_DATA_BASE_URL}/competitions/PL/matches`);
  url.searchParams.set('season', String(season));

  if (scope === 'today') {
    const day = date.toISOString().slice(0, 10);
    url.searchParams.set('dateFrom', day);
    url.searchParams.set('dateTo', day);
  }

  const response = await fetch(url, {
    headers: { 'X-Auth-Token': apiKey },
    cache: 'no-store',
  });
  if (!response.ok) {
    throw new Error(`football-data.org responded with ${response.status}`);
  }

  const payload = (await response.json()) as { matches?: FootballDataMatch[] };
  return (payload.matches ?? []).map(mapFootballDataFixture);
}
