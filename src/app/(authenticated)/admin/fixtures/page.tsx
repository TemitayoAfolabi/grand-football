'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { toggleStarGame, overrideResult, setGameweekDeadline } from '../actions';
import { PostponeButton } from './_components/PostponeButton';
import { ManageFixturePanel } from './_components/ManageFixturePanel';
import { OrphanedFixturesSection } from './_components/OrphanedFixturesSection';
import { Star, CheckCircle, Clock, X } from 'lucide-react';

interface Fixture {
  id: string;
  home_team: string;
  away_team: string;
  kickoff_time: string;
  status: string;
  home_score: number | null;
  away_score: number | null;
  gameweek: number;
  is_star_game: boolean;
  manually_overridden: boolean;
}

interface GameweekDeadline {
  season_id: string;
  gameweek: number;
  deadline: string;
}

/** Format a Date to `YYYY-MM-DDTHH:mm` for datetime-local inputs */
function toLocalInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default function AdminFixturesPage() {
  const [fixtures, setFixtures] = useState<Fixture[]>([]);
  const [seasonId, setSeasonId] = useState<string | null>(null);
  const [deadlines, setDeadlines] = useState<Map<number, GameweekDeadline>>(new Map());
  const [loaded, setLoaded] = useState(false);
  const [gameweekFilter, setGameweekFilter] = useState<string>('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();
  const [overrideFixtureId, setOverrideFixtureId] = useState<string | null>(null);
  const [deadlineInput, setDeadlineInput] = useState<string>('');

  // Load fixtures, season, and deadlines
  const loadData = useCallback(() => {
    void import('@supabase/ssr')
      .then(async ({ createBrowserClient }) => {
        const supabase = createBrowserClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        );

        const { data: season, error: seasonError } = await supabase
          .from('seasons')
          .select('id')
          .eq('is_active', true)
          .single();

        if (seasonError || !season) {
          throw new Error(seasonError?.message ?? 'No active season found.');
        }

        const activeSeasonId = season.id as string;
        setSeasonId(activeSeasonId);

        const [{ data: dls, error: deadlinesError }, { data: fixtureRows, error: fixturesError }] =
          await Promise.all([
            supabase
              .from('gameweek_deadlines')
              .select('season_id, gameweek, deadline')
              .eq('season_id', activeSeasonId),
            supabase
              .from('fixtures')
              .select(
                'id, home_team, away_team, kickoff_time, status, home_score, away_score, gameweek, is_star_game, manually_overridden',
              )
              .eq('season_id', activeSeasonId)
              .order('kickoff_time', { ascending: false }),
          ]);

        if (deadlinesError || fixturesError) {
          throw new Error(deadlinesError?.message ?? fixturesError?.message);
        }

        const deadlineMap = new Map<number, GameweekDeadline>();
        for (const deadline of (dls as GameweekDeadline[]) ?? []) {
          deadlineMap.set(deadline.gameweek, deadline);
        }

        setDeadlines(deadlineMap);
        setFixtures((fixtureRows as Fixture[]) ?? []);
        setLoaded(true);
      })
      .catch((error: unknown) => {
        setMessage({
          type: 'error',
          text: error instanceof Error ? error.message : 'Failed to load fixtures.',
        });
        setLoaded(true);
      });
  }, []);

  useEffect(() => {
    if (!loaded) loadData();
  }, [loaded, loadData]);

  const orphanedFixtures = fixtures.filter(
    (f) => f.status === 'POSTPONED' || f.status === 'CANCELLED',
  );

  const gameweeks = [...new Set(fixtures.map((f) => f.gameweek))].sort((a, b) => b - a);
  const filtered = gameweekFilter
    ? fixtures.filter((f) => f.gameweek === Number(gameweekFilter))
    : fixtures;
  const activeFiltered = filtered.filter(
    (f) => f.status !== 'POSTPONED' && f.status !== 'CANCELLED',
  );

  // Compute the earliest kickoff for the selected gameweek (default deadline)
  const selectedGw = gameweekFilter ? Number(gameweekFilter) : null;
  const gwFixtures = selectedGw ? fixtures.filter((f) => f.gameweek === selectedGw) : [];
  const earliestKickoff = gwFixtures.length > 0
    ? gwFixtures
        .filter((f) => f.status !== 'POSTPONED' && f.status !== 'CANCELLED')
        .reduce<string | null>(
          (earliest, f) => (!earliest || f.kickoff_time < earliest ? f.kickoff_time : earliest),
          null,
        )
    : null;
  const customDeadline = selectedGw ? deadlines.get(selectedGw) : null;

  // Pre-populate deadline input when gameweek selection changes
  useEffect(() => {
    if (customDeadline) {
      setDeadlineInput(toLocalInput(new Date(customDeadline.deadline)));
    } else if (earliestKickoff) {
      setDeadlineInput(toLocalInput(new Date(earliestKickoff)));
    } else {
      setDeadlineInput('');
    }
  }, [selectedGw, customDeadline, earliestKickoff]);

  function handleToggleStar(fixtureId: string, current: boolean) {
    setMessage(null);
    startTransition(async () => {
      const result = await toggleStarGame(fixtureId, !current);
      if (result.error) {
        setMessage({ type: 'error', text: result.error });
      } else {
        setMessage({ type: 'success', text: 'Star game updated.' });
        setLoaded(false);
      }
    });
  }

  function handleOverride(formData: FormData) {
    setMessage(null);
    setOverrideFixtureId(null);
    startTransition(async () => {
      const result = await overrideResult(formData);
      if (result.error) {
        setMessage({ type: 'error', text: result.error });
      } else {
        setMessage({ type: 'success', text: 'Result overridden successfully.' });
        setLoaded(false);
      }
    });
  }

  function handleFixtureSuccess() {
    setMessage({ type: 'success', text: 'Fixture updated successfully.' });
    setLoaded(false);
  }

  function handleFixtureError(msg: string) {
    setMessage({ type: 'error', text: msg });
  }

  function handleSetDeadline() {
    if (!seasonId || !selectedGw) return;
    setMessage(null);
    startTransition(async () => {
      const deadlineISO = deadlineInput ? new Date(deadlineInput).toISOString() : null;
      const result = await setGameweekDeadline(seasonId, selectedGw, deadlineISO);
      if (result.error) {
        setMessage({ type: 'error', text: result.error });
      } else {
        setMessage({ type: 'success', text: `Deadline ${deadlineISO ? 'set' : 'cleared'} for GW ${selectedGw}.` });
        setLoaded(false);
      }
    });
  }

  function handleClearDeadline() {
    if (!seasonId || !selectedGw) return;
    setMessage(null);
    startTransition(async () => {
      const result = await setGameweekDeadline(seasonId, selectedGw, null);
      if (result.error) {
        setMessage({ type: 'error', text: result.error });
      } else {
        setMessage({ type: 'success', text: `Custom deadline cleared for GW ${selectedGw}. Reverted to first kickoff.` });
        setLoaded(false);
      }
    });
  }

  const isKickedOff = (status: string) =>
    !['SCHEDULED', 'TIMED'].includes(status);

  return (
    <div className="space-y-6">
      <h2 className="text-h2 text-text-primary">Fixture Management</h2>

      {message && (
        <Alert variant={message.type === 'success' ? 'success' : 'error'}>
          {message.text}
        </Alert>
      )}

      {/* Gameweek filter */}
      <div className="flex items-center gap-3">
        <label htmlFor="gw-filter" className="text-body-sm font-medium text-text-primary">
          Filter Gameweek:
        </label>
        <select
          id="gw-filter"
          className="rounded-input border border-border bg-bg-secondary px-3 py-2 text-body-sm text-text-primary transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
          value={gameweekFilter}
          onChange={(e) => setGameweekFilter(e.target.value)}
        >
          <option value="">All</option>
          {gameweeks.map((gw) => (
            <option key={gw} value={gw}>
              GW {gw}
            </option>
          ))}
        </select>
      </div>

      {/* Submission deadline card — shown when a specific gameweek is selected */}
      {selectedGw && seasonId && (
        <Card variant="accent">
          <CardHeader>
            <CardTitle>
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-accent" aria-hidden="true" />
                GW {selectedGw} Submission Deadline
              </div>
            </CardTitle>
            {customDeadline && <Badge variant="warning">Custom</Badge>}
            {!customDeadline && <Badge variant="default">Auto (first kickoff)</Badge>}
          </CardHeader>

          <div className="space-y-3">
            <p className="text-body-sm text-text-secondary">
              {customDeadline
                ? `Custom deadline: ${new Date(customDeadline.deadline).toLocaleString('en-GB')}`
                : earliestKickoff
                  ? `Default (first kickoff): ${new Date(earliestKickoff).toLocaleString('en-GB')}`
                  : 'No fixtures in this gameweek.'}
            </p>

            <div className="flex flex-wrap items-end gap-3">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="gw-deadline" className="text-body-sm font-medium text-text-primary">
                  Deadline date &amp; time
                </label>
                <input
                  id="gw-deadline"
                  type="datetime-local"
                  className="rounded-input border border-border bg-bg-secondary px-3 py-2.5 text-body text-text-primary transition-all duration-150 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
                  value={deadlineInput}
                  onChange={(e) => setDeadlineInput(e.target.value)}
                />
              </div>

              <Button
                size="sm"
                onClick={handleSetDeadline}
                loading={isPending}
                disabled={!deadlineInput}
              >
                <Clock className="h-4 w-4" aria-hidden="true" />
                Set Deadline
              </Button>

              {customDeadline && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleClearDeadline}
                  loading={isPending}
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                  Reset to first kickoff
                </Button>
              )}
            </div>

            <p className="text-xs text-text-tertiary">
              After this deadline, any prediction edit/submission will incur a late penalty (−1 within 1h, −3 within 3h, −5 beyond 3h).
              If no custom deadline is set, the first kickoff in the gameweek is used automatically.
            </p>
          </div>
        </Card>
      )}

      {/* Postponed & Cancelled section */}
      {orphanedFixtures.length > 0 && (
        <OrphanedFixturesSection
          fixtures={orphanedFixtures}
          onSuccess={handleFixtureSuccess}
          onError={handleFixtureError}
        />
      )}

      {/* Fixtures list */}
      <div className="space-y-3">
        {activeFiltered.length === 0 && (
          <p className="py-4 text-center text-sm text-text-secondary">
            No fixtures found.
          </p>
        )}
        {activeFiltered.map((fixture) => (
          <Card key={fixture.id}>
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-body-sm font-medium text-text-primary">
                    {fixture.home_team} vs {fixture.away_team}
                  </p>
                  {fixture.is_star_game && (
                    <Badge variant="star">
                      <Star className="h-3 w-3" aria-hidden="true" />
                      Star
                    </Badge>
                  )}
                  {fixture.manually_overridden && (
                    <Badge variant="warning">Overridden</Badge>
                  )}
                </div>
                <p className="text-xs text-text-secondary">
                  GW {fixture.gameweek} · {fixture.status} ·{' '}
                  {new Date(fixture.kickoff_time).toLocaleString('en-GB')}
                </p>
                {fixture.status === 'FINISHED' && (
                  <p className="text-body-sm text-text-primary">
                    Score: {fixture.home_score} – {fixture.away_score}
                  </p>
                )}
              </div>

              <div className="flex shrink-0 items-center gap-2">
                {/* Postpone quick-action — SCHEDULED/TIMED only */}
                {['SCHEDULED', 'TIMED'].includes(fixture.status) && (
                  <PostponeButton
                    fixtureId={fixture.id}
                    onSuccess={handleFixtureSuccess}
                    onError={handleFixtureError}
                  />
                )}

                {/* Star toggle */}
                <Button
                  variant={fixture.is_star_game ? 'secondary' : 'ghost'}
                  size="sm"
                  onClick={() => handleToggleStar(fixture.id, fixture.is_star_game)}
                  disabled={isKickedOff(fixture.status) || isPending}
                  aria-label={fixture.is_star_game ? 'Remove star' : 'Make star game'}
                >
                  <Star
                    className={`h-4 w-4 ${fixture.is_star_game ? 'fill-gold text-gold' : 'text-text-secondary'}`}
                    aria-hidden="true"
                  />
                </Button>

                {/* Override button */}
                {fixture.status === 'FINISHED' && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() =>
                      setOverrideFixtureId(
                        overrideFixtureId === fixture.id ? null : fixture.id,
                      )
                    }
                  >
                    <CheckCircle className="h-4 w-4" aria-hidden="true" />
                    Override
                  </Button>
                )}
              </div>
            </div>

            {/* Override form */}
            {overrideFixtureId === fixture.id && (
              <form
                action={handleOverride}
                className="mt-3 flex items-end gap-2 border-t border-border pt-3"
              >
                <input type="hidden" name="fixtureId" value={fixture.id} />
                <Input
                  name="homeScore"
                  type="number"
                  label="Home"
                  min={0}
                  max={99}
                  defaultValue={fixture.home_score ?? 0}
                  className="w-20"
                  required
                />
                <Input
                  name="awayScore"
                  type="number"
                  label="Away"
                  min={0}
                  max={99}
                  defaultValue={fixture.away_score ?? 0}
                  className="w-20"
                  required
                />
                <Button type="submit" size="sm" loading={isPending}>
                  Save
                </Button>
              </form>
            )}

            {/* Manage fixture panel — only available for pre-kickoff fixtures */}
            {['SCHEDULED', 'TIMED'].includes(fixture.status) && (
              <div className="mt-3 border-t border-border pt-3">
                <ManageFixturePanel
                  fixture={fixture}
                  onSuccess={handleFixtureSuccess}
                  onError={handleFixtureError}
                />
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
