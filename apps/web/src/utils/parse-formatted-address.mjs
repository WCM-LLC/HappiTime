// Pure parser for Google Places v1 `formattedAddress` strings (US-shaped):
// "STREET[, suite], CITY, STATE ZIP[, USA]". No I/O.
// Best-effort: returns whatever it can; a human confirms the result before save.

const COUNTRY = new Set(["usa", "us", "united states", "united states of america"]);
const STATE_ZIP = /^([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)$/;

/**
 * @param {string|null|undefined} formatted
 * @returns {{address: string, city: string, state: string, zip: string}}
 */
export function parseFormattedAddress(formatted) {
  const empty = { address: "", city: "", state: "", zip: "" };
  if (!formatted || typeof formatted !== "string") return empty;

  let parts = formatted
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  // Drop a trailing country segment.
  if (parts.length > 0 && COUNTRY.has(parts[parts.length - 1].toLowerCase())) {
    parts = parts.slice(0, -1);
  }

  if (parts.length === 0) return empty;

  // The last segment should be "STATE ZIP".
  const tail = parts[parts.length - 1];
  const m = tail.match(STATE_ZIP);

  if (!m) {
    // Unexpected shape — put everything we have in `address`.
    return { ...empty, address: parts.join(", ") };
  }

  const state = m[1].toUpperCase();
  const zip = m[2];
  const city = parts.length >= 2 ? parts[parts.length - 2] : "";
  const address = parts.slice(0, Math.max(0, parts.length - 2)).join(", ");

  return { address, city, state, zip };
}
