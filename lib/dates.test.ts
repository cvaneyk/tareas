import { describe, expect, it } from 'vitest';
import {
  addDays,
  daysBetween,
  epochDay,
  formatWeekRange,
  isoDayOfWeek,
  isoWeekId,
  toDateStr,
  toPrismaDate,
  weekDates,
  weekStart,
} from './dates';

describe('aritmetica de fechas civiles', () => {
  it('suma dias cruzando meses y anos', () => {
    expect(addDays('2026-08-31', 1)).toBe('2026-09-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2024-03-01', -1)).toBe('2024-02-29');
  });

  it('no se desplaza al cambiar la hora en Europe/Madrid', () => {
    expect(addDays('2026-03-28', 1)).toBe('2026-03-29');
    expect(addDays('2026-03-29', 1)).toBe('2026-03-30');
    expect(addDays('2026-10-24', 1)).toBe('2026-10-25');
    expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2);
    expect(daysBetween('2026-10-24', '2026-10-26')).toBe(2);
  });

  it('ida y vuelta por Prisma conserva el dia', () => {
    for (const date of ['2026-01-01', '2026-03-29', '2026-08-25', '2026-10-25', '2026-12-31']) {
      expect(toDateStr(toPrismaDate(date))).toBe(date);
    }
  });

  it('epochDay es monotono', () => {
    expect(epochDay('1970-01-01')).toBe(0);
    expect(epochDay('2026-08-26') - epochDay('2026-08-25')).toBe(1);
  });
});

describe('semanas', () => {
  it('isoDayOfWeek usa 1=lunes hasta 7=domingo', () => {
    expect(isoDayOfWeek('2026-08-24')).toBe(1);
    expect(isoDayOfWeek('2026-08-30')).toBe(7);
  });

  it('weekStart encuentra el lunes', () => {
    expect(weekStart('2026-08-26', 'monday')).toBe('2026-08-24');
    expect(weekStart('2026-08-24', 'monday')).toBe('2026-08-24');
    expect(weekStart('2026-08-30', 'monday')).toBe('2026-08-24');
  });

  it('weekStart soporta semanas que empiezan en domingo', () => {
    expect(weekStart('2026-08-26', 'sunday')).toBe('2026-08-23');
    expect(weekStart('2026-08-23', 'sunday')).toBe('2026-08-23');
  });

  it('weekDates devuelve 7 dias consecutivos', () => {
    const dates = weekDates('2026-08-24');
    expect(dates).toHaveLength(7);
    expect(dates[0]).toBe('2026-08-24');
    expect(dates[6]).toBe('2026-08-30');
  });

  it('isoWeekId sigue ISO 8601 en los bordes de ano', () => {
    expect(isoWeekId('2026-08-25')).toBe('2026-W35');
    expect(isoWeekId('2026-01-01')).toBe('2026-W01');
    expect(isoWeekId('2025-12-29')).toBe('2026-W01');
    expect(isoWeekId('2027-01-01')).toBe('2026-W53');
  });
});

describe('formato', () => {
  it('formatea el rango semanal en espanol', () => {
    const range = formatWeekRange('2026-08-24');
    expect(range).toContain('agosto');
    expect(range).toContain('24');
    expect(range).toContain('30');
  });
});
