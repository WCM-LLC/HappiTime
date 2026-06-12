// Module-level bridge: a hook (save/check-in) calls requestSignIn(kind) when a
// guest attempts a gated action; the App root registers a handler that opens the
// EarnedSignupSheet. Mirrors backgroundConsentPrompt.ts.
export type GatedActionKind = "save" | "checkin";

let handler: ((kind: GatedActionKind) => void) | null = null;
export function setSignInRequestHandler(fn: ((kind: GatedActionKind) => void) | null): void { handler = fn; }
/** Returns true if a sign-in sheet was requested (handler registered). */
export function requestSignIn(kind: GatedActionKind): boolean {
  if (!handler) return false;
  handler(kind);
  return true;
}
