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

  return menus
    .map((menu) => {
      const sections = (menu.sections ?? [])
        .map((section) => {
          const items = (section.items ?? []);
          return {
            ...section,
            items: happyHourOnly
              ? items.filter((item) => item.is_happy_hour)
              : items
          };
        })
        .filter((section) => section.items.length > 0);

      return {
        ...menu,
        sections
      };
    })
    .filter((menu) => menu.sections.length > 0) as MenuWithSections[];
}
