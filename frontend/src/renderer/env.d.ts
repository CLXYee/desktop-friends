/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** The backend's API, through nginx, e.g. http://localhost:8088/api. */
  readonly VITE_API_BASE_URL?: string;
}

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
    characterPortrait: (characterId: string) => Promise<string | null>;
    presence: {
      getStatus: () => Promise<import('../shared/types').PresenceStatus>;
      onStatus: (listener: (status: import('../shared/types').PresenceStatus) => void) => () => void;
      onQuitting: (listener: () => void) => () => void;
      quitReady: () => void;
    };
    avatar: {
      moveTo: (x: number, y: number) => void;
      endDrag: () => void;
      showContextMenu: () => void;
      interact: () => void;
    };
  };
}
