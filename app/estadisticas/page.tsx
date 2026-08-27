import Link from 'next/link';
import { FairnessMeter } from '@/components/FairnessMeter';
import { ACTIVITY_LABELS, getCategory } from '@/lib/catalog';
import { addDays, formatMinutes } from '@/lib/dates';
import { calculateStats } from '@/lib/stats';
import { getActivity, getHouse, getTasksSince, userIdsOf } from '@/lib/queries';

const PERIODS = {
  week: { days: 7, label: 'Últimos 7 días' },
  month: { days: 30, label: 'Últimos 30 días' },
  quarter: { days: 90, label: 'Últimos 90 días' },
} as const;

type PeriodKey = keyof typeof PERIODS;

export default async function StatsPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string }>;
}) {
  const params = await searchParams;
  const key: PeriodKey = params.periodo && params.periodo in PERIODS ? (params.periodo as PeriodKey) : 'month';

  const house = await getHouse();
  const from = addDays(house.today, -(PERIODS[key].days - 1));
  const [tasks, activity] = await Promise.all([
    getTasksSince(from, house.today),
    getActivity(25),
  ]);

  const stats = calculateStats(tasks, userIdsOf(house));
  const [user1, user2] = house.users;

  const categories = Object.entries(stats.categoryCounts).sort((a, b) => b[1] - a[1]);
  const maxCategory = categories[0]?.[1] ?? 1;
  const totalMinutes = stats.user1.minutesDone + stats.user2.minutesDone;

  return (
    <>
      <div className="section-title-wrap">
        <h3 className="section-title">
          <span>📊 Estadísticas</span>
        </h3>
      </div>

      <div className="week-filters">
        {(Object.keys(PERIODS) as PeriodKey[]).map((p) => (
          <Link
            key={p}
            className={`filter-chip ${key === p ? 'active' : ''}`}
            href={`/estadisticas?periodo=${p}`}
          >
            {PERIODS[p].label}
          </Link>
        ))}
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-title">Cumplimiento</div>
          <div className="stat-value" style={{ color: 'var(--primary)' }}>
            {stats.completionRate}%
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            {stats.completedTasks} de {stats.totalTasks}
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-title">Tiempo invertido</div>
          <div className="stat-value">{formatMinutes(totalMinutes)}</div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>entre los dos</div>
        </div>

        <div className="stat-card">
          <div className="stat-title">Puntos totales</div>
          <div className="stat-value">{stats.totalPoints}</div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            {stats.skippedTasks} omitidas
          </div>
        </div>
      </div>

      <div className="card">
        <h3 style={{ fontSize: '1.1rem', fontWeight: 750, marginBottom: 14 }}>
          ⚖️ Reparto equitativo
        </h3>
        <FairnessMeter stats={stats} users={house.users} />

        <div style={{ display: 'flex', gap: 16, marginTop: 16, flexWrap: 'wrap' }}>
          {[
            { user: user1, data: stats.user1 },
            { user: user2, data: stats.user2 },
          ]
            .filter((entry) => entry.user)
            .map(({ user, data }) => (
              <div key={user.id} style={{ flex: '1 1 160px' }}>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>
                  {user.avatar} {user.name}
                </div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.7 }}>
                  {data.tasksDone} tareas hechas
                  <br />
                  {data.pointsDone} puntos · {formatMinutes(data.minutesDone)}
                  <br />
                  {data.pointsAssigned} puntos asignados
                </div>
              </div>
            ))}
        </div>
      </div>

      <div className="card">
        <h3 style={{ fontSize: '1.1rem', fontWeight: 750, marginBottom: 16 }}>
          📊 Tareas por categoría
        </h3>
        {categories.length > 0 ? (
          <div className="category-stats-list">
            {categories.map(([id, count]) => {
              const category = getCategory(id);
              return (
                <div key={id} className="cat-stat-item">
                  <div className="cat-stat-row">
                    <span>
                      {category.icon} {category.label}
                    </span>
                    <strong>{count}</strong>
                  </div>
                  <div className="cat-progress-track">
                    <div
                      className="cat-progress-fill"
                      style={{
                        width: `${(count / maxCategory) * 100}%`,
                        backgroundColor: category.color,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            Aún no hay tareas completadas en este periodo.
          </p>
        )}
      </div>

      <div className="card">
        <h3 style={{ fontSize: '1.1rem', fontWeight: 750, marginBottom: 16 }}>
          📜 Historial de actividad
        </h3>
        {activity.length > 0 ? (
          <div className="activity-list">
            {activity.map((entry) => {
              const meta = ACTIVITY_LABELS[entry.action] ?? { icon: '•', verb: entry.action };
              const who = house.users.find((u) => u.id === entry.userId);
              return (
                <div key={entry.id} className="activity-item">
                  <span className="activity-icon">{meta.icon}</span>
                  <div className="activity-content">
                    <div className="activity-text">
                      <strong>{who?.name ?? 'Alguien'}</strong> {meta.verb}{' '}
                      <strong>{entry.taskName}</strong>
                    </div>
                    <div className="activity-time">
                      {new Date(entry.createdAt).toLocaleString('es-ES', {
                        day: 'numeric',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                        timeZone: house.settings.timezone,
                      })}
                      {entry.details ? ` · ${entry.details}` : ''}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Sin actividad todavía.</p>
        )}
      </div>
    </>
  );
}
