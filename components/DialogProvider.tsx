'use client';

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import type { TaskView, TemplateView, UserView } from '@/lib/queries';

export interface AddTaskPreset {
  dueDate?: string;
  isRecurring?: boolean;
  template?: TemplateView;
}

interface DialogState {
  addTask: AddTaskPreset | null;
  taskActions: TaskView | null;
  weekDetail: string | null;
}

interface DialogApi extends DialogState {
  users: UserView[];
  today: string;
  openAddTask: (preset?: AddTaskPreset) => void;
  openTaskActions: (task: TaskView) => void;
  openWeekDetail: (weekStart: string) => void;
  closeAll: () => void;
}

const DialogContext = createContext<DialogApi | null>(null);

export function useDialogs(): DialogApi {
  const context = useContext(DialogContext);
  if (!context) throw new Error('useDialogs fuera de DialogProvider');
  return context;
}

export function DialogProvider({
  users,
  today,
  children,
}: {
  users: UserView[];
  today: string;
  children: ReactNode;
}) {
  const [state, setState] = useState<DialogState>({
    addTask: null,
    taskActions: null,
    weekDetail: null,
  });

  const api = useMemo<DialogApi>(
    () => ({
      ...state,
      users,
      today,
      openAddTask: (preset = {}) =>
        setState({ addTask: preset, taskActions: null, weekDetail: null }),
      openTaskActions: (task) => setState({ addTask: null, taskActions: task, weekDetail: null }),
      openWeekDetail: (weekStart) =>
        setState({ addTask: null, taskActions: null, weekDetail: weekStart }),
      closeAll: () => setState({ addTask: null, taskActions: null, weekDetail: null }),
    }),
    [state, users, today],
  );

  return <DialogContext.Provider value={api}>{children}</DialogContext.Provider>;
}
