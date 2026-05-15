// packages/shared-api/src/menus.ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Database,
  Menu,
  MenuSection,
  MenuItem
} from "@happitime/shared-types";
import { createSupabaseClient } from "./client.js";

export type MenuItemSummary = Pick<
  MenuItem,
  "id" | "name" | "description" | "price" | "is_happy_hour" | "sort_order"
>;

export type MenuSectionSummary = Pick<MenuSection, "id" | "name" | "sort_order"> & {
  items?: MenuItemSummary[] | null;
};

export type MenuSummary = Pick<Menu, "id" | "name" | "status" | "is_active"> & {
  sections?: MenuSectionSummary[] | null;
};

export type MenuSectionWithItems = Omit<MenuSectionSummary, "items"> & {
  items: MenuItemSummary[];
};

export type MenuWithSections = Omit<MenuSummary, "sections"> & {
  sections: MenuSectionWithItems[];
};

type RawMenuWithSections = MenuSummary & {
  venue_id?: string | null;
};

/**
 * Filters, sorts, and normalizes raw menu rows into typed MenuWithSections objects.
 * Removes empty sections and menus unless includeEmptyMenus is true.
 * Filters items to happy-hour-only when happyHourOnly is set.
 */
function shapeMenus(
  menus: RawMenuWithSections[],
  opts: {
    happyHourOnly: boolean;
    includeEmptyMenus?: boolean;
    status?: string | null;
    isActive?: boolean | null;
    venueId?: string;
  }
): MenuWithSections[] {
  return menus
    .filter((menu) => {
      if (opts.venueId && menu.venue_id !== opts.venueId) return false;
      if (opts.status != null && menu.status !== opts.status) return false;
      if (typeof opts.isActive === "boolean" && menu.is_active !== opts.isActive) {
        return false;
      }
      return true;
    })
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((menu) => {
      const sections = (menu.sections ?? [])
        .slice()
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
        .map((section) => {
          const items = (section.items ?? [])
            .slice()
            .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

          return {
            ...section,
            items: opts.happyHourOnly
              ? items.filter((item) => item.is_happy_hour)
              : items
          };
        })
        .filter((section) => opts.includeEmptyMenus || section.items.length > 0);

      return {
        ...menu,
        sections
      };
    })
    .filter((menu) => opts.includeEmptyMenus || menu.sections.length > 0) as MenuWithSections[];
}

/**
 * Fetch published, active menus with sections + happy hour items.
 */
export async function fetchVenueMenus(
  venueId: string,
  opts?: {
    supabase?: SupabaseClient<Database>;
    status?: string;
    isActive?: boolean;
    happyHourOnly?: boolean;
  }
): Promise<MenuWithSections[]> {
  const supabase = opts?.supabase ?? createSupabaseClient();
  const status = opts?.status ?? "published";
  const isActive = opts?.isActive ?? true;
  const happyHourOnly = opts?.happyHourOnly ?? true;

  let query = supabase
    .from("menus")
    .select(
      `
      id,
      name,
      status,
      is_active,
      sections:menu_sections!menu_sections_menu_id_fkey (
        id,
        name,
        sort_order,
        items:menu_items!menu_items_section_id_fkey (
          id,
          name,
          description,
          price,
          is_happy_hour,
          sort_order
        )
      )
    `
    )
    .eq("venue_id", venueId)
    .eq("status", status)
    .eq("is_active", isActive)
    .order("name", { ascending: true });

  const { data, error } = await query;

  if (error) {
    console.error("[fetchVenueMenus] error", error);
    throw error;
  }

  const menus = (data ?? []) as MenuSummary[];

  return shapeMenus(menus, { happyHourOnly });
}

/**
 * Fetch published, active menus attached to one happy hour window.
 * Keeps the returned shape identical to fetchVenueMenus for mobile clients.
 */
export async function fetchWindowMenus(
  windowId: string,
  venueId?: string,
  opts?: {
    supabase?: SupabaseClient<Database>;
    status?: string | null;
    isActive?: boolean | null;
    happyHourOnly?: boolean;
    includeEmptyMenus?: boolean;
  }
): Promise<MenuWithSections[]> {
  const supabase = opts?.supabase ?? createSupabaseClient();
  const status = opts?.status === undefined ? "published" : opts.status;
  const isActive = opts?.isActive === undefined ? true : opts.isActive;
  const happyHourOnly = opts?.happyHourOnly ?? false;
  const includeEmptyMenus = opts?.includeEmptyMenus ?? false;

  const { data, error } = await supabase
    .from("happy_hour_window_menus")
    .select(
      `
      happy_hour_window_id,
      menus:menu_id (
        id,
        venue_id,
        name,
        status,
        is_active,
        sections:menu_sections!menu_sections_menu_id_fkey (
          id,
          name,
          sort_order,
          items:menu_items!menu_items_section_id_fkey (
            id,
            name,
            description,
            price,
            is_happy_hour,
            sort_order
          )
        )
      )
    `
    )
    .eq("happy_hour_window_id", windowId);

  if (error) {
    console.error("[fetchWindowMenus] error", error);
    throw error;
  }

  const menus = (data ?? [])
    .map((row) => (row as any).menus)
    .filter(Boolean) as RawMenuWithSections[];

  return shapeMenus(menus, {
    happyHourOnly,
    includeEmptyMenus,
    status,
    isActive,
    venueId
  });
}
