'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/utils/supabase/server';
import { hasAdminEmailsConfigured, isAdmin, getAdminClient } from '@/utils/admin';

export async function createVenue(orgId: string, formData: FormData) {
  const name = String(formData.get('name') ?? '').trim();
  if (!name) redirect(`/orgs/${orgId}?error=missing_venue_name`);

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect('/login');
  const { data: membership, error: membershipErr } = await supabase
    .from('org_members')
    .select('role')
    .eq('org_id', orgId)
    .eq('user_id', auth.user.id)
    .maybeSingle();

  const isOwner = !membershipErr && !!membership && String(membership.role) === 'owner';
  let useAdmin = false;
  if (!isOwner) {
    if (!hasAdminEmailsConfigured()) {
      redirect(`/orgs/${orgId}?error=admin_setup_misconfigured`);
    }
    if (!(await isAdmin())) {
      redirect(`/orgs/${orgId}?error=org_manage_forbidden`);
    }
    useAdmin = true;
  }

  // Admin users bypass RLS via service role client
  const dbClient = useAdmin ? getAdminClient() : supabase;

  const payload = {
    org_id: orgId,
    name,
    address: String(formData.get('address') ?? '').trim() || null,
    city: String(formData.get('city') ?? '').trim() || null,
    state: String(formData.get('state') ?? '').trim() || null,
    zip: String(formData.get('zip') ?? '').trim() || null,
    timezone: String(formData.get('timezone') ?? '').trim() || 'America/Chicago',
  };

  const { data: venue, error } = await dbClient
    .from('venues')
    .insert(payload)
    .select('id')
    .single();

  if (error) {
    console.error(error);
    redirect(`/orgs/${orgId}?error=venue_create_failed`);
  }

  revalidatePath(`/orgs/${orgId}`);
  redirect(`/orgs/${orgId}/venues/${venue!.id}`);
}

export async function deleteVenue(orgId: string, formData: FormData) {
  const venueId = String(formData.get('venue_id') ?? '').trim();
  if (!venueId) redirect(`/orgs/${orgId}?error=missing_venue_id`);

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect('/login');
  const { data: membership, error: membershipErr } = await supabase
    .from('org_members')
    .select('role')
    .eq('org_id', orgId)
    .eq('user_id', auth.user.id)
    .maybeSingle();

  const isOwner = !membershipErr && !!membership && String(membership.role) === 'owner';
  let useAdmin = false;
  if (!isOwner) {
    if (!hasAdminEmailsConfigured()) {
      redirect(`/orgs/${orgId}?error=admin_setup_misconfigured`);
    }
    if (!(await isAdmin())) {
      redirect(`/orgs/${orgId}?error=org_manage_forbidden`);
    }
    useAdmin = true;
  }

  const dbClient = useAdmin ? getAdminClient() : supabase;

  const { error } = await dbClient
    .from('venues')
    .delete()
    .eq('id', venueId)
    .eq('org_id', orgId);

  if (error) {
    console.error(error);
    redirect(`/orgs/${orgId}?error=venue_delete_failed`);
  }

  revalidatePath(`/orgs/${orgId}`);
}
