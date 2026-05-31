// Type declarations for the @happitime/venue-qr render module (index.mjs).
// Hand-written because the package ships plain ESM with no build step.

export interface SizePreset {
  /** Square pixel dimension of the rendered PNG (inches * 300 DPI). */
  px: number;
  /** Physical print size in inches, or null for digital-only. */
  inches: number | null;
  /** Human-readable label shown in the download UI. */
  label: string;
}

/** Print-size presets, capped at a 4" postcard (1200px). */
export declare const SIZE_PRESETS: {
  postcard: SizePreset;
  table_tent: SizePreset;
  coaster: SizePreset;
  sticker: SizePreset;
  digital: SizePreset;
};

/** The public landing URL encoded into the QR for a venue slug. */
export declare function venueQrUrl(slug: string, base?: string): string;

/** Render a branded venue QR PNG at `size` pixels square. Returns a PNG Buffer. */
export declare function renderVenueQrPng(
  slug: string,
  opts?: { size?: number; base?: string },
): Promise<Buffer>;
