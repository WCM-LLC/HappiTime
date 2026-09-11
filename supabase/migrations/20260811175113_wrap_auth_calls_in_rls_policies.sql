-- Fix all 97 auth_rls_initplan performance advisor warnings.
--
-- Wraps bare auth.uid()/auth.email() calls in RLS policy expressions in
-- scalar subselects — (select auth.uid()) — so Postgres evaluates them once
-- per statement (InitPlan) instead of once per row. Semantics are identical;
-- only evaluation frequency changes.
--
-- Generated from live pg_policies definitions (not from migration files) so
-- each ALTER POLICY carries the exact current expression with calls wrapped.
-- ALTER POLICY preserves each policy's command, permissive mode, and roles.
-- Verified at generation time: 97 statements, 123 wrapped calls, zero bare
-- auth.* calls remaining in the output.

alter policy "checkins_select_self_or_org" on public.checkins
  using (((user_id = (select auth.uid())) OR (EXISTS ( SELECT 1
   FROM (venues v
     JOIN org_members om ON ((om.org_id = v.org_id)))
  WHERE ((v.id = checkins.venue_id) AND (om.user_id = (select auth.uid())))))));

alter policy "Authenticated users read own events" on public.directory_events
  using ((user_id = (select auth.uid())));

alter policy "event_media_insert" on public.event_media
  with check ((EXISTS ( SELECT 1
   FROM (venue_events ve
     JOIN venue_members vm ON ((vm.venue_id = ve.venue_id)))
  WHERE ((ve.id = event_media.event_id) AND (vm.user_id = (select auth.uid()))))));

alter policy "guide_submissions_insert_own" on public.guide_submissions
  with check (((submitted_by = (select auth.uid())) AND is_happitime_super_user() AND (EXISTS ( SELECT 1
   FROM guides g
  WHERE ((g.id = guide_submissions.guide_id) AND (g.author_id = (select auth.uid())))))));

alter policy "guide_submissions_select_own" on public.guide_submissions
  using ((is_happitime_super_user() AND (EXISTS ( SELECT 1
   FROM guides g
  WHERE ((g.id = guide_submissions.guide_id) AND (g.author_id = (select auth.uid())))))));

alter policy "guides_delete_own" on public.guides
  using (((author_id = (select auth.uid())) AND is_happitime_super_user()));

alter policy "guides_insert_own" on public.guides
  with check (((author_id = (select auth.uid())) AND is_happitime_super_user() AND (status = 'draft'::text)));

alter policy "guides_select_own" on public.guides
  using (((author_id = (select auth.uid())) AND is_happitime_super_user()));

alter policy "guides_update_own" on public.guides
  using (((author_id = (select auth.uid())) AND is_happitime_super_user()))
  with check (((author_id = (select auth.uid())) AND is_happitime_super_user() AND (status = ANY (ARRAY['draft'::text, 'pending_review'::text, 'archived'::text]))));

alter policy "hh_delete" on public.happy_hour_windows
  using ((EXISTS ( SELECT 1
   FROM (venues v
     JOIN org_members m ON ((m.org_id = v.org_id)))
  WHERE ((v.id = happy_hour_windows.venue_id) AND (m.user_id = (select auth.uid()))))));

alter policy "hh_delete_for_org_members" on public.happy_hour_windows
  using ((EXISTS ( SELECT 1
   FROM (venues v
     JOIN org_members m ON ((m.org_id = v.org_id)))
  WHERE ((v.id = happy_hour_windows.venue_id) AND (m.user_id = (select auth.uid()))))));

alter policy "hh_delete_members" on public.happy_hour_windows
  using ((EXISTS ( SELECT 1
   FROM (venues v
     JOIN org_members m ON ((m.org_id = v.org_id)))
  WHERE ((v.id = happy_hour_windows.venue_id) AND (m.user_id = (select auth.uid()))))));

alter policy "hh_insert" on public.happy_hour_windows
  with check ((EXISTS ( SELECT 1
   FROM (venues v
     JOIN org_members m ON ((m.org_id = v.org_id)))
  WHERE ((v.id = happy_hour_windows.venue_id) AND (m.user_id = (select auth.uid()))))));

