import { describe, expect, it } from 'vitest';
import { fixtureKey } from './fixture-matching';

describe('fixture sync matching', () => {
  it('matches the provider and stored Coventry team names to one fixture', () => {
    expect(fixtureKey(1, 'Arsenal FC', 'Coventry City FC')).toBe(
      fixtureKey(1, 'Arsenal', 'Coventry'),
    );
  });
});
