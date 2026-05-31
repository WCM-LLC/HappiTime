'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/utils/supabase/server';
import { hasAdminEmailsConfigured, isAdmin, getAdminClient } from '@/utils/admin';
import { toNullableStr, toNumberOrNull, toStr } from '@/utils/form';
import { syncBundleQuantity } from '@/utils/bundle-sync';
import {
  fetchOrganizationMenuTree,
  syncOrganizationMenuCopies,
} from './menu-tree';

const ORG_MENU_ROLES = new Set(['owner', 'manager', 'admin', 'editor']);
const HH_STATUS_DRAFT = 'draft';
const HH_STATUS_PUBLISHED = 'published';

function redirectOrgWithError(orgId: string, error: string): never {
  redirect(`/orgs/${orgId}?error=${error}`);
}

function redirectOrgWithSuccess(orgId: string, success: string): never {
  redirect(`/orgs/${orgId}?success=${success}`);
}

function requireOrgField(formData: FormData, key: string, orgId: string, error: string): string {
  const value = toStr(formData.get(key));
  if (!value) redirectOrgWithError(orgId, error);
  return value;
}

async function requireOrgMenuManagementAccess(orgId: string) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect('/login');

  const userIsAdmin = await isAdmin();
  const lookupClient = userIsAdmin ? getAdminClient() : supabase;

  const { data: org } = await lookupClient
    .from('organizations')
    .select('id')
    .eq('id', orgId)
    .maybeSingle();

  if (!org) redirectOrgWithError(orgId, 'org_not_found');

  if (userIsAdmin) {
    return { writeSupabase: lookupClient };
  }

  const { data: membership, error: membershipErr } = await supabase
    .from('org_members')
    .select('role')
    .eq('org_id', orgId)
    .eq('user_id', auth.user.id)
    .maybeSingle();

  if (membershipErr || !membership || !ORG_MENU_ROLES.has(String(membership.role))) {
    redirectOrgWithError(orgId, 'org_manage_forbidden');
  }

  try {
    return { writeSupabase: getAdminClient() };
  } catch {
    return { writeSupabase: supabase };
  }
}

async function syncMenuCopiesAfterOrgChange(
  supabase: { from: (table: string) => any },
  orgId: string,
  menuId: string,
  failureCode: string,
) {
  const { data: menu, error } = await fetchOrganizationMenuTree(supabase, orgId, menuId);
  if (error || !menu) {
    console.error('[syncMenuCopiesAfterOrgChange] menu lookup failed', error);
    redirectOrgWithError(orgId, failureCode);
  }

  try {
    await syncOrganizationMenuCopies(supabase, orgId, menu);
  } catch (syncError) {
    console.error('[syncMenuCopiesAfterOrgChange] copy sync failed', syncError);
    redirectOrgWithError(orgId, failureCode);
  }
}

async function nextMenuSortOrder(
  supabase: { from: (table: string) => any },
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

  // Venue count changed → keep any active org bundle's quantity/tier in sync.
  await syncBundleQuantity(orgId);

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

  // Venue count changed → keep any active org bundle's quantity/tier in sync.
  await syncBundleQuantity(orgId);

  revalidatePath(`/orgs/${orgId}`);
}

export async function createOrganizationMenu(orgId: string, formData: FormData) {
  const { writeSupabase } = await requireOrgMenuManagementAccess(orgId);
  const name = requireOrgField(formData, 'menu_name', orgId, 'missing_menu_name');

  const { error } = await writeSupabase
    .from('menus')
    .insert({
      org_id: orgId,
      venue_id: null,
      source_menu_id: null,
      scope: 'organization',
      name,
      status: HH_STATUS_DRAFT,
      is_active: true,
    });

  if (error) {
    console.error('[createOrganizationMenu] insert failed', error);
    redirectOrgWithError(orgId, 'organization_menu_create_failed');
  }

  revalidatePath(`/orgs/${orgId}`);
  redirectOrgWithSuccess(orgId, 'organization_menu_created');
}

