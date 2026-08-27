/**
 * Tests del runner de migraciones contra PostgreSQL real (PGlite).
 *
 * Lo importante que verifican: que aplicar dos veces no rompe nada, que respeta
 * la tabla `_prisma_migrations` que crea el CLI de Prisma (para poder alternar
 * entre ambos), y que una migración que falla no deja la base de datos a medias.
 */

import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { applyMigrations, readMigrations, type SqlExecutor } from '../scripts/migrate-deploy';

let db: PGlite;
let executor: SqlExecutor;
const tempDirs: string[] = [];

function migrationsFixture(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'migrations-'));
  tempDirs.push(root);
  for (const [name, sql] of Object.entries(files)) {
    mkdirSync(join(root, name), { recursive: true });
    writeFileSync(join(root, name, 'migration.sql'), sql, 'utf8');
  }
  return root;
}

beforeEach(async () => {
  db = new PGlite();
  executor = {
    exec: (sql) => db.exec(sql),
    query: async (sql, params) => {
      const result = await db.query(sql, params as unknown[] | undefined);
      return { rows: result.rows as Array<Record<string, unknown>> };
    },
  };
});

describe('readMigrations', () => {
  it('las devuelve en orden cronologico por nombre', () => {
    const dir = migrationsFixture({
      '20260901000000_segunda': 'SELECT 1;',
      '20260827000000_init': 'SELECT 1;',
      '20261001000000_tercera': 'SELECT 1;',
    });

    expect(readMigrations(dir).map((m) => m.name)).toEqual([
      '20260827000000_init',
      '20260901000000_segunda',
      '20261001000000_tercera',
    ]);
  });

  it('ignora carpetas sin migration.sql', () => {
    const dir = migrationsFixture({ '20260827000000_init': 'SELECT 1;' });
    mkdirSync(join(dir, '20260828000000_vacia'), { recursive: true });

    expect(readMigrations(dir)).toHaveLength(1);
  });

  it('falla claro si el directorio no existe', () => {
    expect(() => readMigrations(join(tmpdir(), 'no-existe-jamas'))).toThrow(/No encuentro/);
  });
});

