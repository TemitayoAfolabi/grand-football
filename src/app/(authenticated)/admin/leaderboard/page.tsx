'use client';

import { useState, useTransition } from 'react';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { editScoreRecord } from '../actions';
import { BarChart3, Pencil, X, Check, History } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';

interface ScoreRecord {
  id: string;
  user_id: string;
  fixture_id: string;
  points_awarded: number;
  reason_code: string;
  is_star_game: boolean;
  manually_edited: boolean;
  predicted_home: number | null;
  predicted_away: number | null;
  actual_home: number;
  actual_away: number;
  display_name: string;
  home_team: string;
  away_team: string;
  gameweek: number;
}

interface AuditEntry {
  id: string;
  admin_id: string;
  action: string;
  target_type: string;
  target_id: string | null;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  created_at: string;
  admin_name?: string;
}

const PAGE_SIZE = 20;

export default function AdminLeaderboardPage() {
  const [records, setRecords] = useState<ScoreRecord[]>([]);
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [gameweekFilter, setGameweekFilter] = useState<number | null>(null);
  const [gameweeks, setGameweeks] = useState<number[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPoints, setEditPoints] = useState(0);
  const [editReason, setEditReason] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();
  const [auditPage, setAuditPage] = useState(0);
  const [hasMoreAudit, setHasMoreAudit] = useState(true);

  function loadData(gw?: number | null) {
    const supabase = createClient();
    {

      // Get active season first
      void supabase
        .from('seasons')
        .select('id')
        .eq('is_active', true)
        .single()
        .then(({ data: season }) => {
          if (!season) return;

          // Load available gameweeks
          void supabase
            .from('fixtures')
            .select('gameweek')
            .eq('season_id', season.id)
            .eq('status', 'FINISHED')
            .order('gameweek', { ascending: false })
            .then(({ data }) => {
              const unique = [...new Set(data?.map((g) => g.gameweek))].sort((a, b) => b - a);
              setGameweeks(unique);
              // Load records for selected gameweek (or latest)
              const targetGw = gw ?? unique[0] ?? null;
              if (targetGw !== null) {
                setGameweekFilter(targetGw);
                loadRecordsForGameweek(supabase, season.id, targetGw);
              }
            });

          // Load leaderboard edit audit entries
          void supabase
            .from('admin_audit_log')
            .select('*')
            .eq('action', 'EDIT_SCORE_RECORD')
            .order('created_at', { ascending: false })
            .range(0, PAGE_SIZE - 1)
            .then(({ data }) => {
              // Enrich with admin names
              const adminIds = [...new Set(data?.map((e) => e.admin_id))];
              if (adminIds.length > 0) {
                void supabase
                  .from('profiles')
                  .select('id, display_name')
                  .in('id', adminIds)
                  .then(({ data: profiles }) => {
                    const nameMap = new Map(profiles?.map((p) => [p.id, p.display_name]));
                    setAuditLog(
                      (data ?? []).map((e) => ({
                        id: e.id,
                        admin_id: e.admin_id,
                        action: e.action,
                        target_type: e.target_type,
                        target_id: e.target_id,
                        old_value: e.old_value as Record<string, unknown> | null,
                        new_value: e.new_value as Record<string, unknown> | null,
                        created_at: e.created_at,
                        admin_name: nameMap.get(e.admin_id) ?? 'Admin',
                      })),
                    );
                  });
              } else {
                setAuditLog(
                  (data ?? []).map((e) => ({
                    id: e.id,
                    admin_id: e.admin_id,
                    action: e.action,
                    target_type: e.target_type,
                    target_id: e.target_id,
                    old_value: e.old_value as Record<string, unknown> | null,
                    new_value: e.new_value as Record<string, unknown> | null,
                    created_at: e.created_at,
                  })),
                );
              }
              setHasMoreAudit((data?.length ?? 0) === PAGE_SIZE);
              setLoaded(true);
            });
        });
    }
  }

  function loadRecordsForGameweek(supabase: SupabaseClient<Database>, seasonId: string, gw: number) {
    void supabase
      .from('score_records')
      .select(`
        id, user_id, fixture_id, points_awarded, reason_code,
        is_star_game, manually_edited, predicted_home, predicted_away,
        actual_home, actual_away,
        profiles!score_records_user_id_fkey ( display_name ),
        fixtures!score_records_fixture_id_fkey ( home_team, away_team, gameweek )
      `)
      .eq('fixtures.season_id', seasonId)
      .eq('fixtures.gameweek', gw)
      .order('points_awarded', { ascending: false })
      .then(({ data }) => {
        type Row = NonNullable<typeof data>[number];
        // Filter out rows where the fixture join returned null (different season/gw)
        const mapped: ScoreRecord[] = (data ?? [] as Row[])
          .filter((r) => r.fixtures !== null)
          .map((r) => ({
            id: r.id,
            user_id: r.user_id,
            fixture_id: r.fixture_id,
            points_awarded: r.points_awarded,
            reason_code: r.reason_code,
            is_star_game: r.is_star_game,
            manually_edited: r.manually_edited,
            predicted_home: r.predicted_home,
            predicted_away: r.predicted_away,
            actual_home: r.actual_home,
            actual_away: r.actual_away,
            display_name: (r.profiles as unknown as { display_name: string } | null)?.display_name ?? 'Unknown',
            home_team: (r.fixtures as unknown as { home_team: string } | null)?.home_team ?? '',
            away_team: (r.fixtures as unknown as { away_team: string } | null)?.away_team ?? '',
            gameweek: (r.fixtures as unknown as { gameweek: number } | null)?.gameweek ?? gw,
          }));
        setRecords(mapped);
      });
  }

  if (!loaded) {
    loadData();
  }

  function handleGameweekChange(gw: number) {
    setGameweekFilter(gw);
    setEditingId(null);
    const supabase = createClient();
    void supabase
        .from('seasons')
        .select('id')
        .eq('is_active', true)
        .single()
        .then(({ data: season }) => {
          if (season) loadRecordsForGameweek(supabase, season.id, gw);
        });
  }

  function startEdit(record: ScoreRecord) {
    setEditingId(record.id);
    setEditPoints(record.points_awarded);
    setEditReason('');
  }

  function cancelEdit() {
    setEditingId(null);
    setEditReason('');
  }

  function handleSaveEdit(recordId: string) {
    if (!editReason.trim()) {
      setMessage({ type: 'error', text: 'A reason is required for all edits.' });
      return;
    }
    setMessage(null);
    startTransition(async () => {
      const result = await editScoreRecord(recordId, editPoints, editReason.trim());
      if (result.error) {
        setMessage({ type: 'error', text: result.error });
      } else {
        setMessage({ type: 'success', text: 'Score record updated successfully.' });
        setEditingId(null);
        setEditReason('');
        setLoaded(false);
      }
    });
  }

  function loadMoreAudit() {
    const nextPage = auditPage + 1;
    const supabase = createClient();
    const from = nextPage * PAGE_SIZE;
    void supabase
        .from('admin_audit_log')
        .select('*')
        .eq('action', 'EDIT_SCORE_RECORD')
        .order('created_at', { ascending: false })
        .range(from, from + PAGE_SIZE - 1)
        .then(({ data }) => {
          setAuditLog((prev) => [
            ...prev,
            ...(data ?? []).map((e) => ({
              id: e.id,
              admin_id: e.admin_id,
              action: e.action,
              target_type: e.target_type,
              target_id: e.target_id,
              old_value: e.old_value as Record<string, unknown> | null,
              new_value: e.new_value as Record<string, unknown> | null,
              created_at: e.created_at,
            })),
          ]);
          setHasMoreAudit((data?.length ?? 0) === PAGE_SIZE);
          setAuditPage(nextPage);
        });
  }

  return (
    <div className="space-y-6">
      <h2 className="text-h2 text-text-primary">Leaderboard Management</h2>

      {message && (
        <Alert variant={message.type === 'success' ? 'success' : 'error'}>
          {message.text}
        </Alert>
      )}

      {/* Score Records Editor */}
      <Card>
        <CardHeader>
          <CardTitle>
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-accent" aria-hidden="true" />
              Score Records
            </div>
          </CardTitle>
          {gameweeks.length > 0 && (
            <select
              value={gameweekFilter ?? ''}
              onChange={(e) => handleGameweekChange(Number(e.target.value))}
              className="rounded-input border border-border bg-bg-secondary px-3 py-1.5 text-body-sm text-text-primary"
              aria-label="Select gameweek"
            >
              {gameweeks.map((gw) => (
                <option key={gw} value={gw}>
                  Gameweek {gw}
                </option>
              ))}
            </select>
          )}
        </CardHeader>

        {records.length === 0 ? (
          <p className="py-4 text-center text-sm text-text-secondary">
            No score records for this gameweek.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="pb-2 pr-3 font-medium text-text-secondary">Player</th>
                  <th className="pb-2 pr-3 font-medium text-text-secondary">Fixture</th>
                  <th className="pb-2 pr-3 font-medium text-text-secondary">Prediction</th>
                  <th className="pb-2 pr-3 font-medium text-text-secondary">Actual</th>
                  <th className="pb-2 pr-3 font-medium text-text-secondary">Points</th>
                  <th className="pb-2 pr-3 font-medium text-text-secondary">Reason</th>
                  <th className="pb-2 font-medium text-text-secondary">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {records.map((record) => (
                  <tr key={record.id} className={record.manually_edited ? 'bg-warning-muted/30' : ''}>
                    <td className="py-2 pr-3 font-medium text-text-primary">
                      {record.display_name}
                      {record.manually_edited && (
                        <Badge variant="warning" className="ml-1.5 text-[10px]">
                          Edited
                        </Badge>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-text-secondary">
                      {record.home_team} vs {record.away_team}
                      {record.is_star_game && (
                        <span className="ml-1 text-gold">★</span>
                      )}
                    </td>
                    <td className="py-2 pr-3 tabular-nums text-text-secondary">
                      {record.predicted_home !== null
                        ? `${record.predicted_home}-${record.predicted_away}`
                        : '—'}
                    </td>
                    <td className="py-2 pr-3 tabular-nums text-text-secondary">
                      {record.actual_home}-{record.actual_away}
                    </td>
                    <td className="py-2 pr-3">
                      {editingId === record.id ? (
                        <input
                          type="number"
                          min={0}
                          max={20}
                          value={editPoints}
                          onChange={(e) => setEditPoints(Number(e.target.value))}
                          className="w-16 rounded-input border border-border bg-bg-secondary px-2 py-1 text-body-sm text-text-primary"
                          aria-label="New points"
                        />
                      ) : (
                        <span className="font-bold tabular-nums text-accent">
                          {record.points_awarded}
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-3">
                      <Badge variant="default">{record.reason_code}</Badge>
                    </td>
                    <td className="py-2">
                      {editingId === record.id ? (
                        <div className="flex flex-col gap-2">
                          <Input
                            placeholder="Reason for edit (required)"
                            value={editReason}
                            onChange={(e) => setEditReason(e.target.value)}
                            className="text-xs"
                          />
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              onClick={() => handleSaveEdit(record.id)}
                              loading={isPending}
                              aria-label="Save edit"
                            >
                              <Check className="h-3 w-3" />
                              Save
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={cancelEdit}
                              disabled={isPending}
                              aria-label="Cancel edit"
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => startEdit(record)}
                          aria-label={`Edit ${record.display_name}'s score`}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Leaderboard Edit History */}
      <Card>
        <CardHeader>
          <CardTitle>
            <div className="flex items-center gap-2">
              <History className="h-4 w-4 text-accent" aria-hidden="true" />
              Edit History
            </div>
          </CardTitle>
          <Badge>{auditLog.length}{hasMoreAudit ? '+' : ''}</Badge>
        </CardHeader>
        {auditLog.length === 0 ? (
          <p className="py-4 text-center text-sm text-text-secondary">
            No leaderboard edits yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="pb-2 pr-3 font-medium text-text-secondary">Admin</th>
                  <th className="pb-2 pr-3 font-medium text-text-secondary">Player</th>
                  <th className="pb-2 pr-3 font-medium text-text-secondary">Fixture</th>
                  <th className="pb-2 pr-3 font-medium text-text-secondary">Old Pts</th>
                  <th className="pb-2 pr-3 font-medium text-text-secondary">New Pts</th>
                  <th className="pb-2 pr-3 font-medium text-text-secondary">Reason</th>
                  <th className="pb-2 font-medium text-text-secondary">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {auditLog.map((entry) => (
                  <tr key={entry.id}>
                    <td className="py-2 pr-3 text-text-primary">
                      {entry.admin_name ?? 'Admin'}
                    </td>
                    <td className="py-2 pr-3 font-medium text-text-primary">
                      {(entry.old_value?.display_name as string) ?? '—'}
                    </td>
                    <td className="py-2 pr-3 text-text-secondary">
                      {(entry.old_value?.fixture_label as string) ?? '—'}
                    </td>
                    <td className="py-2 pr-3 tabular-nums text-error">
                      {(entry.old_value?.points_awarded as number) ?? '—'}
                    </td>
                    <td className="py-2 pr-3 tabular-nums text-success font-bold">
                      {(entry.new_value?.points_awarded as number) ?? '—'}
                    </td>
                    <td className="py-2 pr-3 text-xs text-text-secondary max-w-[200px] truncate">
                      {(entry.new_value?.reason as string) ?? '—'}
                    </td>
                    <td className="py-2 whitespace-nowrap text-xs text-text-secondary">
                      {new Date(entry.created_at).toLocaleString('en-GB')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {hasMoreAudit && (
          <div className="mt-3 text-center">
            <Button variant="ghost" size="sm" onClick={loadMoreAudit}>
              Load More
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
