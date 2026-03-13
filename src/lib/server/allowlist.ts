import 'server-only';

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

// In-memory cache for allowlist checks (TTL: 5 minutes)
// This reduces DB calls significantly for repeat requests
const allowlistCache = new Map<string, { result: boolean; expires: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Server-side allowlist check that does NOT rely on per-user RLS.
 * Uses Supabase REST with the service-role key.
 * Results are cached for 5 minutes to reduce middleware latency.
 */
export async function isAllowlistedEmail(email: string): Promise<boolean> {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;

  // Check cache first
  const cached = allowlistCache.get(normalized);
  if (cached && Date.now() < cached.expires) {
    return cached.result;
  }

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
    // Use Next.js fetch cache with revalidation
    next: { revalidate: 300 }, // 5 minutes
  });

  if (!res.ok) {
    console.error('Allowlist check failed with status', res.status);
    return false;
  }

  const rows = (await res.json()) as Array<{ id: string }>;
  const result = rows.length > 0;

  // Cache the result
  allowlistCache.set(normalized, {
    result,
    expires: Date.now() + CACHE_TTL_MS,
  });

  // Cleanup old entries periodically (keep cache size bounded)
  if (allowlistCache.size > 1000) {
    const now = Date.now();
    for (const [key, value] of allowlistCache) {
      if (now >= value.expires) {
        allowlistCache.delete(key);
      }
    }
  }

  return result;
}
