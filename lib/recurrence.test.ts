import { describe, expect, it } from 'vitest';
import {
  type Recurrence,
  occurrenceIndex,
  occurrencesInRange,
  resolveAssignee,
  shouldTrigger,
} from './recurrence';
import { addDays, isoWeekId, weekParity, weekStart } from './dates';

const USERS: [string, string] = ['user-1', 'user-2'];

describe('shouldTrigger - EVERY_N_DAYS', () => {
  const rec: Recurrence = { rule: { kind: 'EVERY_N_DAYS', n: 2 }, startDate: '2026-08-25' };

  it('dispara en el ancla y cada n dias', () => {
    expect(shouldTrigger(rec, '2026-08-25')).toBe(true);
    expect(shouldTrigger(rec, '2026-08-26')).toBe(false);
    expect(shouldTrigger(rec, '2026-08-27')).toBe(true);
    expect(shouldTrigger(rec, '2026-08-29')).toBe(true);
  });

  it('nunca dispara antes del ancla', () => {
    // La app antigua usaba Math.abs(diffDays) % n, asi que generaba tareas
    // hacia atras en el tiempo desde una fecha ancla inventada.
    expect(shouldTrigger(rec, '2026-08-23')).toBe(false);
    expect(shouldTrigger(rec, '2026-08-24')).toBe(false);
    expect(shouldTrigger(rec, '2020-01-01')).toBe(false);
  });

  it('respeta endDate', () => {
    const limited: Recurrence = { ...rec, endDate: '2026-08-27' };
    expect(shouldTrigger(limited, '2026-08-27')).toBe(true);
    expect(shouldTrigger(limited, '2026-08-29')).toBe(false);
  });

  it('cruza el cambio de hora sin desfase', () => {
    // En Europe/Madrid el 2026-03-29 tiene 23 horas.
    const dst: Recurrence = { rule: { kind: 'EVERY_N_DAYS', n: 2 }, startDate: '2026-03-27' };
    expect(shouldTrigger(dst, '2026-03-29')).toBe(true);
    expect(shouldTrigger(dst, '2026-03-30')).toBe(false);
    expect(shouldTrigger(dst, '2026-03-31')).toBe(true);
  });
});

describe('shouldTrigger - WEEKLY', () => {
  const rec: Recurrence = {
    rule: { kind: 'WEEKLY', daysOfWeek: [1, 4] },
    startDate: '2026-08-24',
  };

  it('solo dispara en los dias indicados', () => {
    expect(shouldTrigger(rec, '2026-08-24')).toBe(true);
    expect(shouldTrigger(rec, '2026-08-25')).toBe(false);
    expect(shouldTrigger(rec, '2026-08-27')).toBe(true);
    expect(shouldTrigger(rec, '2026-08-30')).toBe(false);
  });

  it('cuenta las ocurrencias en orden a traves de las semanas', () => {
    expect(occurrenceIndex(rec, '2026-08-24')).toBe(0);
    expect(occurrenceIndex(rec, '2026-08-27')).toBe(1);
    expect(occurrenceIndex(rec, '2026-08-31')).toBe(2);
    expect(occurrenceIndex(rec, '2026-09-03')).toBe(3);
  });

  it('no cuenta las ocurrencias anteriores al ancla en su propia semana', () => {
    const fromThursday: Recurrence = { ...rec, startDate: '2026-08-27' };
    expect(occurrenceIndex(fromThursday, '2026-08-27')).toBe(0);
    expect(occurrenceIndex(fromThursday, '2026-08-31')).toBe(1);
  });
});

describe('shouldTrigger - MONTHLY_DAY', () => {
  it('ajusta el dia 31 al ultimo dia de los meses cortos', () => {
    const rec: Recurrence = { rule: { kind: 'MONTHLY_DAY', day: 31 }, startDate: '2026-01-31' };
    expect(shouldTrigger(rec, '2026-01-31')).toBe(true);
    expect(shouldTrigger(rec, '2026-02-28')).toBe(true);
    expect(shouldTrigger(rec, '2026-02-27')).toBe(false);
    expect(shouldTrigger(rec, '2026-04-30')).toBe(true);
  });

  it('numera las ocurrencias por mes', () => {
    const rec: Recurrence = { rule: { kind: 'MONTHLY_DAY', day: 1 }, startDate: '2026-01-01' };
    expect(occurrenceIndex(rec, '2026-01-01')).toBe(0);
    expect(occurrenceIndex(rec, '2026-03-01')).toBe(2);
  });
});

