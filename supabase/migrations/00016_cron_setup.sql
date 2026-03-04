-- =============================================================================
-- Migration 00016: Enable pg_cron and pg_net for external HTTP cron jobs
-- =============================================================================
-- These extensions allow Supabase to schedule and fire HTTP requests to our
-- Next.js cron endpoints, replacing Vercel's built-in cron scheduler.
-- =============================================================================

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net  with schema extensions;

-- Grant usage so the postgres role (used by cron jobs) can call pg_net
grant usage on schema net to postgres;
