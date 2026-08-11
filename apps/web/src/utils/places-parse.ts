// Address-component parsing for Google Places API v1 responses.
// Ported from supabase/functions/import-places/index.ts (Deno) — the pure
// helpers only; keep the two in sync if component handling ever changes.

export type PlacesAddressComponent = {
  longText?: string | null;
  shortText?: string | null;
  types?: string[];
};

/** Normalizes a single address/name part to a clean string; returns "" for null, 0, "unknown", or "n/a". */
export const normalizePart = (part: string | number | null | undefined) => {
  if (part == null) return '';
  if (typeof part === 'number') {
    if (!Number.isFinite(part) || part === 0) return '';
    return String(part).trim();
  }
  const text = String(part).trim();
  if (!text) return '';
  const lower = text.toLowerCase();
  if (lower === 'unknown' || lower === 'n/a' || lower === 'na' || lower === '0') {
    return '';
  }
  return text;
};

/** Normalizes a zip code string, collapsing internal whitespace. */
export const normalizeZip = (zip: string) => {
  const normalized = normalizePart(zip);
  if (!normalized) return '';
  return normalized.replace(/\s+/g, ' ').trim();
};

/** Finds the first Places address component with the given type tag. */
const getComponent = (
  components: PlacesAddressComponent[] | undefined,
  type: string,
) => components?.find((component) => component.types?.includes(type));

/** Extracts the text of an address component by type; prefers long form unless preferShort is true. */
const getComponentText = (
  components: PlacesAddressComponent[] | undefined,
  type: string,
  preferShort = false,
) => {
  const component = getComponent(components, type);
  if (!component) return '';
  const primary = preferShort ? component.shortText : component.longText;
  const fallback = preferShort ? component.longText : component.shortText;
  return normalizePart(primary ?? fallback ?? '');
};

/** Assembles a street address from number + route, falling back to premise, and appending subpremise when present. */
export const buildStreetAddress = (
  components: PlacesAddressComponent[] | undefined,
) => {
  const streetNumber = getComponentText(components, 'street_number');
  const route = getComponentText(components, 'route');
  const premise = getComponentText(components, 'premise');
  const subpremise = getComponentText(components, 'subpremise');
  let address = [streetNumber, route].filter(Boolean).join(' ');
  if (!address && premise) {
    address = premise;
  }
  if (address && subpremise) {
    address = `${address} #${subpremise}`;
  }
  return address;
};

/** Extracts the city from address components, trying multiple administrative types as fallbacks. */
export const getCity = (components: PlacesAddressComponent[] | undefined) =>
  getComponentText(components, 'locality') ||
  getComponentText(components, 'postal_town') ||
  getComponentText(components, 'sublocality_level_1') ||
  getComponentText(components, 'administrative_area_level_2');

/** Extracts the 2-letter state/province abbreviation using the short text form of administrative_area_level_1. */
export const getState = (components: PlacesAddressComponent[] | undefined) =>
  getComponentText(components, 'administrative_area_level_1', true);

/** Extracts the postal code from address components. */
export const getZip = (components: PlacesAddressComponent[] | undefined) =>
  getComponentText(components, 'postal_code');