alter policy "hh_insert_for_org_members" on public.happy_hour_windows
  with check ((EXISTS ( SELECT 1
   FROM (venues v
     JOIN org_members m ON ((m.org_id = v.org_id)))
  WHERE ((v.id = happy_hour_windows.venue_id) AND (m.user_id = (select auth.uid()))))));

alter policy "hh_insert_members" on public.happy_hour_windows
  with check ((EXISTS ( SELECT 1
   FROM (venues v
     JOIN org_members m ON ((m.org_id = v.org_id)))
  WHERE ((v.id = happy_hour_windows.venue_id) AND (m.user_id = (select auth.uid()))))));

alter policy "hh_select" on public.happy_hour_windows
  using ((EXISTS ( SELECT 1
   FROM (venues v
     JOIN org_members m ON ((m.org_id = v.org_id)))
  WHERE ((v.id = happy_hour_windows.venue_id) AND (m.user_id = (select auth.uid()))))));

alter policy "hh_select_for_org_members" on public.happy_hour_windows
  using ((EXISTS ( SELECT 1
   FROM (venues v
     JOIN org_members m ON ((m.org_id = v.org_id)))
  WHERE ((v.id = happy_hour_windows.venue_id) AND (m.user_id = (select auth.uid()))))));

alter policy "hh_select_members" on public.happy_hour_windows
  using ((EXISTS ( SELECT 1
   FROM (venues v
     JOIN org_members m ON ((m.org_id = v.org_id)))
  WHERE ((v.id = happy_hour_windows.venue_id) AND (m.user_id = (select auth.uid()))))));

alter policy "hh_update" on public.happy_hour_windows
  using ((EXISTS ( SELECT 1
   FROM (venues v
     JOIN org_members m ON ((m.org_id = v.org_id)))
  WHERE ((v.id = happy_hour_windows.venue_id) AND (m.user_id = (select auth.uid()))))))
  with check ((EXISTS ( SELECT 1
   FROM (venues v
     JOIN org_members m ON ((m.org_id = v.org_id)))
  WHERE ((v.id = happy_hour_windows.venue_id) AND (m.user_id = (select auth.uid()))))));

alter policy "hh_update_for_org_members" on public.happy_hour_windows
  using ((EXISTS ( SELECT 1
   FROM (venues v
     JOIN org_members m ON ((m.org_id = v.org_id)))
  WHERE ((v.id = happy_hour_windows.venue_id) AND (m.user_id = (select auth.uid()))))))
  with check ((EXISTS ( SELECT 1
   FROM (venues v
     JOIN org_members m ON ((m.org_id = v.org_id)))
  WHERE ((v.id = happy_hour_windows.venue_id) AND (m.user_id = (select auth.uid()))))));

alter policy "hh_update_members" on public.happy_hour_windows
  using ((EXISTS ( SELECT 1
   FROM (venues v
     JOIN org_members m ON ((m.org_id = v.org_id)))
  WHERE ((v.id = happy_hour_windows.venue_id) AND (m.user_id = (select auth.uid()))))))
  with check ((EXISTS ( SELECT 1
   FROM (venues v
     JOIN org_members m ON ((m.org_id = v.org_id)))
  WHERE ((v.id = happy_hour_windows.venue_id) AND (m.user_id = (select auth.uid()))))));

alter policy "listing_reports_insert_self" on public.listing_reports
  with check ((user_id = (select auth.uid())));

alter policy "listing_reports_select_self_or_org" on public.listing_reports
  using (((user_id = (select auth.uid())) OR (EXISTS ( SELECT 1
   FROM (venues v
     JOIN org_members om ON ((om.org_id = v.org_id)))
  WHERE ((v.id = listing_reports.venue_id) AND (om.user_id = (select auth.uid())))))));

alter policy "menu_items_select_org_members" on public.menu_items
  using ((EXISTS ( SELECT 1
   FROM (((menu_sections s
     JOIN menus mn ON ((mn.id = s.menu_id)))
     JOIN venues v ON ((v.id = mn.venue_id)))
     JOIN org_members m ON ((m.org_id = v.org_id)))
  WHERE ((s.id = menu_items.section_id) AND (m.user_id = (select auth.uid()))))));

