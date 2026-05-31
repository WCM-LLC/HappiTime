"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

/**
 * Client half of the QR/deep-link landing. On mount it:
 *   1. fires a `track-visit` attribution event (source from ?src=, default 'qr'),
 *      using a persisted anonymous session id so repeat scans dedupe server-side;
 *   2. attempts to open the native app via the happitime:// deep link.
 * Store buttons + "Continue in browser" are always rendered as the fallback.
 *
 * Attribution fires regardless of whether the app opens — the whole point is to
 * count the scan. It goes through the app's shared Supabase client (the same one
 * tracking.ts/PageTracker use sitewide), so it inherits the configured project
 * URL + anon key and never depends on env vars being inlined into this
 * component's own bundle. track-visit is a public (verify_jwt=false) function.
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
  const [scan, setScan] = useState<"pending" | "ok" | "error">("pending");

  useEffect(() => {
    if (fired.current) return; // guard against double-invoke in React StrictMode
    fired.current = true;

    const cleanSource = VALID_SOURCES.has(source) ? source : "qr";

    // Open the native app exactly once. We delay this until the scan result is
    // on screen so an app-installed user actually SEES "Scan recorded" before the
    // OS switches away — otherwise the redirect backgrounds this page instantly
    // and the confirmation is never observed.
    const timers: number[] = [];
    let redirected = false;
    const openApp = () => {
      if (redirected) return;
      redirected = true;
      window.location.href = appDeepLink; // no-op if the app isn't installed
    };

    const HOLD_AFTER_RESULT_MS = 1000; // keep the result visible this long...
    const MAX_WAIT_MS = 1500; // ...but never delay the hand-off past this ceiling.

    // Hard ceiling: hand off even if attribution is slow or never resolves.
    timers.push(window.setTimeout(openApp, MAX_WAIT_MS));

    // Count the visit (shared client = same config as every other Supabase call).
    void supabase.functions
      .invoke("track-visit", {
        body: {
          venue_id: venueId,
          venue_slug: slug,
          source: cleanSource,
          session_id: getSessionId(),
        },
      })
      .then(() => setScan("ok"))
      .catch(() => setScan("error")) // never block the UI; show a neutral state, not a false success
      .finally(() => {
        // Result is now rendered — hold briefly so it registers, then open the app.
        timers.push(window.setTimeout(openApp, HOLD_AFTER_RESULT_MS));
      });

    return () => timers.forEach((id) => window.clearTimeout(id));
  }, [slug, venueId, source, appDeepLink]);

  return (
    <div className="mt-6 flex flex-col items-center gap-4">
      {/* Visible scan confirmation. The app hand-off is held until this shows
          (see effect above), so an app-installed scanner sees "Scan recorded"
          before the app opens — and it stays for the no-app / stay-in-browser case. */}
      <div
        aria-live="polite"
        className={
          "inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium transition-colors " +
          (scan === "ok"
            ? "bg-[#EAF6EC] text-[#1B7A34]"
            : "bg-[#F5F0EB] text-[#6B6B6B]")
        }
      >
        {scan === "ok" ? (
          <>
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path d="M5 10.5l3.2 3.2L15 7" stroke="#1B7A34" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Scan recorded
          </>
        ) : scan === "error" ? (
          // Attribution failed — stay friendly and honest, don't claim success.
          "Welcome!"
        ) : (
          "Recording your visit…"
        )}
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
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
    </div>
  );
}
