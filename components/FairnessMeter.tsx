import type { Stats } from '@/lib/stats';
import type { UserView } from '@/lib/queries';

export function FairnessMeter({ stats, users }: { stats: Stats; users: UserView[] }) {
  const [user1, user2] = users;

  return (
    <div className="fairness-meter">
      <div className="fairness-header">
        <span>⚖️ Reparto de esfuerzo (por puntos)</span>
        <span>{stats.totalPoints} pts completados</span>
      </div>
      <div className="fairness-bar">
        <div
          className="fairness-p1"
          style={{ width: `${stats.user1.pointsPercent}%` }}
          title={`${user1?.name}: ${stats.user1.pointsPercent}%`}
        />
        <div
          className="fairness-p2"
          style={{ width: `${stats.user2.pointsPercent}%` }}
          title={`${user2?.name}: ${stats.user2.pointsPercent}%`}
        />
      </div>
      <div className="fairness-legend">
        <span className="legend-p1">
          {user1?.avatar} {user1?.name}: {stats.user1.pointsPercent}% ({stats.user1.pointsDone} pts)
        </span>
        <span className="legend-p2">
          {user2?.avatar} {user2?.name}: {stats.user2.pointsPercent}% ({stats.user2.pointsDone} pts)
        </span>
      </div>
    </div>
  );
}
