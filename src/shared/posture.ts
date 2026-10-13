import type { Posture } from './types';

export interface PostureSchedule {
  /** Seconds without interaction before the friend settles down. */
  idleSeconds: number;
  /** "HH:MM" when late night starts. */
  bedtime: string;
  /** "HH:MM" when late night ends. */
  wakeTime: string;
  /** Seconds of studying (one focus session) before a character that can leave takes a break. */
  studySeconds: number;
  /** How long that break lasts before it comes back to study. */
  breakSeconds: number;
}

export const defaultPostureSchedule: PostureSchedule = {
  idleSeconds: 5 * 60,
  bedtime: '23:00',
  wakeTime: '07:00',
  studySeconds: 20 * 60,
  breakSeconds: 3 * 60,
};

export const durationLimits = {
  idleSeconds: { min: 5, max: 4 * 60 * 60 },
  studySeconds: { min: 10, max: 4 * 60 * 60 },
  breakSeconds: { min: 5, max: 60 * 60 },
} as const;

export type DurationField = keyof typeof durationLimits;

const timePattern = /^([01]\d|2[0-3]):([0-5]\d)$/;

export const isTimeOfDay = (value: unknown): value is string =>
  typeof value === 'string' && timePattern.test(value);

export const isDuration = (field: DurationField, value: unknown): value is number =>
  typeof value === 'number'
  && Number.isInteger(value)
  && value >= durationLimits[field].min
  && value <= durationLimits[field].max;

/** 75 → "1:15", 3725 → "1:02:05". */
export const formatDuration = (totalSeconds: number): string => {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = String(seconds % 60).padStart(2, '0');
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${rest}` : `${minutes}:${rest}`;
};

/** Accepts "m:ss", "h:mm:ss", or a plain number of minutes. Returns seconds, or null if unreadable. */
export const parseDuration = (text: string): number | null => {
  const value = text.trim();
  if (/^\d+$/.test(value)) return Number(value) * 60;
  const parts = value.split(':');
  if (parts.length < 2 || parts.length > 3 || parts.some((part) => !/^\d+$/.test(part))) return null;
  const numbers = parts.map(Number);
  if (numbers.slice(1).some((part) => part > 59)) return null;
  return numbers.reduce((total, part) => total * 60 + part, 0);
};

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

/** The next moment (strictly after `now`) the clock reads `time`. */
const nextTimeOfDay = (now: Date, time: string): number => {
  const [hours, minutes] = time.split(':').map(Number);
  const next = new Date(now);
  next.setHours(hours, minutes, 0, 0);
  if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
  return next.getTime();
};

export interface PostureTimeline {
  posture: Posture;
  /** When this posture is due to change (epoch ms). */
  endsAt: number;
}

/**
 * Waving right after the app opens or the friend is touched; once left alone it studies, or sleeps
 * during late-night hours. A friend that can leave alternates between a study session of
 * `studySeconds` and a break of `breakSeconds`. Also says exactly when the current posture ends.
 */
export const postureTimeline = (
  now: Date,
  lastInteractionAt: number,
  schedule: PostureSchedule,
  canLeave = false,
): PostureTimeline => {
  const nowMs = now.getTime();
  const settleAt = lastInteractionAt + schedule.idleSeconds * 1000;
  if (nowMs < settleAt) return { posture: 'waving', endsAt: settleAt };

  if (isLateNight(now, schedule.bedtime, schedule.wakeTime)) {
    return { posture: 'sleeping', endsAt: nextTimeOfDay(now, schedule.wakeTime) };
  }
  const bedtimeAt = nextTimeOfDay(now, schedule.bedtime);
  if (!canLeave) return { posture: 'studying', endsAt: bedtimeAt };

  const studyMs = schedule.studySeconds * 1000;
  const cycleMs = studyMs + schedule.breakSeconds * 1000;
  const phase = (nowMs - settleAt) % cycleMs;
  return phase < studyMs
    ? { posture: 'studying', endsAt: Math.min(bedtimeAt, nowMs + studyMs - phase) }
    : { posture: 'away', endsAt: Math.min(bedtimeAt, nowMs + cycleMs - phase) };
};

export const choosePosture = (
  now: Date,
  lastInteractionAt: number,
  schedule: PostureSchedule,
  canLeave = false,
): Posture => postureTimeline(now, lastInteractionAt, schedule, canLeave).posture;
