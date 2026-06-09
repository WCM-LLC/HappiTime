import test from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { resolveOrgForVenue } from "../apps/web/src/utils/org-resolution.mjs";

// Integration test against a local Supabase stack. Skips in CI (no local DB) —
// matches the repo's other env-gated smoke tests. To run locally:
//   LOCAL_SUPABASE_URL=http://127.0.0.1:54321 \
//   LOCAL_SUPABASE_SERVICE_ROLE_KEY=<service_role key from `supabase status`> \
//   node --test test/promote-org-resolution.test.mjs
const URL = process.env.LOCAL_SUPABASE_URL;
const KEY = process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY;
const skip = !URL || !KEY;

test(
  "resolveOrgForVenue: creates when slug is new, reuses on the same slug",
  { skip: skip ? "LOCAL_SUPABASE_URL / LOCAL_SUPABASE_SERVICE_ROLE_KEY not set" : false },
  async () => {
    const supabase = createClient(URL, KEY, { auth: { persistSession: false } });
    const name = `Test Bar ${Date.now()}`;
    const slug = `test-bar-${Date.now()}`;

    // 1) No existing org with this slug -> create
    const a = await resolveOrgForVenue(supabase, { name, slug });
    assert.equal(a.created, true, "first call should create the org");
    assert.ok(a.orgId, "should return an org id");

    // ownerless: no org_members row was written for the new org
    const { data: members } = await supabase
      .from("org_members")
      .select("user_id")
      .eq("org_id", a.orgId);
    assert.equal((members ?? []).length, 0, "auto-created org must be ownerless");

    // 2) Same slug again -> reuse, no new org
    const b = await resolveOrgForVenue(supabase, { name, slug });
    assert.equal(b.created, false, "second call should reuse");
    assert.equal(b.orgId, a.orgId, "should return the same org id");

    // cleanup
    await supabase.from("organizations").delete().eq("id", a.orgId);
  },
);
