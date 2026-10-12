import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { isActivity, isCharacterId } from '../shared/characters';
import { defaultCompanionSettings as defaultSettings } from '../shared/companionSettings';
import { isIdleMinutes, isTimeOfDay } from '../shared/posture';
import type { CompanionSettings } from '../shared/types';

const settingsPath = () => path.join(app.getPath('userData'), 'companion-settings.json');

const isPosition = (value: unknown): value is { x: number; y: number } =>
  typeof value === 'object' && value !== null
  && Number.isFinite((value as { x: unknown }).x)
  && Number.isFinite((value as { y: unknown }).y);

export const loadSettings = (): CompanionSettings => {
  try {
    const stored = JSON.parse(fs.readFileSync(settingsPath(), 'utf8')) as Record<string, unknown>;
    return {
      characterId: isCharacterId(stored.characterId) ? stored.characterId : defaultSettings.characterId,
      activity: isActivity(stored.activity) ? stored.activity : defaultSettings.activity,
      autoPosture: typeof stored.autoPosture === 'boolean' ? stored.autoPosture : defaultSettings.autoPosture,
      idleMinutes: isIdleMinutes(stored.idleMinutes) ? stored.idleMinutes : defaultSettings.idleMinutes,
      bedtime: isTimeOfDay(stored.bedtime) ? stored.bedtime : defaultSettings.bedtime,
      wakeTime: isTimeOfDay(stored.wakeTime) ? stored.wakeTime : defaultSettings.wakeTime,
      avatarVisible: typeof stored.avatarVisible === 'boolean' ? stored.avatarVisible : defaultSettings.avatarVisible,
      alwaysOnTop: typeof stored.alwaysOnTop === 'boolean' ? stored.alwaysOnTop : defaultSettings.alwaysOnTop,
      hideInFullscreen: typeof stored.hideInFullscreen === 'boolean' ? stored.hideInFullscreen : defaultSettings.hideInFullscreen,
      avatarPosition: isPosition(stored.avatarPosition) ? stored.avatarPosition : null,
      hasSeenTrayHint: stored.hasSeenTrayHint === true,
    };
  } catch {
    return { ...defaultSettings };
  }
};

export const saveSettings = (settings: CompanionSettings): void => {
  try {
    fs.mkdirSync(path.dirname(settingsPath()), { recursive: true });
    fs.writeFileSync(settingsPath(), JSON.stringify(settings, null, 2));
  } catch (error) {
    console.error('Companion settings could not be saved:', error);
  }
};
