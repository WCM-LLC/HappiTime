import { NextRequest } from "next/server";
import { renderReferralQrPng } from "@happitime/venue-qr";

export const dynamic = "force-static"; // QR for a handle is stable; cache it
export async function GET(_req: NextRequest, { params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const clean = handle.replace(/^@/, "").toLowerCase();
  if (!/^[a-z0-9_]{2,30}$/.test(clean)) return new Response("bad handle", { status: 400 });
  const png = await renderReferralQrPng(clean, { size: 600 });
  return new Response(new Uint8Array(png), {
    headers: { "content-type": "image/png", "cache-control": "public, max-age=86400, immutable" },
  });
}
