import Link from 'next/link';

import {
  Award,
  Crown,
  Eye,
  Flame,
  Goal,
  HeartHandshake,
  MessageCircleHeart,
  Swords,
  Trophy,
  Users,
  WandSparkles,
} from 'lucide-react';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/empty-state';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import type { Tables } from '@/lib/database.types';
import { cn } from '@/lib/utils';
import { createMiniLeague, joinMiniLeague, saveScorerPick, sendMatchReaction } from './actions';

export const metadata = { title: 'Matchday Drama' };
export const dynamic = 'force-dynamic';

type LeaderboardEntry = {
  user_id: string;
  display_name: string;
  total_points: number;
  rank: number;
};

type DramaFixture = Pick<
  Tables<'fixtures'>,
  | 'id'
  | 'gameweek'
  | 'home_team'
  | 'away_team'
  | 'kickoff_time'
  | 'status'
  | 'home_score'
  | 'away_score'
  | 'live_home_score'
  | 'live_away_score'
  | 'is_star_game'
>;
type DramaScoreRecord = Pick<
  Tables<'score_records'>,
  'user_id' | 'fixture_id' | 'points_awarded' | 'reason_code'
>;
type CompletedRecord = DramaScoreRecord & { fixture: DramaFixture };
type DramaProfile = Pick<Tables<'profiles'>, 'id' | 'display_name'>;
type DramaPrediction = Pick<
  Tables<'predictions'>,
  'user_id' | 'fixture_id' | 'home_score' | 'away_score'
>;
type DramaScorerPick = Pick<Tables<'scorer_picks'>, 'fixture_id' | 'user_id' | 'player_name'>;
type DramaReaction = Pick<Tables<'match_reactions'>, 'fixture_id' | 'reaction'>;
type MiniLeague = Pick<Tables<'mini_leagues'>, 'id' | 'name' | 'invite_code' | 'created_by'>;
type MiniLeagueMember = Pick<Tables<'mini_league_members'>, 'mini_league_id' | 'user_id'>;

const REACTIONS = [
  { id: 'called_it', label: 'I called it', emoji: '🎯' },
  { id: 'robbed', label: 'Robbed', emoji: '😤' },
  { id: 'how', label: 'How?!', emoji: '🤯' },
] as const;

function compactName(name: string) {
  return name.replace(/\s+(FC|AFC)$/i, '');
}

