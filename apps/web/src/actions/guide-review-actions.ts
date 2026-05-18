'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { assertAdmin, getAdminClient } from '@/utils/admin';

function toStr(v: FormDataEntryValue | null | undefined) {
  return String(v ?? '').trim();
}

async function currentAdminUserId(): Promise<string | null> {
  const { createClient } = await import('@/utils/supabase/server');
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

// ── approveGuide ──────────────────────────────────────────────────────────────

export async function approveGuide(formData: FormData) {
  await assertAdmin();
  const db = getAdminClient();
  const id = toStr(formData.get('id'));
  if (!id) redirect('/admin/guides?error=missing_guide_id');

  const reviewerId = await currentAdminUserId();
  const now = new Date().toISOString();

  const { error: updateErr } = await (db as any)
    .from('guides')
    .update({ status: 'published', published_at: now })
    .eq('id', id);

  if (updateErr) {
    console.error('[review] approve failed', updateErr);
    redirect(`/admin/guides?error=approve_failed`);
  }

  await (db as any).from('guide_submissions').insert({
    guide_id: id,
    submitted_by: null,
    reviewed_by: reviewerId,
    reviewed_at: now,
    decision: 'approved',
  });

  revalidatePath('/admin/guides');
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

  const { error: updateErr } = await (db as any)
    .from('guides')
    .update({ status: 'draft' })
    .eq('id', id);

  if (updateErr) {
    console.error('[review] reject failed', updateErr);
    redirect('/admin/guides?error=reject_failed');
  }

  await (db as any).from('guide_submissions').insert({
    guide_id: id,
    submitted_by: null,
    reviewed_by: reviewerId,
    reviewed_at: now,
    decision: 'rejected',
    notes,
  });

  revalidatePath('/admin/guides');
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

  const { error: updateErr } = await (db as any)
    .from('guides')
    .update({ status: 'archived' })
    .eq('id', id);

  if (updateErr) {
    console.error('[review] unpublish failed', updateErr);
    redirect('/admin/guides?tab=published&error=unpublish_failed');
  }

  await (db as any).from('guide_submissions').insert({
    guide_id: id,
    submitted_by: null,
    reviewed_by: reviewerId,
    reviewed_at: now,
    decision: 'unpublished',
  });

  revalidatePath('/admin/guides');
  revalidatePath('/dashboard/guides');
  redirect('/admin/guides?tab=published&notice=guide_unpublished');
}
