import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";
const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const geocodeKey = Deno.env.get("GOOGLE_GEOCODING_API_KEY") ?? "";
const maxAttempts = Number(Deno.env.get("GEOCODE_MAX_ATTEMPTS") ?? "5");
const batchLimit = Number(Deno.env.get("GEOCODE_BATCH_LIMIT") ?? "10");
const retryMinutes = Number(Deno.env.get("GEOCODE_RETRY_MINUTES") ?? "15");
if (!supabaseUrl || !serviceKey || !geocodeKey) {
  throw new Error("Missing SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, or GOOGLE_GEOCODING_API_KEY.");
}
const supabase = createClient(supabaseUrl, serviceKey, {
  auth: {
    persistSession: false
  }
});
const retryableStatuses = new Set([
  "OVER_QUERY_LIMIT",
  "UNKNOWN_ERROR"
]);
const fatalStatuses = new Set([
  "ZERO_RESULTS",
  "INVALID_REQUEST",
  "REQUEST_DENIED"
]);
const normalizePart = (part)=>{
  if (part == null) return "";
  return String(part).trim();
};
const buildAddress = (venue)=>[
    venue.address,
    venue.city,
    venue.state,
    venue.zip
  ].map((part)=>normalizePart(part)).filter((part)=>part.length > 0).join(", ");
const getJobToken = async ()=>{
  const { data, error } = await supabase.rpc("get_geocode_job_token");
  if (error) {
    return {
      token: null,
      error: error.message
    };
  }
  const token = data ?? null;
  return {
    token,
    error: null
  };
};
const getNextAttemptAt = (now)=>{
  return new Date(now.getTime() + retryMinutes * 60 * 1000).toISOString();
};
const geocodeAddress = async (address)=>{
  const params = new URLSearchParams({
    address,
    key: geocodeKey
  });
  const response = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?${params.toString()}`);
  if (!response.ok) {
    return {
      ok: false,
      status: String(response.status),
      errorMessage: "Geocoding request failed.",
      retryable: true
    };
  }
  const payload = await response.json();
  const status = payload.status ?? "UNKNOWN_ERROR";
  if (status !== "OK") {
    return {
      ok: false,
      status,
      errorMessage: payload.error_message ?? status,
      retryable: retryableStatuses.has(status) && !fatalStatuses.has(status)
    };
  }
  const location = payload.results?.[0]?.geometry?.location;
  if (!location || !Number.isFinite(location.lat) || !Number.isFinite(location.lng)) {
    return {
      ok: false,
      status: "NO_LOCATION",
      errorMessage: "No geocode location returned.",
      retryable: true
    };
  }
  return {
    ok: true,
    status,
    errorMessage: null,
    retryable: false,
    location: {
      lat: location.lat,
      lng: location.lng
    }
  };
};
serve(async (req)=>{
  const providedToken = req.headers.get("x-geocode-token") ?? "";
  if (!providedToken) {
    return new Response("Missing geocode token.", {
      status: 401
    });
  }
  const { token: expectedToken, error: tokenError } = await getJobToken();
  if (tokenError) {
    return new Response(`Failed to read geocode token: ${tokenError}`, {
      status: 500
    });
  }
  if (!expectedToken) {
    return new Response("Geocode token not configured.", {
      status: 500
    });
  }
  if (providedToken !== expectedToken) {
    return new Response("Invalid geocode token.", {
      status: 401
    });
  }
  const url = new URL(req.url);
  const limitParam = url.searchParams.get("limit");
  const limit = Math.max(1, Math.min(Number(limitParam ?? batchLimit), batchLimit));
  const now = new Date();
  const nowIso = now.toISOString();
  const { data: venues, error } = await supabase.from("venues").select("id,address,city,state,zip,geocode_attempts").eq("geocode_status", "pending").or(`geocode_next_attempt_at.is.null,geocode_next_attempt_at.lte.${nowIso}`).order("geocode_requested_at", {
    ascending: true,
    nullsFirst: false
  }).limit(limit);
  if (error) {
    return new Response(JSON.stringify({
      error: error.message
    }), {
      status: 500,
      headers: {
        "content-type": "application/json"
      }
    });
  }
  if (!venues || venues.length === 0) {
    return new Response(JSON.stringify({
      processed: 0
    }), {
      headers: {
        "content-type": "application/json"
      }
    });
  }
  let successCount = 0;
  let failureCount = 0;
  let skippedCount = 0;
  for (const venue of venues){
    const address = buildAddress(venue);
    const attempts = (venue.geocode_attempts ?? 0) + 1;
    if (!address) {
      const { error: updateError } = await supabase.from("venues").update({
        geocode_status: "skipped",
        geocode_last_error: "Missing address fields.",
        geocode_attempts: attempts,
        geocode_last_attempt_at: nowIso,
        geocode_next_attempt_at: null
      }).eq("id", venue.id);
      if (!updateError) skippedCount += 1;
      continue;
    }
    const result = await geocodeAddress(address);
    if (result.ok && result.location) {
      const { error: updateError } = await supabase.from("venues").update({
        lat: result.location.lat,
        lng: result.location.lng,
        geocode_status: "success",
        geocode_last_error: null,
        geocode_attempts: attempts,
        geocode_last_attempt_at: nowIso,
        geocode_next_attempt_at: null,
        geocoded_at: nowIso
      }).eq("id", venue.id);
      if (!updateError) successCount += 1;
      continue;
    }
    const retryable = result.retryable && attempts < maxAttempts;
    const nextAttemptAt = retryable ? getNextAttemptAt(now) : null;
    const status = retryable ? "pending" : "failed";
    const { error: updateError } = await supabase.from("venues").update({
      geocode_status: status,
      geocode_last_error: result.errorMessage ?? result.status,
      geocode_attempts: attempts,
      geocode_last_attempt_at: nowIso,
      geocode_next_attempt_at: nextAttemptAt
    }).eq("id", venue.id);
    if (!updateError) failureCount += 1;
  }
  return new Response(JSON.stringify({
    processed: venues.length,
    success: successCount,
    failed: failureCount,
    skipped: skippedCount
  }), {
    headers: {
      "content-type": "application/json"
    }
  });
});
