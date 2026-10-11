// Types for pendingItineraryLink.mjs (plain ESM impl so `node --test` can run it).
export declare const HANDLED_WINDOW_MS: number;
export declare function setPendingItineraryLink(url: string, now?: number): void;
export declare function takePendingItineraryLink(): string | null;
export declare function markItineraryLinkHandled(url: string, now?: number): void;
