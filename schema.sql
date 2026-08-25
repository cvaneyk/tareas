-- ==============================================================================
-- SCHEMA DE BASE DE DATOS: HOGAR — TAREAS COMPARTIDAS (2 PERSONAS)
-- Compatible con: PostgreSQL, MySQL / MariaDB, Supabase, SQLite
-- ==============================================================================

-- 1. TABLA: USUARIOS (USERS)
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    color VARCHAR(20) NOT NULL DEFAULT '#3b82f6',
    avatar VARCHAR(20) NOT NULL DEFAULT '🧑‍💻',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. TABLA: AJUSTES DEL HOGAR (SETTINGS)
CREATE TABLE IF NOT EXISTS house_settings (
    id VARCHAR(50) PRIMARY KEY DEFAULT 'default',
    house_name VARCHAR(150) NOT NULL DEFAULT 'Nuestra Casa 🏠',
    start_day VARCHAR(20) NOT NULL DEFAULT 'monday',
    theme VARCHAR(20) NOT NULL DEFAULT 'light',
    notifications BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. TABLA: PLANTILLAS DE TAREAS RECURRENTES (TASK_TEMPLATES)
CREATE TABLE IF NOT EXISTS task_templates (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL DEFAULT 'recurrent', -- 'recurrent', 'single', 'chapuza', 'big_clean', 'suggested'
    category VARCHAR(50) NOT NULL DEFAULT 'hogar',  -- 'limpieza', 'cocina', 'lavadora', 'perro', 'chapuzas', 'compras', 'hogar'
    frequency VARCHAR(50) NOT NULL DEFAULT 'daily', -- 'daily', 'every_2_days', 'every_x_days', 'weekly', 'custom_days', 'suggested'
    frequency_config JSON,                         -- Parámetros adicionales en formato JSON: { "intervalDays": 2, "dayOfWeek": 0, "anchorDate": "2026-08-25" }
    default_assignee VARCHAR(50) NOT NULL DEFAULT 'user-1', -- 'user-1', 'user-2', 'alternate_weekly', 'alternate_turn'
    weight INT NOT NULL DEFAULT 1,                 -- 1 (Ligera), 2 (Media), 3 (Pesada), 4 (Muy pesada)
    estimated_minutes INT NOT NULL DEFAULT 15,     -- Tiempo estimado en minutos
    notes TEXT,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. TABLA: INSTANCIAS DE TAREAS (TASK_INSTANCES)
CREATE TABLE IF NOT EXISTS task_instances (
    id VARCHAR(50) PRIMARY KEY,
    template_id VARCHAR(50),
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL DEFAULT 'single',
    category VARCHAR(50) NOT NULL DEFAULT 'hogar',
    assigned_to VARCHAR(50) NOT NULL,
    due_date DATE NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending', -- 'pending', 'completed', 'skipped'
    weight INT NOT NULL DEFAULT 1,
    estimated_minutes INT NOT NULL DEFAULT 15,
    priority VARCHAR(20),                          -- 'low', 'medium', 'high' (para chapuzas)
    notes TEXT,
    week_id VARCHAR(20) NOT NULL,                  -- ej: '2026-W35'
    completed_at TIMESTAMP NULL,
    completed_by VARCHAR(50) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_task_user FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_task_template FOREIGN KEY (template_id) REFERENCES task_templates(id) ON DELETE SET NULL
);

-- 5. TABLA: SUBTAREAS (SUBTASKS) - Para "Limpieza grande"
CREATE TABLE IF NOT EXISTS subtasks (
    id VARCHAR(50) PRIMARY KEY,
    parent_task_id VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    assigned_to VARCHAR(50) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending', -- 'pending', 'completed'
    completed_at TIMESTAMP NULL,
    completed_by VARCHAR(50) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_subtask_parent FOREIGN KEY (parent_task_id) REFERENCES task_instances(id) ON DELETE CASCADE,
    CONSTRAINT fk_subtask_user FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE CASCADE
);

-- 6. TABLA: REGISTRO DE ACTIVIDAD (ACTIVITY_LOG)
CREATE TABLE IF NOT EXISTS activity_log (
    id VARCHAR(50) PRIMARY KEY,
    user_id VARCHAR(50) NOT NULL,
    action VARCHAR(50) NOT NULL,                   -- 'complete', 'uncomplete', 'create', 'reassign', 'reschedule', 'skip'
    task_name VARCHAR(255) NOT NULL,
    details TEXT,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_log_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ==============================================================================
-- ÍNDICES PARA ALTO RENDIMIENTO
-- ==============================================================================
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON task_instances (due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_week_id ON task_instances (week_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON task_instances (status);
CREATE INDEX IF NOT EXISTS idx_subtasks_parent ON subtasks (parent_task_id);
CREATE INDEX IF NOT EXISTS idx_activity_timestamp ON activity_log (timestamp DESC);

-- ==============================================================================
-- DATOS INICIALES POR DEFECTO (SEED DATA)
-- ==============================================================================

-- 1. Insertar las 2 personas
INSERT INTO users (id, name, color, avatar) VALUES 
('user-1', 'Persona 1', '#3b82f6', '🧑‍💻'),
('user-2', 'Persona 2', '#10b981', '🎨')
ON CONFLICT (id) DO NOTHING;

-- 2. Insertar ajustes del hogar
INSERT INTO house_settings (id, house_name, start_day, theme, notifications) VALUES 
('default', 'Nuestra Casa 🏠', 'monday', 'light', TRUE)
ON CONFLICT (id) DO NOTHING;

-- 3. Insertar plantillas predeterminadas
INSERT INTO task_templates (id, name, type, category, frequency, frequency_config, default_assignee, weight, estimated_minutes, notes, active) VALUES 
('tmpl_perro', 'Sacar al perro', 'recurrent', 'perro', 'daily', '{}', 'user-1', 3, 30, 'Paseo de mañana y tarde', TRUE),
('tmpl_arenero', 'Limpiar arenero', 'recurrent', 'hogar', 'daily', '{}', 'user-1', 1, 10, 'Revisar y reponer arena si es necesario', TRUE),
('tmpl_platos', 'Fregar platos', 'recurrent', 'cocina', 'daily', '{}', 'user-2', 1, 15, 'Dejar encimera y fregadero limpios', TRUE),
('tmpl_cena', 'Hacer cena', 'recurrent', 'cocina', 'daily', '{}', 'alternate_turn', 2, 35, 'Cocinar y recoger cazuelas', TRUE),
('tmpl_ropa', 'Recoger ropa tendida', 'recurrent', 'lavadora', 'daily', '{}', 'user-1', 1, 10, 'Doblar y guardar en armario', TRUE),
('tmpl_aspirar', 'Aspirar la casa', 'recurrent', 'limpieza', 'every_2_days', '{"intervalDays": 2, "anchorDate": "2026-08-25"}', 'user-2', 2, 20, 'Pasar por salón, pasillos y dormitorios', TRUE),
('tmpl_lavadora_sug', 'Poner lavadora (si hace falta)', 'suggested', 'lavadora', 'every_2_days', '{"intervalDays": 2, "anchorDate": "2026-08-25"}', 'user-1', 2, 15, '¿Hay suficiente ropa acumulada?', TRUE),
('tmpl_limpieza_grande', 'Limpieza grande', 'big_clean', 'limpieza', 'weekly', '{"dayOfWeek": 0}', 'user-1', 4, 120, 'Limpieza a fondo del fin de semana', TRUE),
('tmpl_chapuza', 'Chapuza del fin de semana', 'chapuza', 'chapuzas', 'weekly', '{"dayOfWeek": 6}', 'user-2', 3, 45, 'Arreglar puerta del armario - Revisar bisagra', TRUE)
ON CONFLICT (id) DO NOTHING;
