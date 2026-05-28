'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { assertAdmin, getAdminClient } from '@/utils/admin';
import { GuideCoverUploadError, resolveGuideCoverImageUrl } from '@/utils/guide-cover-upload';

function toStr(v: FormDataEntryValue | null | undefined) {
  return String(v ?? '').trim();
}

async function currentAdminUserId(): Promise<string | null> {
  const { createClient } = await import('@/utils/supabase/server');
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

function parseTags(raw: string): string[] {
  return raw
    .split(',')
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean);
}

function coverUploadErrorCode(error: unknown) {
  return error instanceof GuideCoverUploadError ? error.code : 'cover_upload_failed';
}

// ── saveAdminGuide ───────────────────────────────────────────────────────────

export async function saveAdminGuide(formData: FormData) {
  await assertAdmin();
  const db = getAdminClient();
  const adminUserId = await currentAdminUserId();
  const id = toStr(formData.get('id'));
  if (!id) redirect('/admin/guides?error=missing_guide_id');
  if (!adminUserId) redirect(`/admin/guides/${id}/edit?error=not_authorized`);

  const title = toStr(formData.get('title'));
  const subtitle = toStr(formData.get('subtitle')) || null;
  const body_md = toStr(formData.get('body_md'));
  const city = toStr(formData.get('city')) || null;
  const neighborhood = toStr(formData.get('neighborhood')) || null;
  const tags = parseTags(toStr(formData.get('tags')));

  if (!title) redirect(`/admin/guides/${id}/edit?error=title_required`);

  let cover_image_url: string | null;
  try {
    cover_image_url = await resolveGuideCoverImageUrl(db, adminUserId, formData);
  } catch (error) {
    console.error('[review] admin guide cover upload failed', error);
    redirect(`/admin/guides/${id}/edit?error=${coverUploadErrorCode(error)}`);
  }

  const { data: guide, error: fetchErr } = await (db as any)
    .from('guides')
    .select('id, slug')
    .eq('id', id)
    .maybeSingle();

  if (fetchErr || !guide) {
    console.error('[review] admin guide edit fetch failed', fetchErr);
    redirect('/admin/guides?error=guide_not_found');
  }

  const { error: updateErr } = await (db as any)
    .from('guides')
    .update({ title, subtitle, body_md, city, neighborhood, cover_image_url, tags })
    .eq('id', id);

  if (updateErr) {
    console.error('[review] admin guide edit failed', updateErr);
    redirect(`/admin/guides/${id}/edit?error=save_failed`);
  }

  revalidatePath('/admin/guides');
  revalidatePath(`/admin/guides/${id}/edit`);
  revalidatePath(`/admin/guides/${id}/preview`);
  revalidatePath('/dashboard/guides');
  revalidatePath(`/guides/${(guide as any).slug}`);
  redirect(`/admin/guides/${id}/edit?notice=guide_saved`);
}

// ── approveGuide ──────────────────────────────────────────────────────────────

export async function approveGuide(formData: FormData) {
  await assertAdmin();
  const db = getAdminClient();
  const id = toStr(formData.get('id'));
  if (!id) redirect('/admin/guides?error=missing_guide_id');

  const reviewerId = await currentAdminUserId();
  const now = new Date().toISOString();

  const { data: guide, error: fetchErr } = await (db as any)
    .from('guides')
    .select('id, status')
    .eq('id', id)
    .maybeSingle();

  if (fetchErr || !guide) {
    console.error('[review] approve fetch failed', fetchErr);
    redirect('/admin/guides?error=approve_failed');
  }

  if (guide.status !== 'pending_review') {
    redirect('/admin/guides?error=invalid_status');
  }

  const { data: updated, error: updateErr } = await (db as any)
    .from('guides')
    .update({ status: 'published', published_at: now })
    .eq('id', id)
    .eq('status', 'pending_review')
    .select('id')
    .maybeSingle();

  if (updateErr || !updated) {
    console.error('[review] approve failed', updateErr);
    redirect(`/admin/guides?error=approve_failed`);
  }

  const { error: auditErr } = await (db as any).from('guide_submissions').insert({
    guide_id: id,
    submitted_by: null,
    reviewed_by: reviewerId,
    reviewed_at: now,
    decision: 'approved',
  });
  if (auditErr) {
    console.error('[review] approve audit failed', auditErr);
    redirect('/admin/guides?error=approve_failed');
  }

  revalidatePath('/admin/guides');
  revalidatePath(`/admin/guides/${id}/preview`);
  revalidatePath('/dashboard/guides');
  redirect('/admin/guides?notice=guide_approved');
}

