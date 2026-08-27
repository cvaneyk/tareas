/**
 * Reglas de recurrencia y asignación.
 *
 * Sustituye a las 6 frecuencias de la app antigua ('daily', 'every_2_days',
 * 'every_x_days', 'weekly', 'custom_days', 'suggested'), que se solapaban entre
 * sí y mezclaban "cada cuánto" con "es opcional".
 */

import { z } from 'zod';
import {
  type DateStr,
  addDays,
  dayOfMonth,
  daysBetween,
  epochDay,
  isoDayOfWeek,
  weekParity,
  weekStart,
  type StartDay,
} from './dates';

// --- Esquemas ------------------------------------------------------------

export const RuleSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('DAILY') }),
  z.object({ kind: z.literal('EVERY_N_DAYS'), n: z.number().int().min(1).max(365) }),
  z.object({
    kind: z.literal('WEEKLY'),
    // ISO: 1 = lunes … 7 = domingo
    daysOfWeek: z.array(z.number().int().min(1).max(7)).min(1).max(7),
  }),
  z.object({ kind: z.literal('MONTHLY_DAY'), day: z.number().int().min(1).max(31) }),
]);

export type Rule = z.infer<typeof RuleSchema>;

export const AssignmentSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('FIXED'), userId: z.string().min(1) }),
  z.object({ mode: z.literal('ALTERNATE_WEEKLY') }),
  z.object({ mode: z.literal('ALTERNATE_TURN') }),
]);

export type Assignment = z.infer<typeof AssignmentSchema>;

/** Lee un campo Json de Prisma con validación. Lanza si está corrupto. */
export function parseRule(value: unknown): Rule {
  return RuleSchema.parse(value);
}

export function parseAssignment(value: unknown): Assignment {
  return AssignmentSchema.parse(value);
}

// --- Disparo -------------------------------------------------------------

function lastDayOfMonth(date: DateStr): number {
  const [y, m] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function normalizeDays(daysOfWeek: number[]): number[] {
  return [...new Set(daysOfWeek)].sort((a, b) => a - b);
}

export interface Recurrence {
  rule: Rule;
  startDate: DateStr;
  endDate?: DateStr | null;
}

/** ¿Le toca a esta plantilla en esta fecha? */
export function shouldTrigger({ rule, startDate, endDate }: Recurrence, date: DateStr): boolean {
  if (date < startDate) return false;
  if (endDate && date > endDate) return false;

  switch (rule.kind) {
    case 'DAILY':
      return true;

    case 'EVERY_N_DAYS':
      // daysBetween es siempre >= 0 aquí (date >= startDate), así que el módulo
      // no puede salir negativo — el Math.abs de la app antigua no hacía falta
      // y enmascaraba anclas mal puestas.
      return daysBetween(startDate, date) % rule.n === 0;

    case 'WEEKLY':
      return rule.daysOfWeek.includes(isoDayOfWeek(date));

    case 'MONTHLY_DAY': {
      // Un "día 31" en un mes de 30 cae el último día, en vez de saltarse el mes.
      const target = Math.min(rule.day, lastDayOfMonth(date));
      return dayOfMonth(date) === target;
    }
  }
}

/**
 * Índice de la ocurrencia (0, 1, 2…) contando desde startDate.
 *
 * Es lo que hace posible la alternancia "por turno" de verdad. La app antigua
 * usaba la paridad del día del calendario (`epochDay % 2`), así que una tarea
 * cada 3 días le tocaba a la misma persona varias veces seguidas.
 *
 * Presupone que `date` es una fecha en la que la regla dispara.
 */
export function occurrenceIndex({ rule, startDate }: Recurrence, date: DateStr): number {
  switch (rule.kind) {
    case 'DAILY':
      return daysBetween(startDate, date);

    case 'EVERY_N_DAYS':
      return Math.floor(daysBetween(startDate, date) / rule.n);

    case 'WEEKLY': {
      const days = normalizeDays(rule.daysOfWeek);
      const countBefore = (iso: number) => days.filter((d) => d < iso).length;

      const weeksApart =
        (epochDay(weekStart(date, 'monday')) - epochDay(weekStart(startDate, 'monday'))) / 7;

      // Ocurrencias en las semanas completas anteriores, menos las que en la
      // semana inicial caían antes de startDate, más las de esta semana antes
      // de `date`.
      return (
        weeksApart * days.length -
        countBefore(isoDayOfWeek(startDate)) +
        countBefore(isoDayOfWeek(date))
      );
    }

    case 'MONTHLY_DAY': {
      const monthIndex = (d: DateStr) => {
        const [y, m] = d.split('-').map(Number);
        return y * 12 + (m - 1);
      };
      const diff = monthIndex(date) - monthIndex(startDate);
      // Si el ancla cae después del día objetivo, la primera ocurrencia ya es
      // del mes siguiente.
      return dayOfMonth(startDate) > rule.day ? diff - 1 : diff;
    }
  }
}

/** Fechas en las que dispara la regla dentro de [from, to], con su índice. */
export function occurrencesInRange(
  recurrence: Recurrence,
  from: DateStr,
  to: DateStr,
): Array<{ date: DateStr; seq: number }> {
  const out: Array<{ date: DateStr; seq: number }> = [];
  const start = from < recurrence.startDate ? recurrence.startDate : from;

  for (let date = start; date <= to; date = addDays(date, 1)) {
    if (shouldTrigger(recurrence, date)) {
      out.push({ date, seq: occurrenceIndex(recurrence, date) });
    }
  }
  return out;
}

// --- Asignación ----------------------------------------------------------

export interface AssignmentContext {
  /** Ids de las dos personas, en orden (posición 0 y 1). */
  userIds: [string, string];
  date: DateStr;
  seq: number;
  startDay?: StartDay;
}

export function resolveAssignee(assignment: Assignment, ctx: AssignmentContext): string {
  switch (assignment.mode) {
    case 'FIXED':
      return ctx.userIds.includes(assignment.userId) ? assignment.userId : ctx.userIds[0];

    case 'ALTERNATE_WEEKLY':
      return ctx.userIds[weekParity(ctx.date, ctx.startDay ?? 'monday')];

    case 'ALTERNATE_TURN': {
      const parity = ((ctx.seq % 2) + 2) % 2;
      return ctx.userIds[parity];
    }
  }
}

// --- Etiquetas para la interfaz -----------------------------------------

export function describeRule(rule: Rule): string {
  const DAY_NAMES = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];

  switch (rule.kind) {
    case 'DAILY':
      return 'Todos los días';
    case 'EVERY_N_DAYS':
      return rule.n === 1 ? 'Todos los días' : `Cada ${rule.n} días`;
    case 'WEEKLY': {
      const names = normalizeDays(rule.daysOfWeek).map((d) => DAY_NAMES[d - 1]);
      if (names.length === 7) return 'Todos los días';
      if (names.length === 1) return `Cada ${names[0]}`;
      return `Los ${names.slice(0, -1).join(', ')} y ${names.at(-1)}`;
    }
    case 'MONTHLY_DAY':
      return `El día ${rule.day} de cada mes`;
  }
}

export function describeAssignment(
  assignment: Assignment,
  userName: (id: string) => string,
): string {
  switch (assignment.mode) {
    case 'FIXED':
      return userName(assignment.userId);
    case 'ALTERNATE_WEEKLY':
      return 'Alterna cada semana';
    case 'ALTERNATE_TURN':
      return 'Alterna por turno';
  }
}
