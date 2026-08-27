'use server';

/**
 * Mutaciones sobre tareas.
 *
 * Cada una escribe en PostgreSQL y revalida las rutas afectadas. No hay cola de
 * sincronización, ni localStorage, ni `fetch` sin await: si algo falla, la
 * acción devuelve un error que la interfaz muestra, en lugar de dar por buena
 * una escritura que nunca ocurrió.
 */

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { addDays, toDateStr, toPrismaDate, todayStr, weekStart } from '@/lib/dates';
import { type ActionResult, TaskFormSchema, assigneeToAssignment, zodFailure } from '@/lib/schemas';
import { resolveAssignee } from '@/lib/recurrence';
import { regenerateFutureForTemplate } from '@/lib/generation';

function revalidateAll() {
  for (const path of ['/', '/semana', '/recurrentes', '/historico', '/estadisticas']) {
    revalidatePath(path);
  }
}

async function userIds(): Promise<[string, string]> {
  const users = await prisma.user.findMany({ orderBy: { position: 'asc' }, select: { id: true } });
  return [users[0]?.id ?? 'user-1', users[1]?.id ?? 'user-2'];
}

async function log(userId: string, action: string, taskName: string, details = '') {
  await prisma.activityLog.create({ data: { userId, action, taskName, details } });
}

// --- Completar / desmarcar ----------------------------------------------

export async function setTaskStatus(
  taskId: string,
  status: 'PENDING' | 'COMPLETED' | 'SKIPPED',
): Promise<ActionResult> {
  const task = await prisma.taskOccurrence.findUnique({
    where: { id: taskId },
    include: { subtasks: true },
  });
  if (!task) return { ok: false, error: 'Esa tarea ya no existe' };

  const completed = status === 'COMPLETED';
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.taskOccurrence.update({
      where: { id: taskId },
      data: {
        status,
        completedAt: completed ? now : null,
        completedById: completed ? task.assignedToId : null,
      },
    });

    // Completar la tarea padre completa sus subtareas, y desmarcarla las
    // devuelve a pendiente: es lo que espera cualquiera que toque la casilla.
    if (task.subtasks.length > 0) {
      await tx.occurrenceSubtask.updateMany({
        where: { occurrenceId: taskId },
        data: {
          status: completed ? 'COMPLETED' : 'PENDING',
          completedAt: completed ? now : null,
          completedById: completed ? task.assignedToId : null,
        },
      });
    }
  });

  const action = status === 'COMPLETED' ? 'complete' : status === 'SKIPPED' ? 'skip' : 'uncomplete';
  const details =
    status === 'COMPLETED'
      ? 'Marcada como completada'
      : status === 'SKIPPED'
        ? 'Omitida sin penalización'
        : 'Devuelta a pendiente';

  await log(task.assignedToId, action, task.name, details);

  revalidateAll();
  return { ok: true };
}

export async function setSubtaskStatus(
  subtaskId: string,
  completed: boolean,
): Promise<ActionResult> {
  const subtask = await prisma.occurrenceSubtask.findUnique({
    where: { id: subtaskId },
    include: { occurrence: true },
  });
  if (!subtask) return { ok: false, error: 'Esa subtarea ya no existe' };

  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.occurrenceSubtask.update({
      where: { id: subtaskId },
      data: {
        status: completed ? 'COMPLETED' : 'PENDING',
        completedAt: completed ? now : null,
        completedById: completed ? subtask.assigneeUserId : null,
      },
    });

    // La tarea padre se marca completa solo cuando lo están todas sus subtareas.
    const pending = await tx.occurrenceSubtask.count({
      where: { occurrenceId: subtask.occurrenceId, status: 'PENDING' },
    });

    const allDone = pending === 0;
    await tx.taskOccurrence.update({
      where: { id: subtask.occurrenceId },
      data: {
        status: allDone ? 'COMPLETED' : 'PENDING',
        completedAt: allDone ? now : null,
        completedById: allDone ? subtask.occurrence.assignedToId : null,
      },
    });
  });

  await log(
    subtask.assigneeUserId,
    completed ? 'complete' : 'uncomplete',
    `${subtask.occurrence.name} → ${subtask.name}`,
    completed ? 'Subtarea completada' : 'Subtarea desmarcada',
  );

  revalidateAll();
  return { ok: true };
}

// --- Acciones rápidas ----------------------------------------------------

export async function reassignTask(taskId: string): Promise<ActionResult> {
  const task = await prisma.taskOccurrence.findUnique({ where: { id: taskId } });
  if (!task) return { ok: false, error: 'Esa tarea ya no existe' };

  const [id1, id2] = await userIds();
  const other = task.assignedToId === id1 ? id2 : id1;

  await prisma.$transaction(async (tx) => {
    await tx.taskOccurrence.update({ where: { id: taskId }, data: { assignedToId: other } });
    // Las subtareas que seguían al responsable de la tarea le siguen ahora al nuevo.
    await tx.occurrenceSubtask.updateMany({
      where: { occurrenceId: taskId, assigneeUserId: task.assignedToId, status: 'PENDING' },
      data: { assigneeUserId: other },
    });
  });

  const name = await prisma.user.findUnique({ where: { id: other }, select: { name: true } });
  await log(other, 'reassign', task.name, `Reasignada a ${name?.name ?? other}`);

  revalidateAll();
  return { ok: true, message: `Tarea reasignada a ${name?.name ?? 'la otra persona'}` };
}

