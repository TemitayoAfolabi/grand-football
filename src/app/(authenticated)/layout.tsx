import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { BottomNav } from '@/components/nav/bottom-nav';
import { TopNav } from '@/components/nav/top-nav';

export default async function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const { data: isAdmin } = await supabase.rpc('is_admin');

  return (
    <div className="min-h-screen bg-bg-primary">
      <TopNav isAdmin={!!isAdmin} />
      <main className="mx-auto max-w-6xl px-4 pb-24 pt-4 tablet:pb-8 tablet:pt-6">
        {children}
      </main>
      <BottomNav />
    </div>
  );
}
