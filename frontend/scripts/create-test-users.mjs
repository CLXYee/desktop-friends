// Creates the three test accounts (friend_amy, friend_ben, friend_cleo) through the backend's sign-up API,
// the same way the app's sign-up form does. Safe to run again: existing accounts are only checked by logging in.
//
//   npm run users:test        (the backend and nginx must be running; see the README)
//
// The password is TEST_USER_PASSWORD, or Friends#2026 when it isn't set. These are test accounts:
// delete them (Supabase → Authentication → Users) before real people use the project.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const TEST_USERS = [
  { username: 'friend_amy', displayName: 'Amy' },
  { username: 'friend_ben', displayName: 'Ben' },
  { username: 'friend_cleo', displayName: 'Cleo' },
];
export const TEST_PASSWORD = process.env.TEST_USER_PASSWORD || 'Friends#2026';

/** VITE_API_BASE_URL from the environment or frontend/.env. */
export const readApiBaseUrl = () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  let url = process.env.VITE_API_BASE_URL;
  const file = path.join(root, '.env');
  if (!url && fs.existsSync(file)) {
    const line = fs.readFileSync(file, 'utf8').split(/\r?\n/).find((entry) => entry.startsWith('VITE_API_BASE_URL='));
    url = line?.slice('VITE_API_BASE_URL='.length).trim();
  }
  if (!url) throw new Error('Set VITE_API_BASE_URL in frontend/.env first (e.g. http://localhost:8088/api).');
  return url.replace(/\/+$/, '');
};

const post = async (url, body) => {
  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const json = await response.json().catch(() => ({}));
  return { status: response.status, json };
};

const main = async () => {
  const api = readApiBaseUrl();
  for (const user of TEST_USERS) {
    const signUp = await post(`${api}/auth/signup`, { ...user, password: TEST_PASSWORD });
    if (signUp.status !== 201 && signUp.status !== 409) {
      throw new Error(`${user.username}: ${signUp.json.error ?? `sign-up answered ${signUp.status}`}`);
    }
    const logIn = await post(`${api}/auth/login`, { username: user.username, password: TEST_PASSWORD });
    if (logIn.status !== 200) throw new Error(`${user.username}: exists but can't log in (${logIn.json.error ?? logIn.status}).`);
    console.log(`${signUp.status === 201 ? 'created' : 'exists '}  ${user.username} (${user.displayName})`);
  }
  console.log(`\nLog in with any of them using the password ${TEST_PASSWORD === 'Friends#2026' ? 'Friends#2026' : 'from TEST_USER_PASSWORD'}.`);
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
