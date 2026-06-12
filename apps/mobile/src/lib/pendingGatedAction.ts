// Holds the single action a guest attempted (save/check-in) so it can be
// replayed once they finish the earned signup. Set when requestSignIn fires;
// run by the App root when a new session arrives.
let pending: (() => void) | null = null;
export function queueGatedAction(fn: () => void): void { pending = fn; }
export function runPendingGatedAction(): void { const f = pending; pending = null; f?.(); }
export function clearPendingGatedAction(): void { pending = null; }
