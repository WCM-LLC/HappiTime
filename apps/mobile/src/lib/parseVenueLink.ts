// src/lib/parseVenueLink.ts
//
// Pure parser for venue deep links. No React/RN imports, so it is unit-testable
// under `node --test` (Node 24 strips the type annotations). Matches the custom
// scheme the web bridge emits (happitime://venue/{slug}?src=qr) and the https
// landing form (https://happitime.biz/v/{slug}?src=qr). Returns null for any
// non-venue URL (e.g. happitime://auth/...) so the auth listener is unaffected.

export type ParsedVenueLink = { slug: string; src: string | null };

export function parseVenueLink(url: unknown): ParsedVenueLink | null {
  if (typeof url !== "string") return null;
  const [base, rest = ""] = url.split("?");
  const match =
    base.match(/^happitime:\/\/venue\/([^/?#]+)/i) ||
    base.match(/^https:\/\/(?:[a-z0-9-]+\.)?happitime\.biz\/v\/([^/?#]+)/i);
  if (!match) return null;
  let slug: string;
  try {
    slug = decodeURIComponent(match[1]);
  } catch {
    slug = match[1];
  }
  if (!slug) return null;
  const query = rest.split("#")[0];
  const src = new URLSearchParams(query).get("src");
  return { slug, src: src ?? null };
}
