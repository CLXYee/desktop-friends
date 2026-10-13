import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { AuthError, Session, SupabaseClient } from '@supabase/supabase-js';
import { DISPLAY_NAME_MAX, isStrongPassword, isValidUsername, normalizeUsername, usernameToEmail } from '../../../shared/auth';
import { accountDomain, forgetSession, getSupabase, isSupabaseConfigured, setRememberSession } from '../../services/supabaseClient';

export interface Profile {
  id: string;
  username: string;
  displayName: string;
  role: 'user' | 'admin';
}

export type AccountStatus = 'loading' | 'signed-out' | 'signed-in' | 'unconfigured';

interface AccountContextValue {
  status: AccountStatus;
  profile: Profile | null;
  signIn: (input: { username: string; password: string; remember: boolean }) => Promise<string | null>;
  signUp: (input: { displayName: string; username: string; password: string; remember: boolean }) => Promise<string | null>;
  signOut: () => Promise<void>;
}

const AccountContext = createContext<AccountContextValue | null>(null);

export const useAccount = (): AccountContextValue => {
  const value = useContext(AccountContext);
  if (!value) throw new Error('useAccount must be used inside <AccountProvider>.');
  return value;
};

/** Turns Supabase Auth errors into messages for people, not developers. */
const describeAuthError = (error: AuthError): string => {
  switch (error.code) {
    case 'invalid_credentials':
      return 'Wrong username or password.';
    case 'user_already_exists':
    case 'email_exists':
      return 'That username is already taken. Try another one.';
    case 'weak_password':
      return 'That password is too weak. Use at least 8 characters with upper and lower case, a number and a symbol.';
    case 'email_not_confirmed':
      return 'This account still needs confirming. Turn off "Confirm email" in Supabase (Authentication → Sign In / Providers → Email).';
    case 'over_request_rate_limit':
    case 'over_email_send_rate_limit':
      return 'Too many attempts. Please wait a minute and try again.';
    case 'signup_disabled':
      return 'New sign-ups are turned off for this app.';
    default:
      break;
  }
  if (error.name === 'AuthRetryableFetchError' || error.status === 0) {
    return "Can't reach the server. Check your internet connection and try again.";
  }
  if (/database error saving new user/i.test(error.message)) {
    return "That username can't be used. Pick 3–20 lowercase letters, numbers or underscores.";
  }
  return error.message;
};

/** The signed-in user's profile row, falling back to what the session itself knows (e.g. offline). */
const loadProfile = async (supabase: SupabaseClient, session: Session): Promise<Profile> => {
  const { data } = await supabase
    .from('profiles')
    .select('id, username, display_name, role')
    .eq('id', session.user.id)
    .maybeSingle();
  if (data) {
    return { id: data.id, username: data.username, displayName: data.display_name, role: data.role === 'admin' ? 'admin' : 'user' };
  }
  const username = (session.user.email ?? '').split('@')[0];
  const metadataName = session.user.user_metadata?.display_name;
  return {
    id: session.user.id,
    username,
    displayName: typeof metadataName === 'string' && metadataName.trim() ? metadataName : username,
    role: 'user',
  };
};

export function AccountProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AccountStatus>(isSupabaseConfigured ? 'loading' : 'unconfigured');
  const [profile, setProfile] = useState<Profile | null>(null);

  const showSession = useCallback(async (session: Session | null) => {
    const supabase = getSupabase();
    if (!supabase || !session) {
      setProfile(null);
      setStatus(isSupabaseConfigured ? 'signed-out' : 'unconfigured');
      return;
    }
    setProfile(await loadProfile(supabase, session));
    setStatus('signed-in');
  }, []);

  // Restore a remembered session on launch, and notice when Supabase ends one (e.g. revoked elsewhere).
  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) return;
    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (active) void showSession(data.session);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT' && active) {
        setProfile(null);
        setStatus('signed-out');
      }
    });
    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [showSession]);

  // The friend only appears on the desktop while someone is logged in.
  useEffect(() => {
    if (status !== 'loading') window.desktopFriends?.account.setSignedIn(status === 'signed-in');
  }, [status]);

  const signIn = useCallback<AccountContextValue['signIn']>(async ({ username, password, remember }) => {
    const supabase = getSupabase();
    if (!supabase) return 'Accounts are not set up yet: add the Supabase URL and publishable key to .env.';
    if (!username.trim() || !password) return 'Enter your username and password.';
    await setRememberSession(remember);
    const { data, error } = await supabase.auth.signInWithPassword({ email: usernameToEmail(username, accountDomain()), password });
    if (error) return describeAuthError(error);
    await showSession(data.session);
    return null;
  }, [showSession]);

  const signUp = useCallback<AccountContextValue['signUp']>(async ({ displayName, username, password, remember }) => {
    const supabase = getSupabase();
    if (!supabase) return 'Accounts are not set up yet: add the Supabase URL and publishable key to .env.';
    const name = displayName.trim();
    if (!name || name.length > DISPLAY_NAME_MAX) return `Enter a name of 1–${DISPLAY_NAME_MAX} characters.`;
    if (!isValidUsername(username)) return 'Usernames are 3–20 lowercase letters, numbers or underscores.';
    if (!isStrongPassword(password)) return 'The password does not meet all the rules yet.';
    await setRememberSession(remember);
    const { data, error } = await supabase.auth.signUp({
      email: usernameToEmail(username, accountDomain()),
      password,
      options: { data: { display_name: name, username: normalizeUsername(username) } },
    });
    if (error) return describeAuthError(error);
    if (!data.session) {
      return 'Account created, but Supabase wants it confirmed by email first. Turn off "Confirm email" in Supabase (Authentication → Sign In / Providers → Email), then log in.';
    }
    await showSession(data.session);
    return null;
  }, [showSession]);

  const signOut = useCallback(async () => {
    const supabase = getSupabase();
    // End this device's session with Supabase, then wipe anything kept locally even if that failed.
    await supabase?.auth.signOut({ scope: 'local' }).catch(() => undefined);
    await forgetSession();
    setProfile(null);
    setStatus('signed-out');
  }, []);

  const value = useMemo(() => ({ status, profile, signIn, signUp, signOut }), [status, profile, signIn, signUp, signOut]);
  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}
