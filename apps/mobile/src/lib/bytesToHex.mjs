// src/lib/bytesToHex.mjs
//
// Lowercase hex encoding for a byte array. Plain ESM (.mjs) + colocated .d.ts so
// `node --test` can EXECUTE it on CI while the app gets types — same arrangement as
// parseVenueLink. Extracted from the Apple nonce so the zero-padding (a naive
// b.toString(16) drops the leading 0 for bytes < 0x10, corrupting the nonce) is
// unit-tested rather than trusted.

export function bytesToHex(bytes) {
  let hex = "";
  for (const b of bytes) {
    hex += b.toString(16).padStart(2, "0");
  }
  return hex;
}
