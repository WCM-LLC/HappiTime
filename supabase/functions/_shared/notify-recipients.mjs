// supabase/functions/_shared/notify-recipients.mjs
//
// Pure recipient gating shared by the six send paths. Category preferences
// (notifications_happy_hours / _venue_updates / _friend_activity /
// _venue_scans) gate the notification row itself; notifications_push is a
// push-only gate applied later inside notify.ts. Missing pref row = opted in.
// Plain ESM so Deno and CI's Node 20 both import it directly.

export function categoryGatedRecipients(userIds, prefRows, categoryKey) {
  const disabled = new Set(
    categoryKey === null
      ? []
      : (prefRows ?? [])
          .filter((p) => p && p[categoryKey] === false)
          .map((p) => p.user_id)
  );
  return [...new Set(userIds ?? [])]
    .filter((id) => Boolean(id) && !disabled.has(id))
    .map((userId) => ({ userId }));
}
