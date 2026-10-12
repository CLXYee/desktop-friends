import type { Posture } from './types';

export interface PostureSchedule {
  /** Minutes without interaction before the friend settles down. */
  idleMinutes: number;
  /** "HH:MM" when late night starts. */
  bedtime: string;
  /** "HH:MM" when late night ends. */
  wakeTime: string;
  /** Minutes of studying before a character that can leave takes a break. */
  leaveAfterMinutes: number;
  /** How long that break lasts before it comes back to study. */
  awayMinutes: number;
}

export const defaultPostureSchedule: PostureSchedule = {
  idleMinutes: 5,
  bedtime: '23:00',
  wakeTime: '07:00',
  leaveAfterMinutes: 20,
  awayMinutes: 3,
};

export const MIN_IDLE_MINUTES = 1;
export const MAX_IDLE_MINUTES = 240;
export const MAX_AWAY_MINUTES = 60;

const timePattern = /^([01]\d|2[0-3]):([0-5]\d)$/;

export const isTimeOfDay = (value: unknown): value is string =>
  typeof value === 'string' && timePattern.test(value);

const isWholeMinutes = (value: unknown, max: number): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= MIN_IDLE_MINUTES && value <= max;

export const isIdleMinutes = (value: unknown): value is number => isWholeMinutes(value, MAX_IDLE_MINUTES);
export const isAwayMinutes = (value: unknown): value is number => isWholeMinutes(value, MAX_AWAY_MINUTES);

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
 * or sleeps during late-night hours. A friend that can leave alternates between studying for
 * `leaveAfterMinutes` and stepping out for `awayMinutes`.
 */
export const choosePosture = (
  now: Date,
  lastInteractionAt: number,
  schedule: PostureSchedule,
  canLeave = false,
): Posture => {
  const idleMs = now.getTime() - lastInteractionAt;
  const settleMs = schedule.idleMinutes * 60_000;
  if (idleMs < settleMs) return 'waving';
  if (isLateNight(now, schedule.bedtime, schedule.wakeTime)) return 'sleeping';
  if (!canLeave) return 'studying';

  const studyMs = schedule.leaveAfterMinutes * 60_000;
  const cycleMs = studyMs + schedule.awayMinutes * 60_000;
  return (idleMs - settleMs) % cycleMs < studyMs ? 'studying' : 'away';
};
