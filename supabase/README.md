# Supabase

The initial app targets a hosted Supabase project. Put its project URL and publishable key in the root `.env` file; never use a service-role key in this desktop client.

For isolated local backend testing later, install Docker Desktop (or another Docker-compatible runtime) and the Supabase CLI, then run `npx supabase init` and `npx supabase start` from the project root. Let the CLI manage its containers; a custom Compose file is not needed. Local Supabase is not internet-accessible by default.

## Schema

`migrations/` holds the SQL for the hosted project (apply it with the Supabase SQL editor or `psql`):

- `20261013000000_profiles.sql`: the `profiles` table for user data, its row-level security policies, and the trigger that creates a profile when someone signs up through Supabase Auth.

To make someone an admin: `update public.profiles set role = 'admin' where username = '<username>';`
