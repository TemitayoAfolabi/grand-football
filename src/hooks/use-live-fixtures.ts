'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { CLIENT_POLL_FALLBACK_MS } from '@/lib/constants';
import type { Tables } from '@/lib/database.types';

type Fixture = Tables<'fixtures'>;

interface UseLiveFixturesReturn {
  fixtures: Fixture[];
  isConnected: boolean;
  lastUpdated: Date | null;
}

export function useLiveFixtures(gameweek: number): UseLiveFixturesReturn {
  const [fixtures, setFixtures] = useState<Fixture[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const supabase = useRef(createClient()).current;
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchFixtures = useCallback(async () => {
    try {
      // Realtime gives the quickest UI update. Polling remains active as a
      // safety net so a missed Realtime event can never leave a live score
      // stale in an otherwise connected browser.
      const res = await fetch(`/api/fixtures/live?gameweek=${gameweek}`, {
        cache: 'no-store',
      });
      if (!res.ok) return;
      const data = (await res.json()) as { fixtures: Fixture[] };
      setFixtures(data.fixtures);
      setLastUpdated(new Date());
    } catch {
      /* retry on next poll interval */
    }
  }, [gameweek]);

  const startPolling = useCallback(() => {
    if (pollRef.current) return;
    pollRef.current = setInterval(() => void fetchFixtures(), CLIENT_POLL_FALLBACK_MS as number);
  }, [fetchFixtures]);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  // Realtime provides immediate updates; a 30-second poll remains active as
  // an independent recovery path if the channel misses an event.
  useEffect(() => {
    const fetchAll = async () => {
      const { data: season } = await supabase
        .from('seasons')
        .select('id')
        .eq('is_active', true)
        .single();

      if (!season) return;

      const { data } = await supabase
        .from('fixtures')
        .select('*')
        .eq('season_id', String(season.id))
        .eq('gameweek', gameweek)
        .order('kickoff_time', { ascending: true });

      if (data) {
        setFixtures(data);
        setLastUpdated(new Date());
      }
    };

    void fetchAll();
    void fetchFixtures();
    startPolling();

    const channel = supabase
      .channel(`fixtures-gw-${gameweek}`)
      .on<Fixture>(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'fixtures',
          filter: `gameweek=eq.${gameweek}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setFixtures((prev) => [...prev, payload.new]);
          } else if (payload.eventType === 'UPDATE') {
            setFixtures((prev) => prev.map((f) => (f.id === payload.new.id ? payload.new : f)));
          } else if (payload.eventType === 'DELETE' && payload.old?.id) {
            setFixtures((prev) => prev.filter((f) => f.id !== (payload.old as Fixture).id));
          }
          setLastUpdated(new Date());
        },
      )
      .subscribe((status) => {
        setIsConnected(String(status) === 'SUBSCRIBED');
      });

    return () => {
      stopPolling();
      void supabase.removeChannel(channel);
    };
  }, [gameweek, supabase, fetchFixtures, startPolling, stopPolling]);

  // Pause polling when tab is hidden, resume when visible
  useEffect(() => {
    const handler = () => {
      if (document.hidden) {
        stopPolling();
      } else {
        startPolling();
        void fetchFixtures();
      }
    };
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, [startPolling, stopPolling, fetchFixtures]);

  return { fixtures, isConnected, lastUpdated };
}
