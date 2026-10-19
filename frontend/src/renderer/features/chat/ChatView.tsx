import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { formatMessageTime, layoutMessages, MESSAGE_MAX_LENGTH, messageLength, REACTIONS } from '../../../shared/chat';
import { lastSeenLabel, presenceLabel } from '../../../shared/social';
import type { ChatMessage, Conversation } from '../../../shared/types';
import { useAccount } from '../auth/account';
import { useSocial } from '../social/social';
import { characterThemeStyle } from '../pets/characterThemes';
import { CharacterAvatar } from './CharacterAvatar';
import { useChat } from './chat';

// Within this distance of the bottom, new messages scroll into view; further up, a "new messages" button shows.
const STICK_TO_BOTTOM_PX = 80;
// Scrolling within this distance of the top loads older messages.
const LOAD_OLDER_PX = 60;
const COUNTER_FROM = MESSAGE_MAX_LENGTH - 200;

const errorText = (error: unknown) => (error instanceof Error && error.message ? error.message : 'Something went wrong. Please try again.');

/** "Amy, Ben and Cleo" (up to four names, then "and N others"). */
const listNames = (names: string[]): string => {
  if (names.length <= 1) return names.join('');
  const shown = names.length > 4 ? [...names.slice(0, 4), `${names.length - 4} others`] : names;
  return `${shown.slice(0, -1).join(', ')} and ${shown[shown.length - 1]}`;
};

function ChatHeader({ conversation, isGroupInfoOpen, onToggleGroupInfo }: {
  conversation: Conversation;
  isGroupInfoOpen: boolean;
  onToggleGroupInfo: () => void;
}) {
  const { setMuted } = useChat();
  const { groups } = useSocial();
  const partner = conversation.partner;
  const memberNames = groups.find((group) => group.id === conversation.group?.id)?.members.map((member) => member.displayName) ?? [];
  const subtitle = conversation.kind === 'group'
    ? conversation.group?.description || listNames(memberNames) || `${conversation.group?.memberCount ?? 0} members`
    : !conversation.canSend
      ? 'You are no longer friends'
      : partner?.presence === 'offline'
        ? lastSeenLabel(partner.lastSeenAt) ?? 'Offline'
        : presenceLabel(partner?.presence ?? 'offline');
  return (
    <header className="chat-header">
      <CharacterAvatar
        characterId={conversation.characterId}
        name={conversation.title}
        size={40}
        presence={conversation.kind === 'direct' && conversation.canSend ? partner?.presence : undefined}
      />
      <div className="chat-header-text">
        <p className="eyebrow">
          {conversation.kind === 'group'
            ? `GROUP CHAT · ${conversation.group?.memberCount ?? 0} ${conversation.group?.memberCount === 1 ? 'MEMBER' : 'MEMBERS'}`
            : `@${partner?.username ?? ''}`}
        </p>
        <h1>{conversation.title}</h1>
        <p className="chat-header-subtitle">{subtitle}</p>
      </div>
      <div className="chat-header-actions">
        <button
          type="button"
          className="social-chip"
          aria-pressed={conversation.muted}
          title={conversation.muted ? 'Unread messages count again' : 'Stop counting unread messages'}
          onClick={() => void setMuted(conversation.id, !conversation.muted)}
        >
          {conversation.muted ? '🔕 Muted' : '🔔 Mute'}
        </button>
        {conversation.kind === 'group' && (
          <button type="button" className="social-chip" aria-expanded={isGroupInfoOpen} onClick={onToggleGroupInfo}>
            ⓘ Group info
          </button>
        )}
      </div>
    </header>
  );
}

interface MessageItemProps {
  message: ChatMessage;
  showHeader: boolean;
  myId: string;
  highlighted: boolean;
  onReply: (message: ChatMessage) => void;
  onJumpTo: (messageId: number) => void;
}

