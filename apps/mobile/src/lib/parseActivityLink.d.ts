// Types for parseActivityLink.mjs (plain ESM impl; this declaration gives the
// app strict-mode types without compiling the runtime file).

export interface ParsedActivityLink {
  segment: "notifications" | "friends" | "discover" | "checkins" | "people" | null;
}

export declare function parseActivityLink(url: unknown): ParsedActivityLink | null;
