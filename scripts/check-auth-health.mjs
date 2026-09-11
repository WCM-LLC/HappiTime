#!/usr/bin/env node
// Daily auth-health tripwire (.github/workflows/auth-health.yml).
//
// Added after the 2026-06 magic-link outage ran ~30 days undetected: every
// POST /otp returned 500 (broken mailer template + unverified SMTP sender)
// while OAuth kept working, so nothing user-facing ever alerted us.
//
// Trips (exit 1) when either:
//   1. any email-auth endpoint (/otp, /signup, /recover, /magiclink, /resend)
//      returned a 5xx in the last 24h (auth service logs), or
//   2. magic links were REQUESTED in the last 24h but nothing converted —
//      requests accepted, nobody signed in. That is what a silently broken
//      mailer looks like from the outside: 200s on the way in, no arrivals.
//
// Check 2 originally tripped on "zero email signups in 7 days", on the premise
// that email was our #1 signup method. OAuth overtook it in June 2026, so that
// condition started measuring DEMAND, not health: it went red for 16 straight
// days in Jul-Aug 2026 while magic links worked fine (verified by hand). A
// permanently-red alarm is worse than no alarm, because it buries check 1.
// Conversion is the honest signal — no requests means nothing to verify, and
// the check stays quiet instead of crying wolf.
//
// Requires SUPABASE_ACCESS_TOKEN + SUPABASE_PROJECT_REF (repo secrets, see
// DEPLOYMENT.md). Read-only: analytics logs query + a SELECT via the
// Management API — never touches table data.

import { pathToFileURL } from "node:url";

const token = process.env.SUPABASE_ACCESS_TOKEN;
const ref = process.env.SUPABASE_PROJECT_REF;

// Only the CLI path needs credentials. Tests import evaluateEmailConversion to
// exercise the thresholds, and must not exit on a missing token.
const isCli = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

const API = "https://api.supabase.com";

async function managementApi(path, init = {}) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`${init.method ?? "GET"} ${path} -> HTTP ${res.status}: ${body.slice(0, 500)}`);
  }
  return res.json();
}

// ── Check 1: 5xx responses on email-auth endpoints in the last 24h ──────────
async function checkAuthEndpointErrors() {
  const end = new Date();
  const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
  // Logs queries use the analytics (BigQuery-style) dialect over auth_logs.
  // Auth request-completed entries carry {"path":"/otp","status":500,...} in
  // event_message, so match the raw JSON rather than relying on metadata shape.
  const sql = `
    select t.timestamp, t.event_message
    from auth_logs t
    where regexp_contains(t.event_message, '"path":"/(otp|signup|recover|magiclink|resend)"')
      and regexp_contains(t.event_message, '"status":5[0-9][0-9]')
    order by t.timestamp desc
    limit 10
  `;
  const params = new URLSearchParams({
    sql,
    iso_timestamp_start: start.toISOString(),
    iso_timestamp_end: end.toISOString(),
  });
  const data = await managementApi(`/v1/projects/${ref}/analytics/endpoints/logs.all?${params}`);
  const rows = data.result ?? [];
  if (rows.length > 0) {
    console.error(`TRIPWIRE: ${rows.length}${rows.length === 10 ? "+" : ""} 5xx response(s) on email-auth endpoints (/otp, /signup, /recover, /magiclink, /resend) in the last 24h.`);
    console.error("Most recent entries:");
    for (const row of rows.slice(0, 3)) {
      console.error(`  ${String(row.event_message).slice(0, 300)}`);
    }
    console.error(`Check auth logs: https://supabase.com/dashboard/project/${ref}/logs/auth-logs`);
    return false;
  }
  console.log("OK: no 5xx responses on email-auth endpoints in the last 24h.");
  return true;
}

// ── Check 2: magic links requested but not converting ───────────────────────

// A single unclicked magic link is normal (people request and wander off), so
// require a few before calling zero conversions a fault.
export const MIN_REQUESTS_TO_JUDGE = 3;

/**
 * Pure decision so the thresholds are testable without hitting the network.
 * Returns { healthy, message } — `healthy: true` with no requests means "quiet,
 * nothing to verify", NOT "verified working".
 */
export function evaluateEmailConversion({ requests, conversions, minRequests = MIN_REQUESTS_TO_JUDGE }) {
  if (requests === 0) {
    return { healthy: true, message: "OK: no magic-link requests in the last 24h — nothing to verify." };
  }
  if (conversions > 0) {
    return {
      healthy: true,
      message: `OK: ${conversions} email sign-in(s)/signup(s) from ${requests} magic-link request(s) in the last 24h.`,
    };
  }
  if (requests < minRequests) {
    return {
      healthy: true,
      message: `OK: ${requests} magic-link request(s) and no conversions yet — below the ${minRequests}-request bar to call it broken.`,
    };
  }
  return {
    healthy: false,
    message:
      `TRIPWIRE: ${requests} magic-link request(s) accepted in the last 24h and ZERO email sign-ins or signups.\n` +
      "Links are going out but nobody is arriving — check the mailer template and that the SMTP sender is verified.",
  };
}

async function checkEmailConversion() {
  const end = new Date();
  const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);

  // Requests that the auth service ACCEPTED (2xx). 5xx is check 1's job; a
  // rejected request never promised anyone an email.
  const sql = `
    select count(*) as count
    from auth_logs t
    where regexp_contains(t.event_message, '"path":"/(otp|magiclink)"')
      and regexp_contains(t.event_message, '"status":2[0-9][0-9]')
  `;
  const params = new URLSearchParams({
    sql,
    iso_timestamp_start: start.toISOString(),
    iso_timestamp_end: end.toISOString(),
  });
  const logs = await managementApi(`/v1/projects/${ref}/analytics/endpoints/logs.all?${params}`);
  const requests = Number((logs.result ?? [])[0]?.count ?? 0);

  // Arrivals in the same window: a brand-new email signup, or an existing
  // email identity signing back in. Either proves a link landed and worked.
  const rows = await managementApi(`/v1/projects/${ref}/database/query`, {
    method: "POST",
    body: JSON.stringify({
      query: `
        select
          (select count(*) from auth.users
             where raw_app_meta_data->>'provider' = 'email'
               and created_at > now() - interval '24 hours')::int
          +
          (select count(*) from auth.identities
             where provider = 'email'
               and last_sign_in_at > now() - interval '24 hours')::int
          as conversions
      `,
    }),
  });
  const conversions = Number(rows[0]?.conversions ?? 0);

  const { healthy, message } = evaluateEmailConversion({ requests, conversions });
  if (healthy) console.log(message);
  else {
    console.error(message);
    console.error(`Check auth logs: https://supabase.com/dashboard/project/${ref}/logs/auth-logs`);
  }
  return healthy;
}

if (isCli) {
  if (!token || !ref) {
    console.error("Missing SUPABASE_ACCESS_TOKEN and/or SUPABASE_PROJECT_REF env vars.");
    process.exit(2);
  }

  const results = await Promise.allSettled([checkAuthEndpointErrors(), checkEmailConversion()]);
  let healthy = true;
  for (const r of results) {
    if (r.status === "rejected") {
      console.error(`Health check errored (counts as unhealthy): ${r.reason?.message ?? r.reason}`);
      healthy = false;
    } else if (r.value === false) {
      healthy = false;
    }
  }

  if (!healthy) {
    console.error("\nAuth health check FAILED — email auth needs attention.");
    process.exit(1);
  }
  console.log("\nAuth health check passed.");
}
