# Supabase

The initial app targets a hosted Supabase project. Put its project URL and publishable key in the root `.env` file; never use a service-role key in this desktop client.

For isolated local backend testing later, install Docker Desktop (or another Docker-compatible runtime) and the Supabase CLI, then run `npx supabase init` and `npx supabase start` from the project root. Let the CLI manage its containers; a custom Compose file is not needed. Local Supabase is not internet-accessible by default.