// Author page URLs: /author/<name>-<id8>/, e.g. /author/brittany-e19f3fd0/.
//
// The first 8 hex characters of the author id identify the author; the name
// part is only for readers. So renaming an author, or a second author with the
// same name, never changes which page a URL resolves to — a stale name part
// 301s to the current one instead of 404ing.
//
// Plain ESM (types in authorSlug.d.ts) so `node --test` can exercise it.

const ID_PREFIX_LENGTH = 8;

export function slugifyName(name) {
  return String(name ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Canonical slug for an author: "<name>-<first 8 of id>". */
export function authorSlug(author) {
  const name = slugifyName(author.display_name) || "author";
  return `${name}-${String(author.author_id).replace(/-/g, "").slice(0, ID_PREFIX_LENGTH).toLowerCase()}`;
}

/**
 * Resolve a requested slug to an author.
 *
 * - "<anything>-<id8>": the id prefix decides; the name part may be stale.
 * - Name only (the first URL shape, live briefly before ids were added): matches
 *   when exactly one author's current name slug equals it.
 *
 * Returns { author, slug } where slug is the canonical one — the caller
 * redirects when it differs from what was requested — or null.
 */
export function resolveAuthorSlug(requested, authors) {
  const slug = String(requested ?? "").toLowerCase();
  const m = slug.match(/-([0-9a-f]{8})$/);
  if (m) {
    const matches = authors.filter((a) =>
      String(a.author_id).replace(/-/g, "").toLowerCase().startsWith(m[1]),
    );
    if (matches.length === 1) return { author: matches[0], slug: authorSlug(matches[0]) };
    return null;
  }
  const byName = authors.filter((a) => (slugifyName(a.display_name) || "author") === slug);
  if (byName.length === 1) return { author: byName[0], slug: authorSlug(byName[0]) };
  return null;
}
