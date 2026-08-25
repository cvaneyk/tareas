<?php
/**
 * Backend API REST ligero para Hogar — Tareas Compartidas
 * Compatible con: SQLite (automático sin configuración) y MySQL / MariaDB
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

// --------------------------------------------------------------------------
// CONFIGURACIÓN DE BASE DE DATOS
// --------------------------------------------------------------------------
// Por defecto usa SQLite local (archivo hogar.sqlite creado automáticamente)
// Si prefieres MySQL, descomenta las líneas siguientes:

/*
$DB_TYPE = 'mysql';
$DB_HOST = 'localhost';
$DB_NAME = 'hogar_db';
$DB_USER = 'tu_usuario';
$DB_PASS = 'tu_contrasena';
*/

$DB_TYPE = 'sqlite';
$DB_FILE = __DIR__ . '/hogar.sqlite';

try {
    if ($DB_TYPE === 'sqlite') {
        $pdo = new PDO("sqlite:" . $DB_FILE);
    } else {
        $pdo = new PDO("mysql:host={$DB_HOST};dbname={$DB_NAME};charset=utf8mb4", $DB_USER, $DB_PASS);
    }
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Error de conexión a la base de datos: ' . $e->getMessage()]);
    exit;
}

// Inicializar tablas automáticamente en SQLite si no existen
if ($DB_TYPE === 'sqlite') {
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            color TEXT NOT NULL DEFAULT '#3b82f6',
            avatar TEXT NOT NULL DEFAULT '🧑‍💻',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS house_settings (
            id TEXT PRIMARY KEY DEFAULT 'default',
            house_name TEXT NOT NULL DEFAULT 'Nuestra Casa 🏠',
            start_day TEXT NOT NULL DEFAULT 'monday',
            theme TEXT NOT NULL DEFAULT 'light',
            notifications INTEGER NOT NULL DEFAULT 1,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS task_templates (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            type TEXT NOT NULL DEFAULT 'recurrent',
            category TEXT NOT NULL DEFAULT 'hogar',
            frequency TEXT NOT NULL DEFAULT 'daily',
            frequency_config TEXT,
            default_assignee TEXT NOT NULL DEFAULT 'user-1',
            weight INTEGER NOT NULL DEFAULT 1,
            estimated_minutes INTEGER NOT NULL DEFAULT 15,
            notes TEXT,
            active INTEGER NOT NULL DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS task_instances (
            id TEXT PRIMARY KEY,
            template_id TEXT,
            name TEXT NOT NULL,
            type TEXT NOT NULL DEFAULT 'single',
            category TEXT NOT NULL DEFAULT 'hogar',
            assigned_to TEXT NOT NULL,
            due_date TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            weight INTEGER NOT NULL DEFAULT 1,
            estimated_minutes INTEGER NOT NULL DEFAULT 15,
            priority TEXT,
            notes TEXT,
            week_id TEXT NOT NULL,
            completed_at TEXT,
            completed_by TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS subtasks (
            id TEXT PRIMARY KEY,
            parent_task_id TEXT NOT NULL,
            name TEXT NOT NULL,
            assigned_to TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            completed_at TEXT,
            completed_by TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS activity_log (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            action TEXT NOT NULL,
            task_name TEXT NOT NULL,
            details TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    ");

    // Verificar si hay usuarios, si no, sembrar datos
    $userCount = $pdo->query("SELECT COUNT(*) FROM users")->fetchColumn();
    if ($userCount == 0) {
        $pdo->exec("
            INSERT INTO users (id, name, color, avatar) VALUES 
            ('user-1', 'Persona 1', '#3b82f6', '🧑‍💻'),
            ('user-2', 'Persona 2', '#10b981', '🎨');

            INSERT INTO house_settings (id, house_name, start_day, theme, notifications) VALUES 
            ('default', 'Nuestra Casa 🏠', 'monday', 'light', 1);

            INSERT INTO task_templates (id, name, type, category, frequency, frequency_config, default_assignee, weight, estimated_minutes, notes, active) VALUES 
            ('tmpl_perro', 'Sacar al perro', 'recurrent', 'perro', 'daily', '{}', 'user-1', 3, 30, 'Paseo de mañana y tarde', 1),
            ('tmpl_arenero', 'Limpiar arenero', 'recurrent', 'hogar', 'daily', '{}', 'user-1', 1, 10, 'Revisar y reponer arena si es necesario', 1),
            ('tmpl_platos', 'Fregar platos', 'recurrent', 'cocina', 'daily', '{}', 'user-2', 1, 15, 'Dejar encimera y fregadero limpios', 1),
            ('tmpl_cena', 'Hacer cena', 'recurrent', 'cocina', 'daily', '{}', 'alternate_turn', 2, 35, 'Cocinar y recoger cazuelas', 1),
            ('tmpl_ropa', 'Recoger ropa tendida', 'recurrent', 'lavadora', 'daily', '{}', 'user-1', 1, 10, 'Doblar y guardar en armario', 1),
            ('tmpl_aspirar', 'Aspirar la casa', 'recurrent', 'limpieza', 'every_2_days', '{\"intervalDays\": 2, \"anchorDate\": \"2026-08-25\"}', 'user-2', 2, 20, 'Pasar por salón, pasillos y dormitorios', 1),
            ('tmpl_lavadora_sug', 'Poner lavadora (si hace falta)', 'suggested', 'lavadora', 'every_2_days', '{\"intervalDays\": 2, \"anchorDate\": \"2026-08-25\"}', 'user-1', 2, 15, '¿Hay suficiente ropa acumulada?', 1),
            ('tmpl_limpieza_grande', 'Limpieza grande', 'big_clean', 'limpieza', 'weekly', '{\"dayOfWeek\": 0}', 'user-1', 4, 120, 'Limpieza a fondo del fin de semana', 1),
            ('tmpl_chapuza', 'Chapuza del fin de semana', 'chapuza', 'chapuzas', 'weekly', '{\"dayOfWeek\": 6}', 'user-2', 3, 45, 'Arreglar puerta del armario - Revisar bisagra', 1);
        ");
    }
}

// --------------------------------------------------------------------------
// RUTAS DE LA API
// --------------------------------------------------------------------------
$action = $_GET['action'] ?? 'get_all';
$input = json_decode(file_get_contents('php://input'), true) ?? [];

switch ($action) {
    // Obtener todos los datos sincronizados para la app
    case 'get_all':
        $users = $pdo->query("SELECT * FROM users")->fetchAll();
        $settings = $pdo->query("SELECT * FROM house_settings WHERE id = 'default'")->fetch() ?: [];
        $templates = $pdo->query("SELECT * FROM task_templates")->fetchAll();
        $instances = $pdo->query("SELECT * FROM task_instances ORDER BY due_date ASC")->fetchAll();
        $subtasks = $pdo->query("SELECT * FROM subtasks")->fetchAll();
        $activity = $pdo->query("SELECT * FROM activity_log ORDER BY timestamp DESC LIMIT 100")->fetchAll();

        // Agrupar subtareas dentro de sus instancias de tarea correspondientes
        $subtasksByParent = [];
        foreach ($subtasks as $sub) {
            $subtasksByParent[$sub['parent_task_id']][] = [
                'id' => $sub['id'],
                'name' => $sub['name'],
                'assignedTo' => $sub['assigned_to'],
                'status' => $sub['status'],
                'completedAt' => $sub['completed_at'],
                'completedBy' => $sub['completed_by']
            ];
        }

        $formattedInstances = [];
        foreach ($instances as $inst) {
            $inst['assignedTo'] = $inst['assigned_to'];
            $inst['dueDate'] = $inst['due_date'];
            $inst['estimatedMinutes'] = (int)$inst['estimated_minutes'];
            $inst['weight'] = (int)$inst['weight'];
            $inst['weekId'] = $inst['week_id'];
            $inst['completedAt'] = $inst['completed_at'];
            $inst['completedBy'] = $inst['completed_by'];
            $inst['templateId'] = $inst['template_id'];
            $inst['subtasks'] = $subtasksByParent[$inst['id']] ?? [];
            $formattedInstances[] = $inst;
        }

        echo json_encode([
            'users' => $users,
            'settings' => $settings,
            'templates' => $templates,
            'instances' => $formattedInstances,
            'activityLog' => $activity
        ]);
        break;

    // Sincronizar / guardar estado de una tarea
    case 'save_task':
        $task = $input;
        if (empty($task['id'])) {
            http_response_code(400);
            echo json_encode(['error' => 'Falta id de la tarea']);
            exit;
        }

        $stmt = $pdo->prepare("
            INSERT INTO task_instances (id, template_id, name, type, category, assigned_to, due_date, status, weight, estimated_minutes, priority, notes, week_id, completed_at, completed_by)
            VALUES (:id, :template_id, :name, :type, :category, :assigned_to, :due_date, :status, :weight, :estimated_minutes, :priority, :notes, :week_id, :completed_at, :completed_by)
            ON CONFLICT (id) DO UPDATE SET
                status = excluded.status,
                assigned_to = excluded.assigned_to,
                due_date = excluded.due_date,
                notes = excluded.notes,
                completed_at = excluded.completed_at,
                completed_by = excluded.completed_by
        ");

        $stmt->execute([
            ':id' => $task['id'],
            ':template_id' => $task['templateId'] ?? null,
            ':name' => $task['name'],
            ':type' => $task['type'] ?? 'single',
            ':category' => $task['category'] ?? 'hogar',
            ':assigned_to' => $task['assignedTo'],
            ':due_date' => $task['dueDate'],
            ':status' => $task['status'] ?? 'pending',
            ':weight' => $task['weight'] ?? 1,
            ':estimated_minutes' => $task['estimatedMinutes'] ?? 15,
            ':priority' => $task['priority'] ?? null,
            ':notes' => $task['notes'] ?? '',
            ':week_id' => $task['weekId'],
            ':completed_at' => $task['completedAt'] ?? null,
            ':completed_by' => $task['completedBy'] ?? null
        ]);

        echo json_encode(['success' => true]);
        break;

    // Registrar actividad en tiempo real
    case 'log_activity':
        $log = $input;
        $stmt = $pdo->prepare("
            INSERT INTO activity_log (id, user_id, action, task_name, details, timestamp)
            VALUES (:id, :user_id, :action, :task_name, :details, :timestamp)
        ");
        $stmt->execute([
            ':id' => $log['id'] ?? uniqid('log_'),
            ':user_id' => $log['userId'],
            ':action' => $log['action'],
            ':task_name' => $log['taskName'],
            ':details' => $log['details'] ?? '',
            ':timestamp' => $log['timestamp'] ?? date('Y-m-d H:i:s')
        ]);
        echo json_encode(['success' => true]);
        break;

    // Guardar usuarios
    case 'save_users':
        foreach ($input as $u) {
            $stmt = $pdo->prepare("
                INSERT INTO users (id, name, color, avatar) VALUES (:id, :name, :color, :avatar)
                ON CONFLICT (id) DO UPDATE SET name = excluded.name, color = excluded.color, avatar = excluded.avatar
            ");
            $stmt->execute([
                ':id' => $u['id'],
                ':name' => $u['name'],
                ':color' => $u['color'],
                ':avatar' => $u['avatar']
            ]);
        }
        echo json_encode(['success' => true]);
        break;

    default:
        http_response_code(404);
        echo json_encode(['error' => 'Acción no reconocida']);
        break;
}
