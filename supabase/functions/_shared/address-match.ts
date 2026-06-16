// Pure address comparison for validate-venue-places. No I/O.
// Compares street number + street name + zip; ignores suite/unit noise and
// common abbreviation differences. Returns a similarity in [0,1].

const ABBREV: Record<string, string> = {
  st: "street", str: "street", ave: "avenue", av: "avenue", blvd: "boulevard",
  rd: "road", dr: "drive", ln: "lane", ct: "court", cir: "circle", sq: "square",
  hwy: "highway", pkwy: "parkway", pl: "place", ter: "terrace", trl: "trail",
  n: "north", s: "south", e: "east", w: "west",
  ne: "northeast", nw: "northwest", se: "southeast", sw: "southwest",
};

const STOP = new Set(["usa", "us", "united", "states"]);

/** Lowercase, strip punctuation, drop suite/unit noise + country, expand abbreviations. */
export function normalizeAddress(raw: string): string {
  const noSuite = (raw || "")
    .toLowerCase()
    .replace(/[.,]/g, " ")
    .replace(/\b(suite|ste|unit|apt|apartment)\b\s*#?\s*\w+/g, " ")
    .replace(/#\s*\w+/g, " ");
  return noSuite
    .split(/\s+/)
    .filter((t) => t && !STOP.has(t))
    .map((t) => ABBREV[t] ?? t)
    .join(" ")
    .trim();
}

const STREET_NUMBER = /^\s*(\d+)\b/;

function dice(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 1;
  if (a.length === 0 || b.length === 0) return 0;
  const setB = new Map<string, number>();
  for (const t of b) setB.set(t, (setB.get(t) ?? 0) + 1);
  let inter = 0;
  for (const t of a) {
    const c = setB.get(t) ?? 0;
    if (c > 0) { inter++; setB.set(t, c - 1); }
  }
  return (2 * inter) / (a.length + b.length);
}

/** Normalized first comma-segment — the street line only (drops city/state/zip/country). */
function streetLine(raw: string): string {
  return normalizeAddress((raw || "").split(",")[0]);
}

/** Street-name word tokens: the street line minus its leading house number. */
function streetNameTokens(street: string): string[] {
  return street.replace(STREET_NUMBER, " ").split(/\s+/).filter(Boolean);
}

/** Last 5-digit group in the normalized full address (zip lives at the end). */
function extractZip(normalizedFull: string): string | null {
  const zips = normalizedFull.match(/\b\d{5}\b/g);
  return zips ? zips[zips.length - 1] : null;
}

/**
 * Similarity in [0,1] between a stored address and Google's formatted address.
 * Compares ONLY street number + street name + zip (city/state excluded as noise).
 * Weighted: 0.35 street-number + 0.35 zip + 0.30 street-name token Dice,
 * renormalized over whichever of {number, zip} are present on BOTH sides.
 */
export function addressMatchScore(stored: string, google: string): number {
  const aStreet = streetLine(stored);
  const bStreet = streetLine(google);

  const aNum = aStreet.match(STREET_NUMBER)?.[1] ?? null;
  const bNum = bStreet.match(STREET_NUMBER)?.[1] ?? null;
  const aZip = extractZip(normalizeAddress(stored));
  const bZip = extractZip(normalizeAddress(google));

  const nameScore = dice(streetNameTokens(aStreet), streetNameTokens(bStreet));

  let weightSum = 0.3;
  let acc = 0.3 * nameScore;
  if (aNum !== null && bNum !== null) {
    weightSum += 0.35;
    acc += 0.35 * (aNum === bNum ? 1 : 0);
  }
  if (aZip !== null && bZip !== null) {
    weightSum += 0.35;
    acc += 0.35 * (aZip === bZip ? 1 : 0);
  }
  return acc / weightSum;
}
