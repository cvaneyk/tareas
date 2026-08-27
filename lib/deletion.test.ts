/**
 * Borrar y posponer tareas que vienen de una recurrente.
 *
 * El caso que fallaba: al borrar (o mover) una ocurrencia se liberaba su ranura
 * del día, y el generador la volvía a crear en el siguiente render. Desde fuera
 * parecía que el botón no hacía nada.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./db', async () => ({ prisma: (await import('./test-db')).prisma }));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));

const { prisma, resetDatabase, seedUsers } = await import('./test-db');
const { ensureRangeGenerated } = await import('./generation');
const { toPrismaDate, toDateStr, todayStr, weekStart, addDays } = await import('./dates');
const { deleteTask, postponeTask } = await import('../actions/tasks');

const MONDAY = weekStart(todayStr());
const SUNDAY = addDays(MONDAY, 6);
const TODAY = todayStr();
const TOMORROW = addDays(TODAY, 1);

async function dailyTemplate() {
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
    },
  });
}

/** Lo que vería la interfaz: tareas vivas de ese día. */
async function visibleOn(date: string) {
  return prisma.taskOccurrence.findMany({
    where: { dueDate: toPrismaDate(date), deletedAt: null },
    orderBy: { name: 'asc' },
  });
}

beforeEach(async () => {
  await resetDatabase();
  await seedUsers();
});

describe('borrar una tarea de hoy', () => {
  it('no reaparece al recargar', async () => {
    const template = await dailyTemplate();
    await ensureRangeGenerated(MONDAY, SUNDAY);

    const today = await prisma.taskOccurrence.findFirstOrThrow({
      where: { templateId: template.id, dueDate: toPrismaDate(TODAY) },
    });

    const result = await deleteTask(today.id);
    expect(result.ok).toBe(true);
    expect(await visibleOn(TODAY)).toHaveLength(0);

    // Esto es lo que ocurre en cada render de la semana.
    await ensureRangeGenerated(MONDAY, SUNDAY);
    await ensureRangeGenerated(MONDAY, SUNDAY);

    expect(await visibleOn(TODAY)).toHaveLength(0);
  });

  it('no afecta a los demas dias de la recurrente', async () => {
    const template = await dailyTemplate();
    await ensureRangeGenerated(MONDAY, SUNDAY);

    const today = await prisma.taskOccurrence.findFirstOrThrow({
      where: { templateId: template.id, dueDate: toPrismaDate(TODAY) },
    });
    await deleteTask(today.id);
    await ensureRangeGenerated(MONDAY, SUNDAY);

    expect(await visibleOn(TOMORROW)).toHaveLength(1);
  });

  it('una tarea suelta se borra del todo', async () => {
    const task = await prisma.taskOccurrence.create({
      data: {
        name: 'Comprar bombilla',
        type: 'SINGLE',
        category: 'compras',
        assignedToId: 'user-1',
        dueDate: toPrismaDate(TODAY),
        weight: 1,
        estimatedMinutes: 15,
      },
    });

    await deleteTask(task.id);

    // Sin plantilla no hay nada que pueda recrearla: no hace falta lápida.
    expect(await prisma.taskOccurrence.count()).toBe(0);
  });

  it('la tarea borrada no cuenta en las estadisticas', async () => {
    const template = await dailyTemplate();
    await ensureRangeGenerated(MONDAY, SUNDAY);

    const before = await prisma.taskOccurrence.count({ where: { deletedAt: null } });

    const today = await prisma.taskOccurrence.findFirstOrThrow({
      where: { templateId: template.id, dueDate: toPrismaDate(TODAY) },
    });
    await deleteTask(today.id);

    expect(await prisma.taskOccurrence.count({ where: { deletedAt: null } })).toBe(before - 1);
  });
});

