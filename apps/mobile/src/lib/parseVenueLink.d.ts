// Types for parseVenueLink.mjs (plain ESM impl; this declaration gives the app
// strict-mode types without compiling the runtime file).

export interface ParsedVenueLink {
  slug: string;
  src: string | null;
  ref: string | null;
}

export declare function parseVenueLink(url: unknown): ParsedVenueLink | null;
