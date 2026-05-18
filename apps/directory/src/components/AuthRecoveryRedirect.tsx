"use client";

import { useEffect } from "react";

const CONSOLE_ORIGIN =
  process.env.NEXT_PUBLIC_CONSOLE_URL?.replace(/\/+$/, "") ??
  "https://happitime-console.vercel.app";

export function AuthRecoveryRedirect() {
  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const hasRecoverySignal =
      query.get("type") === "recovery" ||
      query.get("next") === "/reset-password" ||
      hash.get("type") === "recovery" ||
      (hash.has("access_token") && hash.has("refresh_token"));

    if (!hasRecoverySignal) return;

    const target = new URL("/auth/recovery", CONSOLE_ORIGIN);
    query.forEach((value, key) => {
      target.searchParams.set(key, value);
    });
    target.searchParams.set("type", "recovery");
    if (!target.searchParams.has("next")) {
      target.searchParams.set("next", "/reset-password");
    }

    window.location.replace(`${target.toString()}${window.location.hash}`);
  }, []);

  return null;
}
