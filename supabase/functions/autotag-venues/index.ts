// autotag-venues: evidence-based venue tagging with verification gates.
// See docs/autotag-verification-process.md for the full design.
//
// Modes: dry-run (no writes), suggest (tag_suggestions only), apply (also
// auto-applies the high-confidence tier to venue_tags).
//
// Gates enforced here, in order:
//   1. taxonomy   — only active approved_tags
//   2. identity   — ownership/identity tags are never auto-applied
//   3. tombstone  — rejected (venue,tag) pairs are never re-suggested
//   4. existing   — tags already on the venue are skipped
//   5. lock       — verified venues with 'tags' locked route everything to review
//   6. confidence — auto >=0.85 with (>=2 sources or single base >=0.90); review >=0.50
//   7. cardinality— per-category auto-apply caps (cuisine 3, vibe 4, feature 5, drink 4)
//   8. idempotent — ON CONFLICT DO NOTHING everywhere
//   9. audit      — every action recorded in tag_suggestions + autotag_runs

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
if (!supabaseUrl || !serviceKey) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

// ---------------------------------------------------------------- policy ---
const AUTO_APPLY_THRESHOLD = 0.85;
const REVIEW_THRESHOLD = 0.5;
const SINGLE_SOURCE_AUTO_BASE = 0.9;
const CATEGORY_CAPS: Record<string, number> = { cuisine: 3, vibe: 4, feature: 5, drink_type: 4 };
const IDENTITY_TAGS = new Set([
  "black-owned", "women-owned", "latinx-owned", "lgbtq-owned", "veteran-owned", "lgbtqia-friendly",
]);

type Hit = { slug: string; conf: number; evidence: string };

// Google additionalInfo attribute (lowercased, exact) -> tag hits
const ATTR_MAP: Array<[string, string, number]> = [
  ["outdoor seating", "outdoor-seating", 0.92],
  ["rooftop seating", "rooftop", 0.9],
  ["wheelchair accessible entrance", "wheelchair-accessible", 0.92],
  ["live music", "live-music", 0.9],
  ["live performances", "live-music", 0.7],
  ["karaoke", "karaoke", 0.9],
  ["trivia night", "trivia-night", 0.9],
  ["dancing", "dancing", 0.85],
  ["fireplace", "fireplace", 0.9],
  ["free wi-fi", "free-wifi", 0.9],
  ["wi-fi", "free-wifi", 0.7],
  ["dogs allowed", "dog-friendly", 0.9],
  ["dogs allowed outside", "dog-friendly", 0.8],
  ["good for groups", "good-for-groups", 0.85],
  ["groups", "good-for-groups", 0.75],
  ["good for kids", "family-friendly", 0.7],
  ["family-friendly", "family-friendly", 0.85],
  ["accepts reservations", "reservations", 0.92],
  ["small plates", "small-plates", 0.85],
  ["great cocktails", "cocktails", 0.85],
  ["cocktails", "cocktails", 0.8],
  ["great beer selection", "craft-beer", 0.75],
  ["great wine list", "wine", 0.85],
  ["wine", "wine", 0.7],
  ["vegan options", "vegan-friendly", 0.88],
  ["vegetarian options", "vegetarian-friendly", 0.88],
  ["brunch", "brunch", 0.85],
  ["late-night food", "late-night", 0.8],
  ["sports", "sports-bar", 0.65],
  ["pool table", "pool-table", 0.85],
  ["darts", "darts", 0.85],
  ["private dining", "private-events", 0.8],
  ["private events", "private-events", 0.8],
  ["cozy", "cozy", 0.8],
  ["trendy", "trendy", 0.8],
  ["romantic", "romantic", 0.8],
  ["upscale", "upscale", 0.8],
  // identity attributes: high confidence, but the identity gate routes them to review
  ["lgbtq+ friendly", "lgbtqia-friendly", 0.9],
  ["transgender safespace", "lgbtqia-friendly", 0.85],
  ["identifies as black-owned", "black-owned", 0.95],
  ["identifies as women-owned", "women-owned", 0.95],
  ["identifies as veteran-owned", "veteran-owned", 0.95],
  ["identifies as latino-owned", "latinx-owned", 0.95],
  ["identifies as lgbtq+ owned", "lgbtq-owned", 0.95],
];

