/**
 * Core engine: Recurrence generator, alternation rules, fairness & points metrics
 */

(function() {
  const { generateId, getWeekId, formatDateISO } = window.HogarModels;
  const storage = window.HogarStorage;

  const engine = {
    /**
     * Returns array of 7 Date objects for the given week
     */
    getWeekDates(baseDate = new Date(), startDay = 'monday') {
      const d = new Date(baseDate);
      const day = d.getDay(); // 0 is Sunday
      const diff = (day === 0 ? -6 : 1) - day;
      const monday = new Date(d);
      monday.setDate(d.getDate() + diff);
      monday.setHours(0, 0, 0, 0);

      const week = [];
      for (let i = 0; i < 7; i++) {
        const dayDate = new Date(monday);
        dayDate.setDate(monday.getDate() + i);
        week.push(dayDate);
      }
      return week;
    },

    /**
     * Determine assignee based on template configuration and date
     */
    determineAssignee(template, date) {
      const { defaultAssignee } = template;
      if (defaultAssignee === 'user-1' || defaultAssignee === 'user-2') {
        return defaultAssignee;
      }

      if (defaultAssignee === 'alternate_weekly') {
        const weekId = getWeekId(date);
        const weekNum = parseInt(weekId.split('-W')[1], 10) || 1;
        return weekNum % 2 === 0 ? 'user-1' : 'user-2';
      }

      if (defaultAssignee === 'alternate_turn') {
        const dayIndex = Math.floor(date.getTime() / (1000 * 60 * 60 * 24));
        return dayIndex % 2 === 0 ? 'user-1' : 'user-2';
      }

      return 'user-1';
    },

    /**
     * Check if a template should trigger on a specific date
     */
    shouldTriggerOnDate(template, date) {
      const dayOfWeek = date.getDay();
      const anchor = new Date(template.frequencyConfig?.anchorDate || '2026-08-25');
      anchor.setHours(0, 0, 0, 0);

      const diffDays = Math.floor((date.getTime() - anchor.getTime()) / (1000 * 60 * 60 * 24));

      switch (template.frequency) {
        case 'daily':
          return true;
        case 'every_2_days':
          return Math.abs(diffDays) % 2 === 0;
        case 'every_x_days': {
          const interval = template.frequencyConfig?.intervalDays || 2;
          return Math.abs(diffDays) % interval === 0;
        }
        case 'weekly': {
          const targetDay = template.frequencyConfig?.dayOfWeek ?? anchor.getDay();
          return dayOfWeek === targetDay;
        }
        case 'custom_days': {
          const days = template.frequencyConfig?.daysOfWeek || [];
          return days.includes(dayOfWeek);
        }
        case 'suggested':
          return Math.abs(diffDays) % 2 === 0;
        default:
          return false;
      }
    },

    /**
     * Generate tasks for a specific week based on active templates
     */
    generateWeekTasks(targetDate = new Date()) {
      const weekDates = this.getWeekDates(targetDate);
      const templates = storage.getTemplates().filter(t => t.active !== false);
      const instances = storage.getInstances();
      const weekId = getWeekId(weekDates[0]);

      const newInstances = [...instances];
      const newlyCreated = [];
      let createdCount = 0;

      for (const date of weekDates) {
        const dateStr = formatDateISO(date);

        for (const tmpl of templates) {
          if (this.shouldTriggerOnDate(tmpl, date)) {
            const exists = instances.some(
              inst => inst.templateId === tmpl.id && inst.dueDate === dateStr
            );

            if (!exists) {
              const assignee = this.determineAssignee(tmpl, date);
              
              const subtasks = (tmpl.subtasks || []).map((sub, idx) => ({
                id: generateId(`sub_${idx}`),
                name: sub.name,
                assignedTo: sub.defaultAssignee || assignee,
                status: 'pending',
                completedAt: null,
                completedBy: null
              }));

              const newInst = {
                id: generateId('task'),
                templateId: tmpl.id,
                name: tmpl.name,
                type: tmpl.type,
                category: tmpl.category,
                assignedTo: assignee,
                dueDate: dateStr,
                status: 'pending',
                weight: tmpl.weight || 1,
                estimatedMinutes: tmpl.estimatedMinutes || 15,
                completedAt: null,
                completedBy: null,
                weekId: weekId,
                notes: tmpl.notes || '',
                priority: tmpl.type === 'chapuza' ? 'medium' : undefined,
                subtasks: subtasks
              };

              newInstances.push(newInst);
              newlyCreated.push(newInst);
              createdCount++;
            }
          }
        }
      }

      if (createdCount > 0) {
        storage.saveInstances(newInstances);
        storage.syncBatchToCloud(newlyCreated);
      }

      return { weekId, createdCount };
    },

    /**
     * Calculate stats for a given list of task instances
     */
    calculateStats(instances, users) {
      const user1Id = users[0]?.id || 'user-1';
      const user2Id = users[1]?.id || 'user-2';

      let totalTasks = 0;
      let completedTasks = 0;
      let skippedTasks = 0;
      let pendingTasks = 0;

      let user1TasksDone = 0;
      let user2TasksDone = 0;

      let user1PointsDone = 0;
      let user2PointsDone = 0;

      let user1PointsTotal = 0;
      let user2PointsTotal = 0;

      let user1MinutesDone = 0;
      let user2MinutesDone = 0;

      const categoryCounts = {};

      for (const task of instances) {
        if (task.status === 'skipped') {
          skippedTasks++;
          continue;
        }

        totalTasks++;
        const weight = task.weight || 1;
        const minutes = task.estimatedMinutes || 0;
        const cat = task.category || 'hogar';

        categoryCounts[cat] = (categoryCounts[cat] || 0) + (task.status === 'completed' ? 1 : 0);

        if (task.assignedTo === user1Id) user1PointsTotal += weight;
        else if (task.assignedTo === user2Id) user2PointsTotal += weight;

        if (task.status === 'completed') {
          completedTasks++;
          const completedBy = task.completedBy || task.assignedTo;
          if (completedBy === user1Id) {
            user1TasksDone++;
            user1PointsDone += weight;
            user1MinutesDone += minutes;
          } else if (completedBy === user2Id) {
            user2TasksDone++;
            user2PointsDone += weight;
            user2MinutesDone += minutes;
          }
        } else {
          pendingTasks++;
        }
      }

      const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
      const totalPoints = user1PointsDone + user2PointsDone;
      const user1PointsPercent = totalPoints > 0 ? Math.round((user1PointsDone / totalPoints) * 100) : 50;
      const user2PointsPercent = totalPoints > 0 ? (100 - user1PointsPercent) : 50;

      return {
        totalTasks,
        completedTasks,
        skippedTasks,
        pendingTasks,
        completionRate,
        user1: {
          id: user1Id,
          tasksDone: user1TasksDone,
          pointsDone: user1PointsDone,
          pointsPercent: user1PointsPercent,
          minutesDone: user1MinutesDone
        },
        user2: {
          id: user2Id,
          tasksDone: user2TasksDone,
          pointsDone: user2PointsDone,
          pointsPercent: user2PointsPercent,
          minutesDone: user2MinutesDone
        },
        categoryCounts
      };
    },

    /**
     * Seed demo past weeks and current week with realistic data matching the design brief
     */
    seedDemoData() {
      const users = storage.getUsers();
      const templates = storage.getTemplates();
      const instances = [];
      const activityLog = [];

      const baseDate = new Date('2026-08-25T12:00:00');
      const curWeek = this.getWeekDates(baseDate);
      const curWeekId = getWeekId(curWeek[0]);

      // Populate current week
      for (let dayIdx = 0; dayIdx < curWeek.length; dayIdx++) {
        const date = curWeek[dayIdx];
        const dateStr = formatDateISO(date);

        for (const tmpl of templates) {
          if (this.shouldTriggerOnDate(tmpl, date)) {
            const assignee = this.determineAssignee(tmpl, date);
            
            const subtasks = (tmpl.subtasks || []).map((sub, idx) => ({
              id: generateId(`sub_${idx}`),
              name: sub.name,
              assignedTo: sub.defaultAssignee || assignee,
              status: 'pending',
              completedAt: null,
              completedBy: null
            }));

            let isCompleted = false;
            let completedAt = null;
            let completedBy = null;

            if (dayIdx === 0) { // Monday
              isCompleted = true;
              completedAt = `${dateStr}T19:30:00.000Z`;
              completedBy = assignee;
            } else if (dayIdx === 1) { // Tuesday (Today)
              if (tmpl.id === 'tmpl_perro' || tmpl.id === 'tmpl_platos') {
                isCompleted = true;
                completedAt = `${dateStr}T19:20:00.000Z`;
                completedBy = assignee;
              }
            }

            const inst = {
              id: generateId('task'),
              templateId: tmpl.id,
              name: tmpl.name,
              type: tmpl.type,
              category: tmpl.category,
              assignedTo: assignee,
              dueDate: dateStr,
              status: isCompleted ? 'completed' : 'pending',
              weight: tmpl.weight || 1,
              estimatedMinutes: tmpl.estimatedMinutes || 15,
              completedAt: completedAt,
              completedBy: completedBy,
              weekId: curWeekId,
              notes: tmpl.notes || '',
              priority: tmpl.type === 'chapuza' ? 'medium' : undefined,
              subtasks: subtasks
            };

            instances.push(inst);
          }
        }
      }

      activityLog.push(
        {
          id: generateId('log'),
          timestamp: '2026-08-25T19:42:00.000Z',
          userId: 'user-2',
          action: 'complete',
          taskName: 'Fregar platos',
          details: 'Completado a tiempo'
        },
        {
          id: generateId('log'),
          timestamp: '2026-08-25T19:20:00.000Z',
          userId: 'user-1',
          action: 'complete',
          taskName: 'Sacar al perro',
          details: 'Paseo de la tarde completado'
        },
        {
          id: generateId('log'),
          timestamp: '2026-08-25T18:54:00.000Z',
          userId: 'user-1',
          action: 'create',
          taskName: 'Comprar bombilla para el baño',
          details: 'Tarea única añadida'
        },
        {
          id: generateId('log'),
          timestamp: '2026-08-25T18:30:00.000Z',
          userId: 'user-2',
          action: 'reassign',
          taskName: 'Aspirar la casa',
          details: 'Reasignado: Persona 1 → Persona 2'
        }
      );

      // Past weeks
      const pastWeeksOffset = [-7, -14, -21];
      const pastStatsTargets = [0.91, 0.68, 0.94];

      pastWeeksOffset.forEach((offsetDays, weekIdx) => {
        const pastDate = new Date(baseDate);
        pastDate.setDate(baseDate.getDate() + offsetDays);
        const weekDates = this.getWeekDates(pastDate);
        const pastWeekId = getWeekId(weekDates[0]);
        const targetRate = pastStatsTargets[weekIdx];

        for (const date of weekDates) {
          const dateStr = formatDateISO(date);
          for (const tmpl of templates) {
            if (this.shouldTriggerOnDate(tmpl, date)) {
              const assignee = this.determineAssignee(tmpl, date);
              const isCompleted = Math.random() < targetRate;
              const isSkipped = !isCompleted && tmpl.type === 'suggested';

              const subtasks = (tmpl.subtasks || []).map((sub, idx) => ({
                id: generateId(`sub_${idx}`),
                name: sub.name,
                assignedTo: sub.defaultAssignee || assignee,
                status: isCompleted ? 'completed' : 'pending',
                completedAt: isCompleted ? `${dateStr}T12:00:00.000Z` : null,
                completedBy: sub.defaultAssignee || assignee
              }));

              instances.push({
                id: generateId('task'),
                templateId: tmpl.id,
                name: tmpl.name,
                type: tmpl.type,
                category: tmpl.category,
                assignedTo: assignee,
                dueDate: dateStr,
                status: isSkipped ? 'skipped' : (isCompleted ? 'completed' : 'pending'),
                weight: tmpl.weight || 1,
                estimatedMinutes: tmpl.estimatedMinutes || 15,
                completedAt: isCompleted ? `${dateStr}T18:00:00.000Z` : null,
                completedBy: isCompleted ? assignee : null,
                weekId: pastWeekId,
                notes: tmpl.notes || '',
                priority: tmpl.type === 'chapuza' ? 'medium' : undefined,
                subtasks: subtasks
              });
            }
          }
        }
      });

      storage.saveInstances(instances);
      localStorage.setItem('hogar_app_activity', JSON.stringify(activityLog));
    }
  };

  window.HogarEngine = engine;
})();
