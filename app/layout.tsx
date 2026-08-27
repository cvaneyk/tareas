import type { Metadata, Viewport } from 'next';
import './globals.css';
import { AppShell } from '@/components/AppShell';
import { getHouse } from '@/lib/queries';

export const metadata: Metadata = {
  title: 'Hogar — Tareas Compartidas',
  description: 'Gestión y reparto equitativo de las tareas del hogar para dos personas',
  manifest: '/manifest.json',
  icons: {
    icon: 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🏠</text></svg>',
  },
};

export const viewport: Viewport = {
  themeColor: '#2563eb',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

// Los datos se leen en cada petición: la pantalla siempre refleja la base de
// datos, no una copia local que pueda haber divergido.
export const dynamic = 'force-dynamic';

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const house = await getHouse();
  const [user1, user2] = house.users;

  return (
    <html
      lang="es"
      data-theme={house.settings.theme}
      data-house-name={house.settings.houseName}
      data-start-day={house.settings.startDay}
      data-timezone={house.settings.timezone}
      style={
        {
          '--user1-color': user1?.color ?? '#3b82f6',
          '--user1-text': user1?.color ?? '#3b82f6',
          '--user2-color': user2?.color ?? '#10b981',
          '--user2-text': user2?.color ?? '#10b981',
        } as React.CSSProperties
      }
    >
      <body>
        <AppShell house={house}>{children}</AppShell>
        <UnregisterLegacyServiceWorker />
      </body>
    </html>
  );
}

/**
 * Desinstala el service worker de la versión anterior.
 *
 * El sw.js antiguo era cache-first para TODAS las peticiones con un nombre de
 * caché fijo, así que los móviles con la PWA instalada seguirían sirviendo el
 * JavaScript viejo indefinidamente. public/sw.js ya se auto-desinstala, pero
 * esto cubre a los navegadores que no lleguen a volver a pedirlo.
 */
function UnregisterLegacyServiceWorker() {
  const script = `
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then(function (rs) {
        rs.forEach(function (r) { r.unregister(); });
      }).catch(function () {});
      if (window.caches) {
        caches.keys().then(function (keys) {
          keys.forEach(function (k) { caches.delete(k); });
        }).catch(function () {});
      }
    }
  `;
  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
