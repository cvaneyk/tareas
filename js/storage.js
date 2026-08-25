/**
 * LocalStorage persistence layer with Cloud / Database API Sync
 */

(function() {
  const { generateId } = window.HogarModels;

  const STORAGE_KEYS = {
    USERS: 'hogar_app_users',
    SETTINGS: 'hogar_app_settings',
    TEMPLATES: 'hogar_app_templates',
    INSTANCES: 'hogar_app_instances',
    ACTIVITY: 'hogar_app_activity',
    LAST_GEN_DATE: 'hogar_app_last_gen',
    API_URL: 'hogar_app_api_url'
  };

  const DEFAULT_USERS = [
    { id: 'user-1', name: 'Persona 1', color: '#3b82f6', avatar: '🧑‍💻' },
    { id: 'user-2', name: 'Persona 2', color: '#10b981', avatar: '🎨' }
  ];

  const DEFAULT_SETTINGS = {
    houseName: 'Nuestra Casa 🏠',
    startDay: 'monday',
    theme: 'light',
    notifications: true,
    syncIntervalSeconds: 15
  };

  const DEFAULT_TEMPLATES = [
    {
      id: 'tmpl_perro',
      name: 'Sacar al perro',
      type: 'recurrent',
      category: 'perro',
      frequency: 'daily',
      frequencyConfig: {},
      defaultAssignee: 'user-1',
      weight: 3,
      estimatedMinutes: 30,
      active: true,
      notes: 'Paseo de mañana y tarde'
    },
    {
      id: 'tmpl_arenero',
      name: 'Limpiar arenero',
      type: 'recurrent',
      category: 'hogar',
      frequency: 'daily',
      frequencyConfig: {},
      defaultAssignee: 'user-1',
      weight: 1,
      estimatedMinutes: 10,
      active: true,
      notes: 'Revisar y reponer arena si es necesario'
    },
    {
      id: 'tmpl_platos',
      name: 'Fregar platos',
      type: 'recurrent',
      category: 'cocina',
      frequency: 'daily',
      frequencyConfig: {},
      defaultAssignee: 'user-2',
      weight: 1,
      estimatedMinutes: 15,
      active: true,
      notes: 'Dejar encimera y fregadero limpios'
    },
    {
      id: 'tmpl_cena',
      name: 'Hacer cena',
      type: 'recurrent',
      category: 'cocina',
      frequency: 'daily',
      frequencyConfig: {},
      defaultAssignee: 'alternate_turn',
      weight: 2,
      estimatedMinutes: 35,
      active: true,
      notes: 'Cocinar y recoger cazuelas'
    },
    {
      id: 'tmpl_ropa',
      name: 'Recoger ropa tendida',
      type: 'recurrent',
      category: 'lavadora',
      frequency: 'daily',
      frequencyConfig: {},
      defaultAssignee: 'user-1',
      weight: 1,
      estimatedMinutes: 10,
      active: true,
      notes: 'Doblar y guardar en armario'
    },
    {
      id: 'tmpl_aspirar',
      name: 'Aspirar la casa',
      type: 'recurrent',
      category: 'limpieza',
      frequency: 'every_2_days',
      frequencyConfig: { intervalDays: 2, anchorDate: '2026-08-25' },
      defaultAssignee: 'user-2',
      weight: 2,
      estimatedMinutes: 20,
      active: true,
      notes: 'Pasar por salón, pasillos y dormitorios'
    },
    {
      id: 'tmpl_lavadora_sug',
      name: 'Poner lavadora (si hace falta)',
      type: 'suggested',
      category: 'lavadora',
      frequency: 'every_2_days',
      frequencyConfig: { intervalDays: 2, anchorDate: '2026-08-25' },
      defaultAssignee: 'user-1',
      weight: 2,
      estimatedMinutes: 15,
      active: true,
      notes: '¿Hay suficiente ropa acumulada?'
    },
    {
      id: 'tmpl_limpieza_grande',
      name: 'Limpieza grande',
      type: 'big_clean',
      category: 'limpieza',
      frequency: 'weekly',
      frequencyConfig: { dayOfWeek: 0 },
      defaultAssignee: 'user-1',
      weight: 4,
      estimatedMinutes: 120,
      active: true,
      notes: 'Limpieza a fondo del fin de semana',
      subtasks: [
        { id: 'sub_sabanas', name: 'Cambiar sábanas', defaultAssignee: 'user-1' },
        { id: 'sub_terraza', name: 'Limpiar terraza', defaultAssignee: 'user-1' },
        { id: 'sub_lav_grande', name: 'Poner lavadora sábanas', defaultAssignee: 'user-1' },
        { id: 'sub_asp_fondo', name: 'Aspirar a fondo', defaultAssignee: 'user-2' },
        { id: 'sub_fregar', name: 'Fregar suelos', defaultAssignee: 'user-2' },
        { id: 'sub_polvo', name: 'Limpiar polvo muebles', defaultAssignee: 'user-2' },
        { id: 'sub_bano', name: 'Limpiar baño completo', defaultAssignee: 'user-2' }
      ]
    },
    {
      id: 'tmpl_chapuza',
      name: 'Chapuza del fin de semana',
      type: 'chapuza',
      category: 'chapuzas',
      frequency: 'weekly',
      frequencyConfig: { dayOfWeek: 6 },
      defaultAssignee: 'user-2',
      weight: 3,
      estimatedMinutes: 45,
      active: true,
      notes: 'Arreglar puerta del armario - Revisar bisagra'
    }
  ];

  const storage = {
    getApiUrl() {
      const customUrl = localStorage.getItem(STORAGE_KEYS.API_URL);
      if (customUrl) return customUrl;
      // Auto-detect api.php if running on http/https
      if (window.location.protocol.startsWith('http')) {
        return './api.php';
      }
      return null;
    },

    setApiUrl(url) {
      if (url) {
        localStorage.setItem(STORAGE_KEYS.API_URL, url);
      } else {
        localStorage.removeItem(STORAGE_KEYS.API_URL);
      }
    },

    getUsers() {
      const raw = localStorage.getItem(STORAGE_KEYS.USERS);
      return raw ? JSON.parse(raw) : DEFAULT_USERS;
    },

    saveUsers(users) {
      localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(users));
      this.syncUsersToCloud(users);
    },

    getSettings() {
      const raw = localStorage.getItem(STORAGE_KEYS.SETTINGS);
      return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : DEFAULT_SETTINGS;
    },

    saveSettings(settings) {
      localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
    },

    getTemplates() {
      const raw = localStorage.getItem(STORAGE_KEYS.TEMPLATES);
      return raw ? JSON.parse(raw) : DEFAULT_TEMPLATES;
    },

    saveTemplates(templates) {
      localStorage.setItem(STORAGE_KEYS.TEMPLATES, JSON.stringify(templates));
    },

    getInstances() {
      const raw = localStorage.getItem(STORAGE_KEYS.INSTANCES);
      return raw ? JSON.parse(raw) : [];
    },

    saveInstances(instances) {
      localStorage.setItem(STORAGE_KEYS.INSTANCES, JSON.stringify(instances));
    },

    saveSingleTask(task) {
      const instances = this.getInstances();
      const idx = instances.findIndex(i => i.id === task.id);
      if (idx >= 0) {
        instances[idx] = task;
      } else {
        instances.push(task);
      }
      this.saveInstances(instances);
      this.syncTaskToCloud(task);
    },

    getActivityLog() {
      const raw = localStorage.getItem(STORAGE_KEYS.ACTIVITY);
      return raw ? JSON.parse(raw) : [];
    },

    logActivity(userId, action, taskName, details = '') {
      const logs = this.getActivityLog();
      const newEntry = {
        id: generateId('log'),
        timestamp: new Date().toISOString(),
        userId,
        action,
        taskName,
        details
      };
      const updated = [newEntry, ...logs].slice(0, 200);
      localStorage.setItem(STORAGE_KEYS.ACTIVITY, JSON.stringify(updated));
      this.syncActivityToCloud(newEntry);
      return newEntry;
    },

    // ----------------------------------------------------------------------
    // CLOUD SYNC METHODS (Para sincronización móvil <-> navegador)
    // ----------------------------------------------------------------------
    async syncFromCloud() {
      const apiUrl = this.getApiUrl();
      if (!apiUrl) return { success: false, reason: 'no_api' };

      try {
        const res = await fetch(`${apiUrl}?action=get_all`, { cache: 'no-store' });
        if (!res.ok) {
          const errBody = await res.json().catch(() => null);
          const detailMsg = errBody?.details || errBody?.error || `HTTP ${res.status}`;
          throw new Error(detailMsg);
        }
        const data = await res.json();

        if (data.users && data.users.length > 0) {
          localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(data.users));
        }
        if (data.instances && data.instances.length > 0) {
          localStorage.setItem(STORAGE_KEYS.INSTANCES, JSON.stringify(data.instances));
        } else {
          const localInst = this.getInstances();
          if (localInst.length > 0) {
            this.syncBatchToCloud(localInst);
          }
        }
        if (data.templates && data.templates.length > 0) {
          localStorage.setItem(STORAGE_KEYS.TEMPLATES, JSON.stringify(data.templates));
        }
        if (data.activityLog && data.activityLog.length > 0) {
          localStorage.setItem(STORAGE_KEYS.ACTIVITY, JSON.stringify(data.activityLog));
        }

        return { success: true };
      } catch (err) {
        return { success: false, error: err.message };
      }
    },

    async syncBatchToCloud(instances) {
      const apiUrl = this.getApiUrl();
      if (!apiUrl || !instances || instances.length === 0) return;
      try {
        await fetch(`${apiUrl}?action=save_instances_batch`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(instances)
        });
      } catch (err) {
        console.warn('Batch sync failed:', err);
      }
    },

    async syncTaskToCloud(task) {
      const apiUrl = this.getApiUrl();
      if (!apiUrl) return;
      try {
        await fetch(`${apiUrl}?action=save_task`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(task)
        });
      } catch (err) {
        console.warn('Sync task failed:', err);
      }
    },

    async syncActivityToCloud(logEntry) {
      const apiUrl = this.getApiUrl();
      if (!apiUrl) return;
      try {
        await fetch(`${apiUrl}?action=log_activity`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(logEntry)
        });
      } catch (err) {
        console.warn('Sync log failed:', err);
      }
    },

    async syncUsersToCloud(users) {
      const apiUrl = this.getApiUrl();
      if (!apiUrl) return;
      try {
        await fetch(`${apiUrl}?action=save_users`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(users)
        });
      } catch (err) {
        console.warn('Sync users failed:', err);
      }
    },

    exportDataJSON() {
      const data = {
        version: 1,
        exportedAt: new Date().toISOString(),
        users: this.getUsers(),
        settings: this.getSettings(),
        templates: this.getTemplates(),
        instances: this.getInstances(),
        activityLog: this.getActivityLog()
      };
      return JSON.stringify(data, null, 2);
    },

    importDataJSON(jsonString) {
      try {
        const data = JSON.parse(jsonString);
        if (data.users) this.saveUsers(data.users);
        if (data.settings) this.saveSettings(data.settings);
        if (data.templates) this.saveTemplates(data.templates);
        if (data.instances) this.saveInstances(data.instances);
        if (data.activityLog) localStorage.setItem(STORAGE_KEYS.ACTIVITY, JSON.stringify(data.activityLog));
        return { success: true };
      } catch (err) {
        return { success: false, error: err.message };
      }
    },

    initStorage() {
      if (!localStorage.getItem(STORAGE_KEYS.USERS)) {
        this.saveUsers(DEFAULT_USERS);
      }
      if (!localStorage.getItem(STORAGE_KEYS.SETTINGS)) {
        this.saveSettings(DEFAULT_SETTINGS);
      }
      if (!localStorage.getItem(STORAGE_KEYS.TEMPLATES)) {
        this.saveTemplates(DEFAULT_TEMPLATES);
      }
    },

    resetAllData() {
      localStorage.removeItem(STORAGE_KEYS.USERS);
      localStorage.removeItem(STORAGE_KEYS.SETTINGS);
      localStorage.removeItem(STORAGE_KEYS.TEMPLATES);
      localStorage.removeItem(STORAGE_KEYS.INSTANCES);
      localStorage.removeItem(STORAGE_KEYS.ACTIVITY);
      localStorage.removeItem(STORAGE_KEYS.LAST_GEN_DATE);
      this.initStorage();
    }
  };

  window.HogarStorage = storage;
})();
