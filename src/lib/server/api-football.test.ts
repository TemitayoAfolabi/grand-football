import { describe, expect, it, vi } from 'vitest';
import {
  fetchApiFootballFixtures,
  getApiFootballGameweek,
  mapApiFootballFixture,
  mapApiFootballStatus,
} from './api-football';

describe('API-Football adapter', () => {
  it('uses the unrestricted date feed for live fixtures and filters to the Premier League', async () => {
    let requestUrl = '';
    const fetchMock = vi.fn((input: string | URL) => {
      requestUrl = input instanceof URL ? input.toString() : input;
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            response: [
              {
                fixture: {
                  id: 999,
                  date: '2026-08-21T19:00:00+00:00',
                  status: { short: 'FT', elapsed: 90 },
                },
                league: { id: 39, round: 'Regular Season - 1' },
                teams: {
                  home: { name: 'Arsenal', logo: null },
                  away: { name: 'Coventry', logo: null },
                },
                goals: { home: 3, away: 0 },
                score: { fulltime: { home: 3, away: 0 } },
              },
              {
                fixture: {
                  id: 998,
                  date: '2026-08-21T19:00:00+00:00',
                  status: { short: 'FT', elapsed: 90 },
                },
                league: { id: 140, round: 'Regular Season - 1' },
                teams: {
                  home: { name: 'Real Madrid', logo: null },
                  away: { name: 'Barcelona', logo: null },
                },
                goals: { home: 1, away: 1 },
                score: { fulltime: { home: 1, away: 1 } },
              },
            ],
          }),
      } as Response);
    });

    const oldApiKey = process.env.API_FOOTBALL_API_KEY;
    process.env.API_FOOTBALL_API_KEY = 'test-key';
    vi.stubGlobal('fetch', fetchMock);

    try {
      const fixtures = await fetchApiFootballFixtures({
        season: 2026,
        scope: 'today',
        date: new Date('2026-08-21T12:00:00Z'),
      });
      expect(requestUrl).toBeDefined();
      const requestedUrl = new URL(requestUrl);

      expect(requestedUrl.searchParams.get('date')).toBe('2026-08-21');
      expect(requestedUrl.searchParams.has('league')).toBe(false);
      expect(requestedUrl.searchParams.has('season')).toBe(false);
      expect(fixtures).toMatchObject([
        {
          providerFixtureId: 999,
          gameweek: 1,
          status: 'FINISHED',
          homeScore: 3,
          awayScore: 0,
        },
      ]);
    } finally {
      vi.unstubAllGlobals();
      if (oldApiKey === undefined) delete process.env.API_FOOTBALL_API_KEY;
      else process.env.API_FOOTBALL_API_KEY = oldApiKey;
    }
  });

  it('maps in-play scores and the half-time status', () => {
    const fixture = mapApiFootballFixture({
      fixture: {
        id: 123,
        date: '2026-08-22T14:00:00+00:00',
        status: { short: 'HT', elapsed: 45 },
      },
      league: { id: 39, round: 'Regular Season - 2' },
      teams: {
        home: { name: 'Arsenal', logo: 'https://example.com/arsenal.png' },
        away: { name: 'Chelsea', logo: 'https://example.com/chelsea.png' },
      },
      goals: { home: 1, away: 0 },
      score: { fulltime: { home: null, away: null } },
    });

    expect(fixture).toMatchObject({
      providerFixtureId: 123,
      gameweek: 2,
      status: 'PAUSED',
      homeScore: 1,
      awayScore: 0,
      liveHomeScore: 1,
      liveAwayScore: 0,
      matchMinute: 45,
    });
  });

  it('uses the final result only after full time', () => {
    const fixture = mapApiFootballFixture({
      fixture: {
        id: 124,
        date: '2026-08-22T14:00:00+00:00',
        status: { short: 'FT', elapsed: 90 },
      },
      league: { id: 39, round: 'Regular Season - 2' },
      teams: {
        home: { name: 'Arsenal', logo: null },
        away: { name: 'Chelsea', logo: null },
      },
      goals: { home: 2, away: 1 },
      score: { fulltime: { home: 2, away: 1 } },
    });

    expect(fixture).toMatchObject({
      status: 'FINISHED',
      homeScore: 2,
      awayScore: 1,
      liveHomeScore: null,
      liveAwayScore: null,
    });
  });

  it('maps provider status and gameweek values safely', () => {
    expect(mapApiFootballStatus('1H')).toBe('IN_PLAY');
    expect(mapApiFootballStatus('PST')).toBe('POSTPONED');
    expect(getApiFootballGameweek('Regular Season - 38')).toBe(38);
    expect(getApiFootballGameweek(null)).toBeNull();
  });
});
