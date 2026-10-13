import { describe, expect, it } from 'vitest';
import {
  choosePosture,
  defaultPostureSchedule,
  formatDuration,
  isDuration,
  isLateNight,
  isTimeOfDay,
  parseDuration,
  postureTimeline,
} from '../src/shared/posture';

const at = (time: string) => new Date(`2026-10-12T${time}:00`);
const minutesAgo = (now: Date, minutes: number) => now.getTime() - minutes * 60_000;
const secondsAgo = (now: Date, seconds: number) => now.getTime() - seconds * 1000;

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

  it('accepts only whole seconds within each duration range', () => {
    expect(isDuration('idleSeconds', 5)).toBe(true);
    expect(isDuration('idleSeconds', 4)).toBe(false);
    expect(isDuration('idleSeconds', 2.5)).toBe(false);
    expect(isDuration('studySeconds', 4 * 60 * 60)).toBe(true);
    expect(isDuration('breakSeconds', 60 * 60 + 1)).toBe(false);
  });

  it('formats and parses m:ss durations', () => {
    expect(formatDuration(75)).toBe('1:15');
    expect(formatDuration(5)).toBe('0:05');
    expect(formatDuration(3725)).toBe('1:02:05');
    expect(parseDuration('1:15')).toBe(75);
    expect(parseDuration('0:45')).toBe(45);
    expect(parseDuration('1:02:05')).toBe(3725);
    expect(parseDuration('25')).toBe(25 * 60);
    expect(parseDuration('1:75')).toBeNull();
    expect(parseDuration('abc')).toBeNull();
  });
});

describe('choosePosture with breaks', () => {
  // Defaults: settle after 5 min, study 20 min, break 3 min.
  const at2pm = at('14:00');

  it('never takes a break for characters that cannot leave', () => {
    expect(choosePosture(at2pm, minutesAgo(at2pm, 26), defaultPostureSchedule)).toBe('studying');
  });

  it('studies, then steps out, then comes back to study', () => {
    expect(choosePosture(at2pm, minutesAgo(at2pm, 24), defaultPostureSchedule, true)).toBe('studying');
    expect(choosePosture(at2pm, minutesAgo(at2pm, 25), defaultPostureSchedule, true)).toBe('away');
    expect(choosePosture(at2pm, minutesAgo(at2pm, 27), defaultPostureSchedule, true)).toBe('away');
    expect(choosePosture(at2pm, minutesAgo(at2pm, 28), defaultPostureSchedule, true)).toBe('studying');
    expect(choosePosture(at2pm, minutesAgo(at2pm, 48), defaultPostureSchedule, true)).toBe('away');
  });

  it('sleeps instead of taking breaks late at night', () => {
    const lateNight = at('01:00');
    expect(choosePosture(lateNight, minutesAgo(lateNight, 26), defaultPostureSchedule, true)).toBe('sleeping');
  });
});

describe('postureTimeline', () => {
  const at2pm = at('14:00');

  it('ends the waving phase exactly when the friend settles down', () => {
    const last = secondsAgo(at2pm, 10);
    expect(postureTimeline(at2pm, last, defaultPostureSchedule, true)).toEqual({
      posture: 'waving',
      endsAt: last + defaultPostureSchedule.idleSeconds * 1000,
    });
  });

  it('counts a focus session and a break down to the second', () => {
    const schedule = { ...defaultPostureSchedule, idleSeconds: 30, studySeconds: 90, breakSeconds: 45 };
    // 30s waving, then 100s in: 70s into the 90s session.
    const studying = postureTimeline(at2pm, secondsAgo(at2pm, 100), schedule, true);
    expect(studying).toEqual({ posture: 'studying', endsAt: at2pm.getTime() + 20_000 });
    // 125s in: 5s into the 45s break.
    const away = postureTimeline(at2pm, secondsAgo(at2pm, 125), schedule, true);
    expect(away).toEqual({ posture: 'away', endsAt: at2pm.getTime() + 40_000 });
  });

  it('stops a session at bedtime', () => {
    const almostBed = new Date('2026-10-12T22:59:50');
    const timeline = postureTimeline(almostBed, minutesAgo(almostBed, 10), defaultPostureSchedule, true);
    expect(timeline.endsAt).toBe(new Date('2026-10-12T23:00:00').getTime());
  });

  it('sleeps until wake time', () => {
    const night = at('01:00');
    const timeline = postureTimeline(night, minutesAgo(night, 30), defaultPostureSchedule, true);
    expect(timeline).toEqual({ posture: 'sleeping', endsAt: at('07:00').getTime() });
  });
});