export default async function MatchdayPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: season } = await supabase
    .from('seasons')
    .select('id, name')
    .eq('is_active', true)
    .maybeSingle();

  if (!user || !season) {
    return (
      <EmptyState
        icon={Trophy}
        title="No active season"
        description="Matchday Drama returns when the season starts."
      />
    );
  }

  // Only aggregated competition data is passed to the client-facing page.
  const admin = createAdminClient();
  const { data: fixtureRows } = await admin
    .from('fixtures')
    .select(
      'id, gameweek, home_team, away_team, kickoff_time, status, home_score, away_score, live_home_score, live_away_score, is_star_game',
    )
    .eq('season_id', season.id)
    .order('kickoff_time', { ascending: true });
  const fixtures = (fixtureRows ?? []) as DramaFixture[];
  const fixtureIds = fixtures.map((fixture) => fixture.id);
  const [
    leaderboardResult,
    profilesResult,
    predictionsResult,
    scoreRecordsResult,
    badgesResult,
    leaguesResult,
    membershipsResult,
    scorerPicksResult,
    reactionsResult,
  ] = await Promise.all([
    admin.rpc('get_season_leaderboard', { p_season_id: season.id }),
    admin.from('profiles').select('id, display_name').order('display_name'),
    fixtureIds.length
      ? admin
          .from('predictions')
          .select('user_id, fixture_id, home_score, away_score')
          .in('fixture_id', fixtureIds)
      : Promise.resolve({ data: [] }),
    fixtureIds.length
      ? admin
          .from('score_records')
          .select('user_id, fixture_id, points_awarded, reason_code')
          .in('fixture_id', fixtureIds)
      : Promise.resolve({ data: [] }),
    admin.from('user_badges').select('badge_id').eq('user_id', user.id),
    admin
      .from('mini_leagues')
      .select('id, name, invite_code, created_by')
      .eq('season_id', season.id)
      .order('created_at'),
    admin.from('mini_league_members').select('mini_league_id, user_id'),
    fixtureIds.length
      ? admin
          .from('scorer_picks')
          .select('fixture_id, user_id, player_name')
          .in('fixture_id', fixtureIds)
      : Promise.resolve({ data: [] }),
    fixtureIds.length
      ? admin.from('match_reactions').select('fixture_id, reaction').in('fixture_id', fixtureIds)
      : Promise.resolve({ data: [] }),
  ]);

  const leaderboard = (leaderboardResult.data ?? []) as LeaderboardEntry[];
  const profiles = (profilesResult.data ?? []) as DramaProfile[];
  const predictions = (predictionsResult.data ?? []) as DramaPrediction[];
  const scoreRecords = (scoreRecordsResult.data ?? []) as DramaScoreRecord[];
  const scorerPicks = (scorerPicksResult.data ?? []) as DramaScorerPick[];
  const leagues = (leaguesResult.data ?? []) as MiniLeague[];
  const leagueMemberships = (membershipsResult.data ?? []) as MiniLeagueMember[];
  const reactions = (reactionsResult.data ?? []) as DramaReaction[];
  const fixtureById = new Map<string, DramaFixture>(
    fixtures.map((fixture) => [fixture.id, fixture]),
  );
  const profileById = new Map<string, string>(
    profiles.map((profile) => [profile.id, profile.display_name]),
  );
  const userEntry = leaderboard.find((entry) => entry.user_id === user.id);
  const rival =
    leaderboard.find((entry) => entry.rank === (userEntry?.rank ?? 0) - 1) ??
    leaderboard.find((entry) => entry.rank === (userEntry?.rank ?? 0) + 1) ??
    null;
  const liveFixtures = fixtures.filter((fixture) => ['IN_PLAY', 'PAUSED'].includes(fixture.status));
  const upcomingFixture = fixtures.find(
    (fixture) =>
      new Date(fixture.kickoff_time) > new Date() &&
      ['SCHEDULED', 'TIMED'].includes(fixture.status),
  );
  const currentPick = scorerPicks.find(
    (pick) => pick.user_id === user.id && pick.fixture_id === upcomingFixture?.id,
  );
  const earnedBadges = badgesResult.data ?? [];

  const completedRecords: CompletedRecord[] = scoreRecords
    .map((record) => {
      const fixture = fixtureById.get(record.fixture_id);
      return fixture ? { ...record, fixture } : null;
    })
    .filter((record): record is CompletedRecord => record !== null)
    .sort((a, b) => b.fixture.kickoff_time.localeCompare(a.fixture.kickoff_time));
  const userRecords = completedRecords.filter((record) => record.user_id === user.id);
  const hitStreak = userRecords.reduce((streak, record) => {
    if (streak < 0) return streak;
    return record.points_awarded > 0 ? streak + 1 : -1;
  }, 0);
  const currentHitStreak = hitStreak < 0 ? Math.abs(hitStreak) - 1 : hitStreak;
  const userRecordByFixture = new Map<string, number>(
    userRecords.map((record) => [record.fixture_id, record.points_awarded]),
  );
  const rivalRecordByFixture = new Map<string, number>(
    completedRecords
      .filter((record) => record.user_id === rival?.user_id)
      .map((record) => [record.fixture_id, record.points_awarded]),
  );
  const sharedFixtures = [...userRecordByFixture.keys()].filter((fixtureId) =>
    rivalRecordByFixture.has(fixtureId),
  );
  const headToHead = sharedFixtures.reduce<number>(
    (total, fixtureId) =>
      total +
      Math.sign(
        (userRecordByFixture.get(fixtureId) ?? 0) - (rivalRecordByFixture.get(fixtureId) ?? 0),
      ),
    0,
  );

  const latestFinishedGameweek = Math.max(
    ...fixtures
      .filter((fixture) => fixture.status === 'FINISHED')
      .map((fixture) => fixture.gameweek),
    0,
  );
  const latestRecords = completedRecords.filter(
    (record) => record.fixture.gameweek === latestFinishedGameweek,
  );
  const recapTotals = new Map<string, number>();
  for (const record of latestRecords)
    recapTotals.set(record.user_id, (recapTotals.get(record.user_id) ?? 0) + record.points_awarded);
  const recapWinner = [...recapTotals.entries()].sort((a, b) => b[1] - a[1])[0];
  const exactLeader = [...completedRecords]
    .filter((record) => ['EXACT_SCORE', 'STAR_EXACT'].includes(record.reason_code))
    .reduce(
      (counts, record) => counts.set(record.user_id, (counts.get(record.user_id) ?? 0) + 1),
      new Map<string, number>(),
    );
  const exactAward = [...exactLeader.entries()].sort((a, b) => b[1] - a[1])[0];
  const positiveAward = [...completedRecords]
    .filter((record) => record.points_awarded > 0)
    .reduce(
      (counts, record) => counts.set(record.user_id, (counts.get(record.user_id) ?? 0) + 1),
      new Map<string, number>(),
    );
  const consistentAward = [...positiveAward.entries()].sort((a, b) => b[1] - a[1])[0];

  const myLeagues = leagues.filter((league) =>
    leagueMemberships.some(
      (member) => member.mini_league_id === league.id && member.user_id === user.id,
    ),
  );
  const reactionCounts = new Map<string, number>();
  for (const reaction of reactions) {
    const key = `${reaction.fixture_id}:${reaction.reaction}`;
    reactionCounts.set(key, (reactionCounts.get(key) ?? 0) + 1);
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-2 tablet:flex-row tablet:items-end tablet:justify-between">
        <div>
          <p className="text-caption font-semibold uppercase tracking-[0.16em] text-accent">
            {season.name}
          </p>
          <h1 className="text-h1 text-text-primary">Matchday Drama</h1>
          <p className="mt-1 text-body-sm text-text-secondary">
            Every goal has consequences. Watch yours unfold.
          </p>
        </div>
        <Link
          href="/leaderboard"
          className="text-body-sm font-semibold text-accent hover:underline"
        >
          Open live leaderboard →
        </Link>
      </header>

      <section className="grid gap-3 tablet:grid-cols-3">
        <Stat
          label="Hit streak"
          value={currentHitStreak ? `${currentHitStreak} fixtures` : 'Start one'}
          icon={Flame}
          detail="Correct calls in a row"
        />
        <Stat
          label="Badges"
          value={String(earnedBadges.length)}
          icon={Award}
          detail="Your cabinet is growing"
        />
        <Stat
          label="Season rank"
          value={userEntry ? `#${userEntry.rank}` : '—'}
          icon={Trophy}
          detail={`${userEntry?.total_points ?? 0} confirmed points`}
        />
      </section>

      <section className="grid gap-4 desktop:grid-cols-2">
        <Card variant="accent">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <WandSparkles className="h-5 w-5 text-accent" />
              Matchday Drama
            </CardTitle>
            <Badge variant="live">LIVE</Badge>
          </CardHeader>
          {liveFixtures.length ? (
            <div className="space-y-3">
              {liveFixtures.map((fixture) => {
                const score = `${fixture.live_home_score ?? fixture.home_score ?? 0}–${fixture.live_away_score ?? fixture.away_score ?? 0}`;
                const pick = predictions.find(
                  (prediction) =>
                    prediction.user_id === user.id && prediction.fixture_id === fixture.id,
                );
                return (
                  <div
                    key={fixture.id}
                    className="rounded-input border border-accent/20 bg-bg-primary/55 p-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-text-primary">
                        {compactName(fixture.home_team)} {score} {compactName(fixture.away_team)}
                      </span>
                      <span className="text-caption text-success">Live impact</span>
                    </div>
                    <p className="mt-1 text-body-sm text-text-secondary">
                      {pick
                        ? `Your ${pick.home_score}–${pick.away_score} call is in play — the Live leaderboard updates as this score changes.`
                        : 'Your rivals’ provisional leaderboard positions are moving right now.'}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {REACTIONS.map((reaction) => (
                        <form key={reaction.id} action={sendMatchReaction}>
                          <input type="hidden" name="fixtureId" value={fixture.id} />
                          <input type="hidden" name="reaction" value={reaction.id} />
                          <button
                            className="rounded-full border border-border bg-surface px-2.5 py-1 text-caption hover:border-accent"
                            title={reaction.label}
                          >
                            {reaction.emoji}{' '}
                            {reactionCounts.get(`${fixture.id}:${reaction.id}`) ?? 0}
                          </button>
                        </form>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-body-sm text-text-secondary">
              No live fixture right now. The drama wakes up at kickoff.
            </p>
          )}
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Swords className="h-5 w-5 text-accent" />
              Your rivalry
            </CardTitle>
          </CardHeader>
          {rival ? (
            <>
              <p className="text-body text-text-primary">
                <span className="font-bold">{rival.display_name}</span> is your nearest rival,{' '}
                {Math.abs((rival.total_points ?? 0) - (userEntry?.total_points ?? 0))} points away.
              </p>
              <p className="mt-2 text-body-sm text-text-secondary">
                Head-to-head across shared completed fixtures:{' '}
                <span className="font-semibold text-text-primary">
                  {headToHead > 0
                    ? `you lead by ${headToHead}`
                    : headToHead < 0
                      ? `${rival.display_name} leads by ${Math.abs(headToHead)}`
                      : 'dead level'}
                </span>
                .
              </p>
              <Link
                href="/leaderboard"
                className="mt-4 inline-flex text-body-sm font-semibold text-accent hover:underline"
              >
                Settle it on the board →
              </Link>
            </>
          ) : (
            <p className="text-body-sm text-text-secondary">
              Your closest rival will appear after the first leaderboard update.
            </p>
          )}
        </Card>
      </section>

      <section className="grid gap-4 desktop:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Goal className="h-5 w-5 text-gold" />
              Golden Boot side quest
            </CardTitle>
            <Badge variant="star">Optional</Badge>
          </CardHeader>
          {upcomingFixture ? (
            <form
              action={saveScorerPick}
              className="flex flex-col gap-3 tablet:flex-row tablet:items-end"
            >
              <input type="hidden" name="fixtureId" value={upcomingFixture.id} />
              <label className="flex-1 text-body-sm text-text-secondary">
                First scorer for {compactName(upcomingFixture.home_team)} v{' '}
                {compactName(upcomingFixture.away_team)}
                <input
                  name="playerName"
                  defaultValue={currentPick?.player_name ?? ''}
                  placeholder="e.g. Bukayo Saka"
                  className="mt-1 w-full rounded-input border border-border bg-bg-primary px-3 py-2 text-text-primary"
                />
              </label>
              <button className="rounded-input bg-accent px-4 py-2 font-semibold text-text-inverse">
                Lock pick
              </button>
            </form>
          ) : (
            <p className="text-body-sm text-text-secondary">
              The next fixture will unlock a scorer pick.
            </p>
          )}
          <p className="mt-3 text-caption text-text-tertiary">
            Pick locks at kickoff. Scorer-event resolution is ready for the next provider upgrade.
          </p>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5 text-accent" />
              Secret prediction reveal
            </CardTitle>
          </CardHeader>
          <p className="text-body-sm text-text-secondary">
            Predictions stay hidden until each fixture kicks off, then unlock automatically for
            everyone. Commit first, then enjoy the reveal.
          </p>
          <Link
            href="/fixtures"
            className="mt-4 inline-flex text-body-sm font-semibold text-accent hover:underline"
          >
            Make your calls →
          </Link>
        </Card>
      </section>

      <section className="grid gap-4 desktop:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-accent" />
              Mini-leagues
            </CardTitle>
          </CardHeader>
          <div className="space-y-3">
            {myLeagues.map((league) => {
              const memberIds = leagueMemberships
                .filter((member) => member.mini_league_id === league.id)
                .map((member) => member.user_id);
              const top = leaderboard
                .filter((entry) => memberIds.includes(entry.user_id))
                .slice(0, 3);
              return (
                <div key={league.id} className="rounded-input border border-border-subtle p-3">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-text-primary">{league.name}</span>
                    <code className="text-caption text-accent">{league.invite_code}</code>
                  </div>
                  <p className="mt-1 text-caption text-text-tertiary">
                    {memberIds.length} players ·{' '}
                    {top.map((entry) => entry.display_name).join(' · ') || 'Waiting for rankings'}
                  </p>
                </div>
              );
            })}
          </div>
          <div className="mt-4 grid gap-2 tablet:grid-cols-2">
            <form action={createMiniLeague} className="flex gap-2">
              <input type="hidden" name="seasonId" value={season.id} />
              <input
                name="name"
                required
                placeholder="Create league"
                className="min-w-0 flex-1 rounded-input border border-border bg-bg-primary px-3 py-2 text-body-sm"
              />
              <button className="rounded-input border border-accent px-3 text-body-sm font-semibold text-accent">
                Create
              </button>
            </form>
            <form action={joinMiniLeague} className="flex gap-2">
              <input
                name="inviteCode"
                required
                maxLength={8}
                placeholder="Invite code"
                className="min-w-0 flex-1 rounded-input border border-border bg-bg-primary px-3 py-2 text-body-sm uppercase"
              />
              <button className="rounded-input border border-border px-3 text-body-sm font-semibold text-text-primary">
                Join
              </button>
            </form>
          </div>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageCircleHeart className="h-5 w-5 text-accent" />
              The Oracle
            </CardTitle>
          </CardHeader>
          <p className="text-body-sm text-text-secondary">
            {upcomingFixture
              ? `For ${compactName(upcomingFixture.home_team)} v ${compactName(upcomingFixture.away_team)}, start with the scoreline you genuinely expect — then challenge it: is one goal too conservative?`
              : 'No fixture is queued. The Oracle returns with the next gameweek.'}
          </p>
          <p className="mt-3 text-caption text-text-tertiary">
            A thinking prompt, not an auto-pick. Your prediction is always your own.
          </p>
        </Card>
      </section>

      <section className="grid gap-4 desktop:grid-cols-2">
        <Card variant="gold">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Crown className="h-5 w-5 text-gold" />
              Weekly newspaper
            </CardTitle>
            {latestFinishedGameweek ? (
              <Badge variant="star">GW {latestFinishedGameweek}</Badge>
            ) : null}
          </CardHeader>
          {recapWinner ? (
            <p className="text-body text-text-primary">
              <span className="font-bold">{profileById.get(recapWinner[0]) ?? 'A player'}</span>{' '}
              owned the last completed gameweek with {recapWinner[1]} points. The next chapter
              starts at kickoff.
            </p>
          ) : (
            <p className="text-body-sm text-text-secondary">
              The first finished gameweek will generate your recap automatically.
            </p>
          )}
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <HeartHandshake className="h-5 w-5 text-accent" />
              Season awards
            </CardTitle>
          </CardHeader>
          <div className="space-y-2 text-body-sm">
            {exactAward && (
              <AwardLine
                label="Nostradamus"
                value={`${profileById.get(exactAward[0]) ?? '—'} · ${exactAward[1]} exact calls`}
              />
            )}
            {consistentAward && (
              <AwardLine
                label="Most consistent"
                value={`${profileById.get(consistentAward[0]) ?? '—'} · ${consistentAward[1]} positive calls`}
              />
            )}
            {!exactAward && !consistentAward && (
              <p className="text-text-secondary">Awards unlock as results arrive.</p>
            )}
          </div>
        </Card>
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  detail,
  icon: Icon,
}: {
  label: string;
  value: string;
  detail: string;
  icon: typeof Trophy;
}) {
  return (
    <Card className="p-3">
      <div className="flex items-center gap-3">
        <div className="rounded-full bg-accent-muted p-2">
          <Icon className="h-4 w-4 text-accent" />
        </div>
        <div>
          <p className="text-caption text-text-tertiary">{label}</p>
          <p className="font-bold text-text-primary">{value}</p>
          <p className="text-caption text-text-tertiary">{detail}</p>
        </div>
      </div>
    </Card>
  );
}

function AwardLine({ label, value }: { label: string; value: string }) {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-3 rounded-input bg-surface-elevated px-3 py-2',
      )}
    >
      <span className="font-semibold text-text-primary">{label}</span>
      <span className="text-right text-text-secondary">{value}</span>
    </div>
  );
}
