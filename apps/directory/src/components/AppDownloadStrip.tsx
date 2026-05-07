"use client";

import { useState } from "react";

export function AppDownloadStrip() {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  return (
    <div className="bg-dark relative">
      <div className="mx-auto max-w-5xl px-6 py-5 flex items-center justify-between flex-wrap gap-4 pr-14">
        <div>
          <p className="text-sm font-bold text-white">
            Save your favorite spots. Get reminded when happy hour starts.
          </p>
          <p className="text-xs mt-0.5" style={{ color: "#9CA3AF" }}>
            Download HappiTime — free on iPhone and Android.
          </p>
        </div>
        <div className="flex items-center gap-2.5 flex-shrink-0">
          <a
            href="https://apps.apple.com/us/app/happitime/id6757933269"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-full bg-brand px-4 py-2 text-white text-xs font-bold hover:bg-brand-dark transition-colors"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
            </svg>
            App Store
          </a>
          <a
            href="/app/"
            className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-bold transition-colors"
            style={{
              border: "1.5px solid #C8965A",
              color: "#C8965A",
            }}
          >
            Google Play
          </a>
        </div>
      </div>
      <button
        onClick={() => setDismissed(true)}
        aria-label="Dismiss app download banner"
        className="absolute top-1/2 right-5 -translate-y-1/2 w-7 h-7 rounded-full flex items-center justify-center transition-colors text-sm"
        style={{ background: "rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.7)" }}
      >
        ✕
      </button>
    </div>
  );
}