export async function saveOrganizationMenu(orgId: string, formData: FormData) {
  const { writeSupabase } = await requireOrgMenuManagementAccess(orgId);
  const menuId = requireOrgField(formData, 'menu_id', orgId, 'missing_menu_id');

  const { data: menu, error: menuLookupError } = await writeSupabase
    .from('menus')
    .select('id')
    .eq('id', menuId)
    .eq('org_id', orgId)
    .eq('scope', 'organization')
    .maybeSingle();

  if (menuLookupError) {
    console.error('[saveOrganizationMenu] lookup failed', menuLookupError);
    redirectOrgWithError(orgId, 'organization_menu_update_failed');
  }

  if (!menu) redirectOrgWithError(orgId, 'organization_menu_not_found');

  if (formData.has('menu_name')) {
    const name = toStr(formData.get('menu_name'));
    const is_active = formData.get('menu_is_active') === 'on';

    if (!name) redirectOrgWithError(orgId, 'missing_menu_name');

    const { error: menuError } = await writeSupabase
      .from('menus')
      .update({ name, is_active })
      .eq('id', menuId)
      .eq('org_id', orgId)
      .eq('scope', 'organization');

    if (menuError) {
      console.error('[saveOrganizationMenu] menu update failed', menuError);
      redirectOrgWithError(orgId, 'organization_menu_update_failed');
    }
  }

  const sectionIds = Array.from(new Set(
    formData.getAll('section_ids').map((value) => toStr(value)).filter(Boolean),
  ));

  for (const sectionId of sectionIds) {
    const sectionName = requireOrgField(
      formData,
      `section_name_${sectionId}`,
      orgId,
      'missing_section_fields',
    );

    const { error: sectionError } = await writeSupabase
      .from('menu_sections')
      .update({ name: sectionName })
      .eq('id', sectionId)
      .eq('menu_id', menuId);

    if (sectionError) {
      console.error('[saveOrganizationMenu] section update failed', sectionError);
      redirectOrgWithError(orgId, 'section_update_failed');
    }
  }

  const itemIds = Array.from(new Set(
    formData.getAll('item_ids').map((value) => toStr(value)).filter(Boolean),
  ));

  for (const itemId of itemIds) {
    const itemName = toStr(formData.get(`item_name_${itemId}`));
    const description = toNullableStr(formData.get(`item_description_${itemId}`));
    const price = toNumberOrNull(formData.get(`item_price_${itemId}`));
    const is_happy_hour = formData.get(`item_is_happy_hour_${itemId}`) === 'on';

    if (!itemName) redirectOrgWithError(orgId, 'missing_item_fields');

    const { data: item, error: itemLookupError } = await writeSupabase
      .from('menu_items')
      .select('id, menu_sections!inner(menu_id)')
      .eq('id', itemId)
      .eq('menu_sections.menu_id', menuId)
      .maybeSingle();

    if (itemLookupError) {
      console.error('[saveOrganizationMenu] item lookup failed', itemLookupError);
      redirectOrgWithError(orgId, 'item_update_failed');
    }

    if (!item) redirectOrgWithError(orgId, 'organization_menu_not_found');

    const { error: itemError } = await writeSupabase
      .from('menu_items')
      .update({ name: itemName, description, price, is_happy_hour })
      .eq('id', itemId);

    if (itemError) {
      console.error('[saveOrganizationMenu] item update failed', itemError);
      redirectOrgWithError(orgId, 'item_update_failed');
    }
  }

  await syncMenuCopiesAfterOrgChange(
    writeSupabase,
    orgId,
    menuId,
    'organization_menu_update_failed',
  );

  revalidatePath(`/orgs/${orgId}`);
  redirectOrgWithSuccess(orgId, 'organization_menu_saved');
}

export async function publishOrganizationMenu(orgId: string, formData: FormData) {
  const { writeSupabase } = await requireOrgMenuManagementAccess(orgId);
  const menuId = requireOrgField(formData, 'menu_id', orgId, 'missing_menu_id');

  const { error } = await writeSupabase
    .from('menus')
    .update({ status: HH_STATUS_PUBLISHED })
    .eq('id', menuId)
    .eq('org_id', orgId)
    .eq('scope', 'organization');

  if (error) {
    console.error('[publishOrganizationMenu] update failed', error);
    redirectOrgWithError(orgId, 'organization_menu_publish_failed');
  }

  revalidatePath(`/orgs/${orgId}`);
  redirectOrgWithSuccess(orgId, 'organization_menu_published');
}

export async function unpublishOrganizationMenu(orgId: string, formData: FormData) {
  const { writeSupabase } = await requireOrgMenuManagementAccess(orgId);
  const menuId = requireOrgField(formData, 'menu_id', orgId, 'missing_menu_id');

  const { error } = await writeSupabase
    .from('menus')
    .update({ status: HH_STATUS_DRAFT })
    .eq('id', menuId)
    .eq('org_id', orgId)
    .eq('scope', 'organization');

  if (error) {
    console.error('[unpublishOrganizationMenu] update failed', error);
    redirectOrgWithError(orgId, 'organization_menu_unpublish_failed');
  }

  revalidatePath(`/orgs/${orgId}`);
  redirectOrgWithSuccess(orgId, 'organization_menu_unpublished');
}

