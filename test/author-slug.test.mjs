// Author page URLs must not change meaning when an author's details change.
//
// The first URL shape (/author/<name>/) was derived from the display name and
// de-duplicated against the current set of published authors, so renaming an
// author, publishing a second author with the same name, or unpublishing one
// of two duplicates recomputed the slug and turned indexed links into 404s
// (Codex review on #256). URLs now carry the first 8 characters of the author
// id: the id decides, the name part is cosmetic and stale ones redirect.
import test from "node:test";
import assert from "node:assert/strict";

import { authorSlug, resolveAuthorSlug, slugifyName } from "../apps/directory/src/lib/authorSlug.mjs";

const brittany = { author_id: "e19f3fd0-11ba-482c-ab5a-6fe603cad36d", display_name: "Brittany" };
const juan = { author_id: "406d17d9-50c7-4a06-bbbc-5ad00c8e6aec", display_name: "Juan Williams" };
const otherBrittany = { author_id: "aa11bb22-0000-4000-8000-000000000000", display_name: "Brittany" };

test("canonical slug is the name plus the first 8 of the id", () => {
  assert.equal(authorSlug(brittany), "brittany-e19f3fd0");
  assert.equal(authorSlug(juan), "juan-williams-406d17d9");
});

test("a nameless author still gets a usable slug", () => {
  assert.equal(authorSlug({ author_id: brittany.author_id, display_name: null }), "author-e19f3fd0");
  assert.equal(authorSlug({ author_id: brittany.author_id, display_name: "!!!" }), "author-e19f3fd0");
});

test("names slugify to plain ascii", () => {
  assert.equal(slugifyName("José  O'Brien"), "jose-o-brien");
});

test("the canonical slug resolves to its author with no redirect", () => {
  const r = resolveAuthorSlug("brittany-e19f3fd0", [brittany, juan]);
  assert.equal(r.author, brittany);
  assert.equal(r.slug, "brittany-e19f3fd0");
});

test("renaming an author keeps the old URL working, pointing at the new slug", () => {
  const renamed = { ...brittany, display_name: "Brittany Jones" };
  const r = resolveAuthorSlug("brittany-e19f3fd0", [renamed, juan]);
  assert.equal(r.author, renamed);
  assert.equal(r.slug, "brittany-jones-e19f3fd0", "caller redirects to this");
});

test("a second author with the same name does not move the first one's URL", () => {
  const before = resolveAuthorSlug("brittany-e19f3fd0", [brittany]);
  const after = resolveAuthorSlug("brittany-e19f3fd0", [brittany, otherBrittany]);
  assert.equal(before.slug, after.slug);
  assert.equal(after.author, brittany);
  assert.notEqual(authorSlug(otherBrittany), authorSlug(brittany));
});

test("an unknown id prefix is a 404, even when the name matches someone", () => {
  assert.equal(resolveAuthorSlug("brittany-00000000", [brittany]), null);
});

test("the old name-only URL redirects when the name is unambiguous", () => {
  const r = resolveAuthorSlug("brittany", [brittany, juan]);
  assert.equal(r.author, brittany);
  assert.equal(r.slug, "brittany-e19f3fd0");
  assert.equal(resolveAuthorSlug("juan-williams", [brittany, juan]).slug, "juan-williams-406d17d9");
});

test("an old name-only URL shared by two authors cannot guess, so it 404s", () => {
  assert.equal(resolveAuthorSlug("brittany", [brittany, otherBrittany]), null);
});

test("matching ignores case", () => {
  assert.equal(resolveAuthorSlug("Brittany-E19F3FD0", [brittany]).author, brittany);
});
