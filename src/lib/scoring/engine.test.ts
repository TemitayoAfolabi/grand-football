import { describe, it, expect } from 'vitest';
import { calculatePoints } from './engine';
import type { ScoreInput } from './types';

// Helper to reduce boilerplate
function score(home: number, away: number): ScoreInput {
  return { homeScore: home, awayScore: away };
}

describe('calculatePoints', () => {
  // ═══════════════════════════════════════
  // 1. EXACT SCORE — Normal Game (5 pts)
  // ═══════════════════════════════════════
  describe('Exact Score (normal game)', () => {
    it('awards 5 points for exact home win prediction', () => {
      const result = calculatePoints(score(2, 1), score(2, 1), false);
      expect(result).toEqual({ points: 5, reasonCode: 'EXACT_SCORE' });
    });

    it('awards 5 points for exact away win prediction', () => {
      const result = calculatePoints(score(0, 3), score(0, 3), false);
      expect(result).toEqual({ points: 5, reasonCode: 'EXACT_SCORE' });
    });

    it('awards 5 points for exact draw prediction', () => {
      const result = calculatePoints(score(1, 1), score(1, 1), false);
      expect(result).toEqual({ points: 5, reasonCode: 'EXACT_SCORE' });
    });

    it('awards 5 points for 0-0 draw prediction', () => {
      const result = calculatePoints(score(0, 0), score(0, 0), false);
      expect(result).toEqual({ points: 5, reasonCode: 'EXACT_SCORE' });
    });

    it('awards 5 points for high-scoring exact match', () => {
      const result = calculatePoints(score(5, 4), score(5, 4), false);
      expect(result).toEqual({ points: 5, reasonCode: 'EXACT_SCORE' });
    });
  });

  // ═══════════════════════════════════════
  // 2. EXACT SCORE — Star Game (10 pts)
  // ═══════════════════════════════════════
  describe('Exact Score (star game)', () => {
    it('awards 10 points for exact score on star game', () => {
      const result = calculatePoints(score(2, 1), score(2, 1), true);
      expect(result).toEqual({ points: 10, reasonCode: 'STAR_EXACT' });
    });

    it('awards 10 points for exact 0-0 on star game', () => {
      const result = calculatePoints(score(0, 0), score(0, 0), true);
      expect(result).toEqual({ points: 10, reasonCode: 'STAR_EXACT' });
    });

    it('awards 10 points for exact away win on star game', () => {
      const result = calculatePoints(score(1, 3), score(1, 3), true);
      expect(result).toEqual({ points: 10, reasonCode: 'STAR_EXACT' });
    });
  });

  // ═══════════════════════════════════════
  // 3. CORRECT OUTCOME — Normal Game (3 pts)
  // ═══════════════════════════════════════
  describe('Correct Outcome (normal game)', () => {
    it('awards 3 points for correct home win, wrong score', () => {
      const result = calculatePoints(score(3, 0), score(2, 1), false);
      expect(result).toEqual({ points: 3, reasonCode: 'OUTCOME' });
    });

    it('awards 3 points for correct away win, wrong score', () => {
      const result = calculatePoints(score(0, 1), score(1, 3), false);
      expect(result).toEqual({ points: 3, reasonCode: 'OUTCOME' });
    });

    it('awards 3 points for correct draw, wrong score', () => {
      const result = calculatePoints(score(2, 2), score(1, 1), false);
      expect(result).toEqual({ points: 3, reasonCode: 'OUTCOME' });
    });

    it('awards 3 points for correct draw 0-0 predicted vs 1-1 actual', () => {
      const result = calculatePoints(score(0, 0), score(1, 1), false);
      expect(result).toEqual({ points: 3, reasonCode: 'OUTCOME' });
    });

    it('awards 3 points for correct home win with different margins', () => {
      const result = calculatePoints(score(4, 1), score(1, 0), false);
      expect(result).toEqual({ points: 3, reasonCode: 'OUTCOME' });
    });
  });

  // ═══════════════════════════════════════
  // 4. CORRECT OUTCOME — Star Game (3 pts)
  // ═══════════════════════════════════════
  describe('Correct Outcome (star game)', () => {
    it('awards 3 points for correct outcome on star game (not doubled)', () => {
      const result = calculatePoints(score(3, 0), score(2, 1), true);
      expect(result).toEqual({ points: 3, reasonCode: 'STAR_OUTCOME' });
    });

    it('awards 3 points for correct draw on star game', () => {
      const result = calculatePoints(score(2, 2), score(0, 0), true);
      expect(result).toEqual({ points: 3, reasonCode: 'STAR_OUTCOME' });
    });

    it('awards 3 points for correct away win on star game', () => {
      const result = calculatePoints(score(0, 2), score(1, 4), true);
      expect(result).toEqual({ points: 3, reasonCode: 'STAR_OUTCOME' });
    });
  });

  // ═══════════════════════════════════════
  // 5. CORRECT TEAM GOALS — Normal Game (1 pt)
  // ═══════════════════════════════════════
  describe('Correct Team Goals (normal game)', () => {
    it('awards 1 point when home goals match (pred 2-0, actual 2-3)', () => {
      const result = calculatePoints(score(2, 0), score(2, 3), false);
      expect(result).toEqual({ points: 1, reasonCode: 'CORRECT_TEAM_GOALS' });
    });

    it('awards 0 points when neither team goals match (pred 0-2, actual 3-0)', () => {
      const result = calculatePoints(score(0, 2), score(3, 0), false);
      expect(result).toEqual({ points: 0, reasonCode: 'WRONG' });
    });

    it('awards 1 point when away goals match (pred 2-1, actual 0-1)', () => {
      const result = calculatePoints(score(2, 1), score(0, 1), false);
      expect(result).toEqual({ points: 1, reasonCode: 'CORRECT_TEAM_GOALS' });
    });

    it('awards 1 point when home goals match at zero (pred 0-1, actual 0-0)', () => {
      const result = calculatePoints(score(0, 1), score(0, 0), false);
      expect(result).toEqual({ points: 1, reasonCode: 'CORRECT_TEAM_GOALS' });
    });

    it('awards 1 point when away goals match at zero (pred 0-0, actual 1-0)', () => {
      const result = calculatePoints(score(0, 0), score(1, 0), false);
      expect(result).toEqual({ points: 1, reasonCode: 'CORRECT_TEAM_GOALS' });
    });

    it('awards 1 point when home goals match with wrong outcome (pred 1-0, actual 1-2)', () => {
      const result = calculatePoints(score(1, 0), score(1, 2), false);
      expect(result).toEqual({ points: 1, reasonCode: 'CORRECT_TEAM_GOALS' });
    });

    it('awards 1 point when away goals match at zero (pred 0-0, actual 2-0)', () => {
      const result = calculatePoints(score(0, 0), score(2, 0), false);
      expect(result).toEqual({ points: 1, reasonCode: 'CORRECT_TEAM_GOALS' });
    });

    it('awards 1 point: canonical reverse case with team goals match (pred 1-2, actual 2-1)', () => {
      // Outcome wrong, but away goals: pred 2 != actual 1, home goals: pred 1 != actual 2
      // Neither matches → actually WRONG
      const result = calculatePoints(score(1, 2), score(2, 1), false);
      expect(result).toEqual({ points: 0, reasonCode: 'WRONG' });
    });

    it('correct outcome takes priority when both match (pred 3-1, actual 3-2)', () => {
      // Both are HOME_WIN → correct outcome (3 pts), even though home goals also match
      const result = calculatePoints(score(3, 1), score(3, 2), false);
      expect(result).toEqual({ points: 3, reasonCode: 'OUTCOME' });
    });
  });

  // ═══════════════════════════════════════
  // 6. CORRECT TEAM GOALS — Star Game (1 pt)
  // ═══════════════════════════════════════
  describe('Correct Team Goals (star game)', () => {
    it('awards 1 point for correct team goals on star game (not doubled)', () => {
      const result = calculatePoints(score(2, 0), score(2, 3), true);
      expect(result).toEqual({ points: 1, reasonCode: 'STAR_CORRECT_TEAM_GOALS' });
    });

    it('awards 1 point for correct team goals on star game with zero match', () => {
      const result = calculatePoints(score(1, 0), score(1, 2), true);
      expect(result).toEqual({ points: 1, reasonCode: 'STAR_CORRECT_TEAM_GOALS' });
    });
  });

  // ═══════════════════════════════════════
  // 7. WRONG — Normal Game (0 pts)
  // ═══════════════════════════════════════
  describe('Wrong (normal game)', () => {
    it('awards 0 points for wrong outcome, no BTTS', () => {
      const result = calculatePoints(score(2, 0), score(0, 1), false);
      expect(result).toEqual({ points: 0, reasonCode: 'WRONG' });
    });

    it('awards 0 points when predicted home win, actual away win, one side 0', () => {
      const result = calculatePoints(score(3, 0), score(0, 2), false);
      expect(result).toEqual({ points: 0, reasonCode: 'WRONG' });
    });

    it('awards 0 points when predicted draw 0-0, actual home win, no team goals match', () => {
      const result = calculatePoints(score(0, 0), score(2, 1), false);
      expect(result).toEqual({ points: 0, reasonCode: 'WRONG' });
    });

    it('awards 0 points when predicted home win with 0 away, actual away win with 0 home', () => {
      // Both teams did NOT both score in prediction (away = 0)
      const result = calculatePoints(score(2, 0), score(0, 3), false);
      expect(result).toEqual({ points: 0, reasonCode: 'WRONG' });
    });

    it('awards 0 points when predicted away win, actual home win, no team goals match', () => {
      const result = calculatePoints(score(0, 1), score(2, 0), false);
      expect(result).toEqual({ points: 0, reasonCode: 'WRONG' });
    });

    it('awards 0 points for predicted draw, actual home win, no team goals match', () => {
      // Predicted: 0-0 (draw), Actual: 3-1 (home win)
      // Outcome wrong, no BTTS, neither team's goals match
      const result = calculatePoints(score(0, 0), score(3, 1), false);
      expect(result).toEqual({ points: 0, reasonCode: 'WRONG' });
    });

    it('awards 0 points when wrong outcome, no BTTS, no team goals match (pred 1-0, actual 0-2)', () => {
      // Predicted: 1-0 (home win), Actual: 0-2 (away win)
      // Outcome wrong. No BTTS. Neither team's goals match → WRONG
      const result = calculatePoints(score(1, 0), score(0, 2), false);
      expect(result).toEqual({ points: 0, reasonCode: 'WRONG' });
    });

    it('awards 0 points when wrong outcome, no BTTS, no team goals match (pred 2-1, actual 0-3)', () => {
      // Predicted: 2-1 (home win), Actual: 0-3 (away win)
      // Outcome wrong. No BTTS (actual home = 0). Neither team's goals match → WRONG
      const result = calculatePoints(score(2, 1), score(0, 3), false);
      expect(result).toEqual({ points: 0, reasonCode: 'WRONG' });
    });
  });

  // ═══════════════════════════════════════
  // 8. WRONG — Star Game (0 pts)
  // ═══════════════════════════════════════
  describe('Wrong (star game)', () => {
    it('awards 0 points for wrong on star game', () => {
      const result = calculatePoints(score(2, 0), score(0, 1), true);
      expect(result).toEqual({ points: 0, reasonCode: 'STAR_WRONG' });
    });

    it('awards 0 points for wrong on star game with clean sheets', () => {
      const result = calculatePoints(score(3, 0), score(0, 2), true);
      expect(result).toEqual({ points: 0, reasonCode: 'STAR_WRONG' });
    });
  });

  // ═══════════════════════════════════════
  // 9. EDGE CASES
  // ═══════════════════════════════════════
  describe('Edge cases', () => {
    it('handles 0-0 exact correctly', () => {
      const result = calculatePoints(score(0, 0), score(0, 0), false);
      expect(result).toEqual({ points: 5, reasonCode: 'EXACT_SCORE' });
    });

    it('handles boundary: predicted 1-1, actual 0-0 → correct outcome (draw)', () => {
      const result = calculatePoints(score(1, 1), score(0, 0), false);
      expect(result).toEqual({ points: 3, reasonCode: 'OUTCOME' });
    });

    it('handles boundary: predicted 0-0, actual 2-2 → correct outcome (draw)', () => {
      const result = calculatePoints(score(0, 0), score(2, 2), false);
      expect(result).toEqual({ points: 3, reasonCode: 'OUTCOME' });
    });

    it('handles high scores correctly', () => {
      const result = calculatePoints(score(7, 0), score(7, 0), false);
      expect(result).toEqual({ points: 5, reasonCode: 'EXACT_SCORE' });
    });

    it('no team goals match: predicted away = 0, actual away > 0', () => {
      // Predicted: 2-0 (home win), Actual: 1-3 (away win), neither team's goals match
      const result = calculatePoints(score(2, 0), score(1, 3), false);
      expect(result).toEqual({ points: 0, reasonCode: 'WRONG' });
    });

    it('no team goals match: actual away = 0, predicted away > 0', () => {
      // Predicted: 1-2 (away win), Actual: 3-0 (home win), neither matches
      const result = calculatePoints(score(1, 2), score(3, 0), false);
      expect(result).toEqual({ points: 0, reasonCode: 'WRONG' });
    });

    it('no team goals match: predicted home = 0, actual home > 0', () => {
      // Predicted: 0-2 (away win), Actual: 2-1 (home win), neither matches
      const result = calculatePoints(score(0, 2), score(2, 1), false);
      expect(result).toEqual({ points: 0, reasonCode: 'WRONG' });
    });

    it('no team goals match: actual home = 0, predicted home > 0', () => {
      // Predicted: 3-1 (home win), Actual: 0-2 (away win), neither matches
      const result = calculatePoints(score(3, 1), score(0, 2), false);
      expect(result).toEqual({ points: 0, reasonCode: 'WRONG' });
    });

    it('star game exact is 10, not 5+5', () => {
      const result = calculatePoints(score(2, 1), score(2, 1), true);
      expect(result.points).toBe(10);
      expect(result.reasonCode).toBe('STAR_EXACT');
    });

    it('star game outcome is still 3, NOT doubled', () => {
      const result = calculatePoints(score(2, 0), score(1, 0), true);
      expect(result.points).toBe(3);
      expect(result.reasonCode).toBe('STAR_OUTCOME');
    });

    it('star game correct team goals is still 1, NOT doubled', () => {
      const result = calculatePoints(score(2, 0), score(2, 3), true);
      expect(result.points).toBe(1);
      expect(result.reasonCode).toBe('STAR_CORRECT_TEAM_GOALS');
    });
  });

  // ═══════════════════════════════════════
  // 10. SYSTEMATIC OUTCOME MATRIX
  // ═══════════════════════════════════════
  describe('Outcome matrix: all outcome combinations', () => {
    // For each (predicted outcome, actual outcome) pair, ensure the right branch

    it('HOME_WIN predicted, HOME_WIN actual (non-exact) → OUTCOME', () => {
      const result = calculatePoints(score(3, 1), score(2, 0), false);
      expect(result.reasonCode).toBe('OUTCOME');
    });

    it('HOME_WIN predicted, AWAY_WIN actual, no team goals match → WRONG', () => {
      // pred 2-1, actual 1-3: home 2≠1, away 1≠3 → WRONG
      const result = calculatePoints(score(2, 1), score(1, 3), false);
      expect(result.reasonCode).toBe('WRONG');
    });

    it('HOME_WIN predicted, AWAY_WIN actual, no team goals match (clean sheets) → WRONG', () => {
      const result = calculatePoints(score(1, 0), score(0, 2), false);
      expect(result.reasonCode).toBe('WRONG');
    });

    it('HOME_WIN predicted, AWAY_WIN actual, correct team goals → CORRECT_TEAM_GOALS', () => {
      const result = calculatePoints(score(2, 0), score(2, 3), false);
      expect(result.reasonCode).toBe('CORRECT_TEAM_GOALS');
    });

    it('HOME_WIN predicted, DRAW actual, no team goals match → WRONG', () => {
      // pred 3-1, actual 2-2: home 3≠2, away 1≠2 → WRONG
      const result = calculatePoints(score(3, 1), score(2, 2), false);
      expect(result.reasonCode).toBe('WRONG');
    });

    it('HOME_WIN predicted, DRAW actual, no team goals match (zeros) → WRONG', () => {
      const result = calculatePoints(score(2, 0), score(1, 1), false);
      expect(result.reasonCode).toBe('WRONG');
    });

    it('HOME_WIN predicted, DRAW actual, correct team goals → CORRECT_TEAM_GOALS', () => {
      const result = calculatePoints(score(1, 0), score(0, 0), false);
      expect(result.reasonCode).toBe('CORRECT_TEAM_GOALS');
    });

    it('AWAY_WIN predicted, HOME_WIN actual, no team goals match → WRONG', () => {
      // pred 1-3, actual 2-1: home 1≠2, away 3≠1 → WRONG
      const result = calculatePoints(score(1, 3), score(2, 1), false);
      expect(result.reasonCode).toBe('WRONG');
    });

    it('AWAY_WIN predicted, HOME_WIN actual, no team goals match (zeros) → WRONG', () => {
      const result = calculatePoints(score(0, 2), score(3, 0), false);
      expect(result.reasonCode).toBe('WRONG');
    });

    it('AWAY_WIN predicted, HOME_WIN actual, correct team goals → CORRECT_TEAM_GOALS', () => {
      // Predicted: 0-2 (away win), Actual: 3-2 (home win) — wrong outcome, away goals match (2=2)
      const result = calculatePoints(score(0, 2), score(3, 2), false);
      expect(result.reasonCode).toBe('CORRECT_TEAM_GOALS');
    });

    it('AWAY_WIN predicted, AWAY_WIN actual (non-exact) → OUTCOME', () => {
      const result = calculatePoints(score(0, 1), score(1, 3), false);
      expect(result.reasonCode).toBe('OUTCOME');
    });

    it('AWAY_WIN predicted, DRAW actual, no team goals match → WRONG', () => {
      // pred 1-3, actual 2-2: home 1≠2, away 3≠2 → WRONG
      const result = calculatePoints(score(1, 3), score(2, 2), false);
      expect(result.reasonCode).toBe('WRONG');
    });

    it('AWAY_WIN predicted, DRAW actual, no team goals match (zeros) → WRONG', () => {
      const result = calculatePoints(score(0, 2), score(1, 1), false);
      expect(result.reasonCode).toBe('WRONG');
    });

    it('AWAY_WIN predicted, DRAW actual, correct team goals → CORRECT_TEAM_GOALS', () => {
      const result = calculatePoints(score(0, 1), score(0, 0), false);
      expect(result.reasonCode).toBe('CORRECT_TEAM_GOALS');
    });

    it('DRAW predicted, HOME_WIN actual, no team goals match → WRONG', () => {
      // pred 2-2, actual 3-1: home 2≠3, away 2≠1 → WRONG
      const result = calculatePoints(score(2, 2), score(3, 1), false);
      expect(result.reasonCode).toBe('WRONG');
    });

    it('DRAW predicted, HOME_WIN actual, no team goals match (zeros) → WRONG', () => {
      const result = calculatePoints(score(0, 0), score(2, 1), false);
      expect(result.reasonCode).toBe('WRONG');
    });

    it('DRAW predicted, HOME_WIN actual, correct team goals → CORRECT_TEAM_GOALS', () => {
      const result = calculatePoints(score(0, 0), score(1, 0), false);
      expect(result.reasonCode).toBe('CORRECT_TEAM_GOALS');
    });

    it('DRAW predicted, AWAY_WIN actual, no team goals match → WRONG', () => {
      // pred 2-2, actual 1-3: home 2≠1, away 2≠3 → WRONG
      const result = calculatePoints(score(2, 2), score(1, 3), false);
      expect(result.reasonCode).toBe('WRONG');
    });

    it('DRAW predicted, AWAY_WIN actual, no team goals match (zeros) → WRONG', () => {
      const result = calculatePoints(score(0, 0), score(1, 3), false);
      expect(result.reasonCode).toBe('WRONG');
    });

    it('DRAW predicted, AWAY_WIN actual, correct team goals → CORRECT_TEAM_GOALS', () => {
      const result = calculatePoints(score(0, 0), score(0, 2), false);
      expect(result.reasonCode).toBe('CORRECT_TEAM_GOALS');
    });

    it('DRAW predicted, DRAW actual (non-exact) → OUTCOME', () => {
      const result = calculatePoints(score(1, 1), score(3, 3), false);
      expect(result.reasonCode).toBe('OUTCOME');
    });
  });
});
