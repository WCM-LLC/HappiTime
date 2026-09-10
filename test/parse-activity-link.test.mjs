import assert from "node:assert/strict";
import test from "node:test";
import { parseActivityLink } from "../apps/mobile/src/lib/parseActivityLink.mjs";

test("bare happitime://activity → Activity, default segment", () => {
  assert.deepEqual(parseActivityLink("happitime://activity"), { segment: null });
});

test("trailing slash and query forms parse", () => {
  assert.deepEqual(parseActivityLink("happitime://activity/"), { segment: null });
  assert.deepEqual(parseActivityLink("happitime://activity?segment=friends"), {
    segment: "friends",
  });
});

test("all five segments are accepted", () => {
  for (const s of ["notifications", "friends", "discover", "checkins", "people"]) {
    assert.deepEqual(parseActivityLink(`happitime://activity?segment=${s}`), {
      segment: s,
    });
  }
});

test("segment is case-insensitive", () => {
  assert.deepEqual(parseActivityLink("happitime://activity?segment=Friends"), {
    segment: "friends",
  });
});

test("unknown segment falls back to null (still an activity link)", () => {
  assert.deepEqual(parseActivityLink("happitime://activity?segment=bogus"), {
    segment: null,
  });
});

test("non-activity URLs are ignored", () => {
  assert.equal(parseActivityLink("happitime://venue/vine-street"), null);
  assert.equal(parseActivityLink("happitime://auth/callback"), null);
  assert.equal(parseActivityLink("https://happitime.biz/v/vine-street"), null);
  assert.equal(parseActivityLink("happitime://activitylog"), null);
  assert.equal(parseActivityLink(undefined), null);
});
