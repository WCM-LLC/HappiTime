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

/**
 * Candidate query shapes, tried in order until one is accepted.
 *
 * The Analytics endpoint does not expose the unified `logs` table with a
 * `source` column — that view is an abstraction of the MCP tooling. Querying
 * it here returns HTTP 200 with `error: "Backend error! Retry your query."`,
 * which the first version read as an empty window and reported green.
 *
 * The endpoint's own schema is per-source (`function_logs`) and its dialect
 * has varied between BigQuery and ClickHouse across Supabase versions, so
 * `ilike` is not dependable. Rather than spend one deploy per guess against an
 * undocumented surface, the check tries each shape and reports what happened
 * to all of them — so a single run identifies the working one.
 *
 * Once the log shows a winner, this list should collapse to just that entry.
 */
export const LOGS_SQL_CANDIDATES = [
  {
    label: 'function_logs + lower/like',
    sql: `select timestamp, event_message as msg
from function_logs
where lower(event_message) like '%send-venue-digest%'
   or lower(event_message) like '%zero_emails_sent%'
order by timestamp desc
limit 200`,
  },
  {
    label: 'function_logs + ilike',
    sql: `select timestamp, event_message as msg
from function_logs
where event_message ilike '%send-venue-digest%'
   or event_message ilike '%zero_emails_sent%'
order by timestamp desc
limit 200`,
  },
  {
    label: 'unified logs + source filter',
    sql: `select timestamp, event_message as msg
from logs
where source = 'function_logs'
  and (event_message ilike '%send-venue-digest%' or event_message ilike '%zero_emails_sent%')
order by timestamp desc
limit 200`,
  },
];

/**
 * The window MUST be sent explicitly.
 *
 * The logs endpoint applies its own much shorter default when no timestamps
 * are given, and the first version of this script relied on that default while
 * its message claimed "the last 24h". The result was a check that ran green
 * over a window containing a known failure — the 2026-08-12 11:00:11 UTC
 * digest alert sat ~16 hours back and was simply never queried.
 *
 * A daily check whose window is shorter than a day cannot see the daily job it
 * exists to watch. Passing both bounds removes the dependency on any default.
 */
export function windowBounds(now = new Date()) {
  const end = new Date(now);
  const start = new Date(now.getTime() - WINDOW_HOURS * 60 * 60 * 1000);
  return { start: start.toISOString(), end: end.toISOString() };
}

async function runQuery(sql, start, end) {
  const url =
    `https://api.supabase.com/v1/projects/${ref}/analytics/endpoints/logs.all` +
    `?sql=${encodeURIComponent(sql)}` +
    `&iso_timestamp_start=${encodeURIComponent(start)}` +
    `&iso_timestamp_end=${encodeURIComponent(end)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${(await res.text()).slice(0, 160)}`);
  }
  return extractRows(await res.json());
}

async function fetchLogs() {
  const { start, end } = windowBounds();
  console.log(`Window ${start} → ${end}`);

  const problems = [];
  for (const { label, sql } of LOGS_SQL_CANDIDATES) {
    try {
      const rows = await runQuery(sql, start, end);
      console.log(`  [ok]   ${label}: ${rows.length} row(s)`);
      return rows;
    } catch (err) {
      console.log(`  [fail] ${label}: ${err.message}`);
      problems.push(`${label}: ${err.message}`);
    }
  }

  // Every shape failed. That is a broken check, and it must exit non-zero
  // rather than let an unqueryable log stream read as a healthy digest.
  throw new Error(`no logs query shape was accepted:\n  ${problems.join('\n  ')}`);
}

/**
 * Pulls the row array out of the logs response.
 *
 * An unrecognised shape THROWS rather than returning [], because "I could not
 * read the answer" must never be reported as "nothing is wrong". The first
 * version returned `body?.result ?? []`, so any shape change would have made
 * this check permanently, silently green — the precise failure it exists to
 * catch.
 */
export function extractRows(body) {
  // The endpoint answers HTTP 200 with {result: null, error: "..."} when the
  // SQL itself is rejected. Surfacing that beats reporting an empty window:
  // a query this check cannot run is a broken check, not a quiet day.
  if (body && typeof body === 'object' && body.error) {
    throw new Error(
      `logs query rejected: ${typeof body.error === 'string' ? body.error : JSON.stringify(body.error)}`,
    );
  }
  for (const candidate of [body?.result, body?.data, body?.rows, body]) {
    if (Array.isArray(candidate)) return candidate;
  }
  throw new Error(
    `unrecognised logs response shape (keys: ${JSON.stringify(Object.keys(body ?? {}))}, ` +
      `result type: ${Object.prototype.toString.call(body?.result)}, ` +
      `result preview: ${JSON.stringify(body?.result)?.slice(0, 300)})`,
  );
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
