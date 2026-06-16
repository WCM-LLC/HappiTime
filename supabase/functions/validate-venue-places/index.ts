import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";
import { addressMatchScore } from "../_shared/address-match.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
// Mirror import-places: prod stores the key as GOOGLE_GEOCODING_API_KEY
// (which has Places API v1 enabled); GOOGLE_PLACES_API_KEY is unset.
const placesKey =
  Deno.env.get("GOOGLE_PLACES_API_KEY") ??
  Deno.env.get("GOOGLE_GEOCODING_API_KEY") ??
  "";
const batchLimit = Number(Deno.env.get("VALIDATE_BATCH_LIMIT") ?? "25");
const threshold = Number(Deno.env.get("VALIDATE_MISMATCH_THRESHOLD") ?? "0.7");

if (!supabaseUrl || !serviceKey || !placesKey) {
  throw new Error(
    "Missing SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, or GOOGLE_PLACES_API_KEY.",
  );
}

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false },
});

const placesDetailsUrl = (placeId: string) =>
  `https://places.googleapis.com/v1/places/${placeId}`;
const placesFieldMask = "formattedAddress";
const retryableStatus = new Set([408, 429, 500, 502, 503, 504]);

const buildStoredAddress = (v: {
  address: string | null; city: string | null;
  state: string | null; zip: string | null;
}) =>
  [v.address, v.city, v.state, v.zip]
    .map((p) => (p == null ? "" : String(p).trim()))
    .filter((p) => p.length > 0)
    .join(", ");

const getJobToken = async (): Promise<string | null> => {
  const { data, error } = await supabase.rpc("get_validate_job_token");
  if (error) throw new Error(`token rpc: ${error.message}`);
  return data ?? null;
};

type FetchResult =
  | { kind: "ok"; address: string | null }
  | { kind: "not_found" }
  | { kind: "transient" }
  | { kind: "fatal" };

const fetchGoogleAddress = async (placeId: string): Promise<FetchResult> => {
  const res = await fetch(placesDetailsUrl(placeId), {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": placesKey,
      "X-Goog-FieldMask": placesFieldMask,
    },
  });
  if (res.ok) {
    const body = await res.json().catch(() => null);
    return { kind: "ok", address: body?.formattedAddress ?? null };
  }
  if (res.status === 404) return { kind: "not_found" };
  if (retryableStatus.has(res.status)) return { kind: "transient" };
  return { kind: "fatal" };
};

serve(async (req) => {
  const provided = req.headers.get("x-validate-token") ?? "";
  if (!provided) return new Response("Missing validate token.", { status: 401 });

  let expected: string | null;
  try {
    expected = await getJobToken();
  } catch (e) {
    return new Response(`Failed to read validate token: ${e}`, { status: 500 });
  }
  if (!expected) return new Response("Validate token not configured.", { status: 500 });
  if (provided !== expected) return new Response("Invalid validate token.", { status: 401 });

  const { data: venues, error: selErr } = await supabase
    .from("venues")
    .select("id,address,city,state,zip,places_id")
    .not("places_id", "is", null)
    .order("places_validated_at", { ascending: true, nullsFirst: true })
    .limit(batchLimit);

  if (selErr) return new Response(`select failed: ${selErr.message}`, { status: 500 });

  let processed = 0;
  let mismatches = 0;
  let errors = 0;
  const now = new Date().toISOString();

  for (const v of venues ?? []) {
    const fetched = await fetchGoogleAddress(v.places_id as string);

    if (fetched.kind === "transient" || fetched.kind === "fatal") {
      errors++;
      continue; // do NOT bump places_validated_at -> retries next run
    }

    const stored = buildStoredAddress(v);
    let googleAddress: string | null = null;
    let score: number | null = null;
    let mismatch: boolean;

    if (fetched.kind === "not_found") {
      mismatch = true; // stale/closed place id -> needs review
    } else {
      googleAddress = fetched.address;
      score = googleAddress ? addressMatchScore(stored, googleAddress) : 0;
      mismatch = score < threshold;
    }

    await supabase.from("venue_validation_log").insert({
      venue_id: v.id,
      places_id: v.places_id,
      stored_address: stored,
      google_address: googleAddress,
      match_score: score,
      mismatch,
    });

    await supabase
      .from("venues")
      .update({
        places_validated_at: now,
        ...(mismatch ? { needs_address_review: true } : {}),
      })
      .eq("id", v.id);

    processed++;
    if (mismatch) mismatches++;
  }

  return new Response(
    JSON.stringify({ processed, mismatches, errors }),
    { headers: { "Content-Type": "application/json" } },
  );
});
