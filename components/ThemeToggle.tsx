'use client';

import { useTransition } from 'react';
import { updateHouse } from '@/actions/settings';
import { useToast } from './ToastProvider';

/**
 * El tema se guarda en la base de datos, así que es el mismo en los dos
 * móviles. Se aplica de inmediato al DOM para que el cambio no espere al
 * viaje al servidor.
 */
export function ThemeToggle({ current }: { current: string }) {
  const { toast, toastError } = useToast();
  const [pending, startTransition] = useTransition();

  function toggle() {
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);

    startTransition(async () => {
      const settings = {
        theme: next,
        houseName: document.documentElement.dataset.houseName ?? 'Nuestra Casa 🏠',
        startDay: document.documentElement.dataset.startDay ?? 'monday',
        timezone: document.documentElement.dataset.timezone ?? 'Europe/Madrid',
      };

      const result = await updateHouse(settings);
      if (!result.ok) {
        document.documentElement.setAttribute('data-theme', current);
        toastError(result.error);
      } else {
        toast(`Modo ${next === 'dark' ? 'oscuro' : 'claro'} activado`, next === 'dark' ? '🌙' : '☀️');
      }
    });
  }

  return (
    <button
      type="button"
      className="icon-btn"
      onClick={toggle}
      disabled={pending}
      title="Cambiar tema"
      aria-label="Cambiar tema"
    >
      🌓
    </button>
  );
}
