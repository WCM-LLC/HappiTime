import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import ts from "typescript";

function loadMenuTreeModule() {
  const filePath = path.resolve("apps/web/src/actions/menu-tree.ts");
  const source = fs.readFileSync(filePath, "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  });
  const module = { exports: {} };

  vm.runInNewContext(
    outputText,
    {
      module,
      exports: module.exports,
      require: createRequire(import.meta.url),
      console,
    },
    { filename: filePath },
  );

  return module.exports;
}

function makeCloneSupabase() {
  const state = {
    menus: [],
    sections: [],
    items: [],
  };
  let nextSectionId = 1;

  return {
    state,
    from(table) {
      const query = {
        operation: null,
        payload: null,
        insert(payload) {
          this.operation = "insert";
          this.payload = payload;

          if (table === "menu_items") {
            state.items.push(...payload);
            return Promise.resolve({ error: null });
          }

          return this;
        },
        select() {
          this.operation ??= "select";
          return this;
        },
        delete() {
          this.operation = "delete";
          return this;
        },
        eq(column, value) {
          if (table === "menu_sections" && column === "menu_id" && value === "menu-new") {
            if (this.operation === "select") return Promise.resolve({ data: [], error: null });
            if (this.operation === "delete") return Promise.resolve({ error: null });
          }

          throw new Error(`Unexpected eq(${table}.${column}=${value})`);
        },
        single() {
          if (table === "menus" && this.operation === "insert") {
            state.menus.push(this.payload);
            return Promise.resolve({ data: { id: "menu-new" }, error: null });
          }

          if (table === "menu_sections" && this.operation === "insert") {
            const id = `section-new-${nextSectionId++}`;
            state.sections.push({ id, ...this.payload });
            return Promise.resolve({ data: { id }, error: null });
          }

          throw new Error(`Unexpected single(${table})`);
        },
      };

      return query;
    },
  };
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

test("cloneVenueMenuToVenue creates an independent draft copy with sorted sections and items", async () => {
  const { cloneVenueMenuToVenue } = loadMenuTreeModule();
  const supabase = makeCloneSupabase();

  const menuId = await cloneVenueMenuToVenue(
    supabase,
    {
      id: "source-menu",
      name: "Happy Hour Drinks",
      status: "published",
      is_active: true,
      venue_id: "source-venue",
      menu_sections: [
        {
          id: "section-late",
          name: "Late",
          sort_order: 2,
          menu_items: [
            {
              id: "item-b",
              name: "Second",
              description: null,
              price: 8,
              is_happy_hour: false,
              sort_order: 2,
            },
          ],
        },
        {
          id: "section-early",
          name: "Early",
          sort_order: 1,
          menu_items: [
            {
              id: "item-a2",
              name: "Second Margarita",
              description: "Reposado",
              price: 7,
              is_happy_hour: true,
              sort_order: 2,
            },
            {
              id: "item-a1",
              name: "First Margarita",
              description: "Blanco",
              price: 6,
              is_happy_hour: true,
              sort_order: 1,
            },
          ],
        },
      ],
    },
    {
      orgId: "org-1",
      venueId: "target-venue",
      status: "draft",
    },
  );

  assert.equal(menuId, "menu-new");
  assert.deepEqual(plain(supabase.state.menus), [
    {
      org_id: "org-1",
      venue_id: "target-venue",
      source_menu_id: null,
      scope: "venue",
      name: "Happy Hour Drinks",
      status: "draft",
      is_active: true,
    },
  ]);
  assert.deepEqual(
    plain(supabase.state.sections).map((section) => section.name),
    ["Early", "Late"],
  );
  assert.deepEqual(
    plain(supabase.state.items).map((item) => ({
      section_id: item.section_id,
      name: item.name,
      price: item.price,
      is_happy_hour: item.is_happy_hour,
      sort_order: item.sort_order,
    })),
    [
      {
        section_id: "section-new-1",
        name: "First Margarita",
        price: 6,
        is_happy_hour: true,
        sort_order: 1,
      },
      {
        section_id: "section-new-1",
        name: "Second Margarita",
        price: 7,
        is_happy_hour: true,
        sort_order: 2,
      },
      {
        section_id: "section-new-2",
        name: "Second",
        price: 8,
        is_happy_hour: false,
        sort_order: 2,
      },
    ],
  );
});

test("fetchPublishedVenueMenuTree scopes the source to published menus from other same-org venues", async () => {
  const { fetchPublishedVenueMenuTree } = loadMenuTreeModule();
  const calls = [];
  const query = {
    select(columns) {
      calls.push({ method: "select", columns });
      return this;
    },
    eq(column, value) {
      calls.push({ method: "eq", column, value });
      return this;
    },
    neq(column, value) {
      calls.push({ method: "neq", column, value });
      return this;
    },
    maybeSingle() {
      calls.push({ method: "maybeSingle" });
      return Promise.resolve({ data: null, error: null });
    },
  };
  const supabase = {
    from(table) {
      calls.push({ method: "from", table });
      return query;
    },
  };

  await fetchPublishedVenueMenuTree(supabase, "org-1", "target-venue", "source-menu");

  assert.deepEqual(calls, [
    { method: "from", table: "menus" },
    {
      method: "select",
      columns:
        "id,name,status,is_active,menu_sections(id,name,sort_order,menu_items(id,name,description,price,is_happy_hour,sort_order)),venue_id",
    },
    { method: "eq", column: "id", value: "source-menu" },
    { method: "eq", column: "org_id", value: "org-1" },
    { method: "eq", column: "scope", value: "venue" },
    { method: "eq", column: "status", value: "published" },
    { method: "neq", column: "venue_id", value: "target-venue" },
    { method: "maybeSingle" },
  ]);
});