alter policy "menu_items_write_org_editors" on public.menu_items
  using ((EXISTS ( SELECT 1
   FROM (((menu_sections s
     JOIN menus mn ON ((mn.id = s.menu_id)))
     JOIN venues v ON ((v.id = mn.venue_id)))
     JOIN org_members m ON ((m.org_id = v.org_id)))
  WHERE ((s.id = menu_items.section_id) AND (m.user_id = (select auth.uid())) AND (m.role = ANY (ARRAY['owner'::text, 'admin'::text, 'editor'::text]))))))
  with check ((EXISTS ( SELECT 1
   FROM (((menu_sections s
     JOIN menus mn ON ((mn.id = s.menu_id)))
     JOIN venues v ON ((v.id = mn.venue_id)))
     JOIN org_members m ON ((m.org_id = v.org_id)))
  WHERE ((s.id = menu_items.section_id) AND (m.user_id = (select auth.uid())) AND (m.role = ANY (ARRAY['owner'::text, 'admin'::text, 'editor'::text]))))));

alter policy "menu_sections_select_org_members" on public.menu_sections
  using ((EXISTS ( SELECT 1
   FROM ((menus mn
     JOIN venues v ON ((v.id = mn.venue_id)))
     JOIN org_members m ON ((m.org_id = v.org_id)))
  WHERE ((mn.id = menu_sections.menu_id) AND (m.user_id = (select auth.uid()))))));

alter policy "menu_sections_write_org_editors" on public.menu_sections
  using ((EXISTS ( SELECT 1
   FROM ((menus mn
     JOIN venues v ON ((v.id = mn.venue_id)))
     JOIN org_members m ON ((m.org_id = v.org_id)))
  WHERE ((mn.id = menu_sections.menu_id) AND (m.user_id = (select auth.uid())) AND (m.role = ANY (ARRAY['owner'::text, 'admin'::text, 'editor'::text]))))))
  with check ((EXISTS ( SELECT 1
   FROM ((menus mn
     JOIN venues v ON ((v.id = mn.venue_id)))
     JOIN org_members m ON ((m.org_id = v.org_id)))
  WHERE ((mn.id = menu_sections.menu_id) AND (m.user_id = (select auth.uid())) AND (m.role = ANY (ARRAY['owner'::text, 'admin'::text, 'editor'::text]))))));

alter policy "menus_insert_org_editors" on public.menus
  with check ((EXISTS ( SELECT 1
   FROM (venues v
     JOIN org_members m ON ((m.org_id = v.org_id)))
  WHERE ((v.id = menus.venue_id) AND (m.user_id = (select auth.uid())) AND (m.role = ANY (ARRAY['owner'::text, 'admin'::text, 'editor'::text]))))));

alter policy "menus_select_org_members" on public.menus
  using ((EXISTS ( SELECT 1
   FROM (venues v
     JOIN org_members m ON ((m.org_id = v.org_id)))
  WHERE ((v.id = menus.venue_id) AND (m.user_id = (select auth.uid()))))));

alter policy "menus_update_org_editors" on public.menus
  using ((EXISTS ( SELECT 1
   FROM (venues v
     JOIN org_members m ON ((m.org_id = v.org_id)))
  WHERE ((v.id = menus.venue_id) AND (m.user_id = (select auth.uid())) AND (m.role = ANY (ARRAY['owner'::text, 'admin'::text, 'editor'::text]))))))
  with check ((EXISTS ( SELECT 1
   FROM (venues v
     JOIN org_members m ON ((m.org_id = v.org_id)))
  WHERE ((v.id = menus.venue_id) AND (m.user_id = (select auth.uid())) AND (m.role = ANY (ARRAY['owner'::text, 'admin'::text, 'editor'::text]))))));

alter policy "Service role manages neighborhoods" on public.neighborhoods
  using (((select auth.role()) = 'service_role'::text))
  with check (((select auth.role()) = 'service_role'::text));

alter policy "org_members_insert_creator_or_owner" on public.org_members
  with check (((EXISTS ( SELECT 1
   FROM organizations o
  WHERE ((o.id = org_members.org_id) AND (o.created_by = (select auth.uid()))))) OR is_org_owner(org_id)));

alter policy "org_members_select" on public.org_members
  using (((user_id = (select auth.uid())) OR is_org_owner(org_id)));

alter policy "org_members_select_self" on public.org_members
  using ((user_id = (select auth.uid())));