describe('applyMigrations', () => {
  it('aplica las migraciones pendientes y crea las tablas', async () => {
    const dir = migrationsFixture({
      '20260827000000_init': 'CREATE TABLE cosas (id INT PRIMARY KEY);',
      '20260901000000_mas': 'ALTER TABLE cosas ADD COLUMN nombre TEXT;',
    });

    const result = await applyMigrations(executor, dir);

    expect(result.applied).toEqual(['20260827000000_init', '20260901000000_mas']);
    expect(result.skipped).toEqual([]);

    const cols = await db.query<{ column_name: string }>(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'cosas'",
    );
    expect(cols.rows.map((r) => r.column_name).sort()).toEqual(['id', 'nombre']);
  });

  it('es idempotente: la segunda vez no aplica nada', async () => {
    const dir = migrationsFixture({
      '20260827000000_init': 'CREATE TABLE cosas (id INT PRIMARY KEY);',
    });

    await applyMigrations(executor, dir);
    const second = await applyMigrations(executor, dir);

    expect(second.applied).toEqual([]);
    expect(second.skipped).toEqual(['20260827000000_init']);

    // Y la tabla sigue existiendo: no se recreó ni se borró.
    const count = await db.query('SELECT count(*) AS n FROM "_prisma_migrations"');
    expect(Number((count.rows[0] as { n: string }).n)).toBe(1);
  });

  it('aplica solo lo nuevo cuando se anade una migracion', async () => {
    const first = migrationsFixture({
      '20260827000000_init': 'CREATE TABLE cosas (id INT PRIMARY KEY);',
    });
    await applyMigrations(executor, first);

    const second = migrationsFixture({
      '20260827000000_init': 'CREATE TABLE cosas (id INT PRIMARY KEY);',
      '20260901000000_mas': 'ALTER TABLE cosas ADD COLUMN nombre TEXT;',
    });
    const result = await applyMigrations(executor, second);

    expect(result.applied).toEqual(['20260901000000_mas']);
    expect(result.skipped).toEqual(['20260827000000_init']);
  });

  it('rechaza una migracion ya aplicada que ha cambiado', async () => {
    const original = migrationsFixture({
      '20260827000000_init': 'CREATE TABLE cosas (id INT PRIMARY KEY);',
    });
    await applyMigrations(executor, original);

    const editada = migrationsFixture({
      '20260827000000_init': 'CREATE TABLE otras (id INT PRIMARY KEY);',
    });

    await expect(applyMigrations(executor, editada)).rejects.toThrow(/ha cambiado/);
  });

  it('una migracion que falla no deja la base de datos a medias', async () => {
    const dir = migrationsFixture({
      '20260827000000_init': `
        CREATE TABLE buena (id INT PRIMARY KEY);
        ESTO NO ES SQL VALIDO;
      `,
    });

    await expect(applyMigrations(executor, dir)).rejects.toThrow();

    // La tabla de la primera sentencia no debe haber quedado creada.
    const tables = await db.query<{ table_name: string }>(
      "SELECT table_name FROM information_schema.tables WHERE table_name = 'buena'",
    );
    expect(tables.rows).toHaveLength(0);

    // Y no se ha registrado como aplicada, así que se reintentará.
    const recorded = await db.query('SELECT * FROM "_prisma_migrations"');
    expect(recorded.rows).toHaveLength(0);
  });

  it('respeta lo que ya registro el CLI de Prisma', async () => {
    // Simula una base de datos migrada antes con `prisma migrate deploy`: la
    // fila ya existe con su checksum, así que no debe volver a ejecutarse.
    const sql = 'CREATE TABLE cosas (id INT PRIMARY KEY);';
    const dir = migrationsFixture({ '20260827000000_init': sql });
    const { checksum } = readMigrations(dir)[0];

    await db.exec(`
      CREATE TABLE "_prisma_migrations" (
        "id" VARCHAR(36) PRIMARY KEY NOT NULL,
        "checksum" VARCHAR(64) NOT NULL,
        "finished_at" TIMESTAMPTZ,
        "migration_name" VARCHAR(255) NOT NULL,
        "logs" TEXT,
        "rolled_back_at" TIMESTAMPTZ,
        "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "applied_steps_count" INTEGER NOT NULL DEFAULT 0
      );
      ${sql}
      INSERT INTO "_prisma_migrations" (id, checksum, migration_name, finished_at, applied_steps_count)
      VALUES ('abc', '${checksum}', '20260827000000_init', now(), 1);
    `);

    const result = await applyMigrations(executor, dir);

    // Si lo hubiera reejecutado, el CREATE TABLE habría fallado.
    expect(result.applied).toEqual([]);
    expect(result.skipped).toEqual(['20260827000000_init']);
  });

  it('reintenta una migracion marcada como revertida', async () => {
    const dir = migrationsFixture({
      '20260827000000_init': 'CREATE TABLE cosas (id INT PRIMARY KEY);',
    });
    const { checksum } = readMigrations(dir)[0];

    await db.exec(`
      CREATE TABLE "_prisma_migrations" (
        "id" VARCHAR(36) PRIMARY KEY NOT NULL,
        "checksum" VARCHAR(64) NOT NULL,
        "finished_at" TIMESTAMPTZ,
        "migration_name" VARCHAR(255) NOT NULL,
        "logs" TEXT,
        "rolled_back_at" TIMESTAMPTZ,
        "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "applied_steps_count" INTEGER NOT NULL DEFAULT 0
      );
      INSERT INTO "_prisma_migrations" (id, checksum, migration_name, finished_at, rolled_back_at)
      VALUES ('abc', '${checksum}', '20260827000000_init', now(), now());
    `);

    const result = await applyMigrations(executor, dir);
    expect(result.applied).toEqual(['20260827000000_init']);
  });
});

