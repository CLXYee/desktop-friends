# Supabase

Desktop Friends stores its data in a hosted Supabase project: accounts in **Supabase Auth**, everything else
in its **Postgres**. Only the backend (`../backend`) connects to it, with the settings in `backend/.env`; the
desktop app never talks to Supabase directly and holds no Supabase keys.

## Schema

`migrations/` is the schema, the single source of truth for the tables (the backend never changes them).
Apply each file to the hosted project with the SQL Editor (see below). The backend's tests apply the same
files to a throwaway Postgres.

- `20261013000000_profiles.sql`: the `profiles` table for user data, its row-level security policies, and the trigger that creates a profile when someone signs up through Supabase Auth.
- `20261015000000_friends_presence_groups.sql`: online status on `profiles` (`status`, `last_seen_at`), the `friendships`, `groups`, `group_members` and `group_invitations` tables with their indexes and row-level security, and Realtime for those tables. Safe to run again.

That second migration also defines database functions (`send_friend_request`, `create_group`, `leave_group`,
…) and Realtime publication from when the app talked to Supabase directly. The backend now implements those
rules itself (`backend/src/main/java/com/desktopfriends/backend/service`) and no longer calls them; they are
kept so older app builds keep working, and can be dropped once none are in use.

To apply a migration: open the project's **SQL Editor → New query**, paste the whole file (with nothing highlighted, or only the highlighted part runs), click **Run**, and confirm if it warns about destructive operations (the `drop policy if exists` lines). It runs as one transaction, so an error leaves nothing half-applied. Check with `select exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'friendships');`.

## Connecting the backend

Use the **Session pooler** connection (Supabase → **Connect** → Session pooler): it works over IPv4, while
the direct `db.<ref>.supabase.co` host is IPv6-only. In `backend/.env`:

```
SUPABASE_DB_URL=jdbc:postgresql://aws-0-<region>.pooler.supabase.com:5432/postgres?sslmode=require
SUPABASE_DB_USER=postgres.<ref>
SUPABASE_DB_PASSWORD=<database password>
```

## Project settings this relies on

- **Authentication → Sign In / Providers → Email → Confirm email: off**, otherwise sign-up waits for an email nobody receives.
- Recommended: **Authentication → Policies (password requirements)**: minimum length 8 and "lowercase, uppercase letters, digits and symbols", matching the rule the app and backend check.

## Test accounts

`cd frontend && npm run users:test` signs up `friend_amy`, `friend_ben` and `friend_cleo` (password `Friends#2026`, or `TEST_USER_PASSWORD`) through the backend. Delete them (Authentication → Users) before real people use the project.

To make someone an admin: `update public.profiles set role = 'admin' where username = '<username>';`
