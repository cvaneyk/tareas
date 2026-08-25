/**
 * UI Rendering module: Dashboard, Week View, Templates, History, Stats, Settings
 */

(function() {
  const { CATEGORIES, TASK_TYPES, WEIGHT_LABELS, formatDateISO, getWeekId } = window.HogarModels;
  const storage = window.HogarStorage;
  const engine = window.HogarEngine;

  const ui = {
    // Format helpers
    formatDateSpanish(date, options = { weekday: 'long', day: 'numeric', month: 'long' }) {
      const d = typeof date === 'string' ? new Date(date + 'T12:00:00') : new Date(date);
      return d.toLocaleDateString('es-ES', options);
    },

    formatWeekRange(weekDates) {
      const start = weekDates[0];
      const end = weekDates[6];
      const startDay = start.getDate();
      const endDay = end.getDate();
      const startMonth = start.toLocaleDateString('es-ES', { month: 'short' });
      const endMonth = end.toLocaleDateString('es-ES', { month: 'short' });

      if (startMonth === endMonth) {
        return `${startDay} - ${endDay} ${startMonth}`;
      }
      return `${startDay} ${startMonth} - ${endDay} ${endMonth}`;
    },

    getUser(userId, users) {
      return users.find(u => u.id === userId) || { id: userId, name: userId, color: '#64748b', avatar: '👤' };
    },

    getCategory(catId) {
      return CATEGORIES[catId] || { id: catId, label: catId, icon: '📋', color: '#64748b' };
    },

    showToast(message, icon = '✨') {
      const container = document.getElementById('toast-container');
      if (!container) return;

      const toast = document.createElement('div');
      toast.className = 'toast';
      toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;
      container.appendChild(toast);

      setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(10px)';
        toast.style.transition = 'all 0.3s ease';
        setTimeout(() => toast.remove(), 300);
      }, 3000);
    },

    /**
     * Render Dashboard (Inicio)
     */
    renderDashboard(currentDate = new Date()) {
      const container = document.getElementById('view-inicio');
      if (!container) return;

      const users = storage.getUsers();
      const instances = storage.getInstances();
      const todayStr = formatDateISO(currentDate);
      const weekDates = engine.getWeekDates(currentDate);
      const weekId = getWeekId(weekDates[0]);

      // Current week instances
      const currentWeekInstances = instances.filter(i => i.weekId === weekId);
      const weekStats = engine.calculateStats(currentWeekInstances, users);

      // Today's instances
      const todayInstances = instances.filter(i => i.dueDate === todayStr);
      const todayP1 = todayInstances.filter(i => i.assignedTo === users[0].id);
      const todayP2 = todayInstances.filter(i => i.assignedTo === users[1].id);

      // Upcoming instances
      const tomorrow = new Date(currentDate);
      tomorrow.setDate(currentDate.getDate() + 1);
      const tomorrowStr = formatDateISO(tomorrow);
      
      const upcomingInstances = instances.filter(i => {
        return i.dueDate > todayStr && i.dueDate <= formatDateISO(weekDates[6]) && i.status !== 'completed' && i.status !== 'skipped';
      }).slice(0, 5);

      // Chapuza of the week
      const currentChapuza = currentWeekInstances.find(i => i.type === 'chapuza');

      // Conditional suggested task (Lavadora)
      const suggestedTask = todayInstances.find(i => i.type === 'suggested' && i.status === 'pending');

      const html = `
        <div class="dashboard-greeting">
          <h2 class="greeting-text">Buenos días 👋</h2>
          <p class="date-subtext">${this.formatDateSpanish(currentDate, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
        </div>

        <!-- RESUMEN SEMANAL -->
        <div class="card week-summary-card">
          <div class="week-summary-header">
            <div>
              <span class="week-summary-title">Esta semana</span>
              <div style="font-weight: 700; font-size: 1.1rem; color: var(--text-main); margin-top: 2px;">
                ${this.formatWeekRange(weekDates)}
              </div>
            </div>
            <span class="week-summary-percent">${weekStats.completionRate}%</span>
          </div>

          <div class="progress-bar-track">
            <div class="progress-bar-fill" style="width: ${weekStats.completionRate}%"></div>
          </div>

          <div class="week-summary-footer">
            <span>${weekStats.completedTasks} de ${weekStats.totalTasks} tareas completadas</span>
            ${weekStats.pendingTasks > 0 ? `<span style="color: var(--warning); font-weight: 600;">${weekStats.pendingTasks} pendientes</span>` : `<span style="color: var(--success); font-weight: 700;">¡Todo al día! 🎉</span>`}
          </div>

          <!-- REPARTO / FAIRNESS -->
          <div class="fairness-meter">
            <div class="fairness-header">
              <span>⚖️ Reparto de esfuerzo (por puntos)</span>
              <span>${weekStats.user1.pointsDone + weekStats.user2.pointsDone} pts completados</span>
            </div>
            <div class="fairness-bar">
              <div class="fairness-p1" style="width: ${weekStats.user1.pointsPercent}%" title="${users[0].name}: ${weekStats.user1.pointsPercent}%"></div>
              <div class="fairness-p2" style="width: ${weekStats.user2.pointsPercent}%" title="${users[1].name}: ${weekStats.user2.pointsPercent}%"></div>
            </div>
            <div class="fairness-legend">
              <span class="legend-p1">${users[0].avatar} ${users[0].name}: ${weekStats.user1.pointsPercent}% (${weekStats.user1.pointsDone} pts)</span>
              <span class="legend-p2">${users[1].avatar} ${users[1].name}: ${weekStats.user2.pointsPercent}% (${weekStats.user2.pointsDone} pts)</span>
            </div>
          </div>
        </div>

        <!-- CONDITIONAL / SUGGESTED CARD -->
        ${suggestedTask ? `
          <div class="suggested-card" data-task-id="${suggestedTask.id}">
            <div class="suggested-title">
              <span>🧺</span>
              <span>¿Hay suficiente ropa para poner una lavadora?</span>
            </div>
            <div class="suggested-desc">
              Tarea sugerida para hoy asignada a <strong>${this.getUser(suggestedTask.assignedTo, users).name}</strong>. Si no hay ropa suficiente, puedes omitirla sin penalización.
            </div>
            <div class="suggested-actions">
              <button class="btn-primary btn-accept-suggested" data-task-id="${suggestedTask.id}" style="font-size: 0.88rem; padding: 8px 16px;">
                ✓ Sí, poner lavadora
              </button>
              <button class="btn-secondary btn-skip-suggested" data-task-id="${suggestedTask.id}" style="font-size: 0.88rem; padding: 8px 16px;">
                ✕ Omitir hoy
              </button>
            </div>
          </div>
        ` : ''}

        <!-- HOY -->
        <div class="section-title-wrap">
          <h3 class="section-title">
            <span>📅 Tareas de Hoy</span>
            <span class="badge">${todayInstances.filter(i => i.status !== 'skipped').length}</span>
          </h3>
          <button class="btn-primary btn-open-add-task" style="padding: 6px 14px; font-size: 0.85rem;">
            ＋ Añadir tarea
          </button>
        </div>

        <!-- PERSONA 1 -->
        <div class="task-group">
          <div class="task-group-header">
            <span class="user-chip user1">${users[0].avatar} ${users[0].name}</span>
            <span style="font-size: 0.82rem; color: var(--text-muted); font-weight: 500;">
              (${todayP1.filter(t => t.status === 'completed').length}/${todayP1.filter(t => t.status !== 'skipped').length} completadas)
            </span>
          </div>
          <div class="task-list">
            ${todayP1.length > 0 
              ? todayP1.map(task => this.renderTaskCard(task, users)).join('')
              : '<div style="font-size: 0.88rem; color: var(--text-muted); padding: 8px 12px; background: var(--bg-surface-subtle); border-radius: var(--radius-md);">No tiene tareas programadas para hoy 🙌</div>'
            }
          </div>
        </div>

        <!-- PERSONA 2 -->
        <div class="task-group">
          <div class="task-group-header">
            <span class="user-chip user2">${users[1].avatar} ${users[1].name}</span>
            <span style="font-size: 0.82rem; color: var(--text-muted); font-weight: 500;">
              (${todayP2.filter(t => t.status === 'completed').length}/${todayP2.filter(t => t.status !== 'skipped').length} completadas)
            </span>
          </div>
          <div class="task-list">
            ${todayP2.length > 0 
              ? todayP2.map(task => this.renderTaskCard(task, users)).join('')
              : '<div style="font-size: 0.88rem; color: var(--text-muted); padding: 8px 12px; background: var(--bg-surface-subtle); border-radius: var(--radius-md);">No tiene tareas programadas para hoy 🙌</div>'
            }
          </div>
        </div>

        <!-- PRÓXIMAMENTE -->
        ${upcomingInstances.length > 0 ? `
          <div class="section-title-wrap">
            <h3 class="section-title">
              <span>⏳ Próximamente</span>
            </h3>
          </div>
          <div class="card" style="padding: 12px 16px;">
            <div class="task-list">
              ${upcomingInstances.map(task => {
                const cat = this.getCategory(task.category);
                const user = this.getUser(task.assignedTo, users);
                const isTomorrow = task.dueDate === tomorrowStr;
                const dueFormatted = isTomorrow ? 'Mañana' : this.formatDateSpanish(task.dueDate, { weekday: 'long' });
                return `
                  <div style="display: flex; align-items: center; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid var(--border-subtle);">
                    <div style="display: flex; align-items: center; gap: 10px;">
                      <span style="font-size: 1.2rem;">${cat.icon}</span>
                      <div>
                        <div style="font-weight: 600; font-size: 0.92rem;">${task.name}</div>
                        <div style="font-size: 0.78rem; color: var(--text-muted);">Asignado a ${user.name}</div>
                      </div>
                    </div>
                    <span class="badge" style="background-color: var(--primary-light); color: var(--primary); font-weight: 600; text-transform: capitalize;">
                      ${dueFormatted}
                    </span>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        ` : ''}

        <!-- CHAPUZA DE LA SEMANA -->
        ${currentChapuza ? `
          <div class="section-title-wrap">
            <h3 class="section-title">
              <span>🔧 Chapuza de la Semana</span>
            </h3>
          </div>
          <div class="card chapuza-highlight-card" data-task-id="${currentChapuza.id}">
            <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 8px;">
              <div style="display: flex; align-items: center; gap: 10px;">
                <input type="checkbox" class="task-checkbox toggle-task-status" data-task-id="${currentChapuza.id}" ${currentChapuza.status === 'completed' ? 'checked' : ''} />
                <div>
                  <h4 style="font-size: 1.05rem; font-weight: 750; ${currentChapuza.status === 'completed' ? 'text-decoration: line-through; color: var(--text-muted);' : ''}">${currentChapuza.name}</h4>
                  <div style="font-size: 0.82rem; color: var(--text-muted); margin-top: 2px;">
                    Asignada a <strong>${this.getUser(currentChapuza.assignedTo, users).name}</strong> · Prioridad: <span class="chapuza-badge">${currentChapuza.priority === 'high' ? 'Alta' : 'Media'}</span>
                  </div>
                </div>
              </div>
              <button class="icon-btn btn-quick-actions" data-task-id="${currentChapuza.id}" style="width: 32px; height: 32px;">⋮</button>
            </div>
            ${currentChapuza.notes ? `
              <div style="font-size: 0.85rem; color: var(--text-muted); background: var(--bg-surface-subtle); padding: 8px 12px; border-radius: var(--radius-sm); margin-top: 8px;">
                📝 <strong>Nota:</strong> ${currentChapuza.notes}
              </div>
            ` : ''}
            ${currentChapuza.status === 'completed' ? `
              <div style="font-size: 0.8rem; color: var(--success); font-weight: 600; margin-top: 8px;">
                ✓ Completada por ${this.getUser(currentChapuza.completedBy || currentChapuza.assignedTo, users).name} el ${new Date(currentChapuza.completedAt || Date.now()).toLocaleDateString('es-ES')}
              </div>
            ` : ''}
          </div>
        ` : ''}
      `;

      container.innerHTML = html;
    },

    /**
     * Render individual task card
     */
    renderTaskCard(task, users) {
      if (task.status === 'skipped') return '';

      const cat = this.getCategory(task.category);
      const user = this.getUser(task.assignedTo, users);
      const isCompleted = task.status === 'completed';
      const isBigClean = task.type === 'big_clean' && task.subtasks && task.subtasks.length > 0;

      if (isBigClean) {
        const completedSubCount = task.subtasks.filter(s => s.status === 'completed').length;
        const totalSubCount = task.subtasks.length;
        return `
          <div class="big-clean-card" data-task-id="${task.id}">
            <div class="big-clean-header">
              <div class="big-clean-title">
                <span>🧽</span>
                <span>${task.name}</span>
              </div>
              <span class="badge" style="background-color: var(--primary-light); color: var(--primary); font-weight: 700;">
                ${completedSubCount} / ${totalSubCount} completadas
              </span>
            </div>
            <div class="progress-bar-track" style="height: 6px; margin-bottom: 12px;">
              <div class="progress-bar-fill" style="width: ${totalSubCount > 0 ? (completedSubCount / totalSubCount) * 100 : 0}%"></div>
            </div>
            <div class="subtasks-container">
              ${task.subtasks.map(sub => {
                const subUser = this.getUser(sub.assignedTo, users);
                const subCompleted = sub.status === 'completed';
                return `
                  <div class="subtask-item ${subCompleted ? 'completed' : ''}">
                    <div class="subtask-left">
                      <input type="checkbox" class="subtask-checkbox toggle-subtask-status" data-parent-id="${task.id}" data-sub-id="${sub.id}" ${subCompleted ? 'checked' : ''} />
                      <span class="subtask-name">${sub.name}</span>
                    </div>
                    <span class="user-chip ${sub.assignedTo === users[0].id ? 'user1' : 'user2'}" style="font-size: 0.72rem; padding: 2px 7px;">
                      ${subUser.avatar} ${subUser.name}
                    </span>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        `;
      }

      return `
        <div class="task-card ${isCompleted ? 'completed' : ''}" data-task-id="${task.id}">
          <div class="task-checkbox-wrap">
            <input type="checkbox" class="task-checkbox toggle-task-status" data-task-id="${task.id}" ${isCompleted ? 'checked' : ''} />
          </div>
          <div class="task-body btn-open-detail" data-task-id="${task.id}">
            <div class="task-header-row">
              <span class="task-name">${task.name}</span>
            </div>
            <div class="task-meta">
              <span class="meta-pill">${cat.icon} ${cat.label}</span>
              <span class="meta-pill weight">⚡ ${task.weight || 1} pt</span>
              ${task.estimatedMinutes ? `<span class="meta-pill">⏱️ ${task.estimatedMinutes}m</span>` : ''}
              ${task.notes ? `<div class="task-note">"${task.notes}"</div>` : ''}
            </div>
          </div>
          <button class="task-actions-btn btn-quick-actions" data-task-id="${task.id}" title="Opciones">
            ⋮
          </button>
        </div>
      `;
    },

    /**
     * Render Week View (Semana)
     */
    renderWeekView(targetDate = new Date(), currentFilter = 'all') {
      const container = document.getElementById('view-semana');
      if (!container) return;

      const users = storage.getUsers();
      const instances = storage.getInstances();
      const weekDates = engine.getWeekDates(targetDate);
      const weekId = getWeekId(weekDates[0]);
      const todayStr = formatDateISO(new Date());

      const weekInstances = instances.filter(i => i.weekId === weekId);

      const html = `
        <!-- NAVEGADOR DE SEMANAS -->
        <div class="week-navigator">
          <button class="icon-btn btn-prev-week" title="Semana anterior">‹</button>
          <div style="text-align: center;">
            <div class="week-label">${this.formatWeekRange(weekDates)}</div>
            <button class="btn-secondary btn-current-week" style="padding: 2px 10px; font-size: 0.75rem; margin-top: 4px;">
              Esta semana
            </button>
          </div>
          <button class="icon-btn btn-next-week" title="Semana siguiente">›</button>
        </div>

        <!-- FILTROS -->
        <div class="week-filters">
          <button class="filter-chip ${currentFilter === 'all' ? 'active' : ''}" data-filter="all">Todas</button>
          <button class="filter-chip ${currentFilter === 'user-1' ? 'active' : ''}" data-filter="user-1">${users[0].avatar} ${users[0].name}</button>
          <button class="filter-chip ${currentFilter === 'user-2' ? 'active' : ''}" data-filter="user-2">${users[1].avatar} ${users[1].name}</button>
          <button class="filter-chip ${currentFilter === 'pending' ? 'active' : ''}" data-filter="pending">⏳ Solo pendientes</button>
        </div>

        <!-- MATRIZ RESUMEN DE LA SEMANA -->
        <div class="week-matrix">
          ${weekDates.map(date => {
            const dateStr = formatDateISO(date);
            const dayName = date.toLocaleDateString('es-ES', { weekday: 'narrow' }).toUpperCase();
            const dayInstances = weekInstances.filter(i => i.dueDate === dateStr && i.status !== 'skipped');
            const isDone = dayInstances.length > 0 && dayInstances.every(i => i.status === 'completed');
            const isToday = dateStr === todayStr;

            return `
              <div>
                <div class="matrix-col-header" style="${isToday ? 'color: var(--primary); font-weight: 800;' : ''}">${dayName}</div>
                <div class="matrix-status-dot ${isDone ? 'done' : 'pending'}" style="${isToday ? 'border: 2px solid var(--primary);' : ''}">
                  ${isDone ? '✓' : dayInstances.length}
                </div>
              </div>
            `;
          }).join('')}
        </div>

        <!-- TARJETAS POR DÍA -->
        <div class="daily-cards-list">
          ${weekDates.map(date => {
            const dateStr = formatDateISO(date);
            const isToday = dateStr === todayStr;
            let dayTasks = weekInstances.filter(i => i.dueDate === dateStr && i.status !== 'skipped');

            // Apply filter
            if (currentFilter === 'user-1') {
              dayTasks = dayTasks.filter(i => i.assignedTo === users[0].id);
            } else if (currentFilter === 'user-2') {
              dayTasks = dayTasks.filter(i => i.assignedTo === users[1].id);
            } else if (currentFilter === 'pending') {
              dayTasks = dayTasks.filter(i => i.status !== 'completed');
            }

            const dayP1 = dayTasks.filter(i => i.assignedTo === users[0].id);
            const dayP2 = dayTasks.filter(i => i.assignedTo === users[1].id);

            return `
              <div class="day-card ${isToday ? 'is-today' : ''}" data-date="${dateStr}">
                <div class="day-card-header">
                  <div>
                    <span class="day-name">
                      ${this.formatDateSpanish(date, { weekday: 'long', day: 'numeric', month: 'short' })}
                    </span>
                    ${isToday ? `<span class="badge" style="background: var(--primary-light); color: var(--primary); margin-left: 6px;">Hoy</span>` : ''}
                  </div>
                  <button class="btn-secondary btn-add-task-on-day" data-date="${dateStr}" style="padding: 4px 10px; font-size: 0.78rem;">
                    ＋ Tarea
                  </button>
                </div>

                ${dayTasks.length === 0 ? `
                  <div style="font-size: 0.85rem; color: var(--text-muted); padding: 8px 0;">No hay tareas programadas</div>
                ` : `
                  <!-- Persona 1 tasks -->
                  ${dayP1.length > 0 ? `
                    <div style="margin-bottom: 10px;">
                      <div style="font-size: 0.78rem; font-weight: 700; color: var(--user1-text); margin-bottom: 6px;">
                        ${users[0].avatar} ${users[0].name}
                      </div>
                      <div class="task-list">
                        ${dayP1.map(task => this.renderTaskCard(task, users)).join('')}
                      </div>
                    </div>
                  ` : ''}

                  <!-- Persona 2 tasks -->
                  ${dayP2.length > 0 ? `
                    <div>
                      <div style="font-size: 0.78rem; font-weight: 700; color: var(--user2-text); margin-bottom: 6px;">
                        ${users[1].avatar} ${users[1].name}
                      </div>
                      <div class="task-list">
                        ${dayP2.map(task => this.renderTaskCard(task, users)).join('')}
                      </div>
                    </div>
                  ` : ''}
                `}
              </div>
            `;
          }).join('')}
        </div>
      `;

      container.innerHTML = html;
    },

    /**
     * Render Templates Manager (Tareas recurrentes / Plantillas)
     */
    renderTemplatesView() {
      const container = document.getElementById('view-tareas');
      if (!container) return;

      const users = storage.getUsers();
      const templates = storage.getTemplates();

      const html = `
        <div class="section-title-wrap">
          <div>
            <h2 style="font-size: 1.4rem; font-weight: 800;">Plantillas y Recurrencias</h2>
            <p style="font-size: 0.88rem; color: var(--text-muted);">Configuración de tareas automáticas y reglas de reparto</p>
          </div>
          <button class="btn-primary btn-create-template">
            ＋ Nueva plantilla
          </button>
        </div>

        <div style="display: flex; flex-direction: column; gap: 14px; margin-top: 16px;">
          ${templates.map(tmpl => {
            const cat = this.getCategory(tmpl.category);
            let assigneeLabel = 'Persona 1';
            if (tmpl.defaultAssignee === 'user-2') assigneeLabel = users[1]?.name || 'Persona 2';
            else if (tmpl.defaultAssignee === 'alternate_weekly') assigneeLabel = 'Alternar por semana';
            else if (tmpl.defaultAssignee === 'alternate_turn') assigneeLabel = 'Alternar por turnos';
            else if (tmpl.defaultAssignee === 'user-1') assigneeLabel = users[0]?.name || 'Persona 1';

            return `
              <div class="card" style="margin-bottom: 0; padding: 16px 20px;">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 12px;">
                  <div>
                    <div style="display: flex; align-items: center; gap: 8px;">
                      <span style="font-size: 1.25rem;">${cat.icon}</span>
                      <h3 style="font-size: 1.05rem; font-weight: 750;">${tmpl.name}</h3>
                      ${tmpl.active === false ? `<span class="badge" style="background: var(--danger-light); color: var(--danger);">Pausada</span>` : ''}
                    </div>
                    <div style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px;">
                      <span class="meta-pill">🔄 ${tmpl.frequency}</span>
                      <span class="meta-pill">👥 ${assigneeLabel}</span>
                      <span class="meta-pill weight">⚡ ${tmpl.weight || 1} pt</span>
                      <span class="meta-pill">⏱️ ${tmpl.estimatedMinutes || 15} min</span>
                    </div>
                    ${tmpl.subtasks && tmpl.subtasks.length > 0 ? `
                      <div style="font-size: 0.8rem; color: var(--text-muted); margin-top: 8px;">
                        📋 ${tmpl.subtasks.length} subtareas configuradas
                      </div>
                    ` : ''}
                    ${tmpl.notes ? `<div style="font-size: 0.82rem; color: var(--text-muted); margin-top: 4px; font-style: italic;">"${tmpl.notes}"</div>` : ''}
                  </div>
                  <div style="display: flex; gap: 6px;">
                    <button class="icon-btn btn-edit-template" data-template-id="${tmpl.id}" title="Editar plantilla">✏️</button>
                    <button class="icon-btn btn-delete-template" data-template-id="${tmpl.id}" title="Eliminar" style="color: var(--danger);">🗑️</button>
                  </div>
                </div>
              </div>
            `;
          }).join('')}
        </div>

        <div style="margin-top: 24px; text-align: center;">
          <button class="btn-secondary btn-regenerate-current-week">
            🔄 Regenerar tareas de la semana actual según plantillas
          </button>
        </div>
      `;

      container.innerHTML = html;
    },

    /**
     * Render History (Histórico)
     */
    renderHistoryView() {
      const container = document.getElementById('view-historico');
      if (!container) return;

      const users = storage.getUsers();
      const instances = storage.getInstances();

      const weeksMap = {};
      instances.forEach(inst => {
        if (!inst.weekId) return;
        if (!weeksMap[inst.weekId]) weeksMap[inst.weekId] = [];
        weeksMap[inst.weekId].push(inst);
      });

      const sortedWeekIds = Object.keys(weeksMap).sort().reverse();

      const html = `
        <div class="section-title-wrap">
          <div>
            <h2 style="font-size: 1.4rem; font-weight: 800;">Histórico Semanal</h2>
            <p style="font-size: 0.88rem; color: var(--text-muted);">Registro permanente de todas las semanas pasadas</p>
          </div>
        </div>

        <div style="display: flex; flex-direction: column; gap: 14px;">
          ${sortedWeekIds.map(wId => {
            const wInstances = weeksMap[wId];
            const stats = engine.calculateStats(wInstances, users);
            
            return `
              <div class="card btn-inspect-week" data-week-id="${wId}" style="cursor: pointer;">
                <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 8px;">
                  <div>
                    <h3 style="font-size: 1.1rem; font-weight: 750;">Semana ${wId}</h3>
                    <div style="font-size: 0.82rem; color: var(--text-muted);">
                      ${stats.totalTasks} tareas · ${stats.completedTasks} completadas · ${stats.skippedTasks} omitidas
                    </div>
                  </div>
                  <div style="font-size: 1.4rem; font-weight: 850; color: var(--primary);">
                    ${stats.completionRate}%
                  </div>
                </div>

                <div class="progress-bar-track">
                  <div class="progress-bar-fill" style="width: ${stats.completionRate}%"></div>
                </div>

                <div style="display: flex; justify-content: space-between; font-size: 0.85rem; color: var(--text-muted); margin-top: 10px;">
                  <span>${users[0].avatar} ${users[0].name}: <strong>${stats.user1.tasksDone}</strong> tareas (${stats.user1.pointsDone} pts)</span>
                  <span>${users[1].avatar} ${users[1].name}: <strong>${stats.user2.tasksDone}</strong> tareas (${stats.user2.pointsDone} pts)</span>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `;

      container.innerHTML = html;
    },

    /**
     * Render Statistics (Estadísticas)
     */
    renderStatsView(period = 'month') {
      const container = document.getElementById('view-estadisticas');
      if (!container) return;

      const users = storage.getUsers();
      const instances = storage.getInstances();
      const activityLogs = storage.getActivityLog();

      const stats = engine.calculateStats(instances, users);

      const formatTime = (minutes) => {
        const h = Math.floor(minutes / 60);
        const m = minutes % 60;
        return h > 0 ? `${h}h ${m}m` : `${m}m`;
      };

      const html = `
        <div class="section-title-wrap">
          <div>
            <h2 style="font-size: 1.4rem; font-weight: 800;">Estadísticas y Reparto</h2>
            <p style="font-size: 0.88rem; color: var(--text-muted);">Análisis de equidad y tiempos dedicados</p>
          </div>
        </div>

        <!-- METRICAS CLAVE -->
        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-title">Cumplimiento Global</div>
            <div class="stat-value" style="color: var(--primary);">${stats.completionRate}%</div>
            <div style="font-size: 0.82rem; color: var(--text-muted); margin-top: 4px;">${stats.completedTasks} de ${stats.totalTasks} tareas</div>
          </div>

          <div class="stat-card">
            <div class="stat-title">Tiempo Total Invertido</div>
            <div class="stat-value">${formatTime(stats.user1.minutesDone + stats.user2.minutesDone)}</div>
            <div style="font-size: 0.82rem; color: var(--text-muted); margin-top: 4px;">Estimado según pesos</div>
          </div>

          <div class="stat-card">
            <div class="stat-title">Puntos Totales</div>
            <div class="stat-value">${stats.user1.pointsDone + stats.user2.pointsDone}</div>
            <div style="font-size: 0.82rem; color: var(--text-muted); margin-top: 4px;">Unidades de esfuerzo</div>
          </div>
        </div>

        <!-- REPARTO ENTRE PERSONAS -->
        <div class="card">
          <h3 style="font-size: 1.1rem; font-weight: 750; margin-bottom: 14px;">⚖️ Reparto Equitativo de Tareas</h3>
          
          <div style="margin-bottom: 16px;">
            <div style="display: flex; justify-content: space-between; font-size: 0.9rem; font-weight: 600; margin-bottom: 6px;">
              <span style="color: var(--user1-text);">${users[0].avatar} ${users[0].name} (${stats.user1.pointsPercent}%)</span>
              <span style="color: var(--user2-text);">${users[1].avatar} ${users[1].name} (${stats.user2.pointsPercent}%)</span>
            </div>
            <div class="fairness-bar" style="height: 14px;">
              <div class="fairness-p1" style="width: ${stats.user1.pointsPercent}%"></div>
              <div class="fairness-p2" style="width: ${stats.user2.pointsPercent}%"></div>
            </div>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; padding-top: 14px; border-top: 1px solid var(--border-subtle);">
            <div>
              <div style="font-weight: 700; color: var(--user1-text); margin-bottom: 6px;">${users[0].name}</div>
              <div style="font-size: 0.85rem; color: var(--text-muted);">✓ Tareas: <strong>${stats.user1.tasksDone}</strong></div>
              <div style="font-size: 0.85rem; color: var(--text-muted);">⚡ Puntos: <strong>${stats.user1.pointsDone}</strong></div>
              <div style="font-size: 0.85rem; color: var(--text-muted);">⏱️ Tiempo: <strong>${formatTime(stats.user1.minutesDone)}</strong></div>
            </div>
            <div>
              <div style="font-weight: 700; color: var(--user2-text); margin-bottom: 6px;">${users[1].name}</div>
              <div style="font-size: 0.85rem; color: var(--text-muted);">✓ Tareas: <strong>${stats.user2.tasksDone}</strong></div>
              <div style="font-size: 0.85rem; color: var(--text-muted);">⚡ Puntos: <strong>${stats.user2.pointsDone}</strong></div>
              <div style="font-size: 0.85rem; color: var(--text-muted);">⏱️ Tiempo: <strong>${formatTime(stats.user2.minutesDone)}</strong></div>
            </div>
          </div>
        </div>

        <!-- DESGLOSE POR TIPO / CATEGORÍA -->
        <div class="card">
          <h3 style="font-size: 1.1rem; font-weight: 750; margin-bottom: 16px;">📊 Tareas por Categoría</h3>
          <div class="category-stats-list">
            ${Object.entries(CATEGORIES).map(([catKey, cat]) => {
              const count = stats.categoryCounts[catKey] || 0;
              const max = Math.max(...Object.values(stats.categoryCounts), 1);
              const percent = Math.round((count / max) * 100);
              return `
                <div class="cat-stat-item">
                  <div class="cat-stat-row">
                    <span>${cat.icon} ${cat.label}</span>
                    <span>${count}</span>
                  </div>
                  <div class="cat-progress-track">
                    <div class="cat-progress-fill" style="width: ${percent}%; background-color: ${cat.color};"></div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>

        <!-- REGISTRO DE ACTIVIDAD (ACTIVITY FEED) -->
        <div class="card">
          <h3 style="font-size: 1.1rem; font-weight: 750; margin-bottom: 16px;">📜 Historial de Actividad</h3>
          <div class="activity-list">
            ${activityLogs.length > 0 ? activityLogs.map(log => {
              const user = this.getUser(log.userId, users);
              const date = new Date(log.timestamp);
              const timeStr = date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
              const dateStr = date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });

              let actionText = '';
              let icon = '⚡';
              if (log.action === 'complete') {
                actionText = `<strong>${user.name}</strong> completó: "${log.taskName}"`;
                icon = '✓';
              } else if (log.action === 'create') {
                actionText = `<strong>${user.name}</strong> creó: "${log.taskName}"`;
                icon = '＋';
              } else if (log.action === 'reassign') {
                actionText = `<strong>${user.name}</strong> reasignó: "${log.taskName}" (${log.details})`;
                icon = '🔄';
              } else if (log.action === 'skip') {
                actionText = `<strong>${user.name}</strong> omitió: "${log.taskName}"`;
                icon = '✕';
              } else {
                actionText = `<strong>${user.name}</strong>: ${log.taskName} (${log.details})`;
              }

              return `
                <div class="activity-item">
                  <span class="activity-icon">${icon}</span>
                  <div class="activity-content">
                    <div class="activity-text">${actionText}</div>
                    <div class="activity-time">${dateStr} · ${timeStr}</div>
                  </div>
                </div>
              `;
            }).join('') : '<div style="color: var(--text-muted);">Aún no hay actividad registrada</div>'}
          </div>
        </div>
      `;

      container.innerHTML = html;
    },

    /**
     * Render Settings (Ajustes)
     */
    renderSettingsView() {
      const container = document.getElementById('view-ajustes');
      if (!container) return;

      const users = storage.getUsers();
      const settings = storage.getSettings();

      const html = `
        <div class="section-title-wrap">
          <div>
            <h2 style="font-size: 1.4rem; font-weight: 800;">Ajustes y Configuración</h2>
            <p style="font-size: 0.88rem; color: var(--text-muted);">Personaliza las personas del hogar, preferencias y copias de seguridad</p>
          </div>
        </div>

        <!-- PERSONAS -->
        <div class="card">
          <h3 style="font-size: 1.1rem; font-weight: 750; margin-bottom: 16px;">👥 Personas que comparten casa</h3>
          
          <form id="form-users-settings">
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px;">
              <!-- Persona 1 -->
              <div style="background: var(--bg-surface-subtle); padding: 14px; border-radius: var(--radius-md);">
                <label class="form-label">Persona 1</label>
                <input type="text" class="form-input" id="user1-name" value="${users[0].name}" style="margin-bottom: 10px;" required />
                <div style="display: flex; gap: 10px; align-items: center;">
                  <label style="font-size: 0.8rem; color: var(--text-muted);">Color:</label>
                  <input type="color" id="user1-color" value="${users[0].color || '#3b82f6'}" style="width: 40px; height: 32px; border: none; border-radius: 4px; cursor: pointer;" />
                  <input type="text" id="user1-avatar" value="${users[0].avatar || '🧑‍💻'}" style="width: 48px; text-align: center;" class="form-input" title="Emoji avatar" />
                </div>
              </div>

              <!-- Persona 2 -->
              <div style="background: var(--bg-surface-subtle); padding: 14px; border-radius: var(--radius-md);">
                <label class="form-label">Persona 2</label>
                <input type="text" class="form-input" id="user2-name" value="${users[1].name}" style="margin-bottom: 10px;" required />
                <div style="display: flex; gap: 10px; align-items: center;">
                  <label style="font-size: 0.8rem; color: var(--text-muted);">Color:</label>
                  <input type="color" id="user2-color" value="${users[1].color || '#10b981'}" style="width: 40px; height: 32px; border: none; border-radius: 4px; cursor: pointer;" />
                  <input type="text" id="user2-avatar" value="${users[1].avatar || '🎨'}" style="width: 48px; text-align: center;" class="form-input" title="Emoji avatar" />
                </div>
              </div>
            </div>

            <button type="submit" class="btn-primary" style="font-size: 0.9rem;">
              Guardar cambios de personas
            </button>
          </form>
        </div>

        <!-- PREFERENCIAS DEL HOGAR -->
        <div class="card">
          <h3 style="font-size: 1.1rem; font-weight: 750; margin-bottom: 16px;">🏠 Casa y Preferencias</h3>
          
          <form id="form-house-settings">
            <div class="form-group">
              <label class="form-label">Nombre del Hogar</label>
              <input type="text" class="form-input" id="house-name" value="${settings.houseName || 'Nuestra Casa 🏠'}" />
            </div>

            <div class="form-group">
              <label class="form-label">Tema Visual</label>
              <select class="form-select" id="theme-selector">
                <option value="light" ${settings.theme === 'light' ? 'selected' : ''}>☀️ Modo Claro</option>
                <option value="dark" ${settings.theme === 'dark' ? 'selected' : ''}>🌙 Modo Oscuro</option>
              </select>
            </div>

            <div class="form-group">
              <label class="form-label">Primer día de la semana</label>
              <select class="form-select" id="start-day-selector">
                <option value="monday" ${settings.startDay === 'monday' ? 'selected' : ''}>Lunes</option>
                <option value="sunday" ${settings.startDay === 'sunday' ? 'selected' : ''}>Domingo</option>
              </select>
            </div>

            <button type="submit" class="btn-primary" style="font-size: 0.9rem;">
              Guardar preferencias
            </button>
          </form>
        </div>

        <!-- BASE DE DATOS Y SINCRONIZACIÓN EN LA NUBE -->
        <div class="card">
          <h3 style="font-size: 1.1rem; font-weight: 750; margin-bottom: 8px;">☁️ Sincronización en la Nube / Base de Datos</h3>
          <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 14px;">
            Permite que ambas personas vean las tareas actualizadas en tiempo real desde sus respectivos móviles y navegadores.
          </p>

          <form id="form-cloud-settings">
            <div class="form-group">
              <label class="form-label">URL del Backend / API (ej. https://tudominio.com/api.php o ./api.php)</label>
              <input type="text" class="form-input" id="cloud-api-url" placeholder="./api.php" value="${storage.getApiUrl() || ''}" />
            </div>

            <div style="display: flex; gap: 10px; align-items: center;">
              <button type="submit" class="btn-primary" style="font-size: 0.9rem;">
                Guardar y Sincronizar
              </button>
              <button type="button" class="btn-secondary btn-force-sync" style="font-size: 0.9rem;">
                🔄 Probar conexión
              </button>
            </div>
          </form>
        </div>

        <!-- GESTIÓN DE DATOS Y BACKUP -->
        <div class="card">
          <h3 style="font-size: 1.1rem; font-weight: 750; margin-bottom: 8px;">💾 Copia de Seguridad y Datos</h3>
          <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 16px;">Exporta o restaura tus tareas e historial en formato JSON.</p>

          <div style="display: flex; flex-wrap: wrap; gap: 10px;">
            <button class="btn-secondary btn-export-data">
              📥 Exportar copia (JSON)
            </button>
            <button class="btn-secondary btn-import-trigger">
              📤 Importar copia (JSON)
            </button>
            <input type="file" id="import-file-input" accept=".json" style="display: none;" />
            
            <button class="btn-secondary btn-reload-demo" style="color: var(--primary);">
              🔄 Restaurar datos de ejemplo
            </button>

            <button class="btn-secondary btn-reset-all" style="color: var(--danger);">
              ⚠️ Restablecer todo a cero
            </button>
          </div>
        </div>
      `;

      container.innerHTML = html;
    }
  };

  window.HogarUI = ui;
})();
