import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { GROUP_DESCRIPTION_MAX, GROUP_NAME_MAX, parseInviteCode, presenceLabel, sortByPresence } from '../../../shared/social';
import { createGroup, inviteToGroup, joinGroupByCode } from '../../services/social';
import { useSocial } from '../social/social';
import { Notice, useSocialAction } from '../social/socialUi';
import { CharacterAvatar, CharacterPicker } from './CharacterAvatar';
import { useChat } from './chat';

/** A button with a panel under it that closes on Escape or a click elsewhere. */
function MenuButton({ label, primary, children }: {
  label: ReactNode;
  primary?: boolean;
  children: (close: () => void) => ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [isOpen]);

  return (
    <div className="new-chat-menu" ref={rootRef}>
      <button
        type="button"
        className={`invite-button${primary ? ' invite-button-primary' : ''}`}
        aria-expanded={isOpen}
        onClick={() => setIsOpen((open) => !open)}
      >
        {label}
      </button>
      {isOpen && <div className="social-popover new-chat-popover">{children(() => setIsOpen(false))}</div>}
    </div>
  );
}

/** "New chat": pick a friend and go straight to your chat with them. */
export function NewChatButton({ onOpenChat }: { onOpenChat: (conversationId: string) => void }) {
  return (
    <MenuButton label={<><span aria-hidden="true">＋</span> New chat</>}>
      {(close) => <FriendPicker onOpenChat={(id) => {
        close();
        onOpenChat(id);
      }} />}
    </MenuButton>
  );
}

function FriendPicker({ onOpenChat }: { onOpenChat: (conversationId: string) => void }) {
  const { friends } = useSocial();
  const { openDirect } = useChat();
  const { busyKey, isBusy, notice, run } = useSocialAction();
  const [search, setSearch] = useState('');
  const query = search.trim().toLowerCase();
  const people = sortByPresence(friends.map((item) => item.friend))
    .filter((friend) => !query || friend.displayName.toLowerCase().includes(query) || friend.username.includes(query));

  return (
    <div className="friend-picker">
      <p className="presence-group-label">START A CHAT WITH A FRIEND</p>
      {friends.length === 0 ? (
        <p className="social-hint">Add friends on the Friends page first, then chat with them here.</p>
      ) : (
        <>
          <input
            className="chat-search"
            value={search}
            autoFocus
            placeholder="Search friends"
            aria-label="Search friends"
            onChange={(event) => setSearch(event.target.value)}
          />
          <ul className="friend-list">
            {people.map((friend) => (
              <li key={friend.id}>
                <button
                  type="button"
                  className="friend-picker-row"
                  disabled={isBusy}
                  onClick={() => void run(`open:${friend.id}`, async () => onOpenChat(await openDirect(friend.id)))}
                >
                  <CharacterAvatar characterId={friend.characterId} name={friend.displayName} size={30} presence={friend.presence} />
                  <span className="friend-name">
                    <strong>{friend.displayName}</strong>
                    <small>@{friend.username} · {presenceLabel(friend.presence)}</small>
                  </span>
                  <span className="friend-picker-go">{busyKey === `open:${friend.id}` ? 'Opening…' : '💬'}</span>
                </button>
              </li>
            ))}
            {people.length === 0 && <li className="social-hint">No friend matches “{search}”.</li>}
          </ul>
        </>
      )}
      <Notice notice={notice} />
    </div>
  );
}

/** "New group": create a group (its chat comes with it), or join one with an invite link. */
export function NewGroupButton({ onOpenChat }: { onOpenChat: (conversationId: string) => void }) {
  const [tab, setTab] = useState<'create' | 'join'>('create');
  return (
    <MenuButton primary label={<><span aria-hidden="true">＋</span> New group</>}>
      {(close) => {
        const open = (id: string) => {
          close();
          onOpenChat(id);
        };
        return (
          <div className="new-group">
            <div className="auth-tabs new-group-tabs" role="tablist" aria-label="New group">
              <button type="button" role="tab" className="auth-tab" aria-selected={tab === 'create'} onClick={() => setTab('create')}>Create</button>
              <button type="button" role="tab" className="auth-tab" aria-selected={tab === 'join'} onClick={() => setTab('join')}>Join with a link</button>
            </div>
            {tab === 'create' ? <CreateGroupForm onOpenChat={open} /> : <JoinGroupForm onOpenChat={open} />}
          </div>
        );
      }}
    </MenuButton>
  );
}

