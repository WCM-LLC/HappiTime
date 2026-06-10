// src/lib/parseReferralLink.mjs
// Pure parser for personal Insider referral links. Plain ESM (.mjs) with a
// colocated .d.ts so `node --test` can EXECUTE it on Node 20 while the app gets
// types. Matches https://happitime.biz/r/{handle} and happitime://referral/{handle}.
// Returns null for any non-referral URL or malformed handle.

export function parseReferralLink(url) {
  if (typeof url !== "string") return null;
  const base = url.split("?")[0];
  const match =
    base.match(/^https:\/\/(?:[a-z0-9-]+\.)?happitime\.biz\/r\/([^/?#]+)/i) ||
    base.match(/^happitime:\/\/referral\/([^/?#]+)/i);
  if (!match) return null;
  return normalizeHandle(match[1]);
}

// Handles are lowercase letters/numbers/underscore (see onboarding handle rules).
export function normalizeHandle(raw) {
  let h;
  try { h = decodeURIComponent(raw); } catch { h = raw; }
  h = h.replace(/^@/, "").toLowerCase();
  if (!/^[a-z0-9_]{2,30}$/.test(h)) return null;
  return { handle: h };
}
