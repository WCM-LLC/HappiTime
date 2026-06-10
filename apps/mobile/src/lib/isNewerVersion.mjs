// src/lib/isNewerVersion.mjs
// Pure dotted-numeric version comparison. .mjs + colocated .d.ts so `node --test`
// can EXECUTE it on CI while the app gets types (same pattern as parseVenueLink).
// Fail-safe: malformed input returns false so a bad value never triggers a prompt.

function parse(v) {
  if (typeof v !== "string") return null;
  const parts = v.trim().split(".");
  if (parts.length === 0 || parts.length > 3) return null;
  const nums = [0, 0, 0];
  for (let i = 0; i < parts.length; i++) {
    if (!/^\d+$/.test(parts[i])) return null;
    nums[i] = parseInt(parts[i], 10);
  }
  return nums;
}

export function isNewerVersion(latest, running) {
  const a = parse(latest);
  const b = parse(running);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) {
    if (a[i] > b[i]) return true;
    if (a[i] < b[i]) return false;
  }
  return false;
}