function CreateGroupForm({ onOpenChat }: { onOpenChat: (conversationId: string) => void }) {
  const { friends } = useSocial();
  const { refreshConversations } = useChat();
  const { isBusy, notice, run } = useSocialAction();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [characterId, setCharacterId] = useState('crystal');
  const [inviteIds, setInviteIds] = useState<string[]>([]);
  const clean = name.trim();
  const canSubmit = clean.length > 0 && clean.length <= GROUP_NAME_MAX && description.trim().length <= GROUP_DESCRIPTION_MAX && !isBusy;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    let chatId: string | null = null;
    const created = await run('create', async () => {
      const group = await createGroup(clean, description.trim(), characterId);
      for (const friendId of inviteIds) await inviteToGroup(group.id, friendId);
      await refreshConversations();
      chatId = group.conversationId;
    });
    if (created && chatId) onOpenChat(chatId);
  };

  return (
    <form className="new-group-form" onSubmit={submit} noValidate>
      <label className="social-field">
        <span>Group name</span>
        <input value={name} autoFocus maxLength={GROUP_NAME_MAX} placeholder="e.g. Study Buddies" onChange={(event) => setName(event.target.value)} />
      </label>
      <label className="social-field">
        <span>Description <small>(optional)</small></span>
        <input value={description} maxLength={GROUP_DESCRIPTION_MAX} placeholder="What's the group for?" onChange={(event) => setDescription(event.target.value)} />
      </label>
      <div className="social-field">
        <span>Group avatar</span>
        <CharacterPicker value={characterId} onChange={setCharacterId} label="Group avatar" />
      </div>
      {friends.length > 0 && (
        <fieldset className="social-field new-group-invites">
          <legend>Invite friends <small>(optional)</small></legend>
          {friends.map(({ friend }) => (
            <label key={friend.id} className="new-group-invite">
              <input
                type="checkbox"
                checked={inviteIds.includes(friend.id)}
                onChange={(event) => setInviteIds((current) => (event.target.checked
                  ? [...current, friend.id]
                  : current.filter((id) => id !== friend.id)))}
              />
              <CharacterAvatar characterId={friend.characterId} name={friend.displayName} size={22} />
              <span>{friend.displayName}</span>
            </label>
          ))}
        </fieldset>
      )}
      <Notice notice={notice} />
      <button className="social-primary" type="submit" disabled={!canSubmit}>{isBusy ? 'Creating…' : 'Create group chat'}</button>
    </form>
  );
}

function JoinGroupForm({ onOpenChat }: { onOpenChat: (conversationId: string) => void }) {
  const { groups } = useSocial();
  const { refreshConversations } = useChat();
  const { isBusy, notice, setNotice, run } = useSocialAction();
  const [link, setLink] = useState('');
  const code = parseInviteCode(link);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!code || isBusy) return;
    const existing = groups.find((group) => group.inviteCode === code);
    if (existing?.conversationId) {
      onOpenChat(existing.conversationId);
      return;
    }
    let chatId: string | undefined;
    const joined = await run('join', async () => {
      const groupId = await joinGroupByCode(code);
      chatId = (await refreshConversations()).find((item) => item.group?.id === groupId)?.id;
    });
    if (joined && chatId) onOpenChat(chatId);
    else if (joined) setNotice({ tone: 'ok', text: "You're in! The group's chat is in your list." });
  };

  return (
    <form className="new-group-form" onSubmit={submit} noValidate>
      <label className="social-field">
        <span>Invite link or code</span>
        <input
          value={link}
          autoFocus
          placeholder="desktop-friends://join/…"
          autoCapitalize="none"
          spellCheck={false}
          aria-invalid={link.trim().length > 0 && !code}
          onChange={(event) => setLink(event.target.value)}
        />
      </label>
      {link.trim().length > 0 && !code
        ? <p className="social-hint social-hint-error">Paste the whole link, e.g. desktop-friends://join/1a2b3c4d5e6f.</p>
        : <Notice notice={notice} />}
      <button className="social-primary" type="submit" disabled={!code || isBusy}>{isBusy ? 'Joining…' : 'Join group chat'}</button>
    </form>
  );
}
