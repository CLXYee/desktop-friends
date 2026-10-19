import { useState } from 'react';
import { formatListTime, listedChats, previewText } from '../../../shared/chat';
import { respondGroupInvitation } from '../../services/social';
import { useAccount } from '../auth/account';
import { useSocial } from '../social/social';
import { Notice, useSocialAction } from '../social/socialUi';
import { CharacterAvatar } from './CharacterAvatar';
import { useChat } from './chat';

interface ChatListProps {
  activeConversationId: string | null;
  onOpen: (conversationId: string) => void;
}

/** Invitations to group chats, at the top of the list: join (and open it) or decline. */
function Invitations({ onOpen }: { onOpen: (conversationId: string) => void }) {
  const { invitations } = useSocial();
  const { refreshConversations } = useChat();
  const { busyKey, isBusy, notice, run } = useSocialAction();
  if (invitations.length === 0) return null;
  return (
    <section className="chat-invitations" aria-label="Group invitations">
      <p className="presence-group-label">INVITATIONS</p>
      {invitations.map((invitation) => (
        <div key={invitation.id} className="chat-invitation">
          <span className="friend-name">
            <strong>{invitation.groupName}</strong>
            <small>{invitation.inviter ? `${invitation.inviter.displayName} invited you` : 'You were invited'}</small>
          </span>
          <span className="friend-actions">
            <button
              type="button"
              className="social-chip social-chip-primary"
              disabled={isBusy}
              onClick={() => void run(`join:${invitation.id}`, async () => {
                await respondGroupInvitation(invitation.id, true);
                const chat = (await refreshConversations()).find((item) => item.group?.id === invitation.groupId);
                if (chat) onOpen(chat.id);
              })}
            >
              {busyKey === `join:${invitation.id}` ? 'Joining…' : 'Join'}
            </button>
            <button
              type="button"
              className="social-chip"
              disabled={isBusy}
              onClick={() => void run(`decline:${invitation.id}`, () => respondGroupInvitation(invitation.id, false))}
            >
              Decline
            </button>
          </span>
        </div>
      ))}
      <Notice notice={notice} />
    </section>
  );
}

/** The chats with something said in them, newest first, with a search box: like a chat app's list. */
export function ChatList({ activeConversationId, onOpen }: ChatListProps) {
  const { profile } = useAccount();
  const myId = profile?.id ?? '';
  const { conversations, status } = useChat();
  const [search, setSearch] = useState('');
  const chats = listedChats(conversations, activeConversationId, search);
  const now = new Date();

  return (
    <aside className="chat-list" aria-label="Chats">
      <div className="chat-list-search">
        <input
          className="chat-search"
          value={search}
          placeholder="Search chats"
          aria-label="Search chats"
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>
      <div className="chat-list-scroll">
        <Invitations onOpen={onOpen} />
        {chats.map((chat) => {
          const isActive = chat.id === activeConversationId;
          const unread = chat.unreadCount;
          return (
            <button
              key={chat.id}
              type="button"
              className={`chat-list-item${isActive ? ' chat-list-item-active' : ''}${unread > 0 && !chat.muted ? ' chat-list-item-unread' : ''}`}
              aria-current={isActive ? 'page' : undefined}
              onClick={() => onOpen(chat.id)}
            >
              <CharacterAvatar
                characterId={chat.characterId}
                name={chat.title}
                size={40}
                presence={chat.kind === 'direct' && chat.canSend ? chat.partner?.presence : undefined}
              />
              <span className="chat-list-text">
                <span className="chat-list-line">
                  <strong>{chat.title}</strong>
                  {chat.lastMessageAt && <time dateTime={chat.lastMessageAt}>{formatListTime(chat.lastMessageAt, now)}</time>}
                </span>
                <span className="chat-list-line">
                  <small>
                    {chat.kind === 'group' && <span className="chat-list-kind">Group · </span>}
                    {previewText(chat.lastMessage, myId, chat.kind === 'group')}
                  </small>
                  {chat.muted && <span className="chat-list-muted" title="Muted">🔕</span>}
                  {unread > 0 && (
                    <span className={`nav-badge${chat.muted ? ' nav-badge-muted' : ''}`} aria-label={`${unread} unread`}>
                      {unread > 99 ? '99+' : unread}
                    </span>
                  )}
                </span>
              </span>
            </button>
          );
        })}
        {status === 'ready' && chats.length === 0 && (
          <p className="chat-list-empty">
            {search ? `No chat matches “${search}”.` : 'No chats yet. Start one with New chat or New group, or press Chat next to a friend.'}
          </p>
        )}
      </div>
    </aside>
  );
}