// Google category substring -> tag hits
const CATEGORY_MAP: Array<[string, string, number]> = [
  ["mexican", "mexican", 0.85], ["tex-mex", "mexican", 0.8], ["taqueria", "mexican", 0.85],
  ["taco", "tacos", 0.85],
  ["italian", "italian", 0.85], ["pizza", "pizza", 0.85],
  ["sushi", "sushi", 0.85], ["japanese", "japanese", 0.85], ["korean", "korean", 0.85],
  ["thai", "thai", 0.85], ["chinese", "chinese", 0.85], ["vietnamese", "vietnamese", 0.85],
  ["indian", "indian", 0.85], ["mediterranean", "mediterranean", 0.85], ["greek", "mediterranean", 0.8],
  ["middle eastern", "mediterranean", 0.7],
  ["seafood", "seafood", 0.85], ["steak", "steakhouse", 0.85],
  ["barbecue", "bbq", 0.85], ["bbq", "bbq", 0.85],
  ["hamburger", "burger", 0.85], ["burger", "burger", 0.85],
  ["american", "american", 0.8], ["southern", "southern", 0.85], ["soul food", "soul-food", 0.85],
  ["cajun", "cajun", 0.85], ["creole", "creole", 0.85], ["caribbean", "caribbean", 0.85],
  ["jamaican", "jamaican", 0.85], ["cuban", "cuban", 0.85], ["ethiopian", "ethiopian", 0.85],
  ["african", "african", 0.8], ["tapas", "tapas", 0.85], ["gastropub", "gastropub", 0.85],
  ["brewery", "brewery", 0.88], ["brewpub", "brewery", 0.85],
  ["wine bar", "wine-bar", 0.88], ["cocktail bar", "cocktail-bar", 0.88],
  ["sports bar", "sports-bar", 0.88], ["lounge", "lounge", 0.8],
  ["night club", "dancing", 0.7], ["jazz", "jazz", 0.85], ["karaoke", "karaoke", 0.85],
  ["comedy club", "stand-up-comedy", 0.85],
];

// venues.cuisine_type value (normalized) -> tag hits
const CUISINE_FIELD_MAP: Record<string, Array<[string, number]>> = {
  american: [["american", 0.85]], barbecue: [["bbq", 0.85]], steakhouse: [["steakhouse", 0.85]],
  mexican: [["mexican", 0.85]], "coastal mexican": [["mexican", 0.85], ["seafood", 0.7]],
  brewery: [["brewery", 0.85], ["craft-beer", 0.8]], italian: [["italian", 0.85]],
  jazz_club: [["jazz", 0.85], ["live-music", 0.8]], thai: [["thai", 0.85]],
  soul_food: [["soul-food", 0.85]], cocktail_bar: [["cocktail-bar", 0.85], ["cocktails", 0.8]],
  pizza: [["pizza", 0.85]], middle_eastern: [["mediterranean", 0.7]], seafood: [["seafood", 0.85]],
  vietnamese: [["vietnamese", 0.85]], spanish: [["tapas", 0.7]], southern: [["southern", 0.85]],
};

// legacy venues.tags slug -> approved slug (passthroughs handled separately)
const LEGACY_NORMALIZE: Record<string, string> = {
  cocktail_bar: "cocktail-bar", sports_bar: "sports-bar", wine_bar: "wine-bar",
  lounge_bar: "lounge", hamburger: "burger", family: "family-friendly",
  vegetarian: "vegetarian-friendly", vegan: "vegan-friendly", fine_dining: "upscale",
  nightlife: "late-night", soul_food: "soul-food",
};
const LEGACY_CONF = 0.75;
const LEGACY_WEAK: Record<string, number> = { nightlife: 0.6, american: 0.7 };

