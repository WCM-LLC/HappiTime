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
//   2. zero email-provider signups landed in auth.users in the trailing 7 days
//      (email was our #1 signup method; a flat week means it's broken).
//
// Requires SUPABASE_ACCESS_TOKEN + SUPABASE_PROJECT_REF (repo secrets, see
// DEPLOYMENT.md). Read-only: analytics logs query + a SELECT via the
// Management API — never touches table data.

const token = process.env.SUPABASE_ACCESS_TOKEN;
const ref = process.env.SUPABASE_PROJECT_REF;

if (!token || !ref) {
  console.error("Missing SUPABASE_ACCESS_TOKEN and/or SUPABASE_PROJECT_REF env vars.");
  process.exit(2);
}

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

// ── Check 2: email-provider signups flatlined for 7 days ────────────────────
async function checkEmailSignups() {
  const rows = await managementApi(`/v1/projects/${ref}/database/query`, {
    method: "POST",
    body: JSON.stringify({
      query: `
        select
          count(*) filter (where created_at > now() - interval '7 days')::int as last_7d,
          max(created_at) as last_signup
        from auth.users
        where raw_app_meta_data->>'provider' = 'email'
      `,
    }),
  });
  const { last_7d, last_signup } = rows[0] ?? {};
  if (!last_7d) {
    console.error(`TRIPWIRE: zero email-provider signups in the trailing 7 days (last one: ${last_signup ?? "never"}).`);
    console.error("Email magic-link auth may be silently broken — send a test magic link and check the auth logs.");
    return false;
  }
  console.log(`OK: ${last_7d} email-provider signup(s) in the trailing 7 days (last: ${last_signup}).`);
  return true;
}

const results = await Promise.allSettled([checkAuthEndpointErrors(), checkEmailSignups()]);
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
