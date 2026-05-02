import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceKey) return new Response("Server misconfigured", { status: 500 });

  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  const { data: visits, error } = await supabase
    .from("venue_visits")
    .select("id,user_id,venue_id,entered_at,exited_at,duration_minutes,venues(name,post_visit_rating_enabled,post_visit_rating_aspects)")
    .is("rating_prompted_at", null)
    .is("rating", null)
    .lte("entered_at", new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString())
    .limit(250);

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });

  let sent = 0;
  for (const visit of visits ?? []) {
    const venue: any = (visit as any).venues;
    const durationMinutes = (visit as any).duration_minutes as number | null;
    const enteredAt = new Date((visit as any).entered_at).getTime();
    const exitedAt = (visit as any).exited_at ? new Date((visit as any).exited_at).getTime() : null;

    const stayedLongEnough = (durationMinutes ?? 0) >= 60 || (exitedAt && exitedAt - enteredAt >= 60 * 60 * 1000);
    const awayLongEnough = exitedAt ? Date.now() - exitedAt >= 60 * 60 * 1000 : false;
    if (!stayedLongEnough || !awayLongEnough || venue?.post_visit_rating_enabled === false) continue;

    const { data: tokenRows } = await supabase
      .from("user_push_tokens")
      .select("expo_push_token")
      .eq("user_id", (visit as any).user_id);

    const tokens = (tokenRows ?? [])
      .map((r: any) => r.expo_push_token)
      .filter((t: string) => typeof t === "string" && t.startsWith("ExponentPushToken"));

    if (tokens.length === 0) continue;

    const aspects = Array.isArray(venue?.post_visit_rating_aspects) ? venue.post_visit_rating_aspects : [];
    const messages = tokens.map((to: string) => ({
      to,
      title: `How was ${venue?.name ?? "your visit"}?`,
      body: "Tap to rate your experience",
      sound: "default",
      data: { type: "visit_rating", visitId: (visit as any).id, venueId: (visit as any).venue_id, venueName: venue?.name, aspects, source: "server" },
    }));

    const pushRes = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(messages),
    });

    if (pushRes.ok) {
      sent += messages.length;
      await supabase
        .from("venue_visits")
        .update({ rating_prompted_at: new Date().toISOString(), rating_prompt_source: "server_push" })
        .eq("id", (visit as any).id);
    }
  }

  return new Response(JSON.stringify({ sent }), { headers: { "Content-Type": "application/json" } });
});
