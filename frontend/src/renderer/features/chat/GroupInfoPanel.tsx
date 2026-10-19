import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { countByPresence, GROUP_DESCRIPTION_MAX, GROUP_NAME_MAX, inviteLink, sortByPresence } from '../../../shared/social';
import type { FriendGroup } from '../../../shared/types';
import { inviteToGroup, leaveGroup, resetGroupInviteCode, updateGroup } from '../../services/social';
import { useAccount } from '../auth/account';
import { useSocial } from '../social/social';
import { Notice, useSocialAction } from '../social/socialUi';
import { CharacterAvatar, CharacterPicker } from './CharacterAvatar';
import { useChat } from './chat';

function GroupDetailsForm({ group, onDone }: { group: FriendGroup; onDone: () => void }) {
  const [name, setName] = useState(group.name);
  const [description, setDescription] = useState(group.description);
  const [characterId, setCharacterId] = useState(group.characterId);
  const { refreshConversations } = useChat();
  const { isBusy, notice, run } = useSocialAction();
  const canSave = name.trim().length > 0 && name.trim().length <= GROUP_NAME_MAX && description.trim().length <= GROUP_DESCRIPTION_MAX && !isBusy;

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSave) return;
    const saved = await run('details', async () => {
      await updateGroup(group.id, { name: name.trim(), description: description.trim(), characterId });
      await refreshConversations();
    });
    if (saved) onDone();
  };

  return (
    <form className="group-details-form" onSubmit={save} noValidate>
      <label className="social-field">
        <span>Name</span>
        <input value={name} maxLength={GROUP_NAME_MAX} onChange={(event) => setName(event.target.value)} />
      </label>
      <label className="social-field">
        <span>Description</span>
        <input value={description} maxLength={GROUP_DESCRIPTION_MAX} placeholder="What's the group for?" onChange={(event) => setDescription(event.target.value)} />
      </label>
      <div className="social-field">
        <span>Group avatar</span>
        <CharacterPicker value={characterId} onChange={setCharacterId} label="Group avatar" />
      </div>
      <Notice notice={notice} />
      <div className="group-inline">
        <button type="submit" className="social-chip social-chip-primary" disabled={!canSave}>{isBusy ? 'Saving…' : 'Save'}</button>
        <button type="button" className="social-chip" onClick={onDone}>Cancel</button>
      </div>
    </form>
  );
}

interface GroupInfoPanelProps {
  groupId: string;
  onClose: () => void;
  /** After leaving: the chat is gone for this user. */
  onLeft: () => void;
  onOpenChat: (conversationId: string) => void;
}

