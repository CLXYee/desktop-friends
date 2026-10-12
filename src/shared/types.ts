export type Activity = 'waving' | 'studying' | 'sleeping' | 'gaming';

export interface Friend {
  id: string;
  displayName: string;
  avatarId: string;
  activity: Activity;
  isOnline: boolean;
}

export interface FriendGroup {
  id: string;
  name: string;
  memberIds: string[];
}

export interface FriendMessage {
  id: string;
  senderId: string;
  recipientId: string;
  body: string;
  createdAt: string;
}

export interface CompanionSettings {
  characterId: string;
  activity: Activity;
  /** When on, the friend picks its own posture: waving, then studying, or sleeping late at night. */
  autoPosture: boolean;
  idleMinutes: number;
  bedtime: string;
  wakeTime: string;
  avatarVisible: boolean;
  alwaysOnTop: boolean;
  hideInFullscreen: boolean;
  avatarPosition: { x: number; y: number } | null;
  hasSeenTrayHint: boolean;
}

export type CompanionSettingsUpdate = Partial<Pick<
  CompanionSettings,
  | 'characterId' | 'activity' | 'autoPosture' | 'idleMinutes' | 'bedtime' | 'wakeTime'
  | 'avatarVisible' | 'alwaysOnTop' | 'hideInFullscreen'
>>;
