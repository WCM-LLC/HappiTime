-- Schema-drift reconciliation, Stage 6b: capture out-of-band RLS policies on live tables,
-- and harden the public read surface. Plan: docs/superpowers/.../2026-06-01-schema-drift-reconciliation.md
--
-- 64 scoped owner/org/admin policies (out-of-band on prod, never committed) are captured
-- verbatim so a fresh replay reproduces prod's intended RLS. SECURITY REVIEW found NO write
-- exposure (all writes scoped). The 10 broad `SELECT USING(true)` "read-all" policies that
-- leaked draft/non-published content to anon (verified: 65 draft venues visible) are DROPPED;
-- the 6 tables with an existing published-scoped policy fall back to it, and venue_tags +
-- event_media get new published-scoped policies. Idempotent (drop-then-create / drop if exists).

-- ── 64 scoped policies captured verbatim from prod (drop-then-create) ─────────────
drop policy if exists "approved_tags_admin_all" on public."approved_tags";
CREATE POLICY "approved_tags_admin_all" ON "public"."approved_tags" TO "authenticated" USING ("public"."is_platform_admin"()) WITH CHECK ("public"."is_platform_admin"());
drop policy if exists "event_media_admin_all" on public."event_media";
CREATE POLICY "event_media_admin_all" ON "public"."event_media" TO "authenticated" USING ("public"."is_platform_admin"()) WITH CHECK ("public"."is_platform_admin"());
drop policy if exists "event_media_insert" on public."event_media";
CREATE POLICY "event_media_insert" ON "public"."event_media" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1 FROM ("public"."venue_events" "ve" JOIN "public"."venue_members" "vm" ON (("vm"."venue_id" = "ve"."venue_id"))) WHERE (("ve"."id" = "event_media"."event_id") AND ("vm"."user_id" = "auth"."uid"())))));
drop policy if exists "happy_hour_offers_admin_all" on public."happy_hour_offers";
CREATE POLICY "happy_hour_offers_admin_all" ON "public"."happy_hour_offers" TO "authenticated" USING ("public"."is_platform_admin"()) WITH CHECK ("public"."is_platform_admin"());
drop policy if exists "happy_hour_window_menus_admin_all" on public."happy_hour_window_menus";
CREATE POLICY "happy_hour_window_menus_admin_all" ON "public"."happy_hour_window_menus" TO "authenticated" USING ("public"."is_platform_admin"()) WITH CHECK ("public"."is_platform_admin"());
drop policy if exists "happy_hour_windows_admin_all" on public."happy_hour_windows";
CREATE POLICY "happy_hour_windows_admin_all" ON "public"."happy_hour_windows" TO "authenticated" USING ("public"."is_platform_admin"()) WITH CHECK ("public"."is_platform_admin"());
drop policy if exists "hh_delete" on public."happy_hour_windows";
CREATE POLICY "hh_delete" ON "public"."happy_hour_windows" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1 FROM ("public"."venues" "v" JOIN "public"."org_members" "m" ON (("m"."org_id" = "v"."org_id"))) WHERE (("v"."id" = "happy_hour_windows"."venue_id") AND ("m"."user_id" = "auth"."uid"())))));
drop policy if exists "hh_delete_for_org_members" on public."happy_hour_windows";
CREATE POLICY "hh_delete_for_org_members" ON "public"."happy_hour_windows" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1 FROM ("public"."venues" "v" JOIN "public"."org_members" "m" ON (("m"."org_id" = "v"."org_id"))) WHERE (("v"."id" = "happy_hour_windows"."venue_id") AND ("m"."user_id" = "auth"."uid"())))));
drop policy if exists "hh_delete_members" on public."happy_hour_windows";
CREATE POLICY "hh_delete_members" ON "public"."happy_hour_windows" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1 FROM ("public"."venues" "v" JOIN "public"."org_members" "m" ON (("m"."org_id" = "v"."org_id"))) WHERE (("v"."id" = "happy_hour_windows"."venue_id") AND ("m"."user_id" = "auth"."uid"())))));
drop policy if exists "hh_insert" on public."happy_hour_windows";
CREATE POLICY "hh_insert" ON "public"."happy_hour_windows" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1 FROM ("public"."venues" "v" JOIN "public"."org_members" "m" ON (("m"."org_id" = "v"."org_id"))) WHERE (("v"."id" = "happy_hour_windows"."venue_id") AND ("m"."user_id" = "auth"."uid"())))));
drop policy if exists "hh_insert_for_org_members" on public."happy_hour_windows";
CREATE POLICY "hh_insert_for_org_members" ON "public"."happy_hour_windows" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1 FROM ("public"."venues" "v" JOIN "public"."org_members" "m" ON (("m"."org_id" = "v"."org_id"))) WHERE (("v"."id" = "happy_hour_windows"."venue_id") AND ("m"."user_id" = "auth"."uid"())))));
drop policy if exists "hh_insert_members" on public."happy_hour_windows";
CREATE POLICY "hh_insert_members" ON "public"."happy_hour_windows" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1 FROM ("public"."venues" "v" JOIN "public"."org_members" "m" ON (("m"."org_id" = "v"."org_id"))) WHERE (("v"."id" = "happy_hour_windows"."venue_id") AND ("m"."user_id" = "auth"."uid"())))));
drop policy if exists "hh_public_read_published" on public."happy_hour_windows";
CREATE POLICY "hh_public_read_published" ON "public"."happy_hour_windows" FOR SELECT TO "authenticated", "anon" USING (("lower"("status") = 'published'::"text"));
drop policy if exists "hh_select" on public."happy_hour_windows";
CREATE POLICY "hh_select" ON "public"."happy_hour_windows" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1 FROM ("public"."venues" "v" JOIN "public"."org_members" "m" ON (("m"."org_id" = "v"."org_id"))) WHERE (("v"."id" = "happy_hour_windows"."venue_id") AND ("m"."user_id" = "auth"."uid"())))));
drop policy if exists "hh_select_for_org_members" on public."happy_hour_windows";
CREATE POLICY "hh_select_for_org_members" ON "public"."happy_hour_windows" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1 FROM ("public"."venues" "v" JOIN "public"."org_members" "m" ON (("m"."org_id" = "v"."org_id"))) WHERE (("v"."id" = "happy_hour_windows"."venue_id") AND ("m"."user_id" = "auth"."uid"())))));
drop policy if exists "hh_select_members" on public."happy_hour_windows";
CREATE POLICY "hh_select_members" ON "public"."happy_hour_windows" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1 FROM ("public"."venues" "v" JOIN "public"."org_members" "m" ON (("m"."org_id" = "v"."org_id"))) WHERE (("v"."id" = "happy_hour_windows"."venue_id") AND ("m"."user_id" = "auth"."uid"())))));
drop policy if exists "hh_update" on public."happy_hour_windows";
CREATE POLICY "hh_update" ON "public"."happy_hour_windows" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1 FROM ("public"."venues" "v" JOIN "public"."org_members" "m" ON (("m"."org_id" = "v"."org_id"))) WHERE (("v"."id" = "happy_hour_windows"."venue_id") AND ("m"."user_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1 FROM ("public"."venues" "v" JOIN "public"."org_members" "m" ON (("m"."org_id" = "v"."org_id"))) WHERE (("v"."id" = "happy_hour_windows"."venue_id") AND ("m"."user_id" = "auth"."uid"())))));
drop policy if exists "hh_update_for_org_members" on public."happy_hour_windows";
CREATE POLICY "hh_update_for_org_members" ON "public"."happy_hour_windows" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1 FROM ("public"."venues" "v" JOIN "public"."org_members" "m" ON (("m"."org_id" = "v"."org_id"))) WHERE (("v"."id" = "happy_hour_windows"."venue_id") AND ("m"."user_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1 FROM ("public"."venues" "v" JOIN "public"."org_members" "m" ON (("m"."org_id" = "v"."org_id"))) WHERE (("v"."id" = "happy_hour_windows"."venue_id") AND ("m"."user_id" = "auth"."uid"())))));
drop policy if exists "hh_update_members" on public."happy_hour_windows";
CREATE POLICY "hh_update_members" ON "public"."happy_hour_windows" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1 FROM ("public"."venues" "v" JOIN "public"."org_members" "m" ON (("m"."org_id" = "v"."org_id"))) WHERE (("v"."id" = "happy_hour_windows"."venue_id") AND ("m"."user_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1 FROM ("public"."venues" "v" JOIN "public"."org_members" "m" ON (("m"."org_id" = "v"."org_id"))) WHERE (("v"."id" = "happy_hour_windows"."venue_id") AND ("m"."user_id" = "auth"."uid"())))));
drop policy if exists "menu_items_admin_all" on public."menu_items";
CREATE POLICY "menu_items_admin_all" ON "public"."menu_items" TO "authenticated" USING ("public"."is_platform_admin"()) WITH CHECK ("public"."is_platform_admin"());
drop policy if exists "menu_items_delete_owner_manager_host" on public."menu_items";
CREATE POLICY "menu_items_delete_owner_manager_host" ON "public"."menu_items" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1 FROM (("public"."menu_sections" "s" JOIN "public"."menus" "mn" ON (("mn"."id" = "s"."menu_id"))) JOIN "public"."venues" "v" ON (("v"."id" = "mn"."venue_id"))) WHERE (("s"."id" = "menu_items"."section_id") AND ("public"."is_org_owner"("v"."org_id") OR ("public"."is_org_manager"("v"."org_id") AND "public"."has_venue_assignment"("v"."id")) OR ("public"."is_org_host"("v"."org_id") AND "public"."has_venue_assignment"("v"."id")))))));
drop policy if exists "menu_items_insert_owner_manager_host" on public."menu_items";
CREATE POLICY "menu_items_insert_owner_manager_host" ON "public"."menu_items" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1 FROM (("public"."menu_sections" "s" JOIN "public"."menus" "mn" ON (("mn"."id" = "s"."menu_id"))) JOIN "public"."venues" "v" ON (("v"."id" = "mn"."venue_id"))) WHERE (("s"."id" = "menu_items"."section_id") AND ("public"."is_org_owner"("v"."org_id") OR ("public"."is_org_manager"("v"."org_id") AND "public"."has_venue_assignment"("v"."id")) OR ("public"."is_org_host"("v"."org_id") AND "public"."has_venue_assignment"("v"."id")))))));
drop policy if exists "menu_items_select_org_members" on public."menu_items";
CREATE POLICY "menu_items_select_org_members" ON "public"."menu_items" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1 FROM ((("public"."menu_sections" "s" JOIN "public"."menus" "mn" ON (("mn"."id" = "s"."menu_id"))) JOIN "public"."venues" "v" ON (("v"."id" = "mn"."venue_id"))) JOIN "public"."org_members" "m" ON (("m"."org_id" = "v"."org_id"))) WHERE (("s"."id" = "menu_items"."section_id") AND ("m"."user_id" = "auth"."uid"())))));
drop policy if exists "menu_items_update_owner_manager_host" on public."menu_items";
CREATE POLICY "menu_items_update_owner_manager_host" ON "public"."menu_items" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1 FROM (("public"."menu_sections" "s" JOIN "public"."menus" "mn" ON (("mn"."id" = "s"."menu_id"))) JOIN "public"."venues" "v" ON (("v"."id" = "mn"."venue_id"))) WHERE (("s"."id" = "menu_items"."section_id") AND ("public"."is_org_owner"("v"."org_id") OR ("public"."is_org_manager"("v"."org_id") AND "public"."has_venue_assignment"("v"."id")) OR ("public"."is_org_host"("v"."org_id") AND "public"."has_venue_assignment"("v"."id"))))))) WITH CHECK ((EXISTS ( SELECT 1 FROM (("public"."menu_sections" "s" JOIN "public"."menus" "mn" ON (("mn"."id" = "s"."menu_id"))) JOIN "public"."venues" "v" ON (("v"."id" = "mn"."venue_id"))) WHERE (("s"."id" = "menu_items"."section_id") AND ("public"."is_org_owner"("v"."org_id") OR ("public"."is_org_manager"("v"."org_id") AND "public"."has_venue_assignment"("v"."id")) OR ("public"."is_org_host"("v"."org_id") AND "public"."has_venue_assignment"("v"."id")))))));
drop policy if exists "menu_items_write_org_editors" on public."menu_items";
CREATE POLICY "menu_items_write_org_editors" ON "public"."menu_items" TO "authenticated" USING ((EXISTS ( SELECT 1 FROM ((("public"."menu_sections" "s" JOIN "public"."menus" "mn" ON (("mn"."id" = "s"."menu_id"))) JOIN "public"."venues" "v" ON (("v"."id" = "mn"."venue_id"))) JOIN "public"."org_members" "m" ON (("m"."org_id" = "v"."org_id"))) WHERE (("s"."id" = "menu_items"."section_id") AND ("m"."user_id" = "auth"."uid"()) AND ("m"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'editor'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1 FROM ((("public"."menu_sections" "s" JOIN "public"."menus" "mn" ON (("mn"."id" = "s"."menu_id"))) JOIN "public"."venues" "v" ON (("v"."id" = "mn"."venue_id"))) JOIN "public"."org_members" "m" ON (("m"."org_id" = "v"."org_id"))) WHERE (("s"."id" = "menu_items"."section_id") AND ("m"."user_id" = "auth"."uid"()) AND ("m"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'editor'::"text"]))))));
drop policy if exists "menu_sections_admin_all" on public."menu_sections";
CREATE POLICY "menu_sections_admin_all" ON "public"."menu_sections" TO "authenticated" USING ("public"."is_platform_admin"()) WITH CHECK ("public"."is_platform_admin"());
drop policy if exists "menu_sections_delete_owner_or_manager" on public."menu_sections";
CREATE POLICY "menu_sections_delete_owner_or_manager" ON "public"."menu_sections" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1 FROM ("public"."menus" "mn" JOIN "public"."venues" "v" ON (("v"."id" = "mn"."venue_id"))) WHERE (("mn"."id" = "menu_sections"."menu_id") AND ("public"."is_org_owner"("v"."org_id") OR ("public"."is_org_manager"("v"."org_id") AND "public"."has_venue_assignment"("v"."id")))))));
drop policy if exists "menu_sections_insert_owner_or_manager" on public."menu_sections";
CREATE POLICY "menu_sections_insert_owner_or_manager" ON "public"."menu_sections" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1 FROM ("public"."menus" "mn" JOIN "public"."venues" "v" ON (("v"."id" = "mn"."venue_id"))) WHERE (("mn"."id" = "menu_sections"."menu_id") AND ("public"."is_org_owner"("v"."org_id") OR ("public"."is_org_manager"("v"."org_id") AND "public"."has_venue_assignment"("v"."id")))))));
drop policy if exists "menu_sections_select_org_members" on public."menu_sections";
CREATE POLICY "menu_sections_select_org_members" ON "public"."menu_sections" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1 FROM (("public"."menus" "mn" JOIN "public"."venues" "v" ON (("v"."id" = "mn"."venue_id"))) JOIN "public"."org_members" "m" ON (("m"."org_id" = "v"."org_id"))) WHERE (("mn"."id" = "menu_sections"."menu_id") AND ("m"."user_id" = "auth"."uid"())))));
drop policy if exists "menu_sections_update_owner_or_manager" on public."menu_sections";
CREATE POLICY "menu_sections_update_owner_or_manager" ON "public"."menu_sections" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1 FROM ("public"."menus" "mn" JOIN "public"."venues" "v" ON (("v"."id" = "mn"."venue_id"))) WHERE (("mn"."id" = "menu_sections"."menu_id") AND ("public"."is_org_owner"("v"."org_id") OR ("public"."is_org_manager"("v"."org_id") AND "public"."has_venue_assignment"("v"."id"))))))) WITH CHECK ((EXISTS ( SELECT 1 FROM ("public"."menus" "mn" JOIN "public"."venues" "v" ON (("v"."id" = "mn"."venue_id"))) WHERE (("mn"."id" = "menu_sections"."menu_id") AND ("public"."is_org_owner"("v"."org_id") OR ("public"."is_org_manager"("v"."org_id") AND "public"."has_venue_assignment"("v"."id")))))));
drop policy if exists "menu_sections_write_org_editors" on public."menu_sections";
CREATE POLICY "menu_sections_write_org_editors" ON "public"."menu_sections" TO "authenticated" USING ((EXISTS ( SELECT 1 FROM (("public"."menus" "mn" JOIN "public"."venues" "v" ON (("v"."id" = "mn"."venue_id"))) JOIN "public"."org_members" "m" ON (("m"."org_id" = "v"."org_id"))) WHERE (("mn"."id" = "menu_sections"."menu_id") AND ("m"."user_id" = "auth"."uid"()) AND ("m"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'editor'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1 FROM (("public"."menus" "mn" JOIN "public"."venues" "v" ON (("v"."id" = "mn"."venue_id"))) JOIN "public"."org_members" "m" ON (("m"."org_id" = "v"."org_id"))) WHERE (("mn"."id" = "menu_sections"."menu_id") AND ("m"."user_id" = "auth"."uid"()) AND ("m"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'editor'::"text"]))))));
drop policy if exists "menus_admin_all" on public."menus";
CREATE POLICY "menus_admin_all" ON "public"."menus" TO "authenticated" USING ("public"."is_platform_admin"()) WITH CHECK ("public"."is_platform_admin"());
drop policy if exists "menus_insert_org_editors" on public."menus";
CREATE POLICY "menus_insert_org_editors" ON "public"."menus" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1 FROM ("public"."venues" "v" JOIN "public"."org_members" "m" ON (("m"."org_id" = "v"."org_id"))) WHERE (("v"."id" = "menus"."venue_id") AND ("m"."user_id" = "auth"."uid"()) AND ("m"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'editor'::"text"]))))));
drop policy if exists "menus_select_org_members" on public."menus";
CREATE POLICY "menus_select_org_members" ON "public"."menus" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1 FROM ("public"."venues" "v" JOIN "public"."org_members" "m" ON (("m"."org_id" = "v"."org_id"))) WHERE (("v"."id" = "menus"."venue_id") AND ("m"."user_id" = "auth"."uid"())))));
drop policy if exists "menus_update_org_editors" on public."menus";
CREATE POLICY "menus_update_org_editors" ON "public"."menus" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1 FROM ("public"."venues" "v" JOIN "public"."org_members" "m" ON (("m"."org_id" = "v"."org_id"))) WHERE (("v"."id" = "menus"."venue_id") AND ("m"."user_id" = "auth"."uid"()) AND ("m"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'editor'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1 FROM ("public"."venues" "v" JOIN "public"."org_members" "m" ON (("m"."org_id" = "v"."org_id"))) WHERE (("v"."id" = "menus"."venue_id") AND ("m"."user_id" = "auth"."uid"()) AND ("m"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'editor'::"text"]))))));
drop policy if exists "org_delete_owner" on public."organizations";
CREATE POLICY "org_delete_owner" ON "public"."organizations" FOR DELETE TO "authenticated" USING ("public"."is_org_owner"("id"));
drop policy if exists "org_insert_self" on public."organizations";
CREATE POLICY "org_insert_self" ON "public"."organizations" FOR INSERT TO "authenticated" WITH CHECK (("created_by" = "auth"."uid"()));
drop policy if exists "org_invites_owner_all" on public."org_invites";
CREATE POLICY "org_invites_owner_all" ON "public"."org_invites" TO "authenticated" USING ("public"."is_org_owner"("org_id")) WITH CHECK ("public"."is_org_owner"("org_id"));
drop policy if exists "org_members_admin_all" on public."org_members";
CREATE POLICY "org_members_admin_all" ON "public"."org_members" TO "authenticated" USING ("public"."is_platform_admin"()) WITH CHECK ("public"."is_platform_admin"());
drop policy if exists "org_members_insert_self" on public."org_members";
CREATE POLICY "org_members_insert_self" ON "public"."org_members" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));
drop policy if exists "org_members_select_self" on public."org_members";
CREATE POLICY "org_members_select_self" ON "public"."org_members" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));
drop policy if exists "org_select_members" on public."organizations";
CREATE POLICY "org_select_members" ON "public"."organizations" FOR SELECT TO "authenticated" USING ("public"."is_org_member"("id"));
drop policy if exists "org_update_owner" on public."organizations";
CREATE POLICY "org_update_owner" ON "public"."organizations" FOR UPDATE TO "authenticated" USING ("public"."is_org_owner"("id")) WITH CHECK ("public"."is_org_owner"("id"));
drop policy if exists "organizations_admin_all" on public."organizations";
CREATE POLICY "organizations_admin_all" ON "public"."organizations" TO "authenticated" USING ("public"."is_platform_admin"()) WITH CHECK ("public"."is_platform_admin"());
drop policy if exists "platform_admin_all" on public."venue_events";
CREATE POLICY "platform_admin_all" ON "public"."venue_events" TO "authenticated" USING ("public"."is_platform_admin"()) WITH CHECK ("public"."is_platform_admin"());
drop policy if exists "platform_admin_all" on public."venue_tags";
CREATE POLICY "platform_admin_all" ON "public"."venue_tags" TO "authenticated" USING ("public"."is_platform_admin"()) WITH CHECK ("public"."is_platform_admin"());
drop policy if exists "venue_events_admin_all" on public."venue_events";
CREATE POLICY "venue_events_admin_all" ON "public"."venue_events" TO "authenticated" USING ("public"."is_platform_admin"()) WITH CHECK ("public"."is_platform_admin"());
drop policy if exists "venue_events_delete" on public."venue_events";
CREATE POLICY "venue_events_delete" ON "public"."venue_events" FOR DELETE USING ((EXISTS ( SELECT 1 FROM "public"."venue_members" WHERE (("venue_members"."venue_id" = "venue_events"."venue_id") AND ("venue_members"."user_id" = "auth"."uid"())))));
drop policy if exists "venue_events_insert" on public."venue_events";
CREATE POLICY "venue_events_insert" ON "public"."venue_events" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1 FROM "public"."venue_members" WHERE (("venue_members"."venue_id" = "venue_events"."venue_id") AND ("venue_members"."user_id" = "auth"."uid"())))));
drop policy if exists "venue_events_update" on public."venue_events";
CREATE POLICY "venue_events_update" ON "public"."venue_events" FOR UPDATE USING ((EXISTS ( SELECT 1 FROM "public"."venue_members" WHERE (("venue_members"."venue_id" = "venue_events"."venue_id") AND ("venue_members"."user_id" = "auth"."uid"())))));
drop policy if exists "venue_media_admin_all" on public."venue_media";
CREATE POLICY "venue_media_admin_all" ON "public"."venue_media" TO "authenticated" USING ("public"."is_platform_admin"()) WITH CHECK ("public"."is_platform_admin"());
drop policy if exists "venue_members_admin_all" on public."venue_members";
CREATE POLICY "venue_members_admin_all" ON "public"."venue_members" TO "authenticated" USING ("public"."is_platform_admin"()) WITH CHECK ("public"."is_platform_admin"());
drop policy if exists "venue_members_update_owner" on public."venue_members";
CREATE POLICY "venue_members_update_owner" ON "public"."venue_members" FOR UPDATE TO "authenticated" USING ("public"."is_org_owner"("org_id")) WITH CHECK ("public"."is_org_owner"("org_id"));
drop policy if exists "venue_tags_admin_all" on public."venue_tags";
CREATE POLICY "venue_tags_admin_all" ON "public"."venue_tags" TO "authenticated" USING ("public"."is_platform_admin"()) WITH CHECK ("public"."is_platform_admin"());
drop policy if exists "venue_tags_delete" on public."venue_tags";
CREATE POLICY "venue_tags_delete" ON "public"."venue_tags" FOR DELETE USING ((EXISTS ( SELECT 1 FROM "public"."venue_members" WHERE (("venue_members"."venue_id" = "venue_tags"."venue_id") AND ("venue_members"."user_id" = "auth"."uid"())))));
drop policy if exists "venue_tags_insert" on public."venue_tags";
CREATE POLICY "venue_tags_insert" ON "public"."venue_tags" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1 FROM "public"."venue_members" WHERE (("venue_members"."venue_id" = "venue_tags"."venue_id") AND ("venue_members"."user_id" = "auth"."uid"())))));
drop policy if exists "venue_visits_friends_select" on public."venue_visits";
CREATE POLICY "venue_visits_friends_select" ON "public"."venue_visits" FOR SELECT USING (((EXISTS ( SELECT 1 FROM "public"."user_follows" WHERE (("user_follows"."follower_id" = "auth"."uid"()) AND ("user_follows"."following_user_id" = "venue_visits"."user_id") AND ("user_follows"."status" = 'approved'::"text")))) AND (EXISTS ( SELECT 1 FROM "public"."venues" WHERE (("venues"."id" = "venue_visits"."venue_id") AND ("venues"."promotion_tier" IS NOT NULL))))));
drop policy if exists "venue_visits_insert" on public."venue_visits";
CREATE POLICY "venue_visits_insert" ON "public"."venue_visits" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));
drop policy if exists "venue_visits_select" on public."venue_visits";
CREATE POLICY "venue_visits_select" ON "public"."venue_visits" FOR SELECT USING (("auth"."uid"() = "user_id"));
drop policy if exists "venue_visits_update" on public."venue_visits";
CREATE POLICY "venue_visits_update" ON "public"."venue_visits" FOR UPDATE USING (("auth"."uid"() = "user_id"));
drop policy if exists "venues_admin_all" on public."venues";
CREATE POLICY "venues_admin_all" ON "public"."venues" TO "authenticated" USING ("public"."is_platform_admin"()) WITH CHECK ("public"."is_platform_admin"());
drop policy if exists "venues_insert_org_members" on public."venues";
CREATE POLICY "venues_insert_org_members" ON "public"."venues" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1 FROM "public"."org_members" "m" WHERE (("m"."org_id" = "venues"."org_id") AND ("m"."user_id" = "auth"."uid"()) AND ("m"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'editor'::"text"]))))));
drop policy if exists "venues_select_org_members" on public."venues";
CREATE POLICY "venues_select_org_members" ON "public"."venues" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1 FROM "public"."org_members" "m" WHERE (("m"."org_id" = "venues"."org_id") AND ("m"."user_id" = "auth"."uid"())))));
drop policy if exists "venues_update_org_members" on public."venues";
CREATE POLICY "venues_update_org_members" ON "public"."venues" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1 FROM "public"."org_members" "m" WHERE (("m"."org_id" = "venues"."org_id") AND ("m"."user_id" = "auth"."uid"()) AND ("m"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'editor'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1 FROM "public"."org_members" "m" WHERE (("m"."org_id" = "venues"."org_id") AND ("m"."user_id" = "auth"."uid"()) AND ("m"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'editor'::"text"]))))));

-- ── DROP the 10 broad SELECT USING(true) read-all policies (hide drafts) ──────────
drop policy if exists "Public read venues"          on public.venues;
drop policy if exists "Public read menus"           on public.menus;
drop policy if exists "Public read items"           on public.menu_items;
drop policy if exists "Public read sections"        on public.menu_sections;
drop policy if exists "venue_events_select"         on public.venue_events;
drop policy if exists "approved_tags_select"        on public.approved_tags;
drop policy if exists "Public can view venue tags"  on public.venue_tags;
drop policy if exists "venue_tags_select"           on public.venue_tags;
drop policy if exists "Public can view event media" on public.event_media;
drop policy if exists "event_media_select"          on public.event_media;

-- ── NEW published-scoped public read for venue_tags + event_media (no prior scoped alt) ──
drop policy if exists "venue_tags_select_published" on public.venue_tags;
create policy "venue_tags_select_published" on public.venue_tags for select to public
  using (exists (select 1 from public.venues v where v.id = venue_tags.venue_id and v.status = 'published'));

drop policy if exists "event_media_select_published" on public.event_media;
create policy "event_media_select_published" on public.event_media for select to public
  using (exists (select 1 from public.venue_events e where e.id = event_media.event_id and e.status = 'published'));
