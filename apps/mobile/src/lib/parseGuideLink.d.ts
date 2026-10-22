// Types for parseGuideLink.mjs (plain ESM impl; this declaration gives the
// app strict-mode types without compiling the runtime file).

export interface ParsedGuideLink {
  slug: string;
  ref: string | null;
}

export declare function parseGuideLink(url: unknown): ParsedGuideLink | null;
