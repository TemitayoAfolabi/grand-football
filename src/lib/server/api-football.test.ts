import { describe, expect, it } from 'vitest';
import {
  getApiFootballGameweek,
  mapApiFootballFixture,
  mapApiFootballStatus,
} from './api-football';

describe('API-Football adapter', () => {
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
