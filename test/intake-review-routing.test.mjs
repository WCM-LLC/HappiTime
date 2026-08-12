// test/intake-review-routing.test.mjs
//
// Guards for who approves a scanned happy hour menu (Fix 4 addendum #2).
//
// The rule the product actually wants:
//   owner scanning their own venue  → publishes, nobody else approves it
//   super user scanning any venue   → ALWAYS a draft, approved by that venue's
//                                     org; only ownerless venues reach staff
//
// The dangerous half is the second line. "Always a draft" has to be a server
// decision — a hand-rolled request with save_as_draft:false must not publish —
// and an org must never be able to act on another org's queue. These tests
// pin both, plus the schema they rely on.

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");
const read = (rel) => readFileSync(join(repoRoot, rel), "utf8");

const commitRoute = read("apps/web/src/app/api/intake/commit/route.ts");
const access = read("apps/web/src/utils/intake-access.ts");
const orgActions = read("apps/web/src/actions/org-intake-review-actions.ts");
const adminQueue = read("apps/web/src/app/admin/intake-review/page.tsx");
const orgQueue = read("apps/web/src/app/orgs/[orgId]/intake-review/page.tsx");
const migration = read("supabase/migrations/20260812150500_intake_review_routing.sql");
const intakeAuth = read("apps/web/src/utils/intake-auth.ts");
const mobileClient = read("apps/mobile/src/api/intake.ts");

