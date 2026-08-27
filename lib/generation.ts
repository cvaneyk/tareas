/**
 * Generación de ocurrencias a partir de las plantillas recurrentes.
 *
 * Tres garantías, en orden de importancia:
 *
 * 1. Es idempotente. Llamarla mil veces produce el mismo resultado que
 *    llamarla una. La restricción @@unique([templateId, slotDate]) lo impone a
 *    nivel de base de datos, así que ni un bug en este fichero puede duplicar
 *    una tarea.
 * 2. Nunca inventa pasado. Solo genera desde el inicio de la semana actual en
 *    adelante; navegar al histórico muestra lo que realmente ocurrió.
 * 3. Nunca pisa trabajo hecho. Solo crea lo que falta; jamás modifica una
 *    ocurrencia existente, y mucho menos una completada.
 */

import type { Prisma, TaskTemplate, TemplateSubtask } from '@/generated/prisma/client';
import { prisma } from './db';
import {
  type DateStr,
  type StartDay,
  addDays,
  toDateStr,
  toPrismaDate,
  todayStr,
  weekStart,
} from './dates';
import { occurrencesInRange, parseAssignment, parseRule, resolveAssignee } from './recurrence';

/** Clave arbitraria pero estable para el advisory lock de generación. */
const GENERATION_LOCK_KEY = 4_820_115;

type TemplateWithSubtasks = TaskTemplate & { subtasks: TemplateSubtask[] };

export interface GenerationResult {
  created: number;
  from: DateStr;
  to: DateStr;
}

/**
 * Asegura que existen todas las ocurrencias entre `from` y `to`.
 * Devuelve cuántas ha creado (0 en el caso normal, que es el esperado).
 */
export async function ensureRangeGenerated(from: DateStr, to: DateStr): Promise<GenerationResult> {
  const settings = await prisma.houseSettings.findUnique({ where: { id: 'default' } });
  const startDay = (settings?.startDay ?? 'monday') as StartDay;

  // Nunca generamos hacia atrás: el histórico es lo que pasó, no lo que
  // debería haber pasado.
  const floor = weekStart(todayStr(settings?.timezone), startDay);
  const start = from < floor ? floor : from;

  if (start > to) return { created: 0, from: start, to };

  const created = await prisma.$transaction(async (tx) => {
    // Si los dos móviles abren la app a la vez, uno espera al otro en vez de
    // que ambos intenten crear las mismas filas.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${GENERATION_LOCK_KEY}::bigint)`;

    const users = await tx.user.findMany({ orderBy: { position: 'asc' } });
    if (users.length < 2) return 0;
    const userIds: [string, string] = [users[0].id, users[1].id];

    const templates = (await tx.taskTemplate.findMany({
      where: { active: true },
      include: { subtasks: { orderBy: { position: 'asc' } } },
    })) as TemplateWithSubtasks[];

    if (templates.length === 0) return 0;

    // Qué ranuras están ya ocupadas en el rango, para no pedirlo fila a fila.
    //
    // Se busca por slotDate, no por dueDate: una tarea pospuesta sigue ocupando
    // la ranura de su día original. Y NO se filtran las borradas: su fila existe
    // justamente para que el generador no vuelva a crearlas.
    const existing = await tx.taskOccurrence.findMany({
      where: {
        templateId: { in: templates.map((t) => t.id) },
        slotDate: { gte: toPrismaDate(start), lte: toPrismaDate(to) },
      },
      select: { templateId: true, slotDate: true },
    });

    const seen = new Set(
      existing.map((o) => `${o.templateId}|${o.slotDate ? toDateStr(o.slotDate) : ''}`),
    );

    let count = 0;

    for (const template of templates) {
      const recurrence = {
        rule: parseRule(template.rule),
        startDate: toDateStr(template.startDate),
        endDate: template.endDate ? toDateStr(template.endDate) : null,
      };
      const assignment = parseAssignment(template.assignment);

      for (const { date, seq } of occurrencesInRange(recurrence, start, to)) {
        if (seen.has(`${template.id}|${date}`)) continue;

        const assignedToId = resolveAssignee(assignment, { userIds, date, seq, startDay });

        await tx.taskOccurrence.create({
          data: {
            templateId: template.id,
            seq,
            name: template.name,
            type: template.type,
            category: template.category,
            assignedToId,
            dueDate: toPrismaDate(date),
            slotDate: toPrismaDate(date),
            suggestible: template.suggestible,
            weight: template.weight,
            estimatedMinutes: template.estimatedMinutes,
            priority: template.priority,
            notes: template.notes,
            subtasks: {
              create: template.subtasks.map((sub, index) => ({
                name: sub.name,
                // null en la plantilla = "quien tenga la tarea ese día".
                assigneeUserId: sub.assigneeUserId ?? assignedToId,
                position: sub.position ?? index,
              })),
            },
          },
        });

        seen.add(`${template.id}|${date}`);
        count++;
      }
    }

    return count;
  });

  return { created, from: start, to };
}

