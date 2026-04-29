'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { assertAdmin, getAdminClient } from '@/utils/admin';

function toStr(value: FormDataEntryValue | null | undefined) {
  return String(value ?? '').trim();
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

const VALID_ROLES = new Set(['owner', 'manager', 'host']);

/**
 * Admin-only: directly add a staff member to an org and optionally assign venues.
 * Creates the auth user if they don't exist, sets their password, and adds them
 * to org_members + venue_members.
 */
export async function adminAddStaffMember(orgId: string, formData: FormData) {
  await assertAdmin();
  const admin = getAdminClient();

  const firstName = toStr(formData.get('first_name'));
  const lastName = toStr(formData.get('last_name'));
  const email = normalizeEmail(toStr(formData.get('email')));
  const password = toStr(formData.get('password'));
  const role = toStr(formData.get('role'));
  const venueIds = formData
    .getAll('venue_ids')
    .map((id) => String(id))
    .filter(Boolean);

  const returnPath = toStr(formData.get('return_path')) || `/orgs/${orgId}/access`;

  if (!firstName && !lastName) {
    redirect(`${returnPath}?error=staff_name_required`);
  }
  if (!email || !isValidEmail(email)) {
    redirect(`${returnPath}?error=staff_invalid_email`);
  }
  if (!password || password.length < 8) {
    redirect(`${returnPath}?error=staff_password_too_short`);
  }
  if (!VALID_ROLES.has(role)) {
    redirect(`${returnPath}?error=staff_invalid_role`);
  }

  // Find or create auth user
  let userId: string;

  // Try to find existing user by email
  let page = 1;
  let found = false;
  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) break;
    const users = data?.users ?? [];
    const match = users.find(
      (u) => normalizeEmail(String(u?.email ?? '')) === email
    );
    if (match) {
      userId = match.id;
      // Update their metadata and password
      await admin.auth.admin.updateUserById(userId!, {
        password,
        email_confirm: true,
        user_metadata: {
          first_name: firstName || null,
          last_name: lastName || null,
        },
      });
      found = true;
      break;
    }
    if (!data?.nextPage) break;
    page = data.nextPage;
  }

  if (!found) {
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        first_name: firstName || null,
        last_name: lastName || null,
      },
    });
    if (createError || !created?.user) {
      console.error('Admin staff create user failed', createError);
      redirect(`${returnPath}?error=staff_user_create_failed`);
    }
    userId = created.user.id;
  }

  // Add to org_members
  const { error: memberErr } = await admin
    .from('org_members')
    .upsert(
      {
        org_id: orgId,
        user_id: userId!,
        role,
        email,
        first_name: firstName || null,
        last_name: lastName || null,
      },
      { onConflict: 'org_id,user_id' }
    );

  if (memberErr) {
    console.error('Admin staff add member failed', memberErr);
    redirect(`${returnPath}?error=staff_member_add_failed`);
  }

  // Assign to venues
  const uniqueVenueIds = Array.from(new Set(venueIds));
  if (uniqueVenueIds.length) {
    const assignments = uniqueVenueIds.map((venueId) => ({
      org_id: orgId,
      venue_id: venueId,
      user_id: userId!,
    }));
    const { error: assignErr } = await admin
      .from('venue_members')
      .upsert(assignments, { onConflict: 'venue_id,user_id' });

    if (assignErr) {
      console.error('Admin staff venue assignment failed', assignErr);
      redirect(`${returnPath}?error=staff_venue_assign_failed`);
    }
  }

  revalidatePath(`/orgs/${orgId}`);
  revalidatePath(`/orgs/${orgId}/access`);
  revalidatePath('/admin');
}

/**
 * Admin-only: remove a staff member from an org.
 */
export async function adminRemoveStaffMember(orgId: string, formData: FormData) {
  await assertAdmin();
  const admin = getAdminClient();

  const userId = toStr(formData.get('user_id'));
  const returnPath = toStr(formData.get('return_path')) || `/orgs/${orgId}/access`;
  if (!userId) redirect(`${returnPath}?error=staff_missing_user`);

  // Remove venue assignments first
  await admin
    .from('venue_members')
    .delete()
    .eq('org_id', orgId)
    .eq('user_id', userId);

  // Remove org membership
  const { error } = await admin
    .from('org_members')
    .delete()
    .eq('org_id', orgId)
    .eq('user_id', userId);

  if (error) {
    console.error('Admin staff remove failed', error);
    redirect(`${returnPath}?error=staff_remove_failed`);
  }

  revalidatePath(`/orgs/${orgId}`);
  revalidatePath(`/orgs/${orgId}/access`);
  revalidatePath('/admin');
}
