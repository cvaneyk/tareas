'use client';

import { useOptimistic, useTransition } from 'react';
import { setSubtaskStatus, setTaskStatus } from '@/actions/tasks';
import { getCategory } from '@/lib/catalog';
import type { TaskView, UserView } from '@/lib/queries';
import { useDialogs } from './DialogProvider';
import { useToast } from './ToastProvider';

function userById(users: UserView[], id: string): UserView {
  return users.find((u) => u.id === id) ?? users[0] ?? { id, name: id, color: '#64748b', avatar: '👤' };
}

function userChipClass(users: UserView[], id: string): string {
  return users[0]?.id === id ? 'user1' : 'user2';
}

export function TaskCard({ task, users }: { task: TaskView; users: UserView[] }) {
  if (task.status === 'SKIPPED') return null;
  if (task.type === 'BIG_CLEAN' && task.subtasks.length > 0) {
    return <BigCleanCard task={task} users={users} />;
  }
  return <SimpleTaskCard task={task} users={users} />;
}

function SimpleTaskCard({ task, users }: { task: TaskView; users: UserView[] }) {
  const { openTaskActions } = useDialogs();
  const { toast, toastError } = useToast();
  const [, startTransition] = useTransition();

  // La casilla responde al instante; si el servidor rechaza el cambio, React
  // revierte el estado optimista y mostramos el error.
  const [status, setStatus] = useOptimistic(task.status);
  const completed = status === 'COMPLETED';
  const category = getCategory(task.category);

  function toggle(next: boolean) {
    startTransition(async () => {
      setStatus(next ? 'COMPLETED' : 'PENDING');
      const result = await setTaskStatus(task.id, next ? 'COMPLETED' : 'PENDING');
      if (!result.ok) toastError(result.error);
      else if (next) toast(`¡"${task.name}" completada!`, '🎉');
    });
  }

  return (
    <div className={`task-card ${completed ? 'completed' : ''}`}>
      <div className="task-checkbox-wrap">
        <input
          type="checkbox"
          className="task-checkbox"
          checked={completed}
          onChange={(e) => toggle(e.target.checked)}
          aria-label={`Marcar "${task.name}" como ${completed ? 'pendiente' : 'completada'}`}
        />
      </div>

      <button type="button" className="task-body" onClick={() => openTaskActions(task)}>
        <div className="task-header-row">
          <span className="task-name">{task.name}</span>
        </div>
        <div className="task-meta">
          <span className="meta-pill">
            {category.icon} {category.label}
          </span>
          <span className="meta-pill weight">⚡ {task.weight} pt</span>
          {task.estimatedMinutes ? (
            <span className="meta-pill">⏱️ {task.estimatedMinutes}m</span>
          ) : null}
          {task.priority ? (
            <span className="meta-pill chapuza">
              {task.priority === 'high' ? 'Prioridad alta' : 'Prioridad media'}
            </span>
          ) : null}
          {task.notes ? <div className="task-note">&ldquo;{task.notes}&rdquo;</div> : null}
        </div>
      </button>

      <button
        type="button"
        className="task-actions-btn"
        onClick={() => openTaskActions(task)}
        aria-label="Opciones de la tarea"
      >
        ⋮
      </button>
    </div>
  );
}

function BigCleanCard({ task, users }: { task: TaskView; users: UserView[] }) {
  const { toastError } = useToast();
  const [, startTransition] = useTransition();

  const [subtasks, setSubtasks] = useOptimistic(
    task.subtasks,
    (current, update: { id: string; completed: boolean }) =>
      current.map((s) =>
        s.id === update.id ? { ...s, status: update.completed ? 'COMPLETED' : 'PENDING' } : s,
      ) as typeof current,
  );

  const done = subtasks.filter((s) => s.status === 'COMPLETED').length;
  const total = subtasks.length;

  function toggleSubtask(id: string, completed: boolean) {
    startTransition(async () => {
      setSubtasks({ id, completed });
      const result = await setSubtaskStatus(id, completed);
      if (!result.ok) toastError(result.error);
    });
  }

  return (
    <div className="big-clean-card">
      <div className="big-clean-header">
        <div className="big-clean-title">
          <span>🧽</span>
          <span>{task.name}</span>
        </div>
        <span className="badge" style={{ background: 'var(--primary-light)', color: 'var(--primary)', fontWeight: 700 }}>
          {done} / {total} completadas
        </span>
      </div>

      <div className="progress-bar-track" style={{ height: 6, marginBottom: 12 }}>
        <div
          className="progress-bar-fill"
          style={{ width: `${total > 0 ? (done / total) * 100 : 0}%` }}
        />
      </div>

      <div className="subtasks-container">
        {subtasks.map((sub) => {
          const owner = userById(users, sub.assigneeUserId);
          const subDone = sub.status === 'COMPLETED';
          return (
            <div key={sub.id} className={`subtask-item ${subDone ? 'completed' : ''}`}>
              <div className="subtask-left">
                <input
                  type="checkbox"
                  className="subtask-checkbox"
                  checked={subDone}
                  onChange={(e) => toggleSubtask(sub.id, e.target.checked)}
                  aria-label={`Marcar "${sub.name}"`}
                />
                <span className="subtask-name">{sub.name}</span>
              </div>
              <span
                className={`user-chip ${userChipClass(users, sub.assigneeUserId)}`}
                style={{ fontSize: '0.72rem', padding: '2px 7px' }}
              >
                {owner.avatar} {owner.name}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
