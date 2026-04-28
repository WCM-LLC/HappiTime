'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/utils/supabase/server';
import { isAdminEmail } from '@/utils/admin-emails';

/**
 * Authenticates a user with email and password.
 * Redirects to ?next param if present, /admin for admin emails, or /dashboard.
 * Depends on: Supabase auth, ADMIN_EMAILS env var.
 */
export async function login(formData: FormData) {
  const supabase = await createClient();

  const email = String(formData.get('email') ?? '');
  const password = String(formData.get('password') ?? '');
  const next = String(formData.get('next') ?? '').trim();

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    const params = new URLSearchParams();
    if (next) params.set('next', next);
    params.set('error', 'bad_credentials');
    redirect(`/login?${params.toString()}`);
  }

  revalidatePath('/', 'layout');

  // Honor explicit redirect, then check if this email is an admin
  if (next && next.startsWith('/')) {
    redirect(next);
  }

  if (isAdminEmail(email)) {
    redirect('/admin');
  }

  redirect('/dashboard');
}

/** Registers a new user with email and password, then redirects to /dashboard or ?next. */
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
