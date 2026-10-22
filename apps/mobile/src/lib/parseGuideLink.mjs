// src/lib/parseGuideLink.mjs
//
// Pure parser for guide deep links. Plain ESM with a colocated .d.ts, same
// arrangement as parseItineraryLink so `node --test` can execute it.
//
// Matches the public guide URL (https://happitime.biz/guides/{slug}/, any
// subdomain, optional trailing slash) and the custom-scheme forms
// happitime://guides/{slug} and happitime://guide?slug={slug}. Returns null for
// anything else so the venue / itinerary / referral listeners are unaffected.
// /guides/ (the index) is NOT a guide link.

export function parseGuideLink(url) {
  if (typeof url !== "string") return null;
  const [base, rest = ""] = url.split("?");

  const httpsMatch = base.match(
    /^https:\/\/(?:[a-z0-9-]+\.)?happitime\.biz\/guides\/([a-z0-9][a-z0-9-]*)\/?$/i,
  );
  if (httpsMatch) return normalize(httpsMatch[1], rest);

  const schemeMatch = base.match(/^happitime:\/\/guides\/([a-z0-9][a-z0-9-]*)\/?$/i);
  if (schemeMatch) return normalize(schemeMatch[1], rest);

  if (/^happitime:\/\/guide(?:[/?#]|$)/i.test(base)) {
    const query = rest.split("#")[0];
    const m = query.match(/(?:^|&)slug=([^&]*)/i);
    if (m) return normalize(m[1], rest);
  }

  return null;
}

function normalize(raw, rest = "") {
  let slug;
  try {
    slug = decodeURIComponent(raw);
  } catch {
    slug = raw;
  }
  slug = slug.toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{0,119}$/.test(slug)) return null;
  const query = rest.split("#")[0];
  const refMatch = query.match(/(?:^|&)ref=([^&]*)/i);
  let ref = null;
  if (refMatch) {
    try { ref = decodeURIComponent(refMatch[1]); } catch { ref = refMatch[1]; }
  }
  ref = ref && /^[a-z0-9_]{2,30}$/i.test(ref.replace(/^@/, "")) ? ref.replace(/^@/, "").toLowerCase() : null;
  return { slug, ref };
}