describe('posponer una tarea de hoy', () => {
  it('se va a manana y no queda una copia hoy', async () => {
    const template = await dailyTemplate();
    await ensureRangeGenerated(MONDAY, SUNDAY);

    const today = await prisma.taskOccurrence.findFirstOrThrow({
      where: { templateId: template.id, dueDate: toPrismaDate(TODAY) },
    });

    const result = await postponeTask(today.id, 1);
    expect(result.ok).toBe(true);

    await ensureRangeGenerated(MONDAY, SUNDAY);
    await ensureRangeGenerated(MONDAY, SUNDAY);

    // Hoy ya no está...
    expect(await visibleOn(TODAY)).toHaveLength(0);

    // ...y mañana hay dos: la de mañana y la que se ha pospuesto.
    const tomorrow = await visibleOn(TOMORROW);
    expect(tomorrow).toHaveLength(2);
    expect(tomorrow.every((t) => t.name === 'Fregar platos')).toBe(true);
  });

  it('conserva su vinculo con la recurrente y su ranura', async () => {
    const template = await dailyTemplate();
    await ensureRangeGenerated(MONDAY, SUNDAY);

    const today = await prisma.taskOccurrence.findFirstOrThrow({
      where: { templateId: template.id, dueDate: toPrismaDate(TODAY) },
    });
    await postponeTask(today.id, 1);

    const moved = await prisma.taskOccurrence.findUniqueOrThrow({ where: { id: today.id } });
    expect(toDateStr(moved.dueDate)).toBe(TOMORROW);
    // La ranura sigue siendo la de hoy: es lo que impide que se regenere.
    expect(moved.slotDate && toDateStr(moved.slotDate)).toBe(TODAY);
    expect(moved.templateId).toBe(template.id);
  });

  it('posponer dos veces la mueve dos dias, sin duplicar', async () => {
    const template = await dailyTemplate();
    await ensureRangeGenerated(MONDAY, SUNDAY);

    const today = await prisma.taskOccurrence.findFirstOrThrow({
      where: { templateId: template.id, dueDate: toPrismaDate(TODAY) },
    });

    await postponeTask(today.id, 1);
    await postponeTask(today.id, 1);
    await ensureRangeGenerated(MONDAY, SUNDAY);

    const moved = await prisma.taskOccurrence.findUniqueOrThrow({ where: { id: today.id } });
    expect(toDateStr(moved.dueDate)).toBe(addDays(TODAY, 2));
    expect(await visibleOn(TODAY)).toHaveLength(0);
  });
});

describe('editar la recurrente despues de borrar un dia', () => {
  it('no resucita el dia borrado', async () => {
    const template = await dailyTemplate();
    await ensureRangeGenerated(MONDAY, SUNDAY);

    const today = await prisma.taskOccurrence.findFirstOrThrow({
      where: { templateId: template.id, dueDate: toPrismaDate(TODAY) },
    });
    await deleteTask(today.id);

    // Cambiar la plantilla regenera el futuro pendiente...
    const { regenerateFutureForTemplate } = await import('./generation');
    await prisma.taskTemplate.update({
      where: { id: template.id },
      data: { name: 'Fregar platos y encimera', weight: 3 },
    });
    await regenerateFutureForTemplate(template.id);

    // ...pero el día que borraste sigue borrado.
    expect(await visibleOn(TODAY)).toHaveLength(0);

    // Y los demás días sí reciben los valores nuevos.
    const [tomorrow] = await visibleOn(TOMORROW);
    expect(tomorrow.name).toBe('Fregar platos y encimera');
    expect(tomorrow.weight).toBe(3);
  });
});

describe('borrar la recurrente entera', () => {
  it('sigue sin resucitar las tareas futuras', async () => {
    const template = await dailyTemplate();
    await ensureRangeGenerated(MONDAY, SUNDAY);

    const { deactivateTemplate } = await import('./generation');
    await deactivateTemplate(template.id);
    await ensureRangeGenerated(MONDAY, SUNDAY);

    const future = await prisma.taskOccurrence.count({
      where: { templateId: template.id, dueDate: { gte: toPrismaDate(TODAY) }, deletedAt: null },
    });
    expect(future).toBe(0);
  });
});
