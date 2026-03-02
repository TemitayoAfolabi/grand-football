'use client';

import { useEffect, useState, useTransition, useCallback, useRef } from 'react';
import { FixtureCard } from '@/components/fixture-card';
import { EmptyState } from '@/components/empty-state';
import { VisibilityBanner } from '@/components/visibility-banner';
import { PredictionSummaryStrip } from '@/components/prediction-summary-strip';
import { Skeleton } from '@/components/ui/skeleton';
import { Calendar, ChevronLeft, ChevronDown, ChevronUp, EyeOff, Users } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

interface Fixture {
  id: string;
  home_team: string;
  away_team: string;
  home_team_crest: string | null;
  away_team_crest: string | null;
  kickoff_time: string;
  status: string;
  home_score: number | null;
  away_score: number | null;
  is_star_game: boolean;
  gameweek: number;
}

interface PredictionEntry {
  fixture_id: string;
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  home_score: number | null;
  away_score: number | null;
  submitted_at: string;
  can_view: boolean;
  is_own: boolean;
  points_awarded: number | null;
  reason_code: string | null;
  visibility: string;
  first_kickoff: string | null;
  viewer_has_predicted: boolean;
}

interface PredictionHistoryResponse {
  visibility: 'visible' | 'hidden' | 'own_only';
  firstKickoff: string | null;
  viewerHasPredicted: boolean;
  predictions: PredictionEntry[];
  fixtures: Fixture[];
  profiles: Array<{ user_id: string; display_name: string; avatar_url: string | null }>;
  gameweek: number;
  seasonId: string;
}

interface Props {
  viewerId: string;
  targetUserId: string;
  targetDisplayName: string;
  targetAvatarUrl: string | null;
  isOwnProfile: boolean;
  seasonId: string;
  seasonName: string;
  gameweeks: number[];
  initialGameweek: number;
}

