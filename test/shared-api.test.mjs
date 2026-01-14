import test from "node:test";
import assert from "node:assert/strict";

import { createSupabaseClient } from "@happitime/shared-api";

test("createSupabaseClient returns a Supabase client", () => {
  const supabase = createSupabaseClient({
    supabaseUrl: "https://example.supabase.co",
    supabaseKey: "sb_publishable_test",
    clientOptions: {
      auth: { persistSession: false },
    },
  });

  assert.equal(typeof supabase.from, "function");
  assert.equal(typeof supabase.auth.getUser, "function");
});

