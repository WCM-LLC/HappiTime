'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/utils/supabase/server';

export async function login(formData: FormData) {
  const supabase = createClient();

  const data = {
    email: String(formData.get('email') ?? ''),
    password: String(formData.get('password') ?? ''),
  };

  const { error } = await (await supabase).auth.signInWithPassword(data);

  if (error) {
    redirect('/login?error=bad_credentials');
  }

  revalidatePath('/', 'layout');
  redirect('/dashboard');
}

export async function signup(formData: FormData) {
  const supabase = createClient();

  const data = {
    email: String(formData.get('email') ?? ''),
    password: String(formData.get('password') ?? ''),
  };

  const { error } = await (await supabase).auth.signUp(data);

  if (error) {
    redirect('/login?error=signup_failed');
  }

  revalidatePath('/', 'layout');
  redirect('/dashboard');
}
