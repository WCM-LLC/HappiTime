'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { randomUUID } from 'crypto';
import { createClient, createServiceClient, getServiceRoleKeyError } from '@/utils/supabase/server';

const INVITE_ROLE_VALUES = new Set(['manager', 'host']);
const INVITE_PASSWORD_MIN_LENGTH = 8;

function toStr(value: FormDataEntryValue | null | undefined) {
  return String(value ?? '').trim();
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function getOrigin() {
  const env = process.env.NEXT_PUBLIC_SITE_URL;
  if (env) return env.replace(/\/+$/, '');
  const hdrs = headers();
  const origin = hdrs.get('origin');
  if (origin) return origin.replace(/\/+$/, '');
  const host = hdrs.get('host');
  if (host) {
    const proto = hdrs.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
    return `${proto}://${host}`.replace(/\/+$/, '');
  }
  return 'http://localhost:3000';
}

async function findAuthUserByEmail(
  admin: ReturnType<typeof createServiceClient>,
  email: string
) {
  const target = normalizeEmail(email);
  let page = 1;
  const perPage = 200;

  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) {
      return { user: null, error };
    }

    const users = data?.users ?? [];
    const match = users.find((user) => normalizeEmail(String(user?.email ?? '')) === target);
    if (match) {
      return { user: match, error: null };
    }

    if (!data?.nextPage) {
      break;
    }

    page = data.nextPage;
  }

  return { user: null, error: null };
}

async function requireOwner(orgId: string) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;
  if (!user) redirect('/login');

  const { data: membership, error } = await supabase
    .from('org_members')
    .select('role')
    .eq('org_id', orgId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (error || !membership || String(membership.role) !== 'owner') {
    redirect(`/orgs/${orgId}?error=not_org_owner`);
  }

  return { supabase, user };
}

export async function createOrgInvite(orgId: string, formData: FormData) {
  const { supabase, user } = await requireOwner(orgId);

  const email = normalizeEmail(toStr(formData.get('email')));
  const role = toStr(formData.get('role'));
  const venueIds = formData
    .getAll('venue_ids')
    .map((id) => String(id))
    .filter(Boolean);

  if (!email || !isValidEmail(email)) {
    redirect(`/orgs/${orgId}/access?error=invalid_email`);
  }

  if (!INVITE_ROLE_VALUES.has(role)) {
    redirect(`/orgs/${orgId}/access?error=invalid_role`);
  }

  const uniqueVenueIds = Array.from(new Set(venueIds));
  if (uniqueVenueIds.length) {
    const { data: venues, error } = await supabase
      .from('venues')
      .select('id')
      .eq('org_id', orgId)
      .in('id', uniqueVenueIds);

    if (error) {
      redirect(`/orgs/${orgId}/access?error=venue_lookup_failed`);
    }

    const validVenueIds = new Set((venues ?? []).map((v: any) => String(v.id)));
    if (uniqueVenueIds.some((id) => !validVenueIds.has(id))) {
      redirect(`/orgs/${orgId}/access?error=invalid_venues`);
    }
  }

  const { data: existingInvite } = await supabase
    .from('org_invites')
    .select('id')
    .eq('org_id', orgId)
    .ilike('email', email)
    .is('accepted_at', null)
    .maybeSingle();

  if (existingInvite) {
    redirect(`/orgs/${orgId}/access?error=invite_exists`);
  }

  const serviceRoleError = getServiceRoleKeyError();
  if (serviceRoleError === 'missing') {
    redirect(`/orgs/${orgId}/access?error=missing_service_role_key`);
  }
  if (serviceRoleError === 'invalid') {
    redirect(`/orgs/${orgId}/access?error=invalid_service_role_key`);
  }

  const admin = createServiceClient();
  const token = randomUUID();
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 14).toISOString();

  const { error: insertError } = await admin.from('org_invites').insert({
    org_id: orgId,
    email,
    role,
    venue_ids: uniqueVenueIds,
    token,
    invited_by: user.id,
    expires_at: expiresAt,
  });

  if (insertError) {
    redirect(`/orgs/${orgId}/access?error=invite_create_failed`);
  }

  const redirectTo = `${getOrigin()}/invite?token=${token}`;
  const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo,
  });

  if (inviteError) {
    let failureError = inviteError;
    if (inviteError.status === 422) {
      const { error: resetError } = await admin.auth.resetPasswordForEmail(email, { redirectTo });
      if (!resetError) {
        revalidatePath(`/orgs/${orgId}/access`);
        return;
      }

      failureError = resetError;
      console.error('Invite email failed after recovery fallback', {
        orgId,
        email,
        redirectTo,
        inviteMessage: inviteError.message,
        inviteStatus: inviteError.status,
        resetMessage: resetError.message,
        resetStatus: resetError.status,
      });
    }

    const detailParts = [failureError.name, failureError.message].filter(Boolean);
    if (failureError.status) {
      detailParts.push(`status ${failureError.status}`);
    }
    const detail =
      process.env.NODE_ENV === 'development' && detailParts.length
        ? `&error_detail=${encodeURIComponent(detailParts.join(': '))}`
        : '';
    console.error('Invite email failed', {
      orgId,
      email,
      redirectTo,
      message: failureError.message,
      status: failureError.status,
      name: failureError.name,
    });
    redirect(`/orgs/${orgId}/access?error=invite_email_failed${detail}`);
  }

  revalidatePath(`/orgs/${orgId}/access`);
}