export async function deleteOrganizationMenu(orgId: string, formData: FormData) {
  const { writeSupabase } = await requireOrgMenuManagementAccess(orgId);
  const menuId = requireOrgField(formData, 'menu_id', orgId, 'missing_menu_id');

  const { data: menu, error: menuLookupError } = await writeSupabase
    .from('menus')
    .select('id')
    .eq('id', menuId)
    .eq('org_id', orgId)
    .eq('scope', 'organization')
    .maybeSingle();

  if (menuLookupError) {
    console.error('[deleteOrganizationMenu] lookup failed', menuLookupError);
    redirectOrgWithError(orgId, 'organization_menu_delete_failed');
  }

  if (!menu) redirectOrgWithError(orgId, 'organization_menu_not_found');

  const { data: sections } = await writeSupabase
    .from('menu_sections')
    .select('id')
    .eq('menu_id', menuId);

  const sectionIds = ((sections ?? []) as { id: string }[]).map((section) => section.id).filter(Boolean);
  if (sectionIds.length) {
    const { error: itemDeleteError } = await writeSupabase
      .from('menu_items')
      .delete()
      .in('section_id', sectionIds);

    if (itemDeleteError) {
      console.error('[deleteOrganizationMenu] item delete failed', itemDeleteError);
      redirectOrgWithError(orgId, 'organization_menu_delete_failed');
    }
  }

  const { error: sectionDeleteError } = await writeSupabase
    .from('menu_sections')
    .delete()
    .eq('menu_id', menuId);

  if (sectionDeleteError) {
    console.error('[deleteOrganizationMenu] section delete failed', sectionDeleteError);
    redirectOrgWithError(orgId, 'organization_menu_delete_failed');
  }

  const { error } = await writeSupabase
    .from('menus')
    .delete()
    .eq('id', menuId)
    .eq('org_id', orgId)
    .eq('scope', 'organization');

  if (error) {
    console.error('[deleteOrganizationMenu] delete failed', error);
    redirectOrgWithError(orgId, 'organization_menu_delete_failed');
  }

  revalidatePath(`/orgs/${orgId}`);
  redirectOrgWithSuccess(orgId, 'organization_menu_deleted');
}

export async function createOrganizationMenuSection(orgId: string, formData: FormData) {
  const { writeSupabase } = await requireOrgMenuManagementAccess(orgId);
  const menuId = requireOrgField(formData, 'menu_id', orgId, 'missing_section_fields');
  const name = requireOrgField(formData, 'section_name', orgId, 'missing_section_fields');

  const { data: menu, error: menuLookupError } = await writeSupabase
    .from('menus')
    .select('id')
    .eq('id', menuId)
    .eq('org_id', orgId)
    .eq('scope', 'organization')
    .maybeSingle();

  if (menuLookupError) {
    console.error('[createOrganizationMenuSection] menu lookup failed', menuLookupError);
    redirectOrgWithError(orgId, 'section_create_failed');
  }

  if (!menu) redirectOrgWithError(orgId, 'organization_menu_not_found');

  const sortOrder = await nextMenuSortOrder(writeSupabase, 'menu_sections', 'menu_id', menuId);
  const { error } = await writeSupabase
    .from('menu_sections')
    .insert({ menu_id: menuId, name, sort_order: sortOrder });

  if (error) {
    console.error('[createOrganizationMenuSection] insert failed', error);
    redirectOrgWithError(orgId, 'section_create_failed');
  }

  await syncMenuCopiesAfterOrgChange(writeSupabase, orgId, menuId, 'section_create_failed');

  revalidatePath(`/orgs/${orgId}`);
  redirectOrgWithSuccess(orgId, 'section_created');
}

export async function deleteOrganizationMenuSection(orgId: string, formData: FormData) {
  const { writeSupabase } = await requireOrgMenuManagementAccess(orgId);
  const sectionId = requireOrgField(formData, 'section_id', orgId, 'missing_section_id');

  const { data: section, error: sectionLookupError } = await writeSupabase
    .from('menu_sections')
    .select('id, menu_id, menus!inner(org_id, scope)')
    .eq('id', sectionId)
    .eq('menus.org_id', orgId)
    .eq('menus.scope', 'organization')
    .maybeSingle();

  if (sectionLookupError) {
    console.error('[deleteOrganizationMenuSection] lookup failed', sectionLookupError);
    redirectOrgWithError(orgId, 'section_delete_failed');
  }

  if (!section) redirectOrgWithError(orgId, 'organization_menu_not_found');

  const menuId = String((section as any).menu_id);

  const { error: itemDeleteError } = await writeSupabase
    .from('menu_items')
    .delete()
    .eq('section_id', sectionId);

  if (itemDeleteError) {
    console.error('[deleteOrganizationMenuSection] item delete failed', itemDeleteError);
    redirectOrgWithError(orgId, 'section_delete_failed');
  }

  const { error } = await writeSupabase
    .from('menu_sections')
    .delete()
    .eq('id', sectionId);

  if (error) {
    console.error('[deleteOrganizationMenuSection] delete failed', error);
    redirectOrgWithError(orgId, 'section_delete_failed');
  }

  await syncMenuCopiesAfterOrgChange(writeSupabase, orgId, menuId, 'section_delete_failed');

  revalidatePath(`/orgs/${orgId}`);
  redirectOrgWithSuccess(orgId, 'section_deleted');
}

