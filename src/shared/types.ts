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
  /** Seconds without interaction before the friend settles down. */
  idleSeconds: number;
  bedtime: string;
  wakeTime: string;
  /** Seconds of one focus session before a character with the "leave" gesture takes a break. */
  studySeconds: number;
  /** How long that break lasts, in seconds. */
  breakSeconds: number;
  /** Show a countdown of the current phase above the friend. */
  showTimer: boolean;
  avatarVisible: boolean;
  alwaysOnTop: boolean;
  hideInFullscreen: boolean;
  avatarPosition: { x: number; y: number } | null;
  hasSeenTrayHint: boolean;
}

export type CompanionSettingsUpdate = Partial<Pick<
  CompanionSettings,
  | 'characterId' | 'autoPosture' | 'idleSeconds' | 'bedtime' | 'wakeTime' | 'studySeconds' | 'breakSeconds'
  | 'showTimer' | 'avatarVisible' | 'alwaysOnTop' | 'hideInFullscreen'
>> & { activity?: Activity };

/** The automatic posture and when it is due to change (null when the posture is pinned). */
export interface PostureTimer {
  posture: Posture;
  endsAt: number | null;
}
