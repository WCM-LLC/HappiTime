'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { isAdminEmail } from '@/utils/admin-emails';
import { GUIDE_AUTHORING_PATH, GUIDE_EDITOR_PATH, isGuideAuthoringPath, loginPathFor, safeNextPath } from '@/utils/auth-paths';
import { resolveConsoleOrigin } from '@/utils/auth-redirects';
import { createClient, createServiceClient, getServiceRoleKeyError } from '@/utils/supabase/server';

async function canAccessGuideAuthoring({
  authDebug,
  email,
  requestClient,
  userId,
}: {
  authDebug: boolean;
  email: string | null | undefined;
  requestClient: Awaited<ReturnType<typeof createClient>>;
  userId: string;
}) {
  if (await isAdminEmail(email)) return true;

  let profileDb: any = requestClient;
  if (!getServiceRoleKeyError()) {
    try {
      profileDb = createServiceClient();
    } catch (error) {
      if (authDebug) {
        console.warn('[auth][login] service-role profile check unavailable', {
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  const { data: profile, error } = await profileDb
    .from('user_profiles')
    .select('role')
    .eq('user_id', userId)
    .maybeSingle();

  if (authDebug && error) {
    console.warn('[auth][login] guide authoring profile check failed', {
      userId,
      message: error.message,
    });
  }

  return (profile as any)?.role === 'super_user';
}

export async function login(formData: FormData) {
  const supabase = await createClient();
  const authDebug = process.env.AUTH_DEBUG === '1' || process.env.NEXT_PUBLIC_AUTH_DEBUG === '1';

  const email = String(formData.get('email') ?? '');
  const password = String(formData.get('password') ?? '');
  const next = safeNextPath(String(formData.get('next') ?? '').trim());

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (authDebug) {
    console.log('[auth][login] signInWithPassword result', {
      emailDomain: email.includes('@') ? email.split('@')[1] : null,
      hasError: !!error,
      errorMessage: error?.message,
      next: next || null,
    });
  }

  if (error) {
    redirect(loginPathFor(next, 'bad_credentials'));
  }

  revalidatePath('/', 'layout');

  if (isGuideAuthoringPath(next)) {
    const user = data.user ?? (await supabase.auth.getUser()).data.user;
    const authorized = user
      ? await canAccessGuideAuthoring({
          authDebug,
          email: user.email,
          requestClient: supabase,
          userId: user.id,
        })
      : false;

    if (!authorized) {
      if (authDebug) {
        console.log('[auth][login] guide authoring access denied', {
          userId: user?.id ?? null,
          next,
        });
      }
      redirect(loginPathFor(next ?? GUIDE_AUTHORING_PATH, 'not_authorized'));
    }
  }

  // Honor explicit redirect, then check if this email is an admin
  if (next) {
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
  const next = safeNextPath(String(formData.get('next') ?? '').trim());

  const { error } = await supabase.auth.signUp({ email, password });

  if (error) {
    redirect(loginPathFor(next, 'signup_failed'));
  }

  revalidatePath('/', 'layout');

  if (isGuideAuthoringPath(next)) {
    redirect(loginPathFor(next ?? GUIDE_AUTHORING_PATH, 'not_authorized'));
  }

  if (next) {
    redirect(next);
  }

  redirect('/dashboard');
}

export async function sendSuperUserMagicLink(formData: FormData) {
  const supabase = await createClient();
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const next = safeNextPath(String(formData.get('next') ?? '').trim()) ?? GUIDE_EDITOR_PATH;

  if (!email || !isGuideAuthoringPath(next)) {
    redirect(loginPathFor(GUIDE_EDITOR_PATH, 'magic_link_failed'));
  }

  const origin = resolveConsoleOrigin(await headers());
  const callbackUrl = new URL('/auth/callback', origin);
  callbackUrl.searchParams.set('next', next);

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: callbackUrl.toString(),
      shouldCreateUser: false,
    },
  });

  if (error) {
    console.error('[auth][super-user] magic link failed', {
      message: error.message,
      status: error.status,
    });
    redirect(loginPathFor(next, 'magic_link_failed'));
  }

  redirect(`${loginPathFor(next)}&notice=magic_link_sent`);
}
