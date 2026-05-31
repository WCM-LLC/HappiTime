"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Client half of the QR/deep-link landing. On mount it:
 *   1. fires a `track-visit` attribution event (source from ?src=, default 'qr'),
 *      using a persisted anonymous session id so repeat scans dedupe server-side;
 *   2. attempts to open the native app via the happitime:// deep link.
 * Store buttons + "Continue in browser" are always rendered as the fallback.
 *
 * Attribution fires regardless of whether the app opens — the whole point is to
 * count the scan. The edge function is public (no auth), so this is a plain fetch.
 */

const VALID_SOURCES = new Set(["qr", "app_checkin", "push_click", "organic"]);
const SESSION_KEY = "happitime_session_id";

function getSessionId(): string {
  try {
    const existing = window.localStorage.getItem(SESSION_KEY);
    if (existing) return existing;
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `sess-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    window.localStorage.setItem(SESSION_KEY, id);
    return id;
  } catch {
    // localStorage unavailable (private mode) — fall back to an ephemeral id.
    return `sess-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

type Props = {
  slug: string;
  venueId: string;
  source: string;
  appDeepLink: string; // happitime://venue/{slug}
  webVenueUrl: string; // canonical /kc/.../slug page
  appStoreUrl: string;
  playStoreUrl: string;
};

export function VenueLandingClient({
  slug,
  venueId,
  source,
  appDeepLink,
  webVenueUrl,
  appStoreUrl,
  playStoreUrl,
}: Props) {
  const fired = useRef(false);
  const [tracked, setTracked] = useState(false);

  useEffect(() => {
    if (fired.current) return; // guard against double-invoke in React StrictMode
    fired.current = true;

    const cleanSource = VALID_SOURCES.has(source) ? source : "qr";
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (supabaseUrl) {
      // Fire-and-forget: the visit must be counted even if the app opens next.
      fetch(`${supabaseUrl}/functions/v1/track-visit`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(anonKey ? { apikey: anonKey } : {}),
        },
        body: JSON.stringify({
          venue_id: venueId,
          venue_slug: slug,
          source: cleanSource,
          session_id: getSessionId(),
        }),
        keepalive: true,
      })
        .then(() => setTracked(true))
        .catch(() => setTracked(true)); // never block the UI on attribution
    }

    // Attempt to open the native app. If it isn't installed nothing happens and
    // the store/browser fallback below stays on screen.
    const t = window.setTimeout(() => {
      window.location.href = appDeepLink;
    }, 350);
    return () => window.clearTimeout(t);
  }, [slug, venueId, source, appDeepLink]);

  return (
    <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
      <a
        href={appDeepLink}
        className="inline-flex items-center justify-center rounded-lg bg-[#C8965A] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#b3854f]"
      >
        Open in the HappiTime app
      </a>
      <a
        href={webVenueUrl}
        className="inline-flex items-center justify-center rounded-lg border border-[#1A1A1A] px-5 py-2.5 text-sm font-medium text-[#1A1A1A] hover:bg-[#F5F0EB]"
      >
        Continue in browser
      </a>
      <span className="sr-only">{tracked ? "Visit recorded" : "Recording visit"}</span>
      <div className="mt-2 flex w-full flex-col gap-2 sm:mt-0 sm:w-auto sm:flex-row">
        <a
          href={appStoreUrl}
          className="inline-flex items-center justify-center rounded-lg px-3 py-2 text-xs font-medium text-[#6B6B6B] underline hover:text-[#1A1A1A]"
        >
          App Store
        </a>
        <a
          href={playStoreUrl}
          className="inline-flex items-center justify-center rounded-lg px-3 py-2 text-xs font-medium text-[#6B6B6B] underline hover:text-[#1A1A1A]"
        >
          Google Play
        </a>
      </div>
    </div>
  );
}
