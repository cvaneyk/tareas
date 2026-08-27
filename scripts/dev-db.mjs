/**
 * Servidor PostgreSQL local para desarrollo y verificación, sin Docker.
 *
 * PGlite es PostgreSQL real compilado a WASM; pglite-socket lo expone por TCP
 * hablando el protocolo de cable de Postgres, así que la app se conecta con la
 * misma DATABASE_URL que usará en producción.
 *
 * Para uso diario es preferible docker-compose.yml (Postgres de verdad,
 * persistente). Esto es la alternativa cuando no hay Docker a mano.
 */

import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';

const dataDir = process.env.PGLITE_DIR ?? './.pglite';
const port = Number(process.env.PGLITE_PORT ?? 5432);

const db = await PGlite.create(dataDir);
const server = new PGLiteSocketServer({
  db,
  port,
  host: '127.0.0.1',
  // Por defecto es 1; el pool de la app abre varias.
  maxConnections: Number(process.env.PGLITE_MAX_CONNECTIONS ?? 20),
});

await server.start();
console.log(`PostgreSQL (PGlite) escuchando en 127.0.0.1:${port}, datos en ${dataDir}`);

const shutdown = async () => {
  await server.stop();
  await db.close();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