export async function setInvitePassword(formData: FormData) {
  const token = toStr(formData.get('token'));
  if (!token) redirect('/invite?error=missing_token');
  const safeToken = encodeURIComponent(token);

  const password = String(formData.get('password') ?? '');
  const confirm = String(formData.get('password_confirm') ?? '');
  if (!password || password.length < INVITE_PASSWORD_MIN_LENGTH) {
    redirect(`/invite?token=${safeToken}&error=password_too_short`);
  }
  if (password !== confirm) {
    redirect(`/invite?token=${safeToken}&error=password_mismatch`);
  }

  const serviceRoleError = getServiceRoleKeyError();
  if (serviceRoleError === 'missing') {
    redirect(`/invite?token=${safeToken}&error=missing_service_role_key`);
  }
  if (serviceRoleError === 'invalid') {
    redirect(`/invite?token=${safeToken}&error=invalid_service_role_key`);
  }

  const admin = createServiceClient();
  const { data: invite, error } = await admin
    .from('org_invites')
    .select('id, org_id, email, role, venue_ids, expires_at, accepted_at, invited_by')
    .eq('token', token)
    .maybeSingle();

  if (error || !invite) {
    redirect(`/invite?token=${safeToken}&error=invalid_invite`);
  }
  if (invite.accepted_at) {
    redirect(`/invite?token=${safeToken}&error=invite_already_used`);
  }
  if (invite.expires_at && new Date(invite.expires_at).getTime() < Date.now()) {
    redirect(`/invite?token=${safeToken}&error=invite_expired`);
  }

  const email = normalizeEmail(String(invite.email ?? ''));
  if (!email || !isValidEmail(email)) {
    redirect(`/invite?token=${safeToken}&error=invalid_invite`);
  }

  const { user: existingUser, error: lookupError } = await findAuthUserByEmail(admin, email);
  if (lookupError) {
    console.error('Invite user lookup failed', {
      email,
      message: lookupError.message,
      status: lookupError.status,
      name: lookupError.name,
    });
    redirect(`/invite?token=${safeToken}&error=invite_user_lookup_failed`);
  }

  let userId = existingUser?.id;
  if (!userId) {
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (createError || !created?.user) {
      console.error('Invite user create failed', {
        email,
        message: createError?.message,
        status: createError?.status,
        name: createError?.name,
      });
      redirect(`/invite?token=${safeToken}&error=invite_user_create_failed`);
    }
    userId = created.user.id;
  } else {
    const { error: updateError } = await admin.auth.admin.updateUserById(userId, {
      password,
      email_confirm: true,
    });
    if (updateError) {
      console.error('Invite password update failed', {
        email,
        message: updateError.message,
        status: updateError.status,
        name: updateError.name,
      });
      redirect(`/invite?token=${safeToken}&error=password_set_failed`);
    }
  }

  const { error: memberErr } = await admin
    .from('org_members')
    .upsert(
      {
        org_id: invite.org_id,
        user_id: userId,
        role: invite.role,
        email,
      },
      { onConflict: 'org_id,user_id' }
    );

  if (memberErr) {
    redirect(`/invite?token=${safeToken}&error=invite_accept_failed`);
  }

  const venueIds = Array.isArray(invite.venue_ids) ? invite.venue_ids : [];
  if (venueIds.length) {
    const assignments = venueIds.map((venueId: string) => ({
      org_id: invite.org_id,
      venue_id: venueId,
      user_id: userId,
      assigned_by: invite.invited_by ?? null,
    }));
    await admin.from('venue_members').upsert(assignments, { onConflict: 'venue_id,user_id' });
  }

  await admin
    .from('org_invites')
    .update({ accepted_at: new Date().toISOString(), accepted_by: userId })
    .eq('id', invite.id);

  const supabase = await createClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
  if (signInError) {
    console.error('Invite password sign-in failed', {
      email,
      message: signInError.message,
      status: signInError.status,
      name: signInError.name,
    });
    redirect(`/login?error=invite_password_login_failed&next=${encodeURIComponent(`/invite?token=${token}`)}`);
  }

  revalidatePath(`/orgs/${invite.org_id}`);
  redirect(`/orgs/${invite.org_id}`);
}

