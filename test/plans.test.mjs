import test from "node:test";
import assert from "node:assert/strict";

// Import directly from the local dist to avoid the monorepo workspace
// symlink pointing to the main-branch compiled output.
import { getVenuePlan, getUserPlan } from "../packages/shared-api/dist/plans.js";

// Builds a minimal Supabase client mock that responds to the chained query
// used by getVenuePlan / getUserPlan:
//   client.from(...).select(...).eq(...).maybeSingle()
function makeMockClient(data) {
  const q = {
    select: () => q,
    eq: () => q,
    maybeSingle: async () => ({ data, error: null }),
  };
  return { from: () => q };
}

// ── getVenuePlan ─────────────────────────────────────────────────────────────

test("getVenuePlan returns 'listed' when no record exists (null data)", async () => {
  const plan = await getVenuePlan("venue-uuid-1", makeMockClient(null));
  assert.equal(plan, "listed");
});

test("getVenuePlan returns the stored plan when status is 'active'", async () => {
  const plan = await getVenuePlan(
    "venue-uuid-2",
    makeMockClient({ plan: "verified", status: "active" })
  );
  assert.equal(plan, "verified");
});

test("getVenuePlan returns the stored plan when status is 'trialing'", async () => {
  const plan = await getVenuePlan(
    "venue-uuid-3",
    makeMockClient({ plan: "featured", status: "trialing" })
  );
  assert.equal(plan, "featured");
});

test("getVenuePlan returns 'listed' when status is 'past_due' (fail-open)", async () => {
  const plan = await getVenuePlan(
    "venue-uuid-4",
    makeMockClient({ plan: "featured", status: "past_due" })
  );
  assert.equal(plan, "listed");
});

test("getVenuePlan returns 'listed' for legacy/unknown venue plans (e.g. retired 'premium')", async () => {
  const plan = await getVenuePlan(
    "venue-uuid-5",
    makeMockClient({ plan: "premium", status: "active" })
  );
  assert.equal(plan, "listed");
});

// ── getUserPlan ──────────────────────────────────────────────────────────────

test("getUserPlan returns 'free' when no record exists (null data)", async () => {
  const plan = await getUserPlan("user-uuid-1", makeMockClient(null));
  assert.equal(plan, "free");
});

test("getUserPlan returns 'power' when plan is 'power' and status is 'active'", async () => {
  const plan = await getUserPlan(
    "user-uuid-2",
    makeMockClient({ plan: "power", status: "active" })
  );
  assert.equal(plan, "power");
});

test("getUserPlan returns 'free' when status is 'inactive' (fail-open)", async () => {
  const plan = await getUserPlan(
    "user-uuid-3",
    makeMockClient({ plan: "power", status: "inactive" })
  );
  assert.equal(plan, "free");
});

test("getUserPlan returns 'free' when plan is already 'free' and status is 'active'", async () => {
  const plan = await getUserPlan(
    "user-uuid-4",
    makeMockClient({ plan: "free", status: "active" })
  );
  assert.equal(plan, "free");
});
