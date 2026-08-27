import { AddTaskButton } from '@/components/AddTaskButton';
import { TemplateActions, RegenerateWeekButton } from '@/components/TemplateActions';
import { getCategory } from '@/lib/catalog';
import { describeAssignment, describeRule } from '@/lib/recurrence';
import { getHouse, getTemplates } from '@/lib/queries';

export default async function TemplatesPage() {
  const [house, templates] = await Promise.all([getHouse(), getTemplates(true)]);

  const nameOf = (id: string) => house.users.find((u) => u.id === id)?.name ?? 'Persona';
  const active = templates.filter((t) => t.active);
  const paused = templates.filter((t) => !t.active);

  return (
    <>
      <div className="section-title-wrap">
        <h3 className="section-title">
          <span>🔄 Tareas recurrentes</span>
          <span className="badge">{active.length} activas</span>
        </h3>
        <AddTaskButton
          isRecurring
          className="btn-primary"
          style={{ padding: '6px 14px', fontSize: '0.85rem' }}
        >
          ＋ Nueva recurrente
        </AddTaskButton>
      </div>

      <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', marginBottom: 16 }}>
        Estas plantillas generan las tareas de cada día automáticamente. Editarlas cambia solo las
        tareas futuras que sigan pendientes; lo que ya está hecho no se toca.
      </p>

      {active.map((template) => {
        const category = getCategory(template.category);
        return (
          <div key={template.id} className="card" style={{ marginBottom: 12 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                gap: 12,
              }}
            >
              <div style={{ display: 'flex', gap: 10 }}>
                <span style={{ fontSize: '1.5rem' }}>{category.icon}</span>
                <div>
                  <h3 style={{ fontSize: '1.05rem', fontWeight: 750 }}>{template.name}</h3>
                  <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: 4 }}>
                    {describeRule(template.rule)} ·{' '}
                    {describeAssignment(template.assignment, nameOf)}
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                    <span className="meta-pill">{category.label}</span>
                    <span className="meta-pill weight">⚡ {template.weight} pt</span>
                    <span className="meta-pill">⏱️ {template.estimatedMinutes}m</span>
                    {template.suggestible ? (
                      <span className="meta-pill">💡 Sugerida (se puede omitir)</span>
                    ) : null}
                    {template.subtasks.length > 0 ? (
                      <span className="meta-pill">🧽 {template.subtasks.length} subtareas</span>
                    ) : null}
                    {template.endDate ? (
                      <span className="meta-pill">Hasta {template.endDate}</span>
                    ) : null}
                  </div>
                  {template.notes ? <div className="task-note">{template.notes}</div> : null}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                <AddTaskButton template={template} className="icon-btn" title="Editar">
                  ✏️
                </AddTaskButton>
                <TemplateActions template={template} />
              </div>
            </div>
          </div>
        );
      })}

      {active.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
          Todavía no hay tareas recurrentes. Crea la primera con el botón de arriba.
        </div>
      ) : null}

      <div style={{ marginTop: 20 }}>
        <RegenerateWeekButton />
      </div>

      {paused.length > 0 ? (
        <>
          <div className="section-title-wrap" style={{ marginTop: 28 }}>
            <h3 className="section-title">
              <span>⏸️ Pausadas</span>
              <span className="badge">{paused.length}</span>
            </h3>
          </div>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 12 }}>
            Ya no generan tareas nuevas, pero su histórico sigue contando en las estadísticas.
          </p>
          {paused.map((template) => (
            <div
              key={template.id}
              className="card"
              style={{
                marginBottom: 8,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                opacity: 0.72,
              }}
            >
              <div>
                <strong style={{ fontSize: '0.95rem' }}>{template.name}</strong>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  {describeRule(template.rule)}
                </div>
              </div>
              <TemplateActions template={template} />
            </div>
          ))}
        </>
      ) : null}
    </>
  );
}
