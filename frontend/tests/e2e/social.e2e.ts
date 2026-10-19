// Friends, online status and groups, played out by the three test accounts against the running backend
// (through nginx, as in VITE_API_BASE_URL), using the app's own service code. Leaves a small demo state
// behind (see afterAll).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { inviteLink, parseInviteCode } from '../../src/shared/social';
import { apiUrl, isApiConfigured } from '../../src/renderer/services/api';
import { openEventStream, type StreamEvent } from '../../src/renderer/services/eventStream';
import { setSession, type AuthResponse } from '../../src/renderer/services/session';
import * as social from '../../src/renderer/services/social';

const PASSWORD = process.env.TEST_USER_PASSWORD || 'Friends#2026';
const names = ['amy', 'ben', 'cleo'] as const;
type Name = typeof names[number];

const sessions = {} as Record<Name, AuthResponse>;
const ids = {} as Record<Name, string>;
const closeStreams: (() => void)[] = [];

/** Runs the next service calls as this user. */
const as = (name: Name) => setSession(sessions[name], false);

const waitFor = async (check: () => boolean | Promise<boolean>, label: string, ms = 12_000) => {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Timed out waiting for: ${label}`);
};

/** Opens a user's live event stream and collects what arrives (like the app does). */
const watch = async (name: Name): Promise<StreamEvent[]> => {
  as(name);
  const events: StreamEvent[] = [];
  closeStreams.push(openEventStream((event) => events.push(event)));
  // The stream reads the session's token when it connects, so stay on this user until it is live.
  await waitFor(() => events.some((event) => event.name === 'ready'), `${name}'s event stream`);
  return events;
};

const findFriendship = async (viewer: Name, other: Name) => {
  as(viewer);
  return (await social.fetchFriendships()).find((item) => item.friend.id === ids[other]);
};

/** Removes every friendship, group and invitation of the test accounts and sets them offline. */
const reset = async () => {
  for (const name of names) {
    as(name);
    for (const group of await social.fetchGroups()) await social.leaveGroup(group.id);
    for (const invitation of await social.fetchGroupInvitations()) await social.respondGroupInvitation(invitation.id, false);
    for (const item of await social.fetchFriendships()) {
      if (item.kind === 'incoming') await social.respondFriendRequest(item.id, false);
      else await social.removeFriend(item.friend.id);
    }
    social.startReportingPresence();
    await social.stopReportingPresence();
  }
};

beforeAll(async () => {
  if (!isApiConfigured) throw new Error('Set VITE_API_BASE_URL in frontend/.env.');
  for (const name of names) {
    const response = await fetch(apiUrl('/auth/login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: `friend_${name}`, password: PASSWORD }),
    });
    if (!response.ok) throw new Error(`friend_${name} can't log in (run npm run users:test): ${response.status} ${await response.text()}`);
    sessions[name] = (await response.json()) as AuthResponse;
    ids[name] = sessions[name].profile.id;
  }
  await reset();
});

afterAll(async () => {
  closeStreams.forEach((close) => close());
  // Leave a small demo for trying the app: everyone is friends, Amy's "Study Buddies" has Ben, and Cleo
  // has an invitation to it.
  await reset();
  as('amy');
  await social.sendFriendRequest('friend_ben');
  await social.sendFriendRequest('friend_cleo');
  as('ben');
  await social.sendFriendRequest('friend_amy');
  await social.sendFriendRequest('friend_cleo');
  as('cleo');
  await social.sendFriendRequest('friend_amy');
  await social.sendFriendRequest('friend_ben');
  as('amy');
  const groupId = (await social.createGroup('Study Buddies')).id;
  await social.inviteToGroup(groupId, ids.ben);
  await social.inviteToGroup(groupId, ids.cleo);
  as('ben');
  const [invitation] = await social.fetchGroupInvitations();
  await social.respondGroupInvitation(invitation.id, true);
});

describe('0. the API itself', () => {
  it('turns away requests without a valid session', async () => {
    for (const authorization of [undefined, 'Bearer not-a-token']) {
      const response = await fetch(apiUrl('/friends'), { headers: authorization ? { Authorization: authorization } : {} });
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ status: 401, error: 'Your session ended. Log in again.' });
    }
  });

  it('answers wrong passwords and unknown addresses in its error format', async () => {
    const login = await fetch(apiUrl('/auth/login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'friend_amy', password: 'Wrong#2026' }),
    });
    expect(login.status).toBe(401);
    expect((await login.json()).error).toBe('Wrong username or password.');
    const health = await fetch(apiUrl('/health'));
    expect(await health.json()).toMatchObject({ status: 'UP' });
  });
});

