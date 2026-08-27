/**
 * Catálogo de categorías, pesos y tipos. Portado de js/models.js sin cambios de
 * contenido: son los valores que ya usabais.
 */

export interface CategoryDef {
  id: string;
  label: string;
  icon: string;
  color: string;
}

export const CATEGORIES: CategoryDef[] = [
  { id: 'limpieza', label: 'Limpieza', icon: '🧹', color: '#3b82f6' },
  { id: 'cocina', label: 'Cocina', icon: '🍽️', color: '#f97316' },
  { id: 'lavadora', label: 'Lavadora', icon: '🧺', color: '#06b6d4' },
  { id: 'perro', label: 'Perro/Mascota', icon: '🐶', color: '#8b5cf6' },
  { id: 'chapuzas', label: 'Chapuzas', icon: '🔧', color: '#eab308' },
  { id: 'compras', label: 'Compras', icon: '🛒', color: '#ec4899' },
  { id: 'hogar', label: 'Hogar General', icon: '🪴', color: '#10b981' },
];

const FALLBACK_CATEGORY: CategoryDef = {
  id: 'hogar',
  label: 'Hogar General',
  icon: '🪴',
  color: '#10b981',
};

export function getCategory(id: string | null | undefined): CategoryDef {
  return CATEGORIES.find((c) => c.id === id) ?? FALLBACK_CATEGORY;
}

export const CATEGORY_IDS = CATEGORIES.map((c) => c.id);

export const WEIGHTS = [
  { value: 1, label: '1 pt (Ligera — ej. platos, arenero)' },
  { value: 2, label: '2 pts (Media — ej. aspirar, cena)' },
  { value: 3, label: '3 pts (Pesada — ej. perro, baño)' },
  { value: 4, label: '4 pts (Muy pesada — limpieza a fondo)' },
] as const;

export const DURATIONS = [10, 15, 20, 30, 45, 60, 90, 120] as const;

export const TASK_TYPES = [
  { id: 'SINGLE', label: 'Única', icon: '📌' },
  { id: 'RECURRENT', label: 'Recurrente', icon: '🔄' },
  { id: 'CHAPUZA', label: 'Chapuza', icon: '🔧' },
  { id: 'BIG_CLEAN', label: 'Limpieza grande', icon: '🧽' },
] as const;

export function taskTypeIcon(type: string): string {
  return TASK_TYPES.find((t) => t.id === type)?.icon ?? '📌';
}

export function taskTypeLabel(type: string): string {
  return TASK_TYPES.find((t) => t.id === type)?.label ?? 'Tarea';
}

export const WEEKDAYS = [
  { iso: 1, short: 'L', label: 'Lunes' },
  { iso: 2, short: 'M', label: 'Martes' },
  { iso: 3, short: 'X', label: 'Miércoles' },
  { iso: 4, short: 'J', label: 'Jueves' },
  { iso: 5, short: 'V', label: 'Viernes' },
  { iso: 6, short: 'S', label: 'Sábado' },
  { iso: 7, short: 'D', label: 'Domingo' },
] as const;

export const ACTIVITY_LABELS: Record<string, { icon: string; verb: string }> = {
  complete: { icon: '✅', verb: 'completó' },
  uncomplete: { icon: '↩️', verb: 'desmarcó' },
  create: { icon: '➕', verb: 'creó' },
  delete: { icon: '🗑️', verb: 'eliminó' },
  reassign: { icon: '👥', verb: 'reasignó' },
  reschedule: { icon: '🗓️', verb: 'pospuso' },
  skip: { icon: '⚪', verb: 'omitió' },
  template: { icon: '🔄', verb: 'actualizó la recurrente' },
};
