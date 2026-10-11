// Length rules for search snippets. A title renders as "<own part> | HappiTime"
// (the layout template adds 12 chars), so the page's own part gets 18–48 to land
// at 30–60. A meta description reads best at 110–160 chars.
export const TITLE_MIN = 18;
export const TITLE_MAX = 48;
export const DESCRIPTION_MIN = 110;
export const DESCRIPTION_MAX = 160;

/**
 * First title candidate that fits 18–48 chars. When none fit, the last
 * candidate is returned and the miss is logged — never silently truncated.
 */
export function fitTitle(candidates: string[]): string {
  const fit = candidates.find((c) => c.length >= TITLE_MIN && c.length <= TITLE_MAX);
  if (fit) return fit;
  const fallback = candidates[candidates.length - 1];
  console.warn(`[seo] title outside ${TITLE_MIN}-${TITLE_MAX} chars: "${fallback}"`);
  return fallback;
}

/**
 * Builds a 110–160 char description from sentences in priority order. A
 * sentence that would push past 160 is skipped (so callers can list a long
 * variant followed by a short one); adding stops once 110 is reached.
 */
export function fitDescription(sentences: string[]): string {
  let out = "";
  for (const s of sentences) {
    if (out.length >= DESCRIPTION_MIN) break;
    const next = out ? `${out} ${s}` : s;
    if (next.length <= DESCRIPTION_MAX) out = next;
  }
  if (out.length < DESCRIPTION_MIN) {
    console.warn(`[seo] description under ${DESCRIPTION_MIN} chars: "${out}"`);
  }
  return out;
}

/**
 * Default share card for pages with no image of their own. A static file (not
 * the opengraph-image route): with trailingSlash on, that route 308-redirects,
 * and not every link unfurler follows redirects. Next resolves the relative URL
 * against metadataBase. A page that sets `openGraph` replaces the layout's
 * block wholesale, so each one must list an image explicitly.
 */
export const DEFAULT_OG_IMAGE = {
  url: "/og/default.png",
  width: 1200,
  height: 630,
  alt: "HappiTime — Kansas City happy hours, live right now",
};
