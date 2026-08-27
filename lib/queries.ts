/**
 * Lectura de datos para las páginas (Server Components).
 *
 * Todo lo que sale de aquí es serializable y usa fechas como 'YYYY-MM-DD', para
 * que los componentes cliente no tengan que tocar objetos Date nunca.
 */

import 'server-only';
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
import { ensureRangeGenerated } from './generation';
import { calculateStats, type Stats } from './stats';
import { type Assignment, type Rule, parseAssignment, parseRule } from './recurrence';

export interface UserView {
  id: string;
  name: string;
  color: string;
  avatar: string;
}

export interface SubtaskView {
  id: string;
  name: string;
  assigneeUserId: string;
  status: 'PENDING' | 'COMPLETED';
  position: number;
}

export interface TaskView {
  id: string;
  templateId: string | null;
  name: string;
  type: 'RECURRENT' | 'SINGLE' | 'CHAPUZA' | 'BIG_CLEAN';
  category: string;
  assignedToId: string;
  dueDate: DateStr;
  status: 'PENDING' | 'COMPLETED' | 'SKIPPED';
  suggestible: boolean;
  weight: number;
  estimatedMinutes: number;
  priority: string | null;
  notes: string | null;
  completedAt: string | null;
  completedById: string | null;
  subtasks: SubtaskView[];
}

export interface TemplateView {
  id: string;
  name: string;
  type: 'RECURRENT' | 'SINGLE' | 'CHAPUZA' | 'BIG_CLEAN';
  category: string;
  suggestible: boolean;
  rule: Rule;
  assignment: Assignment;
  weight: number;
  estimatedMinutes: number;
  notes: string | null;
  active: boolean;
  startDate: DateStr;
  endDate: DateStr | null;
  subtasks: Array<{ id: string; name: string; assigneeUserId: string | null; position: number }>;
}

export interface HouseView {
  users: UserView[];
  settings: {
    houseName: string;
    startDay: StartDay;
    theme: string;
    timezone: string;
  };
  today: DateStr;
}

const OCCURRENCE_INCLUDE = { subtasks: { orderBy: { position: 'asc' } } } as const;

type OccurrenceRow = Awaited<
  ReturnType<typeof prisma.taskOccurrence.findMany<{ include: typeof OCCURRENCE_INCLUDE }>>
>[number];

function toTaskView(row: OccurrenceRow): TaskView {
  return {
    id: row.id,
    templateId: row.templateId,
    name: row.name,
    type: row.type,
    category: row.category,
    assignedToId: row.assignedToId,
    dueDate: toDateStr(row.dueDate),
    status: row.status,
    suggestible: row.suggestible,
    weight: row.weight,
    estimatedMinutes: row.estimatedMinutes,
    priority: row.priority,
    notes: row.notes,
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
    completedById: row.completedById,
    subtasks: row.subtasks.map((s) => ({
      id: s.id,
      name: s.name,
      assigneeUserId: s.assigneeUserId,
      status: s.status,
      position: s.position,
    })),
  };
}

/**
 * Personas y ajustes. Si la base de datos está vacía devuelve valores por
 * defecto en vez de reventar, para que la app sea usable antes del seed.
 */
export async function getHouse(): Promise<HouseView> {
  const [users, settings] = await Promise.all([
    prisma.user.findMany({ orderBy: { position: 'asc' } }),
    prisma.houseSettings.findUnique({ where: { id: 'default' } }),
  ]);

  return {
    users: users.map((u) => ({ id: u.id, name: u.name, color: u.color, avatar: u.avatar })),
    settings: {
      houseName: settings?.houseName ?? 'Nuestra Casa 🏠',
      startDay: (settings?.startDay ?? 'monday') as StartDay,
      theme: settings?.theme ?? 'light',
      timezone: settings?.timezone ?? 'Europe/Madrid',
    },
    today: todayStr(settings?.timezone),
  };
}

export function userIdsOf(house: HouseView): [string, string] {
  return [house.users[0]?.id ?? 'user-1', house.users[1]?.id ?? 'user-2'];
}

