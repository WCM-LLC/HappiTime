'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/utils/supabase/server';
import { toStr, toNullableStr, toNumberOrNull, redirectWithError, requireField } from '@/utils/form';

/** Asserts session is authenticated; redirects to /login otherwise. */
async function requireAuth() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect('/login');
  return { supabase, userId: auth.user.id };
}

/** Invalidates the Next.js cache for the venue management page. */
function revalidateVenue(orgId: string, venueId: string) {
  revalidatePath(`/orgs/${orgId}/venues/${venueId}`);
}

/**
 * Builds a weekly RRULE string from 'event_dow' checkboxes in FormData.
 * Returns null if no days are selected or is_recurring is false.
 * Only FREQ=WEEKLY is supported; other frequencies are tracked in BACKLOG.md.
 */
function buildWeeklyRRule(formData: FormData, isRecurring: boolean): string | null {
  if (!isRecurring) return null;
  const DOW_LABELS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
  const dowValues = formData.getAll('event_dow').map((v) => Number(v));
  if (dowValues.length === 0) return null;
  const rruleDays = dowValues.map((d) => DOW_LABELS[d]).filter(Boolean);
  return `FREQ=WEEKLY;BYDAY=${rruleDays.join(',')}`;
}

/** Creates a new venue event in 'draft' status. */
export async function createEvent(orgId: string, venueId: string, formData: FormData) {
  const { supabase, userId } = await requireAuth();

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
  const recurrence_rule = buildWeeklyRRule(formData, is_recurring);

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
}

/** Updates fields on an existing venue event. */
export async function updateEvent(orgId: string, venueId: string, formData: FormData) {
  const { supabase } = await requireAuth();

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
  const recurrence_rule = buildWeeklyRRule(formData, is_recurring);

  if (!title) redirectWithError(orgId, venueId, 'missing_event_title');
  if (!starts_at) redirectWithError(orgId, venueId, 'missing_event_date');

  const { error } = await supabase
    .from('venue_events')
    .update({
      title, description, event_type, starts_at, ends_at,
      is_recurring, recurrence_rule, timezone,
      price_info, external_url, ticket_url, capacity, location_override,
    })
    .eq('id', event_id)
    .eq('venue_id', venueId);

  if (error) {
    console.error(error);
    redirectWithError(orgId, venueId, 'event_update_failed');
  }

  revalidateVenue(orgId, venueId);
}

/** Deletes a venue event. */
export async function deleteEvent(orgId: string, venueId: string, formData: FormData) {
  const { supabase } = await requireAuth();
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
}

/** Sets a venue event's status to 'published'. */
export async function publishEvent(orgId: string, venueId: string, formData: FormData) {
  const { supabase } = await requireAuth();
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
}

/** Sets a venue event's status back to 'draft'. */
export async function unpublishEvent(orgId: string, venueId: string, formData: FormData) {
  const { supabase } = await requireAuth();
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
}

/**
 * Replaces all venue tags with the submitted selection and syncs cuisine_type.
 * Also writes slugs to the legacy venues.tags text[] column for backward compatibility.
 * See BACKLOG.md: "Remove legacy venues.tags text[] sync".
 */
export async function updateVenueTags(orgId: string, venueId: string, formData: FormData) {
  const { supabase } = await requireAuth();

  const tagIds = formData.getAll('tag_ids').map((v) => toStr(v)).filter(Boolean);
  const uniqueTagIds = Array.from(new Set(tagIds));
  const cuisineType = toNullableStr(formData.get('cuisine_type'));

  const { error: deleteErr } = await supabase.from('venue_tags').delete().eq('venue_id', venueId);
  if (deleteErr) {
    console.error(deleteErr);
    redirectWithError(orgId, venueId, 'tags_update_failed');
  }

  if (uniqueTagIds.length > 0) {
    const payload = uniqueTagIds.map((tag_id) => ({ venue_id: venueId, tag_id }));
    const { error: insertErr } = await supabase.from('venue_tags').insert(payload);
    if (insertErr) {
      console.error(insertErr);
      redirectWithError(orgId, venueId, 'tags_update_failed');
    }
  }

  const { error: venueErr } = await supabase
    .from('venues')
    .update({ cuisine_type: cuisineType })
    .eq('id', venueId)
    .eq('org_id', orgId);

  if (venueErr) {
    console.error(venueErr);
    redirectWithError(orgId, venueId, 'cuisine_update_failed');
  }

  // Sync slug array to legacy venues.tags column until it is removed.
  const { data: tagRows } = uniqueTagIds.length > 0
    ? await supabase.from('approved_tags').select('slug').in('id', uniqueTagIds)
    : { data: [] };

  const slugs = (tagRows ?? []).map((t: any) => t.slug);
  await supabase.from('venues').update({ tags: slugs }).eq('id', venueId).eq('org_id', orgId);

  revalidateVenue(orgId, venueId);
}
