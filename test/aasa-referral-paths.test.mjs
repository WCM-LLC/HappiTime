import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const aasa = JSON.parse(readFileSync(new URL("../apps/directory/public/.well-known/apple-app-site-association", import.meta.url), "utf8"));
const detail = aasa.applinks.details[0];

test("AASA covers itinerary and referral paths", () => {
  const comps = (detail.components ?? []).map((c) => c["/"]);
  assert.ok(comps.includes("/i/*"));
  assert.ok(comps.includes("/r/*"), "adds /r/*");
  assert.ok(detail.paths.includes("/r/*"));
  // Guides open in the app (GuideDetail, 2026-10-22); the index page does not.
  assert.ok(comps.includes("/guides/*"), "adds /guides/*");
  assert.ok((detail.components ?? []).some((c) => c["/"] === "/guides/" && c.exclude === true), "excludes the /guides/ index");
  assert.ok(detail.paths.includes("NOT /guides/"));
});
