'use client';
import { useState, useTransition } from 'react';
import { setFixtureStatus } from '../../actions';

interface Props {
  fixtureId: string;
  onSuccess: () => void;
  onError: (msg: string) => void;
}

export function PostponeButton({ fixtureId, onSuccess, onError }: Props) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleConfirm() {
    startTransition(async () => {
      const result = await setFixtureStatus(fixtureId, 'POSTPONED');
      if (result.error) onError(result.error);
      else { setConfirmOpen(false); onSuccess(); }
    });
  }

  if (!confirmOpen) {
    return (
      <button
        onClick={() => setConfirmOpen(true)}
        className="text-xs px-2 py-1 rounded border border-amber-500/40 text-amber-400 hover:bg-amber-500/10 transition-colors"
        type="button"
      >
        ⏸ Postpone
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-amber-300">Postpone?</span>
      <button
        onClick={handleConfirm}
        disabled={isPending}
        className="text-xs px-2 py-1 rounded bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 disabled:opacity-50 transition-colors"
        type="button"
      >
        {isPending ? '...' : 'Confirm'}
      </button>
      <button
        onClick={() => setConfirmOpen(false)}
        disabled={isPending}
        className="text-xs px-2 py-1 rounded text-slate-400 hover:text-slate-200 transition-colors"
        type="button"
      >
        Cancel
      </button>
    </div>
  );
}
