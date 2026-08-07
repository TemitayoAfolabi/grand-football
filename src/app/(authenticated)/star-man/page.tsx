import { createClient } from '@/lib/supabase/server';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/empty-state';
import { cn } from '@/lib/utils';
import { Star, Trophy, Award } from 'lucide-react';
import { VotingClient } from './voting-client';

export const metadata = {
  title: 'Star Man',
};

export default async function StarManPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const userId = user!.id;

  // Get active season
  const { data: season } = await supabase
    .from('seasons')
    .select('*')
    .eq('is_active', true)
    .single();

  if (!season) {
    return (
      <EmptyState
        icon={Star}
        title="No Active Season"
        description="Star Man voting will be available when a season is active."
      />
    );
  }

  // Get voting session for active season
  const { data: session } = await supabase
    .from('star_man_sessions')
    .select('*')
    .eq('season_id', season.id)
    .single();

  // No session or DRAFT — show empty state
  if (!session || session.status === 'DRAFT') {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-h1 text-text-primary">Star Man</h1>
          <p className="mt-1 text-body-sm text-text-secondary">{season.name} Season</p>
        </div>
        <EmptyState
          icon={Star}
          title="Voting Not Open Yet"
          description="The Star Man vote hasn't started yet. Check back soon!"
        />
      </div>
    );
  }

  // Get nominees
  const { data: nominees } = await supabase
    .from('star_man_nominees')
    .select('id, player_name, team_name')
    .eq('session_id', session.id)
    .order('player_name', { ascending: true });

  // OPEN status — show voting UI
  if (session.status === 'OPEN') {
    // Check if deadline has passed (server-side)
    const deadlinePassed = new Date(session.deadline) <= new Date();

    if (deadlinePassed) {
      // Deadline passed but session not yet closed by admin — show waiting state
      return (
        <div className="space-y-6">
          <div>
            <h1 className="text-h1 text-text-primary">Star Man</h1>
            <p className="mt-1 text-body-sm text-text-secondary">{season.name} Season</p>
          </div>
          <Card>
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <Star className="h-10 w-10 text-gold" aria-hidden="true" />
              <h2 className="text-h2 text-text-primary">Voting Has Ended</h2>
              <p className="text-body-sm text-text-secondary">Results will be revealed soon.</p>
            </div>
          </Card>
        </div>
      );
    }

    // Get user's existing vote
    const { data: existingVote } = await supabase
      .from('star_man_votes')
      .select('nominee_id')
      .eq('session_id', session.id)
      .eq('user_id', userId)
      .single();

    return (
      <div className="space-y-6">
        <div>
          <div className="flex items-center gap-2">
            <Star className="h-5 w-5 text-gold" aria-hidden="true" />
            <h1 className="text-h1 text-text-primary">Star Man Vote</h1>
          </div>
          <p className="mt-1 text-body-sm text-text-secondary">
            Who will be the star of the {season.name} season? Cast your vote!
          </p>
        </div>

        <Card>
          <VotingClient
            sessionId={session.id}
            nominees={nominees ?? []}
            deadline={session.deadline}
            existingVoteNomineeId={existingVote?.nominee_id ?? null}
          />
        </Card>
      </div>
    );
  }

  // CLOSED status — show results
  const { data: results } = await supabase.rpc('get_star_man_results', {
    p_session_id: session.id,
  });

  const totalVotes = results?.reduce((sum, r) => sum + (r.vote_count ?? 0), 0) ?? 0;
  const winners = results?.filter((r) => r.rank === 1 && r.vote_count > 0) ?? [];
  const isTie = winners.length > 1;
  const noVotes = totalVotes === 0;
  const topWinner = winners[0] as (typeof winners)[number] | undefined;

  // Get user's vote for display
  const { data: userVote } = await supabase
    .from('star_man_votes')
    .select('nominee_id')
    .eq('session_id', session.id)
    .eq('user_id', userId)
    .single();

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <Trophy className="h-5 w-5 text-gold" aria-hidden="true" />
          <h1 className="text-h1 text-text-primary">Star Man Results</h1>
        </div>
        <p className="mt-1 text-body-sm text-text-secondary">
          {season.name} Season · {totalVotes} vote{totalVotes !== 1 ? 's' : ''} cast
        </p>
      </div>

      {/* Winner card(s) */}
      {noVotes ? (
        <Card>
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <Star className="h-10 w-10 text-text-tertiary" aria-hidden="true" />
            <h2 className="text-h2 text-text-primary">No Votes Cast</h2>
            <p className="text-body-sm text-text-secondary">
              Nobody voted this season. Better luck next time!
            </p>
          </div>
        </Card>
      ) : (
        topWinner && (
          <Card variant="gold">
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gold-muted">
                <Award className="h-8 w-8 text-gold" aria-hidden="true" />
              </div>
              {isTie ? (
                <>
                  <Badge variant="star">It&apos;s a Tie!</Badge>
                  <div className="space-y-3">
                    {winners.map((w) => (
                      <div key={w.nominee_id}>
                        <h2 className="text-h2 text-text-primary">{w.player_name}</h2>
                        <p className="text-body-sm text-text-secondary">{w.team_name}</p>
                      </div>
                    ))}
                  </div>
                  <p className="text-stat font-bold tabular-nums text-gold">
                    {topWinner?.vote_count} votes each
                  </p>
                </>
              ) : (
                <>
                  <Badge variant="star">Star Man</Badge>
                  <h2 className="mt-2 text-h2 text-text-primary">{topWinner?.player_name}</h2>
                  <p className="text-body-sm text-text-secondary">{topWinner?.team_name}</p>
                  <p className="text-stat font-bold tabular-nums text-gold">
                    {topWinner?.vote_count} vote{topWinner?.vote_count !== 1 ? 's' : ''}
                  </p>
                </>
              )}
            </div>
          </Card>
        )
      )}

      {/* Full rankings */}
      <Card>
        <CardHeader>
          <CardTitle>Full Results</CardTitle>
        </CardHeader>
        <div className="space-y-2">
          {results?.map((entry) => {
            const isUserVote = userVote?.nominee_id === entry.nominee_id;
            const percentage =
              totalVotes > 0 ? Math.round((entry.vote_count / totalVotes) * 100) : 0;

            return (
              <div
                key={entry.nominee_id}
                className={cn(
                  'flex items-center gap-3 rounded-input p-3',
                  entry.rank === 1 ? 'bg-gold-muted/30' : 'bg-surface-elevated/30',
                )}
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-elevated text-caption font-bold text-text-secondary">
                  {entry.rank}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-body-sm font-medium text-text-primary">
                      {entry.player_name}
                    </p>
                    {isUserVote && <Badge variant="points">Your pick</Badge>}
                  </div>
                  <p className="truncate text-body-sm text-text-secondary">{entry.team_name}</p>
                  {/* Vote bar */}
                  <div className="mt-1.5 h-1.5 w-full rounded-full bg-surface-elevated">
                    <div
                      className={cn(
                        'h-full rounded-full transition-all duration-500',
                        entry.rank === 1 ? 'bg-gold' : 'bg-accent/60',
                      )}
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-body-sm font-bold tabular-nums text-text-primary">
                    {entry.vote_count}
                  </p>
                  <p className="text-body-sm tabular-nums text-text-secondary">{percentage}%</p>
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
