'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/utils/supabase/server';

export async function changePassword(formData: FormData) {
  const supabase = await createClient();

  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    redirect('/login');
  }

  const newPassword = String(formData.get('new_password') ?? '');
  const confirmPassword = String(formData.get('confirm_password') ?? '');

  if (newPassword.length < 8) {
    redirect('/change-password?error=too_short');
  }

  if (newPassword !== confirmPassword) {
    redirect('/change-password?error=mismatch');
  }

  const { error } = await supabase.auth.updateUser({ password: newPassword });

  if (error) {
    redirect(`/change-password?error=${encodeURIComponent(error.message)}`);
  }

  redirect('/change-password?success=true');
}