alter policy "org_subscriptions_select_org_member" on public.org_subscriptions
  using ((EXISTS ( SELECT 1
   FROM org_members om
  WHERE ((om.org_id = org_subscriptions.org_id) AND (om.user_id = (select auth.uid()))))));

alter policy "pfi_insert_own" on public.pending_friend_invites
  with check ((inviter_id = (select auth.uid())));

alter policy "pfi_select_invitee" on public.pending_friend_invites
  using ((lower(invitee_email) = lower((select auth.email()))));

alter policy "pfi_select_inviter" on public.pending_friend_invites
  using ((inviter_id = (select auth.uid())));

alter policy "pfi_update_cancel" on public.pending_friend_invites
  using (((inviter_id = (select auth.uid())) AND (status = 'pending'::text)))
  with check (((inviter_id = (select auth.uid())) AND (status = 'cancelled'::text)));

alter policy "round_redemptions_select_self_or_org" on public.round_redemptions
  using (((user_id = (select auth.uid())) OR (EXISTS ( SELECT 1
   FROM (venues v
     JOIN org_members om ON ((om.org_id = v.org_id)))
  WHERE ((v.id = round_redemptions.venue_id) AND (om.user_id = (select auth.uid())))))));

alter policy "suce_select_own" on public.super_user_credit_events
  using (((super_user_id = (select auth.uid())) OR is_happitime_admin()));

alter policy "user_events_insert_owner" on public.user_events
  with check ((user_id = (select auth.uid())));

alter policy "user_events_select_owner_or_public_activity" on public.user_events
  using (((user_id = (select auth.uid())) OR ((event_type = ANY (ARRAY['auto_checkin'::text, 'venue_checkin'::text, 'itinerary_share'::text, 'rating'::text, 'comment'::text, 'follow'::text])) AND (COALESCE((meta ->> 'is_private'::text), 'false'::text) = 'false'::text) AND ((venue_id IS NULL) OR (EXISTS ( SELECT 1
   FROM venues v
  WHERE ((v.id = user_events.venue_id) AND (v.status = 'published'::text))))))));

alter policy "user_followed_venues_delete_owner" on public.user_followed_venues
  using ((user_id = (select auth.uid())));

alter policy "user_followed_venues_insert_owner" on public.user_followed_venues
  with check ((user_id = (select auth.uid())));

alter policy "user_followed_venues_select_owner" on public.user_followed_venues
  using ((user_id = (select auth.uid())));

alter policy "user_follows_delete_related" on public.user_follows
  using (((follower_id = (select auth.uid())) OR (following_user_id = (select auth.uid()))));

alter policy "user_follows_insert_owner" on public.user_follows
  with check (((follower_id = (select auth.uid())) AND (follower_id <> following_user_id)));

alter policy "user_follows_select_related" on public.user_follows
  using (((follower_id = (select auth.uid())) OR (following_user_id = (select auth.uid()))));

alter policy "user_follows_update_target_accept" on public.user_follows
  using ((following_user_id = (select auth.uid())))
  with check (((following_user_id = (select auth.uid())) AND (status = 'accepted'::text)));

alter policy "user_list_items_delete_owner" on public.user_list_items
  using ((EXISTS ( SELECT 1
   FROM user_lists l
  WHERE ((l.id = user_list_items.list_id) AND (l.user_id = (select auth.uid()))))));

alter policy "user_list_items_insert_owner" on public.user_list_items
  with check ((EXISTS ( SELECT 1
   FROM user_lists l
  WHERE ((l.id = user_list_items.list_id) AND (l.user_id = (select auth.uid()))))));

alter policy "user_list_items_select_owner_or_public" on public.user_list_items
  using (((EXISTS ( SELECT 1
   FROM user_lists l
  WHERE ((l.id = user_list_items.list_id) AND ((l.user_id = (select auth.uid())) OR (l.visibility = 'public'::text))))) OR itinerary_shared_with_me(list_id)));

alter policy "user_list_items_update_owner" on public.user_list_items
  using ((EXISTS ( SELECT 1
   FROM user_lists l
  WHERE ((l.id = user_list_items.list_id) AND (l.user_id = (select auth.uid()))))))
  with check ((EXISTS ( SELECT 1
   FROM user_lists l
  WHERE ((l.id = user_list_items.list_id) AND (l.user_id = (select auth.uid()))))));

