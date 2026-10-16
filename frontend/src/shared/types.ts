import type { AvatarSize } from './avatarSize';

export type Activity = 'waving' | 'studying' | 'sleeping' | 'gaming';

/** What the friend is doing right now: an animation, or out of sight on a break (characters with the "leave" gesture). */
export type Posture = Activity | 'away';

export type Gesture = 'leave' | 'starJump';

/** The status a friend shows: reported by their app, or offline once it stops reporting. */
export type PresenceStatus = 'online' | 'idle' | 'offline';

/** Someone you can see: yourself, a friend, someone with a pending request, or a fellow group member. */
export interface FriendProfile {
  id: string;
  username: string;
  displayName: string;
  presence: PresenceStatus;
  lastSeenAt: string | null;
}

/** A friendship from the signed-in user's side: an accepted friend or a request either way. */
export interface Friendship {
  id: string;
  kind: 'friend' | 'incoming' | 'outgoing';
  friend: FriendProfile;
  createdAt: string;
}

export interface GroupMember extends FriendProfile {
  role: 'owner' | 'member';
  joinedAt: string;
}

export interface FriendGroup {
  id: string;
  name: string;
  inviteCode: string;
  createdAt: string;
  /** Owner first, then by when they joined. */
  members: GroupMember[];
  /** People already invited and not yet answered (their ids). */
  invitedIds: string[];
}

/** An invitation to a group, sent to the signed-in user. */
export interface GroupInvitation {
  id: string;
  groupId: string;
  groupName: string;
  inviter: { displayName: string; username: string } | null;
  createdAt: string;
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
  /** How big the friend is, relative to the screen it stands on. */
  avatarSize: AvatarSize;
  alwaysOnTop: boolean;
  hideInFullscreen: boolean;
  avatarPosition: { x: number; y: number } | null;
  hasSeenTrayHint: boolean;
}

export type CompanionSettingsUpdate = Partial<Pick<
  CompanionSettings,
  | 'characterId' | 'autoPosture' | 'idleSeconds' | 'bedtime' | 'wakeTime' | 'studySeconds' | 'breakSeconds'
  | 'showTimer' | 'avatarVisible' | 'avatarSize' | 'alwaysOnTop' | 'hideInFullscreen'
>> & { activity?: Activity };

/** The automatic posture and when it is due to change (null when the posture is pinned). */
export interface PostureTimer {
  posture: Posture;
  endsAt: number | null;
}
