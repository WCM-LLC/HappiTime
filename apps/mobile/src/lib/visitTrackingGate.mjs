// Pure decision for whether background visit tracking should be active.
// Kept dependency-free so it runs under node:test.
export function shouldTrack({ consent, consentLoading, venueCount }) {
  if (consentLoading) return false;
  return consent && venueCount > 0;
}
