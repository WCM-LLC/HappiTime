// supabase/functions/notify-venue-updates/index.ts
//
// Sends push notifications when a venue the user has saved publishes a new
// happy hour window or updates an existing one.
//
// Designed to be called from a Supabase database webhook on
// happy_hour_windows INSERT/UPDATE where status = 'published'.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const BATCH_SIZE = 100;

type ExpoPushMessage = {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: "default";
};

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceKey) {
    return new Response("Server misconfigured", { status: 500 });
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  // Payload from database webhook: { type, table, record, old_record }
  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const record = payload.record ?? payload;
  const eventType = payload.type ?? "UPDATE"; // INSERT or UPDATE
  const venueId: string | null = record.venue_id ?? null;
  const windowId: string | null = record.id ?? null;
  const status: string | null = record.status ?? null;

  // Only notify for published windows
  if (status !== "published" || !venueId) {
    return new Response(
      JSON.stringify({ sent: 0, reason: "not a published window or no venue" })
    );
  }

  // Fetch venue name
  const { data: venue } = await supabase
    .from("venues")
    .select("name")
    .eq("id", venueId)
    .maybeSingle();

  const venueName = venue?.name ?? "A venue you saved";

  // Find users who follow this venue and have push tokens + notifications enabled
  const { data: tokenRows, error: tokenErr } = await supabase
    .from("user_followed_venues")
    .select(`
      user_id,
      token:user_push_tokens!inner(expo_push_token),
      prefs:user_preferences!inner(notifications_push, notifications_venue_updates)
    `)
    .eq("venue_id", venueId);

  if (tokenErr) {
    console.error("[notify-venue] token fetch failed:", tokenErr.message);
    return new Response(JSON.stringify({ error: tokenErr.message }), {
      status: 500,
    });
  }

  if (!tokenRows || tokenRows.length === 0) {
    return new Response(
      JSON.stringify({ sent: 0, reason: "no followers with tokens" })
    );
  }

  const isNew = eventType === "INSERT";
  const title = isNew
    ? `🆕 New happy hour at ${venueName}`
    : `📝 ${venueName} updated their happy hour`;
  const body = isNew
    ? `${venueName} just published a new happy hour — check it out!`
    : `${venueName} updated their happy hour details.`;

  const messages: ExpoPushMessage[] = [];
  for (const row of tokenRows as any[]) {
    const token = row.token?.expo_push_token;
    const pushEnabled = row.prefs?.notifications_push !== false;
    const venueUpdatesEnabled = row.prefs?.notifications_venue_updates !== false;
    if (!token || !token.startsWith("ExponentPushToken") || !pushEnabled || !venueUpdatesEnabled) {
      continue;
    }

    messages.push({
      to: token,
      title,
      body,
      sound: "default",
      data: {
        type: "happy_hour",
        venueId,
        windowId,
      },
    });
  }

  if (messages.length === 0) {
    return new Response(
      JSON.stringify({ sent: 0, reason: "no valid tokens" })
    );
  }

  let totalSent = 0;
  for (let i = 0; i < messages.length; i += BATCH_SIZE) {
    const batch = messages.slice(i, i + BATCH_SIZE);
    const res = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(batch),
    });
    if (res.ok) totalSent += batch.length;
    else console.error("[notify-venue] expo push failed:", await res.text());
  }

  return new Response(JSON.stringify({ sent: totalSent }), {
    headers: { "Content-Type": "application/json" },
  });
});
