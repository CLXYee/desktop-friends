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
    avatar: {
      moveTo: (x: number, y: number) => void;
      endDrag: () => void;
      showContextMenu: () => void;
      interact: () => void;
    };
  };
}
