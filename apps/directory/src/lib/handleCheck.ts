// Shared between /api/handle-check and the HandleField input.

export type HandleCheck =
  | { ok: true; found: true; handle: string; display_name: string | null }
  | { ok: true; found: false; handle: string }
  | { ok: false; error: "invalid" | "rate_limited" | "unavailable" };

/** Lowercase letters, numbers and underscores — the same rule the app enforces at signup. */
export const HANDLE_PATTERN = /^[a-z0-9_]{2,30}$/;

/** Strip a leading @, trim, lowercase. `@` is display-only; stored handles have none. */
export function normalizeHandle(raw: string): string {
  return raw.trim().replace(/^@+/, "").toLowerCase();
}
