import { useCallback, useState } from 'react';
import { presenceLabel } from '../../../shared/social';
import type { PresenceStatus } from '../../../shared/types';
import { useSocial } from './social';

export function PresenceDot({ presence }: { presence: PresenceStatus }) {
  return <span className={`presence-dot presence-dot-${presence}`} title={presenceLabel(presence)} aria-hidden="true" />;
}

export interface ActionNotice {
  tone: 'ok' | 'error';
  text: string;
}

/**
 * Runs one friend or group action at a time: tracks which one is busy, shows its outcome, and refreshes
 * the lists right away (realtime would catch up too, a moment later).
 */
export const useSocialAction = () => {
  const { refresh } = useSocial();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [notice, setNotice] = useState<ActionNotice | null>(null);

  const run = useCallback(async (key: string, action: () => Promise<string | void>): Promise<boolean> => {
    setBusyKey(key);
    setNotice(null);
    try {
      const success = await action();
      if (success) setNotice({ tone: 'ok', text: success });
      return true;
    } catch (error) {
      setNotice({ tone: 'error', text: (error as Error).message });
      return false;
    } finally {
      setBusyKey(null);
      void refresh();
    }
  }, [refresh]);

  return { busyKey, isBusy: busyKey !== null, notice, setNotice, run };
};

export function Notice({ notice }: { notice: ActionNotice | null }) {
  return (
    <div className="social-notice-slot" aria-live="polite">
      {notice && (
        <p className={`social-notice social-notice-${notice.tone}`} role={notice.tone === 'error' ? 'alert' : 'status'}>
          {notice.text}
        </p>
      )}
    </div>
  );
}