test("anyone who cannot publish this venue is forced into a draft", () => {
  assert.match(
    commitRoute,
    /const canPublish =\s*tier === 'admin' \|\| \(await canPublishIntakeForVenue\(supabase, user, tier, venue_id\)\);/,
    "the publish right is a per-venue server check, not a tier guess"
  );
  assert.match(
    commitRoute,
    /if \(!canPublish\) \{\s*save_as_draft = true;/,
    "a hand-crafted autoPublish request must not bypass review"
  );
  assert.doesNotMatch(
    commitRoute,
    /if \(tier !== 'admin'\) \{[^}]*save_as_draft = true/s,
    "forcing every non-admin tier to draft is the old behavior — owners publish"
  );
});

test("scanning and approving are different role sets", () => {
  assert.match(access, /INTAKE_SCAN_ROLES = \['owner', 'admin', 'editor'\]/);
  assert.match(access, /INTAKE_APPROVE_ROLES = \['owner', 'admin'\]/,
    "an org editor may scan but must not publish or approve");
  // The publish check must consult the narrow set, or editors publish silently.
  assert.match(
    access,
    /export async function canPublishIntakeForVenue[\s\S]*?\.in\('role', INTAKE_APPROVE_ROLES\)/,
    "canPublishIntakeForVenue must use the approve roles"
  );
  assert.match(
    access,
    /export async function canPublishIntakeForVenue[\s\S]*?if \(tier === 'super_user'\) return false;/,
    "a super user never publishes, on any venue"
  );
});

test("non-admin tiers still get their venue scope re-checked", () => {
  assert.match(
    commitRoute,
    /canUseIntakeForVenue\(supabase, user, tier, venue_id\)/,
    "the venue picker is client-side and must never be trusted"
  );
});

test("a review row is written only when the committer cannot publish", () => {
  assert.match(
    commitRoute,
    /if \(!canPublish\) \{[\s\S]{0,200}resolveReviewRoute\(venue_id\)/,
    "the submission's route is resolved server-side"
  );
  assert.match(
    commitRoute,
    /review_route: routed\.route,\s*review_org_id: routed\.orgId,/,
    "the row must record who owns the approval"
  );
});

test("routing prefers the venue's own org and falls back to staff", () => {
  assert.match(access, /export async function resolveReviewRoute/);
  // An org with nobody in an intake role can't approve anything, so those
  // submissions have to fall through rather than stall forever.
  assert.match(
    access,
    /return reviewer \? \{ route: 'owner', orgId \} : \{ route: 'admin', orgId: null \}/,
    "an org with no actionable member must fall back to the admin queue"
  );
  assert.match(
    access,
    /if \(!orgId\) return \{ route: 'admin', orgId: null \}/,
    "ownerless venues go to staff"
  );
});

test("the org queue proves membership AND that the row belongs to that org", () => {
  assert.match(orgActions, /isOrgIntakeReviewer\(supabase, user\.id, orgId\)/);
  assert.match(
    orgActions,
    /sub\.review_route !== 'owner' \|\| sub\.review_org_id !== orgId/,
    "the orgId in the URL must be checked against the submission's own routing"
  );
  for (const fn of ["approveOrgIntakeSubmission", "rejectOrgIntakeSubmission"]) {
    assert.match(orgActions, new RegExp(`export async function ${fn}[\\s\\S]{0,200}await authorize\\(`),
      `${fn} must authorize before acting`);
  }
});

test("each queue lists only its own submissions", () => {
  assert.match(adminQueue, /\.eq\('review_route', 'admin'\)/, "staff queue excludes owner-routed rows");
  assert.match(orgQueue, /\.eq\('review_route', 'owner'\)/);
  assert.match(orgQueue, /\.eq\('review_org_id', orgId\)/);
});

test("the routing migration ships the columns, constraint, and reviewer policy", () => {
  assert.match(migration, /add column if not exists review_route text not null default 'admin'/);
  assert.match(migration, /check \(review_route in \('owner', 'admin'\)\)/);
  assert.match(migration, /references public\.organizations\(id\)/, "review_org_id targets organizations, not orgs");
  assert.match(migration, /create policy intake_submissions_select_org_reviewers/);
  // RLS perf convention from 20260811175113: auth.uid() wrapped in a subselect.
  assert.match(migration, /m\.user_id = \(select auth\.uid\(\)\)/);
});

test("bearer auth keeps the user JWT out of the apikey slot", () => {
  // #143: passing a user JWT as the client key broke verify-checkin with 401s.
  assert.match(
    intakeAuth,
    /createSupaClient\(url, anonKey, \{[\s\S]*Authorization: `Bearer \$\{token\}`/,
    "the anon key stays the apikey; the user token only rides in Authorization"
  );
  assert.match(mobileClient, /Authorization: `Bearer \$\{token\}`/);
});

test("the mobile upload does not use the empty-body blob path", () => {
  // fetch(fileUri).blob() returns an EMPTY body in React Native — the bug that
  // shipped 0-byte avatars. Multipart must use the { uri, name, type } form.
  // Comments are stripped first: this file documents the trap by name.
  const code = mobileClient.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.doesNotMatch(code, /\.blob\(\)/);
  assert.match(mobileClient, /form\.append\("image", \{\s*uri:/);
});

test("mobile never claims a publish the server won't do", () => {
  const screen = read("apps/mobile/src/screens/ScanMenuScreen.tsx");
  assert.match(
    screen,
    /setCanPublish\(context\.canPublish\)/,
    "the submit copy must come from the server's per-venue answer"
  );
  assert.doesNotMatch(
    screen,
    /Platform\.OS === "ios" \?[\s\S]{0,40}canPublish/,
    "publish rights must never be inferred client-side"
  );
  assert.match(mobileClient, /canPublish: Boolean\(json\?\.can_publish\)/);
});

test("the review-queue RLS policy matches the approver set", () => {
  assert.match(
    migration,
    /and m\.role in \('owner', 'admin'\)/,
    "editors must not read a queue their own scans land in"
  );
});

// ── Window matching (behavioral) ─────────────────────────────────────────────
//
// /api/intake/commit inserts new_windows[] blind — there is no server-side
// dedup (see the insert at route.ts, no upsert, no conflict target). So a
// client that sends every extracted window as "new" duplicates the venue's
// happy hour on its FIRST scan of an already-published venue. The mobile
// client must match on (day set, start, end) and attach by id instead.
//
// findMatchingWindow lives in TypeScript, so this reimplements its contract
// and pins the source against it.
const matchKey = (dow, start, end) =>
  `${[...dow].sort((a, b) => a - b).join(",")}|${start.slice(0, 5)}|${end.slice(0, 5)}`;
const match = (ex, existing) =>
  existing.find((e) => matchKey(e.dow, e.start_time, e.end_time) === matchKey(ex.dow, ex.start_time, ex.end_time)) ?? null;

test("a rescan of an existing window attaches instead of duplicating", () => {
  const existing = [{ id: "w1", dow: [1, 2, 3, 4, 5], start_time: "15:00:00", end_time: "18:00:00", label: null }];
  // Day order differs and the stored times carry seconds — both must still match.
  const scanned = { dow: [5, 4, 3, 2, 1], start_time: "15:00", end_time: "18:00" };
  assert.equal(match(scanned, existing)?.id, "w1");
});

test("a genuinely new window is not matched onto an existing one", () => {
  const existing = [{ id: "w1", dow: [1, 2, 3, 4, 5], start_time: "15:00:00", end_time: "18:00:00", label: null }];
  assert.equal(match({ dow: [6], start_time: "12:00", end_time: "15:00" }, existing), null, "different day");
  assert.equal(match({ dow: [1, 2, 3, 4, 5], start_time: "16:00", end_time: "18:00" }, existing), null, "different start");
});

test("the mobile client splits matched windows out of new_windows", () => {
  const client = read("apps/mobile/src/api/intake.ts");
  assert.match(client, /export function findMatchingWindow/);
  assert.match(client, /export async function fetchVenueScanContext/);
  const screen = read("apps/mobile/src/screens/ScanMenuScreen.tsx");
  assert.match(
    screen,
    /if \(match\) windowIds\.push\(match\.id\);\s*else newWindows\.push\(w\);/,
    "the commit must send existing windows by id, not as new inserts"
  );
  assert.doesNotMatch(screen, /windowIds: \[\],/, "sending an always-empty windowIds is the duplication bug");
});

// ── OTA shippability ─────────────────────────────────────────────────────────
//
// The scan flow ships to installed apps over the air (eas update, runtimeVersion
// policy "appVersion"). An OTA bundle CANNOT change native config: Info.plist
// keys and AndroidManifest permissions are baked at build time. So the in-app
// camera is iOS-only until a build carrying android.permission.CAMERA goes out
// — Android would otherwise ask for a permission its manifest never declared,
// which the OS can only refuse.
test("the in-app camera is gated to iOS", () => {
  const screen = read("apps/mobile/src/screens/ScanMenuScreen.tsx");
  assert.match(screen, /const cameraAvailable = Platform\.OS === "ios"/);
  assert.match(
    screen,
    /\{cameraAvailable \? \(\s*<Pressable[\s\S]{0,400}pickPhoto\("camera"\)/,
    "the camera button must be behind the platform gate"
  );
  // The library path has no such constraint and must stay available everywhere.
  assert.match(screen, /pickPhoto\("library"\)/);
});

test("android is prepped so the next build lifts the gate", () => {
  // apps/mobile/{ios,android} are GITIGNORED prebuild output — EAS regenerates
  // them from app.json, so app.json is the only source of truth for native
  // config. Asserting against a local prebuild dir would pass here and fail in
  // CI, where those directories do not exist.
  const appJson = JSON.parse(read("apps/mobile/app.json")).expo;
  assert.ok(appJson.android.permissions.includes("CAMERA"));
  const picker = appJson.plugins.find((p) => Array.isArray(p) && p[0] === "expo-image-picker");
  assert.ok(picker, "expo-image-picker must be a declared plugin");
  assert.match(picker[1].cameraPermission, /HappiTime/, "usage strings must be branded, not the library defaults");
  assert.match(appJson.ios.infoPlist.NSCameraUsageDescription, /HappiTime/);
});

test("the scan flow adds no native module the shipped binary lacks", () => {
  // Anything imported here must already be in the installed app, or the OTA
  // bundle crashes on load. Both were shipped for the avatar uploader.
  const pkg = JSON.parse(read("apps/mobile/package.json"));
  const screen = read("apps/mobile/src/screens/ScanMenuScreen.tsx");
  for (const mod of ["expo-image-picker", "expo-image-manipulator"]) {
    assert.match(screen, new RegExp(`from "${mod}"`));
    assert.ok(pkg.dependencies[mod], `${mod} must be a dependency`);
  }
});
