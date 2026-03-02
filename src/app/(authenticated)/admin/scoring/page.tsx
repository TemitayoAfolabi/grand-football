'use client';

import { useState, useTransition } from 'react';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { recalculateScores } from '../actions';
import { AlertTriangle, Calculator, RefreshCw } from 'lucide-react';

interface AuditEntry {
  id: string;
  admin_id: string;
  action: string;
  target_type: string;
  target_id: string | null;
  old_value: unknown;
  new_value: unknown;
  created_at: string;
}

interface FinishedFixture {
  id: string;
  home_team: string;
  away_team: string;
  gameweek: number;
}

const PAGE_SIZE = 20;

export default function AdminScoringPage() {
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([]);
  const [finishedFixtures, setFinishedFixtures] = useState<FinishedFixture[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!loaded) {
    void import('@supabase/ssr').then(({ createBrowserClient }) => {
      const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      );
      // Load audit log
      void supabase
        .from('admin_audit_log')
        .select('*')
        .order('created_at', { ascending: false })
        .range(0, PAGE_SIZE - 1)
        .then(({ data }) => {
          setAuditLog((data as AuditEntry[]) ?? []);
          setHasMore((data?.length ?? 0) === PAGE_SIZE);
        });
      // Load finished fixtures for per-fixture recalculation
      void supabase
        .from('fixtures')
        .select('id, home_team, away_team, gameweek')
        .eq('status', 'FINISHED')
        .order('kickoff_time', { ascending: false })
        .limit(50)
        .then(({ data }) => {
          setFinishedFixtures((data as FinishedFixture[]) ?? []);
          setLoaded(true);
        });
    });
  }

  function loadMore() {
    const nextPage = page + 1;
    void import('@supabase/ssr').then(({ createBrowserClient }) => {
      const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      );
      const from = nextPage * PAGE_SIZE;
      void supabase
        .from('admin_audit_log')
        .select('*')
        .order('created_at', { ascending: false })
        .range(from, from + PAGE_SIZE - 1)
        .then(({ data }) => {
          setAuditLog((prev) => [...prev, ...((data as AuditEntry[]) ?? [])]);
          setHasMore((data?.length ?? 0) === PAGE_SIZE);
          setPage(nextPage);
        });
    });
  }

  function handleRecalculate(fixtureId?: string) {
    const isAll = !fixtureId;
    const confirmMessage = isAll
      ? 'Are you sure you want to recalculate ALL fixtures?\n\n⚠️  This will re-score every finished fixture using the database scoring engine. Manually-edited records will be preserved, but any non-protected records will be overwritten.\n\nType "RECALCULATE ALL" to confirm.'
      : 'Are you sure you want to recalculate this fixture?\n\nManually-edited records will be preserved.';

    if (isAll) {
      const input = window.prompt(
        'This will recalculate scores for ALL finished fixtures.\n\n⚠️ Manually-edited records are protected, but non-protected records will be overwritten.\n\nType "RECALCULATE ALL" to confirm:',
      );
      if (input !== 'RECALCULATE ALL') {
        setMessage({ type: 'error', text: 'Recalculation cancelled — confirmation text did not match.' });
        return;
      }
    } else {
      if (!window.confirm(confirmMessage)) return;
    }

    setMessage(null);
    startTransition(async () => {
      const result = await recalculateScores(fixtureId);
      if (result.error) {
        setMessage({ type: 'error', text: result.error });
      } else {
        setMessage({
          type: 'success',
          text: `Recalculation complete. ${result.count ?? 0} records affected.`,
        });
        setLoaded(false);
      }
    });
  }

  return (
    <div className="space-y-6">
      <h2 className="text-h2 text-text-primary">Scoring Management</h2>

      {message && (
        <Alert variant={message.type === 'success' ? 'success' : 'error'}>
          {message.text}
        </Alert>
      )}

      {/* Actions */}
      <Card>
        <CardHeader>
          <CardTitle>
            <div className="flex items-center gap-2">
              <Calculator className="h-4 w-4 text-accent" aria-hidden="true" />
              Recalculate Scores
            </div>
          </CardTitle>
        </CardHeader>
        <div className="space-y-4">
          <div className="rounded-md border border-yellow-500/30 bg-yellow-500/10 p-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-yellow-500" aria-hidden="true" />
              <p className="text-body-sm text-yellow-200">
                <strong>Warning:</strong> Recalculating will re-score fixtures using the database scoring engine.
                Records marked as <em>manually_edited</em> are protected and won&apos;t be changed.
                Historical data (GW 1-28) is protected.
              </p>
            </div>
          </div>
          <Button
            onClick={() => handleRecalculate()}
            loading={isPending}
            className="w-full"
            variant="secondary"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Recalculate All Fixtures
          </Button>

          {finishedFixtures.length > 0 && (
            <div>
              <p className="mb-2 text-body-sm font-medium text-text-primary">Per Fixture:</p>
              <div className="max-h-60 space-y-2 overflow-y-auto">
                {finishedFixtures.map((f) => (
                  <div
                    key={f.id}
                    className="flex items-center justify-between rounded-input border border-border p-2"
                  >
                    <span className="text-body-sm text-text-primary">
                      GW{f.gameweek}: {f.home_team} vs {f.away_team}
                    </span>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => handleRecalculate(f.id)}
                      disabled={isPending}
                    >
                      Recalculate
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Audit Log */}
      <Card>
        <CardHeader>
          <CardTitle>Audit Log</CardTitle>
          <Badge>{auditLog.length}{hasMore ? '+' : ''}</Badge>
        </CardHeader>
        {auditLog.length === 0 ? (
          <p className="py-4 text-center text-sm text-text-secondary">
            No audit entries yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="pb-2 pr-3 font-medium text-text-secondary">Action</th>
                  <th className="pb-2 pr-3 font-medium text-text-secondary">Target</th>
                  <th className="pb-2 pr-3 font-medium text-text-secondary">Old</th>
                  <th className="pb-2 pr-3 font-medium text-text-secondary">New</th>
                  <th className="pb-2 font-medium text-text-secondary">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {auditLog.map((entry) => (
                  <tr key={entry.id}>
                    <td className="py-2 pr-3">
                      <Badge variant="default">{entry.action}</Badge>
                    </td>
                    <td className="py-2 pr-3 text-text-secondary">
                      {entry.target_type}
                      {entry.target_id ? ` (${entry.target_id.slice(0, 8)}…)` : ''}
                    </td>
                    <td className="py-2 pr-3 text-xs text-text-secondary">
                      {entry.old_value
                        ? JSON.stringify(entry.old_value).slice(0, 40)
                        : '—'}
                    </td>
                    <td className="py-2 pr-3 text-xs text-text-secondary">
                      {entry.new_value
                        ? JSON.stringify(entry.new_value).slice(0, 40)
                        : '—'}
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

        {hasMore && (
          <div className="mt-3 text-center">
            <Button variant="ghost" size="sm" onClick={loadMore}>
              Load More
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
