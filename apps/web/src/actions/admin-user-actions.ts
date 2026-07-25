'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { assertAdmin, getAdminClient } from '@/utils/admin';
import { createClient } from '@/utils/supabase/server';
import { buildPasswordRecoveryRedirectTo, resolveConsoleOrigin } from '@/utils/auth-redirects';

function toStr(value: FormDataEntryValue | null | undefined) {
  return String(value ?? '').trim();
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
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
  const origin = resolveConsoleOrigin(await headers());

  const { error: resetErr } = await admin.auth.resetPasswordForEmail(email, {
    redirectTo: buildPasswordRecoveryRedirectTo(origin),
  });

  if (resetErr) {
    console.error('[admin] password reset failed', resetErr);
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

// ── Dashboard access removal ──────────────────────────────────────────────────
//
// Both actions revoke dashboard access ONLY: they delete venue_members
// assignments and org_members rows, never the auth account or any consumer
// app data. A removed user can be re-invited from the org's Access page.
// Unlike the org-side removeMember, admins CAN remove owners — the admin
// console is the escape hatch for offboarding an owner who left the business
// (an ownerless org is a tolerated state; staged-venue promotion creates them).

/** Guard against an admin revoking their own session's staff access mid-flight. */
async function assertNotSelf(userId: string, returnPath: string) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (auth.user?.id === userId) {
    redirect(`${returnPath}?error=cannot_remove_self`);
  }
}

/**
 * Admin-only: remove a user's membership (and venue assignments) in ONE org.
 */
export async function adminRemoveMembership(formData: FormData) {
  await assertAdmin();
  const admin = getAdminClient();

  const userId = toStr(formData.get('user_id'));
  const orgId = toStr(formData.get('org_id'));
  const returnPath = toStr(formData.get('return_path')) || '/admin';

  if (!userId) redirect(`${returnPath}?error=missing_user_id`);
  if (!orgId) redirect(`${returnPath}?error=missing_org_id`);
  await assertNotSelf(userId, returnPath);

  // Venue assignments first, then the membership (mirrors access-actions removeMember)
  const { error: assignErr } = await admin
    .from('venue_members')
    .delete()
    .eq('org_id', orgId)
    .eq('user_id', userId);
  if (assignErr) {
    console.error('[admin] adminRemoveMembership venue_members delete failed', assignErr);
    redirect(`${returnPath}?error=member_assignments_delete_failed`);
  }

  const { data: deleted, error: deleteErr } = await admin
    .from('org_members')
    .delete()
    .eq('org_id', orgId)
    .eq('user_id', userId)
    .select('user_id');
  if (deleteErr) {
    console.error('[admin] adminRemoveMembership org_members delete failed', deleteErr);
    redirect(`${returnPath}?error=member_delete_failed`);
  }
  if (!deleted || deleted.length === 0) {
    // Zero rows deleted with no error = the membership wasn't there (or a
    // silent RLS/grant gap) — surface it rather than reporting success.
    redirect(`${returnPath}?error=member_not_found`);
  }

  revalidatePath(returnPath);
  redirect(`${returnPath}?notice=member_removed`);
}

/**
 * Admin-only: remove ALL of a user's org memberships and venue assignments.
 */
export async function adminRemoveAllMemberships(formData: FormData) {
  await assertAdmin();
  const admin = getAdminClient();

  const userId = toStr(formData.get('user_id'));
  const returnPath = toStr(formData.get('return_path')) || '/admin';

  if (!userId) redirect(`${returnPath}?error=missing_user_id`);
  await assertNotSelf(userId, returnPath);

  const { error: assignErr } = await admin
    .from('venue_members')
    .delete()
    .eq('user_id', userId);
  if (assignErr) {
    console.error('[admin] adminRemoveAllMemberships venue_members delete failed', assignErr);
    redirect(`${returnPath}?error=member_assignments_delete_failed`);
  }

  const { data: deleted, error: deleteErr } = await admin
    .from('org_members')
    .delete()
    .eq('user_id', userId)
    .select('user_id');
  if (deleteErr) {
    console.error('[admin] adminRemoveAllMemberships org_members delete failed', deleteErr);
    redirect(`${returnPath}?error=member_delete_failed`);
  }
  if (!deleted || deleted.length === 0) {
    redirect(`${returnPath}?error=member_not_found`);
  }

  revalidatePath(returnPath);
  redirect(`${returnPath}?notice=member_access_revoked`);
}

// ── Super User role management ────────────────────────────────────────────────

export async function promoteToSuperUser(formData: FormData) {
  await assertAdmin();
  const db = getAdminClient();
  const userId = toStr(formData.get('user_id'));
  if (!userId) redirect('/admin/users?error=missing_user_id');

  const { error } = await db
    .from('user_profiles')
    .update({ role: 'super_user' } as any)
    .eq('user_id', userId);

  if (error) {
    console.error('[admin] promoteToSuperUser failed', error);
    redirect(`/admin/users?error=${encodeURIComponent(error.message)}`);
  }
  revalidatePath('/admin/users');
  redirect('/admin/users?notice=user_promoted');
}

export async function revokeSuperUser(formData: FormData) {
  await assertAdmin();
  const db = getAdminClient();
  const userId = toStr(formData.get('user_id'));
  if (!userId) redirect('/admin/users?error=missing_user_id');

  const { error } = await db
    .from('user_profiles')
    .update({ role: 'user', auto_publish_enabled: false } as any)
    .eq('user_id', userId);

  if (error) {
    console.error('[admin] revokeSuperUser failed', error);
    redirect(`/admin/users?error=${encodeURIComponent(error.message)}`);
  }
  revalidatePath('/admin/users');
  redirect('/admin/users?notice=user_revoked');
}

export async function toggleAutoPublish(formData: FormData) {
  await assertAdmin();
  const db = getAdminClient();
  const userId = toStr(formData.get('user_id'));
  const enabled = formData.get('enabled') === 'true';
  if (!userId) redirect('/admin/users?error=missing_user_id');

  // Guard: auto_publish is only meaningful for super_users.
  const { data: profile, error: fetchErr } = await db
    .from('user_profiles')
    .select('role')
    .eq('user_id', userId)
    .maybeSingle();

  if (fetchErr || !profile) redirect('/admin/users?error=user_not_found');
  if ((profile as any).role !== 'super_user') redirect('/admin/users?error=not_super_user');

  const { error } = await db
    .from('user_profiles')
    .update({ auto_publish_enabled: enabled } as any)
    .eq('user_id', userId);

  if (error) {
    console.error('[admin] toggleAutoPublish failed', error);
    redirect(`/admin/users?error=${encodeURIComponent(error.message)}`);
  }
  revalidatePath('/admin/users');
  redirect('/admin/users?notice=auto_publish_updated');
}
