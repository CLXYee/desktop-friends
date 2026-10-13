import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { accountEmailDomain } from '../../shared/auth';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabasePublishableKey);

/** The domain of the internal account emails (see shared/auth). */
export const accountDomain = (): string => accountEmailDomain(supabaseUrl);

// The Supabase session lives in memory. With "remember me" it is also mirrored to an encrypted file
// kept by the main process, so the next launch signs in automatically; without it, it ends with the app.
const memory = new Map<string, string>();
let rememberSession = false;
let loaded: Promise<void> | null = null;

const bridge = (): Window['desktopFriends']['authStore'] | undefined => window.desktopFriends?.authStore;

const loadRemembered = (): Promise<void> => {
  loaded ??= (async () => {
    const items = await bridge()?.read();
    if (!items) return;
    rememberSession = true;
    for (const [key, value] of Object.entries(items)) memory.set(key, value);
  })();
  return loaded;
};

const persist = () => {
  if (rememberSession) bridge()?.write(Object.fromEntries(memory));
};

const sessionStorageAdapter = {
  getItem: async (key: string) => {
    await loadRemembered();
    return memory.get(key) ?? null;
  },
  setItem: async (key: string, value: string) => {
    await loadRemembered();
    memory.set(key, value);
    persist();
  },
  removeItem: async (key: string) => {
    await loadRemembered();
    memory.delete(key);
    persist();
  },
};

/** Chooses whether the next sign-in is kept for later launches. */
export const setRememberSession = async (remember: boolean): Promise<void> => {
  await loadRemembered();
  rememberSession = remember;
  if (remember) persist();
  else bridge()?.clear();
};

export const canRememberSession = async (): Promise<boolean> => (await bridge()?.canRemember()) ?? false;

/** Forgets everything stored for the session, in memory and on disk. */
export const forgetSession = async (): Promise<void> => {
  await loadRemembered();
  memory.clear();
  rememberSession = false;
  bridge()?.clear();
};

let client: SupabaseClient | null = null;

/** The app's Supabase client, created on first use (only the main window uses accounts). */
export const getSupabase = (): SupabaseClient | null => {
  if (!isSupabaseConfigured) return null;
  client ??= createClient(supabaseUrl, supabasePublishableKey, {
    auth: {
      storage: sessionStorageAdapter,
      storageKey: 'desktop-friends-auth',
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  });
  return client;
};
