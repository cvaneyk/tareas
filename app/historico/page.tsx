import Link from 'next/link';
import { formatWeekRange } from '@/lib/dates';
import { getHouse, getWeekHistory, userIdsOf } from '@/lib/queries';

export default async function HistoryPage() {
  const house = await getHouse();
  const weeks = await getWeekHistory(12, userIdsOf(house), house.settings.startDay, house.today);

  const [user1, user2] = house.users;

  return (
    <>
      <div className="section-title-wrap">
        <h3 className="section-title">
          <span>🗂️ Histórico</span>
          <span className="badge">{weeks.length} semanas</span>
        </h3>
      </div>

      <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', marginBottom: 16 }}>
        Solo aparecen las semanas con tareas registradas. Nada de esto se genera a posteriori: es lo
        que ocurrió de verdad.
      </p>

      {weeks.map((week) => (
        <Link
          key={week.start}
          href={`/semana?semana=${week.start}`}
          className="card"
          style={{ display: 'block', marginBottom: 12, cursor: 'pointer' }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 10,
            }}
          >
            <div>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 750 }}>{formatWeekRange(week.start)}</h3>
              <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: 2 }}>
                {week.stats.completedTasks} completadas · {week.stats.pendingTasks} pendientes
                {week.stats.skippedTasks > 0 ? ` · ${week.stats.skippedTasks} omitidas` : ''}
              </div>
            </div>
            <span
              style={{
                fontSize: '1.4rem',
                fontWeight: 800,
                color:
                  week.stats.completionRate >= 80
                    ? 'var(--success)'
                    : week.stats.completionRate >= 50
                      ? 'var(--warning)'
                      : 'var(--danger)',
              }}
            >
              {week.stats.completionRate}%
            </span>
          </div>

          <div className="progress-bar-track">
            <div
              className="progress-bar-fill"
              style={{ width: `${week.stats.completionRate}%` }}
            />
          </div>

          <div className="fairness-bar" style={{ marginTop: 10 }}>
            <div className="fairness-p1" style={{ width: `${week.stats.user1.pointsPercent}%` }} />
            <div className="fairness-p2" style={{ width: `${week.stats.user2.pointsPercent}%` }} />
          </div>
          <div className="fairness-legend">
            <span className="legend-p1">
              {user1?.name}: {week.stats.user1.pointsDone} pts
            </span>
            <span className="legend-p2">
              {user2?.name}: {week.stats.user2.pointsDone} pts
            </span>
          </div>
        </Link>
      ))}

      {weeks.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
          Todavía no hay histórico. Aparecerá según vayáis completando tareas.
        </div>
      ) : null}
    </>
  );
}
