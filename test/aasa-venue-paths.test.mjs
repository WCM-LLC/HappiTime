import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const aasa = JSON.parse(
  readFileSync(new URL("../apps/directory/public/.well-known/apple-app-site-association", import.meta.url), "utf8")
);
const detail = aasa.applinks.details[0];

test("AASA covers itinerary and venue paths", () => {
  const comps = (detail.components ?? []).map((c) => c["/"]);
  assert.ok(comps.includes("/i/*"), "keeps /i/*");
  assert.ok(comps.includes("/v/*"), "adds /v/*");
  // legacy paths array kept in sync for older iOS
  assert.ok(detail.paths.includes("/i/*") && detail.paths.includes("/v/*"));
});
