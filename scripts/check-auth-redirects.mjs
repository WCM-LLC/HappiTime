#!/usr/bin/env node
// Reports GoTrue's redirect allow-list, and fails when a host the product
// actually serves is missing from it.
//
// Why this exists: on 2026-08-13 console.happitime.biz was attached to the
// console Vercel project. resolveConsoleOrigin() in auth-redirects.ts falls
// back to the REQUEST HOST when NEXT_PUBLIC_CONSOLE_URL is unset — which is how
// production is configured — so visiting the branded domain immediately makes
// it an auth redirect target. If GoTrue does not allow-list it, logins there
// fail.
//
// That cannot be checked from outside. GoTrue does not validate `redirect_to`
// at /authorize: a deliberately bogus domain passes through the Location header
// exactly like a legitimate one (verified 2026-08-13). Validation happens later,
// at the callback, so the only way to KNOW is to read the config.
//
// Read-only. The allow-list is configuration, not a secret; no key or token is
// printed. Requires SUPABASE_ACCESS_TOKEN and SUPABASE_PROJECT_REF (already
// repo secrets).

import { pathToFileURL } from 'node:url';

const token = process.env.SUPABASE_ACCESS_TOKEN;
const ref = process.env.SUPABASE_PROJECT_REF;

const isCli = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

/**
 * Hosts that must be able to receive an auth redirect.
 *
 * `required: true` fails the run when absent — reserved for hosts the product
 * actively serves, where a missing entry means broken logins.
 */
export const EXPECTED_HOSTS = [
  {
    host: 'console.happitime.biz',
    required: true,
    why: 'branded console domain — attached 2026-08-13; resolveConsoleOrigin falls back to the request host',
  },
  {
    host: 'happitime-console.vercel.app',
    required: true,
    why: 'the console default in auth-redirects.ts, email.ts and both .env.example files',
  },
  {
    host: 'happitime.biz',
    required: false,
    why: 'directory; forwards misplaced recovery links to the console rather than consuming them',
  },
];

/**
 * Extracts the hostname from an allow-list entry, so hosts are compared as
 * hosts rather than as substrings.
 *
 * Substring matching is wrong here in both directions, and quietly so:
 * "console.happitime.biz" CONTAINS "happitime.biz", so the directory would be
 * reported as allow-listed when only the console is — and by the same token a
 * lookalike such as "happitime-console.vercel.app.example.com" would satisfy a
 * required host. A check that can be fooled by a longer string is worse than
 * no check, because it reports green.
 *
 * Entries carry glob suffixes (`https://console.happitime.biz/**`) which URL()
 * tolerates once the asterisks are stripped. Non-http schemes like
 * `happitime://auth/callback` parse to an unrelated host and simply never match.
 */
export function hostOf(entry) {
  const cleaned = String(entry).trim().replace(/\*/g, '');
  if (!cleaned) return null;
  try {
    // Leading dots survive from wildcard forms like `*.happitime.biz`.
    return new URL(cleaned).hostname.toLowerCase().replace(/^\.+/, '');
  } catch {
    return null;
  }
}

/**
 * Pure verdict, so this is testable without a token.
 * `allowList` is GoTrue's URI_ALLOW_LIST, already split into entries.
 */
export function evaluateRedirects(allowList, siteUrl) {
  const entries = (allowList ?? []).map((e) => String(e).trim()).filter(Boolean);
  const hosts = entries.map(hostOf).filter(Boolean);

  const results = EXPECTED_HOSTS.map((e) => ({
    ...e,
    present: hosts.includes(e.host.toLowerCase()),
  }));

  const missingRequired = results.filter((r) => r.required && !r.present);

  return {
    healthy: missingRequired.length === 0,
    siteUrl: siteUrl ?? '(unset)',
    entries,
    results,
    message:
      missingRequired.length === 0
        ? `All required redirect hosts are allow-listed (${entries.length} entr${entries.length === 1 ? 'y' : 'ies'}).`
        : `Missing from GoTrue's redirect allow-list:\n` +
          missingRequired.map((r) => `  - ${r.host}  (${r.why})`).join('\n'),
  };
}

async function fetchAuthConfig() {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/config/auth`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`auth config read failed: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  }
  return res.json();
}

if (isCli) {
  if (!token || !ref) {
    // Exit 2, distinct from a real finding: a check that could not run must
    // never be mistaken for a check that passed.
    console.error('Missing SUPABASE_ACCESS_TOKEN or SUPABASE_PROJECT_REF.');
    process.exit(2);
  }
  try {
    const cfg = await fetchAuthConfig();
    // The API returns a comma-separated string; tolerate an array too.
    const raw = cfg?.uri_allow_list ?? '';
    const list = Array.isArray(raw) ? raw : String(raw).split(',');
    const verdict = evaluateRedirects(list, cfg?.site_url);

    console.log(`SITE_URL: ${verdict.siteUrl}`);
    console.log('Redirect allow-list:');
    for (const e of verdict.entries) console.log(`  ${e}`);
    console.log('');
    for (const r of verdict.results) {
      const mark = r.present ? 'ok  ' : r.required ? 'MISS' : 'note';
      console.log(`  [${mark}] ${r.host}${r.present ? '' : `  — ${r.why}`}`);
    }
    console.log('');
    console.log(verdict.message);
    if (!verdict.healthy) process.exit(1);
  } catch (err) {
    console.error(`Auth redirect check could not complete: ${err.message}`);
    process.exit(2);
  }
}
