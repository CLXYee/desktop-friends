// The signed-in session: an access token for API calls and a refresh token to get a new one. It lives in
// memory; with "remember me" it is also kept in an encrypted file by the main process, so the next launch
// signs in automatically.
import { ApiError, apiUrl, readApiError, SESSION_ENDED_MESSAGE, UNREACHABLE_MESSAGE } from './api';

export interface Session {
  accessToken: string;
  refreshToken: string;
  /** Seconds since the epoch. */
  expiresAt: number;
}

/** How the backend returns a session (log in, sign up, refresh). */
export interface AuthResponse extends Session {
  profile: { id: string; username: string; displayName: string; role: 'user' | 'admin'; characterId?: string };
}

// Refresh a little before the access token expires, so requests never race its expiry.
const REFRESH_MARGIN_SECONDS = 60;

let current: Session | null = null;
let rememberSession = false;
let refreshing: Promise<AuthResponse> | null = null;
const expiredListeners = new Set<() => void>();

const bridge = (): Window['desktopFriends']['authStore'] | undefined =>
  (typeof window === 'undefined' ? undefined : window.desktopFriends?.authStore);

const isSession = (value: Record<string, string> | null): value is Record<'accessToken' | 'refreshToken' | 'expiresAt', string> =>
  Boolean(value?.accessToken && value.refreshToken && Number.isFinite(Number(value.expiresAt)));

const persist = () => {
  if (!current || !rememberSession) return;
  bridge()?.write({ accessToken: current.accessToken, refreshToken: current.refreshToken, expiresAt: String(current.expiresAt) });
};

export const canRememberSession = async (): Promise<boolean> => (await bridge()?.canRemember()) ?? false;

/** Loads the session "remember me" kept from last time, if any. */
export const loadRememberedSession = async (): Promise<Session | null> => {
  const stored = (await bridge()?.read()) ?? null;
  if (!isSession(stored)) return null;
  current = { accessToken: stored.accessToken, refreshToken: stored.refreshToken, expiresAt: Number(stored.expiresAt) };
  rememberSession = true;
  return current;
};

/** Keeps a new session; with remember, also for the next launch (otherwise any kept one is deleted). */
export const setSession = (session: Session, remember = rememberSession): void => {
  current = { accessToken: session.accessToken, refreshToken: session.refreshToken, expiresAt: session.expiresAt };
  rememberSession = remember;
  if (remember) persist();
  else bridge()?.clear();
};

/** Forgets the session, in memory and on disk. */
export const clearSession = (): void => {
  current = null;
  rememberSession = false;
  bridge()?.clear();
};

export const hasSession = (): boolean => current !== null;

/** Called when the session can't be renewed any more (e.g. revoked); the app shows the log-in page. */
export const onSessionExpired = (listener: () => void): (() => void) => {
  expiredListeners.add(listener);
  return () => expiredListeners.delete(listener);
};

/**
 * Trades the refresh token for a new session and returns it (with the profile). Concurrent callers share
 * one request. Throws ApiError: status 0 when the server can't be reached (the session is kept for later),
 * 401 when the session is over (it is forgotten and everyone listening is told).
 */
export const renewSession = (): Promise<AuthResponse> => {
  refreshing ??= (async () => {
    const refreshToken = current?.refreshToken;
    if (!refreshToken) throw new ApiError(401, SESSION_ENDED_MESSAGE);
    let response: Response;
    try {
      response = await fetch(apiUrl('/auth/refresh'), {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
    } catch {
      throw new ApiError(0, UNREACHABLE_MESSAGE);
    }
    if (!response.ok) {
      const error = await readApiError(response);
      if (response.status === 401) {
        clearSession();
        expiredListeners.forEach((listener) => listener());
      }
      throw error;
    }
    const session = (await response.json()) as AuthResponse;
    setSession(session);
    return session;
  })().finally(() => {
    refreshing = null;
  });
  return refreshing;
};

/** Like renewSession, but only the new access token, or null when it failed. */
export const refreshSession = async (): Promise<string | null> => {
  try {
    return (await renewSession()).accessToken;
  } catch {
    return null;
  }
};

/** A current access token, refreshed first when it is about to expire (null when signed out). */
export const getAccessToken = async (): Promise<string | null> => {
  if (!current) return null;
  if (current.expiresAt - Date.now() / 1000 > REFRESH_MARGIN_SECONDS) return current.accessToken;
  return (await refreshSession()) ?? current?.accessToken ?? null;
};
