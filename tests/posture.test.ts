import { describe, expect, it } from 'vitest';
import { choosePosture, defaultPostureSchedule, isIdleMinutes, isLateNight, isTimeOfDay } from '../src/shared/posture';

const at = (time: string) => new Date(`2026-10-12T${time}:00`);
const minutesAgo = (now: Date, minutes: number) => now.getTime() - minutes * 60_000;

describe('isLateNight', () => {
  it('handles a bedtime window that wraps past midnight', () => {
    expect(isLateNight(at('22:59'), '23:00', '07:00')).toBe(false);
    expect(isLateNight(at('23:00'), '23:00', '07:00')).toBe(true);
    expect(isLateNight(at('03:30'), '23:00', '07:00')).toBe(true);
    expect(isLateNight(at('07:00'), '23:00', '07:00')).toBe(false);
  });

  it('handles a window within the same day', () => {
    expect(isLateNight(at('00:59'), '01:00', '09:00')).toBe(false);
    expect(isLateNight(at('05:00'), '01:00', '09:00')).toBe(true);
    expect(isLateNight(at('09:00'), '01:00', '09:00')).toBe(false);
  });

  it('is never late when bedtime equals wake time', () => {
    expect(isLateNight(at('23:00'), '23:00', '23:00')).toBe(false);
  });
});

describe('choosePosture', () => {
  it('waves until the friend has been left alone long enough', () => {
    const now = at('14:00');
    expect(choosePosture(now, now.getTime(), defaultPostureSchedule)).toBe('waving');
    expect(choosePosture(now, minutesAgo(now, 4), defaultPostureSchedule)).toBe('waving');
  });

  it('studies when idle during the day', () => {
    const now = at('14:00');
    expect(choosePosture(now, minutesAgo(now, 5), defaultPostureSchedule)).toBe('studying');
  });

  it('sleeps when idle late at night', () => {
    const now = at('01:15');
    expect(choosePosture(now, minutesAgo(now, 30), defaultPostureSchedule)).toBe('sleeping');
  });

  it('still waves at night right after an interaction', () => {
    const now = at('01:15');
    expect(choosePosture(now, now.getTime(), defaultPostureSchedule)).toBe('waving');
  });
});

describe('validation', () => {
  it('accepts only HH:MM times', () => {
    expect(isTimeOfDay('07:05')).toBe(true);
    expect(isTimeOfDay('24:00')).toBe(false);
    expect(isTimeOfDay('7:05')).toBe(false);
  });

  it('accepts only whole idle minutes in range', () => {
    expect(isIdleMinutes(5)).toBe(true);
    expect(isIdleMinutes(0)).toBe(false);
    expect(isIdleMinutes(2.5)).toBe(false);
    expect(isIdleMinutes(241)).toBe(false);
  });
});
