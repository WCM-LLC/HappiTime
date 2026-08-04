import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendUserNotifications } from "../_shared/notify.ts";
import { visitRatingCopy } from "../_shared/notification-copy.mjs";

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceKey) return new Response("Server misconfigured", { status: 500 });

  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  const { data: visits, error } = await supabase
    .from("venue_visits")
    .select("id,user_id,venue_id,entered_at,exited_at,duration_minutes,venues(name)")
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
    if (!stayedLongEnough || !awayLongEnough) continue;

    const { title, body } = visitRatingCopy(venue?.name);
    // venues.post_visit_rating_enabled / _aspects were dropped in the
    // 20260601130000 reconcile; every venue prompts and aspects default empty.
    const aspects: string[] = [];

    const { inserted, pushed } = await sendUserNotifications(
      supabase,
      [{ userId: (visit as any).user_id }],
      {
        type: "visit_rating",
        title,
        body,
        data: {
          type: "visit_rating",
          visitId: (visit as any).id,
          venueId: (visit as any).venue_id,
          venueName: venue?.name,
          aspects,
          source: "server",
        },
      },
    );

    // The prompt now exists in the inbox even when no push token exists, so
    // an insert alone counts as prompted (previously only a push did).
    if (inserted > 0 || pushed > 0) {
      sent += pushed;
      await supabase
        .from("venue_visits")
        .update({ rating_prompted_at: new Date().toISOString(), rating_prompt_source: "server_push" })
        .eq("id", (visit as any).id);
    }
  }

  return new Response(JSON.stringify({ sent }), { headers: { "Content-Type": "application/json" } });
});
