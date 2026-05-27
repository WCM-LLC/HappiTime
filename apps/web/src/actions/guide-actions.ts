'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/utils/supabase/server';
import { getAdminClient } from '@/utils/admin';
import { GUIDE_AUTHORING_PATH, loginPathFor } from '@/utils/auth-paths';
import { normalizeGuideCoverImageUrl } from '@/utils/guide-cover-url';
import { slugify } from '@/utils/slugify';
import { sendGuideSubmissionEmail } from '@/utils/email';

function toStr(v: FormDataEntryValue | null | undefined) {
  return String(v ?? '').trim();
}

function parseTags(raw: string): string[] {
  return raw
    .split(',')
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
}

async function assertSuperUserOrAdmin(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect(loginPathFor(GUIDE_AUTHORING_PATH));

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role, handle, auto_publish_enabled')
    .eq('user_id', auth.user.id)
    .maybeSingle();

  const role = (profile as any)?.role ?? 'user';

  // Admins bypass the role check
  const { isAdminEmail } = await import('@/utils/admin-emails');
  const adminOk = await isAdminEmail(auth.user.email);
  if (!adminOk && role !== 'super_user') {
    redirect(loginPathFor(GUIDE_AUTHORING_PATH, 'not_authorized'));
  }

  return {
    user: auth.user,
    role: role as string,
    handle: (profile as any)?.handle as string | null,
    autoPublish: Boolean((profile as any)?.auto_publish_enabled) && role === 'super_user',
  };
}

// ── saveDraft ─────────────────────────────────────────────────────────────────
// Creates a new draft (no id) or updates an existing draft/pending_review guide.

export async function saveDraft(formData: FormData) {
  const supabase = await createClient();
  const { user } = await assertSuperUserOrAdmin(supabase);

  const id = toStr(formData.get('id'));
  const title = toStr(formData.get('title'));
  const subtitle = toStr(formData.get('subtitle')) || null;
  const body_md = toStr(formData.get('body_md'));
  const city = toStr(formData.get('city')) || null;
  const neighborhood = toStr(formData.get('neighborhood')) || null;
  const cover_image_url = normalizeGuideCoverImageUrl(toStr(formData.get('cover_image_url')));
  const tags = parseTags(toStr(formData.get('tags')));

  if (!title) redirect('/dashboard/guides?error=title_required');

  if (!id) {
    // New guide — generate a unique slug
    const base = slugify(title);
    const db = getAdminClient();
    let slug = base;
    let attempt = 0;
    while (attempt < 10) {
      const { data: existing } = await db
        .from('guides')
        .select('id')
        .eq('slug', slug)
        .maybeSingle();
      if (!existing) break;
      attempt++;
      slug = `${base}-${attempt + 1}`;
    }

    const { data: inserted, error } = await db
      .from('guides')
      .insert({
        title,
        subtitle,
        body_md,
        city,
        neighborhood,
        cover_image_url,
        tags,
        slug,
        author_id: user.id,
        status: 'draft',
      } as any)
      .select('id')
      .single();

    if (error || !inserted) {
      console.error('[guide] insert failed', error);
      redirect('/dashboard/guides?error=save_failed');
    }

    revalidatePath('/dashboard/guides');
    redirect(`/dashboard/guides/${(inserted as any).id}/edit?notice=draft_saved`);
  }

  // Update existing — cast the whole query builder to avoid deep type instantiation.
  const db = supabase as any;
  const { error } = await db
    .from('guides')
    .update({ title, subtitle, body_md, city, neighborhood, cover_image_url, tags })
    .eq('id', id)
    .eq('author_id', user.id)
    .in('status', ['draft', 'pending_review']);

  if (error) {
    console.error('[guide] update failed', error);
    redirect(`/dashboard/guides/${id}/edit?error=save_failed`);
  }

  revalidatePath('/dashboard/guides');
  revalidatePath(`/dashboard/guides/${id}/edit`);
  redirect(`/dashboard/guides/${id}/edit?notice=draft_saved`);
}

// ── submitGuide ───────────────────────────────────────────────────────────────
// Moves a draft to pending_review (or published if auto_publish_enabled).

export async function submitGuide(formData: FormData) {
  const supabase = await createClient();
  const { user, handle, autoPublish } = await assertSuperUserOrAdmin(supabase);

  const id = toStr(formData.get('id'));
  if (!id) redirect('/dashboard/guides?error=missing_guide_id');

  // Confirm ownership and current status
  const { data: guide } = await supabase
    .from('guides')
    .select('id, title, status')
    .eq('id', id)
    .eq('author_id', user.id)
    .maybeSingle();

  if (!guide) redirect('/dashboard/guides?error=guide_not_found');
  if ((guide as any).status === 'published') redirect('/dashboard/guides?error=already_published');

  const db = getAdminClient();
  const newStatus = autoPublish ? 'published' : 'pending_review';
  const patch: Record<string, unknown> = { status: newStatus };
  if (autoPublish) patch.published_at = new Date().toISOString();

  const { error: updateErr } = await db
    .from('guides')
    .update(patch as any)
    .eq('id', id);

  if (updateErr) {
    console.error('[guide] submit update failed', updateErr);
    redirect('/dashboard/guides?error=submit_failed');
  }

  // Write audit row
  await db.from('guide_submissions').insert({
    guide_id: id,
    submitted_by: user.id,
  } as any);

  // Notify admin (only when going to review; auto-published guides skip admin queue)
  if (!autoPublish) {
    await sendGuideSubmissionEmail({
      authorHandle: handle ?? user.email ?? 'unknown',
      guideTitle: (guide as any).title,
      guideId: id,
    });
  }

  revalidatePath('/dashboard/guides');
  redirect(`/dashboard/guides?notice=${autoPublish ? 'guide_published' : 'guide_submitted'}`);
}

// ── deleteDraft ───────────────────────────────────────────────────────────────

export async function deleteDraft(formData: FormData) {
  const supabase = await createClient();
  const { user } = await assertSuperUserOrAdmin(supabase);

  const id = toStr(formData.get('id'));
  if (!id) redirect('/dashboard/guides?error=missing_guide_id');

  const deleteDb = supabase as any;
  const { error } = await deleteDb
    .from('guides')
    .delete()
    .eq('id', id)
    .eq('author_id', user.id)
    .eq('status', 'draft');

  if (error) {
    console.error('[guide] delete failed', error);
    redirect('/dashboard/guides?error=delete_failed');
  }

  revalidatePath('/dashboard/guides');
  redirect('/dashboard/guides?notice=draft_deleted');
}
