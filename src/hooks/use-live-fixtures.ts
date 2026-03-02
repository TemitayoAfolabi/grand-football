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
  const isConnectedRef = useRef(false);

  useEffect(() => {
    isConnectedRef.current = isConnected;
  }, [isConnected]);

  const fetchFallback = useCallback(async () => {
    try {
      // Fetch ALL fixtures for the gameweek (not just live) so we
      // detect FINISHED transitions even when Realtime is disconnected
      const res = await fetch(`/api/fixtures/live?gameweek=${gameweek}`);
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
    pollRef.current = setInterval(() => void fetchFallback(), CLIENT_POLL_FALLBACK_MS as number);
  }, [fetchFallback]);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  // Initial fetch + Realtime subscription
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
            setFixtures((prev) =>
              prev.map((f) => (f.id === payload.new.id ? payload.new : f)),
            );
          } else if (payload.eventType === 'DELETE' && payload.old?.id) {
            setFixtures((prev) =>
              prev.filter((f) => f.id !== (payload.old as Fixture).id),
            );
          }
          setLastUpdated(new Date());
        },
      )
      .subscribe((status) => {
        const connected = String(status) === 'SUBSCRIBED';
        setIsConnected(connected);
        if (!connected) {
          startPolling();
        } else {
          stopPolling();
        }
      });

    return () => {
      stopPolling();
      void supabase.removeChannel(channel);
    };
  }, [gameweek, supabase, startPolling, stopPolling]);

  // Pause polling when tab is hidden, resume when visible
  useEffect(() => {
    const handler = () => {
      if (document.hidden) {
        stopPolling();
      } else {
        if (!isConnectedRef.current) {
          startPolling();
          void fetchFallback();
        }
      }
    };
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, [startPolling, stopPolling, fetchFallback]);

  return { fixtures, isConnected, lastUpdated };
}
