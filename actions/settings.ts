'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { type ActionResult, HouseFormSchema, UsersFormSchema, zodFailure } from '@/lib/schemas';

function revalidateAll() {
  for (const path of ['/', '/semana', '/recurrentes', '/historico', '/estadisticas', '/ajustes']) {
    revalidatePath(path);
  }
}

export async function updateUsers(input: unknown): Promise<ActionResult> {
  const parsed = UsersFormSchema.safeParse(input);
  if (!parsed.success) return zodFailure(parsed.error);

  await prisma.$transaction(
    parsed.data.users.map((u) =>
      prisma.user.update({
        where: { id: u.id },
        data: { name: u.name, color: u.color, avatar: u.avatar },
      }),
    ),
  );

  revalidateAll();
  return { ok: true, message: 'Personas actualizadas' };
}

export async function updateHouse(input: unknown): Promise<ActionResult> {
  const parsed = HouseFormSchema.safeParse(input);
  if (!parsed.success) return zodFailure(parsed.error);

  await prisma.houseSettings.upsert({
    where: { id: 'default' },
    update: parsed.data,
    create: { id: 'default', ...parsed.data },
  });

  revalidateAll();
  return { ok: true, message: 'Ajustes guardados' };
}

/** Copia de seguridad completa, en el mismo formato que importa la app. */
export async function exportBackup(): Promise<string> {
  const [users, settings, templates, occurrences, activity] = await Promise.all([
    prisma.user.findMany({ orderBy: { position: 'asc' } }),
    prisma.houseSettings.findUnique({ where: { id: 'default' } }),
    prisma.taskTemplate.findMany({ include: { subtasks: { orderBy: { position: 'asc' } } } }),
    prisma.taskOccurrence.findMany({
      include: { subtasks: { orderBy: { position: 'asc' } } },
      orderBy: { dueDate: 'asc' },
    }),
    prisma.activityLog.findMany({ orderBy: { createdAt: 'desc' }, take: 500 }),
  ]);

  return JSON.stringify(
    {
      version: 2,
      exportedAt: new Date().toISOString(),
      users,
      settings,
      templates,
      occurrences,
      activity,
    },
    null,
    2,
  );
}
