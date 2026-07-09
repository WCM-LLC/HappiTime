// Type declaration for the pure ESM social-URL normalizer. The implementation
// lives in socialUrl.mjs (plain ESM so `node --test` can import it directly);
// this sidecar gives the strict TS web build its types since tsconfig has
// allowJs:false.
export function normalizeSocialUrl(
  input: string | null | undefined,
): { ok: true; value: string | null } | { ok: false; error: string };
