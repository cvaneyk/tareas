/**
 * Migra los datos de la app antigua (PHP + MySQL) al esquema nuevo.
 *
 * Entrada: el JSON que devuelve `api.php?action=get_all`, o una copia de
 * seguridad exportada desde Ajustes en la versión antigua.
 *
 *   curl "https://TU-DOMINIO/api.php?action=get_all" > legacy.json
 *   npm run migrate:legacy -- legacy.json --dry-run
 *   npm run migrate:legacy -- legacy.json
 *
 * Opciones:
 *   --dry-run           No escribe nada; solo informa de lo que haría.
 *   --since=YYYY-MM-DD  Importa solo tareas desde esa fecha. Útil para dejar
 *                       fuera el histórico falso que sembraba seedDemoData().
 *   --wipe              Vacía las tablas antes de importar (para reintentar).
 */

import { readFileSync } from 'node:fs';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import {
  type DateStr,
  isDateStr,
  isoDayOfWeek,
  toPrismaDate,
  todayStr,
  weekStart,
} from '../lib/dates';
import { type Assignment, type Rule } from '../lib/recurrence';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

// --- Formas de los datos antiguos ---------------------------------------

interface LegacyUser {
  id: string;
  name?: string;
  color?: string;
  avatar?: string;
}

interface LegacyTemplate {
  id: string;
  name: string;
  type?: string;
  category?: string;
  frequency?: string;
  frequencyConfig?: { intervalDays?: number; dayOfWeek?: number; daysOfWeek?: number[]; anchorDate?: string } | null;
  frequency_config?: string | null;
  defaultAssignee?: string;
  default_assignee?: string;
  weight?: number | string;
  estimatedMinutes?: number | string;
  estimated_minutes?: number | string;
  notes?: string | null;
  active?: boolean | number;
}

interface LegacySubtask {
  id: string;
  name: string;
  assignedTo?: string;
  status?: string;
  completedAt?: string | null;
  completedBy?: string | null;
}

interface LegacyInstance {
  id: string;
  templateId?: string | null;
  template_id?: string | null;
  name: string;
  type?: string;
  category?: string;
  assignedTo?: string;
  assigned_to?: string;
  dueDate?: string;
  due_date?: string;
  status?: string;
  weight?: number | string;
  estimatedMinutes?: number | string;
  estimated_minutes?: number | string;
  priority?: string | null;
  notes?: string | null;
  completedAt?: string | null;
  completed_at?: string | null;
  completedBy?: string | null;
  completed_by?: string | null;
  subtasks?: LegacySubtask[];
}

interface LegacyActivity {
  id?: string;
  userId?: string;
  user_id?: string;
  action?: string;
  taskName?: string;
  task_name?: string;
  details?: string | null;
  timestamp?: string;
}

interface LegacyDump {
  users?: LegacyUser[];
  settings?: Record<string, unknown>;
  templates?: LegacyTemplate[];
  instances?: LegacyInstance[];
  activityLog?: LegacyActivity[];
}

// --- Subtareas que la base de datos antigua no podía guardar -------------

/**
 * La tabla task_templates antigua no tenía columna de subtareas, así que la
 * "Limpieza grande" las perdía. Se re-siembran desde los valores por defecto
 * que había en js/storage.js.
 */
const RECOVERED_TEMPLATE_SUBTASKS: Record<string, Array<{ name: string; assignee: string | null }>> =
  {
    tmpl_limpieza_grande: [
      { name: 'Cambiar sábanas', assignee: 'user-1' },
      { name: 'Limpiar terraza', assignee: 'user-1' },
      { name: 'Poner lavadora sábanas', assignee: 'user-1' },
      { name: 'Aspirar a fondo', assignee: 'user-2' },
      { name: 'Fregar suelos', assignee: 'user-2' },
      { name: 'Limpiar polvo muebles', assignee: 'user-2' },
      { name: 'Limpiar baño completo', assignee: 'user-2' },
    ],
  };

// --- Traducción ----------------------------------------------------------

function num(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : fallback;
}

function toDateOnly(value: unknown): DateStr | null {
  if (typeof value !== 'string' || value.length === 0) return null;
  const candidate = value.slice(0, 10);
  return isDateStr(candidate) ? candidate : null;
}

/** JS usaba 0 = domingo; ISO usa 7. */
function jsDayToIso(day: number): number {
  return day === 0 ? 7 : day;
}

