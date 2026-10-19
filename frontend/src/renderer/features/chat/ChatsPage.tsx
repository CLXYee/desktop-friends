import { useEffect, useState } from 'react';
import { totalUnread } from '../../../shared/chat';
import { useChat } from './chat';
import { ChatList } from './ChatList';
import { ChatView } from './ChatView';
import { GroupInfoPanel } from './GroupInfoPanel';
import { NewChatButton, NewGroupButton } from './NewChatMenus';

interface ChatsPageProps {
  /** The open chat, if any. */
  conversationId: string | null;
  onOpen: (conversationId: string | null) => void;
}

/**
 * Chats, like a chat app: the list of chats on the left (groups and friends together, newest first), the open
 * one on the right, and New chat / New group in the top-right corner. A group's details (members, invite link,
 * leaving) are in its Group info panel.
 */
export function ChatsPage({ conversationId, onOpen }: ChatsPageProps) {
  const { conversations, refreshConversations } = useChat();
  const [isGroupInfoOpen, setIsGroupInfoOpen] = useState(false);
  const active = conversations.find((item) => item.id === conversationId);
  const unread = totalUnread(conversations);
  const chatCount = conversations.filter((item) => item.lastMessageAt !== null).length;

  // Opening Chats shows the list as it is now (live events keep it current while it's open).
  useEffect(() => {
    void refreshConversations();
  }, [refreshConversations]);

  // Each chat starts with its info panel closed.
  useEffect(() => setIsGroupInfoOpen(false), [conversationId]);

  return (
    <div className="chats-page">
      <header className="chats-header">
        <div>
          <p className="eyebrow">{chatCount} {chatCount === 1 ? 'CHAT' : 'CHATS'}{unread > 0 && ` · ${unread} UNREAD`}</p>
          <h1>Chats</h1>
        </div>
        <div className="chats-header-actions">
          <NewChatButton onOpenChat={onOpen} />
          <NewGroupButton onOpenChat={onOpen} />
        </div>
      </header>
      <div className="chats-layout">
        <ChatList activeConversationId={conversationId} onOpen={onOpen} />
        <div className="chat-pane">
          {conversationId ? (
            <ChatView
              conversationId={conversationId}
              isGroupInfoOpen={isGroupInfoOpen}
              onToggleGroupInfo={() => setIsGroupInfoOpen((open) => !open)}
            />
          ) : (
            <div className="chat-pane-empty">
              <span className="presence-orbit" aria-hidden="true"><i /></span>
              <h2>Pick a chat</h2>
              <p className="empty-copy">Choose one on the left, or start a new chat with a friend or a new group in the top-right corner.</p>
            </div>
          )}
          {isGroupInfoOpen && active?.kind === 'group' && active.group && (
            <GroupInfoPanel
              groupId={active.group.id}
              onClose={() => setIsGroupInfoOpen(false)}
              onLeft={() => {
                setIsGroupInfoOpen(false);
                onOpen(null);
              }}
              onOpenChat={onOpen}
            />
          )}
        </div>
      </div>
    </div>
  );
}
