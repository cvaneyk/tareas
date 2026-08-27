/**
 * Base de datos para los tests de integración.
 *
 * PGlite es PostgreSQL de verdad compilado a WASM, en el mismo proceso. A
 * diferencia de un mock, respeta las restricciones UNIQUE, las transacciones y
 * los advisory locks — que es justo lo que hay que verificar aquí.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { PrismaPGlite } from 'pglite-prisma-adapter';
import { PrismaClient } from '../generated/prisma/client';

const here = dirname(fileURLToPath(import.meta.url));
const MIGRATION = join(here, '..', 'prisma', 'migrations', '20260827000000_init', 'migration.sql');

export const pglite = new PGlite();
export const prisma = new PrismaClient({ adapter: new PrismaPGlite(pglite) });

/** Esquema limpio, aplicando la misma migración que va a producción. */
export async function resetDatabase(): Promise<void> {
  await pglite.exec('DROP SCHEMA IF EXISTS public CASCADE;');
  await pglite.exec(readFileSync(MIGRATION, 'utf8'));
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
