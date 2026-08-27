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
  // Bajarlo es útil si el PostgreSQL del hosting tiene pocas conexiones.
  const max = Number(process.env.DATABASE_POOL_MAX);

  return new PrismaClient({
    adapter: new PrismaPg({
      connectionString,
      ...(Number.isFinite(max) && max > 0 ? { max } : {}),
    }),
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });
}

function getClient(): PrismaClient {
  if (!globalForPrisma.prisma) {
    const client = createClient();
    if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = client;
    else return (globalForPrisma.prisma = client);
  }
  return globalForPrisma.prisma;
}

/**
 * Cliente perezoso: la conexión no se crea hasta la primera consulta.
 *
 * Es necesario porque `next build` importa cada ruta para leer su
 * configuración, y durante el build de Docker todavía no existe DATABASE_URL.
 * Si el cliente se construyera al cargar el módulo, el build fallaría sin
 * necesidad — no hay ninguna consulta que hacer en ese momento.
 */
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, property) {
    const client = getClient() as unknown as Record<string | symbol, unknown>;
    const value = client[property];
    // Los métodos ($transaction, $queryRaw…) necesitan su `this` original.
    return typeof value === 'function' ? value.bind(client) : value;
  },
});
