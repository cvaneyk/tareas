'use client';

import { useTransition } from 'react';
import { setTaskStatus } from '@/actions/tasks';
import type { TaskView, UserView } from '@/lib/queries';
import { useToast } from './ToastProvider';

/**
 * Tarea sugerida: se propone, pero omitirla no cuenta como incumplimiento.
 * En la app antigua "sugerida" era a la vez un tipo y una frecuencia; aquí es
 * un flag de la plantilla.
 */
export function SuggestedCard({ task, users }: { task: TaskView; users: UserView[] }) {
  const { toast, toastError } = useToast();
  const [pending, startTransition] = useTransition();

  const owner = users.find((u) => u.id === task.assignedToId);

  function decide(status: 'COMPLETED' | 'SKIPPED') {
    startTransition(async () => {
      const result = await setTaskStatus(task.id, status);
      if (!result.ok) toastError(result.error);
      else if (status === 'COMPLETED') toast('¡Hecho! 🧺', '✨');
      else toast('Omitida hoy, sin penalización', '👍');
    });
  }

  return (
    <div className="suggested-card">
      <div className="suggested-title">
        <span>🧺</span>
        <span>{task.notes || task.name}</span>
      </div>
      <div className="suggested-desc">
        Sugerencia de hoy para <strong>{owner?.name ?? 'la casa'}</strong>. Si no hace falta, puedes
        omitirla sin que cuente como incumplida.
      </div>
      <div className="suggested-actions">
        <button
          type="button"
          className="btn-primary"
          disabled={pending}
          style={{ fontSize: '0.88rem', padding: '8px 16px' }}
          onClick={() => decide('COMPLETED')}
        >
          ✓ Sí, hecho
        </button>
        <button
          type="button"
          className="btn-secondary"
          disabled={pending}
          style={{ fontSize: '0.88rem', padding: '8px 16px' }}
          onClick={() => decide('SKIPPED')}
        >
          ✕ Omitir hoy
        </button>
      </div>
    </div>
  );
}
