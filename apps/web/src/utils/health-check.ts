/**
 * Thresholds and the pure verdict behind GET /api/health.
 *
 * Route files can only export handlers and route config — Next.js fails the
 * build on any other export — so the testable half lives here, the same way
 * intake-content.ts exists apart from the intake routes.
 */

/**
 * A response slower than this is a fault, not just latency.
 * Kept identical to SLOW_MS in scripts/check-uptime.mjs — two monitors
 * disagreeing about what "up" means is worse than having one. Pinned by test.
 */
export const SLOW_MS = 5000;

/** Per-request abort, comfortably above SLOW_MS so slow and dead stay distinguishable. */
export const TIMEOUT_MS = 15000;

export type Probe = {
  name: string;
  ok: boolean;
  status: number | null;
  ms: number;
  error?: string;
};

/**
 * Runs one surface and times it. A hang and a refusal both land in the catch;
 * the elapsed time is what tells them apart afterwards.
 */
export async function probe(
  name: string,
  url: string,
  headers: Record<string, string>,
): Promise<Probe> {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers, signal: controller.signal, cache: 'no-store' });
    return { name, ok: res.ok, status: res.status, ms: Date.now() - started };
  } catch (err) {
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

/**
 * Pure verdict, so the thresholds are testable without touching the network.
 *
 * A slow-but-successful response fails deliberately: during the 2026-08-12
 * outage every binary signal read healthy — 200s from Vercel's cache,
 * ACTIVE_HEALTHY from the dashboard — and latency was the only thing that
 * would have caught it early.
 */
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
