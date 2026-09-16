export type AuthErrorKind =
  | 'session_mismatch'
  | 'link_expired'
  | 'cancelled'
  | 'redirect_config'
  | 'unknown';

export type AuthErrorCopy = {
  kind: AuthErrorKind;
  title: string;
  body: string;
  /** True only when the failure really is a Supabase redirect allow-list problem. */
  showConfigHelp: boolean;
  /** The raw provider/GoTrue message, trimmed, for a collapsed "technical details" block. */
  detail: string | null;
};

/** Maps a raw auth error message to user-facing copy. Never throws. */
export function describeAuthError(rawMessage: string | null | undefined): AuthErrorCopy;
