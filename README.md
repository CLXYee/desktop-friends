# Desktop Friends

A desktop companion app with friends, online status and groups. The project has three parts:

```
desktop-friends/
├── frontend/          Electron + React/Vite app (PixiJS avatars). Talks only to the API.
├── backend/           Spring Boot REST API (Maven): accounts, friends, status, groups, live events.
├── nginx/             API gateway config: routes /api/ to the backend, streams live events, rate-limits logins.
├── supabase/          Database schema (migrations). Accounts live in Supabase Auth, data in Supabase Postgres.
├── docker-compose.yml       Backend + nginx, for a server.
└── docker-compose.dev.yml   nginx only, in front of a backend started with Maven.
```

```
Desktop app  ──HTTPS──▶  nginx (:8088)  ──▶  Spring Boot (:8080)  ──JDBC──▶  Supabase Postgres
                         /api/*              rules, live events     ──HTTP──▶  Supabase Auth
```

The app holds no database or Supabase keys; only the backend does (in `backend/.env`).

## Requirements

- Node.js 24 LTS and npm (`frontend/.nvmrc`)
- Java 21 or newer (the backend runs with the Maven Wrapper, so Maven itself isn't needed)
- Docker Desktop, for nginx (and for the backend's tests, which start a Postgres)
- Git

## Run locally

1. **Backend settings.** Copy `backend/.env.example` to `backend/.env` and fill in the Supabase URL, publishable key and the **Session pooler** connection (Supabase → Connect). Then start it:

   ```sh
   cd backend
   ./mvnw spring-boot:run          # Windows: mvnw.cmd spring-boot:run
   ```

   It listens on http://localhost:8080 (health: `/api/health`).

2. **nginx** in front of it, from the project root:

   ```sh
   docker compose -f docker-compose.dev.yml up -d
   ```

   The API is now at http://localhost:8088/api.

3. **The app.** Copy `frontend/.env.example` to `frontend/.env` (it points at `http://localhost:8088/api`), then:

   ```sh
   cd frontend
   npm install
   npm run start
   ```

Checks:

```sh
cd backend  && ./mvnw test          # 48 tests: the whole API against a real Postgres with the Supabase schema
cd frontend && npm run typecheck && npm test
cd frontend && npm run users:test && npm run test:e2e   # against the running backend (see below)
```

`npm run users:test` creates three test accounts through the API (`friend_amy`, `friend_ben`, `friend_cleo`, password `Friends#2026`), and `npm run test:e2e` plays friends, status and groups through with them, end to end through nginx and the backend to Supabase. It leaves a small demo behind (all three are friends; Amy's "Study Buddies" has Ben, and Cleo has an invitation).

Package the app with `cd frontend && npm run make`; set `VITE_API_BASE_URL` to the deployed API's address first (it is built into the app, and into its Content-Security-Policy).

## Deploy the backend

On a server with Docker, put `backend/.env` in place and run, from the project root:

```sh
docker compose up -d --build
```

This builds the backend image (Maven Wrapper, Java 21, non-root) and starts it behind nginx on port 8088. Put HTTPS in front of nginx (or terminate TLS in it) for anything public. See [backend/README.md](backend/README.md) for the API and how it is organized.

## Desktop companion

The selected friend lives on the desktop in a small transparent window, separate from the main app window:

- Closing the main window hides it; the app keeps running in the system tray (menu bar on macOS). Use **Quit Desktop Friends** in the tray menu to exit.
- Click the tray icon, double-click the friend, or launch the app again to reopen the main window.
- The friend is sized relative to the screen it stands on: **Small**, **Medium** (default) or **Large** is 25%, 35% or 50% of that screen's height, set in the app or the tray menu (**Size**). Moving it to another monitor, or changing the resolution, resizes it to match.
- Drag the friend to move it; its position is remembered. Right-click it (or the tray icon) to change character or animation, hide it, toggle always-on-top, or move it back to the corner.
- With **Automatic** posture (the default), the friend waves when the app opens or when you touch it, studies after being left alone for a while (5:00 by default), and sleeps instead between bedtime and wake-up (23:00–07:00 by default). Durations are set to the second (`m:ss`) under **Friend behavior** in the app, and each phase switches exactly when its time is up. A countdown bubble above the friend shows the time left in the current phase (turn it off in the app or the tray menu). Pick a specific animation to pin it instead.
- Starry is livelier than the others. After each focus session (20:00 by default) she waves goodbye, hops out through a door that slams behind her, and comes back after a short break (3:00 by default). Clicking her makes her jump in a burst of stars. Her gesture art slots are described in `frontend/art-source/starry/NEW-ANIMATIONS.md`.
- On Windows, the friend hides while a fullscreen game, video, or presentation is in front on its monitor, and comes back afterwards (tray menu: **Hide during fullscreen games and videos**). This uses [koffi](https://koffi.dev/) to query Windows; its install script is intentionally not allowed because the prebuilt binary comes from `@koromix/koffi-win32-x64`.
- Packaged builds can start at login from the tray menu; they start hidden with only the friend and tray icon (the friend appears only if a remembered sign-in exists).

Companion settings are stored in `companion-settings.json` in Electron's `userData` folder.

## Accounts

The main window opens on a **Log in / Sign up** page, greeted by a random friend that changes every minute; the app's content, and the friend on the desktop, appear once someone is signed in. Logging out removes the friend from the desktop again.

- Accounts use **Supabase Auth**, through the backend (`/api/auth/*`). People sign in with a **username** (3–20 lowercase letters, numbers or underscores) and password. Supabase identifies accounts by email, so the backend maps each username to an internal address on the project's own Supabase domain (`<username>@<project>.supabase.co`). No mail is ever sent to it.
- Passwords need at least 8 characters with an uppercase letter, a lowercase letter, a number and a symbol; the sign-up form checks this live and the backend checks it again.
- Every API call carries the session's access token; the backend verifies it with the project's public signing keys. The app refreshes the session before it expires.
- **Remember me** keeps the session in an encrypted file (`auth-session.bin` in the `userData` folder, protected by the operating system via Electron `safeStorage`), so the next launch signs in automatically (it waits and retries if the server can't be reached yet). Without it, the session lasts until the app quits.
- **Log out** (top-right of the main page) marks you offline, ends the session with Supabase and deletes the remembered session.
- User data lives in `public.profiles` (username, display name, role, online status, timestamps), created automatically on sign-up. The role can only be changed in the database. The schema is in `supabase/migrations/`.

## Friends, online status and groups

- **Add a friend** (Friends page) sends a request by username. The other person sees it in the friends dropdown (and as a badge on **Friends** in the sidebar) and can accept or decline; if they had already asked you, asking back makes you friends straight away. Friends can be removed from the same list, and requests you sent can be cancelled.
- The **friends dropdown** (the bar under the page title) lists your friends as **Online**, **Idle** or **Offline**, with a **Show** filter. It updates live through the backend's event stream (`/api/events`, Server-Sent Events), with a 30-second refresh as a safety net.
- Your status is reported by the app: **online** after logging in, **idle** after 5 minutes without keyboard or mouse input (or while the screen is locked), **offline** when you log out or quit. The app re-reports it every minute; if it stops (e.g. it crashed), friends see you as offline after 3 minutes. The sidebar footer shows what your friends see.
- Sending a request does not reveal the other person's status; only friends and fellow group members see it.
- **Groups** (sidebar): create a group (you become its owner), invite friends from the group's card, or share its **invite link** (`desktop-friends://join/<code>`), which anyone can paste into **Join with a link**. Invitations show up under Groups with a badge in the sidebar. Members see each other's status. The owner can reset the link so older links stop working; when the owner leaves, the longest-standing member takes over, and the last member to leave deletes the group. Invite links are pasted into the app; clicking one does not open the app yet.

Supabase project settings this relies on:

- **Authentication → Sign In / Providers → Email → Confirm email: off**, otherwise sign-up waits for an email nobody receives.
- Recommended: **Authentication → Policies (password requirements)**: minimum length 8 and "lowercase, uppercase letters, digits and symbols", so the server enforces the same rule as the form.

## Avatar artwork

Each character in `frontend/public/avatars/` has `character.json` and `animations.json` metadata. Sprite sheets named `waving.png`, `studying.png`, `sleeping.png`, and `gaming.png` can be added alongside them. The metadata describes the 1536 x 1024 sheet and its 4 x 2 grid of 384 x 512 frames. Keep editable originals in the matching `frontend/art-source/` folder.

To turn generated or drawn poses into a sheet that lines up with a character's existing art, run `npm run sprites:pack -- <character> <animation> <image>` in `frontend/`. It removes the background, finds the poses, and scales and aligns them; see `frontend/art-source/starry/NEW-ANIMATIONS.md`.

## Optional local Supabase

The backend's tests don't need it: they start a plain Postgres in Docker and apply `supabase/migrations/` on top of a small stand-in for Supabase's `auth` schema. For a full local Supabase (Auth included), install the Supabase CLI and run `npx supabase init` and `npx supabase start` from the project root; point `backend/.env` at it. See [supabase/README.md](supabase/README.md).