alter policy "user_lists_delete_owner" on public.user_lists
  using ((user_id = (select auth.uid())));

alter policy "user_lists_insert_owner" on public.user_lists
  with check ((user_id = (select auth.uid())));

alter policy "user_lists_select_owner_or_public" on public.user_lists
  using (((user_id = (select auth.uid())) OR (visibility = 'public'::text) OR itinerary_shared_with_me(id)));

alter policy "user_lists_update_owner" on public.user_lists
  using ((user_id = (select auth.uid())))
  with check ((user_id = (select auth.uid())));

alter policy "user_notifications_select_own" on public.user_notifications
  using ((user_id = (select auth.uid())));

alter policy "user_notifications_update_own" on public.user_notifications
  using ((user_id = (select auth.uid())))
  with check ((user_id = (select auth.uid())));

alter policy "user_plans_select_owner" on public.user_plans
  using ((user_id = (select auth.uid())));

alter policy "user_preferences_delete_owner" on public.user_preferences
  using ((user_id = (select auth.uid())));

alter policy "user_preferences_insert_owner" on public.user_preferences
  with check ((user_id = (select auth.uid())));

alter policy "user_preferences_select_owner" on public.user_preferences
  using ((user_id = (select auth.uid())));

alter policy "user_preferences_update_owner" on public.user_preferences
  using ((user_id = (select auth.uid())))
  with check ((user_id = (select auth.uid())));

alter policy "user_profiles_delete_owner" on public.user_profiles
  using ((user_id = (select auth.uid())));

alter policy "user_profiles_insert_owner" on public.user_profiles
  with check ((user_id = (select auth.uid())));

alter policy "user_profiles_select_owner_or_public" on public.user_profiles
  using (((user_id = (select auth.uid())) OR (is_public = true)));

alter policy "user_profiles_update_owner" on public.user_profiles
  using ((user_id = (select auth.uid())))
  with check ((user_id = (select auth.uid())));

alter policy "Users can delete their push tokens" on public.user_push_tokens
  using (((select auth.uid()) = user_id));

alter policy "Users can insert their push tokens" on public.user_push_tokens
  with check (((select auth.uid()) = user_id));

alter policy "Users can update their push tokens" on public.user_push_tokens
  using (((select auth.uid()) = user_id))
  with check (((select auth.uid()) = user_id));

alter policy "Users can view their push tokens" on public.user_push_tokens
  using (((select auth.uid()) = user_id));

alter policy "user_referrals_select_related" on public.user_referrals
  using (((referee_user_id = (select auth.uid())) OR (referrer_user_id = (select auth.uid()))));

alter policy "users_manage_own_notification_blocks" on public.user_venue_notification_blocks
  using (((select auth.uid()) = user_id))
  with check (((select auth.uid()) = user_id));

alter policy "venue_attribution_events_select_org_member" on public.venue_attribution_events
  using ((EXISTS ( SELECT 1
   FROM (venues v
     JOIN org_members om ON ((om.org_id = v.org_id)))
  WHERE ((v.id = venue_attribution_events.venue_id) AND (om.user_id = (select auth.uid()))))));

alter policy "Org members can manage events" on public.venue_events
  using ((EXISTS ( SELECT 1
   FROM (venues v
     JOIN org_members om ON ((om.org_id = v.org_id)))
  WHERE ((v.id = venue_events.venue_id) AND (om.user_id = (select auth.uid()))))));

alter policy "venue_events_delete" on public.venue_events
  using ((EXISTS ( SELECT 1
   FROM venue_members
  WHERE ((venue_members.venue_id = venue_events.venue_id) AND (venue_members.user_id = (select auth.uid()))))));

alter policy "venue_events_insert" on public.venue_events
  with check ((EXISTS ( SELECT 1
   FROM venue_members
  WHERE ((venue_members.venue_id = venue_events.venue_id) AND (venue_members.user_id = (select auth.uid()))))));

alter policy "venue_events_update" on public.venue_events
  using ((EXISTS ( SELECT 1
   FROM venue_members
  WHERE ((venue_members.venue_id = venue_events.venue_id) AND (venue_members.user_id = (select auth.uid()))))));

