import { redirect } from 'next/navigation';
import { createClient } from '@/utils/supabase/server';
import { isAdmin } from '@/utils/admin';
import { REFERRALS_PATH, loginPathFor } from '@/utils/auth-paths';

// Defense-in-depth: middleware already blocks non-super_users (REFERRALS_PATH is
// part of the Super User console gate), but the layout re-checks so direct
// Server Action / route hits can't bypass the guard. Mirrors guides/layout.tsx.
export default async function ReferralsLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();

  if (!auth.user) {
    redirect(loginPathFor(REFERRALS_PATH));
  }

  const adminOk = await isAdmin();
  if (!adminOk) {
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('user_id', auth.user.id)
      .maybeSingle();

    if ((profile as any)?.role !== 'super_user') {
      redirect(loginPathFor(REFERRALS_PATH, 'not_authorized'));
    }
  }

  return <>{children}</>;
}
