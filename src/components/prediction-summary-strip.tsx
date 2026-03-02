import { Target, Calendar, Trophy } from 'lucide-react';
import { StatCard } from '@/components/stat-card';

interface PredictionSummaryStripProps {
  totalPoints: number;
  totalPredictions: number;
  totalFixtures: number;
}

export function PredictionSummaryStrip({
  totalPoints,
  totalPredictions,
  totalFixtures,
}: PredictionSummaryStripProps) {
  const completionRate =
    totalFixtures > 0
      ? Math.round((totalPredictions / totalFixtures) * 100)
      : 0;

  return (
    <div className="grid grid-cols-3 gap-3">
      <StatCard icon={Trophy} label="Points" value={totalPoints} />
      <StatCard
        icon={Target}
        label="Predicted"
        value={`${totalPredictions}/${totalFixtures}`}
      />
      <StatCard icon={Calendar} label="Completion" value={`${completionRate}%`} />
    </div>
  );
}
