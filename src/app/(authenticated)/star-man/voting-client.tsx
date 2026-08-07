'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Countdown } from '@/components/countdown';
import { cn } from '@/lib/utils';
import { Star, CheckCircle, User } from 'lucide-react';
import { castVote } from './actions';

interface Nominee {
  id: string;
  player_name: string;
  team_name: string;
}

interface VotingClientProps {
  sessionId: string;
  nominees: Nominee[];
  deadline: string;
  existingVoteNomineeId: string | null;
}

export function VotingClient({
  sessionId,
  nominees,
  deadline,
  existingVoteNomineeId,
}: VotingClientProps) {
  const [selectedId, setSelectedId] = useState<string | null>(existingVoteNomineeId);
  const [hasVoted, setHasVoted] = useState(!!existingVoteNomineeId);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();
  const [expired, setExpired] = useState(false);

  function handleSubmit() {
    if (!selectedId) return;
    setMessage(null);

    startTransition(async () => {
      const formData = new FormData();
      formData.set('sessionId', sessionId);
      formData.set('nomineeId', selectedId);

      const result = await castVote(formData);
      if (result.error) {
        setMessage({ type: 'error', text: result.error });
      } else {
        const nominee = nominees.find((n) => n.id === selectedId);
        setMessage({
          type: 'success',
          text: `Vote submitted! You picked ${nominee?.player_name ?? 'your nominee'}.`,
        });
        setHasVoted(true);
      }
    });
  }

  const isChanging = hasVoted && selectedId !== existingVoteNomineeId;

  return (
    <div className="space-y-6">
      {/* Countdown */}
      <div className="flex flex-col gap-2 tablet:flex-row tablet:items-center tablet:justify-between">
        <p className="text-body-sm text-text-secondary">
          {hasVoted
            ? 'Your vote is in! You can change it until the deadline.'
            : 'Voting closes in:'}
        </p>
        <Countdown targetDate={deadline} onExpire={() => setExpired(true)} />
      </div>

      {message && (
        <Alert variant={message.type === 'success' ? 'success' : 'error'}>{message.text}</Alert>
      )}

      {/* Nominee cards */}
      <div className="grid grid-cols-1 gap-3 tablet:grid-cols-2">
        {nominees.map((nominee) => {
          const isSelected = selectedId === nominee.id;
          const isCurrentVote = hasVoted && existingVoteNomineeId === nominee.id;

          return (
            <button
              key={nominee.id}
              type="button"
              onClick={() => {
                if (!expired) setSelectedId(nominee.id);
              }}
              disabled={expired}
              className={cn(
                'relative flex items-center gap-3 rounded-card border p-4 pr-4 text-left transition-all duration-200',
                isSelected
                  ? 'border-accent bg-accent/10 shadow-glow-accent'
                  : 'border-border bg-surface hover:border-accent/30 hover:bg-surface-elevated/50',
                expired && 'cursor-not-allowed opacity-50',
              )}
              aria-pressed={isSelected}
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-elevated">
                <User className="h-5 w-5 text-text-tertiary" aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-body font-semibold text-text-primary">
                  {nominee.player_name}
                </p>
                <p className="truncate text-body-sm text-text-secondary">{nominee.team_name}</p>
              </div>
              {isSelected && (
                <CheckCircle className="h-5 w-5 shrink-0 text-accent" aria-hidden="true" />
              )}
              {isCurrentVote && (
                <Badge variant="success" className="shrink-0">
                  Your vote
                </Badge>
              )}
            </button>
          );
        })}
      </div>

      {/* Submit / Change Vote button */}
      {!expired && (!hasVoted || isChanging) && (
        <Button
          onClick={handleSubmit}
          disabled={!selectedId || isPending}
          loading={isPending}
          size="lg"
          className="w-full"
        >
          <Star className="h-4 w-4" aria-hidden="true" />
          {hasVoted ? 'Change Vote' : 'Submit Vote'}
        </Button>
      )}

      {hasVoted && !isChanging && !expired && (
        <div className="rounded-card border border-success/30 bg-success-muted p-4 text-center">
          <CheckCircle className="mx-auto mb-2 h-6 w-6 text-success" aria-hidden="true" />
          <p className="text-body-sm font-medium text-text-primary">Your vote has been recorded</p>
          <p className="mt-1 text-body-sm text-text-secondary">
            Tap a different nominee to change your vote.
          </p>
        </div>
      )}
    </div>
  );
}
