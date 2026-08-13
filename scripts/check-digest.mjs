#!/usr/bin/env node
// Alarm channel for the venue digest.
//
// send-venue-digest ALREADY detects the failure it should: when it sends zero
// emails while active venues exist, it logs
//
//   [send-venue-digest] ALERT: 0 emails sent but N active venue(s) exist...
//
// at error level and returns HTTP 500. That check works. On 2026-08-12 it
// fired correctly at 11:00:11 UTC — and nobody found out, because the only
// thing it does with the alert is EMAIL it, through the same Resend account
// that was returning "401 API key is invalid". The alarm's notification
// channel was the system being alarmed about.
//
// This script is the channel that does not have that circular dependency. It
// reads the function's logs from GitHub's infrastructure and fails the run,
// which GitHub then notifies on. No email involved anywhere in the path.
//
// Requires SUPABASE_ACCESS_TOKEN and SUPABASE_PROJECT_REF (already repo
// secrets, used by the DB deploy workflow).

import { pathToFileURL } from 'node:url';

const token = process.env.SUPABASE_ACCESS_TOKEN;
const ref = process.env.SUPABASE_PROJECT_REF;

const isCli = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

/** How far back to look. The digest runs once daily at 11:00 UTC (6am CT). */
export const WINDOW_HOURS = 24;

/**
 * Log signatures that mean the digest did not do its job. Matched
 * case-insensitively against the raw message.
 *
 * `RESEND_API_KEY not set` is included even though it is only a warning: a
 * digest that cannot send is not a lesser problem than one that fails to.
 */
export const FAILURE_PATTERNS = [
  { pattern: '0 emails sent', label: 'zero emails sent while active venues exist' },
  { pattern: 'zero_emails_sent', label: 'function returned zero_emails_sent' },
  { pattern: 'resend error', label: 'Resend rejected a send' },
  { pattern: 'resend_api_key not set', label: 'RESEND_API_KEY missing — digest cannot send' },
];

/**
 * Pure verdict, so the logic is testable without network or credentials.
 * `rows` is whatever the logs query returned: [{ timestamp, level, msg }].
 */
export function evaluateDigest(rows) {
  const failures = [];
  for (const row of rows) {
    const msg = String(row.msg ?? '');
    const haystack = msg.toLowerCase();
    for (const { pattern, label } of FAILURE_PATTERNS) {
      if (haystack.includes(pattern)) {
        failures.push(`${row.timestamp ?? 'unknown time'} — ${label}: ${msg.trim().slice(0, 200)}`);
        break; // one finding per line; the first matching pattern is the most specific
      }
    }
  }

  if (failures.length > 0) {
    return {
      healthy: false,
      message:
        `Venue digest is not delivering (${failures.length} finding(s) in the last ${WINDOW_HOURS}h):\n` +
        failures.map((f) => `  - ${f}`).join('\n'),
    };
  }
  return { healthy: true, message: `No digest failures in the last ${WINDOW_HOURS}h.` };
}

const LOGS_SQL = `
select timestamp, log_attributes['level'] as level, event_message as msg
from logs
where source = 'function_logs'
  and (event_message ilike '%send-venue-digest%' or event_message ilike '%zero_emails_sent%')
order by timestamp desc
limit 200
`.trim();

async function fetchLogs() {
  const url =
    `https://api.supabase.com/v1/projects/${ref}/analytics/endpoints/logs.all` +
    `?sql=${encodeURIComponent(LOGS_SQL)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    throw new Error(`logs query failed: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  }
  const body = await res.json();
  return body?.result ?? [];
}

if (isCli) {
  if (!token || !ref) {
    // Exit 2, distinct from a real alarm: a check that cannot run must not be
    // mistaken for a check that passed.
    console.error('Missing SUPABASE_ACCESS_TOKEN or SUPABASE_PROJECT_REF.');
    process.exit(2);
  }
  try {
    const rows = await fetchLogs();
    const verdict = evaluateDigest(rows);
    console.log(verdict.message);
    if (!verdict.healthy) process.exit(1);
    console.log('Digest check passed.');
  } catch (err) {
    console.error(`Digest check could not complete: ${err.message}`);
    process.exit(2);
  }
}
