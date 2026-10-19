// Group chats and direct messages, played out by the three test accounts against the running backend
// (through nginx, as in VITE_API_BASE_URL) and the hosted Supabase, using the app's own service code.
// Group-chat checks run in a throwaway group that is deleted at the end (its messages go with it); the
// direct messages between the test accounts stay as demo data.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ChatMessage, Conversation } from '../../src/shared/types';
import { apiUrl, isApiConfigured } from '../../src/renderer/services/api';
import * as chat from '../../src/renderer/services/chat';
import { openEventStream, type StreamEvent } from '../../src/renderer/services/eventStream';
import { setSession, type AuthResponse } from '../../src/renderer/services/session';
import * as social from '../../src/renderer/services/social';

const PASSWORD = process.env.TEST_USER_PASSWORD || 'Friends#2026';
const names = ['amy', 'ben', 'cleo'] as const;
type Name = typeof names[number];
const run = Date.now().toString(36);

const sessions = {} as Record<Name, AuthResponse>;
const ids = {} as Record<Name, string>;
const closeStreams: (() => void)[] = [];

/** Runs the next service calls as this user. */
const as = (name: Name) => setSession(sessions[name], false);

const waitFor = async <T>(find: () => T | undefined | Promise<T | undefined>, label: string, ms = 12_000): Promise<T> => {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    const found = await find();
    if (found) return found;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Timed out waiting for: ${label}`);
};

/** Opens a user's live event stream and collects what arrives (like the app does). */
const watch = async (name: Name): Promise<StreamEvent[]> => {
  as(name);
  const events: StreamEvent[] = [];
  closeStreams.push(openEventStream((event) => events.push(event)));
  await waitFor(() => events.find((event) => event.name === 'ready'), `${name}'s event stream`);
  return events;
};

const messageEvent = (events: StreamEvent[], type: string, test: (message: ChatMessage) => boolean) =>
  events.find((event) => event.name === type && test(event.data as ChatMessage));

const chatOf = async (name: Name, conversationId: string): Promise<Conversation | undefined> => {
  as(name);
  return (await chat.fetchConversations()).find((item) => item.id === conversationId);
};

/** Makes two of the test accounts friends unless they are already. */
const ensureFriends = async (first: Name, second: Name) => {
  as(first);
  const existing = (await social.fetchFriendships()).find((item) => item.friend.id === ids[second]);
  if (existing?.kind === 'friend') return;
  if (existing?.kind === 'incoming') {
    await social.respondFriendRequest(existing.id, true);
    return;
  }
  if (existing?.kind !== 'outgoing') await social.sendFriendRequest(`friend_${second}`);
  as(second);
  const request = (await social.fetchFriendships()).find((item) => item.kind === 'incoming' && item.friend.id === ids[first]);
  if (request) await social.respondFriendRequest(request.id, true);
};

let groupId = '';
let groupChatId = '';

beforeAll(async () => {
  if (!isApiConfigured) throw new Error('Set VITE_API_BASE_URL in frontend/.env.');
  for (const name of names) {
    const response = await fetch(apiUrl('/auth/login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: `friend_${name}`, password: PASSWORD }),
    });
    if (!response.ok) throw new Error(`friend_${name} can't log in (run npm run users:test): ${response.status}`);
    sessions[name] = (await response.json()) as AuthResponse;
    ids[name] = sessions[name].profile.id;
  }
  await ensureFriends('amy', 'ben');
  await ensureFriends('amy', 'cleo');
  await ensureFriends('ben', 'cleo');
});

afterAll(async () => {
  closeStreams.forEach((close) => close());
  // The throwaway group (and its whole chat) goes away when the last member leaves.
  for (const name of names) {
    as(name);
    if ((await social.fetchGroups()).some((group) => group.id === groupId)) await social.leaveGroup(groupId);
  }
});

describe('the characters people picked are their avatars', () => {
  it('saves the character and shows it with their messages', async () => {
    as('amy');
    await chat.updateMyCharacter('lovie');
    as('ben');
    await chat.updateMyCharacter('clover');
    as('cleo');
    await chat.updateMyCharacter('starry');
    as('ben');
    const amy = (await social.fetchFriendships()).find((item) => item.friend.id === ids.amy);
    expect(amy?.friend.characterId).toBe('lovie');
  });
});