export async function cancelOrgInvite(orgId: string, inviteId: string) {
  const { supabase } = await requireOwner(orgId);

  const { error } = await supabase
    .from('org_invites')
    .delete()
    .eq('id', inviteId)
    .eq('org_id', orgId);

  if (error) {
    redirect(`/orgs/${orgId}/access?error=invite_cancel_failed`);
  }

  revalidatePath(`/orgs/${orgId}/access`);
}

export async function updateMemberAccess(orgId: string, userId: string, formData: FormData) {
  const { supabase, user } = await requireOwner(orgId);

  if (user.id === userId) {
    redirect(`/orgs/${orgId}/access?error=cannot_edit_self`);
  }

  const role = toStr(formData.get('role'));
  if (!INVITE_ROLE_VALUES.has(role)) {
    redirect(`/orgs/${orgId}/access?error=invalid_role`);
  }

  const { data: member, error: memberErr } = await supabase
    .from('org_members')
    .select('role')
    .eq('org_id', orgId)
    .eq('user_id', userId)
    .maybeSingle();

  if (memberErr || !member) {
    redirect(`/orgs/${orgId}/access?error=member_not_found`);
  }

  if (String(member.role) === 'owner') {
    redirect(`/orgs/${orgId}/access?error=cannot_edit_owner`);
  }

  const { error: roleErr } = await supabase
    .from('org_members')
    .update({ role })
    .eq('org_id', orgId)
    .eq('user_id', userId);

  if (roleErr) {
    redirect(`/orgs/${orgId}/access?error=member_role_update_failed`);
  }

  const venueIds = formData
    .getAll('venue_ids')
    .map((id) => String(id))
    .filter(Boolean);
  const uniqueVenueIds = Array.from(new Set(venueIds));

  if (uniqueVenueIds.length) {
    const { data: venues, error } = await supabase
      .from('venues')
      .select('id')
      .eq('org_id', orgId)
      .in('id', uniqueVenueIds);

    if (error) {
      redirect(`/orgs/${orgId}/access?error=venue_lookup_failed`);
    }

    const validVenueIds = new Set((venues ?? []).map((v: any) => String(v.id)));
    if (uniqueVenueIds.some((id) => !validVenueIds.has(id))) {
      redirect(`/orgs/${orgId}/access?error=invalid_venues`);
    }
  }

  const { data: existingAssignments, error: assignErr } = await supabase
    .from('venue_members')
    .select('venue_id')
    .eq('org_id', orgId)
    .eq('user_id', userId);

  if (assignErr) {
    redirect(`/orgs/${orgId}/access?error=assignments_lookup_failed`);
  }

  const existingVenueIds = new Set((existingAssignments ?? []).map((row: any) => String(row.venue_id)));
  const desiredVenueIds = new Set(uniqueVenueIds);

  const toAdd = uniqueVenueIds.filter((id) => !existingVenueIds.has(id));
  const toRemove = Array.from(existingVenueIds).filter((id) => !desiredVenueIds.has(id));

  if (toAdd.length) {
    const payload = toAdd.map((venueId) => ({
      org_id: orgId,
      venue_id: venueId,
      user_id: userId,
      assigned_by: user.id,
    }));
    const { error } = await supabase.from('venue_members').insert(payload);
    if (error) {
      redirect(`/orgs/${orgId}/access?error=assignments_add_failed`);
    }
  }

  if (toRemove.length) {
    const { error } = await supabase
      .from('venue_members')
      .delete()
      .eq('org_id', orgId)
      .eq('user_id', userId)
      .in('venue_id', toRemove);
    if (error) {
      redirect(`/orgs/${orgId}/access?error=assignments_remove_failed`);
    }
  }

  revalidatePath(`/orgs/${orgId}/access`);
}

