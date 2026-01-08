import {
  fetchVenueMenus as fetchSharedVenueMenus,
  type MenuItemSummary,
  type MenuSectionWithItems,
  type MenuWithSections
} from "@happitime/shared-api";
import { supabase } from "./supabaseClient";

export type MenuItem = MenuItemSummary;
export type MenuSection = MenuSectionWithItems;
export type Menu = MenuWithSections;

export async function fetchVenueMenus(venueId: string): Promise<Menu[]> {
  return fetchSharedVenueMenus(venueId, { supabase });
}
