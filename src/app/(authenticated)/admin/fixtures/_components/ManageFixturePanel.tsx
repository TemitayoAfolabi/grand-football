'use client';
import { useState, useTransition } from 'react';
import { moveFixtureGameweek } from '../../actions';

const VALID_STATUSES = ['SCHEDULED', 'TIMED', 'POSTPONED'] as const;
type ValidStatus = (typeof VALID_STATUSES)[number];

interface Fixture {
  id: string;
  home_team: string;
  away_team: string;
  gameweek: number;
  status: string;
  kickoff_time: string;
  manually_overridden: boolean;
}

interface Props {
  fixture: Fixture;
  onSuccess: () => void;
  onError: (msg: string) => void;
}

/** Convert a UTC ISO string to a datetime-local input value (local time). */
function toDatetimeLocal(isoString: string): string {
  const d = new Date(isoString);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Return the calendar month name for an ISO or datetime-local string. */
function getMonthName(dateStr: string): string {
  return new Date(dateStr).toLocaleString('default', { month: 'long', year: 'numeric' });
}

export function ManageFixturePanel({ fixture, onSuccess, onError }: Props) {
  const initialStatus: ValidStatus = VALID_STATUSES.includes(fixture.status as ValidStatus)
    ? (fixture.status as ValidStatus)
    : 'SCHEDULED';

  const originalKickoffLocal = toDatetimeLocal(fixture.kickoff_time);

  const [open, setOpen] = useState(false);
  const [targetGw, setTargetGw] = useState(fixture.gameweek);
  const [newStatus, setNewStatus] = useState<string>(initialStatus);
  const [kickoffInput, setKickoffInput] = useState(originalKickoffLocal);
  const [confirmed, setConfirmed] = useState(false);
  const [isPending, startTransition] = useTransition();

  const gwMoved = targetGw !== fixture.gameweek;
  const kickoffChanged = kickoffInput !== originalKickoffLocal;
  const hasChanged = gwMoved || newStatus !== fixture.status || kickoffChanged;
  const canSave = confirmed && hasChanged && !isPending;

  // Detect if the new kickoff date is in a different calendar month
  const originalMonth = new Date(fixture.kickoff_time).getMonth();
  const newKickoffMonth = kickoffInput ? new Date(kickoffInput).getMonth() : originalMonth;
  const monthChanged = kickoffChanged && newKickoffMonth !== originalMonth;

  function handleToggle() {
    if (!open) {
      setTargetGw(fixture.gameweek);
      setNewStatus(initialStatus);
      setKickoffInput(originalKickoffLocal);
      setConfirmed(false);
    }
    setOpen(!open);
  }

  function handleGwChange(val: number) {
    setTargetGw(val);
    setConfirmed(false);
  }

  function handleStatusChange(val: string) {
    setNewStatus(val);
    setConfirmed(false);
  }

  function handleKickoffChange(val: string) {
    setKickoffInput(val);
    setConfirmed(false);
  }

  function handleSave() {
    startTransition(async () => {
      const kickoffIso = kickoffChanged ? new Date(kickoffInput).toISOString() : undefined;
      const result = await moveFixtureGameweek(fixture.id, targetGw, newStatus, kickoffIso);
      if (result.error) {
        onError(result.error);
      } else {
        setOpen(false);
        setConfirmed(false);
        onSuccess();
      }
    });
  }

  return (
    <div>
      <button
        onClick={handleToggle}
        className="text-xs px-2 py-1 rounded border border-slate-600 text-slate-300 hover:bg-slate-700/50 transition-colors"
        type="button"
        aria-expanded={open}
        aria-controls={`manage-panel-${fixture.id}`}
      >
        {open ? 'Close ✕' : 'Manage ▾'}
      </button>

      {open && (
        <div
          id={`manage-panel-${fixture.id}`}
          className="mt-3 border-t border-border pt-3 space-y-3"
          role="region"
          aria-label={`Manage ${fixture.home_team} vs ${fixture.away_team}`}
        >
          <p className="text-xs font-medium text-text-primary">Manage Fixture</p>

          <div className="flex flex-wrap gap-4">
            {/* Gameweek input */}
            <div className="flex flex-col gap-1">
              <label
                htmlFor={`manage-gw-${fixture.id}`}
                className="text-xs font-medium text-text-secondary"
              >
                Gameweek
              </label>
              <input
                id={`manage-gw-${fixture.id}`}
                type="number"
                min={1}
                max={50}
                value={targetGw}
                onChange={(e) => handleGwChange(Number(e.target.value))}
                className="w-20 rounded-input border border-border bg-bg-secondary px-2 py-1.5 text-sm text-text-primary focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
              />
            </div>

            {/* Status select */}
            <div className="flex flex-col gap-1">
              <label
                htmlFor={`manage-status-${fixture.id}`}
                className="text-xs font-medium text-text-secondary"
              >
                Status
              </label>
              <select
                id={`manage-status-${fixture.id}`}
                value={newStatus}
                onChange={(e) => handleStatusChange(e.target.value)}
                className="rounded-input border border-border bg-bg-secondary px-2 py-1.5 text-sm text-text-primary focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
              >
                {VALID_STATUSES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            {/* Kickoff date/time input */}
            <div className="flex flex-col gap-1">
              <label
                htmlFor={`manage-kickoff-${fixture.id}`}
                className="text-xs font-medium text-text-secondary"
              >
                Kickoff Date &amp; Time
              </label>
              <input
                id={`manage-kickoff-${fixture.id}`}
                type="datetime-local"
                value={kickoffInput}
                onChange={(e) => handleKickoffChange(e.target.value)}
                className="rounded-input border border-border bg-bg-secondary px-2 py-1.5 text-sm text-text-primary focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
              />
            </div>
          </div>

          {/* Month-change warning — affects monthly bonus count */}
          {monthChanged && (
            <div
              role="alert"
              aria-live="polite"
              className="rounded border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-xs text-amber-300"
            >
              <strong>Monthly bonus affected:</strong> Moving the kickoff from{' '}
              <strong>{getMonthName(fixture.kickoff_time)}</strong> to{' '}
              <strong>{getMonthName(kickoffInput)}</strong> will reduce {getMonthName(fixture.kickoff_time)}&apos;s
              required fixture count by 1. Users who predicted all other {getMonthName(fixture.kickoff_time)} games
              will still earn the +10 bonus.
            </div>
          )}

          {/* GW move info banner */}
          {gwMoved && !monthChanged && (
            <div
              role="alert"
              aria-live="polite"
              className="rounded border border-blue-500/50 bg-blue-500/10 px-3 py-2 text-xs text-blue-300"
            >
              Predictions for this fixture will follow it to GW {targetGw} and remain editable until that gameweek&apos;s deadline.
              The monthly bonus count is unchanged — update the kickoff date too if the game has moved to a different month.
            </div>
          )}

          {/* Confirmation checkbox */}
          <label className="flex items-center gap-2 text-xs text-text-secondary cursor-pointer select-none">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="rounded border-border"
              aria-required="true"
            />
            I confirm this change
          </label>

          {/* Action buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleSave}
              disabled={!canSave}
              type="button"
              className="text-xs px-3 py-1.5 rounded font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 bg-accent/20 text-accent hover:bg-accent/30"
            >
              {isPending ? '...' : 'Apply Changes'}
            </button>
            <button
              onClick={() => setOpen(false)}
              disabled={isPending}
              type="button"
              className="text-xs px-3 py-1.5 rounded text-text-tertiary hover:text-text-primary transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
