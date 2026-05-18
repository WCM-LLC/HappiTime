import { NextResponse } from "next/server";

const CONSOLE_ORIGIN =
  process.env.NEXT_PUBLIC_CONSOLE_URL?.replace(/\/+$/, "") ??
  "https://happitime-console.vercel.app";

export function GET(request: Request) {
  const incoming = new URL(request.url);
  const isRecovery =
    incoming.searchParams.get("type") === "recovery" ||
    incoming.searchParams.get("next") === "/reset-password" ||
    incoming.searchParams.size === 0;
  const target = new URL(isRecovery ? "/auth/recovery" : "/auth/callback", CONSOLE_ORIGIN);

  incoming.searchParams.forEach((value, key) => {
    target.searchParams.set(key, value);
  });

  if (isRecovery && !target.searchParams.has("next")) {
    target.searchParams.set("next", "/reset-password");
  }

  return NextResponse.redirect(target);
}
