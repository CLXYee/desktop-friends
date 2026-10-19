import type { ChatMessage, Conversation, MessagePage } from '../../shared/types';
import { apiRequest } from './api';

// Chats through the backend's REST API: group chats (one per group) and direct chats with friends. The
// backend checks who may read and write each chat and answers refusals with a message to show as is.

const chatPath = (conversationId: string) => `/conversations/${encodeURIComponent(conversationId)}`;
const messagePath = (messageId: number) => `/messages/${messageId}`;

/** Every chat you're in, most recently active first. */
export const fetchConversations = (): Promise<Conversation[]> => apiRequest<Conversation[]>('/conversations');

export const fetchConversation = (conversationId: string): Promise<Conversation> => apiRequest<Conversation>(chatPath(conversationId));

/** Opens your direct chat with a friend (the same one every time). */
export const openDirectConversation = (friendId: string): Promise<Conversation> =>
  apiRequest<Conversation>('/conversations/direct', { method: 'POST', body: { friendId } });

/** The newest messages, or with before the page just older than that message id. */
export const fetchMessages = (conversationId: string, before?: number | null, limit?: number): Promise<MessagePage> => {
  const query = new URLSearchParams();
  if (before) query.set('before', String(before));
  if (limit) query.set('limit', String(limit));
  const suffix = query.size > 0 ? `?${query}` : '';
  return apiRequest<MessagePage>(`${chatPath(conversationId)}/messages${suffix}`);
};

export const sendMessage = (conversationId: string, body: string, replyToId?: number | null): Promise<ChatMessage> =>
  apiRequest<ChatMessage>(`${chatPath(conversationId)}/messages`, { method: 'POST', body: { body, replyToId: replyToId ?? null } });

export const editMessage = (messageId: number, body: string): Promise<ChatMessage> =>
  apiRequest<ChatMessage>(messagePath(messageId), { method: 'PATCH', body: { body } });

export const deleteMessage = (messageId: number): Promise<void> => apiRequest(messagePath(messageId), { method: 'DELETE' });

export const addReaction = (messageId: number, emoji: string): Promise<ChatMessage> =>
  apiRequest<ChatMessage>(`${messagePath(messageId)}/reactions`, { method: 'PUT', body: { emoji } });

export const removeReaction = (messageId: number, emoji: string): Promise<ChatMessage> =>
  apiRequest<ChatMessage>(`${messagePath(messageId)}/reactions?emoji=${encodeURIComponent(emoji)}`, { method: 'DELETE' });

/** Everything in the chat up to now counts as read. */
export const markConversationRead = (conversationId: string): Promise<void> =>
  apiRequest(`${chatPath(conversationId)}/read`, { method: 'POST' });

export const setConversationMuted = (conversationId: string, muted: boolean): Promise<void> =>
  apiRequest(`${chatPath(conversationId)}/mute`, { method: 'PUT', body: { muted } });

/** Tells the others you're typing (shown for a few seconds, never stored). */
export const sendTyping = (conversationId: string): Promise<void> => apiRequest(`${chatPath(conversationId)}/typing`, { method: 'POST' });

/** Sets the character shown as your avatar in chats (the companion you picked). */
export const updateMyCharacter = (characterId: string): Promise<void> =>
  apiRequest<unknown>('/profiles/me', { method: 'PUT', body: { characterId } }).then(() => undefined);
