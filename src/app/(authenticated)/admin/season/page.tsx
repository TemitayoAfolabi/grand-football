'use client';

import { useState, useTransition, useEffect } from 'react';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { startNewSeason } from '../actions';
import { Trophy, AlertTriangle } from 'lucide-react';
import { formatPremierLeagueSeason, getPremierLeagueSeasonYear } from '@/lib/season';

interface Season {
  id: string;
  name: string;
  is_active: boolean;
  api_season?: number;
  created_at: string;
}

export default function AdminSeasonPage() {
  const suggestedSeason = formatPremierLeagueSeason(getPremierLeagueSeasonYear());
  const [activeSeason, setActiveSeason] = useState<Season | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [seasonName, setSeasonName] = useState(suggestedSeason);
  const [confirmText, setConfirmText] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (loaded) return;
    void import('@supabase/ssr').then(({ createBrowserClient }) => {
      const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      );
      void supabase
        .from('seasons')
        .select('id, name, is_active, api_season, created_at')
        .eq('is_active', true)
        .single()
        .then(({ data }) => {
          setActiveSeason((data as Season) ?? null);
          setLoaded(true);
        });
    });
  }, [loaded]);

  const canSubmit = seasonName.trim().length > 0 && confirmText === seasonName.trim();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canSubmit) return;

    setMessage(null);
    startTransition(async () => {
      const formData = new FormData();
      formData.set('name', seasonName.trim());
      const result = await startNewSeason(formData);

      if (result.error) {
        setMessage({ type: 'error', text: result.error });
      } else {
        setMessage({
          type: 'success',
          text: `Season "${seasonName.trim()}" started with ${result.fixturesImported ?? 0} fixtures.`,
        });
        setSeasonName(suggestedSeason);
        setConfirmText('');
        setLoaded(false);
      }
    });
  }

  return (
    <div className="space-y-6">
      <h2 className="text-h2 text-text-primary">Season Management</h2>

      {message && (
        <Alert variant={message.type === 'success' ? 'success' : 'error'}>
          {message.text}
        </Alert>
      )}

      {/* Current Season */}
      <Card>
        <CardHeader>
          <CardTitle>
            <div className="flex items-center gap-2">
              <Trophy className="h-4 w-4 text-gold" aria-hidden="true" />
              Current Season
            </div>
          </CardTitle>
          {activeSeason && <Badge variant="default">Active</Badge>}
        </CardHeader>
        {!loaded ? (
          <p className="py-4 text-center text-sm text-text-secondary">Loading…</p>
        ) : activeSeason ? (
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-text-secondary">Name</span>
              <span className="font-medium text-text-primary">{activeSeason.name}</span>
            </div>
            {activeSeason.api_season && (
              <div className="flex justify-between">
                <span className="text-text-secondary">Fixture feed</span>
                <span className="font-medium text-text-primary">{activeSeason.api_season}/{String(activeSeason.api_season + 1).slice(-2)}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-text-secondary">Created</span>
              <span className="font-medium text-text-primary">
                {new Date(activeSeason.created_at).toLocaleDateString('en-GB', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })}
              </span>
            </div>
          </div>
        ) : (
          <p className="py-4 text-center text-sm text-text-secondary">
            No active season found.
          </p>
        )}
      </Card>

      {/* Start New Season */}
      <Card>
        <CardHeader>
          <CardTitle>
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-warning" aria-hidden="true" />
              Start New Season
            </div>
          </CardTitle>
        </CardHeader>

        <Alert variant="warning" className="mb-4">
          The app imports the full published fixture list before switching seasons. If
          the import fails, the current season remains active.
        </Alert>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="New Season Name"
            placeholder={suggestedSeason}
            value={seasonName}
            onChange={(e) => setSeasonName(e.target.value)}
            required
            disabled={isPending}
            hint={`Only ${suggestedSeason} can be started right now.`}
          />

          {seasonName.trim().length > 0 && (
            <Input
              label="Confirm Season Name"
              placeholder={`Type "${seasonName.trim()}" to confirm`}
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              error={
                confirmText.length > 0 && confirmText !== seasonName.trim()
                  ? 'Season name does not match'
                  : undefined
              }
              required
              disabled={isPending}
              hint="Re-type the season name exactly to confirm this action"
            />
          )}

          <Button
            type="submit"
            variant="danger"
            className="w-full"
            disabled={!canSubmit}
            loading={isPending}
          >
            Start New Season
          </Button>
        </form>
      </Card>
    </div>
  );
}
