import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MODULE = join(__dirname, "..", "apps/directory/src/lib/redactSensitiveUrls.mjs");

const { redactString, redactEvent, REDACTED } = await import(MODULE);

// Some directory URLs are bearer credentials (/staff/{staff_token},
// /i/{share_token}, Supabase recovery links). The analytics SDK autocaptures
// the current URL, referrer and clicked hrefs, so these must be scrubbed before
// an event leaves the browser — otherwise the tokens sit in a third party's
// dashboard, replayable by anyone who can read it.

const STAFF = "6f1c2f0e-8a57-4a0b-9d5f-0c1d2e3f4a5b";
const SHARE = "Zx9_kQ-71bLmN0pR";

test("redacts the staff token from a path and a full URL", () => {
  assert.equal(redactString(`/staff/${STAFF}`), `/staff/${REDACTED}`);
  assert.equal(redactString(`/staff/${STAFF}/`), `/staff/${REDACTED}/`);
  assert.equal(
    redactString(`https://happitime.biz/staff/${STAFF}/?x=1`),
    `https://happitime.biz/staff/${REDACTED}/?x=1`,
  );
});

test("redacts the itinerary share token", () => {
  assert.equal(
    redactString(`https://happitime.biz/i/${SHARE}/`),
    `https://happitime.biz/i/${REDACTED}/`,
  );
});

test("redacts recovery tokens in the hash and the query", () => {
  const hash = redactString(
    "https://happitime.biz/#access_token=aaa.bbb.ccc&refresh_token=rrr&type=recovery",
  );
  assert.equal(
    hash,
    `https://happitime.biz/#access_token=${REDACTED}&refresh_token=${REDACTED}&type=recovery`,
  );
  const query = redactString("https://happitime.biz/auth/confirm?token_hash=abc123&type=recovery");
  assert.equal(query, `https://happitime.biz/auth/confirm?token_hash=${REDACTED}&type=recovery`);
  assert.equal(redactString("/auth/callback?code=xyz&next=/x"), `/auth/callback?code=${REDACTED}&next=/x`);
});

test("leaves ordinary URLs and attribution params alone", () => {
  for (const url of [
    "https://happitime.biz/",
    "https://happitime.biz/kc/westport/some-venue/",
    "https://happitime.biz/?utm_source=heycatch&utm_campaign=x",
    "https://happitime.biz/r/jwill86/",
    "https://happitime.biz/v/some-venue/",
    "https://happitime.biz/guides/best-happy-hours-kansas-city/",
    "/sponsored-events/tacos-and-tables/",
    "/contactus/?plan=verified",
  ]) {
    assert.equal(redactString(url), url);
  }
});

test("scrubs every string on an event, however nested, without mutating it", () => {
  const event = {
    event: "$pageview",
    properties: {
      $current_url: `https://happitime.biz/staff/${STAFF}`,
      $pathname: `/staff/${STAFF}`,
      $referrer: `https://happitime.biz/i/${SHARE}/`,
      $elements: [{ attr__href: `/i/${SHARE}/`, tag_name: "a" }],
      $set_once: { $initial_current_url: `https://happitime.biz/i/${SHARE}/` },
      count: 3,
      flag: true,
      nothing: null,
    },
  };
  const before = JSON.stringify(event);
  const out = redactEvent(event);
  assert.equal(JSON.stringify(event), before, "input is not mutated");

  const serialised = JSON.stringify(out);
  assert.ok(!serialised.includes(STAFF), "staff token is gone");
  assert.ok(!serialised.includes(SHARE), "share token is gone");
  assert.equal(out.event, "$pageview");
  assert.equal(out.properties.$pathname, `/staff/${REDACTED}`);
  assert.equal(out.properties.$elements[0].tag_name, "a");
  assert.equal(out.properties.count, 3);
  assert.equal(out.properties.flag, true);
  assert.equal(out.properties.nothing, null);
});

test("never drops an event, and passes null through", () => {
  assert.equal(redactEvent(null), null);
  assert.deepEqual(redactEvent({ event: "x", properties: {} }), { event: "x", properties: {} });
});
