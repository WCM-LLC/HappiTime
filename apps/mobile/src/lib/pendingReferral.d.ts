/** Stash an Insider referral handle to be recorded on the next signed-in session. */
export declare function setPendingReferral(handle: string): void;
/** Return and clear the stashed referral handle (null if none). */
export declare function takePendingReferral(): string | null;
