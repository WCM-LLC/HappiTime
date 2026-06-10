// src/lib/parseItineraryLink.mjs
//
// Pure parser for shared-itinerary deep links. Plain ESM (.mjs) with a colocated
// parseItineraryLink.d.ts — same arrangement as parseVenueLink so `node --test`
// can EXECUTE it on CI (Node 20, no .ts imports) while the app still gets types.
//
// Matches the Universal Link the web viewer is served at
// (https://happitime.biz/i/{token}, with or without a trailing slash) and the
// custom-scheme form (happitime://itinerary?token={token}). Returns null for any
// non-itinerary URL so the venue/auth listeners are unaffected.

export function parseItineraryLink(url) {
  if (typeof url !== "string") return null;
  const [base, rest = ""] = url.split("?");

  // https://happitime.biz/i/{token}  (optional trailing slash)
  const httpsMatch = base.match(
    /^https:\/\/(?:[a-z0-9-]+\.)?happitime\.biz\/i\/([^/?#]+)/i,
  );
  if (httpsMatch) {
    return normalize(httpsMatch[1], rest);
  }

  // happitime://itinerary?token={token}
  if (/^happitime:\/\/itinerary(?:[/?#]|$)/i.test(base)) {
    const query = rest.split("#")[0];
    const tokenMatch = query.match(/(?:^|&)token=([^&]*)/i);
    if (tokenMatch) return normalize(tokenMatch[1], rest);
  }

  return null;
}

function normalize(raw, rest = "") {
  let token;
  try {
    token = decodeURIComponent(raw);
  } catch {
    token = raw;
  }
  // share_token is a uuid; reject anything that isn't to avoid bad RPC calls.
  if (!/^[0-9a-fA-F-]{36}$/.test(token)) return null;
  const query = rest.split("#")[0];
  const refMatch = query.match(/(?:^|&)ref=([^&]*)/i);
  let ref = null;
  if (refMatch) { try { ref = decodeURIComponent(refMatch[1]); } catch { ref = refMatch[1]; } }
  ref = ref && /^[a-z0-9_]{2,30}$/i.test(ref.replace(/^@/, "")) ? ref.replace(/^@/, "").toLowerCase() : null;
  return { token, ref };
}
