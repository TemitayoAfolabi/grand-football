'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Countdown } from '@/components/countdown';
import { Check, AlertTriangle } from 'lucide-react';
import { LATE_PENALTY } from '@/lib/constants';

/** Compute the current late-penalty tier label and points from the GW deadline. */
function getCurrentPenalty(
  gameweekDeadline: Date,
): { points: number; label: string } | null {
  const diffMs = Date.now() - gameweekDeadline.getTime();
  if (diffMs <= 0) return null; // still on time

  if (diffMs <= LATE_PENALTY.THRESHOLD_1H) {
    return { points: LATE_PENALTY.LATE_1H, label: 'within 1 hour' };
  }
  if (diffMs <= LATE_PENALTY.THRESHOLD_3H) {
    return { points: LATE_PENALTY.LATE_3H, label: 'within 3 hours' };
  }
  return { points: LATE_PENALTY.LATE_MAX, label: 'over 3 hours' };
}

interface PredictionFormProps {
  fixtureId: string;
  kickoffTime: string;
  /** Earliest kickoff in the gameweek — used as the late-penalty deadline. */
  gameweekDeadline?: string;
  existingPrediction?: {
    home_score: number;
    away_score: number;
  } | null;
  submitAction: (formData: FormData) => Promise<{ error?: string; success?: boolean }>;
}

export function PredictionForm({
  fixtureId,
  kickoffTime,
  gameweekDeadline,
  existingPrediction,
  submitAction,
}: PredictionFormProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [locked, setLocked] = useState(new Date(kickoffTime) <= new Date());
  const formRef = useRef<HTMLFormElement>(null);

  // Live-update the penalty tier every 30 seconds so the warning stays accurate
  const [penalty, setPenalty] = useState<{ points: number; label: string } | null>(() =>
    gameweekDeadline ? getCurrentPenalty(new Date(gameweekDeadline)) : null,
  );

  useEffect(() => {
    if (!gameweekDeadline) return;
    const deadline = new Date(gameweekDeadline);

    function refresh() {
      setPenalty(getCurrentPenalty(deadline));
    }
    refresh();
    const id = setInterval(refresh, 30_000);
    return () => clearInterval(id);
  }, [gameweekDeadline]);

  const handleSubmit = (formData: FormData) => {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await submitAction(formData);
      if (result?.error) {
        setError(result.error);
      } else {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    });
  };

  if (locked) {
    return (
      <div className="mt-3 border-t border-border-subtle pt-3">
        {existingPrediction ? (
          <div className="flex items-center justify-between">
            <span className="text-body-sm text-text-secondary">Your prediction</span>
            <span className="text-body font-bold tabular-nums text-text-primary">
              {existingPrediction.home_score} - {existingPrediction.away_score}
            </span>
          </div>
        ) : (
          <p className="text-body-sm text-text-disabled">No prediction submitted</p>
        )}
      </div>
    );
  }

  return (
    <div className="mt-3 border-t border-border-subtle pt-3">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-caption uppercase tracking-wider text-text-secondary">Locks in</span>
        <Countdown targetDate={kickoffTime} onExpire={() => setLocked(true)} />
      </div>

      {/* Late-penalty warning */}
      {penalty && (
        <div
          className="mb-3 flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2"
          role="alert"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
          <p className="text-caption text-warning">
            <span className="font-semibold">Late penalty ({penalty.points} pts):</span>{' '}
            The gameweek deadline has passed. Saving now ({penalty.label} late) will incur a{' '}
            <span className="font-bold">{penalty.points}-point</span> penalty for the entire gameweek.
          </p>
        </div>
      )}

      <form ref={formRef} action={handleSubmit} className="flex items-end gap-3">
        <input type="hidden" name="fixtureId" value={fixtureId} />

        <div className="flex items-center gap-3">
          <label className="sr-only" htmlFor={`home-${fixtureId}`}>Home score</label>
          <input
            id={`home-${fixtureId}`}
            name="homeScore"
            type="number"
            min={0}
            max={99}
            defaultValue={existingPrediction?.home_score ?? ''}
            placeholder="0"
            required
            className="score-input h-14 w-18 rounded-input border-2 border-border bg-bg-secondary text-center text-h1 font-extrabold text-text-primary transition-all duration-150 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 tabular-nums"
            aria-label="Predicted home score"
          />

          <span className="text-h3 text-text-tertiary">&mdash;</span>

          <label className="sr-only" htmlFor={`away-${fixtureId}`}>Away score</label>
          <input
            id={`away-${fixtureId}`}
            name="awayScore"
            type="number"
            min={0}
            max={99}
            defaultValue={existingPrediction?.away_score ?? ''}
            placeholder="0"
            required
            className="score-input h-14 w-18 rounded-input border-2 border-border bg-bg-secondary text-center text-h1 font-extrabold text-text-primary transition-all duration-150 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 tabular-nums"
            aria-label="Predicted away score"
          />
        </div>

        <Button type="submit" size="sm" loading={isPending}>
          {saved ? (
            <>
              <Check className="h-4 w-4" aria-hidden="true" />
              Saved
            </>
          ) : existingPrediction ? (
            'Update'
          ) : (
            'Save'
          )}
        </Button>
      </form>

      {error && (
        <p className="mt-2 text-caption text-error" role="alert">{error}</p>
      )}
    </div>
  );
}
