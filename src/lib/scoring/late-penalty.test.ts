import { describe, it, expect } from 'vitest';
import { calculateLatePenalty } from './late-penalty';

function makeInput(deadlineISO: string, submissionISO: string) {
  return {
    gameweekDeadline: new Date(deadlineISO),
    latestSubmissionAt: new Date(submissionISO),
  };
}

describe('calculateLatePenalty', () => {
  const deadline = '2026-03-07T15:00:00Z';

  it('returns 0 penalty when submitted before deadline', () => {
    const result = calculateLatePenalty(
      makeInput(deadline, '2026-03-07T14:00:00Z'),
    );
    expect(result).toEqual({ penalty: 0, tier: 'ON_TIME' });
  });

  it('returns 0 penalty when submitted exactly at deadline', () => {
    const result = calculateLatePenalty(
      makeInput(deadline, '2026-03-07T15:00:00Z'),
    );
    expect(result).toEqual({ penalty: 0, tier: 'ON_TIME' });
  });

  it('returns -1 penalty when submitted 30 minutes late', () => {
    const result = calculateLatePenalty(
      makeInput(deadline, '2026-03-07T15:30:00Z'),
    );
    expect(result).toEqual({ penalty: -1, tier: 'LATE_1H' });
  });

  it('returns -1 penalty when submitted exactly 1 hour late (boundary)', () => {
    const result = calculateLatePenalty(
      makeInput(deadline, '2026-03-07T16:00:00Z'),
    );
    expect(result).toEqual({ penalty: -1, tier: 'LATE_1H' });
  });

  it('returns -3 penalty when submitted 1 hour 1 minute late', () => {
    const result = calculateLatePenalty(
      makeInput(deadline, '2026-03-07T16:01:00Z'),
    );
    expect(result).toEqual({ penalty: -3, tier: 'LATE_3H' });
  });

  it('returns -3 penalty when submitted 2 hours late', () => {
    const result = calculateLatePenalty(
      makeInput(deadline, '2026-03-07T17:00:00Z'),
    );
    expect(result).toEqual({ penalty: -3, tier: 'LATE_3H' });
  });

  it('returns -3 penalty when submitted exactly 3 hours late (boundary)', () => {
    const result = calculateLatePenalty(
      makeInput(deadline, '2026-03-07T18:00:00Z'),
    );
    expect(result).toEqual({ penalty: -3, tier: 'LATE_3H' });
  });

  it('returns -5 penalty when submitted 3 hours 1 minute late', () => {
    const result = calculateLatePenalty(
      makeInput(deadline, '2026-03-07T18:01:00Z'),
    );
    expect(result).toEqual({ penalty: -5, tier: 'LATE_MAX' });
  });

  it('returns -5 penalty when submitted 5 hours late', () => {
    const result = calculateLatePenalty(
      makeInput(deadline, '2026-03-07T20:00:00Z'),
    );
    expect(result).toEqual({ penalty: -5, tier: 'LATE_MAX' });
  });

  it('returns -5 penalty when submitted 24 hours late', () => {
    const result = calculateLatePenalty(
      makeInput(deadline, '2026-03-08T15:00:00Z'),
    );
    expect(result).toEqual({ penalty: -5, tier: 'LATE_MAX' });
  });
});
