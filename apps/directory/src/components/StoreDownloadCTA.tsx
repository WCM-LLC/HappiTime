"use client";

/**
 * StoreDownloadCTA — scannable app-download block for iPhone + Android.
 *
 * Ports the source design's StoreQR + DownloadCTA: each platform gets a white
 * card holding a QR code that is both scannable (phone camera) and tappable
 * (links straight to the store), with a store button beneath. Now that Android
 * is live, both platforms are wired to their real listings via lib/storeLinks.
 */
import { APP_STORE_URL, PLAY_STORE_URL, qrSrc } from "@/lib/storeLinks";

type Platform = "ios" | "android";

function AppleIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
    </svg>
  );
}

function PlayIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path d="M3.6 2.4a1 1 0 0 0-.5.87v17.46a1 1 0 0 0 1.5.86l15.3-8.73a1 1 0 0 0 0-1.74L4.6 2.4a1 1 0 0 0-1 0z" />
    </svg>
  );
}

function StoreQR({ platform }: { platform: Platform }) {
  const url = platform === "android" ? PLAY_STORE_URL : APP_STORE_URL;
  const name = platform === "android" ? "Android" : "iPhone";
  const Icon = platform === "android" ? PlayIcon : AppleIcon;
  // iOS uses the dark button; Android uses the brand button (mirrors the design).
  const btnCls =
    platform === "android"
      ? "bg-brand text-white"
      : "bg-dark text-white";

  return (
    <div className="flex flex-col items-center gap-2.5">
      <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted">
        <Icon />
        {name}
      </span>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        title={`Download HappiTime for ${name}`}
        className="block rounded-2xl border border-border bg-white p-2.5 leading-none shadow-sm hover:shadow-md transition-shadow"
      >
        <img
          src={qrSrc(url, 104)}
          width={104}
          height={104}
          alt={`Scan to download HappiTime for ${name}`}
          className="block rounded"
        />
      </a>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className={`inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-bold transition-opacity hover:opacity-90 ${btnCls}`}
      >
        <Icon />
        {platform === "android" ? "Google Play" : "App Store"}
      </a>
    </div>
  );
}

export function StoreDownloadCTA({
  align = "center",
}: {
  align?: "center" | "start";
}) {
  const alignItems = align === "start" ? "items-start" : "items-center";
  const justify = align === "start" ? "justify-start" : "justify-center";
  return (
    <div className={`flex flex-col gap-2.5 ${alignItems}`}>
      <div className={`flex flex-wrap gap-6 ${justify}`}>
        <StoreQR platform="ios" />
        <StoreQR platform="android" />
      </div>
      <span className="text-[11px] font-medium text-muted-light">
        Scan with your phone camera, or tap to install
      </span>
    </div>
  );
}
