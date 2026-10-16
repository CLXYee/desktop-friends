import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { countByPresence, GROUP_NAME_MAX, inviteLink, parseInviteCode, sortByPresence } from '../../../shared/social';
import type { FriendGroup, Friendship } from '../../../shared/types';
import {
  createGroup,
  inviteToGroup,
  joinGroupByCode,
  leaveGroup,
  resetGroupInviteCode,
  respondGroupInvitation,
} from '../../services/social';
import { useAccount } from '../auth/account';
import { useSocial } from './social';
import { Notice, PresenceDot, useSocialAction, type ActionNotice } from './socialUi';

type Panel = 'none' | 'create' | 'join';

const plural = (count: number, word: string) => {
  if (count === 1) return `${count} ${word}`;
  return `${count} ${word}${word === word.toUpperCase() ? 'S' : 's'}`;
};

function CreateGroupForm({ onCreated }: { onCreated: (notice: ActionNotice) => void }) {
  const [name, setName] = useState('');
  const { isBusy, notice, run } = useSocialAction();
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => inputRef.current?.focus(), []);
  const clean = name.trim();
  const canSubmit = clean.length > 0 && clean.length <= GROUP_NAME_MAX && !isBusy;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    if (await run('create', () => createGroup(clean).then(() => undefined))) {
      onCreated({ tone: 'ok', text: `${clean} is ready. Invite friends from its card, or share its invite link.` });
    }
  };

  return (
    <form className="group-form" onSubmit={handleSubmit} noValidate>
      <label className="social-field">
        <span>Group name</span>
        <input
          ref={inputRef}
          value={name}
          maxLength={GROUP_NAME_MAX}
          placeholder="e.g. Study Buddies"
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      <button className="social-primary" type="submit" disabled={!canSubmit}>{isBusy ? 'Creating…' : 'Create group'}</button>
      <Notice notice={notice} />
    </form>
  );
}

function JoinGroupForm({ groups, onJoined }: { groups: FriendGroup[]; onJoined: (notice: ActionNotice) => void }) {
  const [link, setLink] = useState('');
  const { isBusy, notice, setNotice, run } = useSocialAction();
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => inputRef.current?.focus(), []);
  const code = parseInviteCode(link);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!code || isBusy) return;
    const existing = groups.find((group) => group.inviteCode === code);
    if (existing) {
      setNotice({ tone: 'ok', text: `You're already in ${existing.name}.` });
      return;
    }
    if (await run('join', () => joinGroupByCode(code).then(() => undefined))) {
      onJoined({ tone: 'ok', text: "You're in! The group is listed below." });
    }
  };

  return (
    <form className="group-form" onSubmit={handleSubmit} noValidate>
      <label className="social-field">
        <span>Invite link or code</span>
        <input
          ref={inputRef}
          value={link}
          placeholder="desktop-friends://join/…"
          autoCapitalize="none"
          spellCheck={false}
          aria-invalid={link.trim().length > 0 && !code}
          onChange={(event) => setLink(event.target.value)}
        />
      </label>
      <button className="social-primary" type="submit" disabled={!code || isBusy}>{isBusy ? 'Joining…' : 'Join group'}</button>
      {link.trim().length > 0 && !code
        ? <p className="social-hint social-hint-error">Paste the whole link, e.g. desktop-friends://join/1a2b3c4d5e6f.</p>
        : <Notice notice={notice} />}
    </form>
  );
}

function GroupCard({ group, myId, friends }: { group: FriendGroup; myId: string; friends: Friendship[] }) {
  const { busyKey, isBusy, notice, setNotice, run } = useSocialAction();
  const [inviteeId, setInviteeId] = useState('');
  const [confirm, setConfirm] = useState<'leave' | 'reset' | null>(null);
  const [copied, setCopied] = useState(false);
  const linkRef = useRef<HTMLInputElement>(null);
  const inviteId = useId();

  const isOwner = group.members.some((member) => member.id === myId && member.role === 'owner');
  const members = sortByPresence(group.members);
  const counts = countByPresence(group.members);
  const memberIds = new Set(group.members.map((member) => member.id));
  const invitable = friends
    .map((item) => item.friend)
    .filter((friend) => !memberIds.has(friend.id))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
  const invitee = invitable.find((friend) => friend.id === inviteeId);
  const successor = group.members.find((member) => member.id !== myId);
  const link = inviteLink(group.inviteCode);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

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
    <article className="group-card" aria-labelledby={`${inviteId}-title`}>
      <header className="group-card-header">
        <div>
          <p className="routine-eyebrow">{plural(group.members.length, 'MEMBER')} · {counts.online} ONLINE</p>
          <h3 id={`${inviteId}-title`}>{group.name}</h3>
        </div>
      </header>

      <ul className="friend-list group-members">
        {members.map((member) => (
          <li key={member.id} className="friend-row">
            <PresenceDot presence={member.presence} />
            <span className="friend-name">
              <strong>{member.displayName}{member.id === myId && <span className="group-you"> (you)</span>}</strong>
              <small>@{member.username}</small>
            </span>
            {member.role === 'owner' && <span className="group-role">owner</span>}
          </li>
        ))}
      </ul>

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
        <p className="social-hint">Anyone with this link can join from Groups → Join with a link.</p>
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
                ? 'You are the last member, so the group will be deleted.'
                : isOwner ? `${successor.displayName} becomes the owner.` : 'You can rejoin with an invite.'}
            </span>
            <button
              type="button"
              className="social-chip social-chip-danger"
              disabled={isBusy}
              onClick={() => void run('leave', () => leaveGroup(group.id))}
            >
              {busyKey === 'leave' ? 'Leaving…' : 'Leave'}
            </button>
            <button type="button" className="social-chip" onClick={() => setConfirm(null)}>Stay</button>
          </>
        )}
      </footer>
    </article>
  );
}

