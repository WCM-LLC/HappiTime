import assert from "node:assert/strict";
import test from "node:test";
import { buildVenueSearchOr, VENUE_SEARCH_FIELDS } from "./venueSearchOr.mjs";

test("plain query produces an ilike clause per field", () => {
  const or = buildVenueSearchOr("rockhill");
  assert.ok(or);
  const clauses = or.split(",");
  assert.equal(clauses.length, VENUE_SEARCH_FIELDS.length);
  assert.ok(clauses.includes("name.ilike.%rockhill%"));
  assert.ok(clauses.includes("org_name.ilike.%rockhill%"));
});

test("empty / whitespace / null return null", () => {
  assert.equal(buildVenueSearchOr(""), null);
  assert.equal(buildVenueSearchOr("   "), null);
  assert.equal(buildVenueSearchOr(null), null);
  assert.equal(buildVenueSearchOr(undefined), null);
});

test("filter-grammar characters are stripped, not passed through", () => {
  const or = buildVenueSearchOr("rock,hill (grille) 100%");
  assert.ok(or);
  assert.ok(!or.includes("(") && !or.includes(")"));
  // Commas only separate the clauses we built; each clause keeps the
  // sanitized query with grammar chars collapsed to single spaces.
  assert.ok(or.split(",").every((c) => c.endsWith(".ilike.%rock hill grille 100%")));
});

test("query that is only grammar characters returns null", () => {
  assert.equal(buildVenueSearchOr("%,()"), null);
});

test("multi-word query keeps interior spaces intact", () => {
  const or = buildVenueSearchOr("  The Rockhill   Grille  ");
  assert.ok(or);
  assert.ok(or.startsWith("name.ilike.%The Rockhill Grille%"));
});
