'use client';

import { useState, useTransition } from 'react';
import { exportBackup, updateHouse, updateUsers } from '@/actions/settings';
import type { HouseView } from '@/lib/queries';
import { useToast } from './ToastProvider';

export function SettingsForms({
  house,
  counts,
}: {
  house: HouseView;
  counts: { templates: number; occurrences: number; completed: number };
}) {
  const { toast, toastError } = useToast();
  const [pending, startTransition] = useTransition();

  const [users, setUsers] = useState(house.users);
  const [settings, setSettings] = useState(house.settings);

  function saveUsers(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await updateUsers({ users });
      if (result.ok) toast(result.message ?? 'Guardado', '👥');
      else toastError(result.error);
    });
  }

  function saveHouse(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await updateHouse(settings);
      if (result.ok) {
        document.documentElement.setAttribute('data-theme', settings.theme);
        toast(result.message ?? 'Guardado', '🏠');
      } else {
        toastError(result.error);
      }
    });
  }

  function download() {
    startTransition(async () => {
      const json = await exportBackup();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `hogar_backup_${house.today}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast('Copia de seguridad descargada', '💾');
    });
  }

  return (
    <>
      <div className="section-title-wrap">
        <h3 className="section-title">
          <span>⚙️ Ajustes</span>
        </h3>
      </div>

      <div className="card">
        <h3 style={{ fontSize: '1.1rem', fontWeight: 750, marginBottom: 16 }}>
          👥 Personas que comparten casa
        </h3>

        <form onSubmit={saveUsers}>
          <div className="form-row">
            {users.map((user, index) => (
              <div key={user.id} className="form-group">
                <label className="form-label" htmlFor={`u-name-${user.id}`}>
                  Persona {index + 1}
                </label>
                <input
                  id={`u-name-${user.id}`}
                  className="form-input"
                  style={{ marginBottom: 10 }}
                  value={user.name}
                  required
                  onChange={(e) =>
                    setUsers(users.map((u, i) => (i === index ? { ...u, name: e.target.value } : u)))
                  }
                />
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    type="color"
                    aria-label={`Color de ${user.name}`}
                    value={user.color}
                    style={{ width: 40, height: 32, border: 'none', borderRadius: 4, cursor: 'pointer' }}
                    onChange={(e) =>
                      setUsers(
                        users.map((u, i) => (i === index ? { ...u, color: e.target.value } : u)),
                      )
                    }
                  />
                  <input
                    className="form-input"
                    aria-label={`Emoji de ${user.name}`}
                    value={user.avatar}
                    style={{ width: 60, textAlign: 'center' }}
                    onChange={(e) =>
                      setUsers(
                        users.map((u, i) => (i === index ? { ...u, avatar: e.target.value } : u)),
                      )
                    }
                  />
                </div>
              </div>
            ))}
          </div>

          <button type="submit" className="btn-primary" style={{ fontSize: '0.9rem' }} disabled={pending}>
            Guardar personas
          </button>
        </form>
      </div>

      <div className="card">
        <h3 style={{ fontSize: '1.1rem', fontWeight: 750, marginBottom: 16 }}>
          🏠 Casa y preferencias
        </h3>

        <form onSubmit={saveHouse}>
          <div className="form-group">
            <label className="form-label" htmlFor="s-house">
              Nombre del hogar
            </label>
            <input
              id="s-house"
              className="form-input"
              value={settings.houseName}
              required
              onChange={(e) => setSettings({ ...settings, houseName: e.target.value })}
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label" htmlFor="s-theme">
                Tema visual
              </label>
              <select
                id="s-theme"
                className="form-select"
                value={settings.theme}
                onChange={(e) => setSettings({ ...settings, theme: e.target.value })}
              >
                <option value="light">☀️ Claro</option>
                <option value="dark">🌙 Oscuro</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="s-startday">
                Primer día de la semana
              </label>
              <select
                id="s-startday"
                className="form-select"
                value={settings.startDay}
                onChange={(e) =>
                  setSettings({ ...settings, startDay: e.target.value as 'monday' | 'sunday' })
                }
              >
                <option value="monday">Lunes</option>
                <option value="sunday">Domingo</option>
              </select>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="s-tz">
              Zona horaria
            </label>
            <input
              id="s-tz"
              className="form-input"
              value={settings.timezone}
              onChange={(e) => setSettings({ ...settings, timezone: e.target.value })}
            />
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 6 }}>
              Determina qué día es &ldquo;hoy&rdquo; para la app. Ej. <code>Europe/Madrid</code>.
            </p>
          </div>

          <button type="submit" className="btn-primary" style={{ fontSize: '0.9rem' }} disabled={pending}>
            Guardar ajustes
          </button>
        </form>
      </div>

      <div className="card">
        <h3 style={{ fontSize: '1.1rem', fontWeight: 750, marginBottom: 8 }}>💾 Datos</h3>
        <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', marginBottom: 14 }}>
          {counts.templates} tareas recurrentes activas · {counts.occurrences} tareas registradas ·{' '}
          {counts.completed} completadas. Todo vive en la base de datos, así que los dos móviles ven
          exactamente lo mismo.
        </p>
        <button type="button" className="btn-secondary" onClick={download} disabled={pending}>
          ⬇️ Descargar copia de seguridad
        </button>
      </div>
    </>
  );
}
