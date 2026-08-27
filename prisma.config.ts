import 'dotenv/config';
import { defineConfig } from 'prisma/config';

/**
 * Configuración del CLI de Prisma, que solo se usa en desarrollo:
 * `prisma generate`, `prisma migrate dev`, `prisma studio`.
 *
 * En producción las migraciones las aplica scripts/migrate-deploy.ts, que no
 * necesita ni este fichero ni el CLI.
 *
 * `url` se lee directamente de process.env en vez de con el helper env() de
 * Prisma, porque ese helper lanza si la variable no existe — y `prisma generate`
 * corre durante el build de Docker, donde todavía no hay DATABASE_URL. Generar
 * el cliente no necesita conexión; los comandos que sí la necesitan fallarán
 * igualmente con un mensaje claro si falta.
 */
export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: process.env.DATABASE_URL ?? '',
  },
  migrations: {
    seed: 'tsx prisma/seed.ts',
  },
});
