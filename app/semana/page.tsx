import Link from 'next/link';
import { AddTaskButton } from '@/components/AddTaskButton';
import { TaskCard } from '@/components/TaskCard';
import { addDays, capitalize, formatDateEs, formatWeekRange, weekDates, weekStart } from '@/lib/dates';
import { getHouse, getWeekTasks, statsFor, userIdsOf } from '@/lib/queries';

export default async function WeekPage({
  searchParams,
}: {
  searchParams: Promise<{ semana?: string; quien?: string }>;
}) {
  const params = await searchParams;
  const house = await getHouse();
  const startDay = house.settings.startDay;

  const base = /^\d{4}-\d{2}-\d{2}$/.test(params.semana ?? '') ? params.semana! : house.today;
  const { start, tasks } = await getWeekTasks(base, startDay);

  const filter = params.quien ?? 'all';
  const visible = filter === 'all' ? tasks : tasks.filter((t) => t.assignedToId === filter);
  const stats = statsFor(tasks, userIdsOf(house));

  const previous = addDays(start, -7);
  const next = addDays(start, 7);
  const currentStart = weekStart(house.today, startDay);
  const isCurrent = start === currentStart;

  const href = (week: string, quien = filter) =>
    `/semana?semana=${week}${quien !== 'all' ? `&quien=${quien}` : ''}`;

  return (
    <>
      <div className="section-title-wrap">
        <h3 className="section-title">
          <span>📅 Semana</span>
          <span className="badge">{stats.completionRate}% completada</span>
        </h3>
      </div>

      <div className="week-navigator">
        <Link className="icon-btn" href={href(previous)} aria-label="Semana anterior">
          ‹
        </Link>
        <div className="week-label">
          {formatWeekRange(start)}
          {isCurrent ? ' · esta semana' : ''}
        </div>
        <Link className="icon-btn" href={href(next)} aria-label="Semana siguiente">
          ›
        </Link>
      </div>

      {!isCurrent ? (
        <div style={{ marginBottom: 12 }}>
          <Link className="btn-secondary" href={href(currentStart)} style={{ fontSize: '0.85rem' }}>
            Volver a esta semana
          </Link>
        </div>
      ) : null}

      <div className="week-filters">
        <Link className={`filter-chip ${filter === 'all' ? 'active' : ''}`} href={href(start, 'all')}>
          Todas
        </Link>
        {house.users.map((u) => (
          <Link
            key={u.id}
            className={`filter-chip ${filter === u.id ? 'active' : ''}`}
            href={href(start, u.id)}
          >
            {u.avatar} {u.name}
          </Link>
        ))}
      </div>

      {weekDates(start).map((date) => {
        const dayTasks = visible.filter((t) => t.dueDate === date && t.status !== 'SKIPPED');
        const isToday = date === house.today;

        return (
          <div key={date} className={`day-card ${isToday ? 'is-today' : ''}`}>
            <div className="day-card-header">
              <span className="day-name">
                {capitalize(formatDateEs(date, { weekday: 'long', day: 'numeric', month: 'short' }))}
                {isToday ? ' · hoy' : ''}
              </span>
              <AddTaskButton
                dueDate={date}
                className="icon-btn"
                title={`Añadir tarea el ${date}`}
              >
                ＋
              </AddTaskButton>
            </div>

            <div className="task-list">
              {dayTasks.length > 0 ? (
                dayTasks.map((task) => <TaskCard key={task.id} task={task} users={house.users} />)
              ) : (
                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', padding: '6px 0' }}>
                  Sin tareas
                </div>
              )}
            </div>
          </div>
        );
      })}
    </>
  );
}
