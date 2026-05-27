/**
 * smoke-super-user-guides.test.mjs
 *
 * Verifies the Super User access path and guide review gates.
 *
 * Requires a running web server. Set SMOKE_BASE_URL (default http://localhost:3000).
 * Credentialed tests are skipped unless the matching SMOKE_* credentials are set.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const BASE_URL = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
const DIRECTORY_BASE_URL = process.env.SMOKE_DIRECTORY_BASE_URL ?? "http://localhost:3001";
const WEB_SRC = new URL("../apps/web/src/", import.meta.url);

async function tryFetch(url, opts = {}) {
  try {
    return await fetch(url, opts);
  } catch (err) {
    const code = err?.cause?.code ?? err?.code;
    if (code === "ECONNREFUSED" || code === "ENOTFOUND" || code === "EPERM") return null;
    throw err;
  }
}

async function loginAndGetCookies(email, password) {
  const loginRes = await fetch(`${BASE_URL}/login`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ email, password }),
    redirect: "manual",
  }).catch(() => null);
  if (!loginRes) return [];
  return loginRes.headers.getSetCookie?.() ?? [];
}

test("/login renders Super User Access", async (t) => {
  const res = await tryFetch(`${BASE_URL}/login`);
  if (res === null) {
    t.skip(`server not reachable at ${BASE_URL}`);
    return;
  }

  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /Super User Access/);
  assert.match(html, /href="\/super-user\/login\?next=%2Fdashboard%2Fguides%2Fnew"/);
  assert.doesNotMatch(html, /Log in with Apple/);
  assert.doesNotMatch(html, /Log in with Google/);
});

test("/super-user/login renders app-style auth methods", async (t) => {
  const res = await tryFetch(`${BASE_URL}/super-user/login`);
  if (res === null) {
    t.skip(`server not reachable at ${BASE_URL}`);
    return;
  }

  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /Super User login/);
  assert.match(html, /Log in with Apple/);
  assert.match(html, /Log in with Google/);
  assert.match(html, /Send magic link/);
  assert.match(html, /name="next" value="\/dashboard\/guides\/new"/);
});

test("Super User OAuth uses the console origin, not the marketing /kc origin", async () => {
  const superUserLoginPage = await readFile(
    new URL("app/super-user/login/page.tsx", WEB_SRC),
    "utf8",
  );
  const oauthButtons = await readFile(new URL("components/OAuthButtons.tsx", WEB_SRC), "utf8");
  const callbackRoute = await readFile(new URL("app/auth/callback/route.ts", WEB_SRC), "utf8");
  const loginPage = await readFile(new URL("app/login/page.tsx", WEB_SRC), "utf8");

  assert.match(superUserLoginPage, /resolveConsoleOrigin\(await headers\(\)\)/);
  assert.match(superUserLoginPage, /<OAuthButtons next=\{next\}/);
  assert.match(superUserLoginPage, /redirectOrigin=\{redirectOrigin\}/);
  assert.match(loginPage, /loginPathFor\(GUIDE_EDITOR_PATH\)/);
  assert.match(superUserLoginPage, /GUIDE_EDITOR_PATH/);
  assert.match(oauthButtons, /redirectOrigin \?\? window\.location\.origin/);
  assert.match(callbackRoute, /isRecoveryFlow \|\| isGuideAuthoringPath\(next\)/);
});

test("Supabase deployment docs require query-safe console auth redirect URLs", async () => {
  const deployment = await readFile(new URL("../DEPLOYMENT.md", import.meta.url), "utf8");

  assert.match(deployment, /https:\/\/happitime-console\.vercel\.app\/auth\/callback/);
  assert.match(deployment, /https:\/\/happitime-console\.vercel\.app\/auth\/recovery/);
  assert.match(deployment, /https:\/\/happitime-console\.vercel\.app\/auth\/callback\*\*/);
  assert.match(deployment, /https:\/\/happitime-console\.vercel\.app\/auth\/recovery\*\*/);
  assert.match(deployment, /query-safe/);
  assert.match(deployment, /Do not rely on the bare console domain alone/);
});

test("Admin guide review actions are bound to forms, not transient click handlers", async () => {
  const table = await readFile(new URL("app/admin/guides/AdminGuidesTable.tsx", WEB_SRC), "utf8");
  const previewControls = await readFile(
    new URL("app/admin/guides/[id]/preview/ReviewControls.tsx", WEB_SRC),
    "utf8",
  );

  for (const source of [table, previewControls]) {
    assert.match(source, /<ConfirmingForm action=\{approveGuide\}/);
    assert.match(source, /<ConfirmingForm action=\{unpublishGuide\}/);
    assert.match(source, /<form\s+action=\{rejectGuide\}/);
    assert.doesNotMatch(source, /startTransition\(\(\) => \{\}\)/);
  }
});

test("/dashboard/guides (logged-out) redirects through Super User login with next", async (t) => {
  const res = await tryFetch(`${BASE_URL}/dashboard/guides`);
  if (res === null) {
    t.skip(`server not reachable at ${BASE_URL}`);
    return;
  }

  const finalUrl = new URL(res.url);
  assert.equal(finalUrl.pathname, "/super-user/login");
  assert.equal(finalUrl.searchParams.get("next"), "/dashboard/guides");
});

