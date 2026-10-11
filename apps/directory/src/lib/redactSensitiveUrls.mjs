// Scrubs bearer credentials out of analytics events before they leave the
// browser. Plain ESM (types in redactSensitiveUrls.d.ts) so `node --test` can
// exercise it directly — see test/analytics-url-redaction.test.mjs.
//
// Some directory URLs ARE the credential:
//   /staff/{staff_token}  per-venue shared secret for the staff check-in page
//   /i/{share_token}      anyone holding it can read a private itinerary
// and Supabase recovery links land with access/refresh tokens in the hash (or
// a code/token_hash in the query) until AuthRecoveryRedirect forwards them.
// Autocapture records the current URL, the referrer and clicked hrefs, so every
// string on an event is scrubbed, however deeply nested.

export const REDACTED = "[redacted]";

const TOKEN_PATH = /\/(staff|i)\/[^/?#\s"']+/g;
const TOKEN_PARAM = /\b(access_token|refresh_token|token_hash|token|code)=[^&#\s"']+/g;

/** Redact credential-bearing path segments and params in one string. */
export function redactString(value) {
  return value
    .replace(TOKEN_PATH, (_match, route) => `/${route}/${REDACTED}`)
    .replace(TOKEN_PARAM, (_match, key) => `${key}=${REDACTED}`);
}

function redactValue(value, depth) {
  if (typeof value === "string") return redactString(value);
  if (depth > 8 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((item) => redactValue(item, depth + 1));
  const out = {};
  for (const [key, item] of Object.entries(value)) out[key] = redactValue(item, depth + 1);
  return out;
}

/**
 * `beforeSend` hook for the analytics SDK: returns the event with every string
 * scrubbed. Never drops an event (a redacted pageview still counts) and passes
 * `null` straight through.
 */
export function redactEvent(event) {
  if (!event) return event;
  return redactValue(event, 0);
}
