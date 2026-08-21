import { describe, expect, it } from 'vitest';
import { scorerNamesMatch } from './golden-boot';

describe('Golden Boot scorer matching', () => {
  it('matches a full player name with API-Football initials', () => {
    expect(scorerNamesMatch('Bukayo Saka', 'B. Saka')).toBe(true);
  });

  it('matches names with diacritics and rejects a different surname', () => {
    expect(scorerNamesMatch('João Pedro', 'J. Pedro')).toBe(true);
    expect(scorerNamesMatch('Bukayo Saka', 'K. Havertz')).toBe(false);
  });
});
