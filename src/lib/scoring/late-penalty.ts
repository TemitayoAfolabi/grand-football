import { LATE_PENALTY } from '@/lib/constants';

export interface LatePenaltyInput {
  /** The user's latest prediction submission timestamp for the gameweek */
  latestSubmissionAt: Date;
  /** The earliest kickoff time in the gameweek */
  gameweekDeadline: Date;
}

export interface LatePenaltyResult {
  penalty: number; // 0, -1, -3, or -5
  tier: 'ON_TIME' | 'LATE_1H' | 'LATE_3H' | 'LATE_MAX';
}

export function calculateLatePenalty(input: LatePenaltyInput): LatePenaltyResult {
  const diffMs = input.latestSubmissionAt.getTime() - input.gameweekDeadline.getTime();

  // On time or before kickoff
  if (diffMs <= 0) {
    return { penalty: LATE_PENALTY.ON_TIME, tier: 'ON_TIME' };
  }

  if (diffMs <= LATE_PENALTY.THRESHOLD_1H) {
    return { penalty: LATE_PENALTY.LATE_1H, tier: 'LATE_1H' };
  }

  if (diffMs <= LATE_PENALTY.THRESHOLD_3H) {
    return { penalty: LATE_PENALTY.LATE_3H, tier: 'LATE_3H' };
  }

  return { penalty: LATE_PENALTY.LATE_MAX, tier: 'LATE_MAX' };
}
