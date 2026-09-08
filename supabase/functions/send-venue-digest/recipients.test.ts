// supabase/functions/send-venue-digest/recipients.test.ts
//
// Pure-logic tests for recipient resolution and the host (code-only) email.
//
// Every team member gets an email; the role decides which one:
//   owner / manager → the full digest (code + yesterday's stats)
//   host            → code-only
//
// Run:
//   deno test --no-config supabase/functions/send-venue-digest/ --allow-read

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

import { buildCodeOnlyHtml, formatHostSubject, recipientsForVenue } from "./logic.ts";

const noOptOuts = new Set<string>();

// ─────────────────────────────────────────────────────────────────────────────
// recipientsForVenue
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("recipientsForVenue: owner and manager both receive the full digest", () => {
  const members = [
    { user_id: "u1", email: "owner@bar.com", role: "owner" },
    { user_id: "u2", email: "mgr@bar.com", role: "manager" },
  ];
  const out = recipientsForVenue(members, noOptOuts);
  assertEquals(
    out.map((r) => [r.email, r.kind]),
    [["owner@bar.com", "digest"], ["mgr@bar.com", "digest"]],
  );
});

Deno.test("recipientsForVenue: a second owner is not shadowed by an earlier one", () => {
  const members = [
    { user_id: "admin", email: "admin@happitime.biz", role: "owner" },
    { user_id: "real", email: "roger@tacos.com", role: "owner" },
  ];
  const out = recipientsForVenue(members, noOptOuts);
  assertEquals(out.map((r) => r.email), ["admin@happitime.biz", "roger@tacos.com"]);
});

Deno.test("recipientsForVenue: host receives the code-only email", () => {
  const members = [{ user_id: "h1", email: "host@bar.com", role: "host" }];
  const out = recipientsForVenue(members, noOptOuts);
  assertEquals(out, [{ userId: "h1", email: "host@bar.com", role: "host", kind: "code" }]);
});

Deno.test("recipientsForVenue: legacy roles (admin/editor/viewer) are not emailed", () => {
  const members = [
    { user_id: "a", email: "a@bar.com", role: "admin" },
    { user_id: "e", email: "e@bar.com", role: "editor" },
    { user_id: "v", email: "v@bar.com", role: "viewer" },
  ];
  assertEquals(recipientsForVenue(members, noOptOuts), []);
});

Deno.test("recipientsForVenue: one email per person — highest role wins", () => {
  const members = [
    { user_id: "u1", email: "x@bar.com", role: "host" },
    { user_id: "u1", email: "x@bar.com", role: "manager" },
  ];
  const out = recipientsForVenue(members, noOptOuts);
  assertEquals(out.length, 1);
  assertEquals(out[0].kind, "digest");
  assertEquals(out[0].role, "manager");
});

Deno.test("recipientsForVenue: members without a resolvable email are dropped", () => {
  const members = [
    { user_id: "u1", email: null, role: "owner" },
    { user_id: "u2", email: "", role: "host" },
    { user_id: "u3", email: "ok@bar.com", role: "host" },
  ];
  assertEquals(recipientsForVenue(members, noOptOuts).map((r) => r.userId), ["u3"]);
});

Deno.test("recipientsForVenue: per-user opt-out applies to hosts too", () => {
  const members = [
    { user_id: "u1", email: "owner@bar.com", role: "owner" },
    { user_id: "h1", email: "host@bar.com", role: "host" },
  ];
  const out = recipientsForVenue(members, new Set(["h1"]));
  assertEquals(out.map((r) => r.userId), ["u1"]);
});

// ─────────────────────────────────────────────────────────────────────────────
// Host email: subject + body carry the code and venue, nothing else
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("formatHostSubject: names the venue and the code", () => {
  assertEquals(
    formatHostSubject("GYCM", "Tacos Valentina"),
    "Today's HappiTime code for Tacos Valentina: GYCM",
  );
});

Deno.test("buildCodeOnlyHtml: shows venue name, code, and validity note", () => {
  const html = buildCodeOnlyHtml({ venueName: "Tacos Valentina", code: "GYCM" });
  assertEquals(html.includes("Tacos Valentina"), true);
  assertEquals(html.includes("GYCM"), true);
  assertEquals(html.includes("valid until 6 AM tomorrow (CT)"), true);
});

Deno.test("buildCodeOnlyHtml: carries no stats and no manage-listing CTA", () => {
  const html = buildCodeOnlyHtml({ venueName: "Bar", code: "AB23" });
  assertEquals(html.includes("Yesterday's Stats"), false);
  assertEquals(html.includes("Manage your listing"), false);
  assertEquals(html.includes("check-ins"), false);
});
