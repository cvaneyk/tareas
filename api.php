<?php
/**
 * Backend API REST para Hogar — Tareas Compartidas
 * Compatible con: Coolify, Docker, Apache, Nginx, MySQL, PostgreSQL y SQLite
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

// --------------------------------------------------------------------------
// CARGADOR DE VARIABLES DE ENTORNO (.env o Coolify Environment Variables)
// --------------------------------------------------------------------------
function loadEnv($path = __DIR__ . '/.env') {
    if (file_exists($path)) {
        $lines = file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        foreach ($lines as $line) {
            $line = trim($line);
            if (empty($line) || str_starts_with($line, '#')) continue;
            if (str_contains($line, '=')) {
                list($name, $value) = explode('=', $line, 2);
                $name = trim($name);
                $value = trim($value, " \t\n\r\0\x0B\"'");
                if (!array_key_exists($name, $_SERVER) && !array_key_exists($name, $_ENV)) {
                    putenv(sprintf('%s=%s', $name, $value));
                    $_ENV[$name] = $value;
                    $_SERVER[$name] = $value;
                }
            }
        }
    }
}
loadEnv();

function getEnvVar($key, $default = null) {
    return getenv($key) ?: ($_ENV[$key] ?? ($_SERVER[$key] ?? $default));
}

// --------------------------------------------------------------------------
// CONEXIÓN A BASE DE DATOS (MySQL / PostgreSQL / SQLite)
// --------------------------------------------------------------------------
$databaseUrl = getEnvVar('DATABASE_URL');
$dbType = strtolower(getEnvVar('DB_TYPE', 'mysql'));
$dbHost = getEnvVar('DB_HOST', 'localhost');
$dbPort = getEnvVar('DB_PORT', $dbType === 'pgsql' ? '5432' : '3306');
$dbName = getEnvVar('DB_NAME', getEnvVar('DB_DATABASE', 'hogar_db'));
$dbUser = getEnvVar('DB_USER', getEnvVar('DB_USERNAME', 'root'));
$dbPass = getEnvVar('DB_PASS', getEnvVar('DB_PASSWORD', ''));

if ($databaseUrl) {
    $parsed = parse_url($databaseUrl);
    if ($parsed) {
        $dbType = str_starts_with($parsed['scheme'] ?? '', 'postgres') ? 'pgsql' : 'mysql';
        $dbHost = $parsed['host'] ?? $dbHost;
        $dbPort = $parsed['port'] ?? ($dbType === 'pgsql' ? '5432' : '3306');
        $dbUser = $parsed['user'] ?? $dbUser;
        $dbPass = $parsed['pass'] ?? $dbPass;
        $dbName = ltrim($parsed['path'] ?? '', '/') ?: $dbName;
    }
}

try {
    if ($dbType === 'sqlite') {
        $sqliteFile = __DIR__ . '/hogar.sqlite';
        $pdo = new PDO("sqlite:" . $sqliteFile);
    } elseif ($dbType === 'pgsql') {
        $pdo = new PDO("pgsql:host={$dbHost};port={$dbPort};dbname={$dbName}", $dbUser, $dbPass);
    } else {
        // MySQL / MariaDB por defecto
        $pdo = new PDO("mysql:host={$dbHost};port={$dbPort};dbname={$dbName};charset=utf8mb4", $dbUser, $dbPass);
    }
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'error' => 'No se pudo conectar a la base de datos',
        'details' => $e->getMessage(),
        'hint' => 'Verifica tus variables de entorno en Coolify (.env)'
    ]);
    exit;
}

// --------------------------------------------------------------------------
// AUTO-INICIALIZACIÓN DE TABLAS (SI NO EXISTEN)
// --------------------------------------------------------------------------
function ensureSchema($pdo, $dbType) {
    $autoInc = $dbType === 'pgsql' ? 'SERIAL' : 'INTEGER AUTO_INCREMENT';
    $textType = 'TEXT';
    
    // 1. Users
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS users (
            id VARCHAR(50) PRIMARY KEY,
            name VARCHAR(100) NOT NULL,
            color VARCHAR(20) NOT NULL DEFAULT '#3b82f6',
            avatar VARCHAR(20) NOT NULL DEFAULT '🧑‍💻',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    ");

    // 2. Settings
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS house_settings (
            id VARCHAR(50) PRIMARY KEY DEFAULT 'default',
            house_name VARCHAR(150) NOT NULL DEFAULT 'Nuestra Casa 🏠',
            start_day VARCHAR(20) NOT NULL DEFAULT 'monday',
            theme VARCHAR(20) NOT NULL DEFAULT 'light',
            notifications BOOLEAN NOT NULL DEFAULT TRUE,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    ");

    // 3. Templates
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS task_templates (
            id VARCHAR(50) PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            type VARCHAR(50) NOT NULL DEFAULT 'recurrent',
            category VARCHAR(50) NOT NULL DEFAULT 'hogar',
            frequency VARCHAR(50) NOT NULL DEFAULT 'daily',
            frequency_config {$textType},
            default_assignee VARCHAR(50) NOT NULL DEFAULT 'user-1',
            weight INT NOT NULL DEFAULT 1,
            estimated_minutes INT NOT NULL DEFAULT 15,
            notes {$textType},
            active BOOLEAN NOT NULL DEFAULT TRUE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    ");

    // 4. Instances
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS task_instances (
            id VARCHAR(50) PRIMARY KEY,
            template_id VARCHAR(50),
            name VARCHAR(255) NOT NULL,
            type VARCHAR(50) NOT NULL DEFAULT 'single',
            category VARCHAR(50) NOT NULL DEFAULT 'hogar',
            assigned_to VARCHAR(50) NOT NULL,
            due_date DATE NOT NULL,
            status VARCHAR(50) NOT NULL DEFAULT 'pending',
            weight INT NOT NULL DEFAULT 1,
            estimated_minutes INT NOT NULL DEFAULT 15,
            priority VARCHAR(20),
            notes {$textType},
            week_id VARCHAR(20) NOT NULL,
            completed_at TIMESTAMP NULL,
            completed_by VARCHAR(50) NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    ");

    // 5. Subtasks
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS subtasks (
            id VARCHAR(50) PRIMARY KEY,
            parent_task_id VARCHAR(50) NOT NULL,
            name VARCHAR(255) NOT NULL,
            assigned_to VARCHAR(50) NOT NULL,
            status VARCHAR(50) NOT NULL DEFAULT 'pending',
            completed_at TIMESTAMP NULL,
            completed_by VARCHAR(50) NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    ");

    // 6. Activity log
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS activity_log (
            id VARCHAR(50) PRIMARY KEY,
            user_id VARCHAR(50) NOT NULL,
            action VARCHAR(50) NOT NULL,
            task_name VARCHAR(255) NOT NULL,
            details {$textType},
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    ");

    // Sembrar datos iniciales si no hay usuarios
    $userCount = $pdo->query("SELECT COUNT(*) FROM users")->fetchColumn();
    if ($userCount == 0) {
        $pdo->exec("
            INSERT INTO users (id, name, color, avatar) VALUES 
            ('user-1', 'Persona 1', '#3b82f6', '🧑‍💻'),
            ('user-2', 'Persona 2', '#10b981', '🎨');

            INSERT INTO house_settings (id, house_name, start_day, theme, notifications) VALUES 
            ('default', 'Nuestra Casa 🏠', 'monday', 'light', TRUE);

            INSERT INTO task_templates (id, name, type, category, frequency, frequency_config, default_assignee, weight, estimated_minutes, notes, active) VALUES 
            ('tmpl_perro', 'Sacar al perro', 'recurrent', 'perro', 'daily', '{}', 'user-1', 3, 30, 'Paseo de mañana y tarde', TRUE),
            ('tmpl_arenero', 'Limpiar arenero', 'recurrent', 'hogar', 'daily', '{}', 'user-1', 1, 10, 'Revisar y reponer arena si es necesario', TRUE),
            ('tmpl_platos', 'Fregar platos', 'recurrent', 'cocina', 'daily', '{}', 'user-2', 1, 15, 'Dejar encimera y fregadero limpios', TRUE),
            ('tmpl_cena', 'Hacer cena', 'recurrent', 'cocina', 'daily', '{}', 'alternate_turn', 2, 35, 'Cocinar y recoger cazuelas', TRUE),
            ('tmpl_ropa', 'Recoger ropa tendida', 'recurrent', 'lavadora', 'daily', '{}', 'user-1', 1, 10, 'Doblar y guardar en armario', TRUE),
            ('tmpl_aspirar', 'Aspirar la casa', 'recurrent', 'limpieza', 'every_2_days', '{\"intervalDays\": 2, \"anchorDate\": \"2026-08-25\"}', 'user-2', 2, 20, 'Pasar por salón, pasillos y dormitorios', TRUE),
            ('tmpl_lavadora_sug', 'Poner lavadora (si hace falta)', 'suggested', 'lavadora', 'every_2_days', '{\"intervalDays\": 2, \"anchorDate\": \"2026-08-25\"}', 'user-1', 2, 15, '¿Hay suficiente ropa acumulada?', TRUE),
            ('tmpl_limpieza_grande', 'Limpieza grande', 'big_clean', 'limpieza', 'weekly', '{\"dayOfWeek\": 0}', 'user-1', 4, 120, 'Limpieza a fondo del fin de semana', TRUE),
            ('tmpl_chapuza', 'Chapuza del fin de semana', 'chapuza', 'chapuzas', 'weekly', '{\"dayOfWeek\": 6}', 'user-2', 3, 45, 'Arreglar puerta del armario - Revisar bisagra', TRUE);
        ");
    }
}
ensureSchema($pdo, $dbType);

// --------------------------------------------------------------------------
// RUTAS DE LA API
// --------------------------------------------------------------------------
$action = $_GET['action'] ?? 'get_all';
$input = json_decode(file_get_contents('php://input'), true) ?? [];

switch ($action) {
    // 1. Obtener todos los datos sincronizados
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
            'status' => 'ok',
            'users' => $users,
            'settings' => $settings,
            'templates' => $templates,
            'instances' => $formattedInstances,
            'activityLog' => $activity
        ]);
        break;

    // 2. Guardar o actualizar una tarea
    case 'save_task':
        $task = $input;
        if (empty($task['id'])) {
            http_response_code(400);
            echo json_encode(['error' => 'Falta id de la tarea']);
            exit;
        }

        if ($dbType === 'mysql') {
            $sql = "
                INSERT INTO task_instances (id, template_id, name, type, category, assigned_to, due_date, status, weight, estimated_minutes, priority, notes, week_id, completed_at, completed_by)
                VALUES (:id, :template_id, :name, :type, :category, :assigned_to, :due_date, :status, :weight, :estimated_minutes, :priority, :notes, :week_id, :completed_at, :completed_by)
                ON DUPLICATE KEY UPDATE
                    status = VALUES(status),
                    assigned_to = VALUES(assigned_to),
                    due_date = VALUES(due_date),
                    notes = VALUES(notes),
                    completed_at = VALUES(completed_at),
                    completed_by = VALUES(completed_by)
            ";
        } else {
            // PostgreSQL / SQLite
            $sql = "
                INSERT INTO task_instances (id, template_id, name, type, category, assigned_to, due_date, status, weight, estimated_minutes, priority, notes, week_id, completed_at, completed_by)
                VALUES (:id, :template_id, :name, :type, :category, :assigned_to, :due_date, :status, :weight, :estimated_minutes, :priority, :notes, :week_id, :completed_at, :completed_by)
                ON CONFLICT (id) DO UPDATE SET
                    status = excluded.status,
                    assigned_to = excluded.assigned_to,
                    due_date = excluded.due_date,
                    notes = excluded.notes,
                    completed_at = excluded.completed_at,
                    completed_by = excluded.completed_by
            ";
        }

        $stmt = $pdo->prepare($sql);
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

    // 3. Registrar actividad
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

    // 4. Guardar usuarios
    case 'save_users':
        foreach ($input as $u) {
            if ($dbType === 'mysql') {
                $sql = "
                    INSERT INTO users (id, name, color, avatar) VALUES (:id, :name, :color, :avatar)
                    ON DUPLICATE KEY UPDATE name = VALUES(name), color = VALUES(color), avatar = VALUES(avatar)
                ";
            } else {
                $sql = "
                    INSERT INTO users (id, name, color, avatar) VALUES (:id, :name, :color, :avatar)
                    ON CONFLICT (id) DO UPDATE SET name = excluded.name, color = excluded.color, avatar = excluded.avatar
                ";
            }
            $stmt = $pdo->prepare($sql);
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
        echo json_encode(['error' => 'Acción no encontrada']);
        break;
}
