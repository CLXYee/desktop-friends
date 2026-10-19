// Opens a second copy of the app with its own profile (sign-in, settings), so two people can be logged in
// side by side on one computer, e.g. to test chats between two test accounts.
//
//   npm run start            (first copy; keep it running: it serves the app)
//   npm run start:second     (second copy, in another terminal)
//
// The profile lives in frontend/.profiles/second (git-ignored). Extra arguments are passed to Electron.
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import electron from 'electron';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const profile = path.join(root, '.profiles', 'second');

// Editors built on Electron can leave this set, which would start Electron as plain Node.
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(electron, ['.', `--user-data-dir=${profile}`, ...process.argv.slice(2)], { cwd: root, env, stdio: 'inherit' });
child.on('exit', (code) => process.exit(code ?? 0));
