# Desktop Friends

An Electron desktop app with a React/Vite interface, PixiJS avatar rendering, and Supabase client wiring. Electron runs directly on your computer; Docker is not part of the default setup.

## Requirements

- macOS
- Node.js 24 LTS and npm
- Git

Install Node.js from [nodejs.org](https://nodejs.org/) or use a version manager that reads `.nvmrc`.

## Run locally

```sh
npm install
cp .env.example .env
npm run start
```

Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in `.env` to connect a hosted Supabase project. The initial UI also runs without credentials. Only a publishable/anon client key belongs in this desktop app; never put a service-role key or database password in `.env`.

Useful checks and packaging commands:

```sh
npm run typecheck
npm test
npm run make
```

## Desktop companion

The selected friend lives on the desktop in a small transparent window, separate from the main app window:

- Closing the main window hides it; the app keeps running in the system tray (menu bar on macOS). Use **Quit Desktop Friends** in the tray menu to exit.
- Click the tray icon, double-click the friend, or launch the app again to reopen the main window.
- Drag the friend to move it; its position is remembered. Right-click it (or the tray icon) to change character or animation, hide it, toggle always-on-top, or move it back to the corner.
- With **Automatic** posture (the default), the friend waves when the app opens or when you touch it, studies after being left alone for a while (5:00 by default), and sleeps instead between bedtime and wake-up (23:00–07:00 by default). Durations are set to the second (`m:ss`) under **Friend behavior** in the app, and each phase switches exactly when its time is up. A countdown bubble above the friend shows the time left in the current phase (turn it off in the app or the tray menu). Pick a specific animation to pin it instead.
- Starry is livelier than the others. After each focus session (20:00 by default) she waves goodbye, hops out through a door that slams behind her, and comes back after a short break (3:00 by default). Clicking her makes her jump in a burst of stars. Her gesture art slots are described in `art-source/starry/NEW-ANIMATIONS.md`.
- On Windows, the friend hides while a fullscreen game, video, or presentation is in front on its monitor, and comes back afterwards (tray menu: **Hide during fullscreen games and videos**). This uses [koffi](https://koffi.dev/) to query Windows; its install script is intentionally not allowed because the prebuilt binary comes from `@koromix/koffi-win32-x64`.
- Packaged builds can start at login from the tray menu; they start hidden with only the friend and tray icon.

Companion settings are stored in `companion-settings.json` in Electron's `userData` folder.

## Avatar artwork

Each character in `public/avatars/` has `character.json` and `animations.json` metadata. Sprite sheets named `waving.png`, `studying.png`, `sleeping.png`, and `gaming.png` can be added alongside them. The metadata describes the 1536 x 1024 sheet and its 4 x 2 grid of 384 x 512 frames. Keep editable originals in the matching `art-source/` folder.

To turn generated or drawn poses into a sheet that lines up with a character's existing art, run `npm run sprites:pack -- <character> <animation> <image>`. It removes the background, finds the poses, and scales and aligns them; see `art-source/starry/NEW-ANIMATIONS.md`.

## Optional local Supabase

For isolated backend testing, install a Docker-compatible runtime and the Supabase CLI, then initialize/start the local stack from the project root using the Supabase CLI. Docker is not needed when using hosted Supabase. Do not create a custom Compose stack; the CLI manages its services. Local Supabase is for development and is not automatically reachable by friends over the internet. See [supabase/README.md](supabase/README.md).