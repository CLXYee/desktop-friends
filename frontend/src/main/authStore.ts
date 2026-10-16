import { app, safeStorage } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

// "Remember me": the Supabase session is kept on disk only when the user asks for it, encrypted with
// the OS keychain (DPAPI on Windows) so another account or a copied file can't reuse it.

const MAX_BYTES = 64 * 1024;
const storePath = () => path.join(app.getPath('userData'), 'auth-session.bin');

export const canRememberSession = (): boolean => safeStorage.isEncryptionAvailable();

const isStringRecord = (value: unknown): value is Record<string, string> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
  && Object.values(value).every((item) => typeof item === 'string');

export const readRememberedSession = (): Record<string, string> | null => {
  try {
    if (!canRememberSession() || !fs.existsSync(storePath())) return null;
    const parsed: unknown = JSON.parse(safeStorage.decryptString(fs.readFileSync(storePath())));
    return isStringRecord(parsed) ? parsed : null;
  } catch {
    // Unreadable (e.g. created by another Windows user): forget it rather than fail sign-in.
    clearRememberedSession();
    return null;
  }
};

export const writeRememberedSession = (items: unknown): void => {
  if (!canRememberSession() || !isStringRecord(items)) return;
  const json = JSON.stringify(items);
  if (json.length > MAX_BYTES) return;
  fs.mkdirSync(path.dirname(storePath()), { recursive: true });
  fs.writeFileSync(storePath(), safeStorage.encryptString(json));
};

export const clearRememberedSession = (): void => {
  fs.rmSync(storePath(), { force: true });
};
