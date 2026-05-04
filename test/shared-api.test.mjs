import test from "node:test";
import assert from "node:assert/strict";

import { createSupabaseClient, fetchWindowMenus } from "@happitime/shared-api";

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

test("fetchWindowMenus reads menus scoped to a happy hour window", async () => {
  const calls = [];
  const rows = [
    {
      happy_hour_window_id: "win-1",
      menus: {
        id: "menu-1",
        venue_id: "venue-1",
        name: "Happy Hour Drinks",
        status: "published",
        is_active: true,
        sections: [
          {
            id: "section-2",
            name: "Late",
            sort_order: 2,
            items: [
              {
                id: "item-2",
                name: "Regular price item",
                description: null,
                price: 12,
                is_happy_hour: false,
                sort_order: 1,
              },
            ],
          },
          {
            id: "section-1",
            name: "Early",
            sort_order: 1,
            items: [
              {
                id: "item-1",
                name: "House Margarita",
                description: "Lime, tequila",
                price: 7,
                is_happy_hour: true,
                sort_order: 2,
              },
            ],
          },
        ],
      },
    },
    {
      happy_hour_window_id: "win-1",
      menus: {
        id: "menu-2",
        venue_id: "venue-2",
        name: "Other Venue",
        status: "published",
        is_active: true,
        sections: [],
      },
    },
  ];

  const query = {
    select(columns) {
      calls.push({ method: "select", columns });
      return this;
    },
    eq(column, value) {
      calls.push({ method: "eq", column, value });
      return Promise.resolve({ data: rows, error: null });
    },
  };

  const supabase = {
    from(table) {
      calls.push({ method: "from", table });
      return query;
    },
  };

  const menus = await fetchWindowMenus("win-1", "venue-1", { supabase });

  assert.equal(calls[0].table, "happy_hour_window_menus");
  assert.deepEqual(
    calls.find((call) => call.method === "eq"),
    { method: "eq", column: "happy_hour_window_id", value: "win-1" }
  );
  assert.equal(menus.length, 1);
  assert.equal(menus[0].id, "menu-1");
  assert.deepEqual(
    menus[0].sections.map((section) => section.id),
    ["section-1", "section-2"]
  );
  assert.deepEqual(
    menus.flatMap((menu) => menu.sections.flatMap((section) => section.items.map((item) => item.id))),
    ["item-1", "item-2"]
  );
});

test("fetchWindowMenus can include attached menus before items exist", async () => {
  const rows = [
    {
      happy_hour_window_id: "win-1",
      menus: {
        id: "menu-empty",
        venue_id: "venue-1",
        name: "Drafted Specials",
        status: "published",
        is_active: true,
        sections: [
          {
            id: "section-empty",
            name: "Cocktails",
            sort_order: 1,
            items: [],
          },
        ],
      },
    },
  ];

  const query = {
    select() {
      return this;
    },
    eq() {
      return Promise.resolve({ data: rows, error: null });
    },
  };

  const supabase = {
    from() {
      return query;
    },
  };

  const hiddenByDefault = await fetchWindowMenus("win-1", "venue-1", { supabase });
  const included = await fetchWindowMenus("win-1", "venue-1", {
    supabase,
    includeEmptyMenus: true,
  });

  assert.equal(hiddenByDefault.length, 0);
  assert.equal(included.length, 1);
  assert.equal(included[0].name, "Drafted Specials");
  assert.equal(included[0].sections[0].name, "Cocktails");
  assert.deepEqual(included[0].sections[0].items, []);
});
