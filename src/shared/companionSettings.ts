import { defaultPostureSchedule } from './posture';
import type { CompanionSettings } from './types';

export const defaultCompanionSettings: CompanionSettings = {
  characterId: 'crystal',
  activity: 'waving',
  autoPosture: true,
  ...defaultPostureSchedule,
  showTimer: true,
  avatarVisible: true,
  avatarSize: 'medium',
  alwaysOnTop: true,
  hideInFullscreen: true,
  avatarPosition: null,
  hasSeenTrayHint: false,
};