test("/dashboard/guides (Super User session) is accessible", async (t) => {
  const email = process.env.SMOKE_SUPERUSER_EMAIL;
  const password = process.env.SMOKE_SUPERUSER_PASSWORD;
  if (!email || !password) {
    t.skip("SMOKE_SUPERUSER_EMAIL / SMOKE_SUPERUSER_PASSWORD not set");
    return;
  }

  const cookies = await loginAndGetCookies(email, password);
  if (cookies.length === 0) {
    t.skip("could not obtain Super User session cookies");
    return;
  }

  const res = await tryFetch(`${BASE_URL}/dashboard/guides`, {
    headers: { cookie: cookies.join("; ") },
  });
  if (!res) {
    t.skip("could not complete request after login");
    return;
  }

  assert.equal(res.status, 200);
  assert.equal(new URL(res.url).pathname, "/dashboard/guides");
});

test("/dashboard/guides (non-Super User session) is denied", async (t) => {
  const email = process.env.SMOKE_NONADMIN_EMAIL;
  const password = process.env.SMOKE_NONADMIN_PASSWORD;
  if (!email || !password) {
    t.skip("SMOKE_NONADMIN_EMAIL / SMOKE_NONADMIN_PASSWORD not set");
    return;
  }

  const cookies = await loginAndGetCookies(email, password);
  if (cookies.length === 0) {
    t.skip("could not obtain non-admin session cookies");
    return;
  }

  const res = await tryFetch(`${BASE_URL}/dashboard/guides`, {
    headers: { cookie: cookies.join("; ") },
  });
  if (!res) {
    t.skip("could not complete request after login");
    return;
  }

  const finalUrl = new URL(res.url);
  assert.equal(finalUrl.pathname, "/super-user/login");
  assert.equal(finalUrl.searchParams.get("next"), "/dashboard/guides");
  assert.equal(finalUrl.searchParams.get("error"), "not_authorized");
});

test("Super Admin can view Super Users and guide review", async (t) => {
  const email = process.env.SMOKE_ADMIN_EMAIL;
  const password = process.env.SMOKE_ADMIN_PASSWORD;
  if (!email || !password) {
    t.skip("SMOKE_ADMIN_EMAIL / SMOKE_ADMIN_PASSWORD not set");
    return;
  }

  const cookies = await loginAndGetCookies(email, password);
  if (cookies.length === 0) {
    t.skip("could not obtain admin session cookies");
    return;
  }

  for (const path of ["/admin/users", "/admin/guides"]) {
    const res = await tryFetch(`${BASE_URL}${path}`, {
      headers: { cookie: cookies.join("; ") },
    });
    if (!res) {
      t.skip(`could not complete request for ${path}`);
      return;
    }
    assert.equal(res.status, 200, `Expected 200 for ${path}, got ${res.status} at ${res.url}`);
  }
});

test("non-admin cannot view Super Users list", async (t) => {
  const email = process.env.SMOKE_NONADMIN_EMAIL;
  const password = process.env.SMOKE_NONADMIN_PASSWORD;
  if (!email || !password) {
    t.skip("SMOKE_NONADMIN_EMAIL / SMOKE_NONADMIN_PASSWORD not set");
    return;
  }

  const cookies = await loginAndGetCookies(email, password);
  if (cookies.length === 0) {
    t.skip("could not obtain non-admin session cookies");
    return;
  }

  const res = await tryFetch(`${BASE_URL}/admin/users`, {
    headers: { cookie: cookies.join("; ") },
  });
  if (!res) {
    t.skip("could not complete request after login");
    return;
  }

  const finalUrl = new URL(res.url);
  assert.equal(finalUrl.pathname, "/login");
  assert.equal(finalUrl.searchParams.get("error"), "not_admin");
});

test("Super Admin can preview a guide submission", async (t) => {
  const email = process.env.SMOKE_ADMIN_EMAIL;
  const password = process.env.SMOKE_ADMIN_PASSWORD;
  const guideId = process.env.SMOKE_GUIDE_ID;
  if (!email || !password || !guideId) {
    t.skip("SMOKE_ADMIN_EMAIL / SMOKE_ADMIN_PASSWORD / SMOKE_GUIDE_ID not set");
    return;
  }

  const cookies = await loginAndGetCookies(email, password);
  if (cookies.length === 0) {
    t.skip("could not obtain admin session cookies");
    return;
  }

  const res = await tryFetch(`${BASE_URL}/admin/guides/${guideId}/preview`, {
    headers: { cookie: cookies.join("; ") },
  });
  if (!res) {
    t.skip("could not complete preview request");
    return;
  }

  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /Preview Mode/);
});

test("pending public guide slug is not visible on directory", async (t) => {
  const slug = process.env.SMOKE_PENDING_GUIDE_SLUG;
  if (!slug) {
    t.skip("SMOKE_PENDING_GUIDE_SLUG not set");
    return;
  }

  const res = await tryFetch(`${DIRECTORY_BASE_URL}/guides/${slug}/`);
  if (res === null) {
    t.skip(`directory server not reachable at ${DIRECTORY_BASE_URL}`);
    return;
  }

  assert.equal(res.status, 404, `Pending guide should not be public; got ${res.status} at ${res.url}`);
});
