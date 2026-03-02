'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Tables } from '@/lib/database.types';

type Fixture = Tables<'fixtures'>;

interface Prediction {
  id: string;
  user_id: string;
  fixture_id: string;
  home_score: number;
  away_score: number;
  submitted_at: string;
  updated_at: string;
}

interface Profile {
  id: string;
  display_name: string;
  avatar_url: string | null;
  featured_badges: string[];
}

interface UseGameweekPredictionsReturn {
  predictions: Prediction[];
  profiles: Profile[];
  fixtures: Fixture[];
  isLoading: boolean;
}

export function useGameweekPredictions(
  seasonId: string,
  gameweek: number,
  liveFixtures?: Fixture[],
): UseGameweekPredictionsReturn {
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [fixtures, setFixtures] = useState<Fixture[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchPredictions = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/predictions/gameweek/${gameweek}?seasonId=${seasonId}`,
      );
      if (!res.ok) return;
      const data = (await res.json()) as {
        predictions: Prediction[];
        profiles: Profile[];
        fixtures: Fixture[];
      };
      setPredictions(data.predictions ?? []);
      setProfiles(data.profiles ?? []);
      setFixtures(data.fixtures ?? []);
    } catch {
      /* will retry on next trigger */
    } finally {
      setIsLoading(false);
    }
  }, [seasonId, gameweek]);

  // Initial fetch
  useEffect(() => {
    setIsLoading(true);
    void fetchPredictions();
  }, [fetchPredictions]);

  // Refetch when a new fixture finishes (count of finished increases)
  const finishedCount =
    liveFixtures?.filter((f) => f.status === 'FINISHED').length ?? 0;
  const prevFinishedCount = useRef(finishedCount);

  useEffect(() => {
    if (finishedCount > prevFinishedCount.current) {
      void fetchPredictions();
    }
    prevFinishedCount.current = finishedCount;
  }, [finishedCount, fetchPredictions]);

  return { predictions, profiles, fixtures, isLoading };
}
