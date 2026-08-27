/**
 * Interruptor de apagado del service worker antiguo.
 *
 * La versión anterior de esta app registraba un service worker cache-first para
 * TODAS las peticiones, con un nombre de caché fijo ('hogar-app-v1') que nunca
 * cambiaba. Consecuencia: cualquier móvil con la PWA instalada seguía sirviendo
 * el JavaScript viejo para siempre, aunque se desplegara una versión nueva.
 *
 * Este fichero ocupa la MISMA ruta (/sw.js), así que los navegadores que ya lo
 * tenían registrado se descargan este, que borra las cachés, se desinstala y
 * recarga las pestañas abiertas.
 *
 * La app nueva no registra ningún service worker. Sigue siendo instalable en el
 * móvil vía manifest.json; simplemente no funciona sin conexión.
 */

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const keys = await caches.keys();
        await Promise.all(keys.map((key) => caches.delete(key)));
      } catch (error) {
        // Si el borrado de cachés falla, la desinstalación sigue mereciendo la pena.
      }

      await self.registration.unregister();

      const clients = await self.clients.matchAll({ type: 'window' });
      for (const client of clients) {
        client.navigate(client.url);
      }
    })(),
  );
});
