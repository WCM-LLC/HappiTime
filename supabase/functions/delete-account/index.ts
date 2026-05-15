import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type SupabaseAdminClient = ReturnType<typeof createClient>;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const missingTableCodes = new Set(["42P01", "PGRST205", "PGRST116"]);

const isMissingOptionalTable = (error: { code?: string; message?: string } | null) =>
  Boolean(
    error &&
      (missingTableCodes.has(error.code ?? "") ||
        /Could not find the table|relation .* does not exist/i.test(error.message ?? ""))
  );

async function safeCount(
  adminClient: SupabaseAdminClient,
  table: string,
  column: string,
  value: string,
) {
  const { count, error } = await adminClient
    .from(table)
    .select("*", { count: "exact", head: true })
    .eq(column, value);

  if (error) {
    if (isMissingOptionalTable(error)) return 0;
    throw new Error(`${table} count failed: ${error.message}`);
  }

  return count ?? 0;
}

async function safeRows<T extends Record<string, unknown>>(
  adminClient: SupabaseAdminClient,
  table: string,
  columns: string,
  column: string,
  value: string,
) {
  const { data, error } = await adminClient.from(table).select(columns).eq(column, value);

  if (error) {
    if (isMissingOptionalTable(error)) return [] as T[];
    throw new Error(`${table} fetch failed: ${error.message}`);
  }

  return (data ?? []) as T[];
}

async function safeDelete(
  adminClient: SupabaseAdminClient,
  table: string,
  column: string,
  value: string,
) {
  const { error } = await adminClient.from(table).delete().eq(column, value);
  if (error && !isMissingOptionalTable(error)) {
    throw new Error(`${table} cleanup failed: ${error.message}`);
  }
}

async function safeUpdateNullUserId(adminClient: SupabaseAdminClient, table: string, userId: string) {
  const { error } = await adminClient.from(table).update({ user_id: null }).eq("user_id", userId);
  if (error && !isMissingOptionalTable(error)) {
    throw new Error(`${table} detach failed: ${error.message}`);
  }
}

const increment = (counts: Record<string, number>, key: unknown) => {
  const safeKey = typeof key === "string" && key.trim() ? key.trim() : "unknown";
  counts[safeKey] = (counts[safeKey] ?? 0) + 1;
};

