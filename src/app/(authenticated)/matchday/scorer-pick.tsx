'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { saveScorerPick } from './actions';
import { initialScorerPickActionState } from './mini-league-state';

export function ScorerPick({
  fixtureId,
  fixtureLabel,
  currentPick,
}: {
  fixtureId: string;
  fixtureLabel: string;
  currentPick: string;
}) {
  const [state, action] = useFormState(saveScorerPick, initialScorerPickActionState);

  return (
    <form action={action} className="flex flex-col gap-3 tablet:flex-row tablet:items-end">
      <input type="hidden" name="fixtureId" value={fixtureId} />
      <label className="flex-1 text-body-sm text-text-secondary">
        First scorer for {fixtureLabel}
        <input
          name="playerName"
          defaultValue={currentPick}
          required
          minLength={2}
          maxLength={60}
          placeholder="e.g. Bukayo Saka"
          className="mt-1 w-full rounded-input border border-border bg-bg-primary px-3 py-2 text-text-primary"
        />
      </label>
      <ScorerPickButton />
      {state.status !== 'idle' ? (
        <p
          className={
            state.status === 'success'
              ? 'text-caption text-success tablet:mb-2'
              : 'text-caption text-error tablet:mb-2'
          }
          role="status"
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

function ScorerPickButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-input bg-accent px-4 py-2 font-semibold text-text-inverse disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? 'Saving…' : 'Lock pick'}
    </button>
  );
}