alter policy "venue_flags_select_org" on public.venue_flags
  using ((EXISTS ( SELECT 1
   FROM (venues v
     JOIN org_members om ON ((om.org_id = v.org_id)))
  WHERE ((v.id = venue_flags.venue_id) AND (om.user_id = (select auth.uid()))))));

alter policy "venue_members_select" on public.venue_members
  using ((is_org_owner(org_id) OR (user_id = (select auth.uid()))));

alter policy "venue_subscriptions_select_org_member" on public.venue_subscriptions
  using ((EXISTS ( SELECT 1
   FROM (venues v
     JOIN org_members om ON ((om.org_id = v.org_id)))
  WHERE ((v.id = venue_subscriptions.venue_id) AND (om.user_id = (select auth.uid()))))));

alter policy "Org members can manage venue tags" on public.venue_tags
  using ((EXISTS ( SELECT 1
   FROM (venues v
     JOIN org_members om ON ((om.org_id = v.org_id)))
  WHERE ((v.id = venue_tags.venue_id) AND (om.user_id = (select auth.uid()))))));

alter policy "venue_tags_delete" on public.venue_tags
  using ((EXISTS ( SELECT 1
   FROM venue_members
  WHERE ((venue_members.venue_id = venue_tags.venue_id) AND (venue_members.user_id = (select auth.uid()))))));

alter policy "venue_tags_insert" on public.venue_tags
  with check ((EXISTS ( SELECT 1
   FROM venue_members
  WHERE ((venue_members.venue_id = venue_tags.venue_id) AND (venue_members.user_id = (select auth.uid()))))));

alter policy "venue_visits_delete_owner" on public.venue_visits
  using ((user_id = (select auth.uid())));

alter policy "venue_visits_friends_select" on public.venue_visits
  using (((EXISTS ( SELECT 1
   FROM user_follows
  WHERE ((user_follows.follower_id = (select auth.uid())) AND (user_follows.following_user_id = venue_visits.user_id) AND (user_follows.status = 'accepted'::text)))) AND (EXISTS ( SELECT 1
   FROM venues
  WHERE ((venues.id = venue_visits.venue_id) AND (venues.promotion_tier IS NOT NULL))))));

alter policy "venue_visits_insert" on public.venue_visits
  with check (((select auth.uid()) = user_id));

alter policy "venue_visits_insert_owner" on public.venue_visits
  with check ((user_id = (select auth.uid())));

alter policy "venue_visits_select" on public.venue_visits
  using (((select auth.uid()) = user_id));

alter policy "venue_visits_select_owner_or_visible" on public.venue_visits
  using (((user_id = (select auth.uid())) OR ((is_private = false) AND (EXISTS ( SELECT 1
   FROM venues v
  WHERE ((v.id = venue_visits.venue_id) AND (v.status = 'published'::text)))))));

alter policy "venue_visits_update" on public.venue_visits
  using (((select auth.uid()) = user_id));

alter policy "venue_visits_update_owner" on public.venue_visits
  using ((user_id = (select auth.uid())))
  with check ((user_id = (select auth.uid())));

alter policy "venues_insert_org_members" on public.venues
  with check ((EXISTS ( SELECT 1
   FROM org_members m
  WHERE ((m.org_id = venues.org_id) AND (m.user_id = (select auth.uid())) AND (m.role = ANY (ARRAY['owner'::text, 'admin'::text, 'editor'::text]))))));

alter policy "venues_select_org_members" on public.venues
  using ((EXISTS ( SELECT 1
   FROM org_members m
  WHERE ((m.org_id = venues.org_id) AND (m.user_id = (select auth.uid()))))));

alter policy "venues_update_org_members" on public.venues
  using ((EXISTS ( SELECT 1
   FROM org_members m
  WHERE ((m.org_id = venues.org_id) AND (m.user_id = (select auth.uid())) AND (m.role = ANY (ARRAY['owner'::text, 'admin'::text, 'editor'::text]))))))
  with check ((EXISTS ( SELECT 1
   FROM org_members m
  WHERE ((m.org_id = venues.org_id) AND (m.user_id = (select auth.uid())) AND (m.role = ANY (ARRAY['owner'::text, 'admin'::text, 'editor'::text]))))));