async function anonymizeAndDetachUserData(adminClient: SupabaseAdminClient, userId: string) {
  const [
    profiles,
    preferences,
    lists,
    userEvents,
    followedVenueCount,
    followingCount,
    followerCount,
    plans,
    pushTokens,
    directoryEvents,
    visitCount,
    notificationBlockCount,
  ] = await Promise.all([
    safeRows<{
      handle: string | null;
      display_name: string | null;
      avatar_url: string | null;
      bio: string | null;
      is_public: boolean;
      created_at: string | null;
    }>(adminClient, "user_profiles", "handle, display_name, avatar_url, bio, is_public, created_at", "user_id", userId),
    safeRows<Record<string, unknown>>(adminClient, "user_preferences", "max_distance_miles, price_tier_min, price_tier_max, cuisines, interests, location_enabled, location_permission_status, notifications_permission_status, notifications_marketing, notifications_product, notifications_push, notifications_happy_hours, notifications_venue_updates, notifications_friend_activity, default_checkin_privacy, onboarding_completed_at, onboarding_step, onboarding_version", "user_id", userId),
    safeRows<{ visibility: string | null; created_at: string | null }>(adminClient, "user_lists", "visibility, created_at", "user_id", userId),
    safeRows<{ event_type: string | null; venue_id: string | null }>(adminClient, "user_events", "event_type, venue_id", "user_id", userId),
    safeCount(adminClient, "user_followed_venues", "user_id", userId),
    safeCount(adminClient, "user_follows", "follower_id", userId),
    safeCount(adminClient, "user_follows", "following_user_id", userId),
    safeRows<{ plan: string | null; status: string | null }>(adminClient, "user_plans", "plan, status", "user_id", userId),
    safeRows<{ platform: string | null }>(adminClient, "user_push_tokens", "platform", "user_id", userId),
    safeRows<{ event_type: string | null }>(adminClient, "directory_events", "event_type", "user_id", userId),
    safeCount(adminClient, "venue_visits", "user_id", userId),
    safeCount(adminClient, "user_venue_notification_blocks", "user_id", userId),
  ]);

  const userEventTypeCounts: Record<string, number> = {};
  for (const row of userEvents) increment(userEventTypeCounts, row.event_type);

  const directoryEventTypeCounts: Record<string, number> = {};
  for (const row of directoryEvents) increment(directoryEventTypeCounts, row.event_type);

  const platformCounts: Record<string, number> = {};
  for (const row of pushTokens) increment(platformCounts, row.platform);

  const archive = {
    archive_version: 2,
    archived_at: new Date().toISOString(),
    source: "delete-account-edge-function",
    profile: profiles.map((profile) => ({
      had_handle: profile.handle != null,
      had_display_name: profile.display_name != null,
      had_avatar: profile.avatar_url != null,
      had_bio: profile.bio != null,
      was_public: profile.is_public === true,
      created_month: profile.created_at ? profile.created_at.slice(0, 7) : null,
    })),
    preferences: preferences.map((preference) => ({
      max_distance_miles: preference.max_distance_miles ?? null,
      price_tier_min: preference.price_tier_min ?? null,
      price_tier_max: preference.price_tier_max ?? null,
      cuisine_count: Array.isArray(preference.cuisines) ? preference.cuisines.length : 0,
      notifications_marketing: preference.notifications_marketing === true,
      notifications_product: preference.notifications_product !== false,
      notifications_push: preference.notifications_push !== false,
      notifications_happy_hours: preference.notifications_happy_hours !== false,
      notifications_venue_updates: preference.notifications_venue_updates !== false,
      notifications_friend_activity: preference.notifications_friend_activity !== false,
      default_checkin_privacy_set: preference.default_checkin_privacy != null,
    })),
    lists: {
      count: lists.length,
      visibility_counts: lists.reduce<Record<string, number>>((acc, list) => {
        increment(acc, list.visibility);
        return acc;
      }, {}),
    },
    user_events: {
      count: userEvents.length,
      event_type_counts: userEventTypeCounts,
      venue_related_count: userEvents.filter((event) => event.venue_id != null).length,
    },
    directory_events: {
      count: directoryEvents.length,
      event_type_counts: directoryEventTypeCounts,
    },
    follows: {
      follower_count: followerCount,
      following_count: followingCount,
    },
    saved_venues: {
      count: followedVenueCount,
    },
    plans: plans.map((plan) => ({ plan: plan.plan, status: plan.status })),
    push_tokens: {
      count: pushTokens.length,
      platform_counts: platformCounts,
    },
    visits: {
      count: visitCount,
    },
    notification_blocks: {
      count: notificationBlockCount,
    },
  };

  const { error: archiveError } = await adminClient.from("directory_events").insert({
    event_type: "account_deleted_archive",
    user_id: null,
    meta: archive,
  });

  if (archiveError) {
    throw new Error(`anonymous archive failed: ${archiveError.message}`);
  }

  await safeUpdateNullUserId(adminClient, "directory_events", userId);
  await safeDelete(adminClient, "user_push_tokens", "user_id", userId);
  await safeDelete(adminClient, "venue_visits", "user_id", userId);
  await safeDelete(adminClient, "user_venue_notification_blocks", "user_id", userId);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const authorization = req.headers.get("Authorization") ?? "";

  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(JSON.stringify({ error: "Server misconfigured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!authorization.toLowerCase().startsWith("bearer ")) {
    return new Response(JSON.stringify({ error: "Missing authorization token" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const accessToken = authorization.replace(/^bearer\s+/i, "").trim();

  const {
    data: { user },
    error: userError,
  } = await adminClient.auth.getUser(accessToken);

  if (userError || !user) {
    return new Response(JSON.stringify({ error: "Invalid or expired session" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  await anonymizeAndDetachUserData(adminClient, user.id);

  const { error: deleteError } = await adminClient.auth.admin.deleteUser(user.id);

  if (deleteError) {
    console.error("[delete-account] failed", {
      userId: user.id,
      message: deleteError.message,
    });
    return new Response(JSON.stringify({ error: "Unable to delete account" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ deleted: true }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected delete-account failure";
    console.error("[delete-account] unexpected failure", { message });
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