function parseFrequencyConfig(template: LegacyTemplate) {
  if (template.frequencyConfig && typeof template.frequencyConfig === 'object') {
    return template.frequencyConfig;
  }
  if (typeof template.frequency_config === 'string') {
    try {
      return JSON.parse(template.frequency_config) as NonNullable<LegacyTemplate['frequencyConfig']>;
    } catch {
      return null;
    }
  }
  return null;
}

function toRule(template: LegacyTemplate): Rule {
  const config = parseFrequencyConfig(template);

  /**
   * Día de la semana de una plantilla 'weekly'. Muchas no guardaban
   * `dayOfWeek`, solo `anchorDate`; el motor antiguo caía en ese caso al día de
   * la semana del ancla (engine.js: `frequencyConfig?.dayOfWeek ?? anchor.getDay()`),
   * así que aquí se hace lo mismo para no cambiarte el día en que toca.
   */
  const weeklyDay = (): number => {
    if (typeof config?.dayOfWeek === 'number') return jsDayToIso(config.dayOfWeek);
    const anchor = toDateOnly(config?.anchorDate);
    if (anchor) return isoDayOfWeek(anchor);
    return 1;
  };

  switch (template.frequency) {
    case 'daily':
      return { kind: 'DAILY' };

    case 'every_2_days':
      return { kind: 'EVERY_N_DAYS', n: num(config?.intervalDays, 2) };

    case 'every_x_days':
      return { kind: 'EVERY_N_DAYS', n: num(config?.intervalDays, 2) };

    case 'weekly':
      return { kind: 'WEEKLY', daysOfWeek: [weeklyDay()] };

    case 'custom_days': {
      const days = (config?.daysOfWeek ?? []).map(jsDayToIso);
      return { kind: 'WEEKLY', daysOfWeek: days.length > 0 ? days : [1] };
    }

    // 'suggested' era a la vez tipo, frecuencia y estado. Como frecuencia
    // significaba "cada 2 días"; lo de "sugerida" pasa al flag suggestible.
    case 'suggested':
      return { kind: 'EVERY_N_DAYS', n: num(config?.intervalDays, 2) };

    default:
      return { kind: 'DAILY' };
  }
}

function toAssignment(value: string | undefined, userIds: string[]): Assignment {
  if (value === 'alternate_weekly') return { mode: 'ALTERNATE_WEEKLY' };
  if (value === 'alternate_turn') return { mode: 'ALTERNATE_TURN' };
  if (value && userIds.includes(value)) return { mode: 'FIXED', userId: value };
  return { mode: 'FIXED', userId: userIds[0] ?? 'user-1' };
}

function toType(legacyType: string | undefined): 'RECURRENT' | 'SINGLE' | 'CHAPUZA' | 'BIG_CLEAN' {
  switch (legacyType) {
    case 'recurrent':
    case 'suggested':
      return 'RECURRENT';
    case 'chapuza':
      return 'CHAPUZA';
    case 'big_clean':
      return 'BIG_CLEAN';
    default:
      return 'SINGLE';
  }
}

function toStatus(legacyStatus: string | undefined): 'PENDING' | 'COMPLETED' | 'SKIPPED' {
  if (legacyStatus === 'completed') return 'COMPLETED';
  if (legacyStatus === 'skipped') return 'SKIPPED';
  return 'PENDING';
}

/**
 * 'Y-m-d H:i:s' sin zona, escrito por PHP con la zona del servidor. Se
 * interpreta en la zona de la casa.
 */
function toTimestamp(value: unknown, timeZone: string): Date | null {
  if (typeof value !== 'string' || value.length === 0) return null;

  const iso = value.includes('T') ? value : value.replace(' ', 'T');
  const parsed = new Date(iso.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(iso) ? iso : `${iso}Z`);
  if (Number.isNaN(parsed.getTime())) return null;

  if (iso.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(iso)) return parsed;

  // Sin zona: corregimos el desfase de la zona de la casa.
  const offsetMinutes = timezoneOffsetMinutes(parsed, timeZone);
  return new Date(parsed.getTime() - offsetMinutes * 60_000);
}

function timezoneOffsetMinutes(date: Date, timeZone: string): number {
  const formatted = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date);

  const get = (type: string) => Number(formatted.find((p) => p.type === type)?.value ?? 0);
  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour') % 24,
    get('minute'),
    get('second'),
  );

  return (asUtc - date.getTime()) / 60_000;
}

/** Heurística para reconocer el histórico falso de seedDemoData(). */
function looksLikeDemo(instance: LegacyInstance): boolean {
  const completedAt = instance.completedAt ?? instance.completed_at;
  if (typeof completedAt !== 'string') return false;
  return completedAt.endsWith('T18:00:00.000Z') || completedAt.endsWith('T12:00:00.000Z');
}

