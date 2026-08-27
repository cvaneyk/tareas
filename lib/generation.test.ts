/**
 * Tests de integración de la generación de tareas recurrentes, contra un
 * PostgreSQL real (PGlite) con la misma migración que va a producción.
 *
 * Estos son los tests que cubren el fallo original: "no guarda las tareas
 * recurrentes" y las tareas duplicadas.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./db', async () => ({ prisma: (await import('./test-db')).prisma }));

const { prisma, resetDatabase, seedUsers } = await import('./test-db');
const {
  ensureRangeGenerated,
  ensureWeekGenerated,
  regenerateFutureForTemplate,
  deactivateTemplate,
} = await import('./generation');
const { toPrismaDate, toDateStr, todayStr, weekStart, addDays } = await import('./dates');

const MONDAY = weekStart(todayStr());
const SUNDAY = addDays(MONDAY, 6);

async function createDailyTemplate(over: Record<string, unknown> = {}) {
  return prisma.taskTemplate.create({
    data: {
      name: 'Fregar platos',
      type: 'RECURRENT',
      category: 'cocina',
      rule: { kind: 'DAILY' },
      assignment: { mode: 'FIXED', userId: 'user-2' },
      weight: 1,
      estimatedMinutes: 15,
      startDate: toPrismaDate(MONDAY),
      ...over,
    },
  });
}

beforeEach(async () => {
  await resetDatabase();
  await seedUsers();
});

describe('ensureRangeGenerated', () => {
  it('crea una ocurrencia por dia para una plantilla diaria', async () => {
    await createDailyTemplate();

    const result = await ensureRangeGenerated(MONDAY, SUNDAY);

    expect(result.created).toBe(7);
    expect(await prisma.taskOccurrence.count()).toBe(7);
  });

  it('es idempotente: llamarla diez veces no duplica nada', async () => {
    await createDailyTemplate();

    await ensureRangeGenerated(MONDAY, SUNDAY);
    for (let i = 0; i < 9; i++) {
      const again = await ensureRangeGenerated(MONDAY, SUNDAY);
      expect(again.created).toBe(0);
    }

    expect(await prisma.taskOccurrence.count()).toBe(7);
  });

  it('la base de datos rechaza ocupar dos veces la misma ranura', async () => {
    // La garantia no depende de que generation.ts sea correcto: es una
    // restriccion UNIQUE sobre (plantilla, ranura). Este es el fallo n4 del
    // diagnostico, ahora imposible por esquema.
    const template = await createDailyTemplate();
    await ensureRangeGenerated(MONDAY, SUNDAY);

    await expect(
      prisma.taskOccurrence.create({
        data: {
          templateId: template.id,
          name: 'Fregar platos (duplicado)',
          type: 'RECURRENT',
          category: 'cocina',
          assignedToId: 'user-1',
          dueDate: toPrismaDate(MONDAY),
          slotDate: toPrismaDate(MONDAY),
          weight: 1,
          estimatedMinutes: 15,
        },
      }),
    ).rejects.toThrow();

    expect(await prisma.taskOccurrence.count()).toBe(7);
  });

  it('una tarea pospuesta puede coincidir en dia con la de esa fecha', async () => {
    // Posponer el lunes al martes deja dos tareas el martes. No es un
    // duplicado: ocupan ranuras distintas (lunes y martes).
    const template = await createDailyTemplate();
    await ensureRangeGenerated(MONDAY, SUNDAY);

    const monday = await prisma.taskOccurrence.findFirstOrThrow({
      where: { templateId: template.id, slotDate: toPrismaDate(MONDAY) },
    });

    await prisma.taskOccurrence.update({
      where: { id: monday.id },
      data: { dueDate: toPrismaDate(addDays(MONDAY, 1)) },
    });

    const tuesday = await prisma.taskOccurrence.count({
      where: { dueDate: toPrismaDate(addDays(MONDAY, 1)) },
    });
    expect(tuesday).toBe(2);
  });

  it('permite varias tareas sueltas el mismo dia (templateId nulo)', async () => {
    // Los NULL son distintos entre si en PostgreSQL, asi que la restriccion no
    // estorba a las tareas creadas a mano.
    for (const name of ['Comprar bombilla', 'Llamar al fontanero']) {
      await prisma.taskOccurrence.create({
        data: {
          name,
          type: 'SINGLE',
          category: 'hogar',
          assignedToId: 'user-1',
          dueDate: toPrismaDate(MONDAY),
          weight: 1,
          estimatedMinutes: 15,
        },
      });
    }
    expect(await prisma.taskOccurrence.count()).toBe(2);
  });

  it('nunca genera hacia el pasado', async () => {
    await createDailyTemplate({ startDate: toPrismaDate('2020-01-01') });

    const past = addDays(MONDAY, -30);
    const result = await ensureRangeGenerated(past, addDays(past, 6));

    expect(result.created).toBe(0);
    expect(await prisma.taskOccurrence.count()).toBe(0);
  });

  it('ignora las plantillas desactivadas', async () => {
    await createDailyTemplate({ active: false });
    const result = await ensureRangeGenerated(MONDAY, SUNDAY);
    expect(result.created).toBe(0);
  });

  it('respeta endDate', async () => {
    await createDailyTemplate({ endDate: toPrismaDate(addDays(MONDAY, 2)) });
    const result = await ensureRangeGenerated(MONDAY, SUNDAY);
    expect(result.created).toBe(3);
  });

  it('dos generaciones concurrentes no se pisan', async () => {
    await createDailyTemplate();

    const [a, b] = await Promise.all([
      ensureRangeGenerated(MONDAY, SUNDAY),
      ensureRangeGenerated(MONDAY, SUNDAY),
    ]);

    expect(a.created + b.created).toBe(7);
    expect(await prisma.taskOccurrence.count()).toBe(7);
  });
});

describe('subtareas de plantilla', () => {
  it('copia las subtareas a cada ocurrencia generada', async () => {
    // Este es el fallo n2 del diagnostico: la tabla task_templates antigua no
    // tenia forma de guardar subtareas, asi que "Limpieza grande" perdia sus 7
    // subtareas en la primera sincronizacion.
    const template = await prisma.taskTemplate.create({
      data: {
        name: 'Limpieza grande',
        type: 'BIG_CLEAN',
        category: 'limpieza',
        rule: { kind: 'WEEKLY', daysOfWeek: [1] },
        assignment: { mode: 'FIXED', userId: 'user-1' },
        weight: 4,
        estimatedMinutes: 120,
        startDate: toPrismaDate(MONDAY),
        subtasks: {
          create: [
            { name: 'Cambiar sabanas', assigneeUserId: 'user-1', position: 0 },
            { name: 'Fregar suelos', assigneeUserId: 'user-2', position: 1 },
            { name: 'Aspirar a fondo', assigneeUserId: null, position: 2 },
          ],
        },
      },
    });

    await ensureRangeGenerated(MONDAY, SUNDAY);

    const occurrence = await prisma.taskOccurrence.findFirstOrThrow({
      where: { templateId: template.id },
      include: { subtasks: { orderBy: { position: 'asc' } } },
    });

    expect(occurrence.subtasks).toHaveLength(3);
    expect(occurrence.subtasks.map((s) => s.name)).toEqual([
      'Cambiar sabanas',
      'Fregar suelos',
      'Aspirar a fondo',
    ]);
    // assigneeUserId nulo en la plantilla = quien tenga la tarea ese dia.
    expect(occurrence.subtasks[2].assigneeUserId).toBe(occurrence.assignedToId);
  });

  it('sobrevive a una regeneracion', async () => {
    await prisma.taskTemplate.create({
      data: {
        name: 'Limpieza grande',
        type: 'BIG_CLEAN',
        category: 'limpieza',
        rule: { kind: 'WEEKLY', daysOfWeek: [1, 2, 3, 4, 5, 6, 7] },
        assignment: { mode: 'FIXED', userId: 'user-1' },
        weight: 4,
        estimatedMinutes: 120,
        startDate: toPrismaDate(MONDAY),
        subtasks: { create: [{ name: 'Fregar suelos', assigneeUserId: 'user-2', position: 0 }] },
      },
    });

    await ensureRangeGenerated(MONDAY, SUNDAY);
    await ensureRangeGenerated(MONDAY, SUNDAY);
    await ensureWeekGenerated(todayStr());

    expect(await prisma.occurrenceSubtask.count()).toBe(7);
  });
});

describe('alternancia por turno al generar', () => {
  it('reparte las cenas alternando entre las dos personas', async () => {
    await createDailyTemplate({
      name: 'Hacer cena',
      assignment: { mode: 'ALTERNATE_TURN' },
    });

    await ensureRangeGenerated(MONDAY, SUNDAY);

    const occurrences = await prisma.taskOccurrence.findMany({ orderBy: { dueDate: 'asc' } });

    expect(occurrences.map((o) => o.assignedToId)).toEqual([
      'user-1',
      'user-2',
      'user-1',
      'user-2',
      'user-1',
      'user-2',
      'user-1',
    ]);
  });
});

describe('editar y borrar plantillas', () => {
  it('regenerar aplica los cambios al futuro pendiente', async () => {
    const template = await createDailyTemplate();
    await ensureRangeGenerated(MONDAY, SUNDAY);

    await prisma.taskTemplate.update({
      where: { id: template.id },
      data: { name: 'Fregar platos y encimera', weight: 2 },
    });
    await regenerateFutureForTemplate(template.id);

    const future = await prisma.taskOccurrence.findMany({
      where: { templateId: template.id, dueDate: { gte: toPrismaDate(todayStr()) } },
    });

    expect(future.length).toBeGreaterThan(0);
    for (const occurrence of future) {
      expect(occurrence.name).toBe('Fregar platos y encimera');
      expect(occurrence.weight).toBe(2);
    }
  });

  it('regenerar no toca lo ya completado', async () => {
    const template = await createDailyTemplate();
    await ensureRangeGenerated(MONDAY, SUNDAY);

    await prisma.taskOccurrence.updateMany({
      where: { templateId: template.id, dueDate: toPrismaDate(todayStr()) },
      data: { status: 'COMPLETED', completedById: 'user-2', completedAt: new Date() },
    });

    await prisma.taskTemplate.update({
      where: { id: template.id },
      data: { name: 'Nombre nuevo' },
    });
    await regenerateFutureForTemplate(template.id);

    const completed = await prisma.taskOccurrence.findFirstOrThrow({
      where: { templateId: template.id, status: 'COMPLETED' },
    });
    expect(completed.name).toBe('Fregar platos');
    expect(completed.completedById).toBe('user-2');
  });

  it('borrar una plantilla conserva el historico y no la resucita', async () => {
    const template = await createDailyTemplate();
    await ensureRangeGenerated(MONDAY, SUNDAY);

    await prisma.taskOccurrence.updateMany({
      where: { templateId: template.id, dueDate: toPrismaDate(todayStr()) },
      data: { status: 'COMPLETED', completedById: 'user-2', completedAt: new Date() },
    });

    await deactivateTemplate(template.id);

    // Lo completado sigue ahi...
    expect(await prisma.taskOccurrence.count({ where: { status: 'COMPLETED' } })).toBe(1);

    // ...y no vuelve a generarse, aunque se recargue la semana varias veces.
    await ensureRangeGenerated(MONDAY, SUNDAY);
    await ensureRangeGenerated(MONDAY, SUNDAY);

    const pendingFuture = await prisma.taskOccurrence.count({
      where: {
        templateId: template.id,
        status: 'PENDING',
        dueDate: { gte: toPrismaDate(todayStr()) },
      },
    });
    expect(pendingFuture).toBe(0);
  });
});

describe('fechas', () => {
  it('el dia guardado es el dia leido, sin desfase de zona horaria', async () => {
    await createDailyTemplate();
    await ensureRangeGenerated(MONDAY, SUNDAY);

    const occurrences = await prisma.taskOccurrence.findMany({ orderBy: { dueDate: 'asc' } });
    const dates = occurrences.map((o) => toDateStr(o.dueDate));

    expect(dates[0]).toBe(MONDAY);
    expect(dates[6]).toBe(SUNDAY);
  });
});