describe('occurrencesInRange', () => {
  it('genera exactamente las fechas de la semana', () => {
    const rec: Recurrence = { rule: { kind: 'EVERY_N_DAYS', n: 2 }, startDate: '2026-08-24' };
    const found = occurrencesInRange(rec, '2026-08-24', '2026-08-30');
    expect(found.map((o) => o.date)).toEqual([
      '2026-08-24',
      '2026-08-26',
      '2026-08-28',
      '2026-08-30',
    ]);
    expect(found.map((o) => o.seq)).toEqual([0, 1, 2, 3]);
  });

  it('no devuelve nada antes de que empiece la plantilla', () => {
    const rec: Recurrence = { rule: { kind: 'DAILY' }, startDate: '2026-09-01' };
    expect(occurrencesInRange(rec, '2026-08-24', '2026-08-30')).toEqual([]);
  });
});

describe('resolveAssignee - ALTERNATE_TURN', () => {
  it('alterna en cada turno, no segun la paridad del calendario', () => {
    // Caso que rompia la app antigua: con epochDay % 2 y una recurrencia cada
    // 3 dias, la paridad del dia se repite y a la misma persona le toca varias
    // veces seguidas.
    const rec: Recurrence = { rule: { kind: 'EVERY_N_DAYS', n: 3 }, startDate: '2026-08-24' };
    const dates = occurrencesInRange(rec, '2026-08-24', '2026-09-10');

    const assignees = dates.map(({ date, seq }) =>
      resolveAssignee({ mode: 'ALTERNATE_TURN' }, { userIds: USERS, date, seq }),
    );

    expect(assignees).toEqual(['user-1', 'user-2', 'user-1', 'user-2', 'user-1', 'user-2']);
  });
});

describe('resolveAssignee - ALTERNATE_WEEKLY', () => {
  it('alterna en semanas consecutivas', () => {
    const mondays = ['2026-08-24', '2026-08-31', '2026-09-07', '2026-09-14'];
    const assignees = mondays.map((date) =>
      resolveAssignee({ mode: 'ALTERNATE_WEEKLY' }, { userIds: USERS, date, seq: 0 }),
    );
    expect(new Set(assignees).size).toBe(2);
    expect(assignees[0]).not.toBe(assignees[1]);
    expect(assignees[1]).not.toBe(assignees[2]);
    expect(assignees[2]).not.toBe(assignees[3]);
  });

  it('no repite persona al cruzar un ano de 53 semanas ISO', () => {
    // 2026 empieza en jueves, asi que tiene semana 53. Con el calculo antiguo
    // (numeroDeSemana % 2), W53 y W01 son ambas impares -> misma persona dos
    // semanas seguidas.
    const w52 = '2026-12-21';
    const w53 = '2026-12-28';
    const w01 = '2027-01-04';

    expect(isoWeekId(w52)).toBe('2026-W52');
    expect(isoWeekId(w53)).toBe('2026-W53');
    expect(isoWeekId(w01)).toBe('2027-W01');

    const pick = (date: string) =>
      resolveAssignee({ mode: 'ALTERNATE_WEEKLY' }, { userIds: USERS, date, seq: 0 });

    expect(pick(w52)).not.toBe(pick(w53));
    expect(pick(w53)).not.toBe(pick(w01));
  });

  it('asigna la misma persona a todos los dias de una misma semana', () => {
    const start = weekStart('2026-08-26', 'monday');
    const picks = Array.from({ length: 7 }, (_, i) =>
      resolveAssignee(
        { mode: 'ALTERNATE_WEEKLY' },
        { userIds: USERS, date: addDays(start, i), seq: 0 },
      ),
    );
    expect(new Set(picks).size).toBe(1);
  });
});

describe('paridad de semana', () => {
  it('es continua a lo largo de 200 semanas', () => {
    let previous = weekParity('2026-01-05');
    for (let i = 1; i < 200; i++) {
      const current = weekParity(addDays('2026-01-05', i * 7));
      expect(current).not.toBe(previous);
      previous = current;
    }
  });
});