// venue name regex -> tag hits
const NAME_MAP: Array<[RegExp, string, number]> = [
  [/taqueria/, "mexican", 0.85], [/cantina/, "mexican", 0.7], [/\btaco/, "tacos", 0.85],
  [/pizz/, "pizza", 0.85], [/sushi/, "sushi", 0.85],
  [/\bbbq\b|barbecue|smokehouse/, "bbq", 0.85], [/steak/, "steakhouse", 0.8],
  [/oyster/, "seafood", 0.8], [/wine bar/, "wine-bar", 0.88],
  [/brewing|brewery|brewhouse|taproom|beer (co|hall)/, "brewery", 0.88],
  [/brewing|brewery|brewhouse|taproom/, "craft-beer", 0.75],
  [/cocktail/, "cocktail-bar", 0.8], [/whiskey|bourbon/, "whiskey", 0.8],
  [/tequila/, "tequila", 0.85], [/margarita/, "margaritas", 0.8],
  [/jazz/, "jazz", 0.85], [/karaoke/, "karaoke", 0.85], [/speakeasy/, "speakeasy", 0.8],
  [/rooftop/, "rooftop", 0.85], [/patio/, "patio", 0.8], [/lounge/, "lounge", 0.75],
  [/\bdive\b/, "dive-bar", 0.75], [/comedy/, "stand-up-comedy", 0.85],
  [/gastropub/, "gastropub", 0.85], [/tapas/, "tapas", 0.85],
];

// menu text: regex, tag, min distinct items required
const MENU_MAP: Array<[RegExp, string, number]> = [
  [/margarita/, "margaritas", 2],
  [/\bwine\b/, "wine", 3],
  [/old fashioned|manhattan|negroni|martini|cocktail|paloma|mule/, "cocktails", 3],
  [/whiskey|bourbon|\brye\b|scotch/, "whiskey", 3],
  [/tequila|mezcal/, "tequila", 3],
  [/\bsake\b/, "sake", 2],
  [/\bipa\b|lager|pilsner|stout|draft|draught|hazy/, "craft-beer", 3],
  [/\btacos?\b/, "tacos", 2],
  [/sushi|sashimi|nigiri|maki/, "sushi", 2],
  [/oyster|shrimp|crab|calamari|mussels|ceviche/, "seafood", 3],
  [/burger|sliders/, "burger", 2],
  [/\bpizza\b/, "pizza", 2],
];
const MENU_BASE = 0.6, MENU_STEP = 0.05, MENU_CAP = 0.8;

// website text: regex, tag, confidence
const SITE_MAP: Array<[RegExp, string, number]> = [
  [/\bpatio\b/, "patio", 0.65], [/rooftop/, "rooftop", 0.7], [/\btrivia\b/, "trivia-night", 0.7],
  [/karaoke/, "karaoke", 0.7], [/live music/, "live-music", 0.7],
  [/dog.?friendly|pet.?friendly|dogs welcome/, "dog-friendly", 0.7],
  [/\bbrunch\b/, "brunch", 0.65],
  [/private (events?|dining|parties)|event space|book your event/, "private-events", 0.7],
  [/accepts? reservations|reserve a table|make a reservation|opentable|resy/, "reservations", 0.65],
  [/\bvegan\b/, "vegan-friendly", 0.6], [/vegetarian/, "vegetarian-friendly", 0.6],
  [/craft beer|craft brews|on tap|tap list/, "craft-beer", 0.65],
  [/wine list|by the glass/, "wine", 0.65], [/cocktail/, "cocktails", 0.6],
  [/speakeasy/, "speakeasy", 0.7], [/\bjazz\b/, "jazz", 0.6],
  [/late.?night/, "late-night", 0.6], [/\bdarts\b/, "darts", 0.7],
  [/pool table|billiards/, "pool-table", 0.7],
  [/comedy night|stand.?up comedy|open mic/, "stand-up-comedy", 0.7],
  [/date night/, "date-night", 0.55], [/happy hour menu|small plates/, "small-plates", 0.55],
];