// --- Migración -----------------------------------------------------------

interface Options {
  file: string;
  dryRun: boolean;
  since: DateStr | null;
  wipe: boolean;
}

function parseArgs(argv: string[]): Options {
  const positional = argv.filter((a) => !a.startsWith('--'));
  const flags = argv.filter((a) => a.startsWith('--'));

  const sinceFlag = flags.find((f) => f.startsWith('--since='))?.split('=')[1];
  if (sinceFlag && !isDateStr(sinceFlag)) {
    throw new Error(`--since debe ser una fecha YYYY-MM-DD, recibido: ${sinceFlag}`);
  }

  return {
    file: positional[0] ?? 'legacy.json',
    dryRun: flags.includes('--dry-run'),
    since: sinceFlag ?? null,
    wipe: flags.includes('--wipe'),
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  console.log(`\nLeyendo ${options.file}...`);
  const dump = JSON.parse(readFileSync(options.file, 'utf8')) as LegacyDump;

  const timeZone =
    (typeof dump.settings?.timezone === 'string' ? dump.settings.timezone : null) ??
    'Europe/Madrid';

  // --- Personas ---
  const legacyUsers = (dump.users ?? []).filter((u) => u?.id);
  const users =
    legacyUsers.length >= 2
      ? legacyUsers.slice(0, 2)
      : [
          { id: 'user-1', name: 'Persona 1', color: '#3b82f6', avatar: '🧑‍💻' },
          { id: 'user-2', name: 'Persona 2', color: '#10b981', avatar: '🎨' },
        ];
  const userIds = users.map((u) => u.id);

  // --- Plantillas ---
  const templates = (dump.templates ?? []).filter((t) => t?.id && t?.name);

  const templateIds = new Set(templates.map((t) => t.id));

  // --- Instancias ---
  const rawInstances = (dump.instances ?? []).filter((i) => i?.id && i?.name);
  let demoCount = 0;
  let outOfRangeCount = 0;
  let undatedCount = 0;

  interface Candidate {
    instance: LegacyInstance;
    dueDate: DateStr;
    templateId: string | null;
    status: 'PENDING' | 'COMPLETED' | 'SKIPPED';
  }

  const candidates: Candidate[] = [];

  for (const instance of rawInstances) {
    const dueDate = toDateOnly(instance.dueDate ?? instance.due_date);
    if (!dueDate) {
      undatedCount++;
      continue;
    }

    if (looksLikeDemo(instance)) demoCount++;

    if (options.since && dueDate < options.since) {
      outOfRangeCount++;
      continue;
    }

    const rawTemplateId = instance.templateId ?? instance.template_id ?? null;

    // 'custom_tmpl' era el id inventado que la app antigua ponía a las
    // instancias que creaba de más junto a la plantilla. Y algunas apuntan a
    // plantillas que ya no existen (ej. 'tmpl_arenero'). Ninguno es real.
    const templateId =
      rawTemplateId && templateIds.has(rawTemplateId) ? rawTemplateId : null;

    candidates.push({ instance, dueDate, templateId, status: toStatus(instance.status) });
  }

  // Una tarea hecha vale más que una pendiente, y una omitida más que nada.
  const rank = (c: Candidate) =>
    c.status === 'COMPLETED' ? 3 : c.status === 'SKIPPED' ? 2 : 1;

  const best = (a: Candidate, b: Candidate) => (rank(b) > rank(a) ? b : a);

  /**
   * Paso 1: colapsar por (nombre, fecha).
   *
   * Es la firma exacta del bug antiguo: la misma tarea, el mismo día, una vez
   * por la plantilla y otra con 'custom_tmpl'. A menudo la copia huérfana es
   * justo la que está completada, así que no se puede descartar sin más: gana
   * la más "hecha", y se queda con la plantilla del grupo para que la
   * recurrencia sea la dueña de ese día.
   */
  const groups = new Map<string, Candidate[]>();
  for (const candidate of candidates) {
    const key = `${candidate.instance.name}|${candidate.dueDate}`;
    const group = groups.get(key);
    if (group) group.push(candidate);
    else groups.set(key, [candidate]);
  }

  const survivors: Candidate[] = [];
  for (const group of groups.values()) {
    const realIds = [...new Set(group.map((c) => c.templateId).filter(Boolean))];

    // Dos plantillas distintas que comparten nombre y día son dos tareas
    // distintas, no un duplicado. No se tocan.
    if (realIds.length > 1) {
      survivors.push(...group);
      continue;
    }

    const winner = group.reduce(best);
    winner.templateId = realIds[0] ?? null;
    survivors.push(winner);
  }

  /**
   * Paso 2: red de seguridad por (plantilla, fecha).
   *
   * Si una plantilla se renombró en algún momento, sus instancias viejas y
   * nuevas caen en grupos distintos en el paso 1 y podrían chocar con la
   * restricción UNIQUE. Aquí se resuelve con el mismo criterio.
   */
  const byTemplateDay = new Map<string, Candidate>();
  const loose: Candidate[] = [];

  for (const candidate of survivors) {
    if (!candidate.templateId) {
      loose.push(candidate);
      continue;
    }
    const key = `${candidate.templateId}|${candidate.dueDate}`;
    const existing = byTemplateDay.get(key);
    byTemplateDay.set(key, existing ? best(existing, candidate) : candidate);
  }

  const finalCandidates = [...byTemplateDay.values(), ...loose];
  const collapsed = candidates.length - finalCandidates.length;

  console.log('\n--- Resumen ---');
  console.log(`  Personas:             ${users.length}`);
  console.log(`  Plantillas:           ${templates.length}`);
  console.log(`  Tareas en el volcado: ${rawInstances.length}`);
  console.log(`    se importan:        ${finalCandidates.length}`);
  console.log(`      de plantilla:     ${byTemplateDay.size}`);
  console.log(`      sueltas:          ${loose.length}`);
  console.log(`    duplicadas (se colapsan): ${collapsed}`);
  console.log(`    sin fecha (se descartan): ${undatedCount}`);
  if (options.since) {
    console.log(`    anteriores a ${options.since} (se descartan): ${outOfRangeCount}`);
  }
  console.log(`  Registro de actividad: ${(dump.activityLog ?? []).length}`);

  if (demoCount > 0) {
    console.log(
      `\n  Con pinta de datos de ejemplo (seedDemoData): ${demoCount}` +
        (options.since ? '' : '\n    → si quieres dejarlos fuera, repite con --since=YYYY-MM-DD'),
    );
  }

  // Las semanales sin dayOfWeek heredan el día del ancla: conviene verlo.
  const weekly = templates.filter((t) => t.frequency === 'weekly');
  if (weekly.length > 0) {
    const DAYS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
    console.log('\n  Tareas semanales — día en que quedan:');
    for (const t of weekly) {
      const rule = toRule(t);
      if (rule.kind === 'WEEKLY') {
        console.log(`    ${t.name.padEnd(30)} ${rule.daysOfWeek.map((d) => DAYS[d - 1]).join(', ')}`);
      }
    }
    console.log('    (si no cuadra, se cambia en Recurrentes → ✏️ en dos clics)');
  }

  if (options.dryRun) {
    console.log('\n--dry-run: no se ha escrito nada.\n');
    return;
  }

  // --- Escritura ---
  if (options.wipe) {
    console.log('\n--wipe: vaciando tablas...');
    await prisma.$transaction([
      prisma.occurrenceSubtask.deleteMany(),
      prisma.taskOccurrence.deleteMany(),
      prisma.templateSubtask.deleteMany(),
      prisma.taskTemplate.deleteMany(),
      prisma.activityLog.deleteMany(),
    ]);
  }

  console.log('\nEscribiendo en PostgreSQL...');

  for (const [index, user] of users.entries()) {
    await prisma.user.upsert({
      where: { id: user.id },
      update: {
        name: user.name ?? `Persona ${index + 1}`,
        color: user.color ?? '#3b82f6',
        avatar: user.avatar ?? '👤',
        position: index,
      },
      create: {
        id: user.id,
        name: user.name ?? `Persona ${index + 1}`,
        color: user.color ?? '#3b82f6',
        avatar: user.avatar ?? '👤',
        position: index,
      },
    });
  }

  const settings = dump.settings ?? {};
  const houseSettings = {
    houseName: String(settings.house_name ?? settings.houseName ?? 'Nuestra Casa 🏠'),
    startDay: String(settings.start_day ?? settings.startDay ?? 'monday'),
    theme: String(settings.theme ?? 'light'),
    timezone: timeZone,
  };

  // Los ajustes sí se sobrescriben: son los que tenías configurados y es lo que
  // esperas al importar. Las plantillas y las tareas, en cambio, solo se crean
  // si no existen ya, para no pisar nada que hayas tocado en la app nueva
  // (usa --wipe si quieres rehacer la importación desde cero).
  await prisma.houseSettings.upsert({
    where: { id: 'default' },
    update: houseSettings,
    create: { id: 'default', ...houseSettings },
  });

  // Fecha de inicio real de cada plantilla: su primera ocurrencia importada.
  const firstOccurrence = new Map<string, DateStr>();
  for (const candidate of finalCandidates) {
    if (!candidate.templateId) continue;
    const current = firstOccurrence.get(candidate.templateId);
    if (!current || candidate.dueDate < current) {
      firstOccurrence.set(candidate.templateId, candidate.dueDate);
    }
  }

  const fallbackStart = weekStart(todayStr(timeZone));

  for (const template of templates) {
    const config = parseFrequencyConfig(template);
    const anchor = toDateOnly(config?.anchorDate);

    // El ancla '2026-08-25' era un literal por defecto del código antiguo, no
    // una fecha real: se prefiere la primera ocurrencia que existió.
    const startDate = firstOccurrence.get(template.id) ?? anchor ?? fallbackStart;

    const isActive = template.active === undefined ? true : Boolean(Number(template.active));

    await prisma.taskTemplate.upsert({
      where: { id: template.id },
      update: {},
      create: {
        id: template.id,
        name: template.name,
        type: toType(template.type),
        category: template.category ?? 'hogar',
        suggestible: template.type === 'suggested' || template.frequency === 'suggested',
        rule: toRule(template),
        assignment: toAssignment(
          template.defaultAssignee ?? template.default_assignee,
          userIds,
        ),
        weight: num(template.weight, 1),
        estimatedMinutes: num(template.estimatedMinutes ?? template.estimated_minutes, 15),
        notes: template.notes ?? null,
        active: isActive,
        startDate: toPrismaDate(startDate),
      },
    });

    const recovered = RECOVERED_TEMPLATE_SUBTASKS[template.id];
    if (recovered) {
      const already = await prisma.templateSubtask.count({ where: { templateId: template.id } });
      if (already === 0) {
        await prisma.templateSubtask.createMany({
          data: recovered.map((sub, position) => ({
            templateId: template.id,
            name: sub.name,
            assigneeUserId: sub.assignee,
            position,
          })),
        });
      }
    }
  }

  let written = 0;
  for (const candidate of finalCandidates) {
    const { instance, dueDate } = candidate;
    const realTemplateId = candidate.templateId;

    const assignedToId = instance.assignedTo ?? instance.assigned_to ?? userIds[0];
    if (!userIds.includes(assignedToId)) continue;

    const completedById = instance.completedBy ?? instance.completed_by ?? null;

    await prisma.taskOccurrence.upsert({
      where: { id: instance.id },
      update: {},
      create: {
        id: instance.id,
        templateId: realTemplateId,
        name: instance.name,
        type: toType(instance.type),
        category: instance.category ?? 'hogar',
        assignedToId,
        dueDate: toPrismaDate(dueDate),
        status: candidate.status,
        suggestible: instance.type === 'suggested',
        weight: num(instance.weight, 1),
        estimatedMinutes: num(instance.estimatedMinutes ?? instance.estimated_minutes, 15),
        priority: instance.priority ?? null,
        notes: instance.notes ?? null,
        completedAt: toTimestamp(instance.completedAt ?? instance.completed_at, timeZone),
        completedById: completedById && userIds.includes(completedById) ? completedById : null,
        subtasks: {
          create: (instance.subtasks ?? [])
            .filter((s) => s?.name)
            .map((sub, position) => ({
              name: sub.name,
              assigneeUserId: userIds.includes(sub.assignedTo ?? '')
                ? (sub.assignedTo as string)
                : assignedToId,
              status: sub.status === 'completed' ? 'COMPLETED' : 'PENDING',
              completedAt: toTimestamp(sub.completedAt, timeZone),
              position,
            })),
        },
      },
    });

    written++;
  }

  let logs = 0;
  for (const entry of dump.activityLog ?? []) {
    const userId = entry.userId ?? entry.user_id;
    if (!userId || !userIds.includes(userId)) continue;

    const createdAt = toTimestamp(entry.timestamp, timeZone);

    await prisma.activityLog.create({
      data: {
        userId,
        action: entry.action ?? 'update',
        taskName: entry.taskName ?? entry.task_name ?? 'Tarea',
        details: entry.details ?? '',
        ...(createdAt ? { createdAt } : {}),
      },
    });
    logs++;
  }

  console.log('\n--- Migración completada ---');
  console.log(`  Personas:    ${users.length}`);
  console.log(`  Plantillas:  ${templates.length}`);
  console.log(`  Tareas:      ${written}`);
  console.log(`  Actividad:   ${logs}`);
  console.log('\nRevisa la app y comprueba que el histórico cuadra.\n');
}

main()
  .catch((error) => {
    console.error('\nError en la migración:', error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
