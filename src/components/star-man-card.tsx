import { createClient } from '@/lib/supabase/server';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Countdown } from '@/components/countdown';
import { Star, ChevronRight, Award } from 'lucide-react';
import Link from 'next/link';
import type { Route } from 'next';

export async function StarManCard() {
  const supabase = createClient();

  // Get active season
  const { data: season } = await supabase
    .from('seasons')
    .select('id')
    .eq('is_active', true)
    .single();

  if (!season) return null;

  // Get session for active season
  const { data: session } = await supabase
    .from('star_man_sessions')
    .select('id, status, deadline')
    .eq('season_id', season.id)
    .single();

  // No session or DRAFT — render nothing
  if (!session || session.status === 'DRAFT') return null;

  // OPEN — CTA to vote + countdown
  if (session.status === 'OPEN') {
    const deadlinePassed = new Date(session.deadline) <= new Date();

    return (
      <Link href={'/star-man' as Route}>
        <Card variant="gold" hoverable>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gold-muted">
              <Star className="h-5 w-5 text-gold" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="text-body-sm font-medium text-text-primary">Star Man Vote</p>
                <Badge variant="star">Open</Badge>
              </div>
              {!deadlinePassed ? (
                <div className="mt-1 flex items-center gap-1">
                  <span className="text-xs text-text-secondary">Closes in:</span>
                  <Countdown targetDate={session.deadline} />
                </div>
              ) : (
                <p className="mt-1 text-xs text-text-secondary">Voting has ended</p>
              )}
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-text-tertiary" aria-hidden="true" />
          </div>
        </Card>
      </Link>
    );
  }

  // CLOSED — winner teaser
  const { data: results } = await supabase.rpc('get_star_man_results', {
    p_session_id: session.id,
  });

  const winner = results?.[0];
  if (!winner || winner.vote_count === 0) return null;

  return (
    <Link href={'/star-man' as Route}>
      <Card variant="gold" hoverable>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gold-muted">
            <Award className="h-5 w-5 text-gold" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="text-body-sm font-medium text-text-primary">Star Man Winner</p>
              <Badge variant="star">Result</Badge>
            </div>
            <p className="mt-1 text-xs text-text-secondary">
              <span className="font-semibold text-gold">{winner.player_name}</span>
              {' '}— {winner.team_name}
            </p>
          </div>
          <ChevronRight className="h-4 w-4 shrink-0 text-text-tertiary" aria-hidden="true" />
        </div>
      </Card>
    </Link>
  );
}