// ------------------------------------------------------------- extractors ---
function extractFromAttrs(attrs: string[]): Hit[] {
  const hits: Hit[] = [];
  const set = new Set(attrs.map((a) => String(a).toLowerCase().trim()));
  for (const [attr, slug, conf] of ATTR_MAP) {
    if (set.has(attr)) hits.push({ slug, conf, evidence: `Google attribute: "${attr}"` });
  }
  return hits;
}

function extractFromCategories(cats: string[]): Hit[] {
  const hits: Hit[] = [];
  const blob = cats.map((c) => String(c).toLowerCase()).join(" | ");
  for (const [kw, slug, conf] of CATEGORY_MAP) {
    if (blob.includes(kw)) hits.push({ slug, conf, evidence: `Google category contains "${kw}" (${blob.slice(0, 120)})` });
  }
  return hits;
}

function extractFromCuisineField(cuisine: string | null): Hit[] {
  if (!cuisine) return [];
  const key = cuisine.toLowerCase().trim();
  const direct = CUISINE_FIELD_MAP[key];
  if (direct) return direct.map(([slug, conf]) => ({ slug, conf, evidence: `cuisine_type = "${cuisine}"` }));
  return []; // unmapped values (bar, deli, healthy, food_hall, german...) carry no tag
}

function extractFromLegacyArray(tags: string[], activeSlugs: Set<string>): Hit[] {
  const hits: Hit[] = [];
  for (const raw of tags) {
    const t = String(raw).toLowerCase().trim();
    const slug = LEGACY_NORMALIZE[t] ?? (activeSlugs.has(t) ? t : null);
    if (slug) hits.push({ slug, conf: LEGACY_WEAK[t] ?? LEGACY_CONF, evidence: `legacy venues.tags entry "${t}"` });
  }
  return hits;
}

function extractFromName(name: string): Hit[] {
  const hits: Hit[] = [];
  const n = name.toLowerCase();
  for (const [re, slug, conf] of NAME_MAP) {
    if (re.test(n)) hits.push({ slug, conf, evidence: `venue name matches ${re} ("${name}")` });
  }
  return hits;
}

function extractFromMenu(items: string[]): Hit[] {
  const hits: Hit[] = [];
  for (const [re, slug, minItems] of MENU_MAP) {
    const matched = items.filter((t) => re.test(t));
    if (matched.length >= minItems) {
      const conf = Math.min(MENU_CAP, MENU_BASE + (matched.length - minItems) * MENU_STEP);
      hits.push({ slug, conf, evidence: `${matched.length} menu items match ${re} (e.g. "${matched[0].slice(0, 60)}")` });
    }
  }
  return hits;
}

function extractFromWebsite(text: string): Hit[] {
  const hits: Hit[] = [];
  const noReservations = /no reservations|walk.?ins? only/.test(text);
  for (const [re, slug, conf] of SITE_MAP) {
    if (slug === "reservations" && noReservations) continue;
    const m = text.match(re);
    if (m) hits.push({ slug, conf, evidence: `website mentions "${m[0]}"` });
  }
  return hits;
}

// ------------------------------------------------------------ website fetch ---
async function fetchSiteText(url: string): Promise<string | null> {
  try {
    let u = url.trim();
    if (!/^https?:\/\//i.test(u)) u = `https://${u}`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    const res = await fetch(u, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: { "user-agent": "HappiTimeBot/1.0 (+https://happitime.biz) venue-tagging" },
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") ?? "";
    if (!ct.includes("html") && !ct.includes("text")) return null;
    const raw = (await res.text()).slice(0, 300_000);
    return raw
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&[a-z#0-9]+;/gi, " ")
      .replace(/\s+/g, " ")
      .toLowerCase();
  } catch {
    return null;
  }
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]);
    }
  });
  await Promise.all(workers);
  return out;
}

