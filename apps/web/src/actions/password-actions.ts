'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/utils/supabase/server';

export async function requestPasswordReset(formData: FormData) {
  const supabase = await createClient();
  const email = String(formData.get('email') ?? '').trim();

  if (!email) {
    redirect('/forgot-password?error=missing_email');
  }

  const origin =
    process.env.NEXT_PUBLIC_SITE_URL || process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'http://localhost:3000';

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/callback?type=recovery`,
  });

  if (error) {
    redirect(`/forgot-password?error=${encodeURIComponent(error.message)}`);
  }

  // Always show success to avoid leaking which emails exist
  redirect('/forgot-password?sent=true');
}

export async function resetPassword(formData: FormData) {
  const supabase = await createClient();

  const newPassword = String(formData.get('new_password') ?? '');
  const confirmPassword = String(formData.get('confirm_password') ?? '');

  if (newPassword.length < 8) {
    redirect('/reset-password?error=too_short');
  }

  if (newPassword !== confirmPassword) {
    redirect('/reset-password?error=mismatch');
  }

  const { error } = await supabase.auth.updateUser({ password: newPassword });

  if (error) {
    redirect(`/reset-password?error=${encodeURIComponent(error.message)}`);
  }

  redirect('/reset-password?success=true');
}

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
