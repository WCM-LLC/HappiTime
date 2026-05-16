import { redirect } from 'next/navigation';

/** Coerces a FormData value to a trimmed string. Returns empty string if null/undefined. */
export function toStr(v: FormDataEntryValue | null | undefined): string {
  return String(v ?? '').trim();
}

/** Coerces a FormData value to a trimmed string, returning null if blank. */
export function toNullableStr(v: FormDataEntryValue | null | undefined): string | null {
  const s = toStr(v);
  return s.length ? s : null;
}

/** Coerces a FormData value to a finite number, returning null if blank or non-numeric. */
export function toNumberOrNull(v: FormDataEntryValue | null | undefined): number | null {
  const s = toStr(v);
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * Redirects to the venue page with an error query param.
 * Used as a typed never-return to signal validation failures in server actions.
 */
export function redirectWithError(orgId: string, venueId: string, error: string): never {
  redirect(`/orgs/${orgId}/venues/${venueId}?error=${error}`);
}

/**
 * Redirects to the venue page with a success query param.
 * The FlashMessage client component reads this and shows a toast.
 */
export function redirectWithSuccess(orgId: string, venueId: string, success: string): never {
  redirect(`/orgs/${orgId}/venues/${venueId}?success=${success}`);
}

/**
 * Extracts a required string field from FormData, redirecting with an error if missing.
 * Depends on: redirectWithError.
 */
export function requireField(
  formData: FormData,
  key: string,
  orgId: string,
  venueId: string,
  error: string,
): string {
  const value = toStr(formData.get(key));
  if (!value) redirectWithError(orgId, venueId, error);
  return value;
}
