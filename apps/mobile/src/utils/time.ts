
/** Converts an ISO timestamp to a human-readable relative string ("today", "3 days ago", etc.). Returns null for null/invalid input. */
export function timeAgo(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return null;

  const diffMs = Date.now() - ts;
  if (diffMs < 0) return null;

  const diffDays = diffMs / (1000 * 60 * 60 * 24);

  if (diffDays < 1) return "today";
  if (diffDays < 2) return "yesterday";
  if (diffDays < 7) return `${Math.floor(diffDays)} days ago`;
  if (diffDays < 30) {
    const weeks = Math.floor(diffDays / 7);
    return weeks === 1 ? "1 week ago" : `${weeks} weeks ago`;
  }
  const months = Math.floor(diffDays / 30);
  return months === 1 ? "1 month ago" : `${months} months ago`;
}