function MessageItem({ message, showHeader, myId, highlighted, onReply, onJumpTo }: MessageItemProps) {
  const { edit, remove, toggleReaction } = useChat();
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(message.body);
  const [isPicking, setIsPicking] = useState(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const time = formatMessageTime(message.createdAt);
  const isMine = message.sender?.id === myId;
  const name = message.sender?.displayName ?? 'Deleted account';

  if (message.kind === 'system') {
    return (
      <div className="chat-notice" id={`message-${message.id}`}>
        <span>{message.body}</span>
        <time dateTime={message.createdAt}>{time}</time>
      </div>
    );
  }

  const saveEdit = async () => {
    const text = draft.trim();
    if (!text || text === message.body) {
      setIsEditing(false);
      return;
    }
    try {
      await edit(message.id, text);
      setIsEditing(false);
      setError(null);
    } catch (editError) {
      setError(errorText(editError));
    }
  };

  const run = (action: () => Promise<void>) => {
    setError(null);
    void action().catch((actionError) => setError(errorText(actionError)));
  };

  // Follow-up messages have no header, so their time sits right after the text instead.
  const sideTime = !showHeader && (
    <time className="chat-message-side-time" dateTime={message.createdAt} title={new Date(message.createdAt).toLocaleString()}>{time}</time>
  );

  return (
    <article
      id={`message-${message.id}`}
      className={`chat-message${showHeader ? ' chat-message-first' : ''}${isMine ? ' chat-message-mine' : ''}${highlighted ? ' chat-message-highlighted' : ''}`}
      onMouseLeave={() => {
        setIsPicking(false);
        setIsConfirmingDelete(false);
      }}
    >
      <div className="chat-message-gutter">
        {showHeader && <CharacterAvatar characterId={message.sender?.characterId} name={name} size={36} />}
      </div>
      <div className="chat-message-main">
        {showHeader && (
          <header className="chat-message-header">
            <strong>{name}</strong>
            <time dateTime={message.createdAt} title={new Date(message.createdAt).toLocaleString()}>{time}</time>
          </header>
        )}
        {message.replyTo && (
          <button type="button" className="chat-quote" onClick={() => onJumpTo(message.replyTo!.id)}>
            <span aria-hidden="true">↩</span>
            <strong>{message.replyTo.senderName}</strong>
            <span>{message.replyTo.deleted ? 'Message deleted' : message.replyTo.body}</span>
          </button>
        )}
        {isEditing ? (
          <div className="chat-edit">
            <textarea
              value={draft}
              autoFocus
              maxLength={MESSAGE_MAX_LENGTH * 2}
              aria-label="Edit message"
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  void saveEdit();
                } else if (event.key === 'Escape') {
                  setIsEditing(false);
                  setDraft(message.body);
                }
              }}
            />
            <span className="chat-edit-hint">Enter to save · Esc to cancel</span>
          </div>
        ) : message.deleted ? (
          <p className="chat-message-body chat-message-deleted">Message deleted{sideTime}</p>
        ) : (
          <p className="chat-message-body">
            {message.body}
            {message.editedAt && <span className="chat-message-edited"> (edited)</span>}
            {sideTime}
          </p>
        )}
        {message.reactions.length > 0 && (
          <div className="chat-reactions">
            {message.reactions.map((reaction) => (
              <button
                key={reaction.emoji}
                type="button"
                className={`chat-reaction${reaction.userIds.includes(myId) ? ' chat-reaction-mine' : ''}`}
                aria-pressed={reaction.userIds.includes(myId)}
                aria-label={`${reaction.emoji} ${reaction.userIds.length}`}
                onClick={() => run(() => toggleReaction(message, reaction.emoji))}
              >
                {reaction.emoji} <span>{reaction.userIds.length}</span>
              </button>
            ))}
          </div>
        )}
        {error && <p className="social-notice social-notice-error chat-message-error" role="alert">{error}</p>}
      </div>
      {!message.deleted && !isEditing && (
        <div className="chat-message-actions">
          {isConfirmingDelete ? (
            <>
              <span>Delete this message?</span>
              <button type="button" className="social-chip social-chip-danger" onClick={() => run(() => remove(message.id))}>Delete</button>
              <button type="button" className="social-chip" onClick={() => setIsConfirmingDelete(false)}>Keep</button>
            </>
          ) : (
            <>
              <button type="button" className="chat-action" aria-expanded={isPicking} onClick={() => setIsPicking((open) => !open)} title="React">☺</button>
              <button type="button" className="chat-action" onClick={() => onReply(message)} title="Reply">↩</button>
              {isMine && (
                <button type="button" className="chat-action" title="Edit" onClick={() => {
                  setDraft(message.body);
                  setIsEditing(true);
                }}>✎</button>
              )}
              {isMine && <button type="button" className="chat-action" title="Delete" onClick={() => setIsConfirmingDelete(true)}>🗑</button>}
            </>
          )}
          {isPicking && (
            <div className="chat-reaction-picker" role="menu" aria-label="Reactions">
              {REACTIONS.map((emoji) => (
                <button key={emoji} type="button" role="menuitem" onClick={() => {
                  setIsPicking(false);
                  run(() => toggleReaction(message, emoji));
                }}>{emoji}</button>
              ))}
            </div>
          )}
        </div>
      )}
    </article>
  );
}