// ── rejectGuide ───────────────────────────────────────────────────────────────

export async function rejectGuide(formData: FormData) {
  await assertAdmin();
  const db = getAdminClient();
  const id = toStr(formData.get('id'));
  const notes = toStr(formData.get('notes')) || null;
  if (!id) redirect('/admin/guides?error=missing_guide_id');

  const reviewerId = await currentAdminUserId();
  const now = new Date().toISOString();

  const { data: guide, error: fetchErr } = await (db as any)
    .from('guides')
    .select('id, status')
    .eq('id', id)
    .maybeSingle();

  if (fetchErr || !guide) {
    console.error('[review] reject fetch failed', fetchErr);
    redirect('/admin/guides?error=reject_failed');
  }

  if (guide.status !== 'pending_review') {
    redirect('/admin/guides?error=invalid_status');
  }

  const { data: updated, error: updateErr } = await (db as any)
    .from('guides')
    .update({ status: 'draft' })
    .eq('id', id)
    .eq('status', 'pending_review')
    .select('id')
    .maybeSingle();

  if (updateErr || !updated) {
    console.error('[review] reject failed', updateErr);
    redirect('/admin/guides?error=reject_failed');
  }

  const { error: auditErr } = await (db as any).from('guide_submissions').insert({
    guide_id: id,
    submitted_by: null,
    reviewed_by: reviewerId,
    reviewed_at: now,
    decision: 'rejected',
    notes,
  });
  if (auditErr) {
    console.error('[review] reject audit failed', auditErr);
    redirect('/admin/guides?error=reject_failed');
  }

  revalidatePath('/admin/guides');
  revalidatePath(`/admin/guides/${id}/preview`);
  revalidatePath('/dashboard/guides');
  redirect('/admin/guides?notice=guide_rejected');
}

// ── unpublishGuide ────────────────────────────────────────────────────────────

export async function unpublishGuide(formData: FormData) {
  await assertAdmin();
  const db = getAdminClient();
  const id = toStr(formData.get('id'));
  if (!id) redirect('/admin/guides?error=missing_guide_id');

  const reviewerId = await currentAdminUserId();
  const now = new Date().toISOString();

  const { data: guide, error: fetchErr } = await (db as any)
    .from('guides')
    .select('id, status')
    .eq('id', id)
    .maybeSingle();

  if (fetchErr || !guide) {
    console.error('[review] unpublish fetch failed', fetchErr);
    redirect('/admin/guides?tab=published&error=unpublish_failed');
  }

  if (guide.status !== 'published') {
    redirect('/admin/guides?tab=published&error=invalid_status');
  }

  const { data: updated, error: updateErr } = await (db as any)
    .from('guides')
    .update({ status: 'archived' })
    .eq('id', id)
    .eq('status', 'published')
    .select('id')
    .maybeSingle();

  if (updateErr || !updated) {
    console.error('[review] unpublish failed', updateErr);
    redirect('/admin/guides?tab=published&error=unpublish_failed');
  }

  const { error: auditErr } = await (db as any).from('guide_submissions').insert({
    guide_id: id,
    submitted_by: null,
    reviewed_by: reviewerId,
    reviewed_at: now,
    decision: 'unpublished',
  });
  if (auditErr) {
    console.error('[review] unpublish audit failed', auditErr);
    redirect('/admin/guides?tab=published&error=unpublish_failed');
  }

  revalidatePath('/admin/guides');
  revalidatePath(`/admin/guides/${id}/preview`);
  revalidatePath('/dashboard/guides');
  redirect('/admin/guides?tab=published&notice=guide_unpublished');
}
