"use client";

import { useEffect, useRef } from "react";

type Props = {
  handle: string;
  appDeepLink: string;
  appStoreUrl: string;
  playStoreUrl: string;
};

/**
 * Client half of the referral/Insider landing. On mount it attempts to open
 * the native app via happitime://referral/{handle}. If the app isn't installed
 * the OS ignores the redirect and the store buttons act as fallback.
 * Does NOT fire track-visit — referral capture happens in-app post-install.
 */
export function ReferralLandingClient({
  handle,
  appDeepLink,
  appStoreUrl,
  playStoreUrl,
}: Props) {
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    // Delay slightly so the page renders before the OS hands off.
    const id = window.setTimeout(() => {
      window.location.href = appDeepLink;
    }, 600);
    return () => window.clearTimeout(id);
  }, [appDeepLink]);

  return (
    <div className="mt-6 flex flex-col items-center gap-4">
      <a
        href={appDeepLink}
        className="inline-flex items-center justify-center rounded-lg bg-[#C8965A] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#b3854f]"
      >
        Open in the HappiTime app
      </a>
      <div className="flex gap-3">
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
