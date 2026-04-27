import { redirect } from 'next/navigation';
import { createClient } from '@/utils/supabase/server';
import { isAdmin } from '@/utils/admin';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();

  if (!auth.user) {
    redirect('/login?next=/admin');
  }

  if (!(await isAdmin())) {
    redirect('/login?next=/admin&error=not_admin');
  }

  return <>{children}</>;
}
