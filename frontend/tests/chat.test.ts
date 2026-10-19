import { describe, expect, it } from 'vitest';
import {
  formatDayLabel,
  formatListTime,
  formatMessageTime,
  layoutMessages,
  listedChats,
  mergeMessages,
  messageLength,
  previewText,
  sortConversations,
  totalUnread,
} from '../src/shared/chat';
import type { ChatMessage, ChatUser, Conversation } from '../src/shared/types';

const amy: ChatUser = { id: 'amy', username: 'friend_amy', displayName: 'Amy', characterId: 'lovie' };
const ben: ChatUser = { id: 'ben', username: 'friend_ben', displayName: 'Ben', characterId: 'clover' };

let nextId = 1;
const message = (sender: ChatUser | null, createdAt: string, overrides: Partial<ChatMessage> = {}): ChatMessage => ({
  id: nextId++,
  conversationId: 'chat',
  sender,
  body: 'hi',
  kind: 'text',
  replyTo: null,
  createdAt,
  editedAt: null,
  deleted: false,
  reactions: [],
  ...overrides,
});

// Local times, so the tests hold in any time zone.
const at = (day: number, hour: number, minute = 0) => new Date(2026, 9, day, hour, minute).toISOString();
const now = new Date(2026, 9, 19, 18, 0);

describe('day labels', () => {
  it('says today, yesterday, or the date', () => {
    expect(formatDayLabel(at(19, 9), now)).toBe('Today · Monday, 19 October 2026');
    expect(formatDayLabel(at(18, 23, 59), now)).toBe('Yesterday · Sunday, 18 October 2026');
    expect(formatDayLabel(at(12, 9), now)).toBe('Monday, 12 October 2026');
    expect(formatDayLabel(new Date(2025, 11, 31, 12).toISOString(), now)).toBe('Wednesday, 31 December 2025');
  });

  it('shows the time a message was sent', () => {
    expect(formatMessageTime(at(19, 14, 5), 'en-US')).toBe('2:05 PM');
    expect(formatMessageTime(at(19, 14, 5), 'en-GB')).toBe('14:05');
  });
});

describe('laying out a chat', () => {
  it('puts the date only above the first message of each day', () => {
    const rows = layoutMessages([
      message(amy, at(18, 22)),
      message(ben, at(18, 23)),
      message(amy, at(19, 8)),
      message(ben, at(19, 9)),
    ], now);
    expect(rows.map((row) => row.dayLabel)).toEqual([
      'Yesterday · Sunday, 18 October 2026', null, 'Today · Monday, 19 October 2026', null,
    ]);
  });

  it('shows the avatar and name once per run of messages from one person', () => {
    const rows = layoutMessages([
      message(amy, at(19, 9, 0)),
      message(amy, at(19, 9, 2)),
      message(amy, at(19, 9, 20)), // more than 5 minutes later
      message(ben, at(19, 9, 21)),
      message(ben, at(19, 9, 22), { replyTo: { id: 1, senderName: 'Amy', body: 'hi', deleted: false } }),
      message(ben, at(19, 9, 23)),
      message(null, at(19, 9, 24), { kind: 'system', body: 'Cleo joined the group.' }),
      message(ben, at(19, 9, 25)),
    ], now);
    expect(rows.map((row) => row.showHeader)).toEqual([true, false, true, true, true, false, false, true]);
  });
});

describe('chat helpers', () => {
  it('merges live and loaded messages without duplicates, oldest first', () => {
    const first = message(amy, at(19, 9));
    const second = message(ben, at(19, 10));
    const edited = { ...first, body: 'edited' };
    expect(mergeMessages([second], [first, edited]).map((item) => [item.id, item.body])).toEqual([[first.id, 'edited'], [second.id, 'hi']]);
  });

  it('counts an emoji as one character', () => {
    expect(messageLength('hi 👋')).toBe(4);
  });

  it('previews the last message for the chat list', () => {
    expect(previewText(null, 'amy', true)).toBe('No messages yet');
    expect(previewText(message(amy, at(19, 9), { body: 'line one\nline two' }), 'amy', true)).toBe('You: line one line two');
    expect(previewText(message(ben, at(19, 9)), 'amy', true)).toBe('Ben: hi');
    expect(previewText(message(ben, at(19, 9)), 'amy', false)).toBe('hi');
    expect(previewText(message(ben, at(19, 9), { deleted: true, body: '' }), 'amy', false)).toBe('Message deleted');
    expect(previewText(message(ben, at(19, 9), { kind: 'system', body: 'Ben joined the group.' }), 'amy', true)).toBe('Ben joined the group.');
  });

  it('shows a short time in the chat list', () => {
    expect(formatListTime(at(19, 14, 5), now, 'en-US')).toBe('2:05 PM');
    expect(formatListTime(at(18, 9), now)).toBe('Yesterday');
    expect(formatListTime(at(15, 9), now)).toBe('Thursday');
    expect(formatListTime(at(2, 9), now)).toBe('2 Oct');
    expect(formatListTime(new Date(2025, 11, 31, 12).toISOString(), now)).toBe('31 Dec 2025');
  });

  it('lists only chats with history (and the open one), matching the search, newest first', () => {
    const chat = (id: string, title: string, lastMessageAt: string | null, username?: string): Conversation => ({
      id, kind: username ? 'direct' : 'group', title, characterId: null, group: null,
      partner: username ? { id, username, displayName: title, presence: 'offline', lastSeenAt: null, characterId: 'crystal' } : null,
      canSend: true, lastMessage: null, lastMessageAt, unreadCount: 0, muted: false, createdAt: at(1, 9),
    });
    const list = [chat('ben', 'Ben', at(18, 9), 'friend_ben'), chat('quiet', 'Cleo', null, 'friend_cleo'), chat('group', 'Study Buddies', at(19, 9))];
    expect(listedChats(list, null).map((item) => item.id)).toEqual(['group', 'ben']);
    expect(listedChats(list, 'quiet').map((item) => item.id)).toEqual(['group', 'ben', 'quiet']);
    expect(listedChats(list, null, 'study').map((item) => item.id)).toEqual(['group']);
    expect(listedChats(list, null, 'FRIEND_BEN').map((item) => item.id)).toEqual(['ben']);
  });

  it('sorts chats by activity and counts unread outside muted ones', () => {
    const chat = (id: string, lastMessageAt: string | null, unreadCount: number, muted = false): Conversation => ({
      id, kind: 'group', title: id, characterId: null, group: null, partner: null, canSend: true, lastMessage: null,
      lastMessageAt, unreadCount, muted, createdAt: at(1, 9),
    });
    const list = [chat('quiet', null, 0), chat('busy', at(19, 9), 3), chat('muted', at(19, 10), 5, true)];
    expect(sortConversations(list).map((item) => item.id)).toEqual(['muted', 'busy', 'quiet']);
    expect(totalUnread(list)).toBe(3);
  });
});