export async function postponeTask(taskId: string, days = 1): Promise<ActionResult> {
  const task = await prisma.taskOccurrence.findUnique({ where: { id: taskId } });
  if (!task) return { ok: false, error: 'Esa tarea ya no existe' };

  const target = addDays(toDateStr(task.dueDate), days);

  // Si la plantilla ya tiene una ocurrencia ese día, la restricción UNIQUE la
  // rechazaría. Desligamos esta copia de la plantilla en vez de fallar: pasa a
  // ser una tarea suelta pospuesta.
  const clash = task.templateId
    ? await prisma.taskOccurrence.findFirst({
        where: { templateId: task.templateId, dueDate: toPrismaDate(target) },
        select: { id: true },
      })
    : null;

  await prisma.taskOccurrence.update({
    where: { id: taskId },
    data: {
      dueDate: toPrismaDate(target),
      ...(clash ? { templateId: null, seq: null } : {}),
    },
  });

  await log(task.assignedToId, 'reschedule', task.name, `Pospuesta al ${target}`);

  revalidateAll();
  return { ok: true, message: `Pospuesta al ${target}` };
}

export async function deleteTask(taskId: string): Promise<ActionResult> {
  const task = await prisma.taskOccurrence.findUnique({ where: { id: taskId } });
  if (!task) return { ok: false, error: 'Esa tarea ya no existe' };

  await prisma.taskOccurrence.delete({ where: { id: taskId } });
  await log(task.assignedToId, 'delete', task.name, 'Tarea eliminada');

  revalidateAll();
  return { ok: true, message: 'Tarea eliminada' };
}

// --- Crear ---------------------------------------------------------------

/**
 * Crea una tarea. Si es recurrente crea la PLANTILLA y deja que el generador
 * produzca las ocurrencias.
 *
 * La app antigua creaba la plantilla *y además* una instancia suelta con
 * templateId 'custom_tmpl' (un id inexistente), así que el generador creaba una
 * segunda instancia ese mismo día: cada tarea recurrente nacía duplicada.
 */
export async function createTask(input: unknown): Promise<ActionResult> {
  const parsed = TaskFormSchema.safeParse(input);
  if (!parsed.success) return zodFailure(parsed.error);

  const form = parsed.data;
  const [id1, id2] = await userIds();
  const assignment = assigneeToAssignment(form.assignee);

  if (form.isRecurring && form.rule) {
    const template = await prisma.taskTemplate.create({
      data: {
        name: form.name,
        type: form.type === 'SINGLE' ? 'RECURRENT' : form.type,
        category: form.category,
        suggestible: form.suggestible,
        rule: form.rule,
        assignment,
        weight: form.weight,
        estimatedMinutes: form.estimatedMinutes,
        priority: form.priority ?? null,
        notes: form.notes,
        startDate: toPrismaDate(form.dueDate),
        endDate: form.endDate ? toPrismaDate(form.endDate) : null,
        subtasks: {
          create: form.subtasks.map((s, position) => ({
            name: s.name,
            assigneeUserId: s.assigneeUserId || null,
            position,
          })),
        },
      },
    });

    await regenerateFutureForTemplate(template.id);
    await log(id1, 'create', form.name, 'Tarea recurrente creada');

    revalidateAll();
    return { ok: true, message: `"${form.name}" se repetirá automáticamente` };
  }

  const assignedToId = resolveAssignee(assignment, {
    userIds: [id1, id2],
    date: form.dueDate,
    seq: 0,
  });

  await prisma.taskOccurrence.create({
    data: {
      name: form.name,
      type: form.type,
      category: form.category,
      assignedToId,
      dueDate: toPrismaDate(form.dueDate),
      suggestible: form.suggestible,
      weight: form.weight,
      estimatedMinutes: form.estimatedMinutes,
      priority: form.priority ?? null,
      notes: form.notes,
      subtasks: {
        create: form.subtasks.map((s, position) => ({
          name: s.name,
          assigneeUserId: s.assigneeUserId || assignedToId,
          position,
        })),
      },
    },
  });

  await log(assignedToId, 'create', form.name, `Creada para el ${form.dueDate}`);

  revalidateAll();
  return { ok: true, message: `Tarea "${form.name}" creada` };
}

/** Vuelve a generar la semana visible. Es seguro llamarla siempre: es idempotente. */
export async function regenerateWeek(date?: string): Promise<ActionResult> {
  const settings = await prisma.houseSettings.findUnique({ where: { id: 'default' } });
  const startDay = (settings?.startDay ?? 'monday') as 'monday' | 'sunday';
  const base = date ?? todayStr(settings?.timezone);

  const { ensureRangeGenerated } = await import('@/lib/generation');
  const start = weekStart(base, startDay);
  const result = await ensureRangeGenerated(start, addDays(start, 6));

  revalidateAll();
  return {
    ok: true,
    message:
      result.created > 0
        ? `${result.created} tarea${result.created === 1 ? '' : 's'} añadida${result.created === 1 ? '' : 's'}`
        : 'La semana ya estaba completa',
  };
}
