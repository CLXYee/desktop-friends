import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { mergeMessages, sortConversations, TYPING_SIGNAL_INTERVAL_MS, TYPING_VISIBLE_MS } from '../../../shared/chat';
import type { ChatMessage, ChatUser, Conversation } from '../../../shared/types';
import {
  addReaction,
  deleteMessage,
  editMessage,
  fetchConversations,
  fetchMessages,
  markConversationRead,
  openDirectConversation,
  removeReaction,
  sendMessage,
  sendTyping,
  setConversationMuted,
} from '../../services/chat';
import { subscribeToLiveEvents } from '../../services/liveEvents';
import { useAccount } from '../auth/account';

// Live events keep chats current; this refresh of the chat list is only a safety net.
const POLL_MS = 60_000;
const READ_DEBOUNCE_MS = 400;

/** The messages of one chat that are loaded so far. */
export interface ChatThread {
  messages: ChatMessage[];
  hasMore: boolean;
  nextCursor: number | null;
  status: 'loading' | 'ready' | 'error';
  error: string | null;
  loadingOlder: boolean;
}

interface ChatContextValue {
  status: 'loading' | 'ready';
  error: string | null;
  /** Most recently active first. */
  conversations: Conversation[];
  threads: Record<string, ChatThread>;
  /** Who is typing in each chat right now. */
  typing: Record<string, ChatUser[]>;
  activeConversationId: string | null;
  /** The chat on screen: its messages are marked read as they arrive. */
  setActiveConversationId: (conversationId: string | null) => void;
  /** Loads the chat list again; returns it (the current one if loading failed). */
  refreshConversations: () => Promise<Conversation[]>;
  loadOlder: (conversationId: string) => Promise<void>;
  send: (conversationId: string, body: string, replyToId?: number | null) => Promise<void>;
  edit: (messageId: number, body: string) => Promise<void>;
  remove: (messageId: number) => Promise<void>;
  toggleReaction: (message: ChatMessage, emoji: string) => Promise<void>;
  /** Opens (or finds) the direct chat with a friend; returns its id. */
  openDirect: (friendId: string) => Promise<string>;
  setMuted: (conversationId: string, muted: boolean) => Promise<void>;
  /** Tells the others you're typing (throttled). */
  notifyTyping: (conversationId: string) => void;
}

const ChatContext = createContext<ChatContextValue | null>(null);

export const useChat = (): ChatContextValue => {
  const value = useContext(ChatContext);
  if (!value) throw new Error('useChat must be used inside <ChatProvider>.');
  return value;
};

const isChatMessage = (value: unknown): value is ChatMessage =>
  typeof value === 'object' && value !== null
  && typeof (value as ChatMessage).id === 'number' && typeof (value as ChatMessage).conversationId === 'string';

const isTypingEvent = (value: unknown): value is { conversationId: string; user: ChatUser } =>
  typeof value === 'object' && value !== null
  && typeof (value as { conversationId?: unknown }).conversationId === 'string'
  && typeof (value as { user?: { id?: unknown } }).user?.id === 'string';

const emptyThread: ChatThread = { messages: [], hasMore: false, nextCursor: null, status: 'loading', error: null, loadingOlder: false };

