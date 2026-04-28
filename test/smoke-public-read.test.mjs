/**
 * smoke-public-read.test.mjs
 *
 * Verifies that anonymous Supabase reads return data for tables with public
 * (to public / anon) RLS policies.
 *
 * Tables with public anon SELECT policies: venues, happy_hour_windows, menus
 * (all require status = 'published').
 *
 * The `events` table is authenticated-only (no anon policy) — it is tested
 * separately to confirm the query doesn't error, not for row count.
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.
 * Tests are skipped if the env vars are absent.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { createSupabaseClient } from "@happitime/shared-api";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

function makeClient() {
  if (!url || !key) return null;
  return createSupabaseClient({
    supabaseUrl: url,
    supabaseKey: key,
    clientOptions: { auth: { persistSession: false } },
  });
}

test("anonymous client: venues returns >= 1 published row", async (t) => {
  const supabase = makeClient();
  if (!supabase) {
    t.skip("NEXT_PUBLIC_SUPABASE_URL / ANON_KEY not set");
    return;
  }

  const { data, error } = await supabase
    .from("venues")
    .select("id, name, status")
    .eq("status", "published")
    .limit(5);

  assert.equal(error, null, `venues query error: ${error?.message}`);
  assert.ok(Array.isArray(data) && data.length >= 1, `Expected >= 1 published venue, got ${data?.length}`);
});

test("anonymous client: happy_hour_windows returns >= 1 published row", async (t) => {
  const supabase = makeClient();
  if (!supabase) {
    t.skip("NEXT_PUBLIC_SUPABASE_URL / ANON_KEY not set");
    return;
  }

  // The schema uses happy_hour_windows; happy_hours was the legacy table.
  const { data, error } = await supabase
    .from("happy_hour_windows")
    .select("id, status")
    .eq("status", "published")
    .limit(5);

  assert.equal(error, null, `happy_hour_windows query error: ${error?.message}`);
  assert.ok(Array.isArray(data) && data.length >= 1, `Expected >= 1 published window, got ${data?.length}`);
});

test("anonymous client: menus returns >= 1 published row", async (t) => {
  const supabase = makeClient();
  if (!supabase) {
    t.skip("NEXT_PUBLIC_SUPABASE_URL / ANON_KEY not set");
    return;
  }

  const { data, error } = await supabase
    .from("menus")
    .select("id, status")
    .eq("status", "published")
    .limit(5);

  assert.equal(error, null, `menus query error: ${error?.message}`);
  assert.ok(Array.isArray(data) && data.length >= 1, `Expected >= 1 published menu, got ${data?.length}`);
});

test("anonymous client: events query executes without error (authenticated-only, expects 0 rows)", async (t) => {
  const supabase = makeClient();
  if (!supabase) {
    t.skip("NEXT_PUBLIC_SUPABASE_URL / ANON_KEY not set");
    return;
  }

  // events has no anon SELECT policy — RLS returns empty, not an error.
  const { data, error } = await supabase
    .from("events")
    .select("id")
    .limit(1);

  assert.equal(error, null, `events query returned an unexpected error: ${error?.message}`);
  // 0 rows is expected with anon role; presence of rows is also acceptable if policy changes.
  assert.ok(Array.isArray(data), "events query should return an array");
});
