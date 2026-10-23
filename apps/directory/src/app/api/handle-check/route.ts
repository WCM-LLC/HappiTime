import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { HANDLE_PATTERN, normalizeHandle, type HandleCheck } from "@/lib/handleCheck";

// GET /api/handle-check?handle=juan
//
// Confirms a HappiTime handle belongs to a real account so event registration
// can require one without shipping a new mobile build. Reads through the
// existing `get_referral_profile` RPC (public profiles and Insiders only), so
// it exposes nothing the /r/{handle} landing doesn't already show.

export const dynamic = "force-dynamic";

const RATE_LIMIT_WINDOW_SECONDS = 60;
const RATE_LIMIT_MAX_REQUESTS = 40;

function clientId(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() ?? "unknown";
  return request.headers.get("x-real-ip") ?? "unknown";
}

async function rateLimited(id: string): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return false;
  const admin = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await admin.rpc("check_rate_limit", {
    p_key: `handle-check:${id}`,
    p_limit: RATE_LIMIT_MAX_REQUESTS,
    p_window_seconds: RATE_LIMIT_WINDOW_SECONDS,
  });
  if (error) {
    console.error("handle-check rate limit failed", { message: error.message });
    return false;
  }
  return data === true;
}

export async function GET(request: NextRequest) {
  const handle = normalizeHandle(request.nextUrl.searchParams.get("handle") ?? "");
  const noStore = { "Cache-Control": "no-store" };

  if (!HANDLE_PATTERN.test(handle)) {
    return NextResponse.json({ ok: false, error: "invalid" } satisfies HandleCheck, {
      status: 400,
      headers: noStore,
    });
  }
  if (await rateLimited(clientId(request))) {
    return NextResponse.json({ ok: false, error: "rate_limited" } satisfies HandleCheck, {
      status: 429,
      headers: noStore,
    });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    return NextResponse.json({ ok: false, error: "unavailable" } satisfies HandleCheck, {
      status: 503,
      headers: noStore,
    });
  }
  const supabase = createClient(url, anon, { auth: { persistSession: false } });
  const { data, error } = await supabase
    .rpc("get_referral_profile", { p_handle: handle })
    .maybeSingle();

  if (error) {
    console.error("handle-check lookup failed", { message: error.message });
    return NextResponse.json({ ok: false, error: "unavailable" } satisfies HandleCheck, {
      status: 503,
      headers: noStore,
    });
  }

  const row = data as { handle: string; display_name: string | null } | null;
  const body: HandleCheck = row
    ? { ok: true, found: true, handle: row.handle, display_name: row.display_name }
    : { ok: true, found: false, handle };
  return NextResponse.json(body, { headers: noStore });
}
