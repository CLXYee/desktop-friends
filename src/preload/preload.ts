import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type { CompanionSettings, CompanionSettingsUpdate } from '../shared/types';

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
  openMainWindow: (): void => ipcRenderer.send('app:open-main-window'),
  avatar: {
    moveTo: (x: number, y: number): void => ipcRenderer.send('avatar:move', x, y),
    endDrag: (): void => ipcRenderer.send('avatar:drag-end'),
    showContextMenu: (): void => ipcRenderer.send('avatar:context-menu'),
  },
});
