'use client';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

interface Toast {
  id: number;
  message: string;
  icon: string;
  tone: 'ok' | 'error';
}

interface ToastApi {
  toast: (message: string, icon?: string) => void;
  toastError: (message: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast fuera de ToastProvider');
  return context;
}

let nextId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((message: string, icon: string, tone: Toast['tone']) => {
    const id = nextId++;
    setToasts((current) => [...current, { id, message, icon, tone }]);
    setTimeout(() => setToasts((current) => current.filter((t) => t.id !== id)), 3200);
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      toast: (message, icon = '✨') => push(message, icon, 'ok'),
      // Los errores se ven. La app antigua los tragaba con `catch {}` vacíos,
      // así que un fallo de guardado era indistinguible de un éxito.
      toastError: (message) => push(message, '⚠️', 'error'),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toast-container">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="toast"
            role="status"
            style={t.tone === 'error' ? { borderColor: 'var(--danger)' } : undefined}
          >
            <span>{t.icon}</span>
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
