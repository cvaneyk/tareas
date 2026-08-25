/**
 * Model definitions, constants, and data structure helpers
 */

const CATEGORIES = {
  limpieza: { id: 'limpieza', label: 'Limpieza', icon: '🧹', color: '#3b82f6' },
  cocina: { id: 'cocina', label: 'Cocina', icon: '🍽️', color: '#f97316' },
  lavadora: { id: 'lavadora', label: 'Lavadora', icon: '🧺', color: '#06b6d4' },
  perro: { id: 'perro', label: 'Perro/Mascota', icon: '🐶', color: '#8b5cf6' },
  chapuzas: { id: 'chapuzas', label: 'Chapuzas', icon: '🔧', color: '#eab308' },
  compras: { id: 'compras', label: 'Compras', icon: '🛒', color: '#ec4899' },
  hogar: { id: 'hogar', label: 'Hogar General', icon: '🪴', color: '#10b981' }
};

const TASK_TYPES = {
  recurrent: { id: 'recurrent', label: 'Recurrente', icon: '🔄' },
  single: { id: 'single', label: 'Única', icon: '📌' },
  chapuza: { id: 'chapuza', label: 'Chapuza', icon: '🔧' },
  big_clean: { id: 'big_clean', label: 'Limpieza Grande', icon: '🧽' },
  suggested: { id: 'suggested', label: 'Sugerida', icon: '🧺' }
};

const FREQUENCIES = {
  daily: { id: 'daily', label: 'Diaria' },
  every_2_days: { id: 'every_2_days', label: 'Cada 2 días' },
  every_x_days: { id: 'every_x_days', label: 'Cada X días' },
  weekly: { id: 'weekly', label: 'Semanal' },
  custom_days: { id: 'custom_days', label: 'Días específicos' },
  suggested: { id: 'suggested', label: 'Sugerida si es necesario' }
};

const ASSIGNEE_MODES = {
  user1: { id: 'user-1', label: 'Persona 1' },
  user2: { id: 'user-2', label: 'Persona 2' },
  alternate_weekly: { id: 'alternate_weekly', label: 'Alternar (por semana)' },
  alternate_turn: { id: 'alternate_turn', label: 'Alternar (por turno)' }
};

const WEIGHT_LABELS = {
  1: { value: 1, label: 'Ligera (1 pt)' },
  2: { value: 2, label: 'Media (2 pts)' },
  3: { value: 3, label: 'Pesada (3 pts)' },
  4: { value: 4, label: 'Muy pesada (4 pts)' }
};

function generateId(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 7)}`;
}

function getWeekId(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

function formatDateISO(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Export to global window object
window.HogarModels = {
  CATEGORIES,
  TASK_TYPES,
  FREQUENCIES,
  ASSIGNEE_MODES,
  WEIGHT_LABELS,
  generateId,
  getWeekId,
  formatDateISO
};
