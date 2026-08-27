#!/bin/sh
set -e

echo "==> Aplicando migraciones de base de datos..."
# Idempotente: si la base de datos ya está al día, no hace nada.
npx prisma migrate deploy

echo "==> Comprobando datos iniciales..."
# Crea las dos personas, los ajustes y las tareas recurrentes de ejemplo, pero
# SOLO si la base de datos no tiene ya plantillas. Nunca sobrescribe datos.
node dist/prisma/seed.js || echo "!! El seed no se pudo ejecutar; la app arranca igualmente."

echo "==> Arrancando la aplicación..."
exec "$@"
