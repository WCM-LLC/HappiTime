-- Drop 31 redundant permissive RLS policies (multiple_permissive_policies
-- advisor batch, phase 1: pure subsumption).
--
-- Every dropped policy is fully subsumed by a kept policy on the same table:
-- identical USING expression, identical effective WITH CHECK (accounting for
-- pg's fallback of omitted WITH CHECK to USING), and role/command coverage
-- contained in the keeper's. Since permissive policies OR together, dropping
-- a subsumed policy cannot change any row's visibility or writability --
-- this is dead-weight removal from layered migrations (hh_* triplicates,
-- per-table *_admin_all blankets duplicating platform_admin_all, legacy
-- org_*/organizations_* pairs).
--
-- Generated from live pg_policies by subsumption analysis; keeper recorded
-- per statement. Phase 2 (folding the platform_admin_all blanket into
-- per-action policies to fully clear the advisor warnings) is a separate,
-- larger restructure and intentionally NOT part of this migration.

drop policy "approved_tags_admin_all" on public.approved_tags;  -- subsumed by "platform_admin_all"
drop policy "event_media_admin_all" on public.event_media;  -- subsumed by "platform_admin_all"
drop policy "happy_hour_offers_admin_all" on public.happy_hour_offers;  -- subsumed by "platform_admin_all"
drop policy "happy_hour_window_menus_admin_all" on public.happy_hour_window_menus;  -- subsumed by "platform_admin_all"
drop policy "happy_hour_windows_admin_all" on public.happy_hour_windows;  -- subsumed by "platform_admin_all"
drop policy "hh_delete_for_org_members" on public.happy_hour_windows;  -- subsumed by "hh_delete"
drop policy "hh_delete_members" on public.happy_hour_windows;  -- subsumed by "hh_delete"
drop policy "hh_insert_for_org_members" on public.happy_hour_windows;  -- subsumed by "hh_insert"
drop policy "hh_insert_members" on public.happy_hour_windows;  -- subsumed by "hh_insert"
drop policy "hh_select_for_org_members" on public.happy_hour_windows;  -- subsumed by "hh_select"
drop policy "hh_select_members" on public.happy_hour_windows;  -- subsumed by "hh_select"
drop policy "hh_update_for_org_members" on public.happy_hour_windows;  -- subsumed by "hh_update"
drop policy "hh_update_members" on public.happy_hour_windows;  -- subsumed by "hh_update"
drop policy "menu_items_admin_all" on public.menu_items;  -- subsumed by "platform_admin_all"
drop policy "menu_sections_admin_all" on public.menu_sections;  -- subsumed by "platform_admin_all"
drop policy "menus_admin_all" on public.menus;  -- subsumed by "platform_admin_all"
drop policy "org_invites_delete_owner" on public.org_invites;  -- subsumed by "org_invites_owner_all"
drop policy "org_invites_select_owner" on public.org_invites;  -- subsumed by "org_invites_owner_all"
drop policy "org_invites_update_owner" on public.org_invites;  -- subsumed by "org_invites_owner_all"
drop policy "org_members_admin_all" on public.org_members;  -- subsumed by "platform_admin_all"
drop policy "organizations_admin_all" on public.organizations;  -- subsumed by "platform_admin_all"
drop policy "organizations_delete_owner" on public.organizations;  -- subsumed by "org_delete_owner"
drop policy "organizations_select_member" on public.organizations;  -- subsumed by "org_select_members"
drop policy "organizations_update_owner" on public.organizations;  -- subsumed by "org_update_owner"
drop policy "venue_events_admin_all" on public.venue_events;  -- subsumed by "platform_admin_all"
drop policy "venue_media_admin_all" on public.venue_media;  -- subsumed by "platform_admin_all"
drop policy "venue_media_select_authenticated_public" on public.venue_media;  -- subsumed by "venue_media_select_public"
drop policy "venue_members_admin_all" on public.venue_members;  -- subsumed by "platform_admin_all"
drop policy "venue_tags_admin_all" on public.venue_tags;  -- subsumed by "platform_admin_all"
drop policy "venues_admin_all" on public.venues;  -- subsumed by "platform_admin_all"
drop policy "venues_select_authenticated_public" on public.venues;  -- subsumed by "venues_select_public"
