import { redirect } from 'next/navigation';
import { BottomNav } from '@/components/nav/bottom-nav';
import { TopNav } from '@/components/nav/top-nav';
import { getCachedUser, getCachedProfile } from '@/lib/server/cached-queries';

export default async function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  // Use cached queries - these deduplicate calls within the same request
  // Middleware already validates auth, but we need user for UI
  const user = await getCachedUser();

  if (!user) {
    redirect('/login');
  }

  // Reuse the same profile query throughout the page instead of a separate admin RPC.
  const profile = await getCachedProfile(user.id);
  const isAdmin = !!profile?.is_admin;

  return (
    <div className="min-h-screen bg-bg-primary">
      <TopNav isAdmin={isAdmin} />
      <main className="mx-auto max-w-6xl px-4 pb-24 pt-4 tablet:pb-8 tablet:pt-6">{children}</main>
      <BottomNav isAdmin={isAdmin} />
    </div>
  );
}