/** Chats of the signed-in user, kept up to date. Mount only while signed in. */
export function ChatProvider({ children }: { children: ReactNode }) {
  const { profile } = useAccount();
  const myId = profile?.id ?? '';
  const [status, setStatus] = useState<ChatContextValue['status']>('loading');
  const [error, setError] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [threads, setThreads] = useState<Record<string, ChatThread>>({});
  const [typingUntil, setTypingUntil] = useState<Record<string, Record<string, { user: ChatUser; until: number }>>>({});
  const [activeConversationId, setActiveId] = useState<string | null>(null);
  const activeRef = useRef<string | null>(null);
  const conversationsRef = useRef<Conversation[]>([]);
  conversationsRef.current = conversations;
  const latestRefresh = useRef(0);
  const readTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const typingSentAt = useRef(new Map<string, number>());

  const updateThread = useCallback((conversationId: string, update: (thread: ChatThread) => ChatThread) => {
    setThreads((current) => ({ ...current, [conversationId]: update(current[conversationId] ?? emptyThread) }));
  }, []);

  const refreshConversations = useCallback(async (): Promise<Conversation[]> => {
    if (!myId) return [];
    const ticket = ++latestRefresh.current;
    try {
      const next = sortConversations(await fetchConversations());
      if (ticket !== latestRefresh.current) return next;
      conversationsRef.current = next;
      setConversations(next);
      setError(null);
      return next;
    } catch (refreshError) {
      if (ticket === latestRefresh.current) setError((refreshError as Error).message);
      return conversationsRef.current;
    } finally {
      if (ticket === latestRefresh.current) setStatus('ready');
    }
  }, [myId]);

  /** Marks the chat read on the server (soon, once per burst) and here right away. */
  const markRead = useCallback((conversationId: string) => {
    setConversations((current) => current.map((item) => (item.id === conversationId ? { ...item, unreadCount: 0 } : item)));
    clearTimeout(readTimers.current.get(conversationId));
    readTimers.current.set(conversationId, setTimeout(() => {
      readTimers.current.delete(conversationId);
      void markConversationRead(conversationId).catch(() => undefined);
    }, READ_DEBOUNCE_MS));
  }, []);

  const loadLatest = useCallback(async (conversationId: string) => {
    try {
      const page = await fetchMessages(conversationId);
      updateThread(conversationId, (thread) => ({
        ...thread,
        // Keep older pages already loaded; newer live messages merge in.
        messages: mergeMessages(thread.messages, page.messages),
        hasMore: thread.messages.length > 0 && thread.status === 'ready' ? thread.hasMore : page.hasMore,
        nextCursor: thread.messages.length > 0 && thread.status === 'ready' ? thread.nextCursor : page.nextCursor,
        status: 'ready',
        error: null,
      }));
    } catch (loadError) {
      updateThread(conversationId, (thread) => ({ ...thread, status: 'error', error: (loadError as Error).message }));
    }
  }, [updateThread]);

  const loadOlder = useCallback(async (conversationId: string) => {
    const thread = threads[conversationId];
    if (!thread || !thread.hasMore || thread.loadingOlder || thread.nextCursor === null) return;
    updateThread(conversationId, (current) => ({ ...current, loadingOlder: true }));
    try {
      const page = await fetchMessages(conversationId, thread.nextCursor);
      updateThread(conversationId, (current) => ({
        ...current,
        messages: mergeMessages(current.messages, page.messages),
        hasMore: page.hasMore,
        nextCursor: page.nextCursor,
        loadingOlder: false,
      }));
    } catch (loadError) {
      updateThread(conversationId, (current) => ({ ...current, loadingOlder: false, error: (loadError as Error).message }));
    }
  }, [threads, updateThread]);

  /** A message arrived or changed (from the server's answer or the live stream). */
  const applyMessage = useCallback((message: ChatMessage, isNew: boolean) => {
    const conversationId = message.conversationId;
    setThreads((current) => (current[conversationId]
      ? { ...current, [conversationId]: { ...current[conversationId], messages: mergeMessages(current[conversationId].messages, [message]) } }
      : current));
    if (isNew && message.sender) {
      // Whoever sent a message has stopped typing.
      setTypingUntil((current) => {
        if (!current[conversationId]?.[message.sender!.id]) return current;
        const { [message.sender!.id]: _gone, ...rest } = current[conversationId];
        return { ...current, [conversationId]: rest };
      });
    }
    const isVisible = activeRef.current === conversationId && document.visibilityState === 'visible';
    const isKnown = conversationsRef.current.some((item) => item.id === conversationId);
    setConversations((current) => sortConversations(current.map((item) => {
        if (item.id !== conversationId) return item;
        const isLatest = !item.lastMessage || message.id >= item.lastMessage.id;
        const countsAsUnread = isNew && !isVisible && message.kind === 'text' && message.sender?.id !== myId;
        return {
          ...item,
          lastMessage: isLatest ? message : item.lastMessage,
          lastMessageAt: isNew && isLatest ? message.createdAt : item.lastMessageAt,
          unreadCount: countsAsUnread ? item.unreadCount + 1 : item.unreadCount,
        };
      })));
    // A chat we don't know yet (e.g. a friend's first message): load the list again.
    if (!isKnown) void refreshConversations();
    if (isNew && isVisible && message.sender?.id !== myId) markRead(conversationId);
  }, [markRead, myId, refreshConversations]);

  const setActiveConversationId = useCallback((conversationId: string | null) => {
    activeRef.current = conversationId;
    setActiveId(conversationId);
    if (!conversationId) return;
    markRead(conversationId);
    void loadLatest(conversationId);
  }, [loadLatest, markRead]);

  // Load, then follow changes live.
  useEffect(() => {
    if (!myId) return;
    void refreshConversations();
    const stop = subscribeToLiveEvents(({ name, data }) => {
      if ((name === 'message' || name === 'message-updated') && isChatMessage(data)) {
        applyMessage(data, name === 'message');
      } else if (name === 'typing' && isTypingEvent(data)) {
        setTypingUntil((current) => ({
          ...current,
          [data.conversationId]: { ...current[data.conversationId], [data.user.id]: { user: data.user, until: Date.now() + TYPING_VISIBLE_MS } },
        }));
      } else if (name === 'groups' || name === 'friends') {
        // Joined or left a group, a group was renamed, a friendship changed: titles, members and who can write.
        void refreshConversations();
      } else if (name === 'ready') {
        // (Re)connected: catch up on anything missed meanwhile.
        void refreshConversations();
        if (activeRef.current) void loadLatest(activeRef.current);
      }
    });
    const poll = setInterval(() => void refreshConversations(), POLL_MS);
    const timers = readTimers.current;
    return () => {
      stop();
      clearInterval(poll);
      timers.forEach((timer) => clearTimeout(timer));
    };
  }, [myId, refreshConversations, applyMessage, loadLatest]);

  // Coming back to the window marks the open chat read.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && activeRef.current) markRead(activeRef.current);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [markRead]);

  // "Is typing" fades out when the signals stop.
  const hasTyping = Object.values(typingUntil).some((people) => Object.keys(people).length > 0);
  useEffect(() => {
    if (!hasTyping) return;
    const timer = setInterval(() => {
      const now = Date.now();
      setTypingUntil((current) => Object.fromEntries(Object.entries(current).map(([chatId, people]) => [
        chatId, Object.fromEntries(Object.entries(people).filter(([, entry]) => entry.until > now)),
      ])));
    }, 1000);
    return () => clearInterval(timer);
  }, [hasTyping]);

  const send = useCallback(async (conversationId: string, body: string, replyToId?: number | null) => {
    const message = await sendMessage(conversationId, body, replyToId);
    typingSentAt.current.delete(conversationId);
    applyMessage(message, true);
  }, [applyMessage]);

  const edit = useCallback(async (messageId: number, body: string) => applyMessage(await editMessage(messageId, body), false), [applyMessage]);

  const remove = useCallback(async (messageId: number) => {
    await deleteMessage(messageId);
    // The live update brings the "deleted" version; show it straight away too.
    setThreads((current) => Object.fromEntries(Object.entries(current).map(([chatId, thread]) => [chatId, {
      ...thread,
      messages: thread.messages.map((message) => (message.id === messageId ? { ...message, deleted: true, body: '', reactions: [] } : message)),
    }])));
  }, []);

  const toggleReaction = useCallback(async (message: ChatMessage, emoji: string) => {
    const mine = message.reactions.some((reaction) => reaction.emoji === emoji && reaction.userIds.includes(myId));
    applyMessage(await (mine ? removeReaction(message.id, emoji) : addReaction(message.id, emoji)), false);
  }, [applyMessage, myId]);

  const openDirect = useCallback(async (friendId: string) => {
    const conversation = await openDirectConversation(friendId);
    setConversations((current) => sortConversations([conversation, ...current.filter((item) => item.id !== conversation.id)]));
    return conversation.id;
  }, []);

  const setMuted = useCallback(async (conversationId: string, muted: boolean) => {
    await setConversationMuted(conversationId, muted);
    setConversations((current) => current.map((item) => (item.id === conversationId ? { ...item, muted } : item)));
  }, []);

  const notifyTyping = useCallback((conversationId: string) => {
    const now = Date.now();
    if (now - (typingSentAt.current.get(conversationId) ?? 0) < TYPING_SIGNAL_INTERVAL_MS) return;
    typingSentAt.current.set(conversationId, now);
    void sendTyping(conversationId).catch(() => undefined);
  }, []);

  const typing = useMemo(() => Object.fromEntries(Object.entries(typingUntil).map(([chatId, people]) => [
    chatId, Object.values(people).map((entry) => entry.user).filter((user) => user.id !== myId),
  ])), [typingUntil, myId]);

  const value = useMemo<ChatContextValue>(() => ({
    status, error, conversations, threads, typing, activeConversationId, setActiveConversationId, refreshConversations,
    loadOlder, send, edit, remove, toggleReaction, openDirect, setMuted, notifyTyping,
  }), [status, error, conversations, threads, typing, activeConversationId, setActiveConversationId, refreshConversations,
    loadOlder, send, edit, remove, toggleReaction, openDirect, setMuted, notifyTyping]);

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}
