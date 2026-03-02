import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';
import { isAllowlistedEmail } from '@/lib/server/allowlist';

const PUBLIC_PATHS = ['/login', '/auth/callback', '/auth/set-password'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public paths through
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    const { response } = await updateSession(request);
    return response;
  }

  // Refresh session and get user
  const { supabase, user, response } = await updateSession(request);

  // Not authenticated → redirect to login
  if (!user) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  // Allowlist check — verify user's email is in the allowlist
  const isAllowlisted = await isAllowlistedEmail(user.email ?? '');
  if (!isAllowlisted) {
    await supabase.auth.signOut();
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('error', 'not_allowed');
    return NextResponse.redirect(url);
  }

  // Force password change check — redirect to set-password page
  const { data: profile } = await supabase
    .from('profiles')
    .select('force_password_change')
    .eq('id', user.id)
    .single();

  if (profile?.force_password_change) {
    const url = request.nextUrl.clone();
    url.pathname = '/auth/set-password';
    url.searchParams.set('reason', 'first-login');
    return NextResponse.redirect(url);
  }

  // Admin routes — check is_admin
  if (pathname.startsWith('/admin')) {
    const { data: isAdmin } = await supabase.rpc('is_admin');
    if (!isAdmin) {
      const url = request.nextUrl.clone();
      url.pathname = '/';
      return NextResponse.redirect(url);
    }
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next (all Next.js internals: static chunks, CSS, image, HMR, etc.)
     * - favicon.ico (favicon file)
     * - public assets
     * - API cron routes (authenticated by CRON_SECRET)
     */
    '/((?!_next|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$|api/cron).*)',
  ],
};
