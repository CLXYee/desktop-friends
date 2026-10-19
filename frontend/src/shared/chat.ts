// Chat limits and layout rules shared by the app and its tests. The backend enforces the same limits
// (backend/src/main/java/com/desktopfriends/backend/service/MessageService.java).
import type { ChatMessage, Conversation } from './types';

export const MESSAGE_MAX_LENGTH = 2000;
export const MESSAGE_PAGE_SIZE = 50;
/** The reactions on offer, in picker order. */
export const REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🎉'];
/** Messages from one person within this gap share one name-and-avatar header. */
export const MESSAGE_GROUP_GAP_MS = 5 * 60_000;
/** How long "Ben is typing…" shows without a new signal. */
export const TYPING_VISIBLE_MS = 5_000;
/** Typing signals are sent at most this often. */
export const TYPING_SIGNAL_INTERVAL_MS = 3_000;

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAY_MS = 86_400_000;

/** Characters as people count them (an emoji is one). */
export const messageLength = (text: string): number => [...text].length;

const startOfDay = (date: Date): number => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

export const isSameDay = (a: Date, b: Date): boolean => startOfDay(a) === startOfDay(b);

/** "Monday, 19 October 2026", with "Today · " or "Yesterday · " in front when it is. */
export const formatDayLabel = (iso: string, now = new Date()): string => {
  const date = new Date(iso);
  const full = `${WEEKDAYS[date.getDay()]}, ${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
  const daysAgo = Math.round((startOfDay(now) - startOfDay(date)) / DAY_MS);
  if (daysAgo === 0) return `Today · ${full}`;
  if (daysAgo === 1) return `Yesterday · ${full}`;
  return full;
};

/** The time a message was sent, in the computer's own format (e.g. "2:05 PM" or "14:05"). */
export const formatMessageTime = (iso: string, locale?: string): string =>
  new Date(iso).toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' });

export interface MessageRow {
  message: ChatMessage;
  /** Set on the first message of each day: the date to show above it. */
  dayLabel: string | null;
  /** Show the sender's avatar and name (the first of a run of messages from one person). */
  showHeader: boolean;
}

/**
 * Lays out messages (oldest first): a date above the first message of each day, and the sender's avatar and
 * name only when someone else spoke in between, a few minutes passed, or the message is a reply.
 */
export const layoutMessages = (messages: ChatMessage[], now = new Date()): MessageRow[] =>
  messages.map((message, index) => {
    const previous = index > 0 ? messages[index - 1] : null;
    const sent = new Date(message.createdAt);
    const isNewDay = !previous || !isSameDay(new Date(previous.createdAt), sent);
    const continuesRun = Boolean(previous) && !isNewDay
      && previous!.kind === 'text' && message.kind === 'text'
      && previous!.sender?.id === message.sender?.id && message.sender !== null
      && sent.getTime() - new Date(previous!.createdAt).getTime() <= MESSAGE_GROUP_GAP_MS
      && message.replyTo === null;
    return { message, dayLabel: isNewDay ? formatDayLabel(message.createdAt, now) : null, showHeader: message.kind === 'text' && !continuesRun };
  });

/** Combines loaded and live messages: one per id (the newest copy wins), oldest first. */
export const mergeMessages = (current: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] => {
  const byId = new Map(current.map((message) => [message.id, message]));
  for (const message of incoming) byId.set(message.id, message);
  return [...byId.values()].sort((a, b) => a.id - b.id);
};

/** One line for the chat list: "You: …", "Ben: …" in groups, a note as it is, or "Message deleted". */
export const previewText = (message: ChatMessage | null, myId: string, isGroup: boolean): string => {
  if (!message) return isGroup ? 'No messages yet' : 'Say hello!';
  if (message.deleted) return 'Message deleted';
  const text = message.body.replace(/\s+/g, ' ');
  if (message.kind === 'system') return text;
  if (message.sender?.id === myId) return `You: ${text}`;
  return isGroup && message.sender ? `${message.sender.displayName}: ${text}` : text;
};

/** Most recently active first. */
export const sortConversations = (conversations: Conversation[]): Conversation[] =>
  [...conversations].sort((a, b) => Date.parse(b.lastMessageAt ?? b.createdAt) - Date.parse(a.lastMessageAt ?? a.createdAt));

/** The time in the chat list: the time today, "Yesterday", the weekday within a week, else the date. */
export const formatListTime = (iso: string, now = new Date(), locale?: string): string => {
  const date = new Date(iso);
  const daysAgo = Math.round((startOfDay(now) - startOfDay(date)) / DAY_MS);
  if (daysAgo <= 0) return formatMessageTime(iso, locale);
  if (daysAgo === 1) return 'Yesterday';
  if (daysAgo < 7) return WEEKDAYS[date.getDay()];
  const day = `${date.getDate()} ${MONTHS[date.getMonth()].slice(0, 3)}`;
  return date.getFullYear() === now.getFullYear() ? day : `${day} ${date.getFullYear()}`;
};

/**
 * The chat list, like a chat app: only chats with something said in them (plus the one open), matching the
 * search (a name or username), most recent first.
 */
export const listedChats = (conversations: Conversation[], openId: string | null, query = ''): Conversation[] => {
  const search = query.trim().toLowerCase();
  return sortConversations(conversations).filter((conversation) =>
    (conversation.lastMessageAt !== null || conversation.id === openId)
    && (!search || conversation.title.toLowerCase().includes(search) || Boolean(conversation.partner?.username.toLowerCase().includes(search))));
};

/** Unread messages across chats, not counting muted ones. */
export const totalUnread = (conversations: Conversation[]): number =>
  conversations.reduce((sum, conversation) => sum + (conversation.muted ? 0 : conversation.unreadCount), 0);
