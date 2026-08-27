import { FairnessMeter } from '@/components/FairnessMeter';
import { SuggestedCard } from '@/components/SuggestedCard';
import { TaskCard } from '@/components/TaskCard';
import { AddTaskButton } from '@/components/AddTaskButton';
import { getCategory } from '@/lib/catalog';
import { addDays, capitalize, formatDateEs, formatWeekRange } from '@/lib/dates';
import { getHouse, getWeekTasks, statsFor, userIdsOf, type TaskView, type UserView } from '@/lib/queries';

export default async function DashboardPage() {
  const house = await getHouse();
  const today = house.today;
  const { start, tasks } = await getWeekTasks(today, house.settings.startDay);

  const stats = statsFor(tasks, userIdsOf(house));
  const [user1, user2] = house.users;

  const todayTasks = tasks.filter((t) => t.dueDate === today && t.status !== 'SKIPPED');
  const suggested = todayTasks.find((t) => t.suggestible && t.status === 'PENDING');
  const chapuza = tasks.find((t) => t.type === 'CHAPUZA');

  const weekEnd = addDays(start, 6);
  const upcoming = tasks
    .filter((t) => t.dueDate > today && t.dueDate <= weekEnd && t.status === 'PENDING')
    .slice(0, 5);

  return (
    <>
      <div className="dashboard-greeting">
        <h2 className="greeting-text">Hola 👋</h2>
        <p className="date-subtext">
          {capitalize(
            formatDateEs(today, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
          )}
        </p>
      </div>

      <div className="card week-summary-card">
        <div className="week-summary-header">
          <div>
            <span className="week-summary-title">Esta semana</span>
            <div
              style={{
                fontWeight: 700,
                fontSize: '1.1rem',
                color: 'var(--text-main)',
                marginTop: 2,
              }}
            >
              {formatWeekRange(start)}
            </div>
          </div>
          <span className="week-summary-percent">{stats.completionRate}%</span>
        </div>

        <div className="progress-bar-track">
          <div className="progress-bar-fill" style={{ width: `${stats.completionRate}%` }} />
        </div>

        <div className="week-summary-footer">
          <span>
            {stats.completedTasks} de {stats.totalTasks} tareas completadas
          </span>
          {stats.pendingTasks > 0 ? (
            <span style={{ color: 'var(--warning)', fontWeight: 600 }}>
              {stats.pendingTasks} pendientes
            </span>
          ) : (
            <span style={{ color: 'var(--success)', fontWeight: 700 }}>¡Todo al día! 🎉</span>
          )}
        </div>

        <FairnessMeter stats={stats} users={house.users} />
      </div>

      {suggested ? <SuggestedCard task={suggested} users={house.users} /> : null}

      <div className="section-title-wrap">
        <h3 className="section-title">
          <span>📅 Tareas de hoy</span>
          <span className="badge">{todayTasks.length}</span>
        </h3>
        <AddTaskButton dueDate={today} className="btn-primary" style={{ padding: '6px 14px', fontSize: '0.85rem' }}>
          ＋ Añadir tarea
        </AddTaskButton>
      </div>

      {[user1, user2].filter(Boolean).map((user, index) => (
        <PersonGroup
          key={user.id}
          user={user}
          chip={index === 0 ? 'user1' : 'user2'}
          tasks={todayTasks.filter((t) => t.assignedToId === user.id)}
          users={house.users}
        />
      ))}

      {upcoming.length > 0 ? (
        <>
          <div className="section-title-wrap">
            <h3 className="section-title">
              <span>⏳ Próximamente</span>
            </h3>
          </div>
          <div className="card" style={{ padding: '12px 16px' }}>
            <div className="task-list">
              {upcoming.map((task) => {
                const category = getCategory(task.category);
                const owner = house.users.find((u) => u.id === task.assignedToId);
                const isTomorrow = task.dueDate === addDays(today, 1);
                return (
                  <div
                    key={task.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 0',
                      borderBottom: '1px solid var(--border-subtle)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: '1.2rem' }}>{category.icon}</span>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '0.92rem' }}>{task.name}</div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                          Asignada a {owner?.name}
                        </div>
                      </div>
                    </div>
                    <span
                      className="badge"
                      style={{
                        backgroundColor: 'var(--primary-light)',
                        color: 'var(--primary)',
                        fontWeight: 600,
                        textTransform: 'capitalize',
                      }}
                    >
                      {isTomorrow ? 'Mañana' : formatDateEs(task.dueDate, { weekday: 'long' })}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      ) : null}

      {chapuza ? (
        <>
          <div className="section-title-wrap">
            <h3 className="section-title">
              <span>🔧 Chapuza de la semana</span>
            </h3>
          </div>
          <div className="task-list">
            <TaskCard task={chapuza} users={house.users} />
          </div>
        </>
      ) : null}
    </>
  );
}

function PersonGroup({
  user,
  chip,
  tasks,
  users,
}: {
  user: UserView;
  chip: string;
  tasks: TaskView[];
  users: UserView[];
}) {
  const done = tasks.filter((t) => t.status === 'COMPLETED').length;

  return (
    <div className="task-group">
      <div className="task-group-header">
        <span className={`user-chip ${chip}`}>
          {user.avatar} {user.name}
        </span>
        <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: 500 }}>
          ({done}/{tasks.length} completadas)
        </span>
      </div>
      <div className="task-list">
        {tasks.length > 0 ? (
          tasks.map((task) => <TaskCard key={task.id} task={task} users={users} />)
        ) : (
          <div
            style={{
              fontSize: '0.88rem',
              color: 'var(--text-muted)',
              padding: '8px 12px',
              background: 'var(--bg-surface-subtle)',
              borderRadius: 'var(--radius-md)',
            }}
          >
            No tiene tareas programadas para hoy 🙌
          </div>
        )}
      </div>
    </div>
  );
}
