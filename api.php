<?php
/**
 * Backend API REST para Hogar — Tareas Compartidas
 * Compatible con: Coolify, Docker, Apache, Nginx, MySQL (todas las versiones), MariaDB, PostgreSQL y SQLite
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

// --------------------------------------------------------------------------
// 1. CARGADOR DE VARIABLES DE ENTORNO (.env o Coolify Environment Variables)
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
// 2. CONEXIÓN A BASE DE DATOS
// --------------------------------------------------------------------------
$databaseUrl = getEnvVar('DATABASE_URL');
$dbType = strtolower(getEnvVar('DB_TYPE', 'mysql'));
$dbHost = getEnvVar('DB_HOST', 'localhost');
$dbPort = getEnvVar('DB_PORT', $dbType === 'pgsql' ? '5432' : '3306');
$dbName = getEnvVar('DB_NAME', getEnvVar('DB_DATABASE', 'default'));
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
        // MySQL / MariaDB
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
// 3. AUTO-INICIALIZACIÓN DE TABLAS (SIN RESTRICCIONES BLOQUEANTES)
// --------------------------------------------------------------------------
function ensureSchema($pdo) {
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
            frequency_config TEXT,
            default_assignee VARCHAR(50) NOT NULL DEFAULT 'user-1',
            weight INT NOT NULL DEFAULT 1,
            estimated_minutes INT NOT NULL DEFAULT 15,
            notes TEXT,
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
            due_date VARCHAR(20) NOT NULL,
            status VARCHAR(50) NOT NULL DEFAULT 'pending',
            weight INT NOT NULL DEFAULT 1,
            estimated_minutes INT NOT NULL DEFAULT 15,
            priority VARCHAR(20),
            notes TEXT,
            week_id VARCHAR(20) NOT NULL,
            completed_at VARCHAR(40) NULL,
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
            completed_at VARCHAR(40) NULL,
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
            details TEXT,
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    ");

    // Sembrar usuarios iniciales si no existen
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
ensureSchema($pdo);

// --------------------------------------------------------------------------
// 4. RUTAS DE LA API (CRUD COMPLETO Y SEGURO)
// --------------------------------------------------------------------------
$action = $_GET['action'] ?? 'get_all';
$rawInput = file_get_contents('php://input');
$input = json_decode($rawInput, true) ?? [];

try {
    switch ($action) {
        // Diagnóstico de salud
        case 'health':
            $usersCount = $pdo->query("SELECT COUNT(*) FROM users")->fetchColumn();
            $tasksCount = $pdo->query("SELECT COUNT(*) FROM task_instances")->fetchColumn();
            $tmplCount = $pdo->query("SELECT COUNT(*) FROM task_templates")->fetchColumn();
            echo json_encode([
                'status' => 'connected',
                'message' => '¡Conexión exitosa a la base de datos!',
                'database_type' => $dbType,
                'database_name' => $dbName,
                'host' => $dbHost,
                'server_time' => date('Y-m-d H:i:s'),
                'records' => [
                    'users' => (int)$usersCount,
                    'templates' => (int)$tmplCount,
                    'task_instances' => (int)$tasksCount
                ]
            ], JSON_PRETTY_PRINT);
            break;

        // Obtener todos los datos sincronizados
        case 'get_all':
            $users = $pdo->query("SELECT * FROM users")->fetchAll();
            $settings = $pdo->query("SELECT * FROM house_settings WHERE id = 'default'")->fetch() ?: [];
            $templates = $pdo->query("SELECT * FROM task_templates")->fetchAll();
            $instances = $pdo->query("SELECT * FROM task_instances ORDER BY due_date ASC")->fetchAll();
            $subtasks = $pdo->query("SELECT * FROM subtasks")->fetchAll();
            $activity = $pdo->query("SELECT * FROM activity_log ORDER BY timestamp DESC LIMIT 100")->fetchAll();

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

            $formattedTemplates = [];
            foreach ($templates as $t) {
                $t['defaultAssignee'] = $t['default_assignee'];
                $t['frequencyConfig'] = $t['frequency_config'] ? json_decode($t['frequency_config'], true) : null;
                $t['estimatedMinutes'] = (int)$t['estimated_minutes'];
                $t['weight'] = (int)$t['weight'];
                $t['active'] = (bool)$t['active'];
                $formattedTemplates[] = $t;
            }

            echo json_encode([
                'status' => 'ok',
                'users' => $users,
                'settings' => $settings,
                'templates' => $formattedTemplates,
                'instances' => $formattedInstances,
                'activityLog' => $activity
            ]);
            break;

        // Guardar o actualizar una tarea (Universal & Seguro)
        case 'save_task':
            $task = $input;
            if (empty($task['id'])) {
                http_response_code(400);
                echo json_encode(['error' => 'Falta ID de la tarea']);
                exit;
            }

            $rawCompletedAt = $task['completedAt'] ?? null;
            $completedAt = null;
            if (!empty($rawCompletedAt)) {
                $t = strtotime($rawCompletedAt);
                if ($t !== false) {
                    $completedAt = date('Y-m-d H:i:s', $t);
                }
            }

            $rawDueDate = $task['dueDate'] ?? date('Y-m-d');
            $dueDate = date('Y-m-d', strtotime($rawDueDate) ?: time());

            $checkStmt = $pdo->prepare("SELECT id FROM task_instances WHERE id = :id");
            $checkStmt->execute([':id' => $task['id']]);
            $exists = $checkStmt->fetchColumn();

            if ($exists) {
                $updateStmt = $pdo->prepare("
                    UPDATE task_instances SET
                        name = :name,
                        type = :type,
                        category = :category,
                        assigned_to = :assigned_to,
                        due_date = :due_date,
                        status = :status,
                        weight = :weight,
                        estimated_minutes = :estimated_minutes,
                        priority = :priority,
                        notes = :notes,
                        week_id = :week_id,
                        completed_at = :completed_at,
                        completed_by = :completed_by
                    WHERE id = :id
                ");
                $updateStmt->execute([
                    ':id' => $task['id'],
                    ':name' => $task['name'] ?? 'Tarea',
                    ':type' => $task['type'] ?? 'single',
                    ':category' => $task['category'] ?? 'hogar',
                    ':assigned_to' => $task['assignedTo'] ?? 'user-1',
                    ':due_date' => $dueDate,
                    ':status' => $task['status'] ?? 'pending',
                    ':weight' => (int)($task['weight'] ?? 1),
                    ':estimated_minutes' => (int)($task['estimatedMinutes'] ?? 15),
                    ':priority' => $task['priority'] ?? null,
                    ':notes' => $task['notes'] ?? '',
                    ':week_id' => $task['weekId'] ?? '2026-W35',
                    ':completed_at' => $completedAt,
                    ':completed_by' => $task['completedBy'] ?? null
                ]);
            } else {
                $insertStmt = $pdo->prepare("
                    INSERT INTO task_instances (id, template_id, name, type, category, assigned_to, due_date, status, weight, estimated_minutes, priority, notes, week_id, completed_at, completed_by)
                    VALUES (:id, :template_id, :name, :type, :category, :assigned_to, :due_date, :status, :weight, :estimated_minutes, :priority, :notes, :week_id, :completed_at, :completed_by)
                ");
                $insertStmt->execute([
                    ':id' => $task['id'],
                    ':template_id' => $task['templateId'] ?? null,
                    ':name' => $task['name'] ?? 'Tarea',
                    ':type' => $task['type'] ?? 'single',
                    ':category' => $task['category'] ?? 'hogar',
                    ':assigned_to' => $task['assignedTo'] ?? 'user-1',
                    ':due_date' => $dueDate,
                    ':status' => $task['status'] ?? 'pending',
                    ':weight' => (int)($task['weight'] ?? 1),
                    ':estimated_minutes' => (int)($task['estimatedMinutes'] ?? 15),
                    ':priority' => $task['priority'] ?? null,
                    ':notes' => $task['notes'] ?? '',
                    ':week_id' => $task['weekId'] ?? '2026-W35',
                    ':completed_at' => $completedAt,
                    ':completed_by' => $task['completedBy'] ?? null
                ]);
            }

            // Sincronizar subtareas si tiene
            if (!empty($task['subtasks']) && is_array($task['subtasks'])) {
                foreach ($task['subtasks'] as $sub) {
                    $subCheck = $pdo->prepare("SELECT id FROM subtasks WHERE id = :id");
                    $subCheck->execute([':id' => $sub['id']]);
                    if ($subCheck->fetchColumn()) {
                        $subUpdate = $pdo->prepare("
                            UPDATE subtasks SET
                                name = :name,
                                assigned_to = :assigned_to,
                                status = :status,
                                completed_at = :completed_at,
                                completed_by = :completed_by
                            WHERE id = :id
                        ");
                        $subUpdate->execute([
                            ':id' => $sub['id'],
                            ':name' => $sub['name'],
                            ':assigned_to' => $sub['assignedTo'],
                            ':status' => $sub['status'] ?? 'pending',
                            ':completed_at' => $sub['completedAt'] ?? null,
                            ':completed_by' => $sub['completedBy'] ?? null
                        ]);
                    } else {
                        $subInsert = $pdo->prepare("
                            INSERT INTO subtasks (id, parent_task_id, name, assigned_to, status, completed_at, completed_by)
                            VALUES (:id, :parent_task_id, :name, :assigned_to, :status, :completed_at, :completed_by)
                        ");
                        $subInsert->execute([
                            ':id' => $sub['id'],
                            ':parent_task_id' => $task['id'],
                            ':name' => $sub['name'],
                            ':assigned_to' => $sub['assignedTo'],
                            ':status' => $sub['status'] ?? 'pending',
                            ':completed_at' => $sub['completedAt'] ?? null,
                            ':completed_by' => $sub['completedBy'] ?? null
                        ]);
                    }
                }
            }

            echo json_encode(['success' => true]);
            break;

        // Eliminar una tarea
        case 'delete_task':
            $taskId = $_GET['id'] ?? null;
            if (!$taskId) {
                http_response_code(400);
                echo json_encode(['error' => 'Falta ID de la tarea']);
                exit;
            }
            $delSub = $pdo->prepare("DELETE FROM subtasks WHERE parent_task_id = :id");
            $delSub->execute([':id' => $taskId]);
            
            $del = $pdo->prepare("DELETE FROM task_instances WHERE id = :id");
            $del->execute([':id' => $taskId]);
            echo json_encode(['success' => true]);
            break;

        // Guardar configuración (Settings)
        case 'save_settings':
            $set = $input;
            $chk = $pdo->prepare("SELECT id FROM house_settings WHERE id = 'default'");
            $chk->execute();
            if ($chk->fetchColumn()) {
                $upd = $pdo->prepare("UPDATE house_settings SET house_name = :hn, start_day = :sd, theme = :th, notifications = :notif WHERE id = 'default'");
                $upd->execute([
                    ':hn' => $set['houseName'] ?? 'Nuestra Casa 🏠',
                    ':sd' => $set['startDay'] ?? 'monday',
                    ':th' => $set['theme'] ?? 'light',
                    ':notif' => isset($set['notifications']) ? (int)$set['notifications'] : 1
                ]);
            } else {
                $ins = $pdo->prepare("INSERT INTO house_settings (id, house_name, start_day, theme, notifications) VALUES ('default', :hn, :sd, :th, :notif)");
                $ins->execute([
                    ':hn' => $set['houseName'] ?? 'Nuestra Casa 🏠',
                    ':sd' => $set['startDay'] ?? 'monday',
                    ':th' => $set['theme'] ?? 'light',
                    ':notif' => isset($set['notifications']) ? (int)$set['notifications'] : 1
                ]);
            }
            echo json_encode(['success' => true]);
            break;

        // Guardar lista de plantillas
        case 'save_templates':
            $tmplList = is_array($input) ? $input : [];
            foreach ($tmplList as $t) {
                if (empty($t['id'])) continue;
                $c = $pdo->prepare("SELECT id FROM task_templates WHERE id = :id");
                $c->execute([':id' => $t['id']]);
                if ($c->fetchColumn()) {
                    $u = $pdo->prepare("UPDATE task_templates SET name=:nm, type=:ty, category=:cat, frequency=:fq, frequency_config=:fqc, default_assignee=:da, weight=:w, estimated_minutes=:em, notes=:nt, active=:act WHERE id=:id");
                    $u->execute([
                        ':id' => $t['id'],
                        ':nm' => $t['name'],
                        ':ty' => $t['type'] ?? 'recurrent',
                        ':cat' => $t['category'] ?? 'hogar',
                        ':fq' => $t['frequency'] ?? 'daily',
                        ':fqc' => isset($t['frequencyConfig']) ? json_encode($t['frequencyConfig']) : null,
                        ':da' => $t['defaultAssignee'] ?? 'user-1',
                        ':w' => (int)($t['weight'] ?? 1),
                        ':em' => (int)($t['estimatedMinutes'] ?? 15),
                        ':nt' => $t['notes'] ?? '',
                        ':act' => isset($t['active']) ? (int)$t['active'] : 1
                    ]);
                } else {
                    $i = $pdo->prepare("INSERT INTO task_templates (id, name, type, category, frequency, frequency_config, default_assignee, weight, estimated_minutes, notes, active) VALUES (:id, :nm, :ty, :cat, :fq, :fqc, :da, :w, :em, :nt, :act)");
                    $i->execute([
                        ':id' => $t['id'],
                        ':nm' => $t['name'],
                        ':ty' => $t['type'] ?? 'recurrent',
                        ':cat' => $t['category'] ?? 'hogar',
                        ':fq' => $t['frequency'] ?? 'daily',
                        ':fqc' => isset($t['frequencyConfig']) ? json_encode($t['frequencyConfig']) : null,
                        ':da' => $t['defaultAssignee'] ?? 'user-1',
                        ':w' => (int)($t['weight'] ?? 1),
                        ':em' => (int)($t['estimatedMinutes'] ?? 15),
                        ':nt' => $t['notes'] ?? '',
                        ':act' => isset($t['active']) ? (int)$t['active'] : 1
                    ]);
                }
            }
            echo json_encode(['success' => true]);
            break;

        // Eliminar plantilla
        case 'delete_template':
            $tmplId = $_GET['id'] ?? null;
            if ($tmplId) {
                $del = $pdo->prepare("DELETE FROM task_templates WHERE id = :id");
                $del->execute([':id' => $tmplId]);
            }
            echo json_encode(['success' => true]);
            break;

        // Guardar usuarios (Universal)
        case 'save_users':
            $usersList = is_array($input) ? $input : [];
            foreach ($usersList as $u) {
                if (empty($u['id'])) continue;
                $chk = $pdo->prepare("SELECT id FROM users WHERE id = :id");
                $chk->execute([':id' => $u['id']]);
                if ($chk->fetchColumn()) {
                    $upd = $pdo->prepare("UPDATE users SET name = :name, color = :color, avatar = :avatar WHERE id = :id");
                    $upd->execute([
                        ':id' => $u['id'],
                        ':name' => $u['name'] ?? 'Usuario',
                        ':color' => $u['color'] ?? '#3b82f6',
                        ':avatar' => $u['avatar'] ?? '👤'
                    ]);
                } else {
                    $ins = $pdo->prepare("INSERT INTO users (id, name, color, avatar) VALUES (:id, :name, :color, :avatar)");
                    $ins->execute([
                        ':id' => $u['id'],
                        ':name' => $u['name'] ?? 'Usuario',
                        ':color' => $u['color'] ?? '#3b82f6',
                        ':avatar' => $u['avatar'] ?? '👤'
                    ]);
                }
            }
            echo json_encode(['success' => true]);
            break;

        // Guardar lote de tareas (para sincronización inicial)
        case 'save_instances_batch':
            $batch = is_array($input) ? $input : [];
            foreach ($batch as $t) {
                if (empty($t['id'])) continue;

                $rawCompletedAt = $t['completedAt'] ?? null;
                $completedAt = null;
                if (!empty($rawCompletedAt)) {
                    $ts = strtotime($rawCompletedAt);
                    if ($ts !== false) {
                        $completedAt = date('Y-m-d H:i:s', $ts);
                    }
                }

                $rawDueDate = $t['dueDate'] ?? date('Y-m-d');
                $dueDate = date('Y-m-d', strtotime($rawDueDate) ?: time());

                $c = $pdo->prepare("SELECT id FROM task_instances WHERE id = :id");
                $c->execute([':id' => $t['id']]);
                if (!$c->fetchColumn()) {
                    $ins = $pdo->prepare("
                        INSERT INTO task_instances (id, template_id, name, type, category, assigned_to, due_date, status, weight, estimated_minutes, priority, notes, week_id, completed_at, completed_by)
                        VALUES (:id, :template_id, :name, :type, :category, :assigned_to, :due_date, :status, :weight, :estimated_minutes, :priority, :notes, :week_id, :completed_at, :completed_by)
                    ");
                    $ins->execute([
                        ':id' => $t['id'],
                        ':template_id' => $t['templateId'] ?? null,
                        ':name' => $t['name'] ?? 'Tarea',
                        ':type' => $t['type'] ?? 'single',
                        ':category' => $t['category'] ?? 'hogar',
                        ':assigned_to' => $t['assignedTo'] ?? 'user-1',
                        ':due_date' => $dueDate,
                        ':status' => $t['status'] ?? 'pending',
                        ':weight' => (int)($t['weight'] ?? 1),
                        ':estimated_minutes' => (int)($t['estimatedMinutes'] ?? 15),
                        ':priority' => $t['priority'] ?? null,
                        ':notes' => $t['notes'] ?? '',
                        ':week_id' => $t['weekId'] ?? '2026-W35',
                        ':completed_at' => $completedAt,
                        ':completed_by' => $t['completedBy'] ?? null
                    ]);
                }
            }
            echo json_encode(['success' => true]);
            break;

        // Registrar actividad
        case 'log_activity':
            $log = $input;
            $stmt = $pdo->prepare("
                INSERT INTO activity_log (id, user_id, action, task_name, details, timestamp)
                VALUES (:id, :user_id, :action, :task_name, :details, :timestamp)
            ");
            $stmt->execute([
                ':id' => $log['id'] ?? uniqid('log_'),
                ':user_id' => $log['userId'] ?? 'user-1',
                ':action' => $log['action'] ?? 'update',
                ':task_name' => $log['taskName'] ?? 'Tarea',
                ':details' => $log['details'] ?? '',
                ':timestamp' => $log['timestamp'] ?? date('Y-m-d H:i:s')
            ]);
            echo json_encode(['success' => true]);
            break;

        default:
            http_response_code(404);
            echo json_encode(['error' => 'Acción no encontrada: ' . htmlspecialchars($action)]);
            break;
    }
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'error' => 'Error al procesar la solicitud',
        'details' => $e->getMessage()
    ]);
}
