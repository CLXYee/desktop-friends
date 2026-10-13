/// <reference types="vite/client" />

interface Window {
  desktopFriends: {
    platform: string;
    appVersion: string;
    getSettings: () => Promise<import('../shared/types').CompanionSettings>;
    updateSettings: (patch: import('../shared/types').CompanionSettingsUpdate) => void;
    onSettingsChanged: (listener: (settings: import('../shared/types').CompanionSettings) => void) => () => void;
    getPostureTimer: () => Promise<import('../shared/types').PostureTimer>;
    onPostureTimer: (listener: (timer: import('../shared/types').PostureTimer) => void) => () => void;
    openMainWindow: () => void;
    authStore: {
      canRemember: () => Promise<boolean>;
      read: () => Promise<Record<string, string> | null>;
      write: (items: Record<string, string>) => void;
      clear: () => void;
    };
    account: {
      setSignedIn: (signedIn: boolean) => void;
    };
    avatar: {
      moveTo: (x: number, y: number) => void;
      endDrag: () => void;
      showContextMenu: () => void;
      interact: () => void;
    };
  };
}
