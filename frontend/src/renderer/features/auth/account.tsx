import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { DISPLAY_NAME_MAX, isStrongPassword, isValidUsername, normalizeUsername } from '../../../shared/auth';
import { ApiError, apiRequest, isApiConfigured } from '../../services/api';
import {
  clearSession,
  hasSession,
  loadRememberedSession,
  onSessionExpired,
  renewSession,
  setSession,
  type AuthResponse,
} from '../../services/session';
import { stopReportingPresence } from '../../services/social';

export interface Profile {
  id: string;
  username: string;
  displayName: string;
  role: 'user' | 'admin';
  /** The companion shown as their avatar in chats. */
  characterId?: string;
}

export type AccountStatus = 'loading' | 'signed-out' | 'signed-in' | 'unconfigured';

interface AccountContextValue {
  status: AccountStatus;
  profile: Profile | null;
  /** While restoring a remembered sign-in: why it is taking a while (e.g. the server can't be reached yet). */
  restoreMessage: string | null;
  signIn: (input: { username: string; password: string; remember: boolean }) => Promise<string | null>;
  signUp: (input: { displayName: string; username: string; password: string; remember: boolean }) => Promise<string | null>;
  signOut: () => Promise<void>;
  /** Stops waiting for a remembered sign-in and shows the log-in page. */
  cancelRestore: () => void;
}

const AccountContext = createContext<AccountContextValue | null>(null);

// A remembered sign-in is retried while the server can't be reached (e.g. the app started with Windows
// before the network was up).
const RESTORE_RETRY_MS = [2_000, 5_000, 10_000, 30_000];

export const useAccount = (): AccountContextValue => {
  const value = useContext(AccountContext);
  if (!value) throw new Error('useAccount must be used inside <AccountProvider>.');
  return value;
};

const messageOf = (error: unknown): string =>
  (error instanceof Error && error.message ? error.message : 'Something went wrong. Please try again.');

export function AccountProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AccountStatus>(isApiConfigured ? 'loading' : 'unconfigured');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [restoreMessage, setRestoreMessage] = useState<string | null>(null);
  const [isRestoreCancelled, setIsRestoreCancelled] = useState(false);

  const showSignedOut = useCallback(() => {
    setProfile(null);
    setStatus(isApiConfigured ? 'signed-out' : 'unconfigured');
  }, []);

  // Restore a remembered sign-in on launch: a fresh session also brings the profile.
  useEffect(() => {
    if (!isApiConfigured || isRestoreCancelled) return;
    let active = true;
    void (async () => {
      if (!(await loadRememberedSession())) {
        if (active) showSignedOut();
        return;
      }
      for (let attempt = 0; active; attempt += 1) {
        try {
          const session = await renewSession();
          if (!active) return;
          setProfile(session.profile);
          setRestoreMessage(null);
          setStatus('signed-in');
          return;
        } catch (error) {
          if (!active) return;
          if (!(error instanceof ApiError) || error.status !== 0) {
            // The server answered: the remembered sign-in is over.
            clearSession();
            showSignedOut();
            return;
          }
          setRestoreMessage("Can't reach the server yet. Trying again…");
          await new Promise((resolve) => setTimeout(resolve, RESTORE_RETRY_MS[Math.min(attempt, RESTORE_RETRY_MS.length - 1)]));
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [isRestoreCancelled, showSignedOut]);

  // The session couldn't be renewed any more (e.g. revoked elsewhere): back to the log-in page.
  useEffect(() => onSessionExpired(showSignedOut), [showSignedOut]);

  // The friend only appears on the desktop while someone is logged in.
  useEffect(() => {
    if (status !== 'loading') window.desktopFriends?.account.setSignedIn(status === 'signed-in');
  }, [status]);

  const startSession = useCallback((response: AuthResponse, remember: boolean) => {
    setSession(response, remember);
    setProfile(response.profile);
    setStatus('signed-in');
  }, []);

  const signIn = useCallback<AccountContextValue['signIn']>(async ({ username, password, remember }) => {
    if (!username.trim() || !password) return 'Enter your username and password.';
    try {
      const response = await apiRequest<AuthResponse>('/auth/login', {
        method: 'POST',
        auth: false,
        body: { username: normalizeUsername(username), password },
      });
      startSession(response, remember);
      return null;
    } catch (error) {
      return messageOf(error);
    }
  }, [startSession]);

  const signUp = useCallback<AccountContextValue['signUp']>(async ({ displayName, username, password, remember }) => {
    const name = displayName.trim();
    if (!name || name.length > DISPLAY_NAME_MAX) return `Enter a name of 1–${DISPLAY_NAME_MAX} characters.`;
    if (!isValidUsername(username)) return 'Usernames are 3–20 lowercase letters, numbers or underscores.';
    if (!isStrongPassword(password)) return 'The password does not meet all the rules yet.';
    try {
      const response = await apiRequest<AuthResponse>('/auth/signup', {
        method: 'POST',
        auth: false,
        body: { displayName: name, username: normalizeUsername(username), password },
      });
      startSession(response, remember);
      return null;
    } catch (error) {
      return messageOf(error);
    }
  }, [startSession]);

  const signOut = useCallback(async () => {
    // Friends see you go offline and the session ends on the server; then everything kept locally is wiped,
    // even if the server couldn't be reached.
    await stopReportingPresence();
    if (hasSession()) await apiRequest('/auth/logout', { method: 'POST' }).catch(() => undefined);
    clearSession();
    showSignedOut();
  }, [showSignedOut]);

  const cancelRestore = useCallback(() => {
    setIsRestoreCancelled(true);
    setRestoreMessage(null);
    clearSession();
    showSignedOut();
  }, [showSignedOut]);

  const value = useMemo(
    () => ({ status, profile, restoreMessage, signIn, signUp, signOut, cancelRestore }),
    [status, profile, restoreMessage, signIn, signUp, signOut, cancelRestore],
  );
  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}
