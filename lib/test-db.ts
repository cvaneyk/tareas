/**
 * Base de datos para los tests de integración.
 *
 * PGlite es PostgreSQL de verdad compilado a WASM, en el mismo proceso. A
 * diferencia de un mock, respeta las restricciones UNIQUE, las transacciones y
 * los advisory locks — que es justo lo que hay que verificar aquí.
 */

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { PrismaPGlite } from 'pglite-prisma-adapter';
import { PrismaClient } from '../generated/prisma/client';
import { applyMigrations } from '../scripts/migrate-deploy';

const here = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS = join(here, '..', 'prisma', 'migrations');

export const pglite = new PGlite();
export const prisma = new PrismaClient({ adapter: new PrismaPGlite(pglite) });

/**
 * Esquema limpio, aplicando TODAS las migraciones con el mismo runner que usa
 * producción. Así los tests corren siempre contra el esquema real y no hay que
 * acordarse de tocar este fichero al añadir una migración.
 */
export async function resetDatabase(): Promise<void> {
  await pglite.exec('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;');

  await applyMigrations(
    {
      exec: (sql) => pglite.exec(sql),
      query: async (sql, params) => {
        const result = await pglite.query(sql, params as unknown[] | undefined);
        return { rows: result.rows as Array<Record<string, unknown>> };
      },
    },
    MIGRATIONS,
  );
}

export async function seedUsers(): Promise<void> {
  await prisma.user.createMany({
    data: [
      { id: 'user-1', name: 'Persona 1', color: '#3b82f6', avatar: '🧑', position: 0 },
      { id: 'user-2', name: 'Persona 2', color: '#10b981', avatar: '🎨', position: 1 },
    ],
  });
  await prisma.houseSettings.create({ data: { id: 'default' } });
}
