// Types only — the implementation lives in redactSensitiveUrls.mjs (plain ESM
// so `node --test` can exercise the redaction directly).

export declare const REDACTED: string;

/** Redact credential-bearing path segments and params in one string. */
export declare function redactString(value: string): string;

/** `beforeSend` hook: the same event with every string scrubbed; `null` passes through. */
export declare function redactEvent<T>(event: T | null): T | null;
