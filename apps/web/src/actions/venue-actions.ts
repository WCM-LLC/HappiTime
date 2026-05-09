'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient, createServiceClient } from '@/utils/supabase/server';
import { isAdminEmail } from '@/utils/admin-emails';
import { toStr, toNullableStr, toNumberOrNull, redirectWithError, requireField } from '@/utils/form';

const HH_STATUS_DRAFT = 'draft';
const HH_STATUS_PUBLISHED = 'published';
type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;
const VENUE_MANAGER_ROLES = new Set(['owner', 'manager', 'admin', 'editor']);

/** Parses the 'dow' field from FormData. Supports both multi-checkbox and single-select inputs. */
function parseDowArray(formData: FormData): number[] {
  const all = formData.getAll('dow');
  const raw = all.length
    ? all
    : ([formData.get('dow')].filter(Boolean) as FormDataEntryValue[]);

  const days = raw
    .map((x) => Number(String(x)))
    .filter((n) => Number.isFinite(n))
    .map((n) => Math.trunc(n))
    .filter((n) => n >= 0 && n <= 6);

  return Array.from(new Set(days)).sort((a, b) => a - b);
}

/** Asserts session is authenticated; redirects to /login otherwise. */
async function requireAuth() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect('/login');
  return { supabase, user: auth.user, userId: auth.user.id };
}

/**
 * Asserts the current user is a member of the org and that the venue belongs to it.
 * Redirects with 'not_authorized' if either check fails.
 */
async function requireVenueAccess(orgId: string, venueId: string) {
  const { supabase, userId } = await requireAuth();

  const { data: membership } = await supabase
    .from('org_members')
    .select('role')
    .eq('org_id', orgId)
    .eq('user_id', userId)
    .maybeSingle();

  if (!membership) redirectWithError(orgId, venueId, 'not_authorized');

  const { data: venue } = await supabase
    .from('venues')
    .select('id')
    .eq('id', venueId)
    .eq('org_id', orgId)
    .maybeSingle();

  if (!venue) redirectWithError(orgId, venueId, 'not_authorized');

  return { supabase, userId };
}

