/**
 * Fechas civiles (sin hora, sin zona) como strings 'YYYY-MM-DD'.
 *
 * Regla del proyecto: una fecha de vencimiento NUNCA se representa como Date en
 * la lógica de negocio. `new Date('2026-08-25')` es UTC medianoche, que en
 * Europe/Madrid es el día anterior a las 22:00 — el origen de la mitad de los
 * desfases de día de la app antigua. Aquí solo se convierte a Date en la
 * frontera con Prisma, y siempre a medianoche UTC.
 */

export type DateStr = string; // 'YYYY-MM-DD'

const MS_PER_DAY = 86_400_000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isDateStr(value: unknown): value is DateStr {
  return typeof value === 'string' && DATE_RE.test(value);
}

export function assertDateStr(value: unknown): DateStr {
  if (!isDateStr(value)) throw new Error(`Fecha inválida: ${String(value)}`);
  return value;
}

/** Número de días desde la época, tratando la fecha como civil (sin zona). */
export function epochDay(date: DateStr): number {
  const [y, m, d] = date.split('-').map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / MS_PER_DAY);
}

export function fromEpochDay(day: number): DateStr {
  return toDateStr(new Date(day * MS_PER_DAY));
}

/** Date (UTC) -> 'YYYY-MM-DD' leyendo los componentes UTC. */
export function toDateStr(date: Date): DateStr {
  return date.toISOString().slice(0, 10);
}

/** 'YYYY-MM-DD' -> Date a medianoche UTC. Solo para la frontera con Prisma. */
export function toPrismaDate(date: DateStr): Date {
  return new Date(`${assertDateStr(date)}T00:00:00.000Z`);
}

export function addDays(date: DateStr, days: number): DateStr {
  return fromEpochDay(epochDay(date) + days);
}

export function daysBetween(from: DateStr, to: DateStr): number {
  return epochDay(to) - epochDay(from);
}

export function compareDates(a: DateStr, b: DateStr): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Día de la semana en formato ISO: 1 = lunes … 7 = domingo. */
export function isoDayOfWeek(date: DateStr): number {
  const [y, m, d] = date.split('-').map(Number);
  const jsDay = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = domingo
  return jsDay === 0 ? 7 : jsDay;
}

export function dayOfMonth(date: DateStr): number {
  return Number(date.slice(8, 10));
}

/** El "hoy" del hogar, según la zona horaria configurada. */
export function todayStr(timeZone = process.env.TZ || 'Europe/Madrid'): DateStr {
  // 'en-CA' produce exactamente YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export type StartDay = 'monday' | 'sunday';

/** Primer día de la semana que contiene `date`. */
export function weekStart(date: DateStr, startDay: StartDay = 'monday'): DateStr {
  const iso = isoDayOfWeek(date); // 1..7
  const offset = startDay === 'monday' ? iso - 1 : iso % 7; // domingo -> 0
  return addDays(date, -offset);
}

/** Las 7 fechas de la semana que empieza en `start`. */
export function weekDates(start: DateStr): DateStr[] {
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

/**
 * Identificador de semana ISO 8601, ej. '2026-W35'. Solo para etiquetar en la
 * UI: no se persiste (era una columna que se desincronizaba en la app antigua).
 */
export function isoWeekId(date: DateStr): string {
  const [y, m, d] = date.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1, d));
  // Jueves de la misma semana ISO determina el año ISO.
  target.setUTCDate(target.getUTCDate() + 4 - (target.getUTCDay() || 7));
  const isoYear = target.getUTCFullYear();
  const yearStart = Date.UTC(isoYear, 0, 1);
  const week = Math.ceil(((target.getTime() - yearStart) / MS_PER_DAY + 1) / 7);
  return `${isoYear}-W${String(week).padStart(2, '0')}`;
}

/**
 * Paridad estable de semana, para la alternancia semanal.
 *
 * La app antigua usaba `numeroDeSemanaISO % 2`, que se rompe en los años de 53
 * semanas: W53 y W01 son ambas impares, así que a la misma persona le tocaba
 * dos semanas seguidas. Contar semanas desde una época fija no tiene ese salto.
 */
export function weekParity(date: DateStr, startDay: StartDay = 'monday'): 0 | 1 {
  const start = weekStart(date, startDay);
  // epochDay 0 = 1970-01-01, un jueves; da igual el desfase, solo importa que
  // el contador sea monótono y continuo.
  const weeks = Math.floor(epochDay(start) / 7);
  return (((weeks % 2) + 2) % 2) as 0 | 1;
}

// --- Formato para la interfaz (es-ES) ------------------------------------

function toDisplayDate(date: DateStr): Date {
  // Mediodía UTC: inmune a cualquier desplazamiento de zona al formatear.
  return new Date(`${date}T12:00:00.000Z`);
}

export function formatDateEs(
  date: DateStr,
  options: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long' },
): string {
  return new Intl.DateTimeFormat('es-ES', { ...options, timeZone: 'UTC' }).format(
    toDisplayDate(date),
  );
}

export function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Ej. "25 - 31 de agosto de 2026". */
export function formatWeekRange(start: DateStr): string {
  const end = addDays(start, 6);
  const sameMonth = start.slice(0, 7) === end.slice(0, 7);
  if (sameMonth) {
    const dayStart = formatDateEs(start, { day: 'numeric' });
    const rest = formatDateEs(end, { day: 'numeric', month: 'long', year: 'numeric' });
    return `${dayStart} - ${rest}`;
  }
  return `${formatDateEs(start, { day: 'numeric', month: 'short' })} - ${formatDateEs(end, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })}`;
}

export function formatMinutes(total: number): string {
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}