describe('group chat', () => {
  it('a new group comes with its chat; members who join are in it and see the notes', async () => {
    as('amy');
    const group = await social.createGroup(`Chat test ${run}`, 'A throwaway group for the chat test', 'cloudy');
    groupId = group.id;
    groupChatId = group.conversationId!;
    expect(groupChatId).toBeTruthy();
    await social.inviteToGroup(groupId, ids.ben);
    as('ben');
    const [invitation] = (await social.fetchGroupInvitations()).filter((item) => item.groupId === groupId);
    await social.respondGroupInvitation(invitation.id, true);
    as('cleo');
    await social.joinGroupByCode(group.inviteCode);

    const benView = await chatOf('ben', groupChatId);
    expect(benView).toMatchObject({ kind: 'group', title: `Chat test ${run}`, characterId: 'cloudy', canSend: true });
    expect(benView?.group).toMatchObject({ description: 'A throwaway group for the chat test', memberCount: 3 });
    as('cleo');
    const page = await chat.fetchMessages(groupChatId);
    expect(page.messages.map((message) => message.body)).toEqual(['Amy created the group.', 'Ben joined the group.', 'Cleo joined the group.']);
    expect(page.messages.every((message) => message.kind === 'system')).toBe(true);
  });

  it('a message reaches the other members live, with its sender, avatar and time', async () => {
    const benEvents = await watch('ben');
    const cleoEvents = await watch('cleo');
    as('amy');
    await chat.sendMessage(groupChatId, `Hello group ${run} 👋`);

    const atBen = await waitFor(() => messageEvent(benEvents, 'message', (message) => message.body === `Hello group ${run} 👋`), 'Ben gets it live');
    const message = atBen.data as ChatMessage;
    expect(message.sender).toMatchObject({ displayName: 'Amy', username: 'friend_amy', characterId: 'lovie' });
    expect(Date.now() - Date.parse(message.createdAt)).toBeLessThan(60_000);
    await waitFor(() => messageEvent(cleoEvents, 'message', (item) => item.id === message.id), 'Cleo gets it live');

    // Unread until read.
    expect((await chatOf('cleo', groupChatId))?.unreadCount).toBe(1);
    as('cleo');
    await chat.markConversationRead(groupChatId);
    expect((await chatOf('cleo', groupChatId))?.unreadCount).toBe(0);
    expect((await chatOf('amy', groupChatId))?.unreadCount).toBe(0);
  });

  it('shows who is typing to the others, without storing anything', async () => {
    const amyEvents = await watch('amy');
    const benEvents = await watch('ben');
    as('cleo');
    await chat.sendTyping(groupChatId);
    const typing = await waitFor(() => amyEvents.find((event) => event.name === 'typing'), 'Amy sees Cleo typing');
    expect(typing.data).toMatchObject({ conversationId: groupChatId, user: { displayName: 'Cleo' } });
    await waitFor(() => benEvents.find((event) => event.name === 'typing'), 'Ben sees it too');
    as('cleo');
    const page = await chat.fetchMessages(groupChatId);
    expect(page.messages.some((message) => /typing/i.test(message.body))).toBe(false);
  });

  it('replies, edits, reactions and deletes update live for everyone', async () => {
    const benEvents = await watch('ben');
    as('amy');
    const question = await chat.sendMessage(groupChatId, `Snacks? ${run}`);
    as('ben');
    const reply = await chat.sendMessage(groupChatId, 'I will bring some', question.id);
    expect(reply.replyTo).toMatchObject({ id: question.id, senderName: 'Amy', body: `Snacks? ${run}` });

    as('amy');
    await chat.editMessage(question.id, `Snacks at 5? ${run}`);
    await waitFor(() => messageEvent(benEvents, 'message-updated', (message) => message.id === question.id && message.editedAt !== null),
      'Ben sees the edit');
    as('cleo');
    const reacted = await chat.addReaction(question.id, '🎉');
    expect(reacted.reactions).toEqual([{ emoji: '🎉', userIds: [ids.cleo] }]);
    await waitFor(() => messageEvent(benEvents, 'message-updated', (message) => message.reactions.length === 1), 'Ben sees the reaction');
    await expect(chat.editMessage(question.id, 'not mine')).rejects.toThrow('You can only edit your own messages.');

    as('amy');
    await chat.deleteMessage(question.id);
    const deleted = await waitFor(() => messageEvent(benEvents, 'message-updated', (message) => message.id === question.id && message.deleted),
      'Ben sees it deleted');
    expect((deleted.data as ChatMessage).body).toBe('');
    as('ben');
    const page = await chat.fetchMessages(groupChatId);
    expect(page.messages.find((message) => message.id === reply.id)?.replyTo).toMatchObject({ deleted: true });
  });

  it('pages back through older messages', async () => {
    as('amy');
    const all = (await chat.fetchMessages(groupChatId)).messages;
    const first = await chat.fetchMessages(groupChatId, null, 3);
    expect(first.hasMore).toBe(true);
    expect(first.messages.map((message) => message.id)).toEqual(all.slice(-3).map((message) => message.id));
    const second = await chat.fetchMessages(groupChatId, first.nextCursor, 3);
    expect(second.messages.map((message) => message.id)).toEqual(all.slice(-6, -3).map((message) => message.id));
  });

  it('refuses empty, too long and too many messages', async () => {
    as('ben');
    await expect(chat.sendMessage(groupChatId, '   ')).rejects.toThrow('Write a message first.');
    await expect(chat.sendMessage(groupChatId, 'x'.repeat(2001))).rejects.toThrow('Messages can be at most 2000 characters.');
    as('cleo');
    await expect((async () => {
      for (let i = 0; i < 11; i++) await chat.sendMessage(groupChatId, `burst ${i}`);
    })()).rejects.toThrow("You're sending messages too fast. Wait a few seconds.");
  });

  it('leaving the group means leaving its chat', async () => {
    as('cleo');
    await social.leaveGroup(groupId);
    await expect(chat.fetchMessages(groupChatId)).rejects.toThrow("That chat isn't available. You may have left it.");
    await expect(chat.sendMessage(groupChatId, 'still here?')).rejects.toThrow("That chat isn't available");
    as('amy');
    const notes = (await chat.fetchMessages(groupChatId)).messages.map((message) => message.body);
    expect(notes).toContain('Cleo left the group.');
  });
});

