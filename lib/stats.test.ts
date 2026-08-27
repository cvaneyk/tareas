import { describe, expect, it } from 'vitest';
import { calculateStats, type StatsInput } from './stats';

const USERS: [string, string] = ['user-1', 'user-2'];

function task(over: Partial<StatsInput>): StatsInput {
  return {
    status: 'PENDING',
    weight: 1,
    estimatedMinutes: 15,
    category: 'hogar',
    assignedToId: 'user-1',
    completedById: null,
    ...over,
  };
}

describe('calculateStats', () => {
  it('devuelve ceros y 50/50 sin tareas', () => {
    const stats = calculateStats([], USERS);
    expect(stats.completionRate).toBe(0);
    expect(stats.user1.pointsPercent).toBe(50);
    expect(stats.user2.pointsPercent).toBe(50);
  });

  it('las omitidas no penalizan el cumplimiento', () => {
    const stats = calculateStats(
      [
        task({ status: 'COMPLETED', completedById: 'user-1' }),
        task({ status: 'SKIPPED' }),
      ],
      USERS,
    );
    expect(stats.totalTasks).toBe(1);
    expect(stats.skippedTasks).toBe(1);
    expect(stats.completionRate).toBe(100);
  });

  it('atribuye los puntos a quien la completa, no a quien la tenía asignada', () => {
    const stats = calculateStats(
      [task({ status: 'COMPLETED', assignedToId: 'user-1', completedById: 'user-2', weight: 3 })],
      USERS,
    );
    expect(stats.user2.pointsDone).toBe(3);
    expect(stats.user1.pointsDone).toBe(0);
    expect(stats.user1.pointsAssigned).toBe(3);
  });

  it('los porcentajes de reparto suman 100', () => {
    const stats = calculateStats(
      [
        task({ status: 'COMPLETED', completedById: 'user-1', weight: 2 }),
        task({ status: 'COMPLETED', completedById: 'user-2', weight: 1 }),
      ],
      USERS,
    );
    expect(stats.user1.pointsPercent + stats.user2.pointsPercent).toBe(100);
    expect(stats.user1.pointsPercent).toBe(67);
  });

  it('cuenta por categoria solo lo completado', () => {
    const stats = calculateStats(
      [
        task({ status: 'COMPLETED', category: 'cocina', completedById: 'user-1' }),
        task({ status: 'PENDING', category: 'cocina' }),
      ],
      USERS,
    );
    expect(stats.categoryCounts.cocina).toBe(1);
  });
});
