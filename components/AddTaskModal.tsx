'use client';

import { useState, useTransition } from 'react';
import { createTask } from '@/actions/tasks';
import { updateTemplate } from '@/actions/templates';
import { CATEGORIES, DURATIONS, TASK_TYPES, WEEKDAYS, WEIGHTS } from '@/lib/catalog';
import type { Rule } from '@/lib/recurrence';
import { isoDayOfWeek } from '@/lib/dates';
import type { TemplateView, UserView } from '@/lib/queries';
import { Modal } from './Modal';
import { type AddTaskPreset, useDialogs } from './DialogProvider';
import { useToast } from './ToastProvider';

type RuleKind = Rule['kind'];

interface FormState {
  name: string;
  type: 'RECURRENT' | 'SINGLE' | 'CHAPUZA' | 'BIG_CLEAN';
  category: string;
  assignee: string;
  dueDate: string;
  weight: number;
  estimatedMinutes: number;
  notes: string;
  isRecurring: boolean;
  suggestible: boolean;
  ruleKind: RuleKind;
  everyN: number;
  daysOfWeek: number[];
  monthDay: number;
  endDate: string;
  subtasks: Array<{ name: string; assigneeUserId: string }>;
}

function initialState(
  today: string,
  preset: { dueDate?: string; isRecurring?: boolean },
  defaultAssignee: string,
  template?: TemplateView,
): FormState {
  if (template) {
    const rule = template.rule;
    return {
      name: template.name,
      type: template.type,
      category: template.category,
      assignee:
        template.assignment.mode === 'FIXED' ? template.assignment.userId : template.assignment.mode,
      dueDate: template.startDate,
      weight: template.weight,
      estimatedMinutes: template.estimatedMinutes,
      notes: template.notes ?? '',
      isRecurring: true,
      suggestible: template.suggestible,
      ruleKind: rule.kind,
      everyN: rule.kind === 'EVERY_N_DAYS' ? rule.n : 2,
      daysOfWeek: rule.kind === 'WEEKLY' ? rule.daysOfWeek : [isoDayOfWeek(template.startDate)],
      monthDay: rule.kind === 'MONTHLY_DAY' ? rule.day : 1,
      endDate: template.endDate ?? '',
      subtasks: template.subtasks.map((s) => ({
        name: s.name,
        assigneeUserId: s.assigneeUserId ?? '',
      })),
    };
  }

  const dueDate = preset.dueDate ?? today;
  return {
    name: '',
    type: preset.isRecurring ? 'RECURRENT' : 'SINGLE',
    category: 'hogar',
    assignee: defaultAssignee,
    dueDate,
    weight: 2,
    estimatedMinutes: 15,
    notes: '',
    isRecurring: preset.isRecurring ?? false,
    suggestible: false,
    ruleKind: 'DAILY',
    everyN: 2,
    daysOfWeek: [isoDayOfWeek(dueDate)],
    monthDay: Number(dueDate.slice(8, 10)),
    endDate: '',
    subtasks: [],
  };
}

function buildRule(form: FormState): Rule {
  switch (form.ruleKind) {
    case 'DAILY':
      return { kind: 'DAILY' };
    case 'EVERY_N_DAYS':
      return { kind: 'EVERY_N_DAYS', n: form.everyN };
    case 'WEEKLY':
      return {
        kind: 'WEEKLY',
        daysOfWeek: form.daysOfWeek.length > 0 ? form.daysOfWeek : [isoDayOfWeek(form.dueDate)],
      };
    case 'MONTHLY_DAY':
      return { kind: 'MONTHLY_DAY', day: form.monthDay };
  }
}

/**
 * Envoltorio sin estado. Devuelve null antes de declarar ningún hook, de forma
 * que el formulario se desmonta al cerrar el modal y vuelve a inicializarse
 * limpio en la siguiente apertura. Si el estado viviera aquí, abrir "editar"
 * después de "nueva tarea" mostraría el formulario anterior.
 */
export function AddTaskModal() {
  const { addTask } = useDialogs();
  if (!addTask) return null;
  return <AddTaskForm preset={addTask} />;
}