/** A group chat's details: members, inviting friends, the invite link, editing, and leaving. */
export function GroupInfoPanel({ groupId, onClose, onLeft, onOpenChat }: GroupInfoPanelProps) {
  const { profile } = useAccount();
  const myId = profile?.id ?? '';
  const { groups, friends } = useSocial();
  const { openDirect, refreshConversations } = useChat();
  const { busyKey, isBusy, notice, setNotice, run } = useSocialAction();
  const [inviteeId, setInviteeId] = useState('');
  const [confirm, setConfirm] = useState<'leave' | 'reset' | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [copied, setCopied] = useState(false);
  const linkRef = useRef<HTMLInputElement>(null);
  const inviteId = useId();
  const group = groups.find((item) => item.id === groupId);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  if (!group) {
    return (
      <aside className="group-info" aria-label="Group info">
        <header className="group-info-header">
          <strong>Group info</strong>
          <button type="button" className="chat-action" onClick={onClose} aria-label="Close group info">✕</button>
        </header>
        <p className="social-hint">Loading the group…</p>
      </aside>
    );
  }

  const isOwner = group.members.some((member) => member.id === myId && member.role === 'owner');
  const members = sortByPresence(group.members);
  const counts = countByPresence(group.members);
  const memberIds = new Set(group.members.map((member) => member.id));
  const friendIds = new Set(friends.map((item) => item.friend.id));
  const invitable = friends.map((item) => item.friend).filter((friend) => !memberIds.has(friend.id))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
  const invitee = invitable.find((friend) => friend.id === inviteeId);
  const successor = group.members.find((member) => member.id !== myId);
  const link = inviteLink(group.inviteCode);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      // Clipboard blocked: select the text so it can be copied by hand.
      linkRef.current?.select();
      setNotice({ tone: 'error', text: 'Copying is blocked here. The link is selected; press Ctrl+C to copy it.' });
    }
  };

  return (
    <aside className="group-info" aria-label="Group info">
      <header className="group-info-header">
        <strong>Group info</strong>
        <button type="button" className="chat-action" onClick={onClose} aria-label="Close group info">✕</button>
      </header>

      <div className="group-info-identity">
        <CharacterAvatar characterId={group.characterId} name={group.name} size={64} />
        <h2>{group.name}</h2>
        {group.description && <p className="group-description">{group.description}</p>}
        <p className="routine-eyebrow">{group.members.length} {group.members.length === 1 ? 'MEMBER' : 'MEMBERS'} · {counts.online} ONLINE</p>
        {isOwner && !isEditing && (
          <button type="button" className="routine-reset" onClick={() => setIsEditing(true)}>Edit details</button>
        )}
      </div>

      {isEditing && <GroupDetailsForm group={group} onDone={() => setIsEditing(false)} />}

      <div className="group-section">
        <span className="group-section-label">Members</span>
        <ul className="friend-list group-members">
          {members.map((member) => (
            <li key={member.id} className="friend-row">
              <CharacterAvatar characterId={member.characterId} name={member.displayName} size={28} presence={member.presence} />
              <span className="friend-name">
                <strong>{member.displayName}{member.id === myId && <span className="group-you"> (you)</span>}</strong>
                <small>@{member.username}</small>
              </span>
              {member.role === 'owner' && <span className="group-role">owner</span>}
              {member.id !== myId && friendIds.has(member.id) && (
                <button
                  type="button"
                  className="social-chip"
                  disabled={isBusy}
                  title={`Chat with ${member.displayName}`}
                  onClick={() => void run(`chat:${member.id}`, async () => onOpenChat(await openDirect(member.id)))}
                >
                  💬
                </button>
              )}
            </li>
          ))}
        </ul>
      </div>

      <div className="group-section">
        <label className="group-section-label" htmlFor={inviteId}>Invite a friend</label>
        {invitable.length === 0 ? (
          <p className="social-hint">
            {friends.length === 0 ? 'Add friends on the Friends page to invite them here.' : 'All your friends are already in this group.'}
          </p>
        ) : (
          <div className="group-inline">
            <select id={inviteId} className="group-select" value={inviteeId} onChange={(event) => setInviteeId(event.target.value)}>
              <option value="">Choose a friend…</option>
              {invitable.map((friend) => (
                <option key={friend.id} value={friend.id}>
                  {friend.displayName} (@{friend.username}){group.invitedIds.includes(friend.id) ? ' · invited' : ''}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="social-chip social-chip-primary"
              disabled={!invitee || isBusy || group.invitedIds.includes(inviteeId)}
              onClick={() => {
                if (!invitee) return;
                void run('invite', async () => {
                  await inviteToGroup(group.id, invitee.id);
                  setInviteeId('');
                  return `Invitation sent to ${invitee.displayName}.`;
                });
              }}
            >
              {busyKey === 'invite' ? 'Sending…' : group.invitedIds.includes(inviteeId) ? 'Invited' : 'Invite'}
            </button>
          </div>
        )}
      </div>

      <div className="group-section">
        <span className="group-section-label">Invite link</span>
        <div className="group-inline">
          <input ref={linkRef} className="group-link" value={link} readOnly aria-label={`Invite link for ${group.name}`} onFocus={(event) => event.target.select()} />
          <button type="button" className="social-chip" onClick={() => void copyLink()}>{copied ? 'Copied!' : 'Copy'}</button>
        </div>
        <p className="social-hint">Anyone with this link can join from Chats → New group → Join with a link.</p>
      </div>

      <Notice notice={notice} />

      <footer className="group-card-footer">
        {confirm === null && (
          <>
            {isOwner && (
              <button type="button" className="routine-reset" disabled={isBusy} onClick={() => setConfirm('reset')}>Reset link</button>
            )}
            <button type="button" className="routine-reset group-leave" disabled={isBusy} onClick={() => setConfirm('leave')}>Leave group</button>
          </>
        )}
        {confirm === 'reset' && (
          <>
            <span>Links shared earlier will stop working.</span>
            <button
              type="button"
              className="social-chip social-chip-primary"
              disabled={isBusy}
              onClick={() => void run('reset', async () => {
                await resetGroupInviteCode(group.id);
                setConfirm(null);
                return 'New invite link ready. The old one no longer works.';
              })}
            >
              {busyKey === 'reset' ? 'Resetting…' : 'Reset'}
            </button>
            <button type="button" className="social-chip" onClick={() => setConfirm(null)}>Cancel</button>
          </>
        )}
        {confirm === 'leave' && (
          <>
            <span>
              {!successor
                ? 'You are the last member, so the group and its chat will be deleted.'
                : isOwner ? `${successor.displayName} becomes the owner.` : 'You can rejoin with an invite.'}
            </span>
            <button
              type="button"
              className="social-chip social-chip-danger"
              disabled={isBusy}
              onClick={() => void run('leave', async () => {
                await leaveGroup(group.id);
                await refreshConversations();
                onLeft();
              })}
            >
              {busyKey === 'leave' ? 'Leaving…' : 'Leave'}
            </button>
            <button type="button" className="social-chip" onClick={() => setConfirm(null)}>Stay</button>
          </>
        )}
      </footer>
    </aside>
  );
}
