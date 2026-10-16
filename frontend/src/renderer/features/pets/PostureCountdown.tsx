import { useEffect, useState, type CSSProperties } from 'react';
import { formatDuration } from '../../../shared/posture';
import type { Posture, PostureTimer } from '../../../shared/types';
import type { BubbleAnchor } from './bubbleAnchor';

const ENDING_SOON_SECONDS = 10;

const phases: Partial<Record<Posture, { icon: string; label: string }>> = {
  waving: { icon: '👋', label: 'until studying' },
  studying: { icon: '📚', label: 'of focus left' },
  away: { icon: '☕', label: 'until back from the break' },
};

/** The automatic posture's timer from the main process, kept up to date. */
export function usePostureTimer(): PostureTimer | null {
  const [timer, setTimer] = useState<PostureTimer | null>(null);
  useEffect(() => {
    const bridge: Window['desktopFriends'] | undefined = window.desktopFriends;
    if (!bridge) return;
    let active = true;
    void bridge.getPostureTimer().then((initial) => {
      if (active) setTimer(initial);
    });
    const unsubscribe = bridge.onPostureTimer(setTimer);
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);
  return timer;
}

interface PostureCountdownProps {
  timer: PostureTimer | null;
  /** Without breaks, studying lasts until bedtime, which isn't a focus countdown. */
  canTakeBreaks: boolean;
  /** The spot just above the character's head, reported by its avatar; nothing shows until it is known. */
  anchor: BubbleAnchor | null;
}

/** A small bubble that counts down the current phase, e.g. "📚 24:13" until the next break. */
export function PostureCountdown({ timer, canTakeBreaks, anchor }: PostureCountdownProps) {
  const [now, setNow] = useState(() => Date.now());
  const endsAt = timer?.endsAt ?? null;

  // Tick on each second boundary of the countdown, so it reaches 0:00 right as the phase ends.
  useEffect(() => {
    if (endsAt === null) return;
    let timeout: ReturnType<typeof setTimeout>;
    const tick = () => {
      const current = Date.now();
      setNow(current);
      timeout = setTimeout(tick, ((endsAt - current) % 1000 + 1000) % 1000 || 1000);
    };
    tick();
    return () => clearTimeout(timeout);
  }, [endsAt]);

  const phase = timer && phases[timer.posture];
  if (!anchor || !timer || endsAt === null || !phase || (timer.posture === 'studying' && !canTakeBreaks)) return null;

  const remaining = Math.max(0, Math.ceil((endsAt - now) / 1000));
  const isEnding = remaining <= ENDING_SOON_SECONDS;
  return (
    <div
      className="posture-countdown-anchor"
      style={{ '--anchor-x': `${anchor.x}px`, '--anchor-y': `${anchor.y}px` } as CSSProperties}
    >
      <div
        className={`posture-countdown${isEnding ? ' posture-countdown-ending' : ''}`}
        role="timer"
        aria-label={`${formatDuration(remaining)} ${phase.label}`}
      >
        <span aria-hidden="true">{phase.icon}</span>
        <span className="posture-countdown-time">{formatDuration(remaining)}</span>
      </div>
    </div>
  );
}
