'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { Check, Copy } from 'lucide-react';
import { createMiniLeague, joinMiniLeague } from './actions';
import { initialMiniLeagueActionState } from './mini-league-state';

type League = {
  id: string;
  name: string;
  inviteCode: string;
  memberCount: number;
  leaders: Array<{ displayName: string; totalPoints: number; rank: number }>;
};

export function MiniLeagues({ leagues }: { leagues: League[] }) {
  const [createState, createAction] = useFormState(createMiniLeague, initialMiniLeagueActionState);
  const [joinState, joinAction] = useFormState(joinMiniLeague, initialMiniLeagueActionState);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const createFormRef = useRef<HTMLFormElement>(null);
  const joinFormRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (createState.status === 'success') createFormRef.current?.reset();
  }, [createState.status]);

  useEffect(() => {
    if (joinState.status === 'success') joinFormRef.current?.reset();
  }, [joinState.status]);

  async function copyInviteCode(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(code);
      window.setTimeout(() => setCopiedCode(null), 1600);
    } catch {
      setCopiedCode(null);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-body-sm text-text-secondary">
        Create a league, share its code, and compete against only its members. Rankings use the same
        confirmed season points as the main leaderboard.
      </p>

      {leagues.length ? (
        <div className="space-y-3">
          {leagues.map((league) => (
            <div key={league.id} className="rounded-input border border-border-subtle p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <span className="font-semibold text-text-primary">{league.name}</span>
                  <p className="mt-0.5 text-caption text-text-tertiary">
                    {league.memberCount} {league.memberCount === 1 ? 'player' : 'players'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void copyInviteCode(league.inviteCode)}
                  className="inline-flex items-center gap-1 rounded-input border border-border px-2 py-1 text-caption font-semibold text-accent hover:border-accent"
                  aria-label={`Copy ${league.name} invite code`}
                >
                  {copiedCode === league.inviteCode ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                  {copiedCode === league.inviteCode ? 'Copied' : league.inviteCode}
                </button>
              </div>
              <p className="mt-2 text-caption text-text-tertiary">
                {league.leaders.length
                  ? league.leaders
                      .map(
                        (leader) =>
                          `${leader.displayName} · ${leader.totalPoints} pts (overall #${leader.rank})`,
                      )
                      .join('  ·  ')
                  : 'Waiting for the first confirmed scores.'}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-input border border-dashed border-border p-3 text-body-sm text-text-secondary">
          You have not joined a mini-league yet. Create one below or enter a friend’s invite code.
        </div>
      )}

      <div className="grid gap-3 tablet:grid-cols-2">
        <form ref={createFormRef} action={createAction} className="space-y-2">
          <label
            htmlFor="mini-league-name"
            className="text-body-sm font-semibold text-text-primary"
          >
            Create a league
          </label>
          <div className="flex gap-2">
            <input
              id="mini-league-name"
              name="name"
              required
              minLength={3}
              maxLength={40}
              placeholder="e.g. North London XI"
              className="min-w-0 flex-1 rounded-input border border-border bg-bg-primary px-3 py-2 text-body-sm"
            />
            <SubmitButton>Create</SubmitButton>
          </div>
          <ActionMessage state={createState} />
        </form>

        <form ref={joinFormRef} action={joinAction} className="space-y-2">
          <label
            htmlFor="mini-league-code"
            className="text-body-sm font-semibold text-text-primary"
          >
            Join with an invite code
          </label>
          <div className="flex gap-2">
            <input
              id="mini-league-code"
              name="inviteCode"
              required
              minLength={8}
              maxLength={8}
              placeholder="AB12CD34"
              className="min-w-0 flex-1 rounded-input border border-border bg-bg-primary px-3 py-2 text-body-sm uppercase"
            />
            <SubmitButton>Join</SubmitButton>
          </div>
          <ActionMessage state={joinState} />
        </form>
      </div>
    </div>
  );
}

function SubmitButton({ children }: { children: ReactNode }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="min-w-20 rounded-input border border-accent px-3 text-body-sm font-semibold text-accent disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? 'Working…' : children}
    </button>
  );
}

function ActionMessage({
  state,
}: {
  state: { status: 'idle' | 'success' | 'error'; message: string };
}) {
  if (state.status === 'idle') return null;

  return (
    <p
      className={
        state.status === 'success' ? 'text-caption text-success' : 'text-caption text-error'
      }
    >
      {state.message}
    </p>
  );
}
