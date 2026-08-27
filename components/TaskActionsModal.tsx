'use client';

import { useTransition } from 'react';
import { deleteTask, postponeTask, reassignTask, setTaskStatus } from '@/actions/tasks';
import { getCategory } from '@/lib/catalog';
import { formatDateEs, capitalize } from '@/lib/dates';
import { Modal } from './Modal';
import { useDialogs } from './DialogProvider';
import { useToast } from './ToastProvider';
import type { ActionResult } from '@/lib/schemas';

export function TaskActionsModal() {
  const { taskActions: task, users, closeAll } = useDialogs();
  const { toast, toastError } = useToast();
  const [pending, startTransition] = useTransition();

  if (!task) return null;

  const category = getCategory(task.category);
  const owner = users.find((u) => u.id === task.assignedToId);
  const other = users.find((u) => u.id !== task.assignedToId);
  const completed = task.status === 'COMPLETED';

  function run(action: () => Promise<ActionResult>, successIcon = '✅') {
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        if (result.message) toast(result.message, successIcon);
        closeAll();
      } else {
        toastError(result.error);
      }
    });
  }

  return (
    <Modal title="Opciones de tarea" onClose={closeAll}>
      <div className="modal-body">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <span style={{ fontSize: '1.6rem' }}>{category.icon}</span>
          <div>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 800 }}>{task.name}</h3>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              {owner?.name ?? 'Sin asignar'} · {capitalize(formatDateEs(task.dueDate))} ·{' '}
              {task.weight} pt
            </div>
          </div>
        </div>

        {task.notes ? (
          <div
            style={{
              fontSize: '0.85rem',
              color: 'var(--text-muted)',
              background: 'var(--bg-surface-subtle)',
              padding: '8px 12px',
              borderRadius: 'var(--radius-sm)',
              marginBottom: 12,
            }}
          >
            📝 {task.notes}
          </div>
        ) : null}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button
            type="button"
            className="btn-secondary"
            disabled={pending}
            style={{ justifyContent: 'flex-start', padding: '12px 16px' }}
            onClick={() =>
              run(async () => {
                const result = await setTaskStatus(task.id, completed ? 'PENDING' : 'COMPLETED');
                return result.ok
                  ? { ok: true, message: completed ? 'Marcada pendiente' : '¡Completada!' }
                  : result;
              }, completed ? '↩️' : '🎉')
            }
          >
            {completed ? '↩️ Marcar como PENDIENTE' : '✓ Marcar como COMPLETADA'}
          </button>

          {other ? (
            <button
              type="button"
              className="btn-secondary"
              disabled={pending}
              style={{ justifyContent: 'flex-start', padding: '12px 16px' }}
              onClick={() => run(() => reassignTask(task.id), '🔄')}
            >
              👥 Reasignar a {other.avatar} <strong>{other.name}</strong>
            </button>
          ) : null}

          <button
            type="button"
            className="btn-secondary"
            disabled={pending}
            style={{ justifyContent: 'flex-start', padding: '12px 16px' }}
            onClick={() => run(() => postponeTask(task.id, 1), '🗓️')}
          >
            ⏳ Posponer para mañana
          </button>

          {task.suggestible && task.status === 'PENDING' ? (
            <button
              type="button"
              className="btn-secondary"
              disabled={pending}
              style={{ justifyContent: 'flex-start', padding: '12px 16px' }}
              onClick={() =>
                run(async () => {
                  const result = await setTaskStatus(task.id, 'SKIPPED');
                  return result.ok ? { ok: true, message: 'Omitida sin penalización' } : result;
                }, '👍')
              }
            >
              ⚪ Omitir hoy (sin penalización)
            </button>
          ) : null}

          <button
            type="button"
            className="btn-secondary"
            disabled={pending}
            style={{ justifyContent: 'flex-start', padding: '12px 16px', color: 'var(--danger)' }}
            onClick={() => {
              if (confirm(`¿Eliminar la tarea "${task.name}"?`)) {
                run(() => deleteTask(task.id), '🗑️');
              }
            }}
          >
            🗑️ Eliminar esta tarea
          </button>
        </div>

        {task.templateId ? (
          <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 14 }}>
            Esta tarea viene de una recurrente. Eliminarla solo borra la de este día; para dejar de
            repetirla, ve a <strong>Recurrentes</strong>.
          </p>
        ) : null}
      </div>
    </Modal>
  );
}
