/**
 * smoke-auth.test.mjs
 *
 * Verifies that the Next.js middleware redirects unauthenticated requests for
 * protected routes to /login.
 *
 * Requires a running web server. Set SMOKE_BASE_URL (default http://localhost:3000).
 * Tests are skipped if the server is unreachable.
 */

import test from "node:test";
import assert from "node:assert/strict";

const BASE_URL = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";

async function tryFetch(url, opts = {}) {
  try {
    return await fetch(url, opts);
  } catch (err) {
    const code = err?.cause?.code ?? err?.code;
    if (code === "ECONNREFUSED" || code === "ENOTFOUND") return null;
    throw err;
  }
}

test("/dashboard (logged-out) redirects to /login", async (t) => {
  const res = await tryFetch(`${BASE_URL}/dashboard`);

  if (res === null) {
    t.skip(`server not reachable at ${BASE_URL}`);
    return;
  }

  // fetch follows redirects by default; final URL must be on /login
  const finalPath = new URL(res.url).pathname;
  assert.match(
    finalPath,
    /^\/login/,
    `Expected redirect to /login, got: ${res.url}`
  );
});

test("/orgs (logged-out) redirects to /login", async (t) => {
  const res = await tryFetch(`${BASE_URL}/orgs`);

  if (res === null) {
    t.skip(`server not reachable at ${BASE_URL}`);
    return;
  }

  const finalPath = new URL(res.url).pathname;
  assert.match(
    finalPath,
    /^\/login/,
    `Expected redirect to /login, got: ${res.url}`
  );
});

test("/login (logged-out) is publicly accessible", async (t) => {
  const res = await tryFetch(`${BASE_URL}/login`);

  if (res === null) {
    t.skip(`server not reachable at ${BASE_URL}`);
    return;
  }

  assert.equal(res.status, 200, `/login should return 200, got ${res.status}`);
});
