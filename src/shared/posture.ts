import type { Activity } from './types';

export interface PostureSchedule {
  /** Minutes without interaction before the friend settles down. */
  idleMinutes: number;
  /** "HH:MM" when late night starts. */
  bedtime: string;
  /** "HH:MM" when late night ends. */
  wakeTime: string;
}

export const defaultPostureSchedule: PostureSchedule = {
  idleMinutes: 5,
  bedtime: '23:00',
  wakeTime: '07:00',
};

export const MIN_IDLE_MINUTES = 1;
export const MAX_IDLE_MINUTES = 240;

const timePattern = /^([01]\d|2[0-3]):([0-5]\d)$/;

export const isTimeOfDay = (value: unknown): value is string =>
  typeof value === 'string' && timePattern.test(value);

export const isIdleMinutes = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= MIN_IDLE_MINUTES && value <= MAX_IDLE_MINUTES;

const minutesOfDay = (time: string): number => {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
};

/** True between bedtime and wake time, including windows that wrap past midnight. */
export const isLateNight = (now: Date, bedtime: string, wakeTime: string): boolean => {
  const current = now.getHours() * 60 + now.getMinutes();
  const start = minutesOfDay(bedtime);
  const end = minutesOfDay(wakeTime);
  if (start === end) return false;
  return start < end
    ? current >= start && current < end
    : current >= start || current < end;
};

/**
 * Waving right after the app opens or the friend is touched; once left alone it studies,
 * or sleeps during late-night hours.
 */
export const choosePosture = (now: Date, lastInteractionAt: number, schedule: PostureSchedule): Activity => {
  const isIdle = now.getTime() - lastInteractionAt >= schedule.idleMinutes * 60_000;
  if (!isIdle) return 'waving';
  return isLateNight(now, schedule.bedtime, schedule.wakeTime) ? 'sleeping' : 'studying';
};
