'use client';

import { useState, useEffect, useMemo, useTransition, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ClipboardList, Search, Users, Calendar, Clock } from 'lucide-react';
import {
  getAdminActiveSeason,
  getAdminAvailableGameweeks,
  getAdminPredictionsForGameweek,
  type GameweekInfo,
  type PredictionsData,
  type PredictionRow,
} from './actions';

// ── Helpers ──────────────────────────────────────────────────────────────

function formatKickoff(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) +
    ' ' +
    d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function formatSubmitted(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function wasEdited(submitted: string, updated: string): boolean {
  return Math.abs(new Date(updated).getTime() - new Date(submitted).getTime()) > 5000;
}

// ── Row type for the flat table ───────────────────────────────────────────

interface DisplayRow {
  user_id: string;
  display_name: string;
  fixture_id: string;
  fixture_label: string;
  kickoff: string;
  is_star_game: boolean;
  actual_home: number | null;
  actual_away: number | null;
  pred_home: number | null;
  pred_away: number | null;
  points: number | null;
  reason: string | null;
  submitted_at: string | null;
  updated_at: string | null;
  edited: boolean;
}

// ── Inner component (uses useSearchParams) ────────────────────────────────

function AdminPredictionsInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [season, setSeason] = useState<{ id: string; name: string } | null>(null);
  const [gwInfos, setGwInfos] = useState<GameweekInfo[]>([]);
  const [selectedGw, setSelectedGw] = useState<number | null>(null);
  const [data, setData] = useState<PredictionsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterInput, setFilterInput] = useState('');
  const [filterText, setFilterText] = useState('');
  const [filterFixture, setFilterFixture] = useState<string>('');
  const [, startTransition] = useTransition();

  // ── Debounce text filter 300 ms (Defect #2) ──────────────────────────
  useEffect(() => {
    const t = setTimeout(() => setFilterText(filterInput), 300);
    return () => clearTimeout(t);
  }, [filterInput]);

  // ── Bootstrap: load season + gameweeks ───────────────────────────────

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const s = await getAdminActiveSeason();
        // Defect #4: explicit error when no active season
        if (!s) { setError('No active season found.'); return; }
        if (cancelled) return;
        setSeason(s);

        const infos = await getAdminAvailableGameweeks(s.id);
        if (cancelled) return;
        setGwInfos(infos);

        if (infos.length === 0) { setError('No gameweeks found for the active season.'); return; }

        // Defect #1 + edge case: determine current GW
        const rawGwParam = searchParams.get('gw');
        const urlGwNum = rawGwParam !== null ? Number(rawGwParam) : NaN;
        const urlGw = Number.isInteger(urlGwNum) ? urlGwNum : null;
        let defaultGw: number;

        if (urlGw !== null && infos.some((g) => g.gw === urlGw)) {
          defaultGw = urlGw;
        } else {
          // Pick lowest GW whose earliest kickoff is in the future; fallback to last GW
          const now = new Date().toISOString();
          const futureGw = infos.find((g) => g.earliestKickoff >= now);
          defaultGw = futureGw?.gw ?? infos[infos.length - 1]!.gw;
        }

        setSelectedGw(defaultGw);
        loadGw(s.id, defaultGw);
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Load data for a specific GW ──────────────────────────────────────

  function loadGw(seasonId: string, gw: number) {
    setLoading(true);
    setData(null); // Defect #6: clear stale data immediately on GW switch
    setError(null);
    startTransition(() => {
      void getAdminPredictionsForGameweek(seasonId, gw).then((d) => {
        setData(d);
        setLoading(false);
      }).catch((err: unknown) => {
        setError((err as Error).message);
        setLoading(false);
      });
    });
  }

  function handleGwSelect(gw: number) {
    if (!season) return;
    setSelectedGw(gw);
    setFilterInput('');
    setFilterFixture('');
    // Sync URL
    const params = new URLSearchParams(searchParams.toString());
    params.set('gw', String(gw));
    router.replace(`?${params.toString()}`, { scroll: false });
    loadGw(season.id, gw);
  }

  // ── Build flat display rows ───────────────────────────────────────────

  const displayRows: DisplayRow[] = useMemo(() => {
    if (!data) return [];

    const predMap = new Map<string, PredictionRow>();
    for (const p of data.predictions) {
      predMap.set(`${p.user_id}:${p.fixture_id}`, p);
    }

    const rows: DisplayRow[] = [];
    for (const user of data.users) {
      for (const fix of data.fixtures) {
        const pred = predMap.get(`${user.id}:${fix.id}`);
        rows.push({
          user_id: user.id,
          display_name: user.display_name,
          fixture_id: fix.id,
          fixture_label: `${fix.home_team} vs ${fix.away_team}`,
          kickoff: fix.kickoff_time,
          is_star_game: fix.is_star_game,
          actual_home: fix.home_score,
          actual_away: fix.away_score,
          pred_home: pred?.pred_home ?? null,
          pred_away: pred?.pred_away ?? null,
          points: pred?.points_awarded ?? null,
          reason: pred?.reason_code ?? null,
          submitted_at: pred?.submitted_at ?? null,
          updated_at: pred?.updated_at ?? null,
          edited: pred ? wasEdited(pred.submitted_at, pred.updated_at) : false,
        });
      }
    }
    return rows;
  }, [data]);

  // ── Filtered rows ─────────────────────────────────────────────────────

  const filteredRows = useMemo(() => {
    let rows = displayRows;
    if (filterText.trim()) {
      const q = filterText.toLowerCase();
      rows = rows.filter(
        (r) =>
          r.display_name.toLowerCase().includes(q) ||
          r.fixture_label.toLowerCase().includes(q),
      );
    }
    if (filterFixture) {
      rows = rows.filter((r) => r.fixture_id === filterFixture);
    }
    return rows;
  }, [displayRows, filterText, filterFixture]);

  // ── Stats ─────────────────────────────────────────────────────────────

  const stats = useMemo(() => {
    if (!data) return null;
    const uniqueParticipants = new Set(data.predictions.map((p) => p.user_id));
    const deadlinePassed = data.deadline ? new Date(data.deadline) < new Date() : null;
    return {
      fixtures: data.fixtures.length,
      participants: uniqueParticipants.size,
      totalUsers: data.users.length,
      deadline: data.deadline,
      deadlinePassed,
    };
  }, [data]);

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <ClipboardList className="h-5 w-5 text-accent" aria-hidden="true" />
        <h2 className="text-h2 text-text-primary">All Predictions</h2>
        {season && (
          <Badge variant="default" className="ml-1">
            {season.name}
          </Badge>
        )}
      </div>

      {/* GW Pill Selector */}
      {gwInfos.length > 0 && (
        <div
          className="flex gap-1.5 overflow-x-auto pb-1"
          role="tablist"
          aria-label="Select gameweek"
        >
          {gwInfos.map(({ gw }) => (
            <button
              key={gw}
              role="tab"
              aria-selected={selectedGw === gw}
              onClick={() => handleGwSelect(gw)}
              className={`whitespace-nowrap rounded-full px-3 py-1 text-body-sm font-medium transition-all ${
                selectedGw === gw
                  ? 'bg-accent text-white'
                  : 'bg-bg-secondary text-text-secondary hover:text-text-primary hover:bg-bg-tertiary'
              }`}
            >
              GW {gw}
            </button>
          ))}
        </div>
      )}

      {/* Stats Bar */}
      {stats && (
        <div className="flex flex-wrap gap-4">
          <div className="flex items-center gap-1.5 text-body-sm text-text-secondary">
            <Calendar className="h-4 w-4 text-info" aria-hidden="true" />
            <span>{stats.fixtures} fixture{stats.fixtures !== 1 ? 's' : ''}</span>
          </div>
          <div className="flex items-center gap-1.5 text-body-sm text-text-secondary">
            <Users className="h-4 w-4 text-accent" aria-hidden="true" />
            <span>
              {stats.participants}/{stats.totalUsers} submitted
            </span>
          </div>
          {stats.deadline && (
            <div className="flex items-center gap-1.5 text-body-sm text-text-secondary">
              <Clock className="h-4 w-4 text-gold" aria-hidden="true" />
              <span>Deadline: {formatKickoff(stats.deadline)}</span>
              <Badge
                variant={stats.deadlinePassed ? 'locked' : 'warning'}
                className="text-[10px]"
              >
                {stats.deadlinePassed ? 'Closed' : 'Open'}
              </Badge>
            </div>
          )}
        </div>
      )}

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>
            <div className="flex items-center gap-2">
              <Search className="h-4 w-4 text-accent" aria-hidden="true" />
              Filter Predictions
            </div>
          </CardTitle>
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-secondary" aria-hidden="true" />
              <Input
                placeholder="Search player or fixture…"
                value={filterInput}
                onChange={(e) => setFilterInput(e.target.value)}
                className="pl-8"
                aria-label="Filter by player or fixture"
              />
            </div>
            {data && data.fixtures.length > 0 && (
              <select
                value={filterFixture}
                onChange={(e) => setFilterFixture(e.target.value)}
                className="rounded-input border border-border bg-bg-secondary px-3 py-1.5 text-body-sm text-text-primary"
                aria-label="Filter by fixture"
              >
                <option value="">All fixtures</option>
                {data.fixtures.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.home_team} vs {f.away_team}
                  </option>
                ))}
              </select>
            )}
          </div>
        </CardHeader>

        {/* Loading / Error / Empty */}
        {loading && (
          <p className="py-8 text-center text-sm text-text-secondary animate-pulse">
            Loading predictions…
          </p>
        )}
        {error && (
          <p className="py-4 text-center text-sm text-error">{error}</p>
        )}
        {!loading && !error && data && filteredRows.length === 0 && (
          <p className="py-8 text-center text-sm text-text-secondary">
            No predictions found{filterText || filterFixture ? ' for this filter' : ' for this gameweek'}.
          </p>
        )}
        {!loading && !error && !data && gwInfos.length === 0 && (
          <p className="py-8 text-center text-sm text-text-secondary">
            No gameweeks found for the active season.
          </p>
        )}

        {/* Predictions Table */}
        {!loading && filteredRows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="pb-2 pr-3 font-medium text-text-secondary whitespace-nowrap">Player</th>
                  <th className="pb-2 pr-3 font-medium text-text-secondary whitespace-nowrap">Fixture</th>
                  <th className="pb-2 pr-3 font-medium text-text-secondary whitespace-nowrap">Kickoff</th>
                  <th className="pb-2 pr-3 font-medium text-text-secondary whitespace-nowrap text-center">Prediction</th>
                  <th className="pb-2 pr-3 font-medium text-text-secondary whitespace-nowrap text-center">Actual</th>
                  <th className="pb-2 pr-3 font-medium text-text-secondary whitespace-nowrap text-center">Points</th>
                  <th className="pb-2 pr-3 font-medium text-text-secondary whitespace-nowrap">Submitted</th>
                  <th className="pb-2 font-medium text-text-secondary whitespace-nowrap">⭐</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredRows.map((row) => (
                  <tr
                    key={`${row.user_id}:${row.fixture_id}`}
                    className={row.pred_home === null ? 'opacity-50' : ''}
                  >
                    {/* Player */}
                    <td className="py-2 pr-3 font-medium text-text-primary whitespace-nowrap">
                      {row.display_name}
                    </td>

                    {/* Fixture */}
                    <td className="py-2 pr-3 text-text-secondary whitespace-nowrap">
                      {row.fixture_label}
                    </td>

                    {/* Kickoff */}
                    <td className="py-2 pr-3 text-text-secondary whitespace-nowrap tabular-nums text-xs">
                      {formatKickoff(row.kickoff)}
                    </td>

                    {/* Prediction */}
                    <td className="py-2 pr-3 text-center tabular-nums">
                      {row.pred_home !== null ? (
                        <span className="font-semibold text-accent">
                          {row.pred_home}–{row.pred_away}
                        </span>
                      ) : (
                        <span className="text-text-secondary">—</span>
                      )}
                    </td>

                    {/* Actual */}
                    <td className="py-2 pr-3 text-center tabular-nums text-text-secondary">
                      {row.actual_home !== null && row.actual_away !== null
                        ? `${row.actual_home}–${row.actual_away}`
                        : '—'}
                    </td>

                    {/* Points */}
                    <td className="py-2 pr-3 text-center tabular-nums">
                      {row.points !== null ? (
                        <span className="font-bold text-accent">{row.points}</span>
                      ) : (
                        <span className="text-text-secondary">—</span>
                      )}
                    </td>

                    {/* Submitted + updated_at (Defect #3) */}
                    <td className="py-2 pr-3 text-text-secondary text-xs whitespace-nowrap">
                      {row.submitted_at ? (
                        <span>
                          {formatSubmitted(row.submitted_at)}
                          {row.edited && row.updated_at && (
                            <span className="block text-[10px] text-text-secondary">
                              <Badge variant="warning" className="mr-1 text-[10px]">
                                Edited
                              </Badge>
                              {formatSubmitted(row.updated_at)}
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="text-text-secondary">—</span>
                      )}
                    </td>

                    {/* Star Game */}
                    <td className="py-2 text-center">
                      {row.is_star_game && (
                        <span className="text-gold" aria-label="Star game">★</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Row count */}
      {!loading && filteredRows.length > 0 && (
        <p className="text-xs text-text-secondary text-right">
          Showing {filteredRows.length} row{filteredRows.length !== 1 ? 's' : ''}
          {(filterText || filterFixture) ? ` (filtered from ${displayRows.length})` : ''}
        </p>
      )}
    </div>
  );
}

// ── Page export (wraps inner in Suspense for useSearchParams) ─────────────

export default function AdminPredictionsPage() {
  return (
    <Suspense fallback={<p className="py-8 text-center text-sm text-text-secondary animate-pulse">Loading…</p>}>
      <AdminPredictionsInner />
    </Suspense>
  );
}
