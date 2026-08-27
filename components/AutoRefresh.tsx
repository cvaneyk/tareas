'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Mantiene la pantalla al día con lo que hace la otra persona.
 *
 * Es un refetch, no una sincronización: pide al servidor los datos actuales y
 * vuelve a renderizar. No puede pisar cambios locales porque no existen cambios
 * locales sin confirmar — toda escritura pasa por una Server Action antes de
 * verse.
 *
 * Esto sustituye al `setInterval` de 10 s de la app antigua, que sobrescribía
 * localStorage entero con la respuesta del servidor y se comía los cambios que
 * aún no habían llegado a subir.
 */
export function AutoRefresh({ intervalMs = 20_000 }: { intervalMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === 'visible') router.refresh();
    };

    const timer = setInterval(refresh, intervalMs);
    // Al volver a la app en el móvil, refresca de inmediato.
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('online', refresh);

    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('online', refresh);
    };
  }, [router, intervalMs]);

  return null;
}