async function requireVenueManagementAccess(orgId: string, venueId: string) {
  const { supabase, user } = await requireAuth();
  const isPlatformAdmin = await isAdminEmail(user.email);
  let writeSupabase: SupabaseServerClient = supabase;

  try {
    writeSupabase = createServiceClient() as SupabaseServerClient;
  } catch {
    // Fall back to the request-scoped client. RLS will still enforce access.
  }

  const { data: membership } = await writeSupabase
    .from('org_members')
    .select('role')
    .eq('org_id', orgId)
    .eq('user_id', user.id)
    .maybeSingle();

  const role = String(membership?.role ?? '');
  if (!isPlatformAdmin && !VENUE_MANAGER_ROLES.has(role)) {
    redirectWithError(orgId, venueId, 'not_authorized');
  }

  if (!isPlatformAdmin && role !== 'owner') {
    const { data: assignment } = await writeSupabase
      .from('venue_members')
      .select('venue_id')
      .eq('org_id', orgId)
      .eq('venue_id', venueId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (!assignment) redirectWithError(orgId, venueId, 'not_authorized');
  }

  const { data: venue } = await writeSupabase
    .from('venues')
    .select('id')
    .eq('id', venueId)
    .eq('org_id', orgId)
    .maybeSingle();

  if (!venue) redirectWithError(orgId, venueId, 'not_authorized');

  return { supabase, writeSupabase };
}

/** Invalidates the Next.js cache for the venue management page. */
function revalidateVenue(orgId: string, venueId: string) {
  revalidatePath(`/orgs/${orgId}/venues/${venueId}`);
  revalidatePath(`/app-preview/orgs/${orgId}/venues/${venueId}`);
}

function assertMutationRows(
  operation: string,
  rows: { id: string }[] | null | undefined,
  error: unknown,
  orgId: string,
  venueId: string,
  failureCode: string,
) {
  if (error) {
    console.error(`[${operation}] write failed`, error);
    redirectWithError(orgId, venueId, failureCode);
  }

  if (!rows || rows.length === 0) {
    console.warn(`[${operation}] zero rows affected`, { orgId, venueId });
    redirectWithError(orgId, venueId, 'not_authorized');
  }
}

async function setVenueStatus(
  supabase: SupabaseServerClient,
  orgId: string,
  venueId: string,
  status: typeof HH_STATUS_DRAFT | typeof HH_STATUS_PUBLISHED,
  failureCode: string,
) {
  const { data: updated, error } = await supabase
    .from('venues')
    .update({ status })
    .eq('id', venueId)
    .eq('org_id', orgId)
    .select('id');

  assertMutationRows('setVenueStatus', updated, error, orgId, venueId, failureCode);
}

async function ensureVenuePublished(
  supabase: SupabaseServerClient,
  orgId: string,
  venueId: string,
) {
  await setVenueStatus(supabase, orgId, venueId, HH_STATUS_PUBLISHED, 'venue_publish_failed');
}

async function publishMenusByIds(
  supabase: SupabaseServerClient,
  orgId: string,
  venueId: string,
  menuIds: string[],
  failureCode: string,
) {
  const uniqueMenuIds = Array.from(new Set(menuIds)).filter(Boolean);
  if (!uniqueMenuIds.length) return;

  const { data: updated, error } = await supabase
    .from('menus')
    .update({ status: HH_STATUS_PUBLISHED, is_active: true })
    .eq('venue_id', venueId)
    .in('id', uniqueMenuIds)
    .select('id');

  assertMutationRows('publishMenusByIds', updated, error, orgId, venueId, failureCode);

  const updatedCount = updated?.length ?? 0;
  if (updatedCount !== uniqueMenuIds.length) {
    console.warn('[publishMenusByIds] fewer rows updated than requested', {
      orgId,
      venueId,
      expected: uniqueMenuIds.length,
      actual: updatedCount,
    });
    redirectWithError(orgId, venueId, failureCode);
  }
}

async function publishMenusForWindow(
  supabase: SupabaseServerClient,
  orgId: string,
  venueId: string,
  windowId: string,
  failureCode: string,
) {
  const { data: links, error } = await supabase
    .from('happy_hour_window_menus')
    .select('menu_id')
    .eq('happy_hour_window_id', windowId);

  if (error) {
    console.error('[publishMenusForWindow] link lookup failed', error);
    redirectWithError(orgId, venueId, failureCode);
  }

  await publishMenusByIds(
    supabase,
    orgId,
    venueId,
    (links ?? []).map((link: any) => link.menu_id).filter(Boolean),
    failureCode,
  );
}

/**
 * Returns the next sort_order value for a given table and parent filter.
 * Uses max(sort_order) + 1; new rows get appended to the end.
 */
async function nextSortOrder(
  supabase: ReturnType<typeof createClient> extends Promise<infer T> ? T : never,
  table: 'menu_sections' | 'menu_items',
  filterField: 'menu_id' | 'section_id',
  filterValue: string,
) {
  const { data: maxRow } = await supabase
    .from(table)
    .select('sort_order')
    .eq(filterField, filterValue)
    .order('sort_order', { ascending: false })
    .limit(1);

  return (maxRow?.[0]?.sort_order ?? 0) + 1;
}

/** Updates core venue fields (name, address, timezone, app_name_preference). */
export async function updateVenue(orgId: string, venueId: string, formData: FormData) {
  // Authed session only. RLS handles authorization, including the admin override
  // (policy `venues_admin_all` permits platform admins via public.is_platform_admin()).
  const { supabase } = await requireAuth();

  const patch: {
    name: string;
    address: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
    timezone: string;
    app_name_preference?: 'org' | 'venue';
  } = {
    name: toStr(formData.get('name')),
    address: toNullableStr(formData.get('address')),
    city: toNullableStr(formData.get('city')),
    state: toNullableStr(formData.get('state')),
    zip: toNullableStr(formData.get('zip')),
    timezone: toNullableStr(formData.get('timezone')) ?? 'America/Chicago',
  };

  const appNamePreferenceRaw = formData.get('app_name_preference');
  if (appNamePreferenceRaw !== null) {
    const appNamePreference = toStr(appNamePreferenceRaw);
    patch.app_name_preference = appNamePreference === 'venue' ? 'venue' : 'org';
  }

  if (!patch.name) redirectWithError(orgId, venueId, 'missing_venue_name');

  // Update and verify rows actually changed. Without this verification, RLS-filtered
  // writes return success with 0 rows affected — the form silently reverts.
  const { data: updated, error } = await supabase
    .from('venues')
    .update(patch)
    .eq('id', venueId)
    .eq('org_id', orgId)
    .select('id');

  if (error) {
    console.error('[updateVenue] update failed', error);
    redirectWithError(orgId, venueId, 'venue_update_failed');
  }

  if (!updated || updated.length === 0) {
    // RLS filtered the row, or the venue/org pair doesn't match.
    console.warn('[updateVenue] zero rows updated', { orgId, venueId });
    redirectWithError(orgId, venueId, 'not_authorized');
  }

  revalidateVenue(orgId, venueId);
}

export async function publishVenue(orgId: string, venueId: string, _formData?: FormData) {
  const { supabase } = await requireVenueAccess(orgId, venueId);
  await setVenueStatus(supabase, orgId, venueId, HH_STATUS_PUBLISHED, 'venue_publish_failed');
  revalidateVenue(orgId, venueId);
}

export async function unpublishVenue(orgId: string, venueId: string, _formData?: FormData) {
  const { supabase } = await requireVenueAccess(orgId, venueId);
  await setVenueStatus(supabase, orgId, venueId, HH_STATUS_DRAFT, 'venue_unpublish_failed');
  revalidateVenue(orgId, venueId);
}

export async function updateVenueRatingSettings(orgId: string, venueId: string, formData: FormData) {
  const { supabase } = await requireAuth();
  const enabled = formData.get("post_visit_rating_enabled") === "on";
  const aspects = formData
    .getAll("rating_aspects")
    .map((v) => String(v).trim())
    .filter(Boolean);

  const { data: updated, error } = await supabase
    .from("venues")
    .update({
      post_visit_rating_enabled: enabled,
      post_visit_rating_aspects: aspects,
    } as any)
    .eq("id", venueId)
    .eq("org_id", orgId)
    .select("id");

  assertMutationRows(
    'updateVenueRatingSettings',
    updated,
    error,
    orgId,
    venueId,
    "venue_update_failed",
  );

  revalidateVenue(orgId, venueId);
}
/** Creates a new happy hour window in 'draft' status for the given venue. */
export async function addHappyHour(orgId: string, venueId: string, formData: FormData) {
  const { supabase } = await requireAuth();

  const { data: venue, error: vErr } = await supabase
    .from('venues')
    .select('id,org_id,timezone')
    .eq('id', venueId)
    .eq('org_id', orgId)
    .single();

  if (vErr || !venue) {
    console.error(vErr);
    redirectWithError(orgId, venueId, 'venue_not_found');
  }

  const dow = parseDowArray(formData);
  const start_time = toStr(formData.get('start_time'));
  const end_time = toStr(formData.get('end_time'));
  const label = toNullableStr(formData.get('label'));
  const timezone = toStr(formData.get('timezone')) || venue.timezone || 'America/Chicago';

  if (!dow.length) redirectWithError(orgId, venueId, 'missing_dow');
  if (!start_time || !end_time) redirectWithError(orgId, venueId, 'missing_time');

  const { data: inserted, error } = await supabase.from('happy_hour_windows').insert({
    venue_id: venueId,
    dow,
    start_time,
    end_time,
    timezone,
    status: HH_STATUS_DRAFT,
    label,
  }).select('id');

  assertMutationRows('addHappyHour', inserted, error, orgId, venueId, 'happyhour_create_failed');

  revalidateVenue(orgId, venueId);
}

/** Updates schedule fields (dow, start_time, end_time, label) for an existing happy hour window. */
export async function updateHappyHour(orgId: string, venueId: string, formData: FormData) {
  const { supabase } = await requireAuth();

  const hh_id = requireField(formData, 'hh_id', orgId, venueId, 'missing_hh_id');
  const dow = parseDowArray(formData);
  const start_time = toStr(formData.get('start_time'));
  const end_time = toStr(formData.get('end_time'));
  const label = toNullableStr(formData.get('label'));

  if (!dow.length) redirectWithError(orgId, venueId, 'missing_dow');
  if (!start_time || !end_time) redirectWithError(orgId, venueId, 'missing_time');

  const { data: updated, error } = await supabase
    .from('happy_hour_windows')
    .update({ dow, start_time, end_time, label })
    .eq('id', hh_id)
    .eq('venue_id', venueId)
    .select('id');

  assertMutationRows('updateHappyHour', updated, error, orgId, venueId, 'happyhour_update_failed');

  revalidateVenue(orgId, venueId);
}

/** Deletes a happy hour window and its associated records. */
export async function deleteHappyHour(orgId: string, venueId: string, formData: FormData) {
  const { supabase } = await requireAuth();
  const hh_id = requireField(formData, 'hh_id', orgId, venueId, 'missing_hh_id');

  const { data: deleted, error } = await supabase
    .from('happy_hour_windows')
    .delete()
    .eq('id', hh_id)
    .eq('venue_id', venueId)
    .select('id');

  assertMutationRows('deleteHappyHour', deleted, error, orgId, venueId, 'happyhour_delete_failed');

  revalidateVenue(orgId, venueId);
}

/** Sets a happy hour window status to 'published', making it visible in the directory and mobile app. */
export async function publishHappyHour(orgId: string, venueId: string, formData: FormData) {
  const { supabase } = await requireVenueAccess(orgId, venueId);
  const hh_id = requireField(formData, 'hh_id', orgId, venueId, 'missing_hh_id');

  const { data: updated, error } = await supabase
    .from('happy_hour_windows')
    .update({ status: HH_STATUS_PUBLISHED })
    .eq('id', hh_id)
    .eq('venue_id', venueId)
    .select('id');

  assertMutationRows('publishHappyHour', updated, error, orgId, venueId, 'happyhour_publish_failed');
  await ensureVenuePublished(supabase, orgId, venueId);
  await publishMenusForWindow(supabase, orgId, venueId, hh_id, 'happyhour_publish_failed');

  revalidateVenue(orgId, venueId);
}

/** Sets a happy hour window status back to 'draft', hiding it from public views. */
export async function unpublishHappyHour(orgId: string, venueId: string, formData: FormData) {
  const { supabase } = await requireVenueAccess(orgId, venueId);
  const hh_id = requireField(formData, 'hh_id', orgId, venueId, 'missing_hh_id');

  const { data: updated, error } = await supabase
    .from('happy_hour_windows')
    .update({ status: HH_STATUS_DRAFT })
    .eq('id', hh_id)
    .eq('venue_id', venueId)
    .select('id');

  assertMutationRows('unpublishHappyHour', updated, error, orgId, venueId, 'happyhour_unpublish_failed');

  revalidateVenue(orgId, venueId);
}

/**
 * Replaces the menu associations for a happy hour window.
 * Validates that submitted menu IDs belong to the venue before linking.
 */
export async function updateHappyHourMenus(orgId: string, venueId: string, formData: FormData) {
  const { writeSupabase } = await requireVenueManagementAccess(orgId, venueId);
  const hh_id = requireField(formData, 'hh_id', orgId, venueId, 'missing_hh_id');

  const menuIds = formData.getAll('menu_ids').map((value) => toStr(value)).filter(Boolean);
  const uniqueMenuIds = Array.from(new Set(menuIds));

  const { data: window, error: windowErr } = await writeSupabase
    .from('happy_hour_windows')
    .select('id,venue_id,status')
    .eq('id', hh_id)
    .eq('venue_id', venueId)
    .single();

  if (windowErr || !window) {
    console.error(windowErr);
    redirectWithError(orgId, venueId, 'happyhour_not_found');
  }

  const { data: menus, error: menusErr } = uniqueMenuIds.length
    ? await writeSupabase
        .from('menus')
        .select('id')
        .eq('venue_id', venueId)
        .in('id', uniqueMenuIds)
    : { data: [], error: null };

  if (menusErr) {
    console.error('[updateHappyHourMenus] menu validation failed', menusErr);
    redirectWithError(orgId, venueId, 'happyhour_menus_update_failed');
  }

  const validMenuIds = (menus ?? []).map((menu: any) => menu.id).filter(Boolean);
  if (validMenuIds.length !== uniqueMenuIds.length) {
    console.warn('[updateHappyHourMenus] invalid menu selection', {
      orgId,
      venueId,
      hh_id,
      expected: uniqueMenuIds.length,
      actual: validMenuIds.length,
    });
    redirectWithError(orgId, venueId, 'happyhour_menus_update_failed');
  }

  const { error: deleteErr } = await writeSupabase
    .from('happy_hour_window_menus')
    .delete()
    .eq('happy_hour_window_id', hh_id);

  if (deleteErr) {
    console.error('[updateHappyHourMenus] delete failed', deleteErr);
    redirectWithError(orgId, venueId, 'happyhour_menus_update_failed');
  }

  if (validMenuIds.length) {
    const payload = validMenuIds.map((menu_id) => ({ happy_hour_window_id: hh_id, menu_id }));
    const { error: insertErr } = await writeSupabase.from('happy_hour_window_menus').insert(payload);

    if (insertErr) {
      console.error('[updateHappyHourMenus] insert failed', insertErr);
      redirectWithError(orgId, venueId, 'happyhour_menus_update_failed');
    }
  }

  const { data: savedLinks, error: verifyErr } = await writeSupabase
    .from('happy_hour_window_menus')
    .select('menu_id')
    .eq('happy_hour_window_id', hh_id);

  if (verifyErr) {
    console.error('[updateHappyHourMenus] verify failed', verifyErr);
    redirectWithError(orgId, venueId, 'happyhour_menus_update_failed');
  }

  const savedMenuIds = new Set((savedLinks ?? []).map((link: any) => link.menu_id));
  const expectedMenuIds = new Set(validMenuIds);
  const linksMatch =
    savedMenuIds.size === expectedMenuIds.size &&
    validMenuIds.every((menuId) => savedMenuIds.has(menuId));

  if (!linksMatch) {
    console.warn('[updateHappyHourMenus] saved links did not match submitted menus', {
      orgId,
      venueId,
      hh_id,
      expected: validMenuIds,
      saved: Array.from(savedMenuIds),
    });
    redirectWithError(orgId, venueId, 'happyhour_menus_update_failed');
  }

  if ((window.status ?? '').toLowerCase() === HH_STATUS_PUBLISHED) {
    await ensureVenuePublished(writeSupabase, orgId, venueId);
    await publishMenusByIds(
      writeSupabase,
      orgId,
      venueId,
      validMenuIds,
      'happyhour_menus_update_failed',
    );
  }

  revalidateVenue(orgId, venueId);
}

/** Creates a new menu in 'draft' status for a venue. */
export async function createMenu(orgId: string, venueId: string, formData: FormData) {
  const { supabase } = await requireAuth();
  const name = requireField(formData, 'menu_name', orgId, venueId, 'missing_menu_name');

  const { data: inserted, error } = await supabase.from('menus').insert({
    venue_id: venueId,
    name,
    status: HH_STATUS_DRAFT,
    is_active: true,
  }).select('id');

  assertMutationRows('createMenu', inserted, error, orgId, venueId, 'menu_create_failed');

  revalidateVenue(orgId, venueId);
}

/** Saves editable fields for a menu, including its existing sections and items. */
export async function saveMenu(orgId: string, venueId: string, formData: FormData) {
  const { supabase } = await requireVenueAccess(orgId, venueId);
  const menu_id = requireField(formData, 'menu_id', orgId, venueId, 'missing_menu_id');

  const { data: menu, error: menuLookupError } = await supabase
    .from('menus')
    .select('id')
    .eq('id', menu_id)
    .eq('venue_id', venueId)
    .maybeSingle();

  if (menuLookupError) {
    console.error('[saveMenu] menu lookup failed', menuLookupError);
    redirectWithError(orgId, venueId, 'menu_update_failed');
  }

  if (!menu) redirectWithError(orgId, venueId, 'not_authorized');

  if (formData.has('menu_name')) {
    const name = toStr(formData.get('menu_name'));
    const is_active = formData.get('menu_is_active') === 'on';

    if (!name) redirectWithError(orgId, venueId, 'missing_menu_name');

    const { data: updatedMenu, error: menuError } = await supabase
      .from('menus')
      .update({ name, is_active })
      .eq('id', menu_id)
      .eq('venue_id', venueId)
      .select('id');

    assertMutationRows('saveMenu:menu', updatedMenu, menuError, orgId, venueId, 'menu_update_failed');
  }

  const sectionIds = Array.from(new Set(
    formData.getAll('section_ids').map((value) => toStr(value)).filter(Boolean),
  ));

  for (const sectionId of sectionIds) {
    const sectionName = requireField(
      formData,
      `section_name_${sectionId}`,
      orgId,
      venueId,
      'missing_section_fields',
    );

    const { data: updatedSection, error: sectionError } = await supabase
      .from('menu_sections')
      .update({ name: sectionName })
      .eq('id', sectionId)
      .eq('menu_id', menu_id)
      .select('id');

    assertMutationRows(
      'saveMenu:section',
      updatedSection,
      sectionError,
      orgId,
      venueId,
      'section_update_failed',
    );
  }

  const itemIds = Array.from(new Set(
    formData.getAll('item_ids').map((value) => toStr(value)).filter(Boolean),
  ));

  for (const itemId of itemIds) {
    const itemName = toStr(formData.get(`item_name_${itemId}`));
    const description = toNullableStr(formData.get(`item_description_${itemId}`));
    const price = toNumberOrNull(formData.get(`item_price_${itemId}`));
    const is_happy_hour = formData.get(`item_is_happy_hour_${itemId}`) === 'on';

    if (!itemName) redirectWithError(orgId, venueId, 'missing_item_fields');

    const { data: item } = await supabase
      .from('menu_items')
      .select('id, menu_sections!inner(menu_id)')
      .eq('id', itemId)
      .eq('menu_sections.menu_id', menu_id)
      .maybeSingle();

    if (!item) redirectWithError(orgId, venueId, 'not_authorized');

    const { data: updatedItem, error: itemError } = await supabase
      .from('menu_items')
      .update({ name: itemName, description, price, is_happy_hour })
      .eq('id', itemId)
      .select('id');

    assertMutationRows('saveMenu:item', updatedItem, itemError, orgId, venueId, 'item_update_failed');
  }

  revalidateVenue(orgId, venueId);
}

/** Sets a menu's status to 'published'. */
export async function publishMenu(orgId: string, venueId: string, formData: FormData) {
  const { supabase } = await requireVenueAccess(orgId, venueId);
  const menu_id = requireField(formData, 'menu_id', orgId, venueId, 'missing_menu_id');

  const { data: updated, error } = await supabase
    .from('menus')
    .update({ status: HH_STATUS_PUBLISHED })
    .eq('id', menu_id)
    .eq('venue_id', venueId)
    .select('id');

  assertMutationRows('publishMenu', updated, error, orgId, venueId, 'menu_publish_failed');
  await ensureVenuePublished(supabase, orgId, venueId);

  revalidateVenue(orgId, venueId);
}

/** Sets a menu's status back to 'draft'. */
export async function unpublishMenu(orgId: string, venueId: string, formData: FormData) {
  const { supabase } = await requireVenueAccess(orgId, venueId);
  const menu_id = requireField(formData, 'menu_id', orgId, venueId, 'missing_menu_id');

  const { data: updated, error } = await supabase
    .from('menus')
    .update({ status: HH_STATUS_DRAFT })
    .eq('id', menu_id)
    .eq('venue_id', venueId)
    .select('id');

  assertMutationRows('unpublishMenu', updated, error, orgId, venueId, 'menu_unpublish_failed');

  revalidateVenue(orgId, venueId);
}

/**
 * Deletes a menu and all its sections and items.
 * Manually cascades the delete in case FK cascade is not configured.
 */
export async function deleteMenu(orgId: string, venueId: string, formData: FormData) {
  const { supabase } = await requireAuth();
  const menu_id = requireField(formData, 'menu_id', orgId, venueId, 'missing_menu_id');

  const { data: sections } = await supabase
    .from('menu_sections')
    .select('id')
    .eq('menu_id', menu_id);

  const sectionIds = (sections ?? []).map((s: any) => s.id).filter(Boolean);
  if (sectionIds.length) {
    await supabase.from('menu_items').delete().in('section_id', sectionIds);
  }
  await supabase.from('menu_sections').delete().eq('menu_id', menu_id);

  const { data: deleted, error } = await supabase
    .from('menus')
    .delete()
    .eq('id', menu_id)
    .eq('venue_id', venueId)
    .select('id');

  assertMutationRows('deleteMenu', deleted, error, orgId, venueId, 'menu_delete_failed');

  revalidateVenue(orgId, venueId);
}

/** Creates a new menu section appended to the end of the menu. */
export async function createSection(orgId: string, venueId: string, formData: FormData) {
  const { supabase } = await requireAuth();
  const menu_id = requireField(formData, 'menu_id', orgId, venueId, 'missing_section_fields');
  const name = requireField(formData, 'section_name', orgId, venueId, 'missing_section_fields');
  const nextSort = await nextSortOrder(supabase, 'menu_sections', 'menu_id', menu_id);

  const { error } = await supabase.from('menu_sections').insert({ menu_id, name, sort_order: nextSort });
  if (error) {
    console.error(error);
    redirectWithError(orgId, venueId, 'section_create_failed');
  }

  revalidateVenue(orgId, venueId);
}

/**
 * Deletes a menu section and all its items.
 * Verifies the section belongs to a menu owned by this venue before deleting.
 */
export async function deleteSection(orgId: string, venueId: string, formData: FormData) {
  const { supabase } = await requireVenueAccess(orgId, venueId);
  const section_id = requireField(formData, 'section_id', orgId, venueId, 'missing_section_id');

  const { data: section } = await supabase
    .from('menu_sections')
    .select('id, menus!inner(venue_id)')
    .eq('id', section_id)
    .eq('menus.venue_id', venueId)
    .maybeSingle();

  if (!section) redirectWithError(orgId, venueId, 'not_authorized');

  await supabase.from('menu_items').delete().eq('section_id', section_id);

  const { error } = await supabase.from('menu_sections').delete().eq('id', section_id);
  if (error) {
    console.error(error);
    redirectWithError(orgId, venueId, 'section_delete_failed');
  }

  revalidateVenue(orgId, venueId);
}

/** Creates a menu item appended to the end of a section. */
export async function createItem(orgId: string, venueId: string, formData: FormData) {
  const { supabase } = await requireAuth();
  const section_id = requireField(formData, 'section_id', orgId, venueId, 'missing_item_fields');
  const name = toStr(formData.get('item_name'));
  const description = toNullableStr(formData.get('item_description'));
  const price = toNumberOrNull(formData.get('item_price'));
  const is_happy_hour = formData.get('item_is_happy_hour') === 'on';

  if (!name) redirectWithError(orgId, venueId, 'missing_item_fields');

  const nextSort = await nextSortOrder(supabase, 'menu_items', 'section_id', section_id);
  const { error } = await supabase.from('menu_items').insert({
    section_id, name, description, price, is_happy_hour, sort_order: nextSort,
  });

  if (error) {
    console.error(error);
    redirectWithError(orgId, venueId, 'item_create_failed');
  }

  revalidateVenue(orgId, venueId);
}

/**
 * Deletes a menu item.
 * Verifies the item traces back to this venue via section → menu before deleting.
 */
export async function deleteItem(orgId: string, venueId: string, formData: FormData) {
  const { supabase } = await requireVenueAccess(orgId, venueId);
  const item_id = requireField(formData, 'item_id', orgId, venueId, 'missing_item_id');

  const { data: item } = await supabase
    .from('menu_items')
    .select('id, menu_sections!inner(menu_id, menus!inner(venue_id))')
    .eq('id', item_id)
    .eq('menu_sections.menus.venue_id', venueId)
    .maybeSingle();

  if (!item) redirectWithError(orgId, venueId, 'not_authorized');

  const { error } = await supabase.from('menu_items').delete().eq('id', item_id);
  if (error) {
    console.error(error);
    redirectWithError(orgId, venueId, 'item_delete_failed');
  }

  revalidateVenue(orgId, venueId);
}