export async function removeMember(orgId: string, userId: string) {
  const { supabase, user } = await requireOwner(orgId);

  if (user.id === userId) {
    redirect(`/orgs/${orgId}/access?error=cannot_remove_self`);
  }

  const { data: member, error: memberErr } = await supabase
    .from('org_members')
    .select('role')
    .eq('org_id', orgId)
    .eq('user_id', userId)
    .maybeSingle();

  if (memberErr || !member) {
    redirect(`/orgs/${orgId}/access?error=member_not_found`);
  }

  if (String(member.role) === 'owner') {
    redirect(`/orgs/${orgId}/access?error=cannot_remove_owner`);
  }

  const { error: assignErr } = await supabase
    .from('venue_members')
    .delete()
    .eq('org_id', orgId)
    .eq('user_id', userId);

  if (assignErr) {
    redirect(`/orgs/${orgId}/access?error=member_assignments_delete_failed`);
  }

  const { error: deleteErr } = await supabase
    .from('org_members')
    .delete()
    .eq('org_id', orgId)
    .eq('user_id', userId);

  if (deleteErr) {
    redirect(`/orgs/${orgId}/access?error=member_delete_failed`);
  }

  revalidatePath(`/orgs/${orgId}/access`);
  revalidatePath(`/orgs/${orgId}`);
}

export async function acceptOrgInvite(formData: FormData) {
  const token = toStr(formData.get('token'));
  if (!token) redirect('/invite?error=missing_token');

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;
  if (!user) {
    redirect(`/login?next=${encodeURIComponent(`/invite?token=${token}`)}`);
  }

  const serviceRoleError = getServiceRoleKeyError();
  if (serviceRoleError === 'missing') {
    redirect('/invite?error=missing_service_role_key');
  }
  if (serviceRoleError === 'invalid') {
    redirect('/invite?error=invalid_service_role_key');
  }

  const admin = createServiceClient();
  const { data: invite, error } = await admin
    .from('org_invites')
    .select('id, org_id, email, role, venue_ids, expires_at, accepted_at, invited_by')
    .eq('token', token)
    .maybeSingle();

  if (error || !invite) {
    redirect('/invite?error=invalid_invite');
  }

  if (invite.accepted_at) {
    redirect('/invite?error=invite_already_used');
  }

  if (invite.expires_at && new Date(invite.expires_at).getTime() < Date.now()) {
    redirect('/invite?error=invite_expired');
  }

  const email = normalizeEmail(user.email ?? '');
  if (!email || email !== normalizeEmail(String(invite.email))) {
    redirect('/invite?error=invite_email_mismatch');
  }

  const { error: memberErr } = await admin
    .from('org_members')
    .upsert(
      {
        org_id: invite.org_id,
        user_id: user.id,
        role: invite.role,
        email,
      },
      { onConflict: 'org_id,user_id' }
    );

  if (memberErr) {
    redirect('/invite?error=invite_accept_failed');
  }

  const venueIds = Array.isArray(invite.venue_ids) ? invite.venue_ids : [];
  if (venueIds.length) {
    const assignments = venueIds.map((venueId: string) => ({
      org_id: invite.org_id,
      venue_id: venueId,
      user_id: user.id,
      assigned_by: invite.invited_by ?? null,
    }));
    await admin.from('venue_members').upsert(assignments, { onConflict: 'venue_id,user_id' });
  }

  await admin
    .from('org_invites')
    .update({ accepted_at: new Date().toISOString(), accepted_by: user.id })
    .eq('id', invite.id);

  revalidatePath(`/orgs/${invite.org_id}`);
  redirect(`/orgs/${invite.org_id}`);
}
