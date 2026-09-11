// Types only — the implementation lives in storeRedirect.mjs (plain ESM so
// `node --test` can exercise the routing rules directly).

export type StoreOs = "ios" | "android";

/** "ios" | "android" for a real phone browser; null for desktop, bots, unknown. */
export declare function mobileStoreOs(userAgent: string | null | undefined): StoreOs | null;

/** Play listing URL with an install referrer (utm_source=qr, utm_campaign=slug). */
export declare function playStoreUrlFor(playStoreUrl: string, slug: string): string;

/** Store to send a phone scanner to, or null to render the landing page. */
export declare function storeRedirectFor(input: {
  userAgent: string | null | undefined;
  slug: string;
  noRedirect?: boolean;
  appStoreUrl: string;
  playStoreUrl: string;
}): { os: StoreOs; url: string } | null;

/** True for the QA escape hatch ?nr=1 (or nr=true). */
export declare function isNoRedirect(nr: string | string[] | undefined): boolean;

/** Hashed anonymous session id for the server-side scan count. */
export declare function serverScanSessionId(
  ip: string | null | undefined,
  userAgent: string | null | undefined,
): string;
