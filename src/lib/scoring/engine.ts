import { getOutcome } from '@/lib/utils';
import type { ScoreInput, ScoringResult, Outcome } from './types';

/**
 * Calculate points for a prediction against the actual result.
 * Mirrors the PL/pgSQL scoring function for client-side preview and testing.
 */
export function calculatePoints(
  predicted: ScoreInput,
  actual: ScoreInput,
  isStarGame: boolean,
): ScoringResult {
  const predOutcome: Outcome = getOutcome(
    predicted.homeScore,
    predicted.awayScore,
  );
  const actualOutcome: Outcome = getOutcome(
    actual.homeScore,
    actual.awayScore,
  );

  // 1. Exact score match
  if (
    predicted.homeScore === actual.homeScore &&
    predicted.awayScore === actual.awayScore
  ) {
    return isStarGame
      ? { points: 10, reasonCode: 'STAR_EXACT' }
      : { points: 5, reasonCode: 'EXACT_SCORE' };
  }

  // 2. Correct outcome (but not exact)
  if (predOutcome === actualOutcome) {
    return isStarGame
      ? { points: 3, reasonCode: 'STAR_OUTCOME' }
      : { points: 3, reasonCode: 'OUTCOME' };
  }

  // 3. Correct Team Goals: wrong outcome but at least one team's goals match
  if (
    predicted.homeScore === actual.homeScore ||
    predicted.awayScore === actual.awayScore
  ) {
    return isStarGame
      ? { points: 1, reasonCode: 'STAR_CORRECT_TEAM_GOALS' }
      : { points: 1, reasonCode: 'CORRECT_TEAM_GOALS' };
  }

  // 4. Wrong
  return isStarGame
    ? { points: 0, reasonCode: 'STAR_WRONG' }
    : { points: 0, reasonCode: 'WRONG' };
}