/** Asegura la semana que contiene `date`. */
export async function ensureWeekGenerated(
  date: DateStr,
  startDay: StartDay = 'monday',
): Promise<GenerationResult> {
  const start = weekStart(date, startDay);
  return ensureRangeGenerated(start, addDays(start, 6));
}

/**
 * Tras editar una plantilla: borra sus ocurrencias futuras que sigan
 * pendientes y las vuelve a crear con los valores nuevos.
 *
 * Deliberadamente NO toca el pasado ni nada completado u omitido. Si ayer
 * fregaste los platos, que hoy cambie el peso de la tarea no reescribe lo que
 * hiciste.
 */
export async function regenerateFutureForTemplate(templateId: string): Promise<void> {
  const settings = await prisma.houseSettings.findUnique({ where: { id: 'default' } });
  const startDay = (settings?.startDay ?? 'monday') as StartDay;
  const today = todayStr(settings?.timezone);

  const horizon = await futureHorizon(templateId, today);

  await prisma.taskOccurrence.deleteMany({
    where: {
      templateId,
      status: 'PENDING',
      // Por ranura, no por fecha de vencimiento: una tarea pospuesta al futuro
      // ocupa una ranura pasada, y borrarla la haría desaparecer sin que nada
      // la recreara.
      slotDate: { gte: toPrismaDate(today) },
      // Las lápidas se quedan: son días que se borraron a propósito.
      deletedAt: null,
    },
  });

  await ensureRangeGenerated(weekStart(today, startDay), horizon);
}

/**
 * Hasta dónde regenerar. Cubre todo lo que ya se había generado (por si
 * alguien había navegado a semanas futuras) con un mínimo de la semana
 * siguiente, para que el cambio se vea de inmediato.
 */
async function futureHorizon(templateId: string, today: DateStr): Promise<DateStr> {
  const last = await prisma.taskOccurrence.findFirst({
    where: { templateId, dueDate: { gte: toPrismaDate(today) } },
    orderBy: { dueDate: 'desc' },
    select: { dueDate: true },
  });

  const minimum = addDays(today, 14);
  const existing = last ? toDateStr(last.dueDate) : minimum;
  return existing > minimum ? existing : minimum;
}

/**
 * Desactiva una plantilla y limpia sus ocurrencias futuras pendientes.
 *
 * Es un borrado suave a propósito: el histórico y las estadísticas siguen
 * mostrando lo que ya se hizo con esa tarea.
 */
export async function deactivateTemplate(templateId: string, tx?: Prisma.TransactionClient) {
  const client = tx ?? prisma;
  const today = todayStr();

  await client.taskTemplate.update({ where: { id: templateId }, data: { active: false } });
  await client.taskOccurrence.deleteMany({
    where: {
      templateId,
      status: 'PENDING',
      dueDate: { gte: toPrismaDate(today) },
      deletedAt: null,
    },
  });
}
