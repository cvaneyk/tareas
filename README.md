# Hogar — Tareas Compartidas

App de tareas del hogar para dos personas: reparto equitativo por puntos, tareas
recurrentes automáticas y estadísticas semanales.

Next.js 16 · TypeScript · Prisma 7 · PostgreSQL · Docker

---

## Por qué se reescribió

La versión anterior (HTML + JS + `api.php` + MySQL) no guardaba las tareas
recurrentes y mostraba datos incorrectos. No eran bugs sueltos: la arquitectura
hacía que perder datos fuese el comportamiento normal.

| Fallo | Causa en la versión antigua | Cómo se arregla ahora |
|---|---|---|
| Se perdían los cambios | `localStorage` era la fuente de verdad y un temporizador lo sobrescribía cada 10 s con la respuesta del servidor; las subidas eran `fetch` sin `await` ni comprobación | El servidor es la única fuente de verdad. Cada escritura es una transacción confirmada antes de que la interfaz la muestre |
| Las recurrentes nacían duplicadas | Al crear una recurrente se creaba la plantilla **y** una tarea suelta con `templateId: 'custom_tmpl'`, así que el generador creaba otra ese mismo día | Restricción `UNIQUE (template_id, due_date)`: duplicar es imposible a nivel de base de datos |
| "Limpieza grande" perdía sus subtareas | La tabla `task_templates` no tenía columna para subtareas | Tabla `template_subtasks`, copiadas a cada ocurrencia al generarla |
| El móvil seguía viendo la app vieja | El service worker era cache-first para todo, con caché de nombre fijo | `public/sw.js` es ahora un interruptor de apagado que se auto-desinstala |
| Estadísticas falseadas | `seedDemoData()` sembraba 3 semanas de histórico con `Math.random()` | Eliminado. El seed solo crea personas, ajustes y tus recurrentes reales |
| Días desplazados | Fechas guardadas sin zona horaria y reinterpretadas en JS | Las fechas de vencimiento son `DATE` y viajan como `'YYYY-MM-DD'` de punta a punta |
| Borrar o posponer una tarea no hacía nada | Al quitarla se liberaba su hueco del día y el generador la volvía a crear en el siguiente render | Cada tarea recurrente ocupa una **ranura** (`slot_date`) distinta de su fecha de vencimiento. Posponer mueve la fecha y deja la ranura ocupada; borrar deja una lápida en ella |

---

## Arquitectura

```
Móvil / Navegador
   │
   ▼
Server Components  ── leen de la base de datos en cada render
Server Actions     ── mutan y revalidan
   │
   ▼
Prisma  →  PostgreSQL   ← única fuente de verdad
```

No hay capa de sincronización. `components/AutoRefresh.tsx` vuelve a pedir los
datos al servidor cada 20 s y al volver a la app: es un *refetch*, no un
*overwrite*, así que no puede pisar nada.

### Ficheros clave

| Fichero | Qué hace |
|---|---|
| `prisma/schema.prisma` | Modelo de datos. La restricción `@@unique([templateId, dueDate])` es la pieza central |
| `lib/recurrence.ts` | Reglas de repetición y de asignación (alternar por semana / por turno) |
| `lib/generation.ts` | Generación idempotente de tareas a partir de las plantillas |
| `lib/dates.ts` | Fechas civiles como `'YYYY-MM-DD'`, sin ambigüedad de zona horaria |
| `lib/stats.ts` | Cumplimiento y reparto por puntos |
| `actions/` | Server Actions: toda escritura pasa por aquí, con validación Zod |
| `scripts/migrate-legacy.ts` | Importa los datos de la versión antigua |
| `scripts/migrate-deploy.ts` | Aplica las migraciones en producción, sin el CLI de Prisma |

---

## Desarrollo local

Necesitas Node 24+ y una base de datos PostgreSQL.

```bash
npm install
cp .env.example .env        # ajusta DATABASE_URL si hace falta
```

**Base de datos.** Con Docker:

```bash
docker compose up -d
```

Sin Docker, hay un PostgreSQL en proceso (PGlite) que habla el protocolo real:

```bash
npm run db:local            # déjalo corriendo en otra terminal
```

**Arrancar:**

```bash
npm run db:deploy           # aplica las migraciones
npm run db:seed             # personas, ajustes y recurrentes (solo si está vacía)
npm run dev                 # http://localhost:3000
```

**Comprobaciones:**

```bash
<<<<<<< HEAD
<<<<<<< Updated upstream
npm test                    # 62 tests, incl. integración contra PostgreSQL real
=======
npm test                    # 85 tests, incl. integración contra PostgreSQL real
>>>>>>> Stashed changes
=======
npm test                    # 74 tests, incl. integración contra PostgreSQL real
>>>>>>> 1dad4baf1b8b6a68ab35bde562a21ab266842fee
npm run typecheck
npm run build
```

Los tests de integración usan PGlite, así que respetan las restricciones `UNIQUE`,
las transacciones y los advisory locks de verdad — no son mocks.

---

## Importar los datos de la versión antigua

> ⚠️ **Hazlo antes de desplegar**, porque `api.php` desaparece.

```bash
curl "https://TU-DOMINIO/api.php?action=get_all" > legacy.json
```

(Alternativa: el botón "Exportar copia de seguridad" de Ajustes en la versión
antigua produce un JSON equivalente.)

Después, primero en seco:

```bash
npm run migrate:legacy -- legacy.json --dry-run
```

