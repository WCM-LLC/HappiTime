/**
 * Campaign attribution for directory events: per-URL params, the session's
 * first touch, and social-referrer inference. Kept free of the Supabase
 * client so instrumentation-client.ts can import it cheaply.
 */

const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "src"];
const UTM_STORAGE_KEY = "ht_first_touch_utm";
// Which page load stored the first touch, so that page's own events keep the
// original label instead of "carried".
const LANDING_STORAGE_KEY = "ht_first_touch_landing";

/** Identifies the current document and path; changes on any navigation. */
function landingKey(): string {
  const origin = typeof performance !== "undefined" ? Math.round(performance.timeOrigin) : 0;
  return `${origin}:${window.location.pathname}`;
}

/**
 * Infer a traffic source from document.referrer when no UTM params are
 * present (e.g. link-in-bio tools or in-app browsers that drop params).
 */
function inferSourceFromReferrer(): string | null {
  if (typeof document === "undefined" || !document.referrer) return null;
  try {
    const host = new URL(document.referrer).hostname;
    if (host === "tiktok.com" || host.endsWith(".tiktok.com")) return "tiktok";
    if (host === "instagram.com" || host.endsWith(".instagram.com"))
      return "instagram";
    if (host === "facebook.com" || host.endsWith(".facebook.com"))
      return "facebook";
    return null;
  } catch {
    return null;
  }
}

/**
 * Campaign attribution for an event, in priority order:
 *
 * 1. Campaign params (utm_* or src) on the current URL, length-capped; absent
 *    params are omitted.
 * 2. The session's first touch, so venue pages reached by browsing from /kc/
 *    stay attributed. Labeled meta.utm_touch = "carried" once the visitor has
 *    navigated; on the landing page itself it keeps its original label, since
 *    HeyCatch may already have stripped the params from the URL.
 * 3. A tiktok/instagram/facebook referrer (meta.utm_touch = "referrer"), for
 *    link-in-bio tools and in-app browsers that drop params.
 *
 * First touch is stored in sessionStorage the first time a session lands with
 * utm_source/src or a social referrer. A later campaign landing doesn't
 * replace it, except that explicit params may upgrade a referrer guess.
 * Storage is best-effort: without it, 1 and 3 still apply per page.
 */
export function getUtmMeta(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const params = new URLSearchParams(window.location.search);
  const out: Record<string, string> = {};
  for (const k of UTM_KEYS) {
    const v = params.get(k);
    if (v) out[k] = v.slice(0, 64);
  }

  let stored: Record<string, string> | null = null;
  let storedLanding: string | null = null;
  try {
    const raw = sessionStorage.getItem(UTM_STORAGE_KEY);
    if (raw) stored = JSON.parse(raw);
    storedLanding = sessionStorage.getItem(LANDING_STORAGE_KEY);
  } catch {
    // Storage unavailable or unparseable: attribute this page on its own.
  }
  const remember = (meta: Record<string, string>) => {
    try {
      sessionStorage.setItem(UTM_STORAGE_KEY, JSON.stringify(meta));
      sessionStorage.setItem(LANDING_STORAGE_KEY, landingKey());
    } catch {
      // Best-effort; this event still carries its own attribution.
    }
  };

  if (Object.keys(out).length > 0) {
    if ((out.utm_source || out.src) && (!stored || stored.utm_touch === "referrer")) {
      remember(out);
    }
    return out;
  }
  if (stored) {
    return storedLanding === landingKey() ? stored : { ...stored, utm_touch: "carried" };
  }
  const inferred = inferSourceFromReferrer();
  if (inferred) {
    const meta = { utm_source: inferred, utm_touch: "referrer" };
    remember(meta);
    return meta;
  }
  return out;
}

/**
 * Record the session's first touch without sending an event. Called from
 * instrumentation-client.ts on every full page load, before HeyCatch's
 * analytics.init(): when the URL has utm_campaign, the SDK strips
 * utm_source/utm_medium/utm_campaign about a second later, which can beat
 * hydration. Running here also covers pages with no PageTracker (guides, /app/).
 */
export function captureFirstTouch(): void {
  getUtmMeta();
}