describe('1. friends', () => {
  it('starts with no friends', async () => {
    as('amy');
    expect(await social.fetchFriendships()).toEqual([]);
  });

  it('sends a request by username; only the person asked sees who sent it (live)', async () => {
    const benEvents = await watch('ben');
    as('ben');
    social.startReportingPresence();
    await social.reportPresence('online');

    as('amy');
    expect(await social.sendFriendRequest('  Friend_Ben ')).toBe('pending');
    const amySide = await social.fetchFriendships();
    expect(amySide).toHaveLength(1);
    // Ben is online, but asking him doesn't reveal that to Amy.
    expect(amySide[0]).toMatchObject({ kind: 'outgoing', friend: { username: 'friend_ben', displayName: 'Ben', presence: 'offline', lastSeenAt: null } });

    await waitFor(() => benEvents.some((event) => event.name === 'friends'), 'Ben gets the request live');
    expect(await findFriendship('ben', 'amy')).toMatchObject({ kind: 'incoming', friend: { username: 'friend_amy', displayName: 'Amy' } });
    as('cleo');
    expect(await social.fetchFriendships()).toEqual([]);
    as('ben');
    await social.stopReportingPresence();
  });

  it('explains requests that cannot be sent', async () => {
    as('amy');
    await expect(social.sendFriendRequest('friend_ben')).rejects.toThrow('You already sent them a request.');
    await expect(social.sendFriendRequest('friend_amy')).rejects.toThrow("That's you! Add someone else.");
    await expect(social.sendFriendRequest('nobody_here_123')).rejects.toThrow('No one has the username "nobody_here_123".');
  });

  it('accepting makes both sides friends; nobody else can accept', async () => {
    const request = await findFriendship('ben', 'amy');
    as('cleo');
    await expect(social.respondFriendRequest(request!.id, true)).rejects.toThrow('no longer waiting');
    as('amy');
    await expect(social.respondFriendRequest(request!.id, true)).rejects.toThrow('no longer waiting');
    as('ben');
    await social.respondFriendRequest(request!.id, true);
    expect((await findFriendship('amy', 'ben'))?.kind).toBe('friend');
    expect((await findFriendship('ben', 'amy'))?.kind).toBe('friend');
    as('ben');
    await expect(social.sendFriendRequest('friend_amy')).rejects.toThrow('You are already friends.');
  });

  it('asking someone who already asked you accepts their request', async () => {
    as('cleo');
    expect(await social.sendFriendRequest('friend_amy')).toBe('pending');
    as('amy');
    expect(await social.sendFriendRequest('friend_cleo')).toBe('accepted');
    expect((await findFriendship('cleo', 'amy'))?.kind).toBe('friend');
  });

  it('declining and cancelling remove the request', async () => {
    as('cleo');
    await social.sendFriendRequest('friend_ben');
    const incoming = await findFriendship('ben', 'cleo');
    expect(incoming?.kind).toBe('incoming');
    as('ben');
    await social.respondFriendRequest(incoming!.id, false);
    expect(await findFriendship('cleo', 'ben')).toBeUndefined();

    as('cleo');
    await social.sendFriendRequest('friend_ben');
    await social.removeFriend(ids.ben);
    expect(await findFriendship('ben', 'cleo')).toBeUndefined();
  });

  it('unfriending works from either side', async () => {
    as('cleo');
    await social.removeFriend(ids.amy);
    expect(await findFriendship('amy', 'cleo')).toBeUndefined();
    // Make them friends again for the next steps.
    as('cleo');
    await social.sendFriendRequest('friend_amy');
    as('amy');
    await social.sendFriendRequest('friend_cleo');
  });
});

describe('2. online status', () => {
  it('friends see you go online, idle and offline, live; others are not told', async () => {
    const amyEvents = await watch('amy');
    const cleoEvents = await watch('cleo');
    const presenceOfBen = (events: StreamEvent[], status: string) =>
      events.some((event) => event.name === 'presence' && (event.data as { userId: string; presence: string }).userId === ids.ben
        && (event.data as { presence: string }).presence === status);

    as('ben');
    social.startReportingPresence();
    await social.reportPresence('online');
    expect((await findFriendship('amy', 'ben'))?.friend.presence).toBe('online');
    await waitFor(() => presenceOfBen(amyEvents, 'online'), 'Amy is told live that Ben is online');

    as('ben');
    await social.reportPresence('idle');
    expect((await findFriendship('amy', 'ben'))?.friend.presence).toBe('idle');
    await waitFor(() => presenceOfBen(amyEvents, 'idle'), 'Amy is told live that Ben is idle');

    as('ben');
    await social.stopReportingPresence();
    const offline = await findFriendship('amy', 'ben');
    expect(offline?.friend.presence).toBe('offline');
    expect(offline?.friend.lastSeenAt).not.toBeNull();
    await waitFor(() => presenceOfBen(amyEvents, 'offline'), 'Amy is told live that Ben went offline');

    // Cleo isn't Ben's friend: she gets none of his updates.
    expect(cleoEvents.some((event) => event.name === 'presence')).toBe(false);
  });

  it('a heartbeat already on its way cannot undo going offline', async () => {
    as('ben');
    social.startReportingPresence();
    void social.reportPresence('online');
    await social.stopReportingPresence();
    expect((await findFriendship('amy', 'ben'))?.friend.presence).toBe('offline');
    as('ben');
    await social.reportPresence('online'); // after logging out: ignored
    expect((await findFriendship('amy', 'ben'))?.friend.presence).toBe('offline');
  });
});

