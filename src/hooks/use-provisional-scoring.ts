'use client';

import { useMemo } from 'react';
import { calculatePoints } from '@/lib/scoring/engine';
import { calculateLatePenalty } from '@/lib/scoring/late-penalty';
import { FIXTURE_STATUS } from '@/lib/constants';
import type { Tables } from '@/lib/database.types';

type Fixture = Tables<'fixtures'>;

export interface Prediction {
  id: string;
  user_id: string;
  fixture_id: string;
  home_score: number;
  away_score: number;
  submitted_at: string;
  updated_at?: string;
}

export interface Profile {
  id: string;
  display_name: string;
  avatar_url: string | null;
  featured_badges?: string[];
}

export interface FixtureBreakdown {
  fixture_id: string;
  home_team: string;
  away_team: string;
  actual_home: number | null;
  actual_away: number | null;
  predicted_home: number;
  predicted_away: number;
  points: number;
  reason_code: string;
  is_star_game: boolean;
  status: string;
}

export interface ProvisionalEntry {
  rank: number;
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  total_points: number;
  exact_count: number;
  outcome_count: number;
  late_penalty: number;
  featured_badges: string[];
  fixture_breakdown: FixtureBreakdown[];
}

export interface SeasonEntry {
  user_id: string;
  confirmed_points: number;
}

interface UseProvisionalScoringReturn {
  weeklyLeaderboard: ProvisionalEntry[];
  seasonLeaderboard: ProvisionalEntry[];
}

export function useProvisionalScoring(
  fixtures: Fixture[],
  predictions: Prediction[],
  profiles: Profile[],
  seasonEntries: SeasonEntry[],
  /** Admin-set custom deadline (ISO string). Falls back to earliest kickoff if not provided. */
  customDeadline?: string | null,
): UseProvisionalScoringReturn {
  return useMemo(() => {
    const profileMap = new Map(profiles.map((p) => [p.id, p]));
    const seasonMap = new Map(
      seasonEntries.map((e) => [e.user_id, e.confirmed_points]),
    );

    // Group predictions by user
    const predsByUser = new Map<string, Prediction[]>();
    for (const pred of predictions) {
      const existing = predsByUser.get(pred.user_id) ?? [];
      existing.push(pred);
      predsByUser.set(pred.user_id, existing);
    }

    // Build fixture map
    const fixtureMap = new Map(fixtures.map((f) => [f.id, f]));

    // All unique user IDs from predictions
    const allUserIds = new Set([...predsByUser.keys()]);

    // Also include users from season entries who might not have predictions
    for (const entry of seasonEntries) {
      allUserIds.add(entry.user_id);
    }

    const weeklyEntries: ProvisionalEntry[] = [];
    const seasonLeaderboardEntries: ProvisionalEntry[] = [];

    // Compute gameweek deadline: custom if provided, else earliest kickoff across all fixtures
    const gameweekDeadline = customDeadline
      ? new Date(customDeadline)
      : fixtures.length > 0
        ? new Date(Math.min(...fixtures.map((f) => new Date(f.kickoff_time).getTime())))
        : null;

    for (const userId of allUserIds) {
      const userPreds = predsByUser.get(userId) ?? [];
      const profile = profileMap.get(userId);
      let weeklyPoints = 0;
      let liveOnlyPoints = 0;
      let exactCount = 0;
      let outcomeCount = 0;
      let latePenalty = 0;
      const breakdowns: FixtureBreakdown[] = [];

      for (const pred of userPreds) {
        const fixture = fixtureMap.get(pred.fixture_id);
        if (!fixture) continue;

        const isActive =
          fixture.status === FIXTURE_STATUS.IN_PLAY ||
          fixture.status === FIXTURE_STATUS.PAUSED ||
          fixture.status === FIXTURE_STATUS.FINISHED;

        if (!isActive || fixture.home_score == null || fixture.away_score == null) {
          continue;
        }

        const result = calculatePoints(
          { homeScore: pred.home_score, awayScore: pred.away_score },
          { homeScore: fixture.home_score, awayScore: fixture.away_score },
          fixture.is_star_game,
        );

        weeklyPoints += result.points;

        // Only count IN_PLAY/PAUSED for season provisional
        // (FINISHED fixtures are already in confirmed season totals)
        if (
          fixture.status === FIXTURE_STATUS.IN_PLAY ||
          fixture.status === FIXTURE_STATUS.PAUSED
        ) {
          liveOnlyPoints += result.points;
        }

        if (
          result.reasonCode === 'EXACT_SCORE' ||
          result.reasonCode === 'STAR_EXACT'
        ) {
          exactCount++;
        }
        if (
          result.reasonCode === 'OUTCOME' ||
          result.reasonCode === 'STAR_OUTCOME'
        ) {
          outcomeCount++;
        }

        breakdowns.push({
          fixture_id: fixture.id,
          home_team: fixture.home_team,
          away_team: fixture.away_team,
          actual_home: fixture.home_score,
          actual_away: fixture.away_score,
          predicted_home: pred.home_score,
          predicted_away: pred.away_score,
          points: result.points,
          reason_code: result.reasonCode,
          is_star_game: fixture.is_star_game,
          status: fixture.status,
        });
      }

      // Calculate late penalty for this user
      const userPredTimes = userPreds.map((p) =>
        new Date(p.updated_at ?? p.submitted_at).getTime(),
      );
      if (userPredTimes.length > 0 && gameweekDeadline !== null) {
        const latestSubmission = new Date(Math.max(...userPredTimes));
        const latePenaltyResult = calculateLatePenalty({
          latestSubmissionAt: latestSubmission,
          gameweekDeadline,
        });
        latePenalty = latePenaltyResult.penalty;
        weeklyPoints += latePenalty;
      }

      const weeklyEntry: ProvisionalEntry = {
        rank: 0,
        user_id: userId,
        display_name: profile?.display_name ?? 'Unknown',
        avatar_url: profile?.avatar_url ?? null,
        total_points: weeklyPoints,
        exact_count: exactCount,
        outcome_count: outcomeCount,
        late_penalty: latePenalty,
        featured_badges: profile?.featured_badges ?? [],
        fixture_breakdown: breakdowns,
      };
      weeklyEntries.push(weeklyEntry);

      // Season entry: confirmed + only live (non-finished) provisional points
      const confirmedPoints = seasonMap.get(userId) ?? 0;
      seasonLeaderboardEntries.push({
        ...weeklyEntry,
        total_points: confirmedPoints + liveOnlyPoints,
      });
    }

    const rankEntries = (entries: ProvisionalEntry[]) => {
      entries.sort((a, b) => {
        if (b.total_points !== a.total_points) return b.total_points - a.total_points;
        if (b.exact_count !== a.exact_count) return b.exact_count - a.exact_count;
        return b.outcome_count - a.outcome_count;
      });
      let currentRank = 1;
      for (let i = 0; i < entries.length; i++) {
        if (
          i > 0 &&
          entries[i]!.total_points === entries[i - 1]!.total_points &&
          entries[i]!.exact_count === entries[i - 1]!.exact_count &&
          entries[i]!.outcome_count === entries[i - 1]!.outcome_count
        ) {
          entries[i]!.rank = entries[i - 1]!.rank;
        } else {
          entries[i]!.rank = currentRank;
        }
        currentRank++;
      }
      return entries;
    };

    return {
      weeklyLeaderboard: rankEntries(weeklyEntries),
      seasonLeaderboard: rankEntries(seasonLeaderboardEntries),
    };
  }, [fixtures, predictions, profiles, seasonEntries, customDeadline]);
}
