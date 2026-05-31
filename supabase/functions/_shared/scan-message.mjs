// supabase/functions/_shared/scan-message.mjs
//
// Pure, source-aware push copy for venue-team scan notifications. Plain ESM (.mjs)
// so both the Deno edge function and CI's Node 20 test import it directly — no type
// stripping (cf. the parseVenueLink.mjs lesson). No Deno/Node-specific APIs.

export function buildVenueScanMessage(source, venueName) {
  const name = venueName && venueName.trim().length > 0 ? venueName : "your venue";
  switch (source) {
    case "qr":
      return { title: "New QR scan", body: `Someone just scanned your QR code at ${name}.` };
    case "app_checkin":
      return { title: "New check-in", body: `Someone just checked in at ${name}.` };
    default:
      return { title: "New visit", body: `Someone just visited ${name} on HappiTime.` };
  }
}
