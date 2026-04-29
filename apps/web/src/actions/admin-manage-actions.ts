'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/utils/supabase/server';
import { getAdminClient } from '@/utils/admin';
import { SUPER_ADMIN_EMAIL } from '@/utils/admin-emails';

async function assertSuperAdmin() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const email = (auth.user?.email ?? '').toLowerCase();
  if (email !== SUPER_ADMIN_EMAIL) {
    throw new Error('Unauthorized');
  }
}

export async function addAdminUser(formData: FormData) {
  await assertSuperAdmin();
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  if (!email) redirect('/admin?error=missing_email');

  const db = getAdminClient();
  const { error } = await db
    .from('admin_users')
    .insert({ email, created_by: SUPER_ADMIN_EMAIL });

  if (error) redirect(`/admin?error=${encodeURIComponent(error.message)}`);
  revalidatePath('/admin');
}

export async function removeAdminUser(formData: FormData) {
  await assertSuperAdmin();
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  if (!email) redirect('/admin?error=missing_email');
  if (email === SUPER_ADMIN_EMAIL) redirect('/admin?error=cannot_remove_super_admin');

  const db = getAdminClient();
  const { error } = await db
    .from('admin_users')
    .delete()
    .eq('email', email);

  if (error) redirect(`/admin?error=${encodeURIComponent(error.message)}`);
  revalidatePath('/admin');
}
