/**
 * Tests de integración de las Server Actions contra PostgreSQL real.
 *
 * Cubren el otro fallo original: los cambios que se perdían. En la app antigua
 * cada mutación era un `fetch` sin await ni comprobación, y un temporizador de
 * 10 s sobrescribía el estado local con el del servidor. Aquí toda escritura es
 * una transacción confirmada antes de que la interfaz la muestre.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./db', async () => ({ prisma: (await import('./test-db')).prisma }));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));

const { prisma, resetDatabase, seedUsers } = await import('./test-db');
const { ensureRangeGenerated } = await import('./generation');
const { toPrismaDate, todayStr, weekStart, addDays } = await import('./dates');
const { setTaskStatus, setSubtaskStatus, reassignTask, postponeTask, deleteTask, createTask } =
  await import('../actions/tasks');

const MONDAY = weekStart(todayStr());
const SUNDAY = addDays(MONDAY, 6);
const TODAY = todayStr();

async function makeTask(over: Record<string, unknown> = {}) {
  return prisma.taskOccurrence.create({
    data: {
      name: 'Fregar platos',
      type: 'SINGLE',
      category: 'cocina',
      assignedToId: 'user-1',
      dueDate: toPrismaDate(TODAY),
      weight: 2,
      estimatedMinutes: 15,
      ...over,
    },
  });
}

beforeEach(async () => {
  await resetDatabase();
  await seedUsers();
});

describe('setTaskStatus', () => {
  it('completa la tarea y registra quien y cuando', async () => {
    const task = await makeTask();

    const result = await setTaskStatus(task.id, 'COMPLETED');
    expect(result.ok).toBe(true);

    const saved = await prisma.taskOccurrence.findUniqueOrThrow({ where: { id: task.id } });
    expect(saved.status).toBe('COMPLETED');
    expect(saved.completedById).toBe('user-1');
    expect(saved.completedAt).toBeInstanceOf(Date);
  });

  it('desmarcar limpia la marca de completada', async () => {
    const task = await makeTask();
    await setTaskStatus(task.id, 'COMPLETED');
    await setTaskStatus(task.id, 'PENDING');

    const saved = await prisma.taskOccurrence.findUniqueOrThrow({ where: { id: task.id } });
    expect(saved.status).toBe('PENDING');
    expect(saved.completedAt).toBeNull();
    expect(saved.completedById).toBeNull();
  });

  it('deja constancia en el registro de actividad', async () => {
    const task = await makeTask();
    await setTaskStatus(task.id, 'COMPLETED');

    const log = await prisma.activityLog.findFirstOrThrow();
    expect(log.action).toBe('complete');
    expect(log.taskName).toBe('Fregar platos');
  });

  it('devuelve un error legible si la tarea ya no existe', async () => {
    const result = await setTaskStatus('no-existe', 'COMPLETED');
    expect(result).toEqual({ ok: false, error: 'Esa tarea ya no existe' });
  });

  it('completar la tarea padre completa sus subtareas', async () => {
    const task = await makeTask({
      type: 'BIG_CLEAN',
      subtasks: {
        create: [
          { name: 'Fregar suelos', assigneeUserId: 'user-1', position: 0 },
          { name: 'Aspirar', assigneeUserId: 'user-2', position: 1 },
        ],
      },
    });

    await setTaskStatus(task.id, 'COMPLETED');

    const subtasks = await prisma.occurrenceSubtask.findMany({ where: { occurrenceId: task.id } });
    expect(subtasks.every((s) => s.status === 'COMPLETED')).toBe(true);
  });
});

describe('setSubtaskStatus', () => {
  it('la tarea padre solo se completa cuando lo estan todas las subtareas', async () => {
    const task = await makeTask({
      type: 'BIG_CLEAN',
      subtasks: {
        create: [
          { name: 'Fregar suelos', assigneeUserId: 'user-1', position: 0 },
          { name: 'Aspirar', assigneeUserId: 'user-2', position: 1 },
        ],
      },
    });

    const [first, second] = await prisma.occurrenceSubtask.findMany({
      where: { occurrenceId: task.id },
      orderBy: { position: 'asc' },
    });

    await setSubtaskStatus(first.id, true);
    expect((await prisma.taskOccurrence.findUniqueOrThrow({ where: { id: task.id } })).status).toBe(
      'PENDING',
    );

    await setSubtaskStatus(second.id, true);
    expect((await prisma.taskOccurrence.findUniqueOrThrow({ where: { id: task.id } })).status).toBe(
      'COMPLETED',
    );

    // Y desmarcar una la devuelve a pendiente.
    await setSubtaskStatus(second.id, false);
    expect((await prisma.taskOccurrence.findUniqueOrThrow({ where: { id: task.id } })).status).toBe(
      'PENDING',
    );
  });
});

describe('reassignTask', () => {
  it('pasa la tarea a la otra persona', async () => {
    const task = await makeTask({ assignedToId: 'user-1' });
    await reassignTask(task.id);

    const saved = await prisma.taskOccurrence.findUniqueOrThrow({ where: { id: task.id } });
    expect(saved.assignedToId).toBe('user-2');
  });

  it('arrastra las subtareas que seguian al responsable', async () => {
    const task = await makeTask({
      assignedToId: 'user-1',
      subtasks: {
        create: [
          { name: 'Suya', assigneeUserId: 'user-1', position: 0 },
          { name: 'De la otra persona', assigneeUserId: 'user-2', position: 1 },
        ],
      },
    });

    await reassignTask(task.id);

    const subtasks = await prisma.occurrenceSubtask.findMany({
      where: { occurrenceId: task.id },
      orderBy: { position: 'asc' },
    });
    expect(subtasks[0].assigneeUserId).toBe('user-2');
    expect(subtasks[1].assigneeUserId).toBe('user-2');
  });
});

describe('postponeTask', () => {
  it('mueve la tarea al dia siguiente', async () => {
    const task = await makeTask();
    const result = await postponeTask(task.id, 1);
    expect(result.ok).toBe(true);

    const saved = await prisma.taskOccurrence.findUniqueOrThrow({ where: { id: task.id } });
    expect(saved.dueDate.toISOString().slice(0, 10)).toBe(addDays(TODAY, 1));
  });

  it('posponer sobre un dia que ya tiene esa recurrente no rompe la restriccion', async () => {
    // Una plantilla diaria ya ocupa el día de mañana. Posponer la de hoy
    // chocaría con la UNIQUE; en vez de fallar, la desliga de la plantilla.
    const template = await prisma.taskTemplate.create({
      data: {
        name: 'Sacar al perro',
        type: 'RECURRENT',
        category: 'perro',
        rule: { kind: 'DAILY' },
        assignment: { mode: 'FIXED', userId: 'user-1' },
        weight: 3,
        estimatedMinutes: 30,
        startDate: toPrismaDate(MONDAY),
      },
    });
    await ensureRangeGenerated(MONDAY, SUNDAY);

    const today = await prisma.taskOccurrence.findFirstOrThrow({
      where: { templateId: template.id, dueDate: toPrismaDate(TODAY) },
    });

    const result = await postponeTask(today.id, 1);
    expect(result.ok).toBe(true);

    const saved = await prisma.taskOccurrence.findUniqueOrThrow({ where: { id: today.id } });
    expect(saved.templateId).toBeNull();
    expect(saved.dueDate.toISOString().slice(0, 10)).toBe(addDays(TODAY, 1));
  });
});

describe('deleteTask', () => {
  it('borra la tarea y sus subtareas', async () => {
    const task = await makeTask({
      subtasks: { create: [{ name: 'Una', assigneeUserId: 'user-1', position: 0 }] },
    });

    await deleteTask(task.id);

    expect(await prisma.taskOccurrence.count()).toBe(0);
    expect(await prisma.occurrenceSubtask.count()).toBe(0);
  });
});

describe('createTask', () => {
  const base = {
    name: 'Comprar bombilla',
    type: 'SINGLE' as const,
    category: 'compras',
    dueDate: TODAY,
    weight: 1,
    estimatedMinutes: 15,
    notes: '',
    assignee: 'user-2',
    isRecurring: false,
    subtasks: [],
  };

  it('crea una tarea suelta', async () => {
    const result = await createTask(base);
    expect(result.ok).toBe(true);

    const saved = await prisma.taskOccurrence.findFirstOrThrow();
    expect(saved.name).toBe('Comprar bombilla');
    expect(saved.assignedToId).toBe('user-2');
    expect(saved.templateId).toBeNull();
  });

  it('rechaza una tarea sin nombre con un mensaje concreto', async () => {
    const result = await createTask({ ...base, name: '   ' });
    expect(result).toMatchObject({ ok: false, error: 'Ponle un nombre a la tarea' });
    expect(await prisma.taskOccurrence.count()).toBe(0);
  });

  it('una recurrente crea UNA plantilla y ninguna tarea duplicada', async () => {
    // El fallo nº 4 del diagnóstico: la app antigua creaba la plantilla y
    // además una instancia suelta con templateId 'custom_tmpl', así que el
    // generador producía una segunda tarea ese mismo día.
    const result = await createTask({
      ...base,
      name: 'Regar las plantas',
      type: 'RECURRENT',
      isRecurring: true,
      rule: { kind: 'DAILY' },
    });
    expect(result.ok).toBe(true);

    expect(await prisma.taskTemplate.count()).toBe(1);

    const today = await prisma.taskOccurrence.findMany({
      where: { dueDate: toPrismaDate(TODAY) },
    });
    expect(today).toHaveLength(1);
    expect(today[0].templateId).not.toBeNull();

    // Y recargar la semana no añade una segunda.
    await ensureRangeGenerated(MONDAY, SUNDAY);
    await ensureRangeGenerated(MONDAY, SUNDAY);

    const stillOne = await prisma.taskOccurrence.count({ where: { dueDate: toPrismaDate(TODAY) } });
    expect(stillOne).toBe(1);
  });

  it('una recurrente con subtareas las guarda en la plantilla', async () => {
    // Fallo nº 2: la tabla antigua no tenía dónde guardarlas.
    await createTask({
      ...base,
      name: 'Limpieza grande',
      type: 'BIG_CLEAN',
      isRecurring: true,
      rule: { kind: 'WEEKLY', daysOfWeek: [1] },
      subtasks: [
        { name: 'Fregar suelos', assigneeUserId: 'user-1' },
        { name: 'Aspirar a fondo', assigneeUserId: null },
      ],
    });

    const template = await prisma.taskTemplate.findFirstOrThrow({ include: { subtasks: true } });
    expect(template.subtasks).toHaveLength(2);
  });
});

describe('dos personas a la vez', () => {
  it('los cambios simultaneos no se pisan', async () => {
    // El escenario que perdía datos en la app antigua: dos dispositivos
    // tocando tareas distintas a la vez. Cada mutación es su propia
    // transacción, así que ambas sobreviven.
    const a = await makeTask({ name: 'Sacar la basura', assignedToId: 'user-1' });
    const b = await makeTask({ name: 'Tender la ropa', assignedToId: 'user-2' });

    await Promise.all([setTaskStatus(a.id, 'COMPLETED'), setTaskStatus(b.id, 'COMPLETED')]);

    const saved = await prisma.taskOccurrence.findMany({ orderBy: { name: 'asc' } });
    expect(saved.map((t) => t.status)).toEqual(['COMPLETED', 'COMPLETED']);
  });
});
