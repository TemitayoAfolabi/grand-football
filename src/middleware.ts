import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';
import { isAllowlistedEmail } from '@/lib/server/allowlist';

const PUBLIC_PATHS = ['/login', '/auth/callback', '/auth/set-password'];

export async function middleware(request: NextRequest) {
  // Guard: fail fast with a clear message if Supabase env vars are missing
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    console.error(
      '[middleware] Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. ' +
        'Set these environment variables in your Vercel project settings.',
    );
    return new NextResponse('Server configuration error. Please contact the administrator.', {
      status: 503,
    });
  }

  const { pathname } = request.nextUrl;
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

  // These checks are independent, so run them together instead of adding two
  // sequential network round trips to every navigation.
  const [isAllowlisted, { data: profile }] = await Promise.all([
    isAllowlistedEmail(user.email ?? ''),
    supabase.from('profiles').select('force_password_change, is_admin').eq('id', user.id).single(),
  ]);

  if (!isAllowlisted) {
    await supabase.auth.signOut();
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('error', 'not_allowed');
    return NextResponse.redirect(url);
  }

  if (profile?.force_password_change) {
    const url = request.nextUrl.clone();
    url.pathname = '/auth/set-password';
    url.searchParams.set('reason', 'first-login');
    return NextResponse.redirect(url);
  }

  // Admin routes — check is_admin
  if (pathname.startsWith('/admin')) {
    if (!profile?.is_admin) {
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
     * - public files (service worker, manifest, icons, fonts, etc.)
     * - API cron routes (authenticated by CRON_SECRET)
     */
    '/((?!_next|api/cron|.*\\.[a-zA-Z0-9]+$).*)',
  ],
};
