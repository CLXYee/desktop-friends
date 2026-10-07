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

## Avatar artwork

Each character in `public/avatars/` has `character.json` and `animations.json` metadata. Sprite sheets named `waving.png`, `studying.png`, `sleeping.png`, and `gaming.png` can be added alongside them. The metadata describes the 1536 x 1024 sheet and its 4 x 2 grid of 384 x 512 frames. Keep editable originals in the matching `art-source/` folder.

## Optional local Supabase

For isolated backend testing, install a Docker-compatible runtime and the Supabase CLI, then initialize/start the local stack from the project root using the Supabase CLI. Docker is not needed when using hosted Supabase. Do not create a custom Compose stack; the CLI manages its services. Local Supabase is for development and is not automatically reachable by friends over the internet. See [supabase/README.md](supabase/README.md).