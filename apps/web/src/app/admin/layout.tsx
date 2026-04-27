import { redirect } from 'next/navigation';
import { createClient } from '@/utils/supabase/server';
import { isAdminEmail } from '@/utils/admin-emails';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;

  if (!user) {
    redirect('/login?next=/admin');
  }

  const isAdmin = isAdminEmail(user.email);

  if (!isAdmin) {
    redirect('/login?next=/admin&error=not_admin');
  }

  return <>{children}</>;
}
