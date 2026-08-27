'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import type { HouseView } from '@/lib/queries';
import { AutoRefresh } from './AutoRefresh';
import { AddTaskModal } from './AddTaskModal';
import { DialogProvider, useDialogs } from './DialogProvider';
import { TaskActionsModal } from './TaskActionsModal';
import { ThemeToggle } from './ThemeToggle';
import { ToastProvider } from './ToastProvider';

const NAV = [
  { href: '/', icon: '🏠', label: 'Inicio' },
  { href: '/semana', icon: '📅', label: 'Semana' },
  { href: '/recurrentes', icon: '🔄', label: 'Recurrentes' },
  { href: '/historico', icon: '🗂️', label: 'Histórico' },
  { href: '/estadisticas', icon: '📊', label: 'Estadísticas' },
  { href: '/ajustes', icon: '⚙️', label: 'Ajustes' },
];

const BOTTOM_NAV = [
  { href: '/', icon: '🏠', label: 'Inicio' },
  { href: '/semana', icon: '📅', label: 'Semana' },
  { href: '/estadisticas', icon: '📊', label: 'Stats' },
  { href: '/ajustes', icon: '⚙️', label: 'Ajustes' },
];

export function AppShell({ house, children }: { house: HouseView; children: ReactNode }) {
  return (
    <ToastProvider>
      <DialogProvider users={house.users} today={house.today}>
        <Chrome house={house}>{children}</Chrome>
        <AddTaskModal />
        <TaskActionsModal />
        <AutoRefresh />
      </DialogProvider>
    </ToastProvider>
  );
}

function Chrome({ house, children }: { house: HouseView; children: ReactNode }) {
  const pathname = usePathname();
  const { openAddTask } = useDialogs();

  const isActive = (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href));

  return (
    <div className="app-container">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-icon">🏠</span>
          <div className="brand-info">
            <h1>{house.settings.houseName}</h1>
            <p>Tareas compartidas</p>
          </div>
        </div>

        <nav className="nav-links">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`nav-item ${isActive(item.href) ? 'active' : ''}`}
            >
              <span className="icon">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>

        <div className="sidebar-footer">
          <button
            type="button"
            className="btn-primary"
            style={{ width: '100%' }}
            onClick={() => openAddTask()}
          >
            ＋ Nueva Tarea
          </button>
        </div>
      </aside>

      <div className="main-wrapper">
        <header className="app-header">
          <div className="header-user-status">
            <span style={{ fontWeight: 750, fontSize: '1.1rem', color: 'var(--text-main)' }}>
              🏠 {house.settings.houseName}
            </span>
          </div>
          <div className="header-actions">
            <ThemeToggle current={house.settings.theme} />
            <button
              type="button"
              className="btn-primary"
              style={{ padding: '8px 16px', fontSize: '0.9rem' }}
              onClick={() => openAddTask()}
            >
              ＋ Añadir
            </button>
          </div>
        </header>

        <main className="main-content">
          <section className="content-view active">{children}</section>
        </main>
      </div>

      <nav className="bottom-nav">
        {BOTTOM_NAV.slice(0, 2).map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`bottom-nav-btn ${isActive(item.href) ? 'active' : ''}`}
          >
            <span className="nav-icon">{item.icon}</span>
            <span>{item.label}</span>
          </Link>
        ))}

        <button
          type="button"
          className="bottom-nav-btn add-btn"
          onClick={() => openAddTask()}
          aria-label="Añadir tarea"
        >
          <span className="nav-icon">＋</span>
          <span>Añadir</span>
        </button>

        {BOTTOM_NAV.slice(2).map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`bottom-nav-btn ${isActive(item.href) ? 'active' : ''}`}
          >
            <span className="nav-icon">{item.icon}</span>
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
