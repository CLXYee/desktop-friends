// Friends, presence and group rules shared by the app and its tests. The backend enforces the same rules
// (backend/src/main/java/com/desktopfriends/backend/service).
import type { FriendProfile, PresenceStatus } from './types';

/** How often a running app re-reports its status; the backend treats a status older than 3 minutes as offline. */
export const PRESENCE_HEARTBEAT_MS = 60_000;
/** Seconds without keyboard or mouse input before someone shows as idle. */
export const PRESENCE_IDLE_SECONDS = 5 * 60;

export const GROUP_NAME_MAX = 40;
export const GROUP_DESCRIPTION_MAX = 200;

export const presenceStatuses: { value: PresenceStatus; label: string }[] = [
  { value: 'online', label: 'Online' },
  { value: 'idle', label: 'Idle' },
  { value: 'offline', label: 'Offline' },
];

export const isPresenceStatus = (value: unknown): value is PresenceStatus =>
  presenceStatuses.some((item) => item.value === value);

export const presenceLabel = (status: PresenceStatus): string =>
  presenceStatuses.find((item) => item.value === status)?.label ?? status;

const presenceRank: Record<PresenceStatus, number> = { online: 0, idle: 1, offline: 2 };

/** Online first, then idle, then offline; alphabetical by name within each. */
export const sortByPresence = <T extends Pick<FriendProfile, 'presence' | 'displayName'>>(people: T[]): T[] =>
  [...people].sort((a, b) => presenceRank[a.presence] - presenceRank[b.presence]
    || a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' }));

export const countByPresence = (people: Pick<FriendProfile, 'presence'>[]): Record<PresenceStatus, number> => {
  const counts: Record<PresenceStatus, number> = { online: 0, idle: 0, offline: 0 };
  for (const person of people) counts[person.presence] += 1;
  return counts;
};

/** "Seen 5 min ago" style text for an offline friend (null when there is nothing useful to say). */
export const lastSeenLabel = (lastSeenAt: string | null, now = Date.now()): string | null => {
  if (!lastSeenAt) return null;
  const minutes = Math.floor((now - Date.parse(lastSeenAt)) / 60_000);
  if (!Number.isFinite(minutes)) return null;
  if (minutes < 1) return 'Seen just now';
  if (minutes < 60) return `Seen ${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Seen ${hours} h ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? 'Seen yesterday' : `Seen ${days} days ago`;
};

// Invite links look like desktop-friends://join/<code>; the code is 12 hex characters.
export const INVITE_LINK_PREFIX = 'desktop-friends://join/';
const INVITE_CODE = /^[0-9a-f]{12}$/;

export const inviteLink = (code: string): string => `${INVITE_LINK_PREFIX}${code}`;

/** The invite code in a pasted link or bare code, or null when it isn't one. */
export const parseInviteCode = (input: string): string | null => {
  const text = input.trim().toLowerCase().replace(/\/+$/, '');
  const code = text.includes('/') ? text.slice(text.lastIndexOf('/') + 1) : text;
  if (text.includes('/') && !text.slice(0, -code.length).endsWith('join/')) return null;
  return INVITE_CODE.test(code) ? code : null;
};
