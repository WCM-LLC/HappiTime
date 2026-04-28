/**
 * smoke-admin.test.mjs
 *
 * Verifies admin route protection:
 *   - Unauthenticated request to /admin → redirects to /login (middleware)
 *   - Non-admin authenticated session → redirects to /login?next=/admin&error=not_admin (admin layout)
 *   - Admin authenticated session → 200 (admin layout allows through)
 *
 * Requires a running web server. Set SMOKE_BASE_URL (default http://localhost:3000).
 * Authenticated sub-tests require SMOKE_NONADMIN_EMAIL + SMOKE_NONADMIN_PASSWORD
 * and/or SMOKE_ADMIN_EMAIL + SMOKE_ADMIN_PASSWORD.
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

/** POST credentials to the Supabase auth endpoint and return Set-Cookie headers. */
async function loginAndGetCookies(email, password) {
  const res = await fetch(`${BASE_URL}/api/auth/callback`, {
    method: "POST",
    redirect: "manual",
  }).catch(() => null);
  // Supabase uses a server-action login flow; obtain session via the login page form.
  // We call the Next.js login server action and capture the resulting session cookies.
  const loginRes = await fetch(`${BASE_URL}/login`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ email, password }),
    redirect: "manual",
  }).catch(() => null);
  if (!loginRes) return null;
  return loginRes.headers.getSetCookie?.() ?? [];
}

test("/admin (unauthenticated) redirects to /login", async (t) => {
  const res = await tryFetch(`${BASE_URL}/admin`);

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

test("/admin (non-admin session) redirects to /login?next=/admin&error=not_admin", async (t) => {
  const email = process.env.SMOKE_NONADMIN_EMAIL;
  const password = process.env.SMOKE_NONADMIN_PASSWORD;

  if (!email || !password) {
    t.skip("SMOKE_NONADMIN_EMAIL / SMOKE_NONADMIN_PASSWORD not set");
    return;
  }

  const probe = await tryFetch(`${BASE_URL}/admin`);
  if (probe === null) {
    t.skip(`server not reachable at ${BASE_URL}`);
    return;
  }

  const cookies = await loginAndGetCookies(email, password);
  const res = await tryFetch(`${BASE_URL}/admin`, {
    headers: { cookie: cookies.join("; ") },
  });

  if (!res) {
    t.skip("could not complete request after login");
    return;
  }

  const finalUrl = new URL(res.url);
  assert.match(finalUrl.pathname, /^\/login/, `Expected /login redirect, got: ${res.url}`);
  assert.equal(finalUrl.searchParams.get("error"), "not_admin");
  assert.equal(finalUrl.searchParams.get("next"), "/admin");
});

test("/admin (admin session) is accessible", async (t) => {
  const email = process.env.SMOKE_ADMIN_EMAIL;
  const password = process.env.SMOKE_ADMIN_PASSWORD;

  if (!email || !password) {
    t.skip("SMOKE_ADMIN_EMAIL / SMOKE_ADMIN_PASSWORD not set");
    return;
  }

  const probe = await tryFetch(`${BASE_URL}/admin`);
  if (probe === null) {
    t.skip(`server not reachable at ${BASE_URL}`);
    return;
  }

  const cookies = await loginAndGetCookies(email, password);
  const res = await tryFetch(`${BASE_URL}/admin`, {
    headers: { cookie: cookies.join("; ") },
  });

  if (!res) {
    t.skip("could not complete request after login");
    return;
  }

  assert.equal(res.status, 200, `Expected 200, got ${res.status} at ${res.url}`);
  const finalPath = new URL(res.url).pathname;
  assert.match(finalPath, /^\/admin/, `Expected to stay on /admin, got: ${res.url}`);
});
