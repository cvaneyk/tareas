/**
 * Main Application Controller: Navigation, Modals, Event Listeners, Initialization
 */

(function() {
  const { CATEGORIES, TASK_TYPES, FREQUENCIES, ASSIGNEE_MODES, WEIGHT_LABELS, generateId, formatDateISO, getWeekId } = window.HogarModels;
  const storage = window.HogarStorage;
  const engine = window.HogarEngine;
  const ui = window.HogarUI;

  class App {
    constructor() {
      this.currentView = 'inicio';
      this.referenceDate = new Date('2026-08-25T12:00:00');
      this.weekDate = new Date('2026-08-25T12:00:00');
      this.weekFilter = 'all';
      this.activeTaskId = null;
    }

    async init() {
      // 0. Register Service Worker for offline PWA support if on http/https
      if ('serviceWorker' in navigator && window.location.protocol.startsWith('http')) {
        navigator.serviceWorker.register('./sw.js').catch(err => console.log('SW registration note:', err));
      }

      // 1. Initialize storage defaults
      storage.initStorage();

      // 2. Fetch cloud data FIRST if available
      await storage.syncFromCloud();

      // 3. If no instances exist anywhere, seed initial week tasks
      if (storage.getInstances().length === 0) {
        engine.seedDemoData();
        storage.syncBatchToCloud(storage.getInstances());
      } else {
        engine.generateWeekTasks(this.referenceDate);
      }

      // 4. Apply theme and custom user colors
      this.applyThemeAndColors();

      // 5. Setup event listeners
      this.setupNavigation();
      this.setupGlobalEvents();
      this.setupModalEvents();

      // 6. Render initial view
      this.switchView('inicio');

      // 7. Periodic background sync (cada 10s para sincronizar móviles automáticamente)
      setInterval(async () => {
        if (!document.hidden) {
          const res = await storage.syncFromCloud();
          if (res.success) {
            this.refreshCurrentView();
          }
        }
      }, 10000);

      // 8. Auto sync al volver a la app en móvil
      document.addEventListener('visibilitychange', async () => {
        if (!document.hidden) {
          const res = await storage.syncFromCloud();
          if (res.success) {
            this.refreshCurrentView();
          }
        }
      });
    }

    applyThemeAndColors() {
      const settings = storage.getSettings();
      const users = storage.getUsers();

      // Theme
      document.documentElement.setAttribute('data-theme', settings.theme || 'light');

      // User colors
      if (users[0]?.color) {
        document.documentElement.style.setProperty('--user1-color', users[0].color);
        document.documentElement.style.setProperty('--user1-text', users[0].color);
      }
      if (users[1]?.color) {
        document.documentElement.style.setProperty('--user2-color', users[1].color);
        document.documentElement.style.setProperty('--user2-text', users[1].color);
      }

      // Brand house name
      const brandNameEl = document.getElementById('house-brand-title');
      if (brandNameEl) brandNameEl.textContent = settings.houseName || 'Nuestra Casa 🏠';
    }

    setupNavigation() {
      const navItems = document.querySelectorAll('[data-nav-target]');
      navItems.forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          const targetView = btn.dataset.navTarget;
          if (targetView === 'add-task') {
            this.openAddTaskModal();
          } else {
            this.switchView(targetView);
          }
        });
      });

      // Theme toggle button in header
      const themeBtn = document.getElementById('btn-toggle-theme');
      if (themeBtn) {
        themeBtn.addEventListener('click', () => {
          const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
          const newTheme = currentTheme === 'light' ? 'dark' : 'light';
          const settings = storage.getSettings();
          settings.theme = newTheme;
          storage.saveSettings(settings);
          this.applyThemeAndColors();
          ui.showToast(`Modo ${newTheme === 'dark' ? 'oscuro' : 'claro'} activado`, newTheme === 'dark' ? '🌙' : '☀️');
        });
      }
    }

    switchView(viewName) {
      this.currentView = viewName;

      // Update active nav button styles
      document.querySelectorAll('[data-nav-target]').forEach(btn => {
        if (btn.dataset.navTarget === viewName) {
          btn.classList.add('active');
        } else {
          btn.classList.remove('active');
        }
      });

      // Hide all views and show active
      document.querySelectorAll('.content-view').forEach(view => {
        view.classList.remove('active');
      });

      const targetEl = document.getElementById(`view-${viewName}`);
      if (targetEl) {
        targetEl.classList.add('active');
      }

      // Render content for active view
      switch (viewName) {
        case 'inicio':
          ui.renderDashboard(this.referenceDate);
          break;
        case 'semana':
          ui.renderWeekView(this.weekDate, this.weekFilter);
          break;
        case 'tareas':
          ui.renderTemplatesView();
          break;
        case 'historico':
          ui.renderHistoryView();
          break;
        case 'estadisticas':
          ui.renderStatsView();
          break;
        case 'ajustes':
          ui.renderSettingsView();
          break;
      }

      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    setupGlobalEvents() {
      // Delegated click handler for interactive elements
      document.addEventListener('click', (e) => {
        // 1. Checkbox toggle on task
        const toggleCheckbox = e.target.closest('.toggle-task-status');
        if (toggleCheckbox) {
          const taskId = toggleCheckbox.dataset.taskId;
          this.toggleTaskStatus(taskId, toggleCheckbox.checked);
          return;
        }

        // 2. Checkbox toggle on subtask
        const toggleSubCheckbox = e.target.closest('.toggle-subtask-status');
        if (toggleSubCheckbox) {
          const parentId = toggleSubCheckbox.dataset.parentId;
          const subId = toggleSubCheckbox.dataset.subId;
          this.toggleSubtaskStatus(parentId, subId, toggleSubCheckbox.checked);
          return;
        }

        // 3. Open Quick Actions modal
        const quickActionBtn = e.target.closest('.btn-quick-actions');
        if (quickActionBtn) {
          e.stopPropagation();
          const taskId = quickActionBtn.dataset.taskId;
          this.openQuickActionsModal(taskId);
          return;
        }

        // 4. Open Task Detail / Edit
        const detailBtn = e.target.closest('.btn-open-detail');
        if (detailBtn) {
          const taskId = detailBtn.dataset.taskId;
          this.openQuickActionsModal(taskId);
          return;
        }

        // 5. Open Add Task modal button
        if (e.target.closest('.btn-open-add-task')) {
          this.openAddTaskModal();
          return;
        }

        // 6. Suggested Task Accept / Skip
        const acceptSugBtn = e.target.closest('.btn-accept-suggested');
        if (acceptSugBtn) {
          const taskId = acceptSugBtn.dataset.taskId;
          this.handleSuggestedAction(taskId, 'accept');
          return;
        }

        const skipSugBtn = e.target.closest('.btn-skip-suggested');
        if (skipSugBtn) {
          const taskId = skipSugBtn.dataset.taskId;
          this.handleSuggestedAction(taskId, 'skip');
          return;
        }

        // 7. Week View navigation buttons
        if (e.target.closest('.btn-prev-week')) {
          this.weekDate.setDate(this.weekDate.getDate() - 7);
          engine.generateWeekTasks(this.weekDate);
          ui.renderWeekView(this.weekDate, this.weekFilter);
          return;
        }

        if (e.target.closest('.btn-next-week')) {
          this.weekDate.setDate(this.weekDate.getDate() + 7);
          engine.generateWeekTasks(this.weekDate);
          ui.renderWeekView(this.weekDate, this.weekFilter);
          return;
        }

        if (e.target.closest('.btn-current-week')) {
          this.weekDate = new Date(this.referenceDate);
          ui.renderWeekView(this.weekDate, this.weekFilter);
          return;
        }

        // 8. Week Filter chip
        const filterChip = e.target.closest('.filter-chip');
        if (filterChip) {
          this.weekFilter = filterChip.dataset.filter;
          ui.renderWeekView(this.weekDate, this.weekFilter);
          return;
        }

        // 9. Add Task on specific day
        const addDayBtn = e.target.closest('.btn-add-task-on-day');
        if (addDayBtn) {
          const dateStr = addDayBtn.dataset.date;
          this.openAddTaskModal(dateStr);
          return;
        }

        // 10. Templates buttons
        if (e.target.closest('.btn-create-template')) {
          this.openAddTemplateModal();
          return;
        }

        if (e.target.closest('.btn-regenerate-current-week')) {
          engine.generateWeekTasks(this.weekDate);
          ui.showToast('Tareas de la semana actual actualizadas', '🔄');
          this.refreshCurrentView();
          return;
        }

        const editTmplBtn = e.target.closest('.btn-edit-template');
        if (editTmplBtn) {
          const tmplId = editTmplBtn.dataset.templateId;
          this.openEditTemplateModal(tmplId);
          return;
        }

        const delTmplBtn = e.target.closest('.btn-delete-template');
        if (delTmplBtn) {
          const tmplId = delTmplBtn.dataset.templateId;
          this.deleteTemplate(tmplId);
          return;
        }

        // 11. History week drill-down inspection
        const inspectWeekBtn = e.target.closest('.btn-inspect-week');
        if (inspectWeekBtn) {
          const weekId = inspectWeekBtn.dataset.weekId;
          this.openInspectWeekModal(weekId);
          return;
        }

        // 12. Backup and data management buttons
        if (e.target.closest('.btn-export-data')) {
          this.exportData();
          return;
        }

        if (e.target.closest('.btn-import-trigger')) {
          document.getElementById('import-file-input')?.click();
          return;
        }

        if (e.target.closest('.btn-reload-demo')) {
          if (confirm('¿Deseas restaurar los datos de ejemplo predeterminados?')) {
            engine.seedDemoData();
            ui.showToast('Datos de ejemplo restaurados', '🔄');
            this.applyThemeAndColors();
            this.refreshCurrentView();
          }
          return;
        }

        if (e.target.closest('.btn-reset-all')) {
          if (confirm('⚠️ ¿Estás seguro de restablecer toda la aplicación a cero?')) {
            storage.resetAllData();
            ui.showToast('Aplicación restablecida', '🧹');
            this.applyThemeAndColors();
            this.refreshCurrentView();
          }
          return;
        }
      });

      // File input listener for JSON import
      const fileInput = document.getElementById('import-file-input');
      if (fileInput) {
        fileInput.addEventListener('change', (e) => {
          const file = e.target.files[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = (ev) => {
            const res = storage.importDataJSON(ev.target.result);
            if (res.success) {
              ui.showToast('Copia de seguridad importada con éxito', '📥');
              this.applyThemeAndColors();
              this.refreshCurrentView();
            } else {
              alert('Error al importar archivo: ' + res.error);
            }
          };
          reader.readAsText(file);
        });
      }

      // Settings forms submit
      document.addEventListener('submit', (e) => {
        if (e.target.id === 'form-users-settings') {
          e.preventDefault();
          const users = storage.getUsers();
          users[0].name = document.getElementById('user1-name').value;
          users[0].color = document.getElementById('user1-color').value;
          users[0].avatar = document.getElementById('user1-avatar').value;

          users[1].name = document.getElementById('user2-name').value;
          users[1].color = document.getElementById('user2-color').value;
          users[1].avatar = document.getElementById('user2-avatar').value;

          storage.saveUsers(users);
          this.applyThemeAndColors();
          ui.showToast('Usuarios actualizados con éxito', '👥');
          this.refreshCurrentView();
        }

        if (e.target.id === 'form-house-settings') {
          e.preventDefault();
          const settings = storage.getSettings();
          settings.houseName = document.getElementById('house-name').value;
          settings.theme = document.getElementById('theme-selector').value;
          settings.startDay = document.getElementById('start-day-selector').value;

          storage.saveSettings(settings);
          this.applyThemeAndColors();
          ui.showToast('Ajustes del hogar guardados', '🏠');
          this.refreshCurrentView();
        }

        if (e.target.id === 'form-cloud-settings') {
          e.preventDefault();
          const url = document.getElementById('cloud-api-url').value.trim();
          storage.setApiUrl(url);
          ui.showToast('Conectando con base de datos...', '⏳');
          storage.syncFromCloud().then(res => {
            if (res.success) {
              ui.showToast('¡Sincronizado con la base de datos! ☁️', '✅');
              this.refreshCurrentView();
            } else {
              alert('No se pudo conectar con el backend: ' + (res.error || res.reason));
            }
          });
        }
      });

      // Force sync button
      document.addEventListener('click', (e) => {
        if (e.target.closest('.btn-force-sync')) {
          ui.showToast('Comprobando base de datos...', '🔄');
          storage.syncFromCloud().then(res => {
            if (res.success) {
              ui.showToast('Conexión exitosa y datos sincronizados', '✅');
              this.refreshCurrentView();
            } else {
              alert('Error al sincronizar con la base de datos: ' + (res.error || res.reason));
            }
          });
        }
      });
    }

    refreshCurrentView() {
      this.applyThemeAndColors();
      this.switchView(this.currentView);
    }

    toggleTaskStatus(taskId, isCompleted) {
      const instances = storage.getInstances();
      const users = storage.getUsers();
      const task = instances.find(i => i.id === taskId);
      if (!task) return;

      task.status = isCompleted ? 'completed' : 'pending';
      task.completedAt = isCompleted ? new Date().toISOString() : null;
      task.completedBy = isCompleted ? task.assignedTo : null;

      if (task.subtasks && task.subtasks.length > 0) {
        task.subtasks.forEach(s => {
          s.status = isCompleted ? 'completed' : 'pending';
          s.completedAt = isCompleted ? new Date().toISOString() : null;
          s.completedBy = isCompleted ? s.assignedTo : null;
        });
      }

      storage.saveInstances(instances);
      storage.syncTaskToCloud(task);

      storage.logActivity(
        task.assignedTo,
        isCompleted ? 'complete' : 'uncomplete',
        task.name,
        isCompleted ? 'Marcada como completada con 1 toque' : 'Desmarcada'
      );

      ui.showToast(
        isCompleted ? `¡"${task.name}" completada!` : `"${task.name}" marcada pendiente`,
        isCompleted ? '🎉' : '↩️'
      );

      this.refreshCurrentView();
    }

    toggleSubtaskStatus(parentId, subId, isCompleted) {
      const instances = storage.getInstances();
      const parentTask = instances.find(i => i.id === parentId);
      if (!parentTask || !parentTask.subtasks) return;

      const sub = parentTask.subtasks.find(s => s.id === subId);
      if (!sub) return;

      sub.status = isCompleted ? 'completed' : 'pending';
      sub.completedAt = isCompleted ? new Date().toISOString() : null;
      sub.completedBy = isCompleted ? sub.assignedTo : null;

      const allDone = parentTask.subtasks.every(s => s.status === 'completed');
      if (allDone) {
        parentTask.status = 'completed';
        parentTask.completedAt = new Date().toISOString();
      } else {
        parentTask.status = 'pending';
        parentTask.completedAt = null;
      }

      storage.saveInstances(instances);
      storage.syncTaskToCloud(parentTask);
      storage.logActivity(
        sub.assignedTo,
        isCompleted ? 'complete' : 'uncomplete',
        `${parentTask.name} → ${sub.name}`,
        isCompleted ? 'Subtarea completada' : 'Subtarea desmarcada'
      );

      this.refreshCurrentView();
    }

    handleSuggestedAction(taskId, action) {
      const instances = storage.getInstances();
      const task = instances.find(i => i.id === taskId);
      if (!task) return;

      if (action === 'accept') {
        task.status = 'completed';
        task.completedAt = new Date().toISOString();
        task.completedBy = task.assignedTo;
        storage.logActivity(task.assignedTo, 'complete', task.name, 'Lavadora puesta');
        ui.showToast('¡Lavadora puesta en marcha! 🧺', '✨');
      } else if (action === 'skip') {
        task.status = 'skipped';
        storage.logActivity(task.assignedTo, 'skip', task.name, 'Omitida por no haber ropa suficiente');
        ui.showToast('Lavadora omitida hoy (sin penalización)', '👍');
      }

      storage.saveInstances(instances);
      storage.syncTaskToCloud(task);
      this.refreshCurrentView();
    }

    setupModalEvents() {
      document.querySelectorAll('.modal-backdrop').forEach(modal => {
        modal.addEventListener('click', (e) => {
          if (e.target === modal || e.target.closest('.modal-close')) {
            this.closeModals();
          }
        });
      });

      const formAddTask = document.getElementById('form-add-task');
      if (formAddTask) {
        formAddTask.addEventListener('submit', (e) => {
          e.preventDefault();
          this.submitAddTaskForm();
        });
      }
    }

    closeModals() {
      document.querySelectorAll('.modal-backdrop').forEach(m => m.classList.remove('active'));
      this.activeTaskId = null;
    }

    openModal(modalId) {
      const modal = document.getElementById(modalId);
      if (modal) modal.classList.add('active');
    }

    openAddTaskModal(defaultDate = null) {
      const users = storage.getUsers();
      const modal = document.getElementById('modal-add-task');
      if (!modal) return;

      const dateVal = defaultDate || formatDateISO(this.referenceDate);
      const dateInput = document.getElementById('add-task-date');
      if (dateInput) dateInput.value = dateVal;

      document.getElementById('add-task-name').value = '';
      document.getElementById('add-task-notes').value = '';
      document.getElementById('add-task-duration').value = '15';
      document.getElementById('add-task-weight').value = '2';
      document.getElementById('add-task-category').value = 'hogar';
      document.getElementById('add-task-type').value = 'single';
      document.getElementById('add-task-assignee').value = 'user-1';

      const optUser1 = document.getElementById('opt-assignee-u1');
      if (optUser1) optUser1.textContent = `${users[0].avatar} ${users[0].name}`;
      const optUser2 = document.getElementById('opt-assignee-u2');
      if (optUser2) optUser2.textContent = `${users[1].avatar} ${users[1].name}`;

      this.openModal('modal-add-task');
    }

    submitAddTaskForm() {
      const users = storage.getUsers();
      const name = document.getElementById('add-task-name').value.trim();
      const type = document.getElementById('add-task-type').value;
      const category = document.getElementById('add-task-category').value;
      const assigneeMode = document.getElementById('add-task-assignee').value;
      const dueDate = document.getElementById('add-task-date').value;
      const weight = parseInt(document.getElementById('add-task-weight').value, 10) || 1;
      const estimatedMinutes = parseInt(document.getElementById('add-task-duration').value, 10) || 15;
      const notes = document.getElementById('add-task-notes').value.trim();
      const isRecurring = document.getElementById('add-task-is-recurring')?.checked;
      const frequency = document.getElementById('add-task-frequency')?.value || 'daily';

      if (!name) return;

      const taskDate = new Date(dueDate + 'T12:00:00');
      const weekId = getWeekId(taskDate);

      let assignedTo = 'user-1';
      if (assigneeMode === 'user-2') assignedTo = users[1]?.id || 'user-2';
      else if (assigneeMode === 'alternate_weekly') {
        const weekNum = parseInt(weekId.split('-W')[1], 10) || 1;
        assignedTo = weekNum % 2 === 0 ? 'user-1' : 'user-2';
      } else if (assigneeMode === 'alternate_turn') {
        const dayIdx = Math.floor(taskDate.getTime() / (1000 * 60 * 60 * 24));
        assignedTo = dayIdx % 2 === 0 ? 'user-1' : 'user-2';
      }

      if (isRecurring || type === 'recurrent') {
        const templates = storage.getTemplates();
        const newTmpl = {
          id: generateId('tmpl'),
          name,
          type: type === 'chapuza' ? 'chapuza' : 'recurrent',
          category,
          frequency,
          frequencyConfig: { anchorDate: dueDate },
          defaultAssignee: assigneeMode,
          weight,
          estimatedMinutes,
          active: true,
          notes
        };
        templates.push(newTmpl);
        storage.saveTemplates(templates);
      }

      const instances = storage.getInstances();
      const newInst = {
        id: generateId('task'),
        templateId: isRecurring ? 'custom_tmpl' : null,
        name,
        type,
        category,
        assignedTo,
        dueDate,
        status: 'pending',
        weight,
        estimatedMinutes,
        completedAt: null,
        completedBy: null,
        weekId,
        notes,
        priority: type === 'chapuza' ? 'medium' : undefined,
        subtasks: []
      };

      instances.push(newInst);
      storage.saveInstances(instances);
      storage.syncTaskToCloud(newInst);

      storage.logActivity(assignedTo, 'create', name, `Creada para el ${dueDate}`);
      ui.showToast(`Tarea "${name}" creada con éxito`, '＋');

      this.closeModals();
      this.refreshCurrentView();
    }

    openQuickActionsModal(taskId) {
      this.activeTaskId = taskId;
      const instances = storage.getInstances();
      const users = storage.getUsers();
      const task = instances.find(i => i.id === taskId);
      if (!task) return;

      const modalBody = document.getElementById('quick-actions-body');
      if (!modalBody) return;

      const user = ui.getUser(task.assignedTo, users);
      const cat = ui.getCategory(task.category);
      const otherUser = users.find(u => u.id !== task.assignedTo) || users[0];

      modalBody.innerHTML = `
        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 16px;">
          <span style="font-size: 1.6rem;">${cat.icon}</span>
          <div>
            <h3 style="font-size: 1.15rem; font-weight: 800;">${task.name}</h3>
            <div style="font-size: 0.85rem; color: var(--text-muted);">
              Responsable actual: <strong>${user.name}</strong> · Fecha: ${task.dueDate} · ${task.weight || 1} pt
            </div>
          </div>
        </div>

        <div style="display: flex; flex-direction: column; gap: 8px;">
          <button class="btn-secondary action-btn-toggle" style="justify-content: flex-start; padding: 12px 16px;">
            ${task.status === 'completed' ? '↩️ Marcar como PENDIENTE' : '✓ Marcar como COMPLETADA'}
          </button>

          <button class="btn-secondary action-btn-reassign" style="justify-content: flex-start; padding: 12px 16px;">
            👥 Reasignar a ${otherUser.avatar} <strong>${otherUser.name}</strong>
          </button>

          <button class="btn-secondary action-btn-tomorrow" style="justify-content: flex-start; padding: 12px 16px;">
            ⏳ Posponer para mañana
          </button>

          <button class="btn-secondary action-btn-delete" style="justify-content: flex-start; padding: 12px 16px; color: var(--danger);">
            🗑️ Eliminar esta tarea
          </button>
        </div>
      `;

      modalBody.querySelector('.action-btn-toggle')?.addEventListener('click', () => {
        this.toggleTaskStatus(taskId, task.status !== 'completed');
        this.closeModals();
      });

      modalBody.querySelector('.action-btn-reassign')?.addEventListener('click', () => {
        task.assignedTo = otherUser.id;
        storage.saveInstances(instances);
        storage.logActivity(otherUser.id, 'reassign', task.name, `Reasignada a ${otherUser.name}`);
        ui.showToast(`Tarea reasignada a ${otherUser.name}`, '🔄');
        this.closeModals();
        this.refreshCurrentView();
      });

      modalBody.querySelector('.action-btn-tomorrow')?.addEventListener('click', () => {
        const d = new Date(task.dueDate + 'T12:00:00');
        d.setDate(d.getDate() + 1);
        task.dueDate = formatDateISO(d);
        task.weekId = getWeekId(d);
        storage.saveInstances(instances);
        storage.logActivity(task.assignedTo, 'reschedule', task.name, `Pospuesta al ${task.dueDate}`);
        ui.showToast(`Tarea pospuesta al ${task.dueDate}`, '⏳');
        this.closeModals();
        this.refreshCurrentView();
      });

      modalBody.querySelector('.action-btn-delete')?.addEventListener('click', () => {
        if (confirm(`¿Eliminar la tarea "${task.name}"?`)) {
          const filtered = instances.filter(i => i.id !== taskId);
          storage.saveInstances(filtered);
          ui.showToast(`Tarea eliminada`, '🗑️');
          this.closeModals();
          this.refreshCurrentView();
        }
      });

      this.openModal('modal-quick-actions');
    }

    openInspectWeekModal(weekId) {
      const instances = storage.getInstances();
      const users = storage.getUsers();
      const weekTasks = instances.filter(i => i.weekId === weekId);
      const stats = engine.calculateStats(weekTasks, users);

      const modalBody = document.getElementById('inspect-week-body');
      const modalTitle = document.getElementById('inspect-week-title');
      if (!modalBody) return;

      if (modalTitle) modalTitle.textContent = `Detalle de la Semana ${weekId}`;

      modalBody.innerHTML = `
        <div class="card" style="background: var(--bg-surface-subtle); margin-bottom: 16px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <span style="font-weight: 750;">Rendimiento:</span>
            <span style="font-size: 1.4rem; font-weight: 800; color: var(--primary);">${stats.completionRate}%</span>
          </div>
          <div class="progress-bar-track">
            <div class="progress-bar-fill" style="width: ${stats.completionRate}%"></div>
          </div>
          <div style="display: flex; justify-content: space-between; font-size: 0.85rem; color: var(--text-muted); margin-top: 8px;">
            <span>${stats.completedTasks} completadas</span>
            <span>${stats.skippedTasks} omitidas</span>
            <span>${stats.pendingTasks} pendientes</span>
          </div>
        </div>

        <div style="display: flex; flex-direction: column; gap: 8px;">
          ${weekTasks.map(t => {
            const user = ui.getUser(t.assignedTo, users);
            const isDone = t.status === 'completed';
            const isSkipped = t.status === 'skipped';
            return `
              <div style="display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; background: var(--bg-surface); border: 1px solid var(--border-subtle); border-radius: var(--radius-md);">
                <div style="display: flex; align-items: center; gap: 8px;">
                  <span>${isDone ? '✅' : (isSkipped ? '⚪' : '⏳')}</span>
                  <div>
                    <div style="font-weight: 600; font-size: 0.9rem; ${isDone ? 'text-decoration: line-through; color: var(--text-muted);' : ''}">${t.name}</div>
                    <div style="font-size: 0.75rem; color: var(--text-muted);">${t.dueDate} · ${user.name}</div>
                  </div>
                </div>
                <span class="badge">${t.weight || 1} pt</span>
              </div>
            `;
          }).join('')}
        </div>
      `;

      this.openModal('modal-inspect-week');
    }

    deleteTemplate(tmplId) {
      if (confirm('¿Eliminar esta plantilla de tarea recurrente?')) {
        const templates = storage.getTemplates().filter(t => t.id !== tmplId);
        storage.saveTemplates(templates);
        ui.showToast('Plantilla eliminada', '🗑️');
        this.refreshCurrentView();
      }
    }

    openAddTemplateModal() {
      this.openAddTaskModal();
      const isRecurEl = document.getElementById('add-task-is-recurring');
      if (isRecurEl) isRecurEl.checked = true;
      const recurGroup = document.getElementById('group-recurrence-options');
      if (recurGroup) recurGroup.style.display = 'block';
    }

    openEditTemplateModal(tmplId) {
      const templates = storage.getTemplates();
      const tmpl = templates.find(t => t.id === tmplId);
      if (!tmpl) return;

      this.openAddTaskModal();
      document.getElementById('add-task-name').value = tmpl.name;
      document.getElementById('add-task-category').value = tmpl.category;
      document.getElementById('add-task-weight').value = tmpl.weight;
      document.getElementById('add-task-duration').value = tmpl.estimatedMinutes;
      document.getElementById('add-task-notes').value = tmpl.notes || '';
      document.getElementById('add-task-assignee').value = tmpl.defaultAssignee;
      
      const isRecurEl = document.getElementById('add-task-is-recurring');
      if (isRecurEl) isRecurEl.checked = true;
      const recurGroup = document.getElementById('group-recurrence-options');
      if (recurGroup) recurGroup.style.display = 'block';
      if (document.getElementById('add-task-frequency')) {
        document.getElementById('add-task-frequency').value = tmpl.frequency;
      }
    }

    exportData() {
      const jsonStr = storage.exportDataJSON();
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `hogar_backup_${formatDateISO(new Date())}.json`;
      a.click();
      URL.revokeObjectURL(url);
      ui.showToast('Copia de seguridad descargada', '💾');
    }
  }

  function startApp() {
    const app = new App();
    app.init();
    window.hogarApp = app;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startApp);
  } else {
    startApp();
  }
})();
