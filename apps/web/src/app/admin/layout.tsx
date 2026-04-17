import { redirect } from 'next/navigation';
import { createClient } from '@/utils/supabase/server';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;

  if (!user) {
    redirect('/login');
  }

  const adminEmails = (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  const userEmail = user.email?.toLowerCase() ?? '';
  const isAdmin = adminEmails.length === 0 || adminEmails.includes(userEmail);

  if (!isAdmin) {
    redirect('/dashboard');
  }

  return <>{children}</>;
}