export function PredictionHistoryView({
  viewerId,
  targetUserId,
  targetDisplayName,
  isOwnProfile,
  seasonId,
  seasonName,
  gameweeks,
  initialGameweek,
}: Props) {
  const [selectedGw, setSelectedGw] = useState(initialGameweek);
  const [data, setData] = useState<PredictionHistoryResponse | null>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const selectedGwRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    selectedGwRef.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
      inline: 'center',
    });
  }, [selectedGw]);

  const fetchData = useCallback(
    (gw: number) => {
      startTransition(async () => {
        setError(null);
        try {
          const res = await fetch(
            `/api/predictions/history/${gw}?seasonId=${seasonId}`,
          );
          if (!res.ok) {
            const body = (await res.json()) as { error?: string };
            setError(body.error ?? 'Failed to load predictions');
            return;
          }
          const json = (await res.json()) as PredictionHistoryResponse;
          setData(json);
        } catch {
          setError('Failed to load predictions');
        }
      });
    },
    [seasonId],
  );

  useEffect(() => {
    fetchData(selectedGw);
  }, [selectedGw, fetchData]);

  // Group predictions by fixture for the target user
  const targetPredictions = new Map<string, PredictionEntry>();
  const allUserPredictions = new Map<string, PredictionEntry[]>();

  if (data?.predictions) {
    for (const pred of data.predictions) {
      // Build per-fixture grouped predictions (all users)
      const existing = allUserPredictions.get(pred.fixture_id) ?? [];
      existing.push(pred);
      allUserPredictions.set(pred.fixture_id, existing);

      // Track target user's predictions
      if (pred.user_id === targetUserId) {
        targetPredictions.set(pred.fixture_id, pred);
      }
    }
  }

  // Compute summary stats for target user from inline score data
  const totalPoints = Array.from(targetPredictions.values()).reduce(
    (sum, pred) => sum + (pred.points_awarded ?? 0),
    0,
  );
  const totalPredictions = targetPredictions.size;
  const totalFixtures = data?.fixtures?.length ?? 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href="/leaderboard"
          className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-elevated text-text-secondary hover:text-text-primary transition-colors"
          aria-label="Back to leaderboard"
        >
          <ChevronLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-h1 text-text-primary">
            {isOwnProfile ? 'My Predictions' : `${targetDisplayName}'s Predictions`}
          </h1>
          <p className="mt-1 text-body-sm text-text-secondary">
            {seasonName}
          </p>
        </div>
      </div>

      {/* Gameweek tabs (scrollable) */}
      <div
        className="hide-scrollbar relative flex gap-2 overflow-x-auto pb-1"
        role="tablist"
        aria-label="Gameweek selector"
      >
        {gameweeks.map((gw) => (
          <button
            key={gw}
            ref={gw === selectedGw ? selectedGwRef : undefined}
            role="tab"
            aria-selected={gw === selectedGw}
            onClick={() => setSelectedGw(gw)}
            className={cn(
              'shrink-0 rounded-pill px-4 py-2 text-body-sm font-medium transition-all duration-150',
              gw === selectedGw
                ? 'bg-accent text-text-inverse shadow-glow-accent'
                : 'bg-surface-elevated border border-border text-text-secondary hover:text-text-primary hover:border-border-strong',
            )}
          >
            GW {gw}
          </button>
        ))}
      </div>

      {/* Visibility banner */}
      {data && <VisibilityBanner visibility={data.visibility} firstKickoff={data.firstKickoff} isOwnProfile={isOwnProfile} />}

      {/* Error state */}
      {error && (
        <div className="rounded-card border border-error/20 bg-error/10 p-4 text-center">
          <p className="text-body-sm text-error">{error}</p>
        </div>
      )}

      {/* Loading state */}
      {isPending && (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      )}

      {/* Content */}
      {!isPending && data && (
        <>
          {/* Summary strip */}
          {(data.visibility === 'visible' || isOwnProfile) && (
            <PredictionSummaryStrip
              totalPoints={totalPoints}
              totalPredictions={totalPredictions}
              totalFixtures={totalFixtures}
            />
          )}

          {/* Fixture list with predictions */}
          {data.fixtures.length > 0 ? (
            <div className="space-y-3">
              {data.fixtures.map((fixture, i) => {
                const targetPred = targetPredictions.get(fixture.id);
                const fixturePredictions = allUserPredictions.get(fixture.id) ?? [];

                // Build score record from inline data (D-01 fix)
                const scoreRecord =
                  targetPred && targetPred.can_view && targetPred.points_awarded != null
                    ? {
                        points_awarded: targetPred.points_awarded,
                        reason_code: targetPred.reason_code ?? '',
                      }
                    : null;

                return (
                  <div
                    key={fixture.id}
                    className="animate-fade-in-up opacity-0"
                    style={{ animationDelay: `${i * 50}ms` }}
                  >
                    <FixtureCard
                      fixture={fixture}
                      prediction={
                        targetPred && targetPred.can_view && targetPred.home_score != null && targetPred.away_score != null
                          ? { home_score: targetPred.home_score, away_score: targetPred.away_score }
                          : null
                      }
                      scoreRecord={scoreRecord}
                    >
                      {/* Collapsible other users' predictions */}
                      <OtherPredictions
                        predictions={fixturePredictions}
                        viewerId={viewerId}
                      />
                    </FixtureCard>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState
              icon={Calendar}
              title="No Fixtures"
              description="No fixtures scheduled for this gameweek."
            />
          )}
        </>
      )}
    </div>
  );
}

/* ─── Collapsible section showing other users' predictions ─── */

function OtherPredictions({
  predictions,
  viewerId,
}: {
  predictions: PredictionEntry[];
  viewerId: string;
}) {
  const [open, setOpen] = useState(false);

  if (predictions.length === 0) return null;

  return (
    <div className="mt-3 border-t border-border-subtle pt-2">
      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(!open);
        }}
        className="flex w-full items-center gap-2 rounded-input px-2 py-1.5 text-body-sm font-medium text-text-tertiary hover:text-text-secondary transition-colors"
        aria-expanded={open}
      >
        <Users className="h-3.5 w-3.5" aria-hidden="true" />
        <span>{predictions.length} prediction{predictions.length !== 1 ? 's' : ''}</span>
        {open ? (
          <ChevronUp className="ml-auto h-3.5 w-3.5" />
        ) : (
          <ChevronDown className="ml-auto h-3.5 w-3.5" />
        )}
      </button>

      {open && (
        <div className="mt-1.5 space-y-1">
          {predictions.map((pred) => (
            <div
              key={pred.user_id}
              className="flex items-center justify-between rounded-input px-2 py-1.5 text-body-sm"
            >
              <span
                className={
                  pred.user_id === viewerId
                    ? 'font-medium text-accent'
                    : 'text-text-secondary'
                }
              >
                {pred.display_name}
                {pred.user_id === viewerId && (
                  <span className="ml-1 text-caption text-text-tertiary">(you)</span>
                )}
              </span>
              {pred.can_view ? (
                <span className="font-bold tabular-nums text-text-primary">
                  {pred.home_score} - {pred.away_score}
                </span>
              ) : (
                <span className="flex items-center gap-1 text-text-disabled">
                  <EyeOff className="h-3 w-3" />
                  Hidden
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
