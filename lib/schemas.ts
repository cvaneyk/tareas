/**
 * Validación de todo lo que entra por formulario.
 *
 * En la app antigua los datos entraban sin validar y los errores se tragaban
 * con `catch {}` vacíos, así que un fallo se manifestaba como "no se guardó"
 * sin más. Aquí lo que no valida devuelve un mensaje concreto.
 */

import { z } from 'zod';
import { CATEGORY_IDS } from './catalog';
import { AssignmentSchema, RuleSchema } from './recurrence';

const dateStr = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida')
  .refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)), 'Fecha inexistente');

const category = z.enum(CATEGORY_IDS as [string, ...string[]]).catch('hogar');

export const TaskTypeSchema = z.enum(['RECURRENT', 'SINGLE', 'CHAPUZA', 'BIG_CLEAN']);

/** Formulario de "Nueva tarea" / "Editar tarea recurrente". */
export const TaskFormSchema = z
  .object({
    name: z.string().trim().min(1, 'Ponle un nombre a la tarea').max(255),
    type: TaskTypeSchema,
    category,
    dueDate: dateStr,
    weight: z.coerce.number().int().min(1).max(4),
    estimatedMinutes: z.coerce.number().int().min(1).max(600),
    notes: z.string().trim().max(2000).default(''),
    priority: z.enum(['low', 'medium', 'high']).nullish(),

    // Responsable: id de persona, o modo de alternancia.
    assignee: z.string().min(1),

    // Recurrencia
    isRecurring: z.coerce.boolean().default(false),
    rule: RuleSchema.optional(),
    suggestible: z.coerce.boolean().default(false),
    endDate: dateStr.nullish(),

    subtasks: z
      .array(
        z.object({
          name: z.string().trim().min(1).max(255),
          assigneeUserId: z.string().nullish(),
        }),
      )
      .max(30)
      .default([]),
  })
  .refine((v) => !v.isRecurring || v.rule !== undefined, {
    message: 'Falta la frecuencia de repetición',
    path: ['rule'],
  })
  .refine((v) => !v.endDate || v.endDate >= v.dueDate, {
    message: 'La fecha de fin no puede ser anterior a la de inicio',
    path: ['endDate'],
  });

export type TaskFormInput = z.input<typeof TaskFormSchema>;
export type TaskForm = z.output<typeof TaskFormSchema>;

/**
 * Traduce el valor del selector de responsable al objeto Assignment.
 * 'ALTERNATE_WEEKLY' / 'ALTERNATE_TURN' son modos; cualquier otra cosa es un id.
 */
export function assigneeToAssignment(value: string) {
  if (value === 'ALTERNATE_WEEKLY' || value === 'ALTERNATE_TURN') {
    return AssignmentSchema.parse({ mode: value });
  }
  return AssignmentSchema.parse({ mode: 'FIXED', userId: value });
}

export const UsersFormSchema = z.object({
  users: z
    .array(
      z.object({
        id: z.string().min(1),
        name: z.string().trim().min(1, 'El nombre no puede estar vacío').max(100),
        color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Color inválido'),
        avatar: z.string().trim().min(1).max(8),
      }),
    )
    .length(2),
});

export const HouseFormSchema = z.object({
  houseName: z.string().trim().min(1).max(150),
  theme: z.enum(['light', 'dark']),
  startDay: z.enum(['monday', 'sunday']),
  timezone: z.string().trim().min(1).max(64),
});

export const ImportSchema = z.object({
  users: z.array(z.unknown()).optional(),
  settings: z.unknown().optional(),
  templates: z.array(z.unknown()).optional(),
  instances: z.array(z.unknown()).optional(),
});

/** Resultado uniforme de las Server Actions, para mostrar errores en la UI. */
export type ActionResult =
  | { ok: true; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

export function zodFailure(error: z.ZodError): ActionResult {
  const flat = z.flattenError(error);
  const fieldErrors = flat.fieldErrors as Record<string, string[] | undefined>;

  // El primer mensaje concreto que haya; si no, el error de formulario.
  const first =
    Object.values(fieldErrors)
      .flat()
      .find((message): message is string => typeof message === 'string') ??
    flat.formErrors[0] ??
    'Datos inválidos';

  return {
    ok: false,
    error: first,
    fieldErrors: fieldErrors as Record<string, string[]>,
  };
}
