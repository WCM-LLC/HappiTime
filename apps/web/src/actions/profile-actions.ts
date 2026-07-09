'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/utils/supabase/server';
import { normalizeSocialUrl } from '@/lib/socialUrl.mjs';

const PROFILE_PATH = '/dashboard/profile';
const FIELDS = ['instagram_url', 'tiktok_url', 'website_url', 'youtube_url'] as const;

export async function saveProfileSocials(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect('/super-user/login');

  const patch: Record<string, string | null> = {};
  for (const field of FIELDS) {
    const result = normalizeSocialUrl(formData.get(field) as string | null);
    if (!result.ok) {
      redirect(`${PROFILE_PATH}?error=${encodeURIComponent(`${field}: ${result.error}`)}`);
    }
    patch[field] = result.value;
  }

  const { error } = await supabase
    .from('user_profiles')
    .update(patch)
    .eq('user_id', auth.user.id);

  if (error) redirect(`${PROFILE_PATH}?error=${encodeURIComponent(error.message)}`);

  revalidatePath(PROFILE_PATH);
  redirect(`${PROFILE_PATH}?ok=1`);
}

export async function dismissSocialsPrompt(): Promise<void> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return;

  await supabase
    .from('user_profiles')
    .update({ socials_prompt_dismissed_at: new Date().toISOString() })
    .eq('user_id', auth.user.id);

  revalidatePath('/dashboard');
}