describe('3. groups', () => {
  let groupId = '';
  let code = '';

  it('creates a group with you as owner', async () => {
    as('amy');
    groupId = (await social.createGroup('  Test Group ')).id;
    const [group] = await social.fetchGroups();
    expect(group).toMatchObject({ id: groupId, name: 'Test Group', invitedIds: [] });
    expect(group.members.map((member) => [member.username, member.role])).toEqual([['friend_amy', 'owner']]);
    expect(group.inviteCode).toMatch(/^[0-9a-f]{12}$/);
    code = group.inviteCode;
    await expect(social.createGroup('   ')).rejects.toThrow('Group names are 1–40 characters.');
  });

  it('invites a friend, who is told live and joins', async () => {
    const benEvents = await watch('ben');
    as('amy');
    await social.inviteToGroup(groupId, ids.ben);
    await expect(social.inviteToGroup(groupId, ids.ben)).rejects.toThrow('They already have an invitation to this group.');
    expect((await social.fetchGroups())[0].invitedIds).toEqual([ids.ben]);
    await waitFor(() => benEvents.some((event) => event.name === 'groups'), 'Ben gets the invitation live');

    as('ben');
    expect(await social.fetchGroups()).toEqual([]);
    const [invitation] = await social.fetchGroupInvitations();
    expect(invitation).toMatchObject({ groupId, groupName: 'Test Group', inviter: { displayName: 'Amy', username: 'friend_amy' } });
    as('cleo');
    await expect(social.respondGroupInvitation(invitation.id, true)).rejects.toThrow('That invitation is no longer available.');
    as('ben');
    await social.respondGroupInvitation(invitation.id, true);
    const [group] = await social.fetchGroups();
    expect(group.members.map((member) => member.username)).toEqual(['friend_amy', 'friend_ben']);
    expect(await social.fetchGroupInvitations()).toEqual([]);
  });

  it('only invites friends, only by members, and not existing members', async () => {
    as('ben');
    await expect(social.inviteToGroup(groupId, ids.cleo)).rejects.toThrow('You can only invite your friends.');
    await expect(social.inviteToGroup(groupId, ids.amy)).rejects.toThrow('They are already in this group.');
    as('cleo');
    await expect(social.inviteToGroup(groupId, ids.amy)).rejects.toThrow('Only members can invite people to this group.');
    expect(await social.fetchGroups()).toEqual([]);
  });

  it('a declined invitation disappears', async () => {
    as('amy');
    await social.inviteToGroup(groupId, ids.cleo);
    as('cleo');
    const [invitation] = await social.fetchGroupInvitations();
    await social.respondGroupInvitation(invitation.id, false);
    expect(await social.fetchGroupInvitations()).toEqual([]);
    expect(await social.fetchGroups()).toEqual([]);
  });

  it("joins with the invite link, and members see each other's status", async () => {
    as('cleo');
    const pasted = ` ${inviteLink(code).toUpperCase()} `;
    const parsed = parseInviteCode(pasted);
    expect(parsed).toBe(code);
    await expect(social.joinGroupByCode('000000000000')).rejects.toThrow("That invite link doesn't work");
    expect(await social.joinGroupByCode(parsed!)).toBe(groupId);
    expect(await social.joinGroupByCode(parsed!)).toBe(groupId); // twice is harmless

    as('ben');
    social.startReportingPresence();
    await social.reportPresence('online');
    as('cleo');
    const [group] = await social.fetchGroups();
    expect(group.members).toHaveLength(3);
    // Cleo and Ben aren't friends, but share a group, so she sees his status.
    expect(group.members.find((member) => member.id === ids.ben)?.presence).toBe('online');
    as('ben');
    await social.stopReportingPresence();
  });

  it('only the owner resets the link; the old link stops working', async () => {
    as('ben');
    await expect(social.resetGroupInviteCode(groupId)).rejects.toThrow("Only the group's owner can reset its invite link.");
    as('amy');
    const fresh = await social.resetGroupInviteCode(groupId);
    expect(fresh).not.toBe(code);
    as('ben');
    await expect(social.joinGroupByCode(code)).rejects.toThrow("That invite link doesn't work");
  });

  it('an owner leaving hands the group on; the last one out deletes it', async () => {
    as('amy');
    await social.leaveGroup(groupId);
    expect(await social.fetchGroups()).toEqual([]);
    await expect(social.leaveGroup(groupId)).rejects.toThrow('You are not in this group.');
    as('ben');
    const [group] = await social.fetchGroups();
    expect(group.members.map((member) => [member.username, member.role])).toEqual([['friend_ben', 'owner'], ['friend_cleo', 'member']]);
    await social.leaveGroup(groupId);
    as('cleo');
    await social.leaveGroup(groupId);
    expect(await social.fetchGroups()).toEqual([]);
  });
});
