'use client';

import { useTransition } from 'react';
import { deleteTemplate, setTemplateActive } from '@/actions/templates';
import { regenerateWeek } from '@/actions/tasks';
import type { TemplateView } from '@/lib/queries';
import { useToast } from './ToastProvider';

export function TemplateActions({ template }: { template: TemplateView }) {
  const { toast, toastError } = useToast();
  const [pending, startTransition] = useTransition();

  function remove() {
    const message = template.active
      ? `"${template.name}" dejará de generar tareas nuevas.\n\nEl histórico de lo ya hecho se conserva. ¿Continuar?`
      : `¿Reactivar "${template.name}"?`;

    if (!confirm(message)) return;

    startTransition(async () => {
      const result = template.active
        ? await deleteTemplate(template.id)
        : await setTemplateActive(template.id, true);

      if (result.ok) toast(result.message ?? 'Hecho', template.active ? '🗑️' : '🔄');
      else toastError(result.error);
    });
  }

  return (
    <button
      type="button"
      className="icon-btn"
      disabled={pending}
      onClick={remove}
      title={template.active ? 'Dejar de repetir' : 'Reactivar'}
      style={template.active ? { color: 'var(--danger)' } : undefined}
    >
      {template.active ? '🗑️' : '↩️'}
    </button>
  );
}

export function RegenerateWeekButton() {
  const { toast, toastError } = useToast();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      className="btn-secondary"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await regenerateWeek();
          if (result.ok) toast(result.message ?? 'Semana al día', '🔄');
          else toastError(result.error);
        })
      }
    >
      {pending ? 'Comprobando…' : '🔄 Comprobar tareas de esta semana'}
    </button>
  );
}
