import { redirect } from 'next/navigation';
import { createClient } from '@/utils/supabase/server';
import { isAdmin } from '@/utils/admin';
import { GUIDE_AUTHORING_PATH, loginPathFor } from '@/utils/auth-paths';

// Defense-in-depth: middleware already blocks non-super_users, but the layout
// re-checks so direct Server Action calls can't bypass the guard.
export default async function GuidesLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();

  if (!auth.user) {
    redirect(loginPathFor(GUIDE_AUTHORING_PATH));
  }

  const adminOk = await isAdmin();
  if (!adminOk) {
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('user_id', auth.user.id)
      .maybeSingle();

    if ((profile as any)?.role !== 'super_user') {
      redirect(loginPathFor(GUIDE_AUTHORING_PATH, 'not_authorized'));
    }
  }

  return <>{children}</>;
}
