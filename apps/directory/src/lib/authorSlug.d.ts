// Types only — the implementation lives in authorSlug.mjs (plain ESM so
// `node --test` can exercise the URL rules directly).

export type AuthorIdentity = { author_id: string; display_name: string | null };

export declare function slugifyName(name: string | null | undefined): string;

/** Canonical slug for an author: "<name>-<first 8 of id>". */
export declare function authorSlug(author: AuthorIdentity): string;

/** The author a requested slug points at, with its canonical slug; null if none. */
export declare function resolveAuthorSlug<A extends AuthorIdentity>(
  requested: string,
  authors: A[],
): { author: A; slug: string } | null;
