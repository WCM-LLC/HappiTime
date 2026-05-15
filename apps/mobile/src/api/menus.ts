import {
  fetchWindowMenus as fetchSharedWindowMenus,
  fetchVenueMenus as fetchSharedVenueMenus,
  type MenuItemSummary,
  type MenuSectionWithItems,
  type MenuWithSections
} from "@happitime/shared-api";
import { supabase } from "./supabaseClient";

export type MenuItem = MenuItemSummary;
export type MenuSection = MenuSectionWithItems;
export type Menu = MenuWithSections;

/** Fetches active published menus for a venue, forwarding the mobile Supabase client to the shared helper. */
export async function fetchVenueMenus(venueId: string): Promise<Menu[]> {
  return fetchSharedVenueMenus(venueId, { supabase });
}

/** Fetches menus attached to a happy hour window; passes includeEmptyMenus=true for detail screens. */
export async function fetchWindowMenus(
  windowId: string,
  venueId?: string | null
): Promise<Menu[]> {
  return fetchSharedWindowMenus(windowId, venueId ?? undefined, {
    supabase,
    includeEmptyMenus: true
  });
}