export async function createOrganizationMenuItem(orgId: string, formData: FormData) {
  const { writeSupabase } = await requireOrgMenuManagementAccess(orgId);
  const sectionId = requireOrgField(formData, 'section_id', orgId, 'missing_item_fields');
  const name = toStr(formData.get('item_name'));
  const description = toNullableStr(formData.get('item_description'));
  const price = toNumberOrNull(formData.get('item_price'));
  const is_happy_hour = formData.get('item_is_happy_hour') === 'on';

  if (!name) redirectOrgWithError(orgId, 'missing_item_fields');

  const { data: section, error: sectionLookupError } = await writeSupabase
    .from('menu_sections')
    .select('id, menu_id, menus!inner(org_id, scope)')
    .eq('id', sectionId)
    .eq('menus.org_id', orgId)
    .eq('menus.scope', 'organization')
    .maybeSingle();

  if (sectionLookupError) {
    console.error('[createOrganizationMenuItem] section lookup failed', sectionLookupError);
    redirectOrgWithError(orgId, 'item_create_failed');
  }

  if (!section) redirectOrgWithError(orgId, 'organization_menu_not_found');

  const menuId = String((section as any).menu_id);
  const sortOrder = await nextMenuSortOrder(writeSupabase, 'menu_items', 'section_id', sectionId);

  const { error } = await writeSupabase
    .from('menu_items')
    .insert({ section_id: sectionId, name, description, price, is_happy_hour, sort_order: sortOrder });

  if (error) {
    console.error('[createOrganizationMenuItem] insert failed', error);
    redirectOrgWithError(orgId, 'item_create_failed');
  }

  await syncMenuCopiesAfterOrgChange(writeSupabase, orgId, menuId, 'item_create_failed');

  revalidatePath(`/orgs/${orgId}`);
  redirectOrgWithSuccess(orgId, 'item_created');
}

export async function deleteOrganizationMenuItem(orgId: string, formData: FormData) {
  const { writeSupabase } = await requireOrgMenuManagementAccess(orgId);
  const itemId = requireOrgField(formData, 'item_id', orgId, 'missing_item_id');

  const { data: item, error: itemLookupError } = await writeSupabase
    .from('menu_items')
    .select('id, menu_sections!inner(menu_id, menus!inner(org_id, scope))')
    .eq('id', itemId)
    .eq('menu_sections.menus.org_id', orgId)
    .eq('menu_sections.menus.scope', 'organization')
    .maybeSingle();

  if (itemLookupError) {
    console.error('[deleteOrganizationMenuItem] lookup failed', itemLookupError);
    redirectOrgWithError(orgId, 'item_delete_failed');
  }

  if (!item) redirectOrgWithError(orgId, 'organization_menu_not_found');

  const menuId = String((item as any).menu_sections.menu_id);

  const { error } = await writeSupabase
    .from('menu_items')
    .delete()
    .eq('id', itemId);

  if (error) {
    console.error('[deleteOrganizationMenuItem] delete failed', error);
    redirectOrgWithError(orgId, 'item_delete_failed');
  }

  await syncMenuCopiesAfterOrgChange(writeSupabase, orgId, menuId, 'item_delete_failed');

  revalidatePath(`/orgs/${orgId}`);
  redirectOrgWithSuccess(orgId, 'item_deleted');
}

export async function syncOrganizationMenuToVenues(orgId: string, formData: FormData) {
  const { writeSupabase } = await requireOrgMenuManagementAccess(orgId);
  const menuId = requireOrgField(formData, 'menu_id', orgId, 'missing_menu_id');

  await syncMenuCopiesAfterOrgChange(
    writeSupabase,
    orgId,
    menuId,
    'organization_menu_sync_failed',
  );

  revalidatePath(`/orgs/${orgId}`);
  redirectOrgWithSuccess(orgId, 'organization_menu_synced');
}
