#!/bin/sh
set -e

# Aplica las migraciones pendientes. Es idempotente: si la base de datos ya está
# al día no hace nada. Usa la misma tabla _prisma_migrations que el CLI de
# Prisma, así que ambos ven el mismo estado.
echo "==> Aplicando migraciones de base de datos..."
node dist/scripts/migrate-deploy.js

# Crea las dos personas, los ajustes y unas tareas recurrentes de ejemplo, pero
# SOLO si la base de datos no tiene ya plantillas. Nunca sobrescribe datos.
echo "==> Comprobando datos iniciales..."
node dist/prisma/seed.js

echo "==> Arrancando la aplicación..."
exec "$@"
