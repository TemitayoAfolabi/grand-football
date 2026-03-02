import type { ReasonCode } from './types';

/** Human-readable explanations for each scoring reason code */
export const REASON_EXPLANATIONS: Record<ReasonCode, string> = {
  EXACT_SCORE: 'You predicted the exact score! +5 points',
  OUTCOME: 'You predicted the correct outcome. +3 points',
  CORRECT_TEAM_GOALS:
    'Wrong outcome, but you correctly predicted goals for one team. +1 point',
  WRONG: 'Incorrect prediction. 0 points',
  STAR_EXACT:
    'Star Game — exact score! Double points! +10 points',
  STAR_OUTCOME:
    'Star Game — correct outcome. +3 points',
  STAR_CORRECT_TEAM_GOALS:
    'Star Game — wrong outcome, but you correctly predicted goals for one team. +1 point',
  STAR_WRONG: 'Star Game — incorrect prediction. 0 points',
  NO_PREDICTION: 'No prediction submitted. 0 points',
};

/** Short labels for reason codes */
export const REASON_LABELS: Record<ReasonCode, string> = {
  EXACT_SCORE: 'Exact Score',
  OUTCOME: 'Correct Outcome',
  CORRECT_TEAM_GOALS: 'Correct Team Goals',
  WRONG: 'Wrong',
  STAR_EXACT: '⭐ Exact Score',
  STAR_OUTCOME: '⭐ Correct Outcome',
  STAR_CORRECT_TEAM_GOALS: '⭐ Correct Team Goals',
  STAR_WRONG: '⭐ Wrong',
  NO_PREDICTION: 'No Prediction',
};
