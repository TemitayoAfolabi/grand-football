import { describe, expect, it } from 'vitest';
import {
  formatPremierLeagueSeason,
  getPremierLeagueSeasonYear,
  getSeasonDates,
} from './season';

describe('Premier League season helpers', () => {
  it('uses the upcoming season before the summer fixture release window', () => {
    expect(getPremierLeagueSeasonYear(new Date('2026-05-31T12:00:00Z'))).toBe(2025);
  });

  it('uses the season beginning in the current year from June onwards', () => {
    expect(getPremierLeagueSeasonYear(new Date('2026-06-01T00:00:00Z'))).toBe(2026);
    expect(formatPremierLeagueSeason(2026)).toBe('2026-2027');
  });

  it('sets dates that cover the whole Premier League campaign', () => {
    expect(getSeasonDates(2026)).toEqual({
      startDate: '2026-08-21',
      endDate: '2027-05-30',
    });
  });
});
