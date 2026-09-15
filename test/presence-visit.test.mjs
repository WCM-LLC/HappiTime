import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SHARED_SRC = readFileSync(
  resolve(__dirname, "../supabase/functions/_shared/presence-visit.ts"),
  "utf8",
);
const TRACK_SRC = readFileSync(
  resolve(__dirname, "../supabase/functions/track-visit/index.ts"),
  "utf8",
);
const VERIFY_SRC = readFileSync(
  resolve(__dirname, "../supabase/functions/verify-checkin/index.ts"),
  "utf8",
);

// ── Inlined mirror of the pure helpers in ─────────────────────────────────────
//    supabase/functions/_shared/presence-visit.ts
// node:test cannot import the Deno module (URL imports), so the pure decision
// logic is mirrored here; the drift guards below read the real source and fail
// if the deployed logic diverges from this copy. Same pattern as
// test/track-visit.test.mjs.
// (shouldRecordPresenceVisit was removed 2026-09-14 with its only caller, the
// track-visit presence bridge. verify-checkin calls recordPresenceVisit directly
// after authenticating, so there is no source/user gate left to mirror.)
function presenceVisitIsPrivate(pref) {
  return !(pref === "public" || pref === "friends");
}
// ──────────────────────────────────────────────────────────────────────────────

test("presenceVisitIsPrivate mirrors the mobile default (useVisitTracker)", () => {
  // Private unless the user explicitly opted into 'public' or 'friends'
  // visibility — same rule as _defaultCheckinPrivacy in useVisitTracker.ts.
  assert.equal(presenceVisitIsPrivate("public"), false);
  assert.equal(presenceVisitIsPrivate("friends"), false);
  assert.equal(presenceVisitIsPrivate("private"), true);
  assert.equal(presenceVisitIsPrivate(null), true);
  assert.equal(presenceVisitIsPrivate(undefined), true);
  assert.equal(presenceVisitIsPrivate(""), true);
});

// ── Drift guards ──────────────────────────────────────────────────────────────
// The Check Ins tab reads ONLY venue_visits (useUserCheckins.ts). These guards
// pin the bridge that makes code check-ins visible there; removing it
// regresses to the "@1extrababe checks in and sees nothing" bug.

test("shared source no longer exports a source/user gate (bridge is verify-checkin-only)", () => {
  // If this comes back, something is bridging presence from a path other than
  // verify-checkin — which is how anonymous "check-ins" got written before.
  assert.ok(
    !SHARED_SRC.includes("shouldRecordPresenceVisit"),
    "shouldRecordPresenceVisit reintroduced into presence-visit.ts",
  );
});

test("shared source keeps the privacy default the mirror asserts", () => {
  assert.ok(
    SHARED_SRC.includes('pref === "public" || pref === "friends"'),
    "presenceVisitIsPrivate rule drifted from the mirror",
  );
});

test("shared source inserts into venue_visits and detects the cooldown drop", () => {
  assert.ok(
    SHARED_SRC.includes('.from("venue_visits")'),
    "recordPresenceVisit no longer writes venue_visits",
  );
  // The 3h cooldown BEFORE-INSERT trigger silently drops the row (returns NULL,
  // no error) — the only way to see that is an empty .select() result.
  assert.ok(
    SHARED_SRC.includes('.select("id")'),
    "insert must chain .select(\"id\") so a cooldown drop is detectable",
  );
});

test("track-visit does NOT bridge into venue_visits (public endpoint, anonymous only)", () => {
  // Inverted 2026-09-14. track-visit used to bridge the "I'm here" tap into
  // venue_visits; that tap fired before sign-in and wrote anonymous
  // app_checkin attribution rows. The tap and the bridge are gone.
  assert.ok(
    !TRACK_SRC.includes("recordPresenceVisit("),
    "track-visit must not write venue_visits — only verify-checkin may",
  );
  assert.ok(
    !TRACK_SRC.includes("presence-visit.ts"),
    "track-visit must not import the presence bridge",
  );
});

test("verify-checkin bridges code check-ins into venue_visits", () => {
  assert.ok(
    VERIFY_SRC.includes("recordPresenceVisit("),
    "verify-checkin no longer records presence visits",
  );
});