/** Tareas de un rango de fechas, generando antes lo que falte. */
export async function getTasksInRange(from: DateStr, to: DateStr): Promise<TaskView[]> {
  await ensureRangeGenerated(from, to);

  const rows = await prisma.taskOccurrence.findMany({
    where: { dueDate: { gte: toPrismaDate(from), lte: toPrismaDate(to) } },
    include: OCCURRENCE_INCLUDE,
    orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
  });

  return rows.map(toTaskView);
}

/** Tareas de la semana que contiene `date`. */
export async function getWeekTasks(date: DateStr, startDay: StartDay = 'monday') {
  const start = weekStart(date, startDay);
  const end = addDays(start, 6);
  const tasks = await getTasksInRange(start, end);
  return { start, end, tasks };
}

export async function getTask(id: string): Promise<TaskView | null> {
  const row = await prisma.taskOccurrence.findUnique({ where: { id }, include: OCCURRENCE_INCLUDE });
  return row ? toTaskView(row) : null;
}

export async function getTemplates(includeInactive = false): Promise<TemplateView[]> {
  const rows = await prisma.taskTemplate.findMany({
    where: includeInactive ? {} : { active: true },
    include: { subtasks: { orderBy: { position: 'asc' } } },
    orderBy: [{ active: 'desc' }, { name: 'asc' }],
  });

  return rows.map((t) => ({
    id: t.id,
    name: t.name,
    type: t.type,
    category: t.category,
    suggestible: t.suggestible,
    rule: parseRule(t.rule),
    assignment: parseAssignment(t.assignment),
    weight: t.weight,
    estimatedMinutes: t.estimatedMinutes,
    notes: t.notes,
    active: t.active,
    startDate: toDateStr(t.startDate),
    endDate: t.endDate ? toDateStr(t.endDate) : null,
    subtasks: t.subtasks.map((s) => ({
      id: s.id,
      name: s.name,
      assigneeUserId: s.assigneeUserId,
      position: s.position,
    })),
  }));
}

export interface ActivityView {
  id: string;
  userId: string;
  action: string;
  taskName: string;
  details: string;
  createdAt: string;
}

export async function getActivity(limit = 30): Promise<ActivityView[]> {
  const rows = await prisma.activityLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: limit,
  });

  return rows.map((r) => ({
    id: r.id,
    userId: r.userId,
    action: r.action,
    taskName: r.taskName,
    details: r.details,
    createdAt: r.createdAt.toISOString(),
  }));
}

export function statsFor(tasks: TaskView[], userIds: [string, string]): Stats {
  return calculateStats(tasks, userIds);
}

/**
 * Resumen por semana para el histórico.
 *
 * Solo mira lo que existe en la base de datos: no genera nada, porque el
 * histórico debe reflejar lo que pasó de verdad.
 */
export interface WeekSummary {
  start: DateStr;
  end: DateStr;
  stats: Stats;
}

export async function getWeekHistory(
  weeks: number,
  userIds: [string, string],
  startDay: StartDay = 'monday',
  today: DateStr = todayStr(),
): Promise<WeekSummary[]> {
  const currentStart = weekStart(today, startDay);
  const oldestStart = addDays(currentStart, -7 * (weeks - 1));

  const rows = await prisma.taskOccurrence.findMany({
    where: {
      dueDate: { gte: toPrismaDate(oldestStart), lte: toPrismaDate(addDays(currentStart, 6)) },
    },
    include: OCCURRENCE_INCLUDE,
  });

  const tasks = rows.map(toTaskView);
  const summaries: WeekSummary[] = [];

  for (let i = 0; i < weeks; i++) {
    const start = addDays(currentStart, -7 * i);
    const end = addDays(start, 6);
    const inWeek = tasks.filter((t) => t.dueDate >= start && t.dueDate <= end);
    if (inWeek.length === 0 && i > 0) continue; // semanas vacías del pasado: no las inventamos
    summaries.push({ start, end, stats: calculateStats(inWeek, userIds) });
  }

  return summaries;
}

/** Todas las tareas desde una fecha, para las estadísticas por periodo. */
export async function getTasksSince(from: DateStr, to: DateStr): Promise<TaskView[]> {
  const rows = await prisma.taskOccurrence.findMany({
    where: { dueDate: { gte: toPrismaDate(from), lte: toPrismaDate(to) } },
    include: OCCURRENCE_INCLUDE,
    orderBy: { dueDate: 'asc' },
  });
  return rows.map(toTaskView);
}
