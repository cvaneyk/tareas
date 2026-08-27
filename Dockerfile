# Imagen de producción para Coolify.
# Multi-etapa: las dependencias de build no llegan a la imagen final.

# --- 1. Dependencias ---------------------------------------------------------
FROM node:24-alpine AS deps
WORKDIR /app

COPY package.json package-lock.json ./
# --ignore-scripts está desactivado a propósito: Prisma necesita su postinstall
# para descargar los motores de consulta.
RUN npm ci

# --- 2. Build ----------------------------------------------------------------
FROM node:24-alpine AS builder
WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# `prisma generate` no necesita conexión a la base de datos, solo el esquema.
RUN npx prisma generate && npm run build

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

# Salida standalone: incluye solo los node_modules que la app usa en runtime.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Migraciones y seed. Los scripts van empaquetados por esbuild (dist/), asi que
# el contenedor no necesita TypeScript ni tsx en runtime.
COPY --from=builder --chown=nextjs:nodejs /app/dist ./dist
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/prisma.config.ts ./prisma.config.ts

# El CLI de Prisma y dotenv, que prisma.config.ts necesita para leer .env en local.
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/dotenv ./node_modules/dotenv
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.bin ./node_modules/.bin
COPY --chown=nextjs:nodejs docker-entrypoint.sh ./docker-entrypoint.sh

RUN chmod +x ./docker-entrypoint.sh

USER nextjs
EXPOSE 3000

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "server.js"]
