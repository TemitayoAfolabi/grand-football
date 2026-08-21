import { describe, expect, it } from 'vitest';
import { mapFootballDataFixture } from './football-data';

describe('football-data.org fallback adapter', () => {
  it('maps an in-play fixture to live scores', () => {
    expect(
      mapFootballDataFixture({
        id: 560542,
        matchday: 1,
        utcDate: '2026-08-21T19:00:00Z',
        status: 'IN_PLAY',
        score: { fullTime: { home: 2, away: 0 } },
        homeTeam: { name: 'Arsenal FC', crest: null },
        awayTeam: { name: 'Coventry City FC', crest: null },
      }),
    ).toMatchObject({
      providerFixtureId: 560542,
      gameweek: 1,
      status: 'IN_PLAY',
      homeScore: 2,
      awayScore: 0,
      liveHomeScore: 2,
      liveAwayScore: 0,
    });
  });
});
