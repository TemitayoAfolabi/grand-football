'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronUp, X } from 'lucide-react';

interface LeaderboardEdit {
  id: string;
  old_value: {
    display_name?: string;
    fixture_label?: string;
    points_awarded?: number;
  } | null;
  new_value: {
    display_name?: string;
    fixture_label?: string;
    points_awarded?: number;
    reason?: string;
    season_id?: string;
  } | null;
  created_at: string;
}

interface LeaderboardAuditBannerProps {
  seasonId: string;
}

function dismissKey(seasonId: string, latestEditId: string) {
  return `leaderboard-audit-dismissed:${seasonId}:${latestEditId}`;
}

export function LeaderboardAuditBanner({ seasonId }: LeaderboardAuditBannerProps) {
  const [edits, setEdits] = useState<LeaderboardEdit[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const supabase = createClient();

  useEffect(() => {
    if (loaded) return;
    void supabase
      .from('admin_audit_log')
      .select('id, old_value, new_value, created_at')
      .eq('action', 'EDIT_SCORE_RECORD')
      .order('created_at', { ascending: false })
      .limit(50)
      .then(({ data }) => {
        // Filter to only edits for this season (season_id stored in new_value)
        const filtered = (data ?? []).filter((e) => {
          const nv = e.new_value as LeaderboardEdit['new_value'];
          return nv?.season_id === seasonId;
        }) as LeaderboardEdit[];
        setEdits(filtered);

        // Check if the user has already dismissed this set of corrections
        const latest = filtered[0];
        if (latest) {
          const key = dismissKey(seasonId, latest.id);
          setDismissed(localStorage.getItem(key) === 'true');
        }

        setLoaded(true);
      });
  }, [seasonId, supabase, loaded]);

  function handleDismiss() {
    const latest = edits[0];
    if (latest) {
      localStorage.setItem(dismissKey(seasonId, latest.id), 'true');
    }
    setDismissed(true);
  }

  if (!loaded || edits.length === 0 || dismissed) return null;

  return (
    <Alert variant="info" title="Leaderboard Corrections" className="relative">
      <button
        onClick={handleDismiss}
        aria-label="Dismiss leaderboard corrections notification"
        className="absolute right-3 top-3 rounded p-0.5 text-info/60 hover:bg-info/10 hover:text-info transition-colors"
      >
        <X className="h-4 w-4" />
      </button>
      <div className="space-y-2">
        <p>
          {edits.length} score correction{edits.length !== 1 ? 's have' : ' has'} been made this
          season by admins.
        </p>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setExpanded(!expanded)}
          className="text-info hover:text-info"
        >
          {expanded ? (
            <>
              <ChevronUp className="h-3.5 w-3.5" />
              Hide details
            </>
          ) : (
            <>
              <ChevronDown className="h-3.5 w-3.5" />
              View changes
            </>
          )}
        </Button>

        {expanded && (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-info/20 text-left">
                  <th className="pb-1.5 pr-3 font-medium text-text-secondary">Player</th>
                  <th className="pb-1.5 pr-3 font-medium text-text-secondary">Fixture</th>
                  <th className="pb-1.5 pr-3 font-medium text-text-secondary">Before</th>
                  <th className="pb-1.5 pr-3 font-medium text-text-secondary">After</th>
                  <th className="pb-1.5 pr-3 font-medium text-text-secondary">Reason</th>
                  <th className="pb-1.5 font-medium text-text-secondary">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-info/10">
                {edits.map((edit) => (
                  <tr key={edit.id}>
                    <td className="py-1.5 pr-3 font-medium text-text-primary">
                      {edit.old_value?.display_name ?? '—'}
                    </td>
                    <td className="py-1.5 pr-3 text-text-secondary">
                      {edit.old_value?.fixture_label ?? '—'}
                    </td>
                    <td className="py-1.5 pr-3 tabular-nums text-error line-through">
                      {edit.old_value?.points_awarded ?? '—'}pts
                    </td>
                    <td className="py-1.5 pr-3 tabular-nums text-success font-bold">
                      {edit.new_value?.points_awarded ?? '—'}pts
                    </td>
                    <td className="py-1.5 pr-3 text-text-secondary max-w-[200px] truncate">
                      {edit.new_value?.reason ?? '—'}
                    </td>
                    <td className="py-1.5 whitespace-nowrap text-text-secondary">
                      {new Date(edit.created_at).toLocaleDateString('en-GB')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Alert>
  );
}
