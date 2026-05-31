// src/lib/parseVenueLink.mjs
//
// Pure parser for venue deep links. Plain ESM (.mjs) with a colocated
// parseVenueLink.d.ts — so `node --test` can import and EXECUTE it on any Node
// version (CI runs Node 20, which can't import .ts), while the app still gets
// types. Metro resolves .mjs (it's in Expo's sourceExts); tsc uses the .d.ts.
//
// Matches the custom scheme the web bridge emits (happitime://venue/{slug}?src=qr)
// and the https landing form (https://happitime.biz/v/{slug}?src=qr). Returns null
// for any non-venue URL (e.g. happitime://auth/...) so the auth listener is unaffected.

export function parseVenueLink(url) {
  if (typeof url !== "string") return null;
  const [base, rest = ""] = url.split("?");
  const match =
    base.match(/^happitime:\/\/venue\/([^/?#]+)/i) ||
    base.match(/^https:\/\/(?:[a-z0-9-]+\.)?happitime\.biz\/v\/([^/?#]+)/i);
  if (!match) return null;
  let slug;
  try {
    slug = decodeURIComponent(match[1]);
  } catch {
    slug = match[1];
  }
  if (!slug) return null;
  const query = rest.split("#")[0];
  const srcMatch = query.match(/(?:^|&)src=([^&]*)/i);
  let src = null;
  if (srcMatch) {
    try {
      src = decodeURIComponent(srcMatch[1]);
    } catch {
      src = srcMatch[1];
    }
  }
  return { slug, src };
}
