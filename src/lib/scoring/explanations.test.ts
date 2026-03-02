import { describe, it, expect } from 'vitest';
import { REASON_EXPLANATIONS, REASON_LABELS } from './explanations';
import type { ReasonCode } from './types';

const ALL_REASON_CODES: ReasonCode[] = [
  'EXACT_SCORE',
  'OUTCOME',
  'CORRECT_TEAM_GOALS',
  'WRONG',
  'STAR_EXACT',
  'STAR_OUTCOME',
  'STAR_CORRECT_TEAM_GOALS',
  'STAR_WRONG',
  'NO_PREDICTION',
];

describe('REASON_EXPLANATIONS', () => {
  it('has an explanation for every reason code', () => {
    for (const code of ALL_REASON_CODES) {
      expect(REASON_EXPLANATIONS[code]).toBeDefined();
      expect(typeof REASON_EXPLANATIONS[code]).toBe('string');
      expect(REASON_EXPLANATIONS[code].length).toBeGreaterThan(0);
    }
  });

  it('includes point values in explanations', () => {
    expect(REASON_EXPLANATIONS.EXACT_SCORE).toContain('+5');
    expect(REASON_EXPLANATIONS.OUTCOME).toContain('+3');
    expect(REASON_EXPLANATIONS.CORRECT_TEAM_GOALS).toContain('+1');
    expect(REASON_EXPLANATIONS.WRONG).toContain('0');
    expect(REASON_EXPLANATIONS.STAR_EXACT).toContain('+10');
    expect(REASON_EXPLANATIONS.STAR_OUTCOME).toContain('+3');
    expect(REASON_EXPLANATIONS.STAR_CORRECT_TEAM_GOALS).toContain('+1');
    expect(REASON_EXPLANATIONS.STAR_WRONG).toContain('0');
    expect(REASON_EXPLANATIONS.NO_PREDICTION).toContain('0');
  });
});

describe('REASON_LABELS', () => {
  it('has a label for every reason code', () => {
    for (const code of ALL_REASON_CODES) {
      expect(REASON_LABELS[code]).toBeDefined();
      expect(typeof REASON_LABELS[code]).toBe('string');
      expect(REASON_LABELS[code].length).toBeGreaterThan(0);
    }
  });

  it('star labels contain star indicator', () => {
    expect(REASON_LABELS.STAR_EXACT).toContain('⭐');
    expect(REASON_LABELS.STAR_OUTCOME).toContain('⭐');
    expect(REASON_LABELS.STAR_CORRECT_TEAM_GOALS).toContain('⭐');
    expect(REASON_LABELS.STAR_WRONG).toContain('⭐');
  });

  it('non-star labels do not contain star indicator', () => {
    expect(REASON_LABELS.EXACT_SCORE).not.toContain('⭐');
    expect(REASON_LABELS.OUTCOME).not.toContain('⭐');
    expect(REASON_LABELS.CORRECT_TEAM_GOALS).not.toContain('⭐');
    expect(REASON_LABELS.WRONG).not.toContain('⭐');
    expect(REASON_LABELS.NO_PREDICTION).not.toContain('⭐');
  });
});
