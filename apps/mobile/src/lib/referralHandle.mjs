// Pure, node-testable handle normalizer shared by the durable referral stash.
export function normalizeReferralHandle(raw) {
  if (typeof raw !== "string") return null;
  const h = raw.replace(/^@/, "").toLowerCase().trim();
  return /^[a-z0-9_]{2,30}$/.test(h) ? h : null;
}
