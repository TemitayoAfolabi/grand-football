/** All possible scoring reason codes */
export type ReasonCode =
  | 'EXACT_SCORE'
  | 'OUTCOME'
  | 'CORRECT_TEAM_GOALS'
  | 'WRONG'
  | 'STAR_EXACT'
  | 'STAR_OUTCOME'
  | 'STAR_CORRECT_TEAM_GOALS'
  | 'STAR_WRONG'
  | 'NO_PREDICTION';

/** Result of a scoring calculation */
export interface ScoringResult {
  points: number;
  reasonCode: ReasonCode;
}

/** Score input for the engine */
export interface ScoreInput {
  homeScore: number;
  awayScore: number;
}

/** Match outcome */
export type Outcome = 'HOME_WIN' | 'AWAY_WIN' | 'DRAW';
