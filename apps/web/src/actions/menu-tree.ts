type SupabaseLike = {
  from: (table: string) => any;
};

export const MENU_TREE_SELECT =
  'id,name,status,is_active,menu_sections(id,name,sort_order,menu_items(id,name,description,price,is_happy_hour,sort_order))';

type MenuItemTree = {
  id: string;
  name: string;
  description: string | null;
  price: number | string | null;
  is_happy_hour?: boolean | null;
  sort_order: number | null;
};

type MenuSectionTree = {
  id: string;
  name: string;
  sort_order: number | null;
  menu_items?: MenuItemTree[] | null;
};

export type MenuTree = {
  id: string;
  name: string;
  status?: string | null;
  is_active: boolean;
  menu_sections?: MenuSectionTree[] | null;
};

function sortByOrder<T extends { sort_order: number | null }>(rows: T[] | null | undefined): T[] {
  return [...(rows ?? [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
}

export async function fetchOrganizationMenuTree(
  supabase: SupabaseLike,
  orgId: string,
  menuId: string,
) {
  return supabase
    .from('menus')
    .select(MENU_TREE_SELECT)
    .eq('id', menuId)
    .eq('org_id', orgId)
    .eq('scope', 'organization')
    .maybeSingle();
}

export async function replaceMenuTreeFromSource(
  supabase: SupabaseLike,
  targetMenuId: string,
  sourceMenu: MenuTree,
) {
  const { data: existingSections, error: existingSectionsError } = await supabase
    .from('menu_sections')
    .select('id')
    .eq('menu_id', targetMenuId);

  if (existingSectionsError) throw existingSectionsError;

  const existingSectionIds = ((existingSections ?? []) as { id: string }[])
    .map((section) => section.id)
    .filter(Boolean);

  if (existingSectionIds.length) {
    const { error: itemDeleteError } = await supabase
      .from('menu_items')
      .delete()
      .in('section_id', existingSectionIds);

    if (itemDeleteError) throw itemDeleteError;
  }

  const { error: sectionDeleteError } = await supabase
    .from('menu_sections')
    .delete()
    .eq('menu_id', targetMenuId);

  if (sectionDeleteError) throw sectionDeleteError;

  for (const section of sortByOrder(sourceMenu.menu_sections)) {
    const { data: insertedSection, error: sectionInsertError } = await supabase
      .from('menu_sections')
      .insert({
        menu_id: targetMenuId,
        name: section.name,
        sort_order: section.sort_order ?? 0,
      })
      .select('id')
      .single();

    if (sectionInsertError) throw sectionInsertError;

    const sectionId = insertedSection?.id;
    if (!sectionId) throw new Error('menu_section_insert_missing_id');

    const items = sortByOrder(section.menu_items);
    if (!items.length) continue;

    const { error: itemInsertError } = await supabase.from('menu_items').insert(
      items.map((item) => ({
        section_id: sectionId,
        name: item.name,
        description: item.description,
        price: item.price,
        is_happy_hour: !!item.is_happy_hour,
        sort_order: item.sort_order ?? 0,
      })),
    );

    if (itemInsertError) throw itemInsertError;
  }
}

export async function cloneOrganizationMenuToVenue(
  supabase: SupabaseLike,
  sourceMenu: MenuTree,
  opts: {
    orgId: string;
    venueId: string;
    status?: 'draft' | 'published';
  },
) {
  const { data: insertedMenu, error: menuInsertError } = await supabase
    .from('menus')
    .insert({
      org_id: opts.orgId,
      venue_id: opts.venueId,
      source_menu_id: sourceMenu.id,
      scope: 'venue',
      name: sourceMenu.name,
      status: opts.status ?? 'draft',
      is_active: sourceMenu.is_active,
    })
    .select('id')
    .single();

  if (menuInsertError) throw menuInsertError;

  const menuId = insertedMenu?.id;
  if (!menuId) throw new Error('menu_insert_missing_id');

  await replaceMenuTreeFromSource(supabase, menuId, sourceMenu);
  return menuId as string;
}

export async function syncVenueMenuFromOrganizationMenu(
  supabase: SupabaseLike,
  venueMenuId: string,
  sourceMenu: MenuTree,
) {
  const { error: menuUpdateError } = await supabase
    .from('menus')
    .update({
      name: sourceMenu.name,
      is_active: sourceMenu.is_active,
    })
    .eq('id', venueMenuId);

  if (menuUpdateError) throw menuUpdateError;

  await replaceMenuTreeFromSource(supabase, venueMenuId, sourceMenu);
}

export async function syncOrganizationMenuCopies(
  supabase: SupabaseLike,
  orgId: string,
  sourceMenu: MenuTree,
) {
  const { data: copies, error: copiesError } = await supabase
    .from('menus')
    .select('id')
    .eq('org_id', orgId)
    .eq('scope', 'venue')
    .eq('source_menu_id', sourceMenu.id);

  if (copiesError) throw copiesError;

  for (const copy of (copies ?? []) as { id: string }[]) {
    await syncVenueMenuFromOrganizationMenu(supabase, copy.id, sourceMenu);
  }
}
