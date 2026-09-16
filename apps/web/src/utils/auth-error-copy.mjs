// Turns a raw GoTrue / Supabase auth error into copy a signed-out person can
// act on. The /auth/auth-code-error page used to show one message for every
// failure ("your OAuth redirect URL is not allow-listed") plus the raw error,
// which sent Super Users to Supabase settings they cannot see.
//
// Pure logic, no imports, so `node --test test/auth-error-copy.test.mjs` can
// exercise it directly.

/**
 * @typedef {'session_mismatch' | 'link_expired' | 'cancelled' | 'redirect_config' | 'unknown'} AuthErrorKind
 * @typedef {{ kind: AuthErrorKind, title: string, body: string, showConfigHelp: boolean, detail: string | null }} AuthErrorCopy
 */

const COPY = {
  session_mismatch: {
    title: "We couldn't finish signing you in",
    body:
      'Your sign-in started in a different browser, window, or web address than where it finished, so we could not confirm it was you. Go back to the login page and try again in this same window.',
    showConfigHelp: false,
  },
  link_expired: {
    title: 'This sign-in link is no longer valid',
    body:
      'It may have expired or already been used. Request a new link and open it in the same browser you requested it from, or try again.',
    showConfigHelp: false,
  },
  cancelled: {
    title: 'Sign-in was cancelled',
    body: "You closed or cancelled the sign-in before it finished. You can try again whenever you're ready.",
    showConfigHelp: false,
  },
  redirect_config: {
    title: "Sign-in isn't set up for this web address yet",
    body:
      'This address is not approved for sign-in. A HappiTime admin needs to add it to the allowed redirect URLs before it will work.',
    showConfigHelp: true,
  },
  unknown: {
    title: 'Something went wrong while signing you in',
    body: 'Please try again. If it keeps happening, contact HappiTime support.',
    showConfigHelp: false,
  },
};

/**
 * Order matters: the first matching rule wins. "cancelled" is checked before
 * "redirect_config" because Apple reports a cancel as `access_denied`, and
 * "link_expired" before "unknown" because GoTrue phrases it several ways.
 * @type {Array<[AuthErrorKind, RegExp]>}
 */
const RULES = [
  ['session_mismatch', /code verifier|pkce/i],
  ['cancelled', /access_denied|user[_ ]cancel/i],
  ['link_expired', /expired|invalid or has|otp_expired|invalid flow state|already been used|token is invalid/i],
  ['redirect_config', /redirect_to|redirect url|not allowed|allow-?list|unauthorized_client|site url/i],
];

/**
 * @param {string | null | undefined} rawMessage
 * @returns {AuthErrorCopy}
 */
export function describeAuthError(rawMessage) {
  const detail = typeof rawMessage === 'string' && rawMessage.trim() ? rawMessage.trim() : null;
  let kind = /** @type {AuthErrorKind} */ ('unknown');

  if (detail) {
    for (const [candidate, pattern] of RULES) {
      if (pattern.test(detail)) {
        kind = candidate;
        break;
      }
    }
  }

  return { kind, ...COPY[kind], detail };
}
