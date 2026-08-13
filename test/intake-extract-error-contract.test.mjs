// test/intake-extract-error-contract.test.mjs
//
// On 2026-08-13 every menu scan failed in production because no vision API key
// was set in ANY Vercel env scope. The route knew exactly what was wrong —
// it logged `GOOGLE_AI_API_KEY not configured` — but the operator was told
// "We couldn't read that photo. Try a straighter, brighter shot." and spent
// the afternoon re-shooting menus off screens and paper.
//
// Two defects turned a one-line config fix into a photo-quality wild goose
// chase, and these tests pin both shut:
//
//   1. The 502 branch returned its diagnostic under `message`, but every other
//      intake error branch — and both clients — use `detail`. The diagnostic
//      was dropped on the floor.
//   2. A missing provider key was reported as `extract_failed`, whose friendly
//      text blames the photo. A server misconfiguration is not a bad photo and
//      must never be described as one.

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");
const read = (rel) => readFileSync(join(repoRoot, rel), "utf8");

const route = read("apps/web/src/app/api/intake/extract/route.ts");
const mobileApi = read("apps/mobile/src/api/intake.ts");
const captureClient = read("apps/web/src/app/intake/capture/CaptureClient.tsx");

test("a missing provider key is its own error code, not extract_failed", () => {
  // `extract_failed` means "the model looked and could not do it". A key that
  // was never configured means the model was never called at all. Collapsing
  // the two is what sent the operator back out to re-shoot photos.
  assert.match(
    route,
    /vision_not_configured/,
    "the route must distinguish a configuration failure from an extraction failure",
  );
  // 503, matching the `service_role_missing` precedent in commit/route.ts:
  // the request was fine, the server is not ready to serve it.
  assert.match(
    route,
    /error:\s*'vision_not_configured'[\s\S]{0,200}?status:\s*503/,
    "vision_not_configured must return 503, like the service_role_missing precedent",
  );
});

test("the config error is raised by type, not by matching on message text", () => {
  // Classifying via `err.message.includes('not configured')` would re-break the
  // moment someone rewords the throw. The provider paths raise a typed error.
  assert.match(
    route,
    /class\s+VisionNotConfiguredError\s+extends\s+Error/,
    "a typed error keeps classification independent of message wording",
  );
  assert.match(
    route,
    /instanceof\s+VisionNotConfiguredError/,
    "the handler must classify on the type",
  );
  // Both provider paths must use it — anthropic is one env flip away from live.
  const throwsTyped = route.match(/throw new VisionNotConfiguredError\(/g) ?? [];
  assert.equal(
    throwsTyped.length,
    2,
    "both the gemini and anthropic key checks must raise the typed error",
  );
});

test("the 502 branch reports under `detail`, the contract every client reads", () => {
  // parseOrThrow in the mobile client reads json.detail; commit/route.ts and
  // claim/route.ts already return `detail`. extract's 502 was the lone
  // deviation, so its diagnostic never reached a human.
  const failureBranch = route.slice(route.indexOf("catch (err: any)"));
  assert.match(
    failureBranch,
    /detail:/,
    "the 502 body must carry `detail`, not `message`",
  );
  assert.doesNotMatch(
    failureBranch,
    /NextResponse\.json\(\s*\{[^}]*\bmessage:/,
    "`message` in the response body is the bug this test exists to prevent",
  );
});

test("no intake error message blames the photo for a server-side failure", () => {
  // The exact string the operator saw. It may still exist for genuine
  // extraction failures, but a misconfigured server must not reach it.
  assert.match(
    mobileApi,
    /vision_not_configured:/,
    "the mobile client needs a friendly string for the config failure",
  );
  const configLine = mobileApi
    .split("\n")
    .find((l) => l.includes("vision_not_configured:"));
  assert.doesNotMatch(
    configLine,
    /photo|shot|brighter|straighter|lighting|blurry/i,
    "a configuration failure must not be described as a photo problem",
  );
});

test("the web capture client surfaces the server's detail instead of the bare code", () => {
  // CaptureClient showed `json.error` only — literally the string
  // "extract_failed" — discarding the reason the route took care to send.
  assert.match(
    captureClient,
    /json\?\.detail/,
    "the web client must prefer the server's `detail` over the raw error code",
  );
});
