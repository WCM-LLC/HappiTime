'use server';

import { revalidatePath } from 'next/cache';
import { assertAdmin, getAdminClient } from '@/utils/admin';

export async function adminPromoteStagingVenue(stagingId: string, orgId: string) {
  await assertAdmin();
  const supabase = getAdminClient();

  const { data: staging, error: fetchErr } = await supabase
    .from('staging_venues')
    .select('id, external_ref, payload, status')
    .eq('id', stagingId)
    .single();

  if (fetchErr || !staging) throw new Error('Staging venue not found');
  if (staging.status !== 'pending') throw new Error('Only pending venues can be promoted');

  const p = staging.payload as Record<string, unknown>;
  const name = String(p.name ?? p.title ?? '').trim();
  const city = String(p.city ?? '').trim();
  const state = String(p.state ?? '').trim();
  const zip = String(p.zip ?? '').trim();

  if (!name) throw new Error('Payload is missing a venue name');
  if (!city || !state || !zip) throw new Error('Payload is missing city, state, or zip — edit the record first');

  const placesId = staging.external_ref ?? null;

  // Dedupe: if a venue with this places_id already exists, just link the staging row
  if (placesId) {
    const { data: dup } = await supabase
      .from('venues')
      .select('id')
      .eq('places_id', placesId)
      .maybeSingle();

    if (dup) {
      await supabase
        .from('staging_venues')
        .update({ status: 'merged', match_venue_id: dup.id, reviewed_at: new Date().toISOString() })
        .eq('id', stagingId);
      revalidatePath(`/admin/staging/${stagingId}`);
      revalidatePath('/admin/staging');
      revalidatePath('/admin');
      return { venueId: dup.id, alreadyExisted: true };
    }
  }

  // Generate unique slug, retrying with city suffix on conflict
  const { data: baseSlug, error: slugErr } = await supabase.rpc('venue_slugify', { input: name });
  if (slugErr || !baseSlug) throw new Error('Failed to generate slug');

  let slug = baseSlug as string;
  for (let attempt = 1; attempt <= 6; attempt++) {
    const { data: conflict } = await supabase
      .from('venues')
      .select('id')
      .eq('slug', slug)
      .maybeSingle();
    if (!conflict) break;
    if (attempt === 6) throw new Error('Could not generate a unique slug for this venue. Try again.');
    const citySuffix = city.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const { data: retrySlug } = await supabase.rpc('venue_slugify', {
      input: attempt === 1 ? `${name} ${citySuffix}` : `${name} ${citySuffix} ${attempt}`,
    });
    slug = (retrySlug as string) ?? `${slug}-${attempt}`;
  }

  const { data: newVenue, error: insertErr } = await supabase
    .from('venues')
    .insert({
      name,
      org_id: orgId,
      city,
      state,
      zip,
      address: (p.address as string | null) ?? null,
      slug,
      status: 'draft',
      places_id: placesId,
      places_status: 'pending',
      instagram_url: (p.instagram_url as string | null) ?? null,
      facebook_url: (p.facebook_url as string | null) ?? null,
      tiktok_url: (p.tiktok_url as string | null) ?? null,
      phone: (p.phone as string | null) ?? (p.phoneNumber as string | null) ?? null,
      website: (p.website as string | null) ?? null,
      rating:
        typeof p.rating === 'number'
          ? p.rating
          : typeof p.totalScore === 'number'
            ? p.totalScore
            : null,
      review_count:
        typeof p.reviewsCount === 'number'
          ? p.reviewsCount
          : typeof p.reviewCount === 'number'
            ? p.reviewCount
            : null,
      tags: Array.isArray(p.tags) ? (p.tags as string[]) : [],
    })
    .select('id')
    .single();

  if (insertErr) {
    if (insertErr.code === '23505') throw new Error('A venue with that slug already exists. Try again.');
    throw new Error(insertErr.message);
  }

  await supabase
    .from('staging_venues')
    .update({ status: 'merged', match_venue_id: newVenue!.id, reviewed_at: new Date().toISOString() })
    .eq('id', stagingId);

  revalidatePath(`/admin/staging/${stagingId}`);
  revalidatePath('/admin/staging');
  revalidatePath('/admin');
  return { venueId: newVenue!.id, alreadyExisted: false };
}

export async function adminRejectStagingVenue(stagingId: string, reason?: string) {
  await assertAdmin();
  const supabase = getAdminClient();

  const { data: updated, error } = await supabase
    .from('staging_venues')
    .update({
      status: 'rejected',
      rejection_reason: reason?.trim() || null,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', stagingId)
    .eq('status', 'pending')
    .select('id');

  if (error) throw new Error(error.message);
  if (!updated || updated.length === 0) throw new Error('No pending staging venue found with that ID');

  revalidatePath(`/admin/staging/${stagingId}`);
  revalidatePath('/admin/staging');
  revalidatePath('/admin');
}

export async function adminUpdateStagingPayload(
  stagingId: string,
  patch: Record<string, string>,
) {
  await assertAdmin();
  const supabase = getAdminClient();

  const { data: staging, error: fetchErr } = await supabase
    .from('staging_venues')
    .select('payload, status')
    .eq('id', stagingId)
    .single();

  if (fetchErr || !staging) throw new Error('Staging venue not found');
  if (staging.status !== 'pending') throw new Error('Only pending venues can be edited');

  const cleanPatch = Object.fromEntries(
    Object.entries(patch).map(([k, v]) => [k, v.trim() === '' ? null : v.trim()]),
  );

  const updatedPayload = { ...(staging.payload as Record<string, unknown>), ...cleanPatch };

  const { error: updateErr } = await supabase
    .from('staging_venues')
    .update({ payload: updatedPayload })
    .eq('id', stagingId);

  if (updateErr) throw new Error(updateErr.message);

  revalidatePath(`/admin/staging/${stagingId}`);
  revalidatePath('/admin/staging');
}
