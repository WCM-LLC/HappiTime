#!/usr/bin/env node
// Uptime tripwire for the two surfaces users actually depend on: PostgREST
// (all app + directory data) and GoTrue (every login).
//
// Written after the 2026-08-12 outage. For roughly half an hour both hung
// completely — TLS handshakes completed in 0.12s and then nothing came back —
// while happitime.biz still served 200s from Vercel and the Supabase dashboard
// still reported the project ACTIVE_HEALTHY. Nothing alerted; we found out
// because a person tried to log in.
//
// Two lessons are baked into the thresholds below:
//
//   1. "Up" has to mean "answers, quickly". A status field saying healthy told
//      us nothing, and a hung request looks identical to a slow one until you
//      put a number on it.
//   2. The check has to run somewhere that does not sleep. A watchdog on a
//      laptop stops silently when the lid closes, and a silent monitor is
//      indistinguishable from a healthy service.
//
// Requires SUPABASE_PROJECT_REF and SUPABASE_ANON_KEY (repo secrets — the anon
// key is already public, it ships in the mobile bundle and the web client).
// Read-only: it reads one id from venues and GoTrue's public settings.

import { pathToFileURL } from 'node:url';

const ref = process.env.SUPABASE_PROJECT_REF;
const anonKey = process.env.SUPABASE_ANON_KEY;

const isCli = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

/** A response slower than this is treated as a fault, not just latency. */
export const SLOW_MS = 5000;
/** Per-request abort. Comfortably above SLOW_MS so slow and dead stay distinguishable. */
export const TIMEOUT_MS = 15000;
/** A single blip is not an outage; this many consecutive failures is. */
export const ATTEMPTS = 2;
/** Gap between attempts, long enough to outlast a momentary hiccup. */
export const RETRY_DELAY_MS = 5000;

/**
 * Pure verdict, so the thresholds are testable without network access.
 * `results` is one entry per surface: { name, ok, status, ms, error }.
 */
export function evaluateUptime(results) {
  const failures = [];
  for (const r of results) {
    if (!r.ok) {
      failures.push(
        r.error
          ? `${r.name}: no response (${r.error})`
          : `${r.name}: HTTP ${r.status}`,
      );
    } else if (r.ms > SLOW_MS) {
      failures.push(`${r.name}: responded in ${r.ms}ms (over ${SLOW_MS}ms)`);
    }
  }
  if (failures.length > 0) {
    return {
      healthy: false,
      message:
        'TRIPWIRE: Supabase is not serving users.\n  ' +
        failures.join('\n  ') +
        '\nCheck https://status.supabase.com, then restart the project if it is ' +
        'project-specific:\n  ' +
        `https://supabase.com/dashboard/project/${ref ?? '<ref>'}/settings/general`,
    };
  }
  return {
    healthy: true,
    message: results.map((r) => `OK: ${r.name} ${r.ms}ms`).join('\n'),
  };
}

async function probe(name, url) {
  // Retry before declaring a fault — a scheduled check that cries wolf gets
  // muted, and a muted check is the thing this file exists to prevent.
  let last;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    const started = Date.now();
    try {
      const res = await fetch(url, {
        headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      last = { name, ok: res.ok, status: res.status, ms: Date.now() - started };
    } catch (err) {
      last = {
        name,
        ok: false,
        status: 0,
        ms: Date.now() - started,
        error: err?.name === 'TimeoutError' ? `no response in ${TIMEOUT_MS}ms` : String(err?.message ?? err),
      };
    }
    if (last.ok && last.ms <= SLOW_MS) return last;
    if (attempt < ATTEMPTS) await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
  }
  return last;
}

if (isCli) {
  if (!ref || !anonKey) {
    console.error('Missing SUPABASE_PROJECT_REF and/or SUPABASE_ANON_KEY env vars.');
    process.exit(2);
  }

  const base = `https://${ref}.supabase.co`;
  const results = await Promise.all([
    // A real table read: PostgREST, Postgres, and RLS in one request.
    probe('postgrest', `${base}/rest/v1/venues?select=id&limit=1`),
    // What every login reads before it can render.
    probe('gotrue', `${base}/auth/v1/settings`),
  ]);

  const { healthy, message } = evaluateUptime(results);
  if (!healthy) {
    console.error(message);
    process.exit(1);
  }
  console.log(message);
  console.log('\nUptime check passed.');
}