// ------------------------------------------------------------------- main ---
Deno.serve(async (req: Request) => {
  // auth: shared job token (same pattern as geocode-venues)
  const provided = req.headers.get("x-autotag-token") ?? "";
  const { data: expected, error: tokErr } = await supabase.rpc("get_autotag_job_token");
  if (tokErr) return json({ error: `token lookup failed: ${tokErr.message}` }, 500);
  if (!expected || provided !== expected) return json({ error: "unauthorized" }, 401);

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* allow empty body */ }
  const url = new URL(req.url);
  const mode = String(body.mode ?? url.searchParams.get("mode") ?? "dry-run");
  const limit = Math.max(1, Math.min(Number(body.limit ?? url.searchParams.get("limit") ?? 50), 200));
  const venueIds = Array.isArray(body.venue_ids) ? (body.venue_ids as string[]) : null;
  if (!["dry-run", "suggest", "apply"].includes(mode)) return json({ error: `bad mode: ${mode}` }, 400);

  // run record
  const { data: run, error: runErr } = await supabase
    .from("autotag_runs").insert({ mode }).select("id").single();
  if (runErr) return json({ error: `autotag_runs insert failed: ${runErr.message}` }, 500);
  const runId = run.id as string;
  const errors: string[] = [];

  // taxonomy
  const { data: tagRows, error: tagErr } = await supabase
    .from("approved_tags").select("id,slug,category").eq("is_active", true);
  if (tagErr) return json({ error: tagErr.message }, 500);
  const tagBySlug = new Map<string, { id: string; category: string }>();
  for (const t of tagRows ?? []) tagBySlug.set(t.slug, { id: t.id, category: t.category });
  const activeSlugs = new Set(tagBySlug.keys());

  // venue selection
  let venues: any[] = [];
  if (venueIds?.length) {
    const { data, error } = await supabase
      .from("venues")
      .select("id,name,cuisine_type,tags,website,places_id,is_verified,data_locked_fields,updated_at")
      .in("id", venueIds).eq("status", "published");
    if (error) return json({ error: error.message }, 500);
    venues = data ?? [];
  } else {
    const { data: states } = await supabase.from("autotag_venue_state").select("venue_id,last_autotagged_at");
    const stateMap = new Map((states ?? []).map((s) => [s.venue_id, s.last_autotagged_at]));
    const { data, error } = await supabase
      .from("venues")
      .select("id,name,cuisine_type,tags,website,places_id,is_verified,data_locked_fields,updated_at")
      .eq("status", "published").order("updated_at", { ascending: true });
    if (error) return json({ error: error.message }, 500);
    venues = (data ?? []).filter((v) => {
      const last = stateMap.get(v.id);
      return !last || new Date(v.updated_at) > new Date(last);
    }).slice(0, limit);
  }

  if (venues.length === 0) {
    await supabase.from("autotag_runs").update({ finished_at: new Date().toISOString() }).eq("id", runId);
    return json({ run_id: runId, mode, venues_processed: 0, message: "nothing to process" });
  }
  const ids = venues.map((v) => v.id);

  // bulk evidence fetches
  const placeIds = venues.map((v) => v.places_id).filter(Boolean);
  const [stagingRes, existingRes, tombstoneRes, menuRes] = await Promise.all([
    placeIds.length
      ? supabase.from("staging_venues").select("external_ref,payload").in("external_ref", placeIds)
      : Promise.resolve({ data: [], error: null } as any),
    supabase.from("venue_tags").select("venue_id,tag_id").in("venue_id", ids),
    supabase.from("tag_suggestions").select("venue_id,tag_id").not("rejected_at", "is", null).in("venue_id", ids),
    supabase.from("menus").select("venue_id,is_active,menu_sections(name,menu_items(name,description))").in("venue_id", ids),
  ]);
  for (const r of [stagingRes, existingRes, tombstoneRes, menuRes]) {
    if (r.error) errors.push(r.error.message);
  }

  const stagingByRef = new Map<string, { attrs: string[]; cats: string[] }>();
  for (const s of stagingRes.data ?? []) {
    const cur = stagingByRef.get(s.external_ref) ?? { attrs: [], cats: [] };
    const p = s.payload ?? {};
    if (Array.isArray(p.attributes)) cur.attrs.push(...p.attributes);
    if (typeof p.category === "string") cur.cats.push(p.category);
    if (Array.isArray(p.categories)) cur.cats.push(...p.categories);
    stagingByRef.set(s.external_ref, cur);
  }
  const existing = new Set((existingRes.data ?? []).map((r: any) => `${r.venue_id}:${r.tag_id}`));
  const tombstones = new Set((tombstoneRes.data ?? []).map((r: any) => `${r.venue_id}:${r.tag_id}`));
  const menuTextByVenue = new Map<string, string[]>();
  for (const m of menuRes.data ?? []) {
    if (m.is_active === false) continue;
    const arr = menuTextByVenue.get(m.venue_id) ?? [];
    for (const sec of m.menu_sections ?? []) {
      for (const it of sec.menu_items ?? []) {
        arr.push(`${sec.name ?? ""} ${it.name ?? ""} ${it.description ?? ""}`.toLowerCase());
      }
    }
    menuTextByVenue.set(m.venue_id, arr);
  }

  // website fetches (concurrency 6)
  const siteTexts = await mapWithConcurrency(venues, 6, async (v) =>
    v.website ? await fetchSiteText(v.website) : null
  );

  // per-venue pipeline
  const suggestionRows: any[] = [];
  const applyPairs: Array<{ venue_id: string; tag_id: string }> = [];
  const decisions: any[] = [];
  let queuedForReview = 0;

  venues.forEach((v, idx) => {
    const hits: Array<Hit & { source: string }> = [];
    const staging = v.places_id ? stagingByRef.get(v.places_id) : undefined;
    if (staging?.attrs.length) for (const h of extractFromAttrs(staging.attrs)) hits.push({ ...h, source: "autotag:google_attributes" });
    if (staging?.cats.length) for (const h of extractFromCategories(staging.cats)) hits.push({ ...h, source: "autotag:google_category" });
    for (const h of extractFromCuisineField(v.cuisine_type)) hits.push({ ...h, source: "autotag:cuisine_field" });
    if (Array.isArray(v.tags)) for (const h of extractFromLegacyArray(v.tags, activeSlugs)) hits.push({ ...h, source: "autotag:legacy_array" });
    for (const h of extractFromName(v.name ?? "")) hits.push({ ...h, source: "autotag:name_keyword" });
    const menuTexts = menuTextByVenue.get(v.id);
    if (menuTexts?.length) for (const h of extractFromMenu(menuTexts)) hits.push({ ...h, source: "autotag:menu_text" });
    const siteText = siteTexts[idx];
    if (siteText) for (const h of extractFromWebsite(siteText)) hits.push({ ...h, source: "autotag:website_scan" });

    // aggregate per tag — gate 1 (taxonomy) via tagBySlug lookup
    const byTag = new Map<string, Array<Hit & { source: string }>>();
    for (const h of hits) {
      if (!tagBySlug.has(h.slug)) continue;
      const arr = byTag.get(h.slug) ?? [];
      arr.push(h);
      byTag.set(h.slug, arr);
    }

    const locked = v.is_verified === true && Array.isArray(v.data_locked_fields) && v.data_locked_fields.includes("tags");
    const autoByCat: Record<string, number> = {};
    const venueDecisions: any[] = [];

    // deterministic order: highest combined confidence first (matters for caps)
    const scored = [...byTag.entries()].map(([slug, list]) => {
      const sources = new Set(list.map((l) => l.source));
      const combined = Math.min(0.99, 1 - list.reduce((acc, l) => acc * (1 - l.conf), 1));
      const maxBase = Math.max(...list.map((l) => l.conf));
      return { slug, list, sources, combined, maxBase };
    }).sort((a, b) => b.combined - a.combined);

    for (const s of scored) {
      const tag = tagBySlug.get(s.slug)!;
      const key = `${v.id}:${tag.id}`;
      if (existing.has(key)) continue;            // gate 4
      if (tombstones.has(key)) continue;          // gate 3
      if (s.combined < REVIEW_THRESHOLD) continue; // discard tier

      let tier: "auto" | "review" = "review";
      if (
        s.combined >= AUTO_APPLY_THRESHOLD &&
        (s.sources.size >= 2 || s.maxBase >= SINGLE_SOURCE_AUTO_BASE) &&
        !IDENTITY_TAGS.has(s.slug) &&             // gate 2
        !locked                                    // gate 5
      ) {
        const cap = CATEGORY_CAPS[tag.category] ?? 4;
        const used = autoByCat[tag.category] ?? 0;
        if (used < cap) {                          // gate 7
          tier = "auto";
          autoByCat[tag.category] = used + 1;
        }
      }

      for (const h of s.list) {
        suggestionRows.push({
          venue_id: v.id, tag_id: tag.id, source: h.source,
          confidence: Math.round(h.conf * 100) / 100, evidence: h.evidence.slice(0, 500),
        });
      }
      if (tier === "auto") applyPairs.push({ venue_id: v.id, tag_id: tag.id });
      else queuedForReview++;
      venueDecisions.push({ tag: s.slug, tier, combined: Math.round(s.combined * 100) / 100, sources: [...s.sources], evidence: s.list.map((l) => l.evidence) });
    }
    decisions.push({ venue_id: v.id, venue: v.name, locked, website_fetched: siteText != null, tags: venueDecisions });
  });

  // writes
  let applied = 0;
  if (mode !== "dry-run") {
    if (suggestionRows.length) {
      const { error } = await supabase.from("tag_suggestions")
        .upsert(suggestionRows, { onConflict: "venue_id,tag_id,source", ignoreDuplicates: true });
      if (error) errors.push(`tag_suggestions upsert: ${error.message}`);
    }
    if (mode === "apply" && applyPairs.length) {
      const { error } = await supabase.from("venue_tags")
        .upsert(applyPairs, { onConflict: "venue_id,tag_id", ignoreDuplicates: true }); // gate 8
      if (error) errors.push(`venue_tags upsert: ${error.message}`);
      else {
        applied = applyPairs.length;
        // gate 9: mark contributing suggestions applied
        const appliedAt = new Date().toISOString();
        for (const p of applyPairs) {
          const { error: updErr } = await supabase.from("tag_suggestions")
            .update({ applied_at: appliedAt })
            .eq("venue_id", p.venue_id).eq("tag_id", p.tag_id)
            .is("applied_at", null).is("rejected_at", null);
          if (updErr) errors.push(`mark applied ${p.venue_id}/${p.tag_id}: ${updErr.message}`);
        }
      }
    }
    // venue state (not in dry-run, so dry-runs can be repeated)
    const stateRows = venues.map((v) => ({
      venue_id: v.id, last_autotagged_at: new Date().toISOString(), last_run_id: runId,
      last_suggestion_count: decisions.find((d) => d.venue_id === v.id)?.tags.length ?? 0,
    }));
    const { error: stErr } = await supabase.from("autotag_venue_state").upsert(stateRows, { onConflict: "venue_id" });
    if (stErr) errors.push(`autotag_venue_state upsert: ${stErr.message}`);
  }

  const summary = {
    run_id: runId, mode, venues_processed: venues.length,
    suggestions_created: suggestionRows.length, auto_applied: applied,
    auto_apply_candidates: applyPairs.length, queued_for_review: queuedForReview,
    errors,
  };
  await supabase.from("autotag_runs").update({
    finished_at: new Date().toISOString(), venues_processed: venues.length,
    suggestions_created: suggestionRows.length, auto_applied: applied,
    queued_for_review: queuedForReview, errors: errors,
    stats: { auto_apply_candidates: applyPairs.length, websites_fetched: siteTexts.filter(Boolean).length },
  }).eq("id", runId);

  return json({ ...summary, decisions: mode === "dry-run" ? decisions : undefined });
});

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json" } });
}
