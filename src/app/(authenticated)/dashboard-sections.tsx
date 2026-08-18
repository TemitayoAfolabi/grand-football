import Link from 'next/link';
import { Calendar, ChevronRight, Clock, Lock, Target, Trophy } from 'lucide-react';
import { BonusTracker } from '@/components/bonus-tracker';
import { FixtureCard } from '@/components/fixture-card';
import { GlowDivider } from '@/components/glow-divider';
import { Countdown } from '@/components/countdown';
import { LazyLiveMatches } from '@/components/lazy-live-matches';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { createClient } from '@/lib/supabase/server';

interface DashboardSectionProps {
  seasonId: string;
  userId: string;
}

export async function DashboardDeadline({ seasonId }: { seasonId: string }) {
  const supabase = createClient();
  const now = new Date().toISOString();

  const [{ data: liveFixture }, { data: upcomingFixture }] = await Promise.all([
    supabase
      .from('fixtures')
      .select('gameweek')
      .eq('season_id', seasonId)
      .in('status', ['IN_PLAY', 'PAUSED'])
      .order('kickoff_time', { ascending: true })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('fixtures')
      .select('gameweek')
      .eq('season_id', seasonId)
      .gte('kickoff_time', now)
      .order('kickoff_time', { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);

  const gameweek = liveFixture?.gameweek ?? upcomingFixture?.gameweek ?? null;

  if (gameweek === null) {
    return (
      <div className="rounded-card border border-border-subtle bg-surface px-4 py-3">
        <div className="flex items-center gap-2">
          <Trophy className="h-4 w-4 text-text-tertiary" aria-hidden="true" />
          <div className="flex-1">
            <div className="text-body-sm text-text-tertiary">Season Complete</div>
            <div className="text-caption text-text-tertiary">No upcoming gameweeks</div>
          </div>
        </div>
      </div>
    );
  }

  const [{ data: customDeadline }, { data: fixtures }] = await Promise.all([
    supabase
      .from('gameweek_deadlines')
      .select('deadline')
      .eq('season_id', seasonId)
      .eq('gameweek', gameweek)
      .maybeSingle(),
    supabase
      .from('fixtures')
      .select('kickoff_time, status')
      .eq('season_id', seasonId)
      .eq('gameweek', gameweek),
  ]);

  const deadline =
    customDeadline?.deadline ??
    fixtures
      ?.filter((fixture) => !['POSTPONED', 'CANCELLED'].includes(fixture.status))
      .reduce<
        string | null
      >((earliest, fixture) => (!earliest || fixture.kickoff_time < earliest ? fixture.kickoff_time : earliest), null) ??
    null;

  if (!deadline) return null;

  const expired = new Date(deadline) < new Date();

  return (
    <div className="rounded-card border border-border bg-surface px-4 py-3">
      <div className="flex flex-col gap-2 tablet:flex-row tablet:items-center tablet:justify-between tablet:gap-3">
        <div className="flex items-center gap-2">
          {expired ? (
            <Lock className="h-4 w-4 text-text-tertiary" aria-hidden="true" />
          ) : (
            <Clock className="h-4 w-4 text-text-secondary" aria-hidden="true" />
          )}
          <span
            className={
              expired ? 'text-body-sm text-text-tertiary' : 'text-body-sm text-text-secondary'
            }
          >
            GW {gameweek} {expired ? 'Locked' : 'Predictions Lock In:'}
          </span>
        </div>
        {expired ? (
          <span className="text-body-sm text-text-tertiary">Predictions closed</span>
        ) : (
          <Countdown targetDate={deadline} className="text-body font-semibold" />
        )}
      </div>
    </div>
  );
}

export async function LiveDashboardMatches({ seasonId, userId }: DashboardSectionProps) {
  const supabase = createClient();
  const { data: fixtures } = await supabase
    .from('fixtures')
    .select('*')
    .eq('season_id', seasonId)
    .in('status', ['IN_PLAY', 'PAUSED'])
    .order('kickoff_time', { ascending: true });

  if (!fixtures?.length) return null;

  const { data: predictions } = await supabase
    .from('predictions')
    .select('fixture_id, home_score, away_score')
    .eq('user_id', userId)
    .in(
      'fixture_id',
      fixtures.map((fixture) => fixture.id),
    );

  return (
    <LazyLiveMatches
      gameweek={fixtures[0]!.gameweek}
      initialFixtures={fixtures}
      predictions={predictions ?? []}
    />
  );
}

export async function MonthlyBonusCard({ seasonId, userId }: DashboardSectionProps) {
  const supabase = createClient();
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]!;
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString().split('T')[0]!;

  const { data: fixtures } = await supabase
    .from('fixtures')
    .select('id, kickoff_time, gameweek')
    .eq('season_id', seasonId)
    .not('status', 'in', '(POSTPONED,CANCELLED,SUSPENDED)')
    .gte('kickoff_time', monthStart)
    .lt('kickoff_time', monthEnd);

  const fixtureRows = fixtures ?? [];
  const fixtureIds = fixtureRows.map((fixture) => fixture.id);
  const gameweeks = [...new Set(fixtureRows.map((fixture) => fixture.gameweek))];

  const [{ data: predictions }, { data: adminDeadlines }] = await Promise.all([
    fixtureIds.length
      ? supabase
          .from('predictions')
          .select('fixture_id, submitted_at, updated_at')
          .eq('user_id', userId)
          .in('fixture_id', fixtureIds)
      : Promise.resolve({ data: [] }),
    gameweeks.length
      ? supabase
          .from('gameweek_deadlines')
          .select('gameweek, deadline')
          .eq('season_id', seasonId)
          .in('gameweek', gameweeks)
      : Promise.resolve({ data: [] }),
  ]);

  const deadlineMap = new Map((adminDeadlines ?? []).map((row) => [row.gameweek, row.deadline]));

  for (const gameweek of gameweeks) {
    if (deadlineMap.has(gameweek)) continue;

    const earliest = fixtureRows
      .filter((fixture) => fixture.gameweek === gameweek)
      .reduce<
        string | null
      >((value, fixture) => (!value || fixture.kickoff_time < value ? fixture.kickoff_time : value), null);
    if (earliest) deadlineMap.set(gameweek, earliest);
  }

  const fixtureMap = new Map(fixtureRows.map((fixture) => [fixture.id, fixture]));
  const onTime = (predictions ?? []).filter((prediction) => {
    const fixture = fixtureMap.get(prediction.fixture_id);
    if (!fixture) return false;
    const deadline = deadlineMap.get(fixture.gameweek);
    if (!deadline) return false;

    const lastUpdate = new Date(
      Math.max(
        new Date(prediction.submitted_at).getTime(),
        new Date(prediction.updated_at ?? prediction.submitted_at).getTime(),
      ),
    );
    return new Date(lastUpdate) <= new Date(deadline);
  }).length;

  return (
    <Card>
      <BonusTracker
        predicted={predictions?.length ?? 0}
        total={fixtureRows.length}
        onTime={onTime}
        eligible={onTime === fixtureRows.length && fixtureRows.length > 0}
      />
    </Card>
  );
}

export async function UpcomingFixtures({ seasonId, userId }: DashboardSectionProps) {
  const supabase = createClient();
  const { data: fixtures } = await supabase
    .from('fixtures')
    .select('*')
    .eq('season_id', seasonId)
    .in('status', ['SCHEDULED', 'TIMED'])
    .order('kickoff_time', { ascending: true })
    .limit(5);

  const fixtureIds = fixtures?.map((fixture) => fixture.id) ?? [];
  const { data: predictions } = fixtureIds.length
    ? await supabase
        .from('predictions')
        .select('*')
        .eq('user_id', userId)
        .in('fixture_id', fixtureIds)
    : { data: [] };
  const predictionMap = new Map(
    predictions?.map((prediction) => [prediction.fixture_id, prediction]),
  );

  return (
    <>
      <GlowDivider />
      <section>
        <FixtureSectionHeader icon="calendar" title="Upcoming Fixtures" />
        {fixtures?.length ? (
          <div className="space-y-3">
            {fixtures.map((fixture) => (
              <FixtureCard
                key={fixture.id}
                fixture={fixture}
                prediction={predictionMap.get(fixture.id) ?? null}
              />
            ))}
          </div>
        ) : (
          <EmptyFixtures icon="calendar" text="No upcoming fixtures scheduled." />
        )}
      </section>
    </>
  );
}

export async function RecentResults({ seasonId, userId }: DashboardSectionProps) {
  const supabase = createClient();
  const { data: fixtures } = await supabase
    .from('fixtures')
    .select('*')
    .eq('season_id', seasonId)
    .eq('status', 'FINISHED')
    .order('kickoff_time', { ascending: false })
    .limit(5);

  const fixtureIds = fixtures?.map((fixture) => fixture.id) ?? [];
  const { data: scores } = fixtureIds.length
    ? await supabase
        .from('score_records')
        .select('*')
        .eq('user_id', userId)
        .in('fixture_id', fixtureIds)
    : { data: [] };
  const scoreMap = new Map(scores?.map((score) => [score.fixture_id, score]));

  return (
    <>
      <GlowDivider />
      <section>
        <FixtureSectionHeader icon="target" title="Recent Results" />
        {fixtures?.length ? (
          <div className="space-y-3">
            {fixtures.map((fixture) => (
              <FixtureCard
                key={fixture.id}
                fixture={fixture}
                scoreRecord={scoreMap.get(fixture.id) ?? null}
              />
            ))}
          </div>
        ) : (
          <EmptyFixtures icon="target" text="No results yet." />
        )}
      </section>
    </>
  );
}

function FixtureSectionHeader({ icon, title }: { icon: 'calendar' | 'target'; title: string }) {
  const Icon = icon === 'calendar' ? Calendar : Target;
  return (
    <CardHeader>
      <CardTitle>
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-accent" aria-hidden="true" />
          {title}
        </div>
      </CardTitle>
      <Link
        href="/fixtures"
        className="flex items-center gap-1 text-body-sm text-accent transition-colors hover:text-accent-hover"
      >
        View all
        <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
      </Link>
    </CardHeader>
  );
}

function EmptyFixtures({ icon, text }: { icon: 'calendar' | 'target'; text: string }) {
  const Icon = icon === 'calendar' ? Calendar : Target;
  return (
    <div className="rounded-card border border-border-subtle bg-surface p-6 text-center">
      <Icon className="mx-auto mb-2 h-8 w-8 text-text-tertiary" aria-hidden="true" />
      <p className="text-body-sm text-text-secondary">{text}</p>
    </div>
  );
}
