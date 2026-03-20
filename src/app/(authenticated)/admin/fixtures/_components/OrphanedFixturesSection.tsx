'use client';
import { useState } from 'react';
import { ManageFixturePanel } from './ManageFixturePanel';

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
  fixtures: Fixture[];
  onSuccess: () => void;
  onError: (msg: string) => void;
}

export function OrphanedFixturesSection({ fixtures, onSuccess, onError }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-6">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 text-sm font-medium text-slate-300 hover:text-white transition-colors"
        type="button"
        aria-expanded={open}
        aria-controls="postponed-section"
      >
        <span>{open ? '▾' : '▸'}</span>
        <span>Postponed &amp; Cancelled ({fixtures.length})</span>
      </button>

      {open && (
        <div id="postponed-section" className="mt-3 space-y-3" role="region">
          {fixtures.map((fixture) => (
            <div key={fixture.id} className="rounded-lg border border-slate-700 p-4 bg-slate-800/50">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-white font-medium">
                  {fixture.home_team} vs {fixture.away_team}
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-xs px-2 py-0.5 rounded-full bg-slate-700 text-slate-300">
                    GW{fixture.gameweek}
                  </span>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full ${
                      fixture.status === 'POSTPONED'
                        ? 'bg-amber-500/20 text-amber-300'
                        : 'bg-red-500/20 text-red-300'
                    }`}
                  >
                    {fixture.status}
                  </span>
                  {fixture.manually_overridden && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300">
                      Manual
                    </span>
                  )}
                </div>
              </div>
              <ManageFixturePanel
                fixture={fixture}
                onSuccess={onSuccess}
                onError={onError}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
