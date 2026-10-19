import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type { CompanionSettings, CompanionSettingsUpdate, PostureTimer, PresenceStatus } from '../shared/types';

contextBridge.exposeInMainWorld('desktopFriends', {
  platform: process.platform,
  appVersion: process.env.npm_package_version ?? '0.1.0',
  getSettings: (): Promise<CompanionSettings> => ipcRenderer.invoke('settings:get'),
  updateSettings: (patch: CompanionSettingsUpdate): void => ipcRenderer.send('settings:update', patch),
  onSettingsChanged: (listener: (settings: CompanionSettings) => void): (() => void) => {
    const handler = (_event: IpcRendererEvent, settings: CompanionSettings) => listener(settings);
    ipcRenderer.on('settings:changed', handler);
    return () => ipcRenderer.removeListener('settings:changed', handler);
  },
  getPostureTimer: (): Promise<PostureTimer> => ipcRenderer.invoke('posture:get-timer'),
  onPostureTimer: (listener: (timer: PostureTimer) => void): (() => void) => {
    const handler = (_event: IpcRendererEvent, timer: PostureTimer) => listener(timer);
    ipcRenderer.on('posture:timer', handler);
    return () => ipcRenderer.removeListener('posture:timer', handler);
  },
  openMainWindow: (): void => ipcRenderer.send('app:open-main-window'),
  authStore: {
    canRemember: (): Promise<boolean> => ipcRenderer.invoke('auth-store:can-remember'),
    read: (): Promise<Record<string, string> | null> => ipcRenderer.invoke('auth-store:read'),
    write: (items: Record<string, string>): void => ipcRenderer.send('auth-store:write', items),
    clear: (): void => ipcRenderer.send('auth-store:clear'),
  },
  account: {
    setSignedIn: (signedIn: boolean): void => ipcRenderer.send('account:signed-in', signedIn),
  },
  /** A character's portrait (head crop) as a PNG data URL, for chat avatars. */
  characterPortrait: (characterId: string): Promise<string | null> => ipcRenderer.invoke('avatar:portrait', characterId),
  presence: {
    getStatus: (): Promise<PresenceStatus> => ipcRenderer.invoke('presence:get'),
    /** Called when the user goes idle or comes back, and every minute as a heartbeat. */
    onStatus: (listener: (status: PresenceStatus) => void): (() => void) => {
      const handler = (_event: IpcRendererEvent, status: PresenceStatus) => listener(status);
      ipcRenderer.on('presence:status', handler);
      return () => ipcRenderer.removeListener('presence:status', handler);
    },
    /** Called when the app is about to quit; answer with quitReady() once offline has been reported. */
    onQuitting: (listener: () => void): (() => void) => {
      const handler = () => listener();
      ipcRenderer.on('presence:quitting', handler);
      return () => ipcRenderer.removeListener('presence:quitting', handler);
    },
    quitReady: (): void => ipcRenderer.send('presence:quit-ready'),
  },
  avatar: {
    moveTo: (x: number, y: number): void => ipcRenderer.send('avatar:move', x, y),
    endDrag: (): void => ipcRenderer.send('avatar:drag-end'),
    showContextMenu: (): void => ipcRenderer.send('avatar:context-menu'),
    interact: (): void => ipcRenderer.send('avatar:interact'),
  },
});
