/**
 * football-data.org identifies a season by the calendar year in which it
 * begins (for example, 2026 represents the 2026/27 Premier League season).
 */
export function getPremierLeagueSeasonYear(date = new Date()): number {
  const year = date.getUTCFullYear();
  // The Premier League fixture list is released during the summer. Treat June
  // onwards as the forthcoming/current season so the rollover UI is useful
  // before the first August fixture.
  return date.getUTCMonth() >= 5 ? year : year - 1;
}

export function formatPremierLeagueSeason(apiSeason: number): string {
  return `${apiSeason}-${apiSeason + 1}`;
}

export function getSeasonDates(apiSeason: number) {
  // Officially confirmed dates are kept here when the Premier League publishes
  // them. The fallback makes future rollovers usable before confirmation.
  if (apiSeason === 2026) {
    return {
      startDate: '2026-08-21',
      endDate: '2027-05-30',
    };
  }

  return {
    startDate: `${apiSeason}-08-01`,
    endDate: `${apiSeason + 1}-06-01`,
  };
}