Muestra un resumen antes de escribir nada: cuántas plantillas y tareas hay,
cuántas duplicadas colapsa, cuántas descarta por no tener fecha, y cuántas
tienen pinta de ser el histórico falso de `seedDemoData()`.

Si el resumen cuadra:

```bash
npm run migrate:legacy -- legacy.json --wipe
```

> **Usa `--wipe` la primera vez.** Al desplegar, el contenedor siembra 9 tareas
> recurrentes de ejemplo en una base de datos vacía. Sin `--wipe` te quedarían
> esas 9 *más* las tuyas. `--wipe` limpia plantillas y tareas antes de importar;
> las personas y los ajustes se sobrescriben con los tuyos igualmente.

Opciones:

| Opción | Para qué |
|---|---|
| `--dry-run` | No escribe nada, solo informa |
| `--wipe` | Vacía plantillas y tareas antes de importar. Úsalo la primera vez y para reintentar |
| `--since=2026-08-01` | Importa solo desde esa fecha. Úsalo para dejar fuera el histórico de ejemplo |

Qué hace por ti:

- **Colapsa los duplicados por `(nombre, fecha)`**, que es la firma exacta del
  bug antiguo: la misma tarea el mismo día, una vez por la plantilla y otra con
  el `templateId` inventado `'custom_tmpl'`. Gana la versión más "hecha"
  (completada > omitida > pendiente) y se queda con la plantilla del grupo, así
  que no se pierde el trabajo registrado. Dos plantillas distintas que compartan
  nombre y día no se tocan: son tareas diferentes.
- Da el día de la semana de las recurrentes semanales a partir de su `anchorDate`
  cuando no guardaban `dayOfWeek`, igual que hacía el motor antiguo, y te lo
  imprime en el resumen para que puedas corregirlo si no cuadra.
- Recupera las 7 subtareas de la "Limpieza grande" **original** (`tmpl_limpieza_grande`),
  que la base de datos antigua no podía guardar. Si borraste esa y creaste la tuya,
  la plantilla llega sin subtareas: añádelas desde Recurrentes → ✏️, cambiando el
  tipo a "Limpieza grande".
- Traduce las frecuencias antiguas (`every_2_days`, `custom_days`, `suggested`…)
  a las reglas nuevas, y convierte los días de JS (0 = domingo) a ISO (7 = domingo).
- Da a cada plantilla como fecha de inicio su primera ocurrencia real, en vez del
  literal `'2026-08-25'` que traía el código antiguo.
- Interpreta los `completed_at` sin zona horaria en la zona de la casa.

Las plantillas y las tareas solo se crean si no existen ya, para no pisar nada
que hayas tocado en la app nueva. Los ajustes de la casa sí se sobrescriben.

---

## Despliegue en Coolify

### 1. Base de datos

En tu proyecto: **+ New → Database → PostgreSQL 16**.

Cuando arranque, copia la **Internal Connection URL** (empieza por `postgres://`
y usa el nombre del servicio como host, no `localhost`).

### 2. Aplicación

**+ New → Application → Public/Private Repository**, apuntando a este repo:

| Campo | Valor |
|---|---|
| Branch | `main` |
| Build Pack | **Dockerfile** |
| Port Exposes | `3000` |
| Health Check Path | `/api/health` |

### 3. Variables de entorno

| Variable | Valor |
|---|---|
| `DATABASE_URL` | La Internal Connection URL del paso 1 |
| `TZ` | `Europe/Madrid` |
| `NEXT_TELEMETRY_DISABLED` | `1` |
| `DATABASE_POOL_MAX` | *(opcional)* Bájalo si tu PostgreSQL tiene pocas conexiones |

`TZ` determina qué día es "hoy" para la app; si no lo pones, el contenedor usa
UTC y el día cambia a medianoche de Londres.

### 4. Desplegar

Cada despliegue aplica las migraciones pendientes automáticamente
(`docker-entrypoint.sh` ejecuta `node dist/scripts/migrate-deploy.js`) y siembra
los datos iniciales solo si la base de datos está vacía. Ambos pasos son
idempotentes: reiniciar el contenedor no duplica ni sobrescribe nada.

### 5. Importar tus datos

Desde el terminal del contenedor en Coolify, con el `legacy.json` subido:

```bash
node dist/scripts/migrate-legacy.js legacy.json --dry-run
node dist/scripts/migrate-legacy.js legacy.json --wipe
```

### 6. Dominio

Apunta **el mismo dominio** que usaba la app antigua. Es importante: así los
móviles con la PWA vieja instalada piden `/sw.js`, se encuentran el interruptor
de apagado y dejan de servir el JavaScript antiguo.

### 7. Comprobar

```bash
curl https://TU-DOMINIO/api/health
```

```json
{ "status": "ok", "timezone": "Europe/Madrid", "records": { "users": 2, "templates": 9, "occurrences": 45 } }
```

---

## Notas

- **No hay autenticación**: cualquiera con el enlace puede ver y modificar. Es
  una decisión consciente; si algún día hace falta, el sitio natural es un
  middleware de Next con una contraseña compartida.
- **No funciona sin conexión.** El service worker antiguo era una de las causas
  del problema, así que se ha eliminado en vez de arreglarlo. La app sigue siendo
  instalable en el móvil.
- **Completar una tarea la atribuye a quien la tiene asignada**, igual que antes.
  Si la hace la otra persona, reasígnala primero desde el menú ⋮.
- `npm audit` avisa de `deepmerge-ts`, dependencia del **CLI** de Prisma. Es una
  devDependency: no llega a la imagen de producción.
