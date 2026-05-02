'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { assertAdmin, getAdminClient } from '@/utils/admin';

function toStr(value: FormDataEntryValue | null | undefined) {
  return String(value ?? '').trim();
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Resolve the deployed origin so password-reset emails point to the right host.
 * Falls back to NEXT_PUBLIC_SITE_URL or the request origin.
 */
async function resolveSiteOrigin(): Promise<string> {
  const explicit = (process.env.NEXT_PUBLIC_SITE_URL ?? '').trim();
  if (explicit) return explicit.replace(/\/+$/, '');
  const h = await headers();
  const proto = h.get('x-forwarded-proto') ?? 'https';
  const host = h.get('x-forwarded-host') ?? h.get('host');
  if (host) return `${proto}://${host}`;
  return 'http://localhost:3000';
}

/**
 * Admin-only: send a password-reset email to a managed user (owner/manager/host).
 * Validates the target is actually a staff member before sending.
 */
export async function adminSendPasswordReset(formData: FormData) {
  await assertAdmin();
  const admin = getAdminClient();

  const userId = toStr(formData.get('user_id'));
  const returnPath = toStr(formData.get('return_path')) || '/admin';

  if (!userId) {
    redirect(`${returnPath}?error=missing_user_id`);
  }

  // Confirm the target user is a managed staff member
  const { data: membership, error: memberErr } = await admin
    .from('org_members')
    .select('user_id, email')
    .eq('user_id', userId)
    .in('role', ['owner', 'manager', 'host'])
    .limit(1)
    .maybeSingle();

  if (memberErr || !membership) {
    redirect(`${returnPath}?error=user_not_staff`);
  }

  // Look up the auth user's email (source of truth)
  const { data: authUser, error: authErr } = await admin.auth.admin.getUserById(userId);
  if (authErr || !authUser?.user?.email) {
    redirect(`${returnPath}?error=user_email_not_found`);
  }

  const email = authUser.user.email!;
  const origin = await resolveSiteOrigin();

  // Generate a recovery link (this also triggers the email if Auth → Emails is enabled)
  const { error: linkErr } = await admin.auth.admin.generateLink({
    type: 'recovery',
    email,
    options: {
      redirectTo: `${origin}/auth/callback?next=/reset-password`,
    },
  });

  if (linkErr) {
    console.error('[admin] password reset failed', linkErr);
    redirect(`${returnPath}?error=password_reset_failed`);
  }

  revalidatePath(returnPath);
  redirect(`${returnPath}?notice=password_reset_sent`);
}

/**
 * Admin-only: update a managed user's name and (optionally) email.
 * Updates both the auth user record and all of their org_members rows.
 */
export async function adminUpdateUserInfo(formData: FormData) {
  await assertAdmin();
  const admin = getAdminClient();

  const userId = toStr(formData.get('user_id'));
  const firstName = toStr(formData.get('first_name'));
  const lastName = toStr(formData.get('last_name'));
  const newEmail = toStr(formData.get('email')).toLowerCase();
  const returnPath = toStr(formData.get('return_path')) || '/admin';

  if (!userId) redirect(`${returnPath}?error=missing_user_id`);

  // Confirm staff membership
  const { data: membership, error: memberErr } = await admin
    .from('org_members')
    .select('user_id')
    .eq('user_id', userId)
    .in('role', ['owner', 'manager', 'host'])
    .limit(1)
    .maybeSingle();

  if (memberErr || !membership) {
    redirect(`${returnPath}?error=user_not_staff`);
  }

  // Update auth user record
  const authUpdate: Record<string, unknown> = {
    user_metadata: {
      first_name: firstName || null,
      last_name: lastName || null,
    },
  };
  if (newEmail) {
    if (!isValidEmail(newEmail)) {
      redirect(`${returnPath}?error=invalid_email`);
    }
    authUpdate.email = newEmail;
    authUpdate.email_confirm = true;
  }

  const { error: authErr } = await admin.auth.admin.updateUserById(userId, authUpdate);
  if (authErr) {
    console.error('[admin] auth user update failed', authErr);
    redirect(`${returnPath}?error=user_update_failed`);
  }

  // Mirror name + email onto org_members rows
  const memberPatch: Record<string, unknown> = {
    first_name: firstName || null,
    last_name: lastName || null,
  };
  if (newEmail) memberPatch.email = newEmail;

  const { error: orgErr } = await admin
    .from('org_members')
    .update(memberPatch)
    .eq('user_id', userId);

  if (orgErr) {
    console.error('[admin] org_members update failed', orgErr);
    redirect(`${returnPath}?error=member_update_failed`);
  }

  revalidatePath(returnPath);
  redirect(`${returnPath}?notice=user_updated`);
}
