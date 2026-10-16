import type { FriendGroup, Friendship, GroupInvitation, PresenceStatus } from '../../shared/types';
import { apiRequest } from './api';

// Friends, online status and groups, through the backend's REST API. The backend checks every rule (who may
// befriend, invite or see whom) and answers refusals with a message the app shows as is.

// Status reports run one after another, so "offline" on logout or quit can't be overtaken by a heartbeat
// that was already on its way; once stopped, only "offline" is sent until reporting starts again.
let isReportingPresence = false;
let presenceQueue: Promise<void> = Promise.resolve();

const queueStatus = (status: PresenceStatus): Promise<void> => {
  presenceQueue = presenceQueue
    .catch(() => undefined)
    .then(() => apiRequest<void>('/presence', { method: 'PUT', body: { status } }));
  return presenceQueue;
};

/** Starts reporting the signed-in user's status (call when someone signs in). */
export const startReportingPresence = (): void => {
  isReportingPresence = true;
};

/** Reports online or idle; ignored after stopReportingPresence until reporting starts again. */
export const reportPresence = (status: Exclude<PresenceStatus, 'offline'>): Promise<void> =>
  (isReportingPresence ? queueStatus(status) : Promise.resolve());

/** Reports the user offline and stops further reports (before logging out or quitting). Never throws. */
export const stopReportingPresence = async (): Promise<void> => {
  isReportingPresence = false;
  await queueStatus('offline').catch(() => undefined);
};

interface FriendListResponse {
  friends: Friendship[];
  incoming: Friendship[];
  outgoing: Friendship[];
}

/** Your friends, requests waiting for you, and requests you sent (without the other person's status). */
export const fetchFriendships = async (): Promise<Friendship[]> => {
  const { friends, incoming, outgoing } = await apiRequest<FriendListResponse>('/friends');
  return [...friends, ...incoming, ...outgoing];
};

export const sendFriendRequest = async (username: string): Promise<'pending' | 'accepted'> =>
  (await apiRequest<{ status: 'pending' | 'accepted' }>('/friends/requests', { method: 'POST', body: { username } })).status;

export const respondFriendRequest = (requestId: string, accept: boolean): Promise<void> =>
  apiRequest(`/friends/requests/${encodeURIComponent(requestId)}/${accept ? 'accept' : 'decline'}`, { method: 'POST' });

/** Unfriends someone, or cancels a request you sent them. */
export const removeFriend = (friendId: string): Promise<void> =>
  apiRequest(`/friends/${encodeURIComponent(friendId)}`, { method: 'DELETE' });

/** The groups you belong to (groups you are only invited to come from fetchGroupInvitations). */
export const fetchGroups = (): Promise<FriendGroup[]> => apiRequest<FriendGroup[]>('/groups');

export const fetchGroupInvitations = (): Promise<GroupInvitation[]> => apiRequest<GroupInvitation[]>('/group-invitations');

/** Creates a group with you as its owner; returns its id. */
export const createGroup = async (name: string): Promise<string> =>
  (await apiRequest<FriendGroup>('/groups', { method: 'POST', body: { name } })).id;

export const inviteToGroup = (groupId: string, friendId: string): Promise<void> =>
  apiRequest(`/groups/${encodeURIComponent(groupId)}/invitations`, { method: 'POST', body: { friendId } });

export const respondGroupInvitation = (invitationId: string, accept: boolean): Promise<void> =>
  apiRequest(`/group-invitations/${encodeURIComponent(invitationId)}/${accept ? 'accept' : 'decline'}`, { method: 'POST' });

/** Joins with an invite link or code; returns the group's id. */
export const joinGroupByCode = async (code: string): Promise<string> =>
  (await apiRequest<{ groupId: string }>('/groups/join', { method: 'POST', body: { code } })).groupId;

export const leaveGroup = (groupId: string): Promise<void> =>
  apiRequest(`/groups/${encodeURIComponent(groupId)}/leave`, { method: 'POST' });

/** Owner only: replaces the invite code; returns the new one. */
export const resetGroupInviteCode = async (groupId: string): Promise<string> =>
  (await apiRequest<{ inviteCode: string }>(`/groups/${encodeURIComponent(groupId)}/invite-code/reset`, { method: 'POST' })).inviteCode;
