'use server';

import { randomUUID } from 'crypto';
import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { assertAdmin, getAdminClient } from '@/utils/admin';
import { createClient } from '@/utils/supabase/server';

const VALID_ROLES = new Set(['owner', 'manager', 'host']);
const ADMIN_GRANTER_EMAIL = 'admin@happitime';

function toStr(value: FormDataEntryValue | null | undefined) {
  return String(value ?? '').trim();
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function getOrigin() {
  const env = process.env.NEXT_PUBLIC_SITE_URL;
  if (env) return env.replace(/\/+$/, '');
  const hdrs = await headers();
  const origin = hdrs.get('origin');
  if (origin) return origin.replace(/\/+$/, '');
  const host = hdrs.get('host');
  if (host) {
    const proto = hdrs.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
    return `${proto}://${host}`.replace(/\/+$/, '');
  }
  return 'http://localhost:3000';
}

export async function adminSendInvite(formData: FormData) {
  await assertAdmin();
  const admin = getAdminClient();
  const authClient = await createClient();
  const { data: auth } = await authClient.auth.getUser();
  const currentEmail = normalizeEmail(auth.user?.email);

  const email = normalizeEmail(toStr(formData.get('email')));
  const firstName = toStr(formData.get('first_name'));
  const lastName = toStr(formData.get('last_name'));
  const orgId = toStr(formData.get('org_id'));
  const role = toStr(formData.get('role'));
  const makeConsoleAdmin = toStr(formData.get('console_admin')) === 'on';
  const venueIds = formData.getAll('venue_ids').map((v) => String(v)).filter(Boolean);

  if (!email || !isValidEmail(email)) redirect('/admin?error=invalid_email');
  if (!orgId && !makeConsoleAdmin) redirect('/admin?error=invite_target_required');
  if (orgId && !VALID_ROLES.has(role)) redirect('/admin?error=invalid_role');
  if (makeConsoleAdmin && currentEmail != ADMIN_GRANTER_EMAIL) redirect('/admin?error=invite_admin_not_allowed');

  const uniqueVenueIds = Array.from(new Set(venueIds));

  if (orgId && uniqueVenueIds.length > 0) {
    const { data: venues } = await admin.from('venues').select('id').eq('org_id', orgId).in('id', uniqueVenueIds);
    const valid = new Set((venues ?? []).map((v: any) => String(v.id)));
    if (uniqueVenueIds.some((id) => !valid.has(id))) redirect('/admin?error=invalid_venues');
  }

  let redirectTo = `${await getOrigin()}/admin`;

  if (orgId) {
    const token = randomUUID();
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 14).toISOString();
    const { error: insertErr } = await admin.from('org_invites').insert({
      org_id: orgId,
      email,
      role,
      venue_ids: uniqueVenueIds,
      token,
      first_name: firstName || null,
      last_name: lastName || null,
      expires_at: expiresAt,
    });
    if (insertErr) redirect('/admin?error=invite_create_failed');
    redirectTo = `${await getOrigin()}/invite?token=${token}`;
  }

  if (makeConsoleAdmin) {
    const { error: adminErr } = await admin.from('admin_users').upsert({ email }, { onConflict: 'email' });
    if (adminErr) redirect('/admin?error=invite_admin_save_failed');
  }

  const { error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo });
  if (inviteErr) redirect('/admin?error=invite_email_failed');

  revalidatePath('/admin');
  if (orgId) revalidatePath(`/orgs/${orgId}/access`);
  redirect('/admin?notice=invite_sent');
}
