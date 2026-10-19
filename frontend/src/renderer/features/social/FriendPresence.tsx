import { useId, useState } from 'react';
import { countByPresence, lastSeenLabel, presenceLabel, presenceStatuses, sortByPresence } from '../../../shared/social';
import type { FriendProfile, PresenceStatus } from '../../../shared/types';
import { removeFriend, respondFriendRequest } from '../../services/social';
import { useSocial } from './social';
import { CharacterAvatar } from '../chat/CharacterAvatar';
import { useChat } from '../chat/chat';
import { Notice, useSocialAction } from './socialUi';

type Filter = 'all' | PresenceStatus;

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

const statusText = (friend: FriendProfile): string => {
  if (friend.presence !== 'offline') return presenceLabel(friend.presence);
  const seen = lastSeenLabel(friend.lastSeenAt);
  return seen ? `Offline · ${seen}` : 'Offline';
};

/** The presence bar on the Friends page: a dropdown listing friends by online status, plus requests. */
export function FriendPresence({ onOpenChat }: { onOpenChat: (conversationId: string) => void }) {
  const { openDirect } = useChat();
  const { status, error, friends, incoming, outgoing } = useSocial();
  const [isOpen, setIsOpen] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const { busyKey, isBusy, notice, run } = useSocialAction();
  const panelId = useId();
  const filterId = useId();

  const people = sortByPresence(friends.map((item) => item.friend));
  const counts = countByPresence(people);
  const shown = filter === 'all' ? people : people.filter((person) => person.presence === filter);

  const title = status === 'loading'
    ? 'Looking for your friends…'
    : people.length === 0
      ? 'No friends yet'
      : `${counts.online} of ${plural(people.length, 'friend')} online`;
  const subtitle = incoming.length > 0
    ? `${plural(incoming.length, 'friend request')} waiting for you`
    : people.length === 0
      ? 'Add someone by their username to see when they are around.'
      : `${counts.idle} idle · ${counts.offline} offline`;

  return (
    <section className={`presence-dropdown${isOpen ? ' presence-dropdown-open' : ''}`} aria-label="Friend presence">
      <button
        type="button"
        className="presence-bar presence-toggle"
        aria-expanded={isOpen}
        aria-controls={panelId}
        onClick={() => setIsOpen((open) => !open)}
      >
        <span className="presence-orbit" aria-hidden="true"><i className={counts.online > 0 ? 'presence-orbit-live' : undefined} /></span>
        <span className="presence-copy">
          <strong>{title}</strong>
          <span>{subtitle}</span>
        </span>
        {incoming.length > 0 && <span className="social-badge">{incoming.length} NEW</span>}
        <span className="online-count">{counts.online} ONLINE</span>
        <span className="presence-chevron" aria-hidden="true">▾</span>
      </button>

      {isOpen && (
        <div id={panelId} className="presence-panel">
          {error && <p className="social-notice social-notice-error" role="alert">{error}</p>}
          <Notice notice={notice} />

          {incoming.length > 0 && (
            <div className="presence-group">
              <p className="presence-group-label">FRIEND REQUESTS</p>
              <ul className="friend-list">
                {incoming.map((request) => (
                  <li key={request.id} className="friend-row">
                    <CharacterAvatar characterId={request.friend.characterId} name={request.friend.displayName} size={30} presence={request.friend.presence} />
                    <span className="friend-name">
                      <strong>{request.friend.displayName}</strong>
                      <small>@{request.friend.username} wants to be friends</small>
                    </span>
                    <span className="friend-actions">
                      <button
                        type="button"
                        className="social-chip social-chip-primary"
                        disabled={isBusy}
                        onClick={() => void run(`accept:${request.id}`, async () => {
                          await respondFriendRequest(request.id, true);
                          return `You and ${request.friend.displayName} are friends now.`;
                        })}
                      >
                        {busyKey === `accept:${request.id}` ? 'Accepting…' : 'Accept'}
                      </button>
                      <button
                        type="button"
                        className="social-chip"
                        disabled={isBusy}
                        onClick={() => void run(`decline:${request.id}`, () => respondFriendRequest(request.id, false))}
                      >
                        Decline
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="presence-group">
            <div className="presence-group-heading">
              <p className="presence-group-label">FRIENDS</p>
              <label className="activity-picker presence-filter" htmlFor={filterId}>
                <span>Show</span>
                <select id={filterId} value={filter} onChange={(event) => setFilter(event.target.value as Filter)}>
                  <option value="all">Everyone ({people.length})</option>
                  {presenceStatuses.map((item) => (
                    <option key={item.value} value={item.value}>{item.label} ({counts[item.value]})</option>
                  ))}
                </select>
              </label>
            </div>
            {shown.length === 0 ? (
              <p className="presence-empty">
                {people.length === 0
                  ? 'Use "Add a friend" above to send your first request.'
                  : `No friends are ${presenceLabel(filter as PresenceStatus).toLowerCase()} right now.`}
              </p>
            ) : (
              <ul className="friend-list">
                {shown.map((friend) => (
                  <li key={friend.id} className="friend-row">
                    <CharacterAvatar characterId={friend.characterId} name={friend.displayName} size={30} presence={friend.presence} />
                    <span className="friend-name">
                      <strong>{friend.displayName}</strong>
                      <small>@{friend.username}</small>
                    </span>
                    <span className={`friend-status friend-status-${friend.presence}`}>{statusText(friend)}</span>
                    <span className="friend-actions">
                      {confirmRemoveId !== friend.id && (
                        <button
                          type="button"
                          className="social-chip social-chip-primary"
                          disabled={isBusy}
                          aria-label={`Chat with ${friend.displayName}`}
                          onClick={() => void run(`message:${friend.id}`, async () => onOpenChat(await openDirect(friend.id)))}
                        >
                          {busyKey === `message:${friend.id}` ? 'Opening…' : '💬 Chat'}
                        </button>
                      )}
                      {confirmRemoveId === friend.id ? (
                        <>
                          <button
                            type="button"
                            className="social-chip social-chip-danger"
                            disabled={isBusy}
                            onClick={() => void run(`remove:${friend.id}`, async () => {
                              await removeFriend(friend.id);
                              setConfirmRemoveId(null);
                              return `${friend.displayName} was removed from your friends.`;
                            })}
                          >
                            {busyKey === `remove:${friend.id}` ? 'Removing…' : 'Remove'}
                          </button>
                          <button type="button" className="social-chip" onClick={() => setConfirmRemoveId(null)}>Keep</button>
                        </>
                      ) : (
                        <button
                          type="button"
                          className="social-chip social-chip-quiet"
                          aria-label={`Remove ${friend.displayName} from friends`}
                          onClick={() => setConfirmRemoveId(friend.id)}
                        >
                          Remove
                        </button>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {outgoing.length > 0 && (
            <div className="presence-group">
              <p className="presence-group-label">SENT REQUESTS</p>
              <ul className="friend-list">
                {outgoing.map((request) => (
                  <li key={request.id} className="friend-row">
                    <span className="presence-dot presence-dot-pending" title="Request sent" aria-hidden="true" />
                    <span className="friend-name">
                      <strong>{request.friend.displayName}</strong>
                      <small>@{request.friend.username} · waiting for them to accept</small>
                    </span>
                    <span className="friend-actions">
                      <button
                        type="button"
                        className="social-chip"
                        disabled={isBusy}
                        onClick={() => void run(`cancel:${request.id}`, () => removeFriend(request.friend.id))}
                      >
                        {busyKey === `cancel:${request.id}` ? 'Cancelling…' : 'Cancel'}
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
