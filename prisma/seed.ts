/**
 * Datos iniciales. Crea SOLO lo real: las dos personas, los ajustes y las 9
 * tareas recurrentes.
 *
 * No siembra histórico. La app antigua generaba 3 semanas de tareas pasadas
 * con Math.random() (engine.js seedDemoData), y ese histórico falso se mezclaba
 * con el real y falseaba las estadísticas.
 *
 * Es idempotente: se puede ejecutar las veces que haga falta.
 */

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import { todayStr, toPrismaDate, weekStart } from '../lib/dates';
import type { Rule, Assignment } from '../lib/recurrence';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

interface SeedTemplate {
  id: string;
  name: string;
  type: 'RECURRENT' | 'CHAPUZA' | 'BIG_CLEAN';
  category: string;
  rule: Rule;
  assignment: Assignment;
  weight: number;
  estimatedMinutes: number;
  notes: string;
  suggestible?: boolean;
  priority?: string;
  subtasks?: Array<{ id: string; name: string; assigneeUserId: string | null }>;
}

const TEMPLATES: SeedTemplate[] = [
  {
    id: 'tmpl_perro',
    name: 'Sacar al perro',
    type: 'RECURRENT',
    category: 'perro',
    rule: { kind: 'DAILY' },
    assignment: { mode: 'FIXED', userId: 'user-1' },
    weight: 3,
    estimatedMinutes: 30,
    notes: 'Paseo de mañana y tarde',
  },
  {
    id: 'tmpl_arenero',
    name: 'Limpiar arenero',
    type: 'RECURRENT',
    category: 'hogar',
    rule: { kind: 'DAILY' },
    assignment: { mode: 'FIXED', userId: 'user-1' },
    weight: 1,
    estimatedMinutes: 10,
    notes: 'Revisar y reponer arena si es necesario',
  },
  {
    id: 'tmpl_platos',
    name: 'Fregar platos',
    type: 'RECURRENT',
    category: 'cocina',
    rule: { kind: 'DAILY' },
    assignment: { mode: 'FIXED', userId: 'user-2' },
    weight: 1,
    estimatedMinutes: 15,
    notes: 'Dejar encimera y fregadero limpios',
  },
  {
    id: 'tmpl_cena',
    name: 'Hacer cena',
    type: 'RECURRENT',
    category: 'cocina',
    rule: { kind: 'DAILY' },
    assignment: { mode: 'ALTERNATE_TURN' },
    weight: 2,
    estimatedMinutes: 35,
    notes: 'Cocinar y recoger cazuelas',
  },
  {
    id: 'tmpl_ropa',
    name: 'Recoger ropa tendida',
    type: 'RECURRENT',
    category: 'lavadora',
    rule: { kind: 'DAILY' },
    assignment: { mode: 'FIXED', userId: 'user-1' },
    weight: 1,
    estimatedMinutes: 10,
    notes: 'Doblar y guardar en armario',
  },
  {
    id: 'tmpl_aspirar',
    name: 'Aspirar la casa',
    type: 'RECURRENT',
    category: 'limpieza',
    rule: { kind: 'EVERY_N_DAYS', n: 2 },
    assignment: { mode: 'FIXED', userId: 'user-2' },
    weight: 2,
    estimatedMinutes: 20,
    notes: 'Pasar por salón, pasillos y dormitorios',
  },
  {
    id: 'tmpl_lavadora_sug',
    name: 'Poner lavadora (si hace falta)',
    type: 'RECURRENT',
    category: 'lavadora',
    rule: { kind: 'EVERY_N_DAYS', n: 2 },
    assignment: { mode: 'FIXED', userId: 'user-1' },
    weight: 2,
    estimatedMinutes: 15,
    notes: '¿Hay suficiente ropa acumulada?',
    suggestible: true,
  },
  {
    id: 'tmpl_limpieza_grande',
    name: 'Limpieza grande',
    type: 'BIG_CLEAN',
    category: 'limpieza',
    rule: { kind: 'WEEKLY', daysOfWeek: [7] }, // domingo
    assignment: { mode: 'FIXED', userId: 'user-1' },
    weight: 4,
    estimatedMinutes: 120,
    notes: 'Limpieza a fondo del fin de semana',
    subtasks: [
      { id: 'sub_sabanas', name: 'Cambiar sábanas', assigneeUserId: 'user-1' },
      { id: 'sub_terraza', name: 'Limpiar terraza', assigneeUserId: 'user-1' },
      { id: 'sub_lav_grande', name: 'Poner lavadora sábanas', assigneeUserId: 'user-1' },
      { id: 'sub_asp_fondo', name: 'Aspirar a fondo', assigneeUserId: 'user-2' },
      { id: 'sub_fregar', name: 'Fregar suelos', assigneeUserId: 'user-2' },
      { id: 'sub_polvo', name: 'Limpiar polvo muebles', assigneeUserId: 'user-2' },
      { id: 'sub_bano', name: 'Limpiar baño completo', assigneeUserId: 'user-2' },
    ],
  },
  {
    id: 'tmpl_chapuza',
    name: 'Chapuza del fin de semana',
    type: 'CHAPUZA',
    category: 'chapuzas',
    rule: { kind: 'WEEKLY', daysOfWeek: [6] }, // sábado
    assignment: { mode: 'FIXED', userId: 'user-2' },
    weight: 3,
    estimatedMinutes: 45,
    notes: 'Arreglar puerta del armario - Revisar bisagra',
    priority: 'medium',
  },
];

async function main() {
  const start = toPrismaDate(weekStart(todayStr()));

  await prisma.user.upsert({
    where: { id: 'user-1' },
    update: {},
    create: { id: 'user-1', name: 'Persona 1', color: '#3b82f6', avatar: '🧑‍💻', position: 0 },
  });

  await prisma.user.upsert({
    where: { id: 'user-2' },
    update: {},
    create: { id: 'user-2', name: 'Persona 2', color: '#10b981', avatar: '🎨', position: 1 },
  });

  await prisma.houseSettings.upsert({
    where: { id: 'default' },
    update: {},
    create: { id: 'default' },
  });

  // Las plantillas por defecto solo se crean si no hay ninguna. Sin esto, el
  // seed que corre en cada arranque del contenedor añadiría estas 9 encima de
  // las que ya hubieras importado desde la app antigua.
  const existingTemplates = await prisma.taskTemplate.count();
  if (existingTemplates > 0) {
    console.log(
      `Seed: ya hay ${existingTemplates} tareas recurrentes; no se añaden las de ejemplo.`,
    );
    return;
  }

  for (const t of TEMPLATES) {
    const { subtasks, ...template } = t;

    await prisma.taskTemplate.upsert({
      where: { id: t.id },
      update: {},
      create: {
        ...template,
        rule: template.rule,
        assignment: template.assignment,
        startDate: start,
        active: true,
      },
    });

    for (const [index, sub] of (subtasks ?? []).entries()) {
      await prisma.templateSubtask.upsert({
        where: { id: sub.id },
        update: {},
        create: {
          id: sub.id,
          templateId: t.id,
          name: sub.name,
          assigneeUserId: sub.assigneeUserId,
          position: index,
        },
      });
    }
  }

  const counts = {
    personas: await prisma.user.count(),
    plantillas: await prisma.taskTemplate.count(),
    subtareas: await prisma.templateSubtask.count(),
  };

  console.log('Seed completado:', counts);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
