/**
 * Public health endpoint for an EXTERNAL uptime monitor to poll.
 *
 * Why this exists alongside scripts/check-uptime.mjs (#158): that check runs on
 * GitHub Actions, and GitHub throttles every-10-minutes schedules hard —
 * observed run gaps on 2026-08-12 were 46, 53, 48 and 51 minutes, not the ten
 * the cron implies. A ~50-minute blind window is too wide for the failure it was built
 * for, where the site answered 200s from Vercel's cache while PostgREST and
 * GoTrue hung completely. An external pinger on a true 1-5 minute cadence
 * closes that gap, and it needs one URL to hit.
 *
 * This probes MORE than the Actions check does, on purpose. Reaching this
 * route at all proves Vercel is serving; the probes inside prove Supabase is
 * answering. The 2026-08-12 incident was reported as "the website is down AND
 * no one can log into the app" — both halves in one request is exactly the
 * shape that needs watching.
 *
 * Deliberately unauthenticated: a monitor cannot hold a session, and this
 * leaks nothing an anonymous client could not already learn. It stays cheap —
 * a HEAD-shaped count against venues and GoTrue's public settings — so it
 * cannot become a load amplifier.
 */

import { NextResponse } from 'next/server';

/** Never cache: a cached 200 is precisely the lie this endpoint exists to catch. */
export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * A response slower than this is a fault, not just latency.
 * Kept identical to SLOW_MS in scripts/check-uptime.mjs — two monitors
 * disagreeing about what "up" means is worse than having one. Pinned by test.
 */
export const SLOW_MS = 5000;
/** Per-request abort, comfortably above SLOW_MS so slow and dead stay distinguishable. */
export const TIMEOUT_MS = 15000;

type Probe = {
  name: string;
  ok: boolean;
  status: number | null;
  ms: number;
  error?: string;
};

async function probe(name: string, url: string, headers: Record<string, string>): Promise<Probe> {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers, signal: controller.signal, cache: 'no-store' });
    return { name, ok: res.ok, status: res.status, ms: Date.now() - started };
  } catch (err) {
    // A hang and a refusal both land here; the elapsed time tells them apart.
    return {
      name,
      ok: false,
      status: null,
      ms: Date.now() - started,
      error: err instanceof Error ? err.message : 'unknown error',
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Pure verdict, so thresholds are testable without touching the network. */
export function evaluateProbes(probes: Probe[]): { healthy: boolean; failures: string[] } {
  const failures: string[] = [];
  for (const p of probes) {
    if (!p.ok) {
      failures.push(p.error ? `${p.name}: no response (${p.error})` : `${p.name}: HTTP ${p.status}`);
    } else if (p.ms > SLOW_MS) {
      failures.push(`${p.name}: responded in ${p.ms}ms (over ${SLOW_MS}ms)`);
    }
  }
  return { healthy: failures.length === 0, failures };
}

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Misconfiguration must not read as healthy — that is the whole lesson of
  // the mail outage, where a missing key made every send a silent no-op.
  if (!url || !key) {
    return NextResponse.json(
      { ok: false, error: 'health endpoint misconfigured: Supabase URL or anon key missing' },
      { status: 503, headers: { 'cache-control': 'no-store' } },
    );
  }

  const base = url.replace(/\/$/, '');
  const probes = await Promise.all([
    // One row from the table every surface reads. `head` keeps the body empty.
    probe('postgrest', `${base}/rest/v1/venues?select=id&limit=1`, {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Prefer: 'count=none',
    }),
    // The exact call the login screen makes before it can show a form.
    probe('gotrue', `${base}/auth/v1/settings`, { apikey: key }),
  ]);

  const { healthy, failures } = evaluateProbes(probes);

  return NextResponse.json(
    {
      ok: healthy,
      checks: probes.map((p) => ({ name: p.name, ok: p.ok, ms: p.ms, status: p.status })),
      ...(healthy ? {} : { failures }),
    },
    { status: healthy ? 200 : 503, headers: { 'cache-control': 'no-store' } },
  );
}
