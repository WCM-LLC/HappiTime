'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient, createServiceClient } from '@/utils/supabase/server';
import { isAdminEmail } from '@/utils/admin-emails';

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;
const VENUE_MANAGER_ROLES = new Set(['owner', 'manager', 'admin', 'editor']);

function toStr(v: FormDataEntryValue | null | undefined) {
  return String(v ?? '').trim();
}

function toNullableStr(v: FormDataEntryValue | null | undefined) {
  const s = toStr(v);
  return s.length ? s : null;
}

function toNumberOrNull(v: FormDataEntryValue | null | undefined) {
  const s = toStr(v);
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function redirectWithError(orgId: string, venueId: string, error: string): never {
  redirect(`/orgs/${orgId}/venues/${venueId}?error=${error}`);
}

function redirectWithSuccess(orgId: string, venueId: string, success: string): never {
  redirect(`/orgs/${orgId}/venues/${venueId}?success=${success}`);
}

function requireField(formData: FormData, key: string, orgId: string, venueId: string, error: string) {
  const value = toStr(formData.get(key));
  if (!value) redirectWithError(orgId, venueId, error);
  return value;
}

async function requireAuth() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect('/login');
  return { supabase, user: auth.user, userId: auth.user.id };
}

async function requireVenueManagementAccess(orgId: string, venueId: string) {
  const { supabase, user, userId } = await requireAuth();
  const isPlatformAdmin = await isAdminEmail(user.email);
  let serviceSupabase: SupabaseServerClient | null = null;

  try {
    serviceSupabase = createServiceClient() as SupabaseServerClient;
  } catch {
    // Fall back to the request-scoped client. RLS will still enforce access if configured.
  }

  const lookupSupabase = serviceSupabase ?? supabase;

  const { data: venue } = await lookupSupabase
    .from('venues')
    .select('id')
    .eq('id', venueId)
    .eq('org_id', orgId)
    .maybeSingle();

  if (!venue) redirectWithError(orgId, venueId, 'not_authorized');

  if (isPlatformAdmin) {
    return { supabase: serviceSupabase ?? supabase, userId };
  }

  const { data: membership } = await lookupSupabase
    .from('org_members')
    .select('role')
    .eq('org_id', orgId)
    .eq('user_id', user.id)
    .maybeSingle();

  const role = String(membership?.role ?? '');
  if (!VENUE_MANAGER_ROLES.has(role)) {
    redirectWithError(orgId, venueId, 'not_authorized');
  }

  if (role !== 'owner') {
    const { data: assignment } = await lookupSupabase
      .from('venue_members')
      .select('venue_id')
      .eq('org_id', orgId)
      .eq('venue_id', venueId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (!assignment) redirectWithError(orgId, venueId, 'not_authorized');
  }

  return { supabase, userId };
}

function revalidateVenue(orgId: string, venueId: string) {
  revalidatePath(`/orgs/${orgId}/venues/${venueId}`);
}

/* ──────────────────────────────────────────
   VENUE EVENTS
   ────────────────────────────────────────── */

export async function createEvent(orgId: string, venueId: string, formData: FormData) {
  const { supabase, userId } = await requireVenueManagementAccess(orgId, venueId);

  const title = requireField(formData, 'event_title', orgId, venueId, 'missing_event_title');
  const description = toNullableStr(formData.get('event_description'));
  const event_type = toStr(formData.get('event_type')) || 'event';
  const starts_at = requireField(formData, 'starts_at', orgId, venueId, 'missing_event_date');
  const ends_at = toNullableStr(formData.get('ends_at'));
  const price_info = toNullableStr(formData.get('price_info'));
  const external_url = toNullableStr(formData.get('external_url'));
  const ticket_url = toNullableStr(formData.get('ticket_url'));
  const capacity = toNumberOrNull(formData.get('capacity'));
  const location_override = toNullableStr(formData.get('location_override'));

  const is_recurring = formData.get('is_recurring') === 'on';
  const timezone = toStr(formData.get('timezone')) || 'America/Chicago';

  // Build recurrence rule from DOW checkboxes
  let recurrence_rule: string | null = null;
  if (is_recurring) {
    const dowValues = formData.getAll('event_dow').map((v) => Number(v));
    if (dowValues.length > 0) {
      const rruleDays = dowValues
        .map((d) => ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'][d])
        .filter(Boolean);
      recurrence_rule = `FREQ=WEEKLY;BYDAY=${rruleDays.join(',')}`;
    }
  }

  const { error } = await supabase.from('venue_events').insert({
    venue_id: venueId,
    title,
    description,
    event_type,
    starts_at,
    ends_at,
    is_recurring,
    recurrence_rule,
    timezone,
    price_info,
    external_url,
    ticket_url,
    capacity,
    location_override,
    status: 'draft',
    created_by: userId,
  });

  if (error) {
    console.error(error);
    redirectWithError(orgId, venueId, 'event_create_failed');
  }

  revalidateVenue(orgId, venueId);
  redirectWithSuccess(orgId, venueId, 'event_created');
}

export async function updateEvent(orgId: string, venueId: string, formData: FormData) {
  const { supabase } = await requireVenueManagementAccess(orgId, venueId);

  const event_id = requireField(formData, 'event_id', orgId, venueId, 'missing_event_id');
  const title = toStr(formData.get('event_title'));
  const description = toNullableStr(formData.get('event_description'));
  const event_type = toStr(formData.get('event_type')) || 'event';
  const starts_at = toStr(formData.get('starts_at'));
  const ends_at = toNullableStr(formData.get('ends_at'));
  const price_info = toNullableStr(formData.get('price_info'));
  const external_url = toNullableStr(formData.get('external_url'));
  const ticket_url = toNullableStr(formData.get('ticket_url'));
  const capacity = toNumberOrNull(formData.get('capacity'));
  const location_override = toNullableStr(formData.get('location_override'));

  const is_recurring = formData.get('is_recurring') === 'on';
  const timezone = toStr(formData.get('timezone')) || 'America/Chicago';

  // Build recurrence rule from DOW checkboxes
  let recurrence_rule: string | null = null;
  if (is_recurring) {
    const dowValues = formData.getAll('event_dow').map((v) => Number(v));
    if (dowValues.length > 0) {
      const rruleDays = dowValues
        .map((d) => ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'][d])
        .filter(Boolean);
      recurrence_rule = `FREQ=WEEKLY;BYDAY=${rruleDays.join(',')}`;
    }
  }

  if (!title) redirectWithError(orgId, venueId, 'missing_event_title');
  if (!starts_at) redirectWithError(orgId, venueId, 'missing_event_date');

  const { error } = await supabase
    .from('venue_events')
    .update({
      title,
      description,
      event_type,
      starts_at,
      ends_at,
      is_recurring,
      recurrence_rule,
      timezone,
      price_info,
      external_url,
      ticket_url,
      capacity,
      location_override,
    })
    .eq('id', event_id)
    .eq('venue_id', venueId);

  if (error) {
    console.error(error);
    redirectWithError(orgId, venueId, 'event_update_failed');
  }

  revalidateVenue(orgId, venueId);
  redirectWithSuccess(orgId, venueId, 'event_saved');
}

export async function deleteEvent(orgId: string, venueId: string, formData: FormData) {
  const { supabase } = await requireVenueManagementAccess(orgId, venueId);

  const event_id = requireField(formData, 'event_id', orgId, venueId, 'missing_event_id');

  const { error } = await supabase
    .from('venue_events')
    .delete()
    .eq('id', event_id)
    .eq('venue_id', venueId);

  if (error) {
    console.error(error);
    redirectWithError(orgId, venueId, 'event_delete_failed');
  }

  revalidateVenue(orgId, venueId);
  redirectWithSuccess(orgId, venueId, 'event_deleted');
}

export async function publishEvent(orgId: string, venueId: string, formData: FormData) {
  const { supabase } = await requireVenueManagementAccess(orgId, venueId);
  const event_id = requireField(formData, 'event_id', orgId, venueId, 'missing_event_id');

  const { error } = await supabase
    .from('venue_events')
    .update({ status: 'published' })
    .eq('id', event_id)
    .eq('venue_id', venueId);

  if (error) {
    console.error(error);
    redirectWithError(orgId, venueId, 'event_publish_failed');
  }

  revalidateVenue(orgId, venueId);
  redirectWithSuccess(orgId, venueId, 'event_published');
}

export async function unpublishEvent(orgId: string, venueId: string, formData: FormData) {
  const { supabase } = await requireVenueManagementAccess(orgId, venueId);
  const event_id = requireField(formData, 'event_id', orgId, venueId, 'missing_event_id');

  const { error } = await supabase
    .from('venue_events')
    .update({ status: 'draft' })
    .eq('id', event_id)
    .eq('venue_id', venueId);

  if (error) {
    console.error(error);
    redirectWithError(orgId, venueId, 'event_unpublish_failed');
  }

  revalidateVenue(orgId, venueId);
  redirectWithSuccess(orgId, venueId, 'event_unpublished');
}

/* ──────────────────────────────────────────
   VENUE TAGS (from approved pool)
   ─────────────────���──────────────────────── */

export async function updateVenueTags(orgId: string, venueId: string, formData: FormData) {
  const { supabase } = await requireVenueManagementAccess(orgId, venueId);

  const tagIds = formData
    .getAll('tag_ids')
    .map((v) => toStr(v))
    .filter(Boolean);

  const uniqueTagIds = Array.from(new Set(tagIds));

  // Also update cuisine_type if provided
  const cuisineType = toNullableStr(formData.get('cuisine_type'));

  // Delete existing tags for this venue, then insert new selection
  const { error: deleteErr } = await supabase
    .from('venue_tags')
    .delete()
    .eq('venue_id', venueId);

  if (deleteErr) {
    console.error(deleteErr);
    redirectWithError(orgId, venueId, 'tags_update_failed');
  }

  if (uniqueTagIds.length > 0) {
    const payload = uniqueTagIds.map((tag_id) => ({
      venue_id: venueId,
      tag_id,
    }));

    const { error: insertErr } = await supabase.from('venue_tags').insert(payload);

    if (insertErr) {
      console.error(insertErr);
      redirectWithError(orgId, venueId, 'tags_update_failed');
    }
  }

  // Update cuisine_type on the venue
  const { error: venueErr } = await supabase
    .from('venues')
    .update({ cuisine_type: cuisineType })
    .eq('id', venueId)
    .eq('org_id', orgId);

  if (venueErr) {
    console.error(venueErr);
    redirectWithError(orgId, venueId, 'cuisine_update_failed');
  }

  // Also sync the text[] tags column for backward compatibility
  if (uniqueTagIds.length > 0) {
    const { data: tagRows } = await supabase
      .from('approved_tags')
      .select('slug')
      .in('id', uniqueTagIds);

    const slugs = (tagRows ?? []).map((t: any) => t.slug);

    await supabase
      .from('venues')
      .update({ tags: slugs })
      .eq('id', venueId)
      .eq('org_id', orgId);
  } else {
    await supabase
      .from('venues')
      .update({ tags: [] })
      .eq('id', venueId)
      .eq('org_id', orgId);
  }

  revalidateVenue(orgId, venueId);
  redirectWithSuccess(orgId, venueId, 'tags_saved');
}