describe('la migracion real del proyecto', () => {
  it('se aplica limpia sobre una base de datos vacia', async () => {
    const result = await applyMigrations(executor, join(import.meta.dirname, '..', 'prisma', 'migrations'));
    expect(result.applied).toEqual([
      '20260827000000_init',
      '20260828000000_slot_date_y_borrado_suave',
    ]);

    const tables = await db.query<{ table_name: string }>(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name",
    );
    expect(tables.rows.map((r) => r.table_name)).toEqual([
      '_prisma_migrations',
      'activity_log',
      'house_settings',
      'occurrence_subtasks',
      'task_occurrences',
      'task_templates',
      'template_subtasks',
      'users',
    ]);
  });

  it('actualiza una base de datos que ya tiene tareas sin perder nada', async () => {
    // Este es el camino real de una instalación en marcha: la migración de las
    // ranuras se aplica sobre datos que ya existen.
    const [first, second] = readMigrations(
      join(import.meta.dirname, '..', 'prisma', 'migrations'),
    );

    // 1. Estado anterior a la migración.
    await applyMigrations(executor, migrationsFixture({ [first.name]: first.sql }));

    await db.exec(`
      INSERT INTO users (id, name, position) VALUES ('user-1', 'Carlos', 0), ('user-2', 'Virginia', 1);
      INSERT INTO task_templates (id, name, rule, assignment, start_date, updated_at)
      VALUES ('t1', 'Fregar platos', '{"kind":"DAILY"}', '{"mode":"FIXED","userId":"user-2"}', DATE '2026-08-24', now());

      INSERT INTO task_occurrences (id, template_id, name, assigned_to_id, due_date, status, updated_at)
      VALUES ('o1', 't1', 'Fregar platos', 'user-2', DATE '2026-08-24', 'COMPLETED', now()),
             ('o2', 't1', 'Fregar platos', 'user-2', DATE '2026-08-25', 'PENDING', now());

      INSERT INTO task_occurrences (id, template_id, name, assigned_to_id, due_date, status, updated_at)
      VALUES ('o3', NULL, 'Comprar bombilla', 'user-1', DATE '2026-08-25', 'PENDING', now());
    `);

    // 2. La actualización.
    const result = await applyMigrations(
      executor,
      migrationsFixture({ [first.name]: first.sql, [second.name]: second.sql }),
    );
    expect(result.applied).toEqual([second.name]);

    // 3. Nada se ha perdido y las ranuras quedan bien rellenadas.
    const rows = await db.query<{ id: string; slot_date: Date | null; deleted_at: Date | null }>(
      'SELECT id, slot_date, deleted_at FROM task_occurrences ORDER BY id',
    );
    expect(rows.rows).toHaveLength(3);

    const byId = new Map(rows.rows.map((r) => [r.id, r]));
    // Las de plantilla ocupan la ranura de su propia fecha...
    expect(byId.get('o1')?.slot_date).not.toBeNull();
    expect(byId.get('o2')?.slot_date).not.toBeNull();
    // ...y la tarea suelta no ocupa ninguna.
    expect(byId.get('o3')?.slot_date).toBeNull();
    // Ninguna queda marcada como borrada.
    expect(rows.rows.every((r) => r.deleted_at === null)).toBe(true);

    // 4. Y la restricción nueva sigue impidiendo duplicar la ranura.
    await expect(
      db.exec(`
        INSERT INTO task_occurrences (id, template_id, name, assigned_to_id, due_date, slot_date, status, updated_at)
        VALUES ('o4', 't1', 'Fregar platos', 'user-2', DATE '2026-08-24', DATE '2026-08-24', 'PENDING', now());
      `),
    ).rejects.toThrow();
  });

  it('crea la restriccion que impide tareas duplicadas', async () => {
    await applyMigrations(executor, join(import.meta.dirname, '..', 'prisma', 'migrations'));

    const indexes = await db.query<{ indexname: string }>(
      "SELECT indexname FROM pg_indexes WHERE tablename = 'task_occurrences'",
    );
    expect(indexes.rows.map((r) => r.indexname)).toContain(
      'task_occurrences_template_id_slot_date_key',
    );
  });
});

process.on('exit', () => {
  for (const dir of tempDirs) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // Limpieza best-effort.
    }
  }
});
