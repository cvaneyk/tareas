import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

/** Health check para Coolify. Comprueba que la base de datos responde. */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    const [users, templates, occurrences] = await Promise.all([
      prisma.user.count(),
      prisma.taskTemplate.count(),
      prisma.taskOccurrence.count(),
    ]);

    return NextResponse.json({
      status: 'ok',
      time: new Date().toISOString(),
      timezone: process.env.TZ ?? null,
      records: { users, templates, occurrences },
    });
  } catch (error) {
    return NextResponse.json(
      { status: 'error', error: error instanceof Error ? error.message : 'desconocido' },
      { status: 503 },
    );
  }
}
