/**
 * Métricas de cumplimiento y reparto. Portado de engine.calculateStats, cuya
 * lógica ya era correcta; aquí solo se tipa y se separa del almacenamiento.
 */

import type { Status } from '@/generated/prisma/client';

export interface StatsInput {
  status: Status;
  weight: number;
  estimatedMinutes: number;
  category: string;
  assignedToId: string;
  completedById: string | null;
}

export interface PersonStats {
  id: string;
  tasksDone: number;
  pointsDone: number;
  pointsAssigned: number;
  pointsPercent: number;
  minutesDone: number;
}

export interface Stats {
  totalTasks: number;
  completedTasks: number;
  skippedTasks: number;
  pendingTasks: number;
  completionRate: number;
  totalPoints: number;
  user1: PersonStats;
  user2: PersonStats;
  categoryCounts: Record<string, number>;
}

function emptyPerson(id: string): PersonStats {
  return { id, tasksDone: 0, pointsDone: 0, pointsAssigned: 0, pointsPercent: 50, minutesDone: 0 };
}

export function calculateStats(tasks: StatsInput[], userIds: [string, string]): Stats {
  const [id1, id2] = userIds;
  const user1 = emptyPerson(id1);
  const user2 = emptyPerson(id2);
  const categoryCounts: Record<string, number> = {};

  let totalTasks = 0;
  let completedTasks = 0;
  let skippedTasks = 0;
  let pendingTasks = 0;

  for (const task of tasks) {
    // Las omitidas no cuentan ni a favor ni en contra: omitir "poner lavadora"
    // porque no había ropa no debe penalizar el cumplimiento.
    if (task.status === 'SKIPPED') {
      skippedTasks++;
      continue;
    }

    totalTasks++;

    const assigned = task.assignedToId === id1 ? user1 : task.assignedToId === id2 ? user2 : null;
    if (assigned) assigned.pointsAssigned += task.weight;

    if (task.status === 'COMPLETED') {
      completedTasks++;
      categoryCounts[task.category] = (categoryCounts[task.category] ?? 0) + 1;

      const doerId = task.completedById ?? task.assignedToId;
      const doer = doerId === id1 ? user1 : doerId === id2 ? user2 : null;
      if (doer) {
        doer.tasksDone++;
        doer.pointsDone += task.weight;
        doer.minutesDone += task.estimatedMinutes;
      }
    } else {
      pendingTasks++;
    }
  }

  const totalPoints = user1.pointsDone + user2.pointsDone;
  if (totalPoints > 0) {
    user1.pointsPercent = Math.round((user1.pointsDone / totalPoints) * 100);
    user2.pointsPercent = 100 - user1.pointsPercent;
  }

  return {
    totalTasks,
    completedTasks,
    skippedTasks,
    pendingTasks,
    completionRate: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
    totalPoints,
    user1,
    user2,
    categoryCounts,
  };
}
