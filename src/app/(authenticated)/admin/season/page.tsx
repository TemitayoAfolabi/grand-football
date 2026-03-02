'use client';

import { useState, useTransition, useEffect } from 'react';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { startNewSeason } from '../actions';
import { Trophy, AlertTriangle } from 'lucide-react';

interface Season {
  id: string;
  name: string;
  is_active: boolean;
  created_at: string;
}

export default function AdminSeasonPage() {
  const [activeSeason, setActiveSeason] = useState<Season | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [seasonName, setSeasonName] = useState('');
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
        .select('id, name, is_active, created_at')
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
        setMessage({ type: 'success', text: `Season "${seasonName.trim()}" started successfully.` });
        setSeasonName('');
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
          This is a destructive action. Starting a new season will deactivate the current
          season. This cannot be undone.
        </Alert>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="New Season Name"
            placeholder="e.g. 2026-2027"
            value={seasonName}
            onChange={(e) => setSeasonName(e.target.value)}
            required
            disabled={isPending}
            hint="Enter a name for the new season"
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
