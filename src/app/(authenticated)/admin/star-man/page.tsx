'use client';

import { useState, useTransition, useEffect } from 'react';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import {
  createVotingSession,
  addNominee,
  removeNominee,
  openVoting,
  closeVoting,
} from './actions';
import { Star, Plus, Trash2, Vote, Lock, Users, Award } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

interface Session {
  id: string;
  season_id: string;
  status: string;
  deadline: string;
  created_at: string;
}

interface Nominee {
  id: string;
  session_id: string;
  player_name: string;
  team_name: string;
}

interface VoteResult {
  nominee_id: string;
  player_name: string;
  team_name: string;
  vote_count: number;
  rank: number;
}

interface VoteWithProfile {
  id: string;
  user_id: string;
  nominee_id: string;
  voted_at: string;
  profiles: { display_name: string } | null;
  star_man_nominees: { player_name: string } | null;
}

export default function AdminStarManPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [nominees, setNominees] = useState<Nominee[]>([]);
  const [results, setResults] = useState<VoteResult[]>([]);
  const [votes, setVotes] = useState<VoteWithProfile[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [seasonName, setSeasonName] = useState('');
  const [playerName, setPlayerName] = useState('');
  const [teamName, setTeamName] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null,
  );
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (loaded) return;
    const supabase = createClient();
    {
      // Get active season
      void supabase
        .from('seasons')
        .select('id, name')
        .eq('is_active', true)
        .single()
        .then(async ({ data: seasonData }) => {
          if (!seasonData) {
            setSeasonName('');
            setLoaded(true);
            return;
          }
          setSeasonName(seasonData.name);

          // Get session for this season
          const { data: sessionData } = await supabase
            .from('star_man_sessions')
            .select('*')
            .eq('season_id', seasonData.id)
            .single();

          if (sessionData) {
            setSession({
              id: sessionData.id,
              season_id: sessionData.season_id,
              status: sessionData.status,
              deadline: sessionData.deadline,
              created_at: sessionData.created_at,
            });
          } else {
            setSession(null);
          }

          if (sessionData) {
            // Get nominees
            const { data: nomineesData } = await supabase
              .from('star_man_nominees')
              .select('*')
              .eq('session_id', sessionData.id)
              .order('player_name', { ascending: true });

            setNominees(
              (nomineesData ?? []).map((n) => ({
                id: n.id,
                session_id: n.session_id,
                player_name: n.player_name,
                team_name: n.team_name,
              })),
            );

            // Get results if open or closed
            if (sessionData.status === 'OPEN' || sessionData.status === 'CLOSED') {
              const { data: resultsData } = await supabase.rpc('get_star_man_results', {
                p_session_id: sessionData.id,
              });
              setResults((resultsData as VoteResult[]) ?? []);

              // Get individual votes with voter names
              const { data: votesData } = await supabase
                .from('star_man_votes')
                .select('id, user_id, nominee_id, voted_at, profiles(display_name), star_man_nominees(player_name)')
                .eq('session_id', sessionData.id)
                .order('voted_at', { ascending: false });

              setVotes((votesData as unknown as VoteWithProfile[]) ?? []);
            }
          }

          setLoaded(true);
        });
    }
  }, [loaded]);

  function handleCreateSession() {
    setMessage(null);
    startTransition(async () => {
      const result = await createVotingSession();
      if (result.error) {
        setMessage({ type: 'error', text: result.error });
      } else {
        setMessage({ type: 'success', text: 'Voting session created.' });
        setLoaded(false);
      }
    });
  }

  function handleAddNominee(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!session || !playerName.trim() || !teamName.trim()) return;

    setMessage(null);
    startTransition(async () => {
      const formData = new FormData();
      formData.set('sessionId', session.id);
      formData.set('playerName', playerName.trim());
      formData.set('teamName', teamName.trim());

      const result = await addNominee(formData);
      if (result.error) {
        setMessage({ type: 'error', text: result.error });
      } else {
        setMessage({ type: 'success', text: `${playerName.trim()} added as nominee.` });
        setPlayerName('');
        setTeamName('');
        setLoaded(false);
      }
    });
  }

  function handleRemoveNominee(nomineeId: string, name: string) {
    if (!session) return;
    setMessage(null);
    startTransition(async () => {
      const formData = new FormData();
      formData.set('nomineeId', nomineeId);
      formData.set('sessionId', session.id);

      const result = await removeNominee(formData);
      if (result.error) {
        setMessage({ type: 'error', text: result.error });
      } else {
        setMessage({ type: 'success', text: `${name} removed.` });
        setLoaded(false);
      }
    });
  }

  function handleOpenVoting() {
    if (!session) return;
    setMessage(null);
    startTransition(async () => {
      const formData = new FormData();
      formData.set('sessionId', session.id);

      const result = await openVoting(formData);
      if (result.error) {
        setMessage({ type: 'error', text: result.error });
      } else {
        setMessage({ type: 'success', text: 'Voting is now open!' });
        setLoaded(false);
      }
    });
  }

  function handleCloseVoting() {
    if (!session) return;
    setMessage(null);
    startTransition(async () => {
      const formData = new FormData();
      formData.set('sessionId', session.id);

      const result = await closeVoting(formData);
      if (result.error) {
        setMessage({ type: 'error', text: result.error });
      } else {
        setMessage({ type: 'success', text: 'Voting has been closed.' });
        setLoaded(false);
      }
    });
  }

  const totalVotes = results.reduce((sum, r) => sum + r.vote_count, 0);

  return (
    <div className="space-y-6">
      <h2 className="text-h2 text-text-primary">Star Man Voting</h2>

      {message && (
        <Alert variant={message.type === 'success' ? 'success' : 'error'}>
          {message.text}
        </Alert>
      )}

      {!loaded ? (
        <p className="py-4 text-center text-sm text-text-secondary">Loading…</p>
      ) : !session ? (
        /* No session — create one */
        <Card>
          <div className="flex flex-col items-center gap-4 py-6 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-surface-elevated">
              <Star className="h-7 w-7 text-text-tertiary" aria-hidden="true" />
            </div>
            <div className="space-y-1">
              <h3 className="text-h3 text-text-primary">No Voting Session</h3>
              <p className="text-body-sm text-text-secondary">
                {seasonName
                  ? `Create a Star Man voting session for the ${seasonName} season.`
                  : 'No active season. Start a season first.'}
              </p>
            </div>
            {seasonName && (
              <Button onClick={handleCreateSession} disabled={isPending} loading={isPending}>
                <Plus className="h-4 w-4" aria-hidden="true" />
                Create Voting Session
              </Button>
            )}
          </div>
        </Card>
      ) : (
        <>
          {/* Session info */}
          <Card>
            <CardHeader>
              <CardTitle>
                <div className="flex items-center gap-2">
                  <Star className="h-4 w-4 text-gold" aria-hidden="true" />
                  Session
                </div>
              </CardTitle>
              <Badge
                variant={
                  session.status === 'OPEN'
                    ? 'success'
                    : session.status === 'CLOSED'
                      ? 'error'
                      : 'default'
                }
              >
                {session.status}
              </Badge>
            </CardHeader>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-text-secondary">Season</span>
                <span className="font-medium text-text-primary">{seasonName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-secondary">Deadline</span>
                <span className="font-medium text-text-primary">
                  {new Date(session.deadline).toLocaleString('en-GB')}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-secondary">Nominees</span>
                <span className="font-medium text-text-primary">{nominees.length}</span>
              </div>
              {(session.status === 'OPEN' || session.status === 'CLOSED') && (
                <div className="flex justify-between">
                  <span className="text-text-secondary">Total Votes</span>
                  <span className="font-medium text-text-primary">{totalVotes}</span>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="mt-4 flex gap-2">
              {session.status === 'DRAFT' && (
                <Button
                  onClick={handleOpenVoting}
                  disabled={isPending || nominees.length < 2}
                  loading={isPending}
                  size="sm"
                >
                  <Vote className="h-4 w-4" aria-hidden="true" />
                  Open Voting
                </Button>
              )}
              {session.status === 'OPEN' && (
                <Button
                  onClick={handleCloseVoting}
                  disabled={isPending}
                  loading={isPending}
                  variant="danger"
                  size="sm"
                >
                  <Lock className="h-4 w-4" aria-hidden="true" />
                  Close Voting
                </Button>
              )}
            </div>
          </Card>

          {/* Nominees management */}
          <Card>
            <CardHeader>
              <CardTitle>
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-accent" aria-hidden="true" />
                  Nominees ({nominees.length})
                </div>
              </CardTitle>
            </CardHeader>

            {/* Add nominee form (only DRAFT and OPEN) */}
            {session.status !== 'CLOSED' && (
              <form onSubmit={handleAddNominee} className="mb-4 flex flex-wrap items-end gap-2">
                <Input
                  label="Player Name"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  placeholder="e.g. Mohamed Salah"
                  className="w-40 flex-1"
                  required
                />
                <Input
                  label="Team"
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  placeholder="e.g. Liverpool"
                  className="w-32 flex-1"
                  required
                />
                <Button
                  type="submit"
                  size="sm"
                  disabled={isPending || !playerName.trim() || !teamName.trim()}
                  loading={isPending}
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Add
                </Button>
              </form>
            )}

            {/* Nominee list */}
            <div className="space-y-2">
              {nominees.length === 0 ? (
                <p className="py-4 text-center text-sm text-text-secondary">
                  No nominees yet. Add at least 2 to open voting.
                </p>
              ) : (
                nominees.map((nominee) => {
                  const voteResult = results.find((r) => r.nominee_id === nominee.id);
                  return (
                    <div
                      key={nominee.id}
                      className="flex items-center justify-between gap-2 rounded-input border border-border-subtle bg-surface-elevated/30 p-3"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-body-sm font-medium text-text-primary">
                          {nominee.player_name}
                        </p>
                        <p className="text-xs text-text-secondary">{nominee.team_name}</p>
                      </div>
                      {voteResult && (
                        <Badge variant="points">
                          {voteResult.vote_count} vote{voteResult.vote_count !== 1 ? 's' : ''}
                        </Badge>
                      )}
                      {session.status === 'DRAFT' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveNominee(nominee.id, nominee.player_name)}
                          disabled={isPending}
                          aria-label={`Remove ${nominee.player_name}`}
                        >
                          <Trash2 className="h-4 w-4 text-error" aria-hidden="true" />
                        </Button>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </Card>

          {/* Vote results (OPEN or CLOSED) */}
          {(session.status === 'OPEN' || session.status === 'CLOSED') && results.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>
                  <div className="flex items-center gap-2">
                    <Award className="h-4 w-4 text-gold" aria-hidden="true" />
                    Vote Results
                  </div>
                </CardTitle>
                <Badge variant="default">{totalVotes} total</Badge>
              </CardHeader>
              <div className="space-y-2">
                {results.map((entry) => {
                  const percentage =
                    totalVotes > 0 ? Math.round((entry.vote_count / totalVotes) * 100) : 0;
                  return (
                    <div
                      key={entry.nominee_id}
                      className={`flex items-center gap-3 rounded-input p-3 ${
                        entry.rank === 1 ? 'bg-gold-muted/30' : 'bg-surface-elevated/30'
                      }`}
                    >
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-elevated text-caption font-bold text-text-secondary">
                        {entry.rank}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-body-sm font-medium text-text-primary">
                          {entry.player_name}
                        </p>
                        <p className="text-xs text-text-secondary">{entry.team_name}</p>
                        <div className="mt-1.5 h-1.5 w-full rounded-full bg-surface-elevated">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${
                              entry.rank === 1 ? 'bg-gold' : 'bg-accent/60'
                            }`}
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-body-sm font-bold tabular-nums text-text-primary">
                          {entry.vote_count}
                        </p>
                        <p className="text-xs tabular-nums text-text-secondary">{percentage}%</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

          {/* Individual votes with voter names (OPEN or CLOSED) */}
          {(session.status === 'OPEN' || session.status === 'CLOSED') && votes.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-accent" aria-hidden="true" />
                    Individual Votes
                  </div>
                </CardTitle>
              </CardHeader>
              <div className="space-y-1">
                {votes.map((vote) => (
                  <div
                    key={vote.id}
                    className="flex items-center justify-between rounded-input px-3 py-2 text-sm hover:bg-surface-elevated/30"
                  >
                    <span className="font-medium text-text-primary">
                      {(vote.profiles as { display_name: string } | null)?.display_name ?? 'Unknown'}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-text-secondary">
                        voted for{' '}
                        <span className="font-medium text-accent">
                          {(vote.star_man_nominees as { player_name: string } | null)?.player_name ?? 'Unknown'}
                        </span>
                      </span>
                      <span className="text-xs text-text-tertiary">
                        {new Date(vote.voted_at).toLocaleString('en-GB', {
                          day: 'numeric',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
