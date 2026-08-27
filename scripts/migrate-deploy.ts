/**
 * Aplica las migraciones de `prisma/migrations` en producción.
 *
 * ¿Por qué no `prisma migrate deploy`? Porque el CLI de Prisma 7 arrastra 91
 * paquetes y 237 MB (la mayor parte, dependencias de Prisma Studio) para
 * ejecutar unas cuantas sentencias DDL. La imagen de producción no lo lleva.
 *
 * Las migraciones se siguen ESCRIBIENDO con el CLI de verdad
 * (`npm run db:migrate` en desarrollo). Esto solo las APLICA, usando la misma
 * tabla `_prisma_migrations` y el mismo checksum SHA-256, de modo que ambas
 * herramientas ven el mismo estado y se pueden alternar sin problema.
 */

import { createHash, randomUUID } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

/** Lo mínimo que necesitamos de un cliente SQL, para poder inyectar otro en los tests. */
export interface SqlExecutor {
  /** Un script que puede contener varias sentencias. */
  exec(sql: string): Promise<unknown>;
  /** Una sentencia con parámetros. */
  query(sql: string, params?: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }>;
}

/** Misma definición que crea `prisma migrate`. */
const MIGRATIONS_TABLE = `
  CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
    "id"                  VARCHAR(36) PRIMARY KEY NOT NULL,
    "checksum"            VARCHAR(64) NOT NULL,
    "finished_at"         TIMESTAMPTZ,
    "migration_name"      VARCHAR(255) NOT NULL,
    "logs"                TEXT,
    "rolled_back_at"      TIMESTAMPTZ,
    "started_at"          TIMESTAMPTZ NOT NULL DEFAULT now(),
    "applied_steps_count" INTEGER NOT NULL DEFAULT 0
  );
`;

export interface PendingMigration {
  name: string;
  sql: string;
  checksum: string;
}

export function readMigrations(directory: string): PendingMigration[] {
  if (!existsSync(directory)) {
    throw new Error(`No encuentro las migraciones en ${directory}`);
  }

  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    // Los nombres empiezan por marca de tiempo, así que el orden alfabético es
    // el cronológico.
    .sort()
    .flatMap((name) => {
      const file = join(directory, name, 'migration.sql');
      if (!existsSync(file)) return [];
      const sql = readFileSync(file, 'utf8');
      return [{ name, sql, checksum: createHash('sha256').update(sql).digest('hex') }];
    });
}

export interface DeployResult {
  applied: string[];
  skipped: string[];
}

export async function applyMigrations(
  db: SqlExecutor,
  directory: string,
): Promise<DeployResult> {
  await db.exec(MIGRATIONS_TABLE);

  const { rows } = await db.query(
    'SELECT migration_name, checksum, finished_at, rolled_back_at FROM "_prisma_migrations"',
  );

  const recorded = new Map(rows.map((row) => [String(row.migration_name), row]));
  const migrations = readMigrations(directory);

  const applied: string[] = [];
  const skipped: string[] = [];

  for (const migration of migrations) {
    const previous = recorded.get(migration.name);

    if (previous && previous.finished_at && !previous.rolled_back_at) {
      // Un checksum distinto significa que se editó una migración ya aplicada.
      // Parar es lo correcto: seguir dejaría la base de datos en un estado que
      // no corresponde a ningún commit.
      if (previous.checksum !== migration.checksum) {
        throw new Error(
          `La migración "${migration.name}" ya está aplicada pero su fichero ha cambiado.\n` +
            'No se toca nada. Si el cambio es intencionado, crea una migración nueva\n' +
            'en vez de editar una que ya se aplicó.',
        );
      }
      skipped.push(migration.name);
      continue;
    }

    process.stdout.write(`  aplicando ${migration.name}... `);

    await db.exec('BEGIN');
    try {
      await db.exec(migration.sql);
      await db.query(
        `INSERT INTO "_prisma_migrations"
           (id, checksum, migration_name, started_at, finished_at, applied_steps_count)
         VALUES ($1, $2, $3, now(), now(), 1)`,
        [randomUUID(), migration.checksum, migration.name],
      );
      await db.exec('COMMIT');
    } catch (error) {
      await db.exec('ROLLBACK').catch(() => {});
      process.stdout.write('error\n');
      throw error;
    }

    process.stdout.write('hecho\n');
    applied.push(migration.name);
  }

  return { applied, skipped };
}

/** Punto de entrada. Solo se ejecuta cuando el fichero se lanza directamente. */
async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('Falta DATABASE_URL.');
    process.exit(1);
  }

  const directory =
    process.env.PRISMA_MIGRATIONS_DIR ?? join(process.cwd(), 'prisma', 'migrations');

  // `pg` es CommonJS: el import por defecto es lo único fiable desde ESM.
  const pg = (await import('pg')).default;
  const client = new pg.Client({ connectionString });
  await client.connect();

  try {
    const result = await applyMigrations(
      {
        exec: (sql) => client.query(sql),
        query: (sql, params) => client.query(sql, params),
      },
      directory,
    );

    if (result.applied.length === 0) {
      console.log(`Base de datos al día (${result.skipped.length} migraciones aplicadas ya).`);
    } else {
      console.log(`${result.applied.length} migración(es) aplicada(s).`);
    }
  } finally {
    await client.end();
  }
}

// Solo arranca si se ejecuta directamente, para que los tests puedan importar
// applyMigrations() sin abrir ninguna conexión.
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  main().catch((error) => {
    console.error('\nError aplicando migraciones:\n', error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
