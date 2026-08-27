import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/generated/prisma/client';

// En desarrollo Next recarga los módulos en caliente; sin este singleton cada
// recarga abriría un pool nuevo hasta agotar las conexiones de PostgreSQL.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      'Falta DATABASE_URL. Copia .env.example a .env y pon la cadena de conexión a PostgreSQL.',
    );
  }

  // Tamaño del pool. Por defecto el de pg (10), suficiente para dos personas.
  // Bajarlo es útil si el PostgreSQL del hosting tiene pocas conexiones, o
  // contra el servidor local de PGlite, que solo admite una a la vez.
  const max = Number(process.env.DATABASE_POOL_MAX);

  return new PrismaClient({
    adapter: new PrismaPg({
      connectionString,
      ...(Number.isFinite(max) && max > 0 ? { max } : {}),
    }),
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
