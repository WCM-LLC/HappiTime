// test/auth-error-copy.test.mjs
//
// The /auth/auth-code-error page used to show every failure as "your OAuth
// redirect URL is not allow-listed" plus the raw GoTrue message. Super Users
// who hit the PKCE "code verifier not found" error were told to edit Supabase
// settings they cannot see. describeAuthError turns the raw message into copy
// a signed-out person can act on, and keeps the config advice for the one
// case where it is true.

import assert from "node:assert/strict";
import test from "node:test";
import { describeAuthError } from "../apps/web/src/utils/auth-error-copy.mjs";

const PKCE =
  "PKCE code verifier not found in storage. This can happen if the auth flow was initiated in a different browser or device, or if the storage was cleared. For SSR frameworks (Next.js, SvelteKit, etc.), use @supabase/ssr on both the server and client to store the code verifier in cookies.";

test("a missing PKCE verifier is explained as a same-window problem, not a config problem", () => {
  const d = describeAuthError(PKCE);
  assert.equal(d.kind, "session_mismatch");
  assert.match(d.title, /couldn.t finish signing you in/i);
  assert.match(d.body, /same (browser|window)/i);
  assert.equal(d.showConfigHelp, false);
  assert.doesNotMatch(d.body, /Supabase|PKCE|OAuth/i, "no jargon in the user-facing body");
});

test("expired or used links say so and tell the reader to request a new one", () => {
  for (const msg of [
    "Email link is invalid or has expired",
    "otp_expired: Token has expired or is invalid",
    "invalid flow state, no valid flow state found",
  ]) {
    const d = describeAuthError(msg);
    assert.equal(d.kind, "link_expired", msg);
    assert.match(d.body, /new link|try again/i);
    assert.equal(d.showConfigHelp, false);
  }
});

test("a cancelled provider sign-in is not presented as a failure", () => {
  for (const msg of ["access_denied: User cancelled", "user_cancelled_authorize"]) {
    const d = describeAuthError(msg);
    assert.equal(d.kind, "cancelled", msg);
    assert.match(d.title, /cancelled/i);
    assert.equal(d.showConfigHelp, false);
  }
});

test("only redirect allow-list failures keep the Supabase configuration advice", () => {
  const d = describeAuthError("redirect_to is not allowed: unauthorized_client");
  assert.equal(d.kind, "redirect_config");
  assert.equal(d.showConfigHelp, true);
});

test("unknown and empty messages fall back to a generic, calm message", () => {
  for (const msg of ["", null, undefined, "Database error saving new user"]) {
    const d = describeAuthError(msg);
    assert.equal(d.kind, "unknown", String(msg));
    assert.match(d.title, /something went wrong/i);
    assert.equal(d.showConfigHelp, false);
  }
});

test("the raw message is preserved for the technical-details disclosure", () => {
  assert.equal(describeAuthError(PKCE).detail, PKCE);
  assert.equal(describeAuthError("  ").detail, null);
  assert.equal(describeAuthError(undefined).detail, null);
});

test("matching is case-insensitive", () => {
  assert.equal(describeAuthError("pkce CODE VERIFIER not found").kind, "session_mismatch");
});
