// test/pending-itinerary-link.test.mjs
//
// An itinerary link that reaches the app while it sits on the sign-in /
// onboarding gate must survive until the navigator mounts — otherwise the person
// never sees the itinerary and its author gets no attribution touch. And a link
// the navigator already routed must NOT linger to replay on a later remount.
//
// The stash is executed for real here. The hook wiring is a static check; it is
// not proof of behaviour on a device.

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  HANDLED_WINDOW_MS,
  markItineraryLinkHandled,
  restorePendingItineraryLink,
  setPendingItineraryLink,
  takePendingItineraryLink,
} from "../apps/mobile/src/lib/pendingItineraryLink.mjs";

const URL_A = "happitime://itinerary?token=3f2b8c1e-0a4d-4e6f-9b7a-1c2d3e4f5a6b&ref=jwill86";
const URL_B = "https://happitime.biz/i/9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";
const read = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");

test("gated: a stashed link is handed over exactly once", () => {
  takePendingItineraryLink();
  setPendingItineraryLink(URL_A, 1_000_000);
  assert.equal(takePendingItineraryLink(), URL_A);
  assert.equal(takePendingItineraryLink(), null);
});

test("navigator mounted, capture hook runs first: routing drops the stash", () => {
  setPendingItineraryLink(URL_B, 2_000_000);
  markItineraryLinkHandled(URL_B, 2_000_000);
  assert.equal(takePendingItineraryLink(), null, "nothing left to replay on remount");
});

test("navigator mounted, router runs first: the late stash is refused", () => {
  markItineraryLinkHandled(URL_A, 3_000_000);
  setPendingItineraryLink(URL_A, 3_000_001);
  assert.equal(takePendingItineraryLink(), null);
});

test("the refusal is brief and per-URL, so real later taps still work", () => {
  markItineraryLinkHandled(URL_A, 4_000_000);
  setPendingItineraryLink(URL_B, 4_000_001); // a different link, right away
  assert.equal(takePendingItineraryLink(), URL_B);
  setPendingItineraryLink(URL_A, 4_000_000 + HANDLED_WINDOW_MS); // same link, later, at the gate
  assert.equal(takePendingItineraryLink(), URL_A);
});

test("the root capture hook stashes itinerary links but does not leave the gate for them", () => {
  const capture = read("apps/mobile/src/hooks/useVenueLinkCapture.ts");
  const branch = capture.slice(capture.indexOf("const itinerary = parseItineraryLink(url);"), capture.indexOf("const referral = parseReferralLink(url);"));
  assert.match(branch, /setPendingItineraryLink\(url\);/);
  assert.match(branch, /setPendingReferral\(itinerary\.ref\)/, "the Insider ref is still captured");
  assert.doesNotMatch(branch, /onVenueLink\(\)/, "sign-in / onboarding is not skipped for an itinerary");
});

test("the navigator consumes the stash on mount and does not route the launch URL twice", () => {
  const hook = read("apps/mobile/src/hooks/useItineraryDeepLink.ts");
  assert.match(hook, /const pending = takePendingItineraryLink\(\);\s*if \(pending\) handleUrl\(pending\);/);
  assert.match(hook, /if \(url && !pending\) handleUrl\(url\);/, "a stashed link supersedes the launch URL");
});

test("a link is marked handled only after the navigator accepts it; otherwise it goes back in the stash", () => {
  const hook = read("apps/mobile/src/hooks/useItineraryDeepLink.ts");
  const body = hook.slice(hook.indexOf("async function handleUrl"), hook.indexOf("const pending = takePendingItineraryLink();"));
  const navigate = body.indexOf('nav.navigate("SharedItinerary"');
  const mark = body.indexOf("markItineraryLinkHandled(url);");
  assert.ok(navigate !== -1 && mark > navigate, "mark comes after navigate");
  assert.match(
    body,
    /if \(cancelled \|\| !nav\) \{[\s\S]*?restorePendingItineraryLink\(url\);\s*return;\s*\}/,
    "a timed-out or cancelled route is re-stashed for the next mount",
  );
});

test("an unrouted link is put back for the next mount", () => {
  takePendingItineraryLink();
  setPendingItineraryLink(URL_B, 9_000_000); // capture hook
  assert.equal(takePendingItineraryLink(), URL_B); // navigator mounts, takes it…
  restorePendingItineraryLink(URL_B); // …navigation times out → put back
  assert.equal(takePendingItineraryLink(), URL_B, "still there for the next mount");
});

test("putting a link back never overwrites a newer one — the latest tap wins", () => {
  takePendingItineraryLink();
  setPendingItineraryLink(URL_A, 9_500_000);
  assert.equal(takePendingItineraryLink(), URL_A); // navigator starts routing A…
  setPendingItineraryLink(URL_B, 9_500_100); // …B arrives while A is still waiting
  restorePendingItineraryLink(URL_A); // A could not be routed
  assert.equal(takePendingItineraryLink(), URL_B);
});
