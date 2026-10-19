// Calls to the Desktop Friends backend (behind nginx). Every request except logging in carries the session's
// access token; an expired one is refreshed once and the request retried.
import { getAccessToken, refreshSession } from './session';

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? '').trim().replace(/\/+$/, '');

export const isApiConfigured = Boolean(apiBaseUrl);

/** Paths are relative to VITE_API_BASE_URL, which already ends in /api: apiUrl('/friends') → …/api/friends. */
export const apiUrl = (path: string): string => `${apiBaseUrl}${path}`;

/** A request the backend refused (status from the response) or couldn't make (status 0). */
export class ApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

export const UNREACHABLE_MESSAGE = "Can't reach the server. Check your internet connection and try again.";
export const SESSION_ENDED_MESSAGE = 'Your session ended. Log in again.';

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** Send the access token (default). Off for logging in, signing up and refreshing. */
  auth?: boolean;
}

/** The backend answers errors as {status, error}; error is written for people. */
export const readApiError = async (response: Response): Promise<ApiError> => {
  const body: unknown = await response.json().catch(() => null);
  const message = typeof body === 'object' && body !== null && typeof (body as { error?: unknown }).error === 'string'
    ? (body as { error: string }).error
    : response.status === 401 ? SESSION_ENDED_MESSAGE : `The server answered ${response.status}. Please try again.`;
  return new ApiError(response.status, message);
};

const send = async (path: string, { method = 'GET', body }: RequestOptions, token: string | null): Promise<Response> => {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  try {
    return await fetch(apiUrl(path), { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw new ApiError(0, UNREACHABLE_MESSAGE);
  }
};

/** Calls the backend and returns its JSON (undefined for "204 No Content"); throws ApiError on failure. */
export const apiRequest = async <T>(path: string, options: RequestOptions = {}): Promise<T> => {
  if (!isApiConfigured) throw new ApiError(0, 'The app is not connected to a server yet: set VITE_API_BASE_URL in frontend/.env.');
  const useAuth = options.auth ?? true;
  let token = useAuth ? await getAccessToken() : null;
  if (useAuth && !token) throw new ApiError(401, SESSION_ENDED_MESSAGE);

  let response = await send(path, options, token);
  if (response.status === 401 && useAuth) {
    token = await refreshSession();
    if (token) response = await send(path, options, token);
  }
  if (!response.ok) throw await readApiError(response);
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
};
