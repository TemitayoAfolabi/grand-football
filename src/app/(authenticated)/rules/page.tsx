import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { SCORING } from '@/lib/constants';
import { Star, Award, Info, Target } from 'lucide-react';

export const metadata = {
  title: 'How Scoring Works',
};

export default function RulesPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-h1 text-text-primary">How Scoring Works</h1>
      <p className="text-body-sm text-text-secondary">
        Predict Premier League scores each gameweek. Points are awarded based on
        how close your prediction is to the actual result.
      </p>

      {/* Standard Scoring */}
      <Card>
        <CardHeader>
          <CardTitle>
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-accent" aria-hidden="true" />
              Standard Scoring
            </div>
          </CardTitle>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="pb-2 pr-4 font-medium text-text-secondary">Result</th>
                <th className="pb-2 text-right font-medium text-text-secondary">Points</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              <tr>
                <td className="py-3 pr-4">
                  <div className="font-medium text-text-primary">Exact Score</div>
                  <div className="text-xs text-text-secondary">
                    You predicted the exact scoreline
                  </div>
                </td>
                <td className="py-3 text-right">
                  <Badge variant="success">{SCORING.EXACT_SCORE} pts</Badge>
                </td>
              </tr>
              <tr>
                <td className="py-3 pr-4">
                  <div className="font-medium text-text-primary">Correct Outcome</div>
                  <div className="text-xs text-text-secondary">
                    Right result (home win / draw / away win) but wrong score
                  </div>
                </td>
                <td className="py-3 text-right">
                  <Badge variant="warning">{SCORING.OUTCOME} pts</Badge>
                </td>
              </tr>
              <tr>
                <td className="py-3 pr-4">
                  <div className="font-medium text-text-primary">Correct Team Goals</div>
                  <div className="text-xs text-text-secondary">
                    Wrong outcome, but you correctly predicted goals for at least one team
                  </div>
                </td>
                <td className="py-3 text-right">
                  <Badge>{SCORING.CORRECT_TEAM_GOALS} pt</Badge>
                </td>
              </tr>
              <tr>
                <td className="py-3 pr-4">
                  <div className="font-medium text-text-primary">Wrong</div>
                  <div className="text-xs text-text-secondary">None of the above</div>
                </td>
                <td className="py-3 text-right">
                  <Badge variant="error">{SCORING.WRONG} pts</Badge>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      {/* Star Game */}
      <Card>
        <CardHeader>
          <CardTitle>
            <div className="flex items-center gap-2">
              <Star className="h-4 w-4 text-gold" aria-hidden="true" />
              Star Game
            </div>
          </CardTitle>
        </CardHeader>
        <p className="mb-3 text-sm text-text-secondary">
          One fixture per gameweek is designated the <strong>Star Game</strong>.
          Exact score predictions earn double points!
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="pb-2 pr-4 font-medium text-text-secondary">Result</th>
                <th className="pb-2 text-right font-medium text-text-secondary">Points</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              <tr>
                <td className="py-3 pr-4 font-medium text-text-primary">Exact Score</td>
                <td className="py-3 text-right">
                  <Badge variant="star">{SCORING.STAR_EXACT} pts</Badge>
                </td>
              </tr>
              <tr>
                <td className="py-3 pr-4 font-medium text-text-primary">Correct Outcome</td>
                <td className="py-3 text-right">
                  <Badge variant="warning">{SCORING.STAR_OUTCOME} pts</Badge>
                </td>
              </tr>
              <tr>
                <td className="py-3 pr-4 font-medium text-text-primary">Correct Team Goals</td>
                <td className="py-3 text-right">
                  <Badge>{SCORING.STAR_CORRECT_TEAM_GOALS} pt</Badge>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      {/* Correct Team Goals Explanation */}
      <Card>
        <CardHeader>
          <CardTitle>
            <div className="flex items-center gap-2">
              <Info className="h-4 w-4 text-info" aria-hidden="true" />
              What is Correct Team Goals?
            </div>
          </CardTitle>
        </CardHeader>
        <div className="space-y-3 text-sm text-text-secondary">
          <p>
            <strong>Correct Team Goals</strong> is a consolation point. You earn
            1 point when:
          </p>
          <ul className="ml-4 list-disc space-y-1">
            <li>You predicted the wrong outcome (e.g., home win but it was an away win)</li>
            <li>
              But you correctly predicted the number of goals scored by <em>at
              least one</em> of the two teams
            </li>
          </ul>
          <div className="rounded-input bg-bg-secondary p-3">
            <p className="font-medium text-text-primary">Example</p>
            <p>
              You predicted <strong>2–1</strong> (home win), actual result was{' '}
              <strong>2–3</strong> (away win). The home team scored 2 in both
              your prediction and reality, so you get{' '}
              <strong>1 point</strong>.
            </p>
          </div>
        </div>
      </Card>

      {/* Monthly Bonus */}
      <Card>
        <CardHeader>
          <CardTitle>
            <div className="flex items-center gap-2">
              <Award className="h-4 w-4 text-gold" aria-hidden="true" />
              Monthly Bonus
            </div>
          </CardTitle>
        </CardHeader>
        <div className="space-y-2 text-sm text-text-secondary">
          <p>
            Submit predictions <strong>on time</strong> (before each fixture&apos;s
            kickoff) for every fixture in a calendar month to earn a{' '}
            <Badge variant="star">+{SCORING.MONTHLY_BONUS} pts</Badge> bonus at
            month end.
          </p>
          <p>
            Submitting late (after kickoff) for even one fixture, or missing a
            fixture entirely, disqualifies you from the bonus that month. The
            bonus tracker on your dashboard shows how many of your predictions
            were submitted on time.
          </p>
        </div>
      </Card>

      {/* Tie-breaking */}
      <Card>
        <CardHeader>
          <CardTitle>Tie-breaking Rules</CardTitle>
        </CardHeader>
        <div className="space-y-2 text-sm text-text-secondary">
          <p>When two or more players have the same total points:</p>
          <ol className="ml-4 list-decimal space-y-1">
            <li>
              <strong>Most exact scores</strong> — the player with more exact
              score predictions ranks higher.
            </li>
            <li>
              <strong>Most correct outcomes</strong> — if still tied, the player
              with more correct outcome predictions ranks higher.
            </li>
            <li>
              <strong>Fewest zero-point predictions</strong> — if still tied,
              the player with fewer wrong predictions ranks higher.
            </li>
          </ol>
        </div>
      </Card>
    </div>
  );
}
