// Supabase Edge Function: ingest-venues
// Receives an Apify webhook (run succeeded) for compass/crawler-google-places,
// fetches the run's dataset, filters to in-scope venues, dedups against venues + staging,
// and inserts net-new rows into staging_venues (status='pending').
// Auth: shared secret in the `x-ingest-secret` header (set INGEST_SECRET).
// Secrets required: APIFY_TOKEN, INGEST_SECRET. Auto-provided: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
const NOISE = new Set([
  "Pizza delivery",
  "Fast food restaurant",
  "Health food restaurant",
  "Coffee shop",
  "Cafe",
  "Coffee roastery",
  "Hair salon",
  "Apartment complex",
  "Liquor store",
  "Game store",
  "Barber shop",
  "Beverage distributor",
  "Ice cream shop",
  "Market",
  "Grocery store",
  "General contractor",
  "Performing arts theater",
  "Tea house",
  "Newspaper publisher",
  "Hotel",
  "Condominium complex",
  "Beauty salon",
  "Dog park",
  "Corporate office",
  "Cultural landmark",
  "Wedding venue",
  "Event venue",
  "Board game club",
  "Deli",
  "Sandwich shop",
  "Food and drink",
  "Social club",
  "Shopping mall",
  "Adult entertainment club",
  "Diner",
  "Breakfast restaurant",
  "Chocolate shop",
  "Wine store",
  "Espresso bar",
  "Creperie",
  "Store",
  "News service",
  "Live music venue"
]);
const CHAIN_FRAGMENTS = [
  "domino",
  "papa john",
  "pizza hut",
  "little caesar",
  "papa murphy",
  "marco's pizza",
  "mod pizza",
  "blaze pizza",
  "sbarro",
  "jet's pizza",
  "hungry howie",
  "cici's",
  "minsky",
  "spin pizza",
  "pizza shoppe",
  "mcdonald",
  "burger king",
  "wendy",
  "sonic drive",
  "jack in the box",
  "carl's jr",
  "hardee",
  "whataburger",
  "white castle",
  "checkers",
  "rally's",
  "krystal",
  "steak 'n shake",
  "five guys",
  "in-n-out",
  "shake shack",
  "culver",
  "freddy's frozen",
  "smashburger",
  "fuddrucker",
  "brgr kitchen",
  "kfc",
  "kentucky fried",
  "popeye",
  "chick-fil",
  "raising cane",
  "zaxby",
  "bojangles",
  "church's chicken",
  "slim chickens",
  "wingstop",
  "buffalo wild wings",
  "captain d",
  "long john silver",
  "el pollo loco",
  "charleys",
  "taco bell",
  "del taco",
  "qdoba",
  "chipotle",
  "moe's southwest",
  "taco john",
  "taco cabana",
  "freebirds",
  "subway",
  "jimmy john",
  "jersey mike",
  "firehouse subs",
  "potbelly",
  "mcalister",
  "which wich",
  "quiznos",
  "schlotzsky",
  "arby",
  "planet sub",
  "panda express",
  "panera",
  "noodles & company",
  "pei wei",
  "starbucks",
  "dunkin",
  "dutch bros",
  "tim hortons",
  "einstein bros",
  "krispy kreme",
  "baskin",
  "cold stone",
  "dairy queen",
  "cinnabon",
  "auntie anne",
  "jamba",
  "smoothie king",
  "tropical smoothie",
  "scooter's coffee",
  "caribou coffee",
  "7 brew",
  "crumbl",
  "applebee",
  "chili's",
  "olive garden",
  "ihop",
  "denny's",
  "waffle house",
  "cracker barrel",
  "red lobster",
  "red robin",
  "outback",
  "texas roadhouse",
  "cheesecake factory",
  "longhorn steakhouse",
  "bj's restaurant",
  "tgi friday",
  "ruby tuesday",
  "golden corral",
  "hooters",
  "twin peaks",
  "portillo",
  "first watch",
  "yard house",
  "quiktrip",
  "casey's",
  "kwik trip",
  "wawa",
  "sheetz"
];
function isChain(title) {
  const t = (title ?? "").toLowerCase();
  return CHAIN_FRAGMENTS.some((c)=>t.includes(c));
}
function inScope(it) {
  if (!it?.placeId) return false;
  if (it.permanentlyClosed || it.temporarilyClosed) return false;
  if (NOISE.has(it.categoryName ?? "")) return false;
  if (isChain(it.title)) return false;
  if (typeof it.totalScore === "number" && it.totalScore < 3.5) return false;
  return true;
}
// Lowercase keyword (substring) -> approved_tags slug. Applied to a blob of the place's
// categoryName + categories[] + the "true" labels under additionalInfo.
const TAG_MAP = [
  [
    "mexican",
    "mexican"
  ],
  [
    "tex-mex",
    "mexican"
  ],
  [
    "taqueria",
    "mexican"
  ],
  [
    "taco",
    "mexican"
  ],
  [
    "italian",
    "italian"
  ],
  [
    "pizza",
    "pizza"
  ],
  [
    "sushi",
    "sushi"
  ],
  [
    "japanese",
    "japanese"
  ],
  [
    "korean",
    "korean"
  ],
  [
    "thai",
    "thai"
  ],
  [
    "chinese",
    "chinese"
  ],
  [
    "vietnamese",
    "asian"
  ],
  [
    "asian",
    "asian"
  ],
  [
    "indian",
    "indian"
  ],
  [
    "mediterranean",
    "mediterranean"
  ],
  [
    "greek",
    "mediterranean"
  ],
  [
    "middle eastern",
    "mediterranean"
  ],
  [
    "seafood",
    "seafood"
  ],
  [
    "steak",
    "steakhouse"
  ],
  [
    "barbecue",
    "bbq"
  ],
  [
    "bbq",
    "bbq"
  ],
  [
    "american",
    "american"
  ],
  [
    "burger",
    "burger"
  ],
  [
    "hamburger",
    "burger"
  ],
  [
    "southern",
    "southern"
  ],
  [
    "soul food",
    "soul-food"
  ],
  [
    "cajun",
    "cajun"
  ],
  [
    "creole",
    "creole"
  ],
  [
    "caribbean",
    "caribbean"
  ],
  [
    "jamaican",
    "jamaican"
  ],
  [
    "ethiopian",
    "ethiopian"
  ],
  [
    "african",
    "african"
  ],
  [
    "tapas",
    "tapas"
  ],
  [
    "spanish",
    "tapas"
  ],
  [
    "gastropub",
    "gastropub"
  ],
  [
    "brewpub",
    "brewery"
  ],
  [
    "brewery",
    "brewery"
  ],
  [
    "wine bar",
    "wine-bar"
  ],
  [
    "cocktail bar",
    "cocktail-bar"
  ],
  [
    "sports bar",
    "sports-bar"
  ],
  [
    "lounge",
    "lounge"
  ],
  [
    "dive bar",
    "dive-bar"
  ],
  [
    "jazz",
    "live-music"
  ],
  [
    "brunch",
    "brunch"
  ],
  [
    "outdoor seating",
    "patio"
  ],
  [
    "rooftop",
    "rooftop"
  ],
  [
    "dogs allowed",
    "dog-friendly"
  ],
  [
    "live music",
    "live-music"
  ],
  [
    "live performances",
    "live-music"
  ],
  [
    "karaoke",
    "karaoke"
  ],
  [
    "dancing",
    "dancing"
  ],
  [
    "dance floor",
    "dancing"
  ],
  [
    "cocktails",
    "cocktails"
  ],
  [
    "beer",
    "craft-beer"
  ],
  [
    "wine",
    "wine"
  ],
  [
    "sports",
    "sports-bar"
  ],
  [
    "trendy",
    "trendy"
  ],
  [
    "cozy",
    "cozy"
  ],
  [
    "romantic",
    "romantic"
  ],
  [
    "upscale",
    "upscale"
  ],
  [
    "fine dining",
    "upscale"
  ],
  [
    "casual",
    "casual"
  ],
  [
    "fireplace",
    "fireplace"
  ],
  [
    "lgbtq",
    "lgbtqia-friendly"
  ],
  [
    "groups",
    "good-for-groups"
  ],
  [
    "good for kids",
    "family-friendly"
  ],
  [
    "vegetarian",
    "vegetarian-friendly"
  ],
  [
    "vegan",
    "vegan-friendly"
  ],
  [
    "wheelchair accessible",
    "wheelchair-accessible"
  ],
  [
    "wi-fi",
    "free-wifi"
  ],
  [
    "accepts reservations",
    "reservations"
  ],
  [
    "pool",
    "pool-table"
  ],
  [
    "billiards",
    "pool-table"
  ],
  [
    "darts",
    "darts"
  ],
  [
    "late-night",
    "late-night"
  ],
  [
    "private dining",
    "private-events"
  ]
];
function flattenAttrs(ai) {
  const out = [];
  if (!ai || typeof ai !== "object") return out;
  for (const section of Object.values(ai)){
    if (!Array.isArray(section)) continue;
    for (const entry of section){
      if (entry && typeof entry === "object") {
        for (const [label, val] of Object.entries(entry))if (val === true) out.push(label);
      }
    }
  }
  return out;
}
function extractTags(it, attrs) {
  const blob = [
    it.categoryName,
    ...it.categories ?? [],
    ...attrs
  ].join(" | ").toLowerCase();
  const tags = new Set();
  for (const [kw, slug] of TAG_MAP)if (blob.includes(kw)) tags.add(slug);
  return [
    ...tags
  ];
}
// Tokens used to decide whether two venue names refer to the same business. Generic
// venue-type words are stripped so a shared token signals the *brand*, not the category.
const NAME_STOPWORDS = new Set([
  "the", "a", "an", "and", "of", "on", "at", "in", "to", "co", "kc", "amp",
  "bar", "grill", "lounge", "restaurant", "kitchen", "cafe", "tavern", "pub",
  "company", "house", "room", "club", "social"
]);
function nameTokens(s) {
  return new Set((s ?? "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((t)=>t.length >= 3 && !NAME_STOPWORDS.has(t)));
}
function sharesNameToken(a, b) {
  const tb = nameTokens(b);
  for (const t of nameTokens(a))if (tb.has(t)) return true;
  return false;
}
// Great-circle distance in meters; returns Infinity when either point lacks coordinates.
function distanceMeters(aLat, aLng, bLat, bLng) {
  if (aLat == null || aLng == null || bLat == null || bLng == null) return Infinity;
  const R = 6371000, toRad = (d)=>d * Math.PI / 180;
  const dLat = toRad(bLat - aLat), dLng = toRad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
// A curated venue and an incoming pull item are the same place only when they are both
// physically co-located AND share a brand token — co-located-but-distinct neighbors
// (food courts, multi-tenant buildings) must NOT be merged.
const MATCH_RADIUS_M = 75;
Deno.serve(async (req)=>{
  const secret = Deno.env.get("INGEST_SECRET");
  if (!secret || req.headers.get("x-ingest-secret") !== secret) {
    return new Response("unauthorized", {
      status: 401
    });
  }
  let body;
  try {
    body = await req.json();
  } catch  {
    return new Response("bad json", {
      status: 400
    });
  }
  const datasetId = body?.resource?.defaultDatasetId ?? body?.datasetId;
  const runId = body?.resource?.id ?? body?.eventData?.actorRunId ?? null;
  if (!datasetId) return new Response("missing datasetId", {
    status: 400
  });
  const APIFY_TOKEN = Deno.env.get("APIFY_TOKEN");
  if (!APIFY_TOKEN) return new Response("APIFY_TOKEN not configured", {
    status: 500
  });
  const dsRes = await fetch(`https://api.apify.com/v2/datasets/${datasetId}/items?clean=true&format=json&token=${APIFY_TOKEN}`);
  if (!dsRes.ok) return new Response(`apify fetch failed: ${dsRes.status}`, {
    status: 502
  });
  const items = await dsRes.json();
  const supabase = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
  const [{ data: venues }, { data: staged }] = await Promise.all([
    supabase.from("venues").select("id,name,lat,lng,places_id"),
    supabase.from("staging_venues").select("external_ref").not("external_ref", "is", null)
  ]);
  const venueRows = venues ?? [];
  const existing = new Set([
    ...venueRows.map((v)=>v.places_id).filter(Boolean),
    ...(staged ?? []).map((s)=>s.external_ref)
  ]);
  const seen = new Set();
  const toInsert = [];
  let linked = 0;
  for (const it of items){
    if (!inScope(it)) continue;
    if (existing.has(it.placeId) || seen.has(it.placeId)) continue;

    // Dedup gap fix: a curated venue without a places_id (manual/seed entry) is invisible to
    // the places_id check above, so the pull would re-create it as a duplicate. Instead, link
    // the pull to the nearest co-located venue that shares a brand token and backfill its
    // places_id — future pulls then dedup by places_id and never duplicate it again.
    const ilat = it.location?.lat ?? null, ilng = it.location?.lng ?? null;
    if (ilat != null && ilng != null) {
      let best = null, bestD = MATCH_RADIUS_M;
      for (const v of venueRows){
        if (v.places_id) continue;
        const d = distanceMeters(ilat, ilng, v.lat, v.lng);
        if (d <= bestD && sharesNameToken(it.title, v.name)) { best = v; bestD = d; }
      }
      if (best) {
        const { error: linkErr } = await supabase.from("venues").update({ places_id: it.placeId }).eq("id", best.id).is("places_id", null);
        if (!linkErr) {
          best.places_id = it.placeId; // keep in-memory dedup state consistent for the rest of this run
          existing.add(it.placeId);
          seen.add(it.placeId);
          linked += 1;
          continue; // matched an existing venue — do NOT stage a duplicate
        }
        // link failed (e.g. a concurrent writer claimed it) — fall through and stage normally
      }
    }
    seen.add(it.placeId);
    const attrs = flattenAttrs(it.additionalInfo);
    const tags = extractTags(it, attrs);
    toInsert.push({
      source: "apify:compass/crawler-google-places",
      external_ref: it.placeId,
      status: "pending",
      payload: {
        name: it.title,
        category: it.categoryName,
        categories: it.categories ?? [],
        address: it.address,
        city: it.city,
        state: it.state,
        zip: it.postalCode,
        phone: it.phone ?? null,
        website: it.website ?? null,
        lat: it.location?.lat ?? null,
        lng: it.location?.lng ?? null,
        rating: it.totalScore ?? null,
        reviewsCount: it.reviewsCount ?? null,
        placeId: it.placeId,
        openingHours: it.openingHours ?? null,
        instagram_url: it.instagrams?.[0] ?? null,
        facebook_url: it.facebooks?.[0] ?? null,
        tiktok_url: it.tiktoks?.[0] ?? null,
        socials: {
          instagram: it.instagrams ?? [],
          facebook: it.facebooks ?? [],
          tiktok: it.tiktoks ?? [],
          twitter: it.twitters ?? [],
          youtube: it.youtubes ?? [],
          linkedin: it.linkedIns ?? []
        },
        emails: it.emails ?? [],
        thumbnail_url: it.imageUrl ?? null,
        tags,
        attributes: attrs,
        scraped_via: "edge-fn",
        source_run_id: runId
      }
    });
  }
  let inserted = 0;
  for(let i = 0; i < toInsert.length; i += 200){
    const chunk = toInsert.slice(i, i + 200);
    const { error } = await supabase.from("staging_venues").insert(chunk);
    if (error) {
      return new Response(JSON.stringify({
        error: error.message,
        inserted
      }), {
        status: 500,
        headers: {
          "Content-Type": "application/json"
        }
      });
    }
    inserted += chunk.length;
  }
  return new Response(JSON.stringify({
    ok: true,
    dataset: datasetId,
    candidates: items.length,
    inserted,
    linked
  }), {
    headers: {
      "Content-Type": "application/json"
    }
  });
});
