import 'server-only';

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

/**
 * Server-side allowlist check that does NOT rely on per-user RLS.
 * Uses Supabase REST with the service-role key.
 */
export async function isAllowlistedEmail(email: string): Promise<boolean> {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.error('Allowlist check misconfigured: missing env');
    return false;
  }

  const url = new URL(`${supabaseUrl}/rest/v1/allowlist`);
  url.searchParams.set('select', 'id');
  url.searchParams.set('email', `eq.${normalized}`);
  url.searchParams.set('limit', '1');

  const res = await fetch(url, {
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      Accept: 'application/json',
    },
    // Avoid caching authz decisions in edge/server.
    cache: 'no-store',
  });

  if (!res.ok) {
    console.error('Allowlist check failed with status', res.status);
    return false;
  }

  const rows = (await res.json()) as Array<{ id: string }>;
  return rows.length > 0;
}