describe('direct messages', () => {
  let amyBen = '';

  it('there is one chat per pair of friends, whoever opens it', async () => {
    as('amy');
    amyBen = (await chat.openDirectConversation(ids.ben)).id;
    as('ben');
    const benSide = await chat.openDirectConversation(ids.amy);
    expect(benSide.id).toBe(amyBen);
    expect(benSide).toMatchObject({ kind: 'direct', title: 'Amy', characterId: 'lovie', canSend: true });
    as('cleo');
    expect((await chat.openDirectConversation(ids.amy)).id).not.toBe(amyBen);
  });

  it('a message reaches the friend live, and nobody else can read it', async () => {
    const benEvents = await watch('ben');
    const cleoEvents = await watch('cleo');
    as('amy');
    const sent = await chat.sendMessage(amyBen, `Coffee later? ${run}`);
    await waitFor(() => messageEvent(benEvents, 'message', (message) => message.id === sent.id), 'Ben gets the message');
    expect((await chatOf('ben', amyBen))?.unreadCount).toBeGreaterThan(0);
    as('ben');
    await chat.sendMessage(amyBen, 'Sure, 3pm');
    expect((await chatOf('ben', amyBen))?.unreadCount).toBe(0);

    as('cleo');
    await expect(chat.fetchMessages(amyBen)).rejects.toThrow("That chat isn't available");
    await expect(chat.sendMessage(amyBen, 'hi')).rejects.toThrow("That chat isn't available");
    expect(cleoEvents.some((event) => event.name === 'message' && (event.data as ChatMessage).id === sent.id)).toBe(false);
  });

  it('only friends can message each other', async () => {
    as('ben');
    const benCleo = (await chat.openDirectConversation(ids.cleo)).id;
    as('cleo');
    await social.removeFriend(ids.ben);
    as('ben');
    await expect(chat.sendMessage(benCleo, 'hello?')).rejects.toThrow('You can only message friends. Add them again to keep chatting.');
    await expect(chat.openDirectConversation(ids.cleo)).rejects.toThrow('You can only message your friends.');
    expect((await chatOf('ben', benCleo))?.canSend).toBe(false);
    // Friends again: the same chat carries on.
    await ensureFriends('ben', 'cleo');
    as('ben');
    expect((await chat.openDirectConversation(ids.cleo)).id).toBe(benCleo);
    await chat.sendMessage(benCleo, `We're friends again ${run}`);
  });
});
