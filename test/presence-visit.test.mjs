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
function shouldRecordPresenceVisit(source, userId) {
  return source === "app_checkin" && userId !== null;
}

function presenceVisitIsPrivate(pref) {
  return !(pref === "public" || pref === "friends");
}
// ──────────────────────────────────────────────────────────────────────────────

test("shouldRecordPresenceVisit: only an authenticated app_checkin creates a visit", () => {
  assert.equal(shouldRecordPresenceVisit("app_checkin", "2620ef4e-user"), true);
});

test("shouldRecordPresenceVisit: anonymous app_checkin stays attribution-only", () => {
  // Web QR landing invokes track-visit with the anon key -> userId null.
  assert.equal(shouldRecordPresenceVisit("app_checkin", null), false);
});

test("shouldRecordPresenceVisit: non-checkin attribution sources never create visits", () => {
  for (const s of ["qr", "push_click", "organic", "tiktok", "instagram", "facebook", "social"]) {
    assert.equal(
      shouldRecordPresenceVisit(s, "some-user"),
      false,
      `${s} must not create a venue_visits row`,
    );
  }
});

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
// pin the bridge that makes button/code check-ins visible there; removing it
// regresses to the "@1extrababe checks in and sees nothing" bug.

test("shared source keeps the gate the mirror asserts", () => {
  assert.ok(
    SHARED_SRC.includes('source === "app_checkin" && userId !== null'),
    "shouldRecordPresenceVisit gate drifted from the mirror",
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

test("track-visit bridges authenticated app_checkin into venue_visits", () => {
  assert.ok(
    TRACK_SRC.includes("shouldRecordPresenceVisit("),
    "track-visit no longer gates the presence bridge",
  );
  assert.ok(
    TRACK_SRC.includes("recordPresenceVisit("),
    "track-visit no longer records presence visits",
  );
});

test("verify-checkin bridges code check-ins into venue_visits", () => {
  assert.ok(
    VERIFY_SRC.includes("recordPresenceVisit("),
    "verify-checkin no longer records presence visits",
  );
});