function AddTaskForm({ preset }: { preset: AddTaskPreset }) {
  const { users, today, closeAll } = useDialogs();
  const { toast, toastError } = useToast();
  const [pending, startTransition] = useTransition();

  const template = preset.template;
  const [form, setForm] = useState<FormState>(() =>
    initialState(today, preset, users[0]?.id ?? 'user-1', template),
  );
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const showsSubtasks = form.type === 'BIG_CLEAN';

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const payload = {
      name: form.name,
      type: form.type,
      category: form.category,
      dueDate: form.dueDate,
      weight: form.weight,
      estimatedMinutes: form.estimatedMinutes,
      notes: form.notes,
      priority: form.type === 'CHAPUZA' ? ('medium' as const) : null,
      assignee: form.assignee,
      isRecurring: form.isRecurring,
      rule: form.isRecurring ? buildRule(form) : undefined,
      suggestible: form.suggestible,
      endDate: form.endDate || null,
      subtasks: showsSubtasks
        ? form.subtasks
            .filter((s) => s.name.trim().length > 0)
            .map((s) => ({ name: s.name, assigneeUserId: s.assigneeUserId || null }))
        : [],
    };

    startTransition(async () => {
      const result = template
        ? await updateTemplate(template.id, payload)
        : await createTask(payload);

      if (result.ok) {
        toast(result.message ?? 'Guardado', '✅');
        closeAll();
      } else {
        setError(result.error);
        toastError(result.error);
      }
    });
  }

  return (
    <Modal
      title={template ? 'Editar tarea recurrente' : 'Nueva tarea'}
      onClose={closeAll}
      wide
    >
      <form onSubmit={submit}>
        <div className="modal-body">
          <div className="form-group">
            <label className="form-label" htmlFor="f-name">
              Nombre de la tarea
            </label>
            <input
              id="f-name"
              className="form-input"
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="Ej. Limpiar el baño, Comprar fruta..."
              required
              autoFocus
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label" htmlFor="f-type">
                Tipo
              </label>
              <select
                id="f-type"
                className="form-select"
                value={form.type}
                onChange={(e) => {
                  const type = e.target.value as FormState['type'];
                  setForm((f) => ({
                    ...f,
                    type,
                    // "Recurrente" y "Limpieza grande" implican repetición.
                    isRecurring: type === 'RECURRENT' || type === 'BIG_CLEAN' ? true : f.isRecurring,
                  }));
                }}
              >
                {TASK_TYPES.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.icon} {t.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="f-category">
                Categoría
              </label>
              <select
                id="f-category"
                className="form-select"
                value={form.category}
                onChange={(e) => set('category', e.target.value)}
              >
                {CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.icon} {c.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label" htmlFor="f-assignee">
                Responsable
              </label>
              <select
                id="f-assignee"
                className="form-select"
                value={form.assignee}
                onChange={(e) => set('assignee', e.target.value)}
              >
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.avatar} {u.name}
                  </option>
                ))}
                <option value="ALTERNATE_WEEKLY">🔄 Alternar cada semana</option>
                <option value="ALTERNATE_TURN">🔄 Alternar por turno</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="f-date">
                {form.isRecurring ? 'Empieza el' : 'Fecha programada'}
              </label>
              <input
                id="f-date"
                type="date"
                className="form-input"
                value={form.dueDate}
                onChange={(e) => set('dueDate', e.target.value)}
                required
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label" htmlFor="f-weight">
                Peso / Esfuerzo
              </label>
              <select
                id="f-weight"
                className="form-select"
                value={form.weight}
                onChange={(e) => set('weight', Number(e.target.value))}
              >
                {WEIGHTS.map((w) => (
                  <option key={w.value} value={w.value}>
                    {w.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="f-duration">
                Duración estimada
              </label>
              <select
                id="f-duration"
                className="form-select"
                value={form.estimatedMinutes}
                onChange={(e) => set('estimatedMinutes', Number(e.target.value))}
              >
                {DURATIONS.map((d) => (
                  <option key={d} value={d}>
                    {d >= 60 ? `${d / 60} h` : `${d} min`}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {!template ? (
            <div className="form-group" style={{ marginTop: 10 }}>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: '0.9rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  style={{ width: 18, height: 18 }}
                  checked={form.isRecurring}
                  onChange={(e) => set('isRecurring', e.target.checked)}
                />
                <span>Repetir automáticamente</span>
              </label>
            </div>
          ) : null}

          {form.isRecurring ? (
            <div
              className="form-group"
              style={{
                background: 'var(--bg-surface-subtle)',
                padding: 12,
                borderRadius: 'var(--radius-md)',
              }}
            >
              <label className="form-label" htmlFor="f-rule">
                Cada cuánto se repite
              </label>
              <select
                id="f-rule"
                className="form-select"
                value={form.ruleKind}
                onChange={(e) => set('ruleKind', e.target.value as RuleKind)}
              >
                <option value="DAILY">Todos los días</option>
                <option value="EVERY_N_DAYS">Cada X días</option>
                <option value="WEEKLY">Días concretos de la semana</option>
                <option value="MONTHLY_DAY">Una vez al mes</option>
              </select>

              {form.ruleKind === 'EVERY_N_DAYS' ? (
                <div style={{ marginTop: 10 }}>
                  <label className="form-label" htmlFor="f-everyn">
                    Intervalo (días)
                  </label>
                  <input
                    id="f-everyn"
                    type="number"
                    min={1}
                    max={365}
                    className="form-input"
                    value={form.everyN}
                    onChange={(e) => set('everyN', Number(e.target.value))}
                  />
                </div>
              ) : null}

              {form.ruleKind === 'WEEKLY' ? (
                <div style={{ marginTop: 10 }}>
                  <span className="form-label">Días</span>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {WEEKDAYS.map((d) => {
                      const active = form.daysOfWeek.includes(d.iso);
                      return (
                        <button
                          key={d.iso}
                          type="button"
                          className={`filter-chip ${active ? 'active' : ''}`}
                          aria-pressed={active}
                          title={d.label}
                          onClick={() =>
                            set(
                              'daysOfWeek',
                              active
                                ? form.daysOfWeek.filter((x) => x !== d.iso)
                                : [...form.daysOfWeek, d.iso].sort((a, b) => a - b),
                            )
                          }
                        >
                          {d.short}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              {form.ruleKind === 'MONTHLY_DAY' ? (
                <div style={{ marginTop: 10 }}>
                  <label className="form-label" htmlFor="f-monthday">
                    Día del mes
                  </label>
                  <input
                    id="f-monthday"
                    type="number"
                    min={1}
                    max={31}
                    className="form-input"
                    value={form.monthDay}
                    onChange={(e) => set('monthDay', Number(e.target.value))}
                  />
                  <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 6 }}>
                    En los meses más cortos se hará el último día.
                  </p>
                </div>
              ) : null}

              <div style={{ marginTop: 12 }}>
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    fontSize: '0.88rem',
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    style={{ width: 16, height: 16 }}
                    checked={form.suggestible}
                    onChange={(e) => set('suggestible', e.target.checked)}
                  />
                  <span>Es una sugerencia: se puede omitir sin penalización</span>
                </label>
              </div>

              <div style={{ marginTop: 12 }}>
                <label className="form-label" htmlFor="f-enddate">
                  Dejar de repetir el (opcional)
                </label>
                <input
                  id="f-enddate"
                  type="date"
                  className="form-input"
                  value={form.endDate}
                  onChange={(e) => set('endDate', e.target.value)}
                />
              </div>
            </div>
          ) : null}

          {showsSubtasks ? (
            <div className="form-group">
              <span className="form-label">Subtareas</span>
              {form.subtasks.map((sub, index) => (
                <div key={index} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                  <input
                    className="form-input"
                    value={sub.name}
                    placeholder="Ej. Fregar suelos"
                    onChange={(e) =>
                      set(
                        'subtasks',
                        form.subtasks.map((s, i) =>
                          i === index ? { ...s, name: e.target.value } : s,
                        ),
                      )
                    }
                  />
                  <select
                    className="form-select"
                    style={{ maxWidth: 150 }}
                    value={sub.assigneeUserId}
                    onChange={(e) =>
                      set(
                        'subtasks',
                        form.subtasks.map((s, i) =>
                          i === index ? { ...s, assigneeUserId: e.target.value } : s,
                        ),
                      )
                    }
                  >
                    <option value="">Quien la tenga</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.avatar} {u.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label="Quitar subtarea"
                    onClick={() =>
                      set(
                        'subtasks',
                        form.subtasks.filter((_, i) => i !== index),
                      )
                    }
                  >
                    ✕
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="btn-secondary"
                style={{ fontSize: '0.85rem' }}
                onClick={() =>
                  set('subtasks', [...form.subtasks, { name: '', assigneeUserId: '' }])
                }
              >
                ＋ Añadir subtarea
              </button>
            </div>
          ) : null}

          <div className="form-group">
            <label className="form-label" htmlFor="f-notes">
              Notas o detalles (opcional)
            </label>
            <textarea
              id="f-notes"
              className="form-textarea"
              rows={2}
              value={form.notes}
              onChange={(e) => set('notes', e.target.value)}
              placeholder="Instrucciones, recordatorios, marcas..."
            />
          </div>

          {error ? (
            <p style={{ color: 'var(--danger)', fontSize: '0.88rem', fontWeight: 600 }}>{error}</p>
          ) : null}
        </div>

        <div className="modal-footer">
          <button type="button" className="btn-secondary" onClick={closeAll}>
            Cancelar
          </button>
          <button type="submit" className="btn-primary" disabled={pending}>
            {pending ? 'Guardando…' : template ? 'Guardar cambios' : 'Crear tarea'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
