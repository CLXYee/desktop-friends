export type Activity = 'waving' | 'studying' | 'sleeping' | 'gaming';

/** What the friend is doing right now: an animation, or out of sight on a break (characters with the "leave" gesture). */
export type Posture = Activity | 'away';

export type Gesture = 'leave' | 'starJump';

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
  activity: Posture;
  /** When on, the friend picks its own posture: waving, then studying, or sleeping late at night. */
  autoPosture: boolean;
  idleMinutes: number;
  bedtime: string;
  wakeTime: string;
  /** Minutes of studying before a character with the "leave" gesture takes a break. */
  leaveAfterMinutes: number;
  /** How long that break lasts. */
  awayMinutes: number;
  avatarVisible: boolean;
  alwaysOnTop: boolean;
  hideInFullscreen: boolean;
  avatarPosition: { x: number; y: number } | null;
  hasSeenTrayHint: boolean;
}

export type CompanionSettingsUpdate = Partial<Pick<
  CompanionSettings,
  | 'characterId' | 'autoPosture' | 'idleMinutes' | 'bedtime' | 'wakeTime' | 'leaveAfterMinutes' | 'awayMinutes'
  | 'avatarVisible' | 'alwaysOnTop' | 'hideInFullscreen'
>> & { activity?: Activity };
