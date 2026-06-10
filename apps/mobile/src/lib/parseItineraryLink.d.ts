// Types for parseItineraryLink.mjs (plain ESM impl; this declaration gives the
// app strict-mode types without compiling the runtime file).

export interface ParsedItineraryLink {
  token: string;
}

export declare function parseItineraryLink(url: unknown): ParsedItineraryLink | null;
