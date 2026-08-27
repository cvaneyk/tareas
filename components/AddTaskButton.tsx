'use client';

import type { CSSProperties, ReactNode } from 'react';
import { useDialogs } from './DialogProvider';
import type { TemplateView } from '@/lib/queries';

/**
 * Abre el modal de nueva tarea (o de edición, si se le pasa una plantilla).
 * Existe para que las páginas puedan seguir siendo Server Components.
 */
export function AddTaskButton({
  children,
  dueDate,
  isRecurring,
  template,
  className = 'btn-secondary',
  style,
  title,
}: {
  children: ReactNode;
  dueDate?: string;
  isRecurring?: boolean;
  template?: TemplateView;
  className?: string;
  style?: CSSProperties;
  title?: string;
}) {
  const { openAddTask } = useDialogs();

  return (
    <button
      type="button"
      className={className}
      style={style}
      title={title}
      onClick={() => openAddTask({ dueDate, isRecurring, template })}
    >
      {children}
    </button>
  );
}