function Composer({ conversation, replyTo, onCancelReply, onSent }: {
  conversation: Conversation;
  replyTo: ChatMessage | null;
  onCancelReply: () => void;
  onSent: () => void;
}) {
  const { send, notifyTyping } = useChat();
  const [draft, setDraft] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const length = messageLength(draft.trim());
  const isTooLong = length > MESSAGE_MAX_LENGTH;

  useEffect(() => {
    setDraft('');
    setError(null);
    inputRef.current?.focus();
  }, [conversation.id]);

  useEffect(() => {
    if (replyTo) inputRef.current?.focus();
  }, [replyTo]);

  // Grow with the text, up to a few lines.
  useLayoutEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, 140)}px`;
    // A scrollbar only once it stops growing.
    input.style.overflowY = input.scrollHeight > 140 ? 'auto' : 'hidden';
  }, [draft]);

  if (!conversation.canSend) {
    return (
      <div className="chat-composer chat-composer-locked">
        You can only message friends. Add {conversation.title} again from the Friends page to keep chatting.
      </div>
    );
  }

  const submit = async () => {
    const text = draft.trim();
    if (!text || isTooLong || isSending) return;
    setIsSending(true);
    setError(null);
    try {
      await send(conversation.id, text, replyTo?.id ?? null);
      setDraft('');
      onCancelReply();
      onSent();
    } catch (sendError) {
      setError(errorText(sendError));
    } finally {
      setIsSending(false);
      inputRef.current?.focus();
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void submit();
    } else if (event.key === 'Escape' && replyTo) {
      onCancelReply();
    }
  };

  return (
    <div className="chat-composer">
      {replyTo && (
        <div className="chat-replying">
          <span>Replying to <strong>{replyTo.sender?.displayName ?? 'Deleted account'}</strong>: {replyTo.body}</span>
          <button type="button" className="chat-action" onClick={onCancelReply} aria-label="Cancel reply">✕</button>
        </div>
      )}
      {error && <p className="social-notice social-notice-error" role="alert">{error}</p>}
      <div className="chat-composer-row">
        <textarea
          ref={inputRef}
          rows={1}
          value={draft}
          placeholder={`Message ${conversation.title}…`}
          aria-label="Message"
          aria-invalid={isTooLong}
          onChange={(event) => {
            setDraft(event.target.value);
            if (event.target.value.trim()) notifyTyping(conversation.id);
          }}
          onKeyDown={onKeyDown}
        />
        <button type="button" className="social-primary chat-send" disabled={!draft.trim() || isTooLong || isSending} onClick={() => void submit()}>
          {isSending ? 'Sending…' : 'Send'}
        </button>
      </div>
      <div className="chat-composer-hint">
        <span>Enter to send · Shift+Enter for a new line</span>
        {length >= COUNTER_FROM && <span className={isTooLong ? 'chat-counter-over' : undefined}>{length} / {MESSAGE_MAX_LENGTH}</span>}
      </div>
    </div>
  );
}

/** A chat: its messages (loaded 50 at a time as you scroll up), live updates, and the box to write in. */
export function ChatView({ conversationId, isGroupInfoOpen, onToggleGroupInfo }: {
  conversationId: string;
  isGroupInfoOpen: boolean;
  onToggleGroupInfo: () => void;
}) {
  const { profile } = useAccount();
  const myId = profile?.id ?? '';
  const { conversations, threads, typing, setActiveConversationId, loadOlder } = useChat();
  const conversation = conversations.find((item) => item.id === conversationId) ?? null;
  const thread = threads[conversationId];
  const messages = thread?.messages ?? [];
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [highlightId, setHighlightId] = useState<number | null>(null);
  const [hasNewBelow, setHasNewBelow] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const heightBeforeOlder = useRef<number | null>(null);
  const firstId = messages[0]?.id;
  const lastMessage = messages[messages.length - 1];

  // Opening a chat marks it read and loads its latest messages; leaving it stops that.
  useEffect(() => {
    setActiveConversationId(conversationId);
    stickToBottom.current = true;
    setReplyTo(null);
    setHasNewBelow(false);
    return () => setActiveConversationId(null);
  }, [conversationId, setActiveConversationId]);

  // Keep the view where the reader is: at the bottom for new messages (unless they scrolled up), and in
  // place when older messages load above.
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    if (heightBeforeOlder.current !== null) {
      list.scrollTop += list.scrollHeight - heightBeforeOlder.current;
      heightBeforeOlder.current = null;
      return;
    }
    if (stickToBottom.current || lastMessage?.sender?.id === myId) {
      list.scrollTop = list.scrollHeight;
      setHasNewBelow(false);
    } else if (lastMessage) {
      setHasNewBelow(true);
    }
  }, [firstId, lastMessage?.id, myId]);

  const rows = useMemo(() => layoutMessages(messages), [messages]);

  if (!conversation) {
    return (
      <section className="chat-view chat-view-empty">
        <p className="empty-copy">This chat isn't available any more. You may have left the group.</p>
      </section>
    );
  }

  const onScroll = () => {
    const list = listRef.current;
    if (!list) return;
    stickToBottom.current = list.scrollHeight - list.scrollTop - list.clientHeight < STICK_TO_BOTTOM_PX;
    if (stickToBottom.current) setHasNewBelow(false);
    if (list.scrollTop < LOAD_OLDER_PX && thread?.hasMore && !thread.loadingOlder) {
      heightBeforeOlder.current = list.scrollHeight;
      void loadOlder(conversationId);
    }
  };

  const jumpTo = (messageId: number) => {
    const element = document.getElementById(`message-${messageId}`);
    if (!element) return;
    element.scrollIntoView({ block: 'center', behavior: 'smooth' });
    setHighlightId(messageId);
    setTimeout(() => setHighlightId((current) => (current === messageId ? null : current)), 1600);
  };

  const scrollToBottom = () => {
    const list = listRef.current;
    if (!list) return;
    list.scrollTo({ top: list.scrollHeight, behavior: 'smooth' });
    stickToBottom.current = true;
    setHasNewBelow(false);
  };

  const typists = typing[conversationId] ?? [];
  const typingText = typists.length === 0 ? null
    : typists.length === 1 ? `${typists[0].displayName} is typing…`
    : typists.length === 2 ? `${typists[0].displayName} and ${typists[1].displayName} are typing…`
    : 'Several people are typing…';

  return (
    <section className="chat-view" style={characterThemeStyle(conversation.characterId ?? 'crystal')} aria-label={`Chat: ${conversation.title}`}>
      <ChatHeader conversation={conversation} isGroupInfoOpen={isGroupInfoOpen} onToggleGroupInfo={onToggleGroupInfo} />
      <div className="chat-messages" ref={listRef} onScroll={onScroll} aria-live="polite" aria-busy={thread?.status === 'loading'}>
        {thread?.hasMore && (
          <button type="button" className="chat-load-older" disabled={thread.loadingOlder} onClick={() => {
            heightBeforeOlder.current = listRef.current?.scrollHeight ?? null;
            void loadOlder(conversationId);
          }}>
            {thread.loadingOlder ? 'Loading earlier messages…' : 'Load earlier messages'}
          </button>
        )}
        {(!thread || thread.status === 'loading') && messages.length === 0 && <p className="chat-placeholder">Loading messages…</p>}
        {thread?.status === 'error' && messages.length === 0 && (
          <p className="social-notice social-notice-error chat-placeholder" role="alert">{thread.error}</p>
        )}
        {thread?.status === 'ready' && messages.length === 0 && (
          <div className="chat-placeholder">
            <CharacterAvatar characterId={conversation.characterId} name={conversation.title} size={56} />
            <p>No messages yet. Say hello 👋</p>
          </div>
        )}
        {rows.map(({ message, dayLabel, showHeader }) => (
          <div key={message.id} className="chat-row">
            {dayLabel && <div className="chat-day" role="separator"><span>{dayLabel}</span></div>}
            <MessageItem
              message={message}
              showHeader={showHeader}
              myId={myId}
              highlighted={highlightId === message.id}
              onReply={setReplyTo}
              onJumpTo={jumpTo}
            />
          </div>
        ))}
      </div>
      {hasNewBelow && <button type="button" className="chat-new-below" onClick={scrollToBottom}>New messages ↓</button>}
      <div className="chat-typing" aria-live="polite">{typingText}</div>
      <Composer conversation={conversation} replyTo={replyTo} onCancelReply={() => setReplyTo(null)} onSent={scrollToBottom} />
    </section>
  );
}
