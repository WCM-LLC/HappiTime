// src/hooks/useCheckin.ts
//
// Hook for the pilot check-in + round-redemption flow.
//
// Calls the verify-checkin edge function.  On 4xx the SDK returns a
// FunctionsHttpError whose `.context` is the raw Response — we must call
// `await error.context.json()` to get the structured error body (data is null
// on 4xx; the useInviteFriend `data?.error` pattern does NOT work here).
//
// Request contract (verify-checkin):
//   POST { venue_id, code, lat, lng, fallback?: true, redeem?: true }
//
// Success response:
//   { stamps, stamps_to_next_round, is_first_visit, redeemed?: true }
//
// Error bodies (4xx):
//   { error: "rate_limited" }                          → 429
//   { error: "employee_excluded" }                     → 400
//   { error: "bad_code", attempts_remaining: number }  → 400
//   { error: "out_of_range" }                          → 400
//   { error: "network_cap" }                           → 400
//   { error: "fallback_limit" }                        → 400
//   { error: "insufficient_stamps", stamps: number }   → 400  (redeem only)

import { useCallback, useState } from "react";
import { supabase } from "../api/supabaseClient";
import { useCurrentUser } from "./useCurrentUser";
import { requestSignIn } from "../lib/gatedAction";
import { setPendingIntent } from "../lib/pendingGatedAction";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type CheckinErrorCode =
  | "rate_limited"
  | "employee_excluded"
  | "bad_code"
  | "out_of_range"
  | "network_cap"
  | "fallback_limit"
  | "insufficient_stamps"
  | "network_error"
  | "unknown";

export type CheckinState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; stamps: number; stampsToNext: number; isFirstVisit: boolean; redeemed: boolean }
  | { status: "bad_code"; attemptsRemaining: number; failCount: number }
  | { status: "out_of_range" }
  | { status: "rate_limited" }
  | { status: "employee_excluded" }
  | { status: "network_cap" }
  | { status: "fallback_limit" }
  | { status: "insufficient_stamps"; stamps: number }
  | { status: "network_error" }
  | { status: "error"; message: string };

export type CheckinResult =
  | { ok: true; stamps: number; stampsToNext: number; isFirstVisit: boolean; redeemed: boolean }
  | { ok: false; errorCode: CheckinErrorCode };

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────

const INITIAL: CheckinState = { status: "idle" };

/**
 * Manages the check-in flow against the verify-checkin edge function.
 *
 * Exposes:
 *  - `state`        — current UI state (idle / loading / success / error variants)
 *  - `stamps`       — current stamp count (populated after success)
 *  - `stampsToNext` — stamps remaining until next free round
 *  - `failCount`    — number of bad-code failures (reset on success)
 *  - `submit`       — attempt a normal check-in with `{ venue_id, code, lat, lng }`
 *  - `submitFallback` — attempt a GPS-fallback check-in (no code required)
 *  - `submitRedeem` — attempt a round redemption (requires code + ≥5 stamps)
 *  - `reset`        — return to idle
 */
