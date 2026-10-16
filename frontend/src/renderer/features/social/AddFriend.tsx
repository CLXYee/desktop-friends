import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { isValidUsername, normalizeUsername } from '../../../shared/auth';
import { sendFriendRequest } from '../../services/social';
import { useAccount } from '../auth/account';
import { Notice, useSocialAction } from './socialUi';

/** The "Add a friend" button and its popover: send a friend request by username. */
export function AddFriend() {
  const { profile } = useAccount();
  const [isOpen, setIsOpen] = useState(false);
  const [username, setUsername] = useState('');
  const { isBusy, notice, setNotice, run } = useSocialAction();
  const popoverId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    inputRef.current?.focus();
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

  const name = normalizeUsername(username);
  const isSelf = name === profile?.username;
  const canSubmit = isValidUsername(name) && !isSelf && !isBusy;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    const sent = await run('send', async () => {
      const result = await sendFriendRequest(name);
      return result === 'accepted'
        ? `@${name} had already asked you, so you're friends now.`
        : `Request sent. You'll be friends once @${name} accepts.`;
    });
    if (sent) setUsername('');
  };

  return (
    <div className="add-friend" ref={rootRef}>
      <button
        className="invite-button"
        type="button"
        aria-expanded={isOpen}
        aria-controls={popoverId}
        onClick={() => {
          setIsOpen((open) => !open);
          setNotice(null);
        }}
      >
        <span aria-hidden="true">＋</span> Add a friend
      </button>
      {isOpen && (
        <form id={popoverId} className="social-popover" onSubmit={handleSubmit} noValidate>
          <label className="social-field">
            <span>Their username</span>
            <input
              ref={inputRef}
              value={username}
              placeholder="e.g. friend_amy"
              autoCapitalize="none"
              spellCheck={false}
              maxLength={20}
              aria-invalid={username.length > 0 && (!isValidUsername(name) || isSelf)}
              onChange={(event) => setUsername(event.target.value)}
            />
          </label>
          <p className="social-hint">
            {isSelf ? "That's your own username." : 'They get a request and show up here once they accept.'}
          </p>
          <Notice notice={notice} />
          <button className="social-primary" type="submit" disabled={!canSubmit}>
            {isBusy ? 'Sending…' : 'Send request'}
          </button>
        </form>
      )}
    </div>
  );
}
