'use server';

/**
 * Mutaciones sobre plantillas recurrentes.
 *
 * Editar y borrar tocan solo el futuro pendiente. Lo que ya se hizo es
 * histórico y no se reescribe.
 */

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { toPrismaDate } from '@/lib/dates';
import { deactivateTemplate, regenerateFutureForTemplate } from '@/lib/generation';
import { type ActionResult, TaskFormSchema, assigneeToAssignment, zodFailure } from '@/lib/schemas';

function revalidateAll() {
  for (const path of ['/', '/semana', '/recurrentes', '/historico', '/estadisticas']) {
    revalidatePath(path);
  }
}

export async function updateTemplate(templateId: string, input: unknown): Promise<ActionResult> {
  const parsed = TaskFormSchema.safeParse(input);
  if (!parsed.success) return zodFailure(parsed.error);

  const form = parsed.data;
  if (!form.rule) return { ok: false, error: 'Falta la frecuencia de repetición' };

  const existing = await prisma.taskTemplate.findUnique({ where: { id: templateId } });
  if (!existing) return { ok: false, error: 'Esa tarea recurrente ya no existe' };

  await prisma.$transaction(async (tx) => {
    await tx.taskTemplate.update({
      where: { id: templateId },
      data: {
        name: form.name,
        type: form.type === 'SINGLE' ? 'RECURRENT' : form.type,
        category: form.category,
        suggestible: form.suggestible,
        rule: form.rule,
        assignment: assigneeToAssignment(form.assignee),
        weight: form.weight,
        estimatedMinutes: form.estimatedMinutes,
        priority: form.priority ?? null,
        notes: form.notes,
        startDate: toPrismaDate(form.dueDate),
        endDate: form.endDate ? toPrismaDate(form.endDate) : null,
      },
    });

    // Las subtareas se reemplazan en bloque: es una lista corta y editarla así
    // evita tener que reconciliar altas, bajas y reordenaciones.
    await tx.templateSubtask.deleteMany({ where: { templateId } });
    if (form.subtasks.length > 0) {
      await tx.templateSubtask.createMany({
        data: form.subtasks.map((s, position) => ({
          templateId,
          name: s.name,
          assigneeUserId: s.assigneeUserId || null,
          position,
        })),
      });
    }
  });

  await regenerateFutureForTemplate(templateId);

  await prisma.activityLog.create({
    data: {
      userId: (await prisma.user.findFirstOrThrow({ orderBy: { position: 'asc' } })).id,
      action: 'template',
      taskName: form.name,
      details: 'Tarea recurrente actualizada',
    },
  });

  revalidateAll();
  return { ok: true, message: `"${form.name}" actualizada` };
}

/**
 * Borrado suave: desactiva la plantilla y elimina sus ocurrencias futuras
 * pendientes, conservando el histórico de lo ya hecho.
 */
export async function deleteTemplate(templateId: string): Promise<ActionResult> {
  const template = await prisma.taskTemplate.findUnique({ where: { id: templateId } });
  if (!template) return { ok: false, error: 'Esa tarea recurrente ya no existe' };

  await deactivateTemplate(templateId);

  revalidateAll();
  return { ok: true, message: `"${template.name}" ya no se repetirá` };
}

export async function setTemplateActive(
  templateId: string,
  active: boolean,
): Promise<ActionResult> {
  const template = await prisma.taskTemplate.findUnique({ where: { id: templateId } });
  if (!template) return { ok: false, error: 'Esa tarea recurrente ya no existe' };

  if (active) {
    await prisma.taskTemplate.update({ where: { id: templateId }, data: { active: true } });
    await regenerateFutureForTemplate(templateId);
  } else {
    await deactivateTemplate(templateId);
  }

  revalidateAll();
  return { ok: true, message: active ? 'Reactivada' : 'Pausada' };
}
