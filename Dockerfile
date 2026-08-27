# Imagen de producción para Coolify.
#
# Multi-etapa: las dependencias de build no llegan a la imagen final. El
# resultado son unos ~100 MB sobre node:24-alpine.
#
# La imagen NO lleva el CLI de Prisma: arrastra 91 paquetes y 237 MB, casi todo
# dependencias de Prisma Studio, para ejecutar unas cuantas sentencias DDL. Las
# migraciones las aplica scripts/migrate-deploy.ts sobre `pg`, que ya viene en
# la salida standalone de Next.

# --- 1. Dependencias ---------------------------------------------------------
FROM node:24-alpine AS deps
WORKDIR /app

COPY package.json package-lock.json ./
# Prisma necesita su postinstall para descargar los motores de consulta, así que
# aquí no se usa --ignore-scripts.
RUN npm ci

# --- 2. Build ----------------------------------------------------------------
FROM node:24-alpine AS builder
WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# `npm run build` = prisma generate + next build + empaquetado de los scripts.
# Ninguno de los tres necesita conexión a la base de datos.
RUN npm run build

# --- 3. Runtime --------------------------------------------------------------
FROM node:24-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV TZ=Europe/Madrid

# tzdata para que TZ funcione de verdad en Alpine; sin él el contenedor se queda
# en UTC y "hoy" cambia a medianoche de Londres, no de Madrid.
RUN apk add --no-cache tzdata \
  && addgroup -g 1001 -S nodejs \
  && adduser -S nextjs -u 1001

# Salida standalone: trae server.js y solo los node_modules que la app usa en
# runtime (incluidos `pg` y `@prisma/client`, de los que dependen los scripts).
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Scripts empaquetados con esbuild: migraciones, seed e importación de datos.
# No necesitan TypeScript ni tsx en runtime.
COPY --from=builder --chown=nextjs:nodejs /app/dist ./dist

# El SQL de las migraciones, que migrate-deploy.js lee en el arranque.
COPY --from=builder --chown=nextjs:nodejs /app/prisma/migrations ./prisma/migrations

COPY --chown=nextjs:nodejs docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

USER nextjs
EXPOSE 3000

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "server.js"]
