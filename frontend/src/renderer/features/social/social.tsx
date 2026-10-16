import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { isPresenceStatus, PRESENCE_HEARTBEAT_MS } from '../../../shared/social';
import type { FriendGroup, FriendProfile, Friendship, GroupInvitation, PresenceStatus } from '../../../shared/types';
import {
  fetchFriendships,
  fetchGroupInvitations,
  fetchGroups,
  reportPresence,
  startReportingPresence,
  stopReportingPresence,
} from '../../services/social';
import { openEventStream } from '../../services/eventStream';
import { useAccount } from '../auth/account';

// The backend's event stream delivers changes as they happen; this poll is the safety net, and it is also
// how a friend whose app stopped reporting (e.g. it crashed) turns offline.
const POLL_MS = 30_000;
const REFRESH_DEBOUNCE_MS = 250;

interface SocialContextValue {
  /** 'loading' until the first fetch finishes. */
  status: 'loading' | 'ready';
  /** Why the latest refresh failed (the last good data stays on screen). */
  error: string | null;
  /** The status this app reports for you. */
  myPresence: Exclude<PresenceStatus, 'offline'>;
  friends: Friendship[];
  incoming: Friendship[];
  outgoing: Friendship[];
  groups: FriendGroup[];
  invitations: GroupInvitation[];
  refresh: () => Promise<void>;
}

const SocialContext = createContext<SocialContextValue | null>(null);

export const useSocial = (): SocialContextValue => {
  const value = useContext(SocialContext);
  if (!value) throw new Error('useSocial must be used inside <SocialProvider>.');
  return value;
};

/** A status change from the event stream ("presence"). */
interface PresenceChange {
  userId: string;
  presence: PresenceStatus;
  lastSeenAt: string | null;
}

const isPresenceChange = (value: unknown): value is PresenceChange =>
  typeof value === 'object' && value !== null
  && typeof (value as PresenceChange).userId === 'string' && isPresenceStatus((value as PresenceChange).presence);

/** Applies a status change to everyone shown with that id. */
const patchPresence = <T extends FriendProfile>(profile: T, change: PresenceChange): T =>
  (profile.id === change.userId ? { ...profile, presence: change.presence, lastSeenAt: change.lastSeenAt } : profile);

/** Friends, requests and groups of the signed-in user, kept up to date. Mount only while signed in. */
export function SocialProvider({ children }: { children: ReactNode }) {
  const { profile } = useAccount();
  const myId = profile?.id ?? '';
  const [status, setStatus] = useState<SocialContextValue['status']>('loading');
  const [error, setError] = useState<string | null>(null);
  const [friendships, setFriendships] = useState<Friendship[]>([]);
  const [groups, setGroups] = useState<FriendGroup[]>([]);
  const [invitations, setInvitations] = useState<GroupInvitation[]>([]);
  const [myPresence, setMyPresence] = useState<SocialContextValue['myPresence']>('online');
  const latestRefresh = useRef(0);

  const refresh = useCallback(async () => {
    if (!myId) return;
    const ticket = ++latestRefresh.current;
    try {
      const [nextFriendships, nextGroups, nextInvitations] = await Promise.all([
        fetchFriendships(),
        fetchGroups(),
        fetchGroupInvitations(),
      ]);
      // An older refresh that finishes late must not overwrite a newer one.
      if (ticket !== latestRefresh.current) return;
      setFriendships(nextFriendships);
      setGroups(nextGroups);
      setInvitations(nextInvitations);
      setError(null);
    } catch (refreshError) {
      if (ticket === latestRefresh.current) setError((refreshError as Error).message);
    } finally {
      if (ticket === latestRefresh.current) setStatus('ready');
    }
  }, [myId]);

  // Report your own status: online now, idle/online as the desktop app notices, offline when quitting.
  useEffect(() => {
    if (!myId) return;
    startReportingPresence();
    const report = (next: PresenceStatus) => {
      if (next === 'offline') return;
      setMyPresence(next);
      void reportPresence(next).catch(() => undefined);
    };
    const presence = window.desktopFriends?.presence;
    if (presence) {
      void presence.getStatus().then(report);
      const stopStatus = presence.onStatus(report);
      const stopQuitting = presence.onQuitting(() => {
        void stopReportingPresence().finally(() => presence.quitReady());
      });
      return () => {
        stopStatus();
        stopQuitting();
      };
    }
    // Outside the desktop app (plain browser): no idle detection, just keep "online" fresh.
    report('online');
    const heartbeat = setInterval(() => report('online'), PRESENCE_HEARTBEAT_MS);
    return () => clearInterval(heartbeat);
  }, [myId]);

  // Load, then follow changes live.
  useEffect(() => {
    if (!myId) return;
    let debounce: ReturnType<typeof setTimeout> | undefined;
    const scheduleRefresh = () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => void refresh(), REFRESH_DEBOUNCE_MS);
    };
    void refresh();

    const closeStream = openEventStream(({ name, data }) => {
      if (name === 'presence' && isPresenceChange(data)) {
        setFriendships((current) => current.map((item) => ({ ...item, friend: patchPresence(item.friend, data) })));
        setGroups((current) => current.map((group) => ({ ...group, members: group.members.map((member) => patchPresence(member, data)) })));
      } else if (name === 'friends' || name === 'groups' || name === 'ready') {
        // "ready" starts every (re)connection: catch up on anything missed while disconnected.
        scheduleRefresh();
      }
    });

    const poll = setInterval(() => void refresh(), POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') scheduleRefresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearTimeout(debounce);
      clearInterval(poll);
      document.removeEventListener('visibilitychange', onVisible);
      closeStream();
    };
  }, [myId, refresh]);

  const value = useMemo<SocialContextValue>(() => ({
    status,
    error,
    myPresence,
    friends: friendships.filter((item) => item.kind === 'friend'),
    incoming: friendships.filter((item) => item.kind === 'incoming'),
    outgoing: friendships.filter((item) => item.kind === 'outgoing'),
    groups,
    invitations,
    refresh,
  }), [status, error, myPresence, friendships, groups, invitations, refresh]);

  return <SocialContext.Provider value={value}>{children}</SocialContext.Provider>;
}