/** The Groups page: your groups, invitations to others, and creating or joining one. */
export function GroupsPage() {
  const { profile } = useAccount();
  const { status, error, groups, invitations, friends } = useSocial();
  const [panel, setPanel] = useState<Panel>('none');
  const [pageNotice, setPageNotice] = useState<ActionNotice | null>(null);
  const { busyKey, isBusy, notice, run } = useSocialAction();
  const myId = profile?.id ?? '';

  // Outcome messages for the page fade after a moment (the group they mention may already be gone).
  useEffect(() => {
    if (!pageNotice) return;
    const timer = setTimeout(() => setPageNotice(null), 6000);
    return () => clearTimeout(timer);
  }, [pageNotice]);

  const togglePanel = (next: Panel) => {
    setPanel((current) => (current === next ? 'none' : next));
    setPageNotice(null);
  };
  const finishPanel = (result: ActionNotice) => {
    setPanel('none');
    setPageNotice(result);
  };

  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">{plural(groups.length, 'GROUP')}{invitations.length > 0 && ` · ${plural(invitations.length, 'INVITATION')}`}</p>
          <h1>Groups</h1>
        </div>
        <div className="page-actions">
          <button className="invite-button" type="button" aria-expanded={panel === 'join'} onClick={() => togglePanel('join')}>
            <span aria-hidden="true">⇢</span> Join with a link
          </button>
          <button className="invite-button invite-button-primary" type="button" aria-expanded={panel === 'create'} onClick={() => togglePanel('create')}>
            <span aria-hidden="true">＋</span> New group
          </button>
        </div>
      </div>

      {panel === 'create' && <CreateGroupForm onCreated={finishPanel} />}
      {panel === 'join' && <JoinGroupForm groups={groups} onJoined={finishPanel} />}
      {error && <p className="social-notice social-notice-error group-page-notice" role="alert">{error}</p>}
      {pageNotice && <p className="social-notice social-notice-ok group-page-notice" role="status">{pageNotice.text}</p>}

      {invitations.length > 0 && (
        <section className="group-invitations" aria-label="Group invitations">
          <p className="presence-group-label">INVITATIONS</p>
          <Notice notice={notice} />
          <ul className="friend-list">
            {invitations.map((invitation) => (
              <li key={invitation.id} className="friend-row">
                <span className="nav-glyph group-invitation-glyph" aria-hidden="true">◇</span>
                <span className="friend-name">
                  <strong>{invitation.groupName}</strong>
                  <small>{invitation.inviter ? `${invitation.inviter.displayName} (@${invitation.inviter.username}) invited you` : 'You were invited'}</small>
                </span>
                <span className="friend-actions">
                  <button
                    type="button"
                    className="social-chip social-chip-primary"
                    disabled={isBusy}
                    onClick={() => void run(`join:${invitation.id}`, async () => {
                      await respondGroupInvitation(invitation.id, true);
                      return `You joined ${invitation.groupName}.`;
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
              </li>
            ))}
          </ul>
        </section>
      )}

      {status === 'loading' ? (
        <section className="empty-state group-empty"><p className="empty-copy">Loading your groups…</p></section>
      ) : groups.length === 0 ? (
        <section className="empty-state group-empty">
          <span className="presence-orbit" aria-hidden="true"><i /></span>
          <h2>No groups yet</h2>
          <p className="empty-copy">Start one for your study buddies or game night, then invite friends or share its link.</p>
        </section>
      ) : (
        <section className="group-grid" aria-label="Your groups">
          {groups.map((group) => <GroupCard key={group.id} group={group} myId={myId} friends={friends} />)}
        </section>
      )}
    </>
  );
}
