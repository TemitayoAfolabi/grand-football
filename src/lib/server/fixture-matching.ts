const TEAM_ALIASES: Record<string, string> = {
  brightonhovealbion: 'brighton',
  coventrycity: 'coventry',
  leedsunited: 'leeds',
  newcastleunited: 'newcastle',
  tottenhamhotspur: 'tottenham',
  westhamunited: 'westham',
  wolverhamptonwanderers: 'wolves',
};

function teamKey(team: string) {
  const normalised = team
    .toLowerCase()
    .replace(/\b(?:afc|fc)\b/g, '')
    .replace(/[^a-z]/g, '');
  return TEAM_ALIASES[normalised] ?? normalised;
}

/** Creates a provider-neutral key to match fixtures whose team labels differ. */
export function fixtureKey(gameweek: number, homeTeam: string, awayTeam: string) {
  return `${gameweek}:${teamKey(homeTeam)}:${teamKey(awayTeam)}`;
}