export function useCheckin() {
  const { user } = useCurrentUser();
  const [state, setState] = useState<CheckinState>(INITIAL);
  // Track consecutive bad_code failures to surface the fallback offer
  const [failCount, setFailCount] = useState(0);

  const _invoke = useCallback(
    async (body: Record<string, unknown>): Promise<CheckinResult> => {
      if (!user) {
        // Guest attempting a check-in — record the intent (replayed post-signup
        // by a fresh, signed-in hook via the exposed _invoke) and open earned signup.
        setPendingIntent({ kind: "checkin", body });
        if (requestSignIn("checkin")) return { ok: false, errorCode: "unknown" };
        // No handler registered — fall through to existing not-signed-in handling.
        return { ok: false, errorCode: "unknown" };
      }

      setState({ status: "loading" });

      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setState({ status: "error", message: "Not signed in" });
        return { ok: false, errorCode: "unknown" };
      }

      try {
        const { data, error } = await supabase.functions.invoke("verify-checkin", {
          headers: { Authorization: `Bearer ${session.access_token}` },
          body,
        });

        if (error) {
          // supabase-js wraps non-2xx as FunctionsHttpError — parse error body
          // from error.context (the raw Response).
          let parsed: Record<string, unknown> = {};
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            parsed = await (error as any).context?.json?.() ?? {};
          } catch {
            // If JSON parse fails, fall through to generic mapping
          }

          const code = typeof parsed.error === "string" ? parsed.error : "";

          switch (code) {
            case "rate_limited":
              setState({ status: "rate_limited" });
              return { ok: false, errorCode: "rate_limited" };

            case "employee_excluded":
              setState({ status: "employee_excluded" });
              return { ok: false, errorCode: "employee_excluded" };

            case "bad_code": {
              const rem =
                typeof parsed.attempts_remaining === "number"
                  ? parsed.attempts_remaining
                  : 0;
              setFailCount((c) => c + 1);
              setState({ status: "bad_code", attemptsRemaining: rem, failCount: failCount + 1 });
              return { ok: false, errorCode: "bad_code" };
            }

            case "out_of_range":
              setState({ status: "out_of_range" });
              return { ok: false, errorCode: "out_of_range" };

            case "network_cap":
              setState({ status: "network_cap" });
              return { ok: false, errorCode: "network_cap" };

            case "fallback_limit":
              setState({ status: "fallback_limit" });
              return { ok: false, errorCode: "fallback_limit" };

            case "insufficient_stamps": {
              const stamps =
                typeof parsed.stamps === "number" ? parsed.stamps : 0;
              setState({ status: "insufficient_stamps", stamps });
              return { ok: false, errorCode: "insufficient_stamps" };
            }

            default:
              // Network / relay / unknown errors
              if (
                error.name === "FunctionsFetchError" ||
                error.message?.includes("fetch")
              ) {
                setState({ status: "network_error" });
                return { ok: false, errorCode: "network_error" };
              }
              setState({ status: "error", message: error.message ?? "Unknown error" });
              return { ok: false, errorCode: "unknown" };
          }
        }

        // Success (2xx)
        const stamps = typeof data?.stamps === "number" ? data.stamps : 0;
        const stampsToNext =
          typeof data?.stamps_to_next_round === "number"
            ? data.stamps_to_next_round
            : Math.max(0, 5 - stamps);
        const isFirstVisit = data?.is_first_visit === true;
        const redeemed = data?.redeemed === true;

        setFailCount(0);
        setState({
          status: "success",
          stamps,
          stampsToNext,
          isFirstVisit,
          redeemed,
        });

        return { ok: true, stamps, stampsToNext, isFirstVisit, redeemed };
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Unknown error";
        setState({ status: "network_error" });
        console.error("[useCheckin] unexpected error:", msg);
        return { ok: false, errorCode: "network_error" };
      }
    },
    [user, failCount]
  );

  /**
   * Normal code-based check-in.
   */
  const submit = useCallback(
    (params: { venueId: string; code: string; lat: number; lng: number }) =>
      _invoke({
        venue_id: params.venueId,
        code: params.code,
        lat: params.lat,
        lng: params.lng,
      }),
    [_invoke]
  );

  /**
   * GPS-fallback check-in — offered after 2 consecutive bad-code failures.
   * No code required; the server records method='gps_fallback'.
   */
  const submitFallback = useCallback(
    (params: { venueId: string; lat: number; lng: number }) =>
      _invoke({
        venue_id: params.venueId,
        code: "",
        lat: params.lat,
        lng: params.lng,
        fallback: true,
      }),
    [_invoke]
  );

  /**
   * Round redemption — requires a valid today's code.
   * Returns { redeemed: true, stamps: 0 } on success.
   */
  const submitRedeem = useCallback(
    (params: { venueId: string; code: string; lat: number; lng: number }) =>
      _invoke({
        venue_id: params.venueId,
        code: params.code,
        lat: params.lat,
        lng: params.lng,
        redeem: true,
      }),
    [_invoke]
  );

  const reset = useCallback(() => {
    setState(INITIAL);
    setFailCount(0);
  }, []);

  // Convenience accessors for success state
  const stamps = state.status === "success" ? state.stamps : null;
  const stampsToNext = state.status === "success" ? state.stampsToNext : null;

  return {
    state,
    stamps,
    stampsToNext,
    failCount,
    submit,
    submitFallback,
    submitRedeem,
    reset,
    // Replays a pre-built check-in body (used by useGatedActionResume after signup).
    _invoke,
  };
}
