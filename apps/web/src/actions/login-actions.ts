'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/utils/supabase/server';

export async function login(formData: FormData) {
  const supabase = await createClient();
  const authDebug = process.env.AUTH_DEBUG === '1' || process.env.NEXT_PUBLIC_AUTH_DEBUG === '1';

  const email = String(formData.get('email') ?? '');
  const password = String(formData.get('password') ?? '');
  const next = String(formData.get('next') ?? '').trim();

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (authDebug) {
    console.log('[auth][login] signInWithPassword result', {
      emailDomain: email.includes('@') ? email.split('@')[1] : null,
      hasError: !!error,
      errorMessage: error?.message,
      next: next || null,
    });
  }

  if (error) {
    const base = next ? `/login?next=${encodeURIComponent(next)}` : '/login';
    const joiner = base.includes('?') ? '&' : '?';
    redirect(`${base}${joiner}error=bad_credentials`);
  }

  revalidatePath('/', 'layout');

  // Honor explicit redirect, then check if this email is an admin
  if (next && next.startsWith('/')) {
    redirect(next);
  }

  const adminEmails = (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  if (adminEmails.includes(email.toLowerCase())) {
    redirect('/admin');
  }

  redirect('/dashboard');
}

export async function signup(formData: FormData) {
  const supabase = await createClient();

  const email = String(formData.get('email') ?? '');
  const password = String(formData.get('password') ?? '');
  const next = String(formData.get('next') ?? '').trim();

  const { error } = await supabase.auth.signUp({ email, password });

  if (error) {
    redirect('/login?error=signup_failed');
  }

  revalidatePath('/', 'layout');

  if (next && next.startsWith('/')) {
    redirect(next);
  }

  redirect('/dashboard');
}
