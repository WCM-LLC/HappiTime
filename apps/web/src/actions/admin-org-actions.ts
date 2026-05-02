'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { assertAdmin, getAdminClient } from '@/utils/admin';

function toStr(value: FormDataEntryValue | null | undefined) {
  return String(value ?? '').trim();
}

const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/['']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

/**
 * Admin-only: update an organization's name and (optionally) slug.
 * The trg_propagate_org_name DB trigger fans the new name out to venues.org_name.
 * Slugs are URL identifiers — only updated when the admin explicitly provides one.
 */
export async function adminUpdateOrganization(orgId: string, formData: FormData) {
  await assertAdmin();
  const admin = getAdminClient();

  const name = toStr(formData.get('name'));
  const slugInput = toStr(formData.get('slug'));
  const regenSlug = toStr(formData.get('regen_slug')) === '1';

  if (!orgId) redirect('/admin?error=missing_org_id');
  if (!name) redirect('/admin?error=org_name_required');

  const patch: Record<string, unknown> = { name };

  let nextSlug: string | null = null;
  if (slugInput) {
    nextSlug = slugInput;
  } else if (regenSlug) {
    nextSlug = slugify(name);
  }

  if (nextSlug) {
    if (!SLUG_PATTERN.test(nextSlug)) {
      redirect('/admin?error=invalid_slug');
    }
    patch.slug = nextSlug;
  }

  const { data, error } = await admin
    .from('organizations')
    .update(patch)
    .eq('id', orgId)
    .select('id');

  if (error) {
    if (error.code === '23505') {
      redirect('/admin?error=slug_taken');
    }
    console.error('[admin] organization update failed', error);
    redirect(`/admin?error=${encodeURIComponent(error.message)}`);
  }

  if (!data || data.length === 0) {
    redirect('/admin?error=org_not_found');
  }

  revalidatePath('/admin');
  revalidatePath(`/orgs/${orgId}`);
  redirect('/admin?notice=org_updated');
}
