import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';

/**
 * Service-role Supabase client for cron jobs and admin operations.
 * Bypasses Row Level Security — use with extreme caution.
 */
export function createAdminClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}
