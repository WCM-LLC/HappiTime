# validate-venue-places Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the missing `validate-venue-places` edge function so the live, hourly, currently-404ing `validate-venue-places-hourly` cron does real work: batch-validate venue addresses against Google Places and log/flag drift.

**Architecture:** A pure normalize-and-score module (`_shared/address-match.ts`, fully unit-tested) does the only non-trivial logic. The edge function entrypoint is thin glue mirroring `geocode-venues` (header-token auth + batch loop) and `import-places` (Places v1 fetch-by-id). One companion migration adds the `venues.needs_address_review` flag. The existing cron + wrapper are unchanged.

**Tech Stack:** Deno edge function (TypeScript), `@supabase/supabase-js@2.48.0`, Google Places API v1, Postgres (Supabase), `deno test` for unit tests.

**Spec:** `docs/superpowers/specs/2026-06-15-validate-venue-places-design.md`

---

## File Structure

- **Create** `supabase/migrations/<ts>_add_needs_address_review_flag.sql` — adds `venues.needs_address_review`.
- **Create** `supabase/functions/_shared/address-match.ts` — pure `normalizeAddress()` + `addressMatchScore()`. One responsibility: turn two address strings into a `[0,1]` similarity. No I/O.
- **Create** `supabase/functions/_shared/address-match.test.ts` — Deno unit tests for the scorer.
- **Create** `supabase/functions/validate-venue-places/index.ts` — entrypoint: auth, batch select, Places fetch, score, persist. Thin glue only.
- **Modify** `supabase/config.toml` — declare the function with `verify_jwt = false`.

---

## Task 1: Companion migration — `needs_address_review` flag

**Files:**
- Create: `supabase/migrations/<ts>_add_needs_address_review_flag.sql` (use a real UTC timestamp newer than `20260613220157`, e.g. `20260615HHMMSS`)

- [ ] **Step 1: Write the migration**

```sql
-- Flag set by validate-venue-places when a venue's stored address drifts from
-- Google's canonical Places record. Surfaced in admin review later.
ALTER TABLE public.venues
  ADD COLUMN IF NOT EXISTS needs_address_review boolean NOT NULL DEFAULT false;
```

- [ ] **Step 2: Verify it parses against a local/branch DB (or review-only if no local stack)**

Run: `supabase db diff` is not required; if a local stack is available:
`supabase migration up` and confirm no error.
Expected: column added, no error. (If no local stack, this migration is applied to prod via MCP `apply_migration` during Task 5 deploy and is already committed here — same flow used for the recovered 06-13 migrations.)

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/*_add_needs_address_review_flag.sql
git commit -m "feat(db): add venues.needs_address_review flag for address validation"
```

---

## Task 2: Pure address-match module (TDD)

**Files:**
- Create: `supabase/functions/_shared/address-match.ts`
- Test: `supabase/functions/_shared/address-match.test.ts`

The scorer compares **street number + street name + zip**, ignoring suite/unit noise and abbreviation differences. Score is a weighted blend:
`score = 0.35*numberMatch + 0.35*zipMatch + 0.30*nameDice`, renormalized over the components that are present on both sides. `mismatch = score < threshold` (threshold supplied by caller; default 0.7).

- [ ] **Step 1: Write the failing test**

`supabase/functions/_shared/address-match.test.ts`:
```ts
// Unit tests for the pure address-match scorer used by validate-venue-places.
// Run: deno test --no-config supabase/functions/_shared/address-match.test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { normalizeAddress, addressMatchScore } from "./address-match.ts";

Deno.test("normalize expands abbreviations and lowercases", () => {
  assertEquals(normalizeAddress("123 Main St."), "123 main street");
  assertEquals(normalizeAddress("456 W Oak Ave"), "456 west oak avenue");
});

Deno.test("normalize drops suite/unit noise", () => {
  assertEquals(normalizeAddress("123 Main St, Ste 200"), "123 main street");
  assertEquals(normalizeAddress("123 Main St #4B"), "123 main street");
});

Deno.test("identical addresses score 1.0", () => {
  const s = addressMatchScore("123 Main St, Kansas City, MO 64111",
                              "123 Main Street, Kansas City, MO 64111, USA");
  assertEquals(s, 1);
});

Deno.test("St vs Street equivalence does not lower the score", () => {
  const s = addressMatchScore("500 Walnut St, KC, MO 64106",
                              "500 Walnut Street, Kansas City, MO 64106, USA");
  assertEquals(s >= 0.99, true);
});

Deno.test("different street number is flagged below 0.7", () => {
  const s = addressMatchScore("123 Main St, KC, MO 64111",
                              "987 Main Street, Kansas City, MO 64111, USA");
  assertEquals(s < 0.7, true);
});

Deno.test("different zip is flagged below 0.7", () => {
  const s = addressMatchScore("123 Main St, KC, MO 64111",
                              "123 Main Street, Kansas City, MO 64108, USA");
  assertEquals(s < 0.7, true);
});

Deno.test("missing zip on one side renormalizes over number+name", () => {
  // same number + name, no zip anywhere -> should score high (1.0)
  const s = addressMatchScore("123 Main St", "123 Main Street, Kansas City, MO");
  assertEquals(s >= 0.99, true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `deno test --no-config supabase/functions/_shared/address-match.test.ts`
Expected: FAIL — `Module not found "./address-match.ts"`.

- [ ] **Step 3: Write the implementation**

`supabase/functions/_shared/address-match.ts`:
```ts
// Pure address comparison for validate-venue-places. No I/O.
// Compares street number + street name + zip; ignores suite/unit noise and
// common abbreviation differences. Returns a similarity in [0,1].

const ABBREV: Record<string, string> = {
  st: "street", str: "street", ave: "avenue", av: "avenue", blvd: "boulevard",
  rd: "road", dr: "drive", ln: "lane", ct: "court", cir: "circle", sq: "square",
  hwy: "highway", pkwy: "parkway", pl: "place", ter: "terrace", trl: "trail",
  n: "north", s: "south", e: "east", w: "west",
  ne: "northeast", nw: "northwest", se: "southeast", sw: "southwest",
};

const STOP = new Set(["usa", "us", "united", "states"]);

/** Lowercase, strip punctuation, drop suite/unit noise + country, expand abbreviations. */
export function normalizeAddress(raw: string): string {
  const noSuite = (raw || "")
    .toLowerCase()
    .replace(/[.,]/g, " ")
    // drop "suite 200", "ste 200", "unit 4", "apt 4b", "# 4b"
    .replace(/\b(suite|ste|unit|apt|apartment)\b\s*#?\s*\w+/g, " ")
    .replace(/#\s*\w+/g, " ");
  return noSuite
    .split(/\s+/)
    .filter((t) => t && !STOP.has(t))
    .map((t) => ABBREV[t] ?? t)
    .join(" ")
    .trim();
}

const STREET_NUMBER = /^\s*(\d+)\b/;

function dice(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 1;
  if (a.length === 0 || b.length === 0) return 0;
  const setB = new Map<string, number>();
  for (const t of b) setB.set(t, (setB.get(t) ?? 0) + 1);
  let inter = 0;
  for (const t of a) {
    const c = setB.get(t) ?? 0;
    if (c > 0) { inter++; setB.set(t, c - 1); }
  }
  return (2 * inter) / (a.length + b.length);
}

/** Normalized first comma-segment — the street line only (drops city/state/zip/country). */
function streetLine(raw: string): string {
  return normalizeAddress((raw || "").split(",")[0]);
}

/** Street-name word tokens: the street line minus its leading house number. */
function streetNameTokens(street: string): string[] {
  return street.replace(STREET_NUMBER, " ").split(/\s+/).filter(Boolean);
}

/** Last 5-digit group in the normalized full address (zip lives at the end). */
function extractZip(normalizedFull: string): string | null {
  const zips = normalizedFull.match(/\b\d{5}\b/g);
  return zips ? zips[zips.length - 1] : null;
}

/**
 * Similarity in [0,1] between a stored address and Google's formatted address.
 * Compares ONLY street number + street name + zip (city/state excluded as noise).
 * Weighted: 0.35 street-number + 0.35 zip + 0.30 street-name token Dice,
 * renormalized over whichever of {number, zip} are present on BOTH sides.
 */
export function addressMatchScore(stored: string, google: string): number {
  const aStreet = streetLine(stored);
  const bStreet = streetLine(google);

  const aNum = aStreet.match(STREET_NUMBER)?.[1] ?? null;
  const bNum = bStreet.match(STREET_NUMBER)?.[1] ?? null;
  const aZip = extractZip(normalizeAddress(stored));
  const bZip = extractZip(normalizeAddress(google));

  const nameScore = dice(streetNameTokens(aStreet), streetNameTokens(bStreet));

  let weightSum = 0.3;
  let acc = 0.3 * nameScore;
  if (aNum !== null && bNum !== null) {
    weightSum += 0.35;
    acc += 0.35 * (aNum === bNum ? 1 : 0);
  }
  if (aZip !== null && bZip !== null) {
    weightSum += 0.35;
    acc += 0.35 * (aZip === bZip ? 1 : 0);
  }
  return acc / weightSum;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `deno test --no-config supabase/functions/_shared/address-match.test.ts`
Expected: PASS — all 7 tests ok.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/address-match.ts supabase/functions/_shared/address-match.test.ts
git commit -m "feat(validate): pure address-match scorer + tests"
```

---

## Task 3: Edge function entrypoint

**Files:**
- Create: `supabase/functions/validate-venue-places/index.ts`

Thin glue: token auth (mirrors `geocode-venues`), batch select, Places v1 fetch-by-id (mirrors `import-places`), score (Task 2), persist. Distinguishes Google `404 NOT_FOUND` (stale place → flag, bump timestamp) from transient `429/5xx` (skip, do not bump).

- [ ] **Step 1: Write the implementation**

`supabase/functions/validate-venue-places/index.ts`:
```ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";
import { addressMatchScore } from "../_shared/address-match.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const placesKey = Deno.env.get("GOOGLE_PLACES_API_KEY") ?? "";
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
```

- [ ] **Step 2: Type-check the function**

Run: `deno check supabase/functions/validate-venue-places/index.ts`
Expected: no type errors. (If `deno` is unavailable locally, this is verified during deploy in Task 5, which type-checks on bundle.)

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/validate-venue-places/index.ts
git commit -m "feat(validate): validate-venue-places edge function entrypoint"
```

---

## Task 4: Declare the function in config.toml

**Files:**
- Modify: `supabase/config.toml`

- [ ] **Step 1: Inspect how sibling cron-called functions are declared**

Run: `grep -n -A2 "functions.geocode-venues" supabase/config.toml`
Expected: a block like `[functions.geocode-venues]` with `verify_jwt = false`.

- [ ] **Step 2: Add the matching declaration**

Add to `supabase/config.toml`, mirroring the `geocode-venues` block exactly (cron auths via the `X-Validate-Token` header, not a JWT):
```toml
[functions.validate-venue-places]
verify_jwt = false
```

- [ ] **Step 3: Commit**

```bash
git add supabase/config.toml
git commit -m "chore(functions): declare validate-venue-places (verify_jwt=false)"
```

---

## Task 5: Deploy + post-deploy verification

**Files:** none (deploy + observation)

- [ ] **Step 1: Apply the Task 1 migration to prod**

Apply `<ts>_add_needs_address_review_flag.sql` via Supabase MCP `apply_migration` (project `ujflcrjsiyhofnomurco`), matching the committed filename version so the ledger and repo agree (per the zero-drift invariant).
Expected: success; `venues.needs_address_review` exists.

- [ ] **Step 2: Deploy the function**

Deploy `validate-venue-places` via Supabase MCP `deploy_edge_function` (project `ujflcrjsiyhofnomurco`), including `supabase/functions/_shared/address-match.ts`.
Expected: function appears ACTIVE in `list_edge_functions`.

- [ ] **Step 3: Manual smoke invocation**

Read the current token, then POST once:
```bash
# token value comes from private.validate_job_tokens (read via MCP execute_sql)
curl -s -X POST "https://ujflcrjsiyhofnomurco.supabase.co/functions/v1/validate-venue-places" \
  -H "X-Validate-Token: <token>" -H "Content-Type: application/json" -d '{}'
```
Expected: `200 {"processed":N,"mismatches":M,"errors":E}` with `N > 0`.

- [ ] **Step 4: Confirm the cron now succeeds at the HTTP layer**

After the next `:37` firing, query via MCP `execute_sql`:
```sql
select status_code, left(content,80) as body, created
from net._http_response
where created > now() - interval '70 minutes'
  and extract(minute from created) between 37 and 39
order by created desc limit 4;
```
Expected: a `200 {"processed"...}` row for this function (no more `404 NOT_FOUND` from `validate-venue-places`).

- [ ] **Step 5: Spot-check the audit log + flag**

Run via MCP `execute_sql`:
```sql
select count(*) as logged,
       count(*) filter (where mismatch) as flagged
from public.venue_validation_log;
select count(*) as venues_flagged from public.venues where needs_address_review;
```
Expected: `logged > 0`; flagged/venues_flagged are plausible (often small).

- [ ] **Step 6: Push branch + open PR**

```bash
git push -u origin feat/validate-venue-places
gh pr create --base master --title "feat(validate): build validate-venue-places edge function" \
  --body "Implements the missing function the live validate-venue-places-hourly cron calls (404ing since 2026-06-13). Hourly batched Places-v1 address validation -> venue_validation_log + needs_address_review flag. Spec: docs/superpowers/specs/2026-06-15-validate-venue-places-design.md"
```

---

## Self-Review Notes

- **Spec coverage:** purpose (Tasks 2+3), `needs_address_review` migration (Task 1), env vars incl. `VALIDATE_MISMATCH_THRESHOLD` (Task 3 reads it), token auth (Task 3), batch oldest-first (Task 3 select), Places v1 fetch (Task 3), NOT_FOUND→flag / transient→skip (Task 3), `verify_jwt=false` config (Task 4), `{processed, mismatches}` return (Task 3 returns `{processed, mismatches, errors}` — superset, additive only), testing of the pure scorer (Task 2), post-deploy verification (Task 5). All covered.
- **Threshold semantics:** `addressMatchScore` (Task 2) is threshold-agnostic and returns the raw score; the function (Task 3) applies `VALIDATE_MISMATCH_THRESHOLD`. The Task 2 tests assert against the 0.7 default to lock the weighting math.
- **Name consistency:** `addressMatchScore` / `normalizeAddress` used identically in Tasks 2 and 3. Header `x-validate-token` matches the wrapper's `X-Validate-Token` (HTTP headers are case-insensitive). RPC `get_validate_job_token` matches the migration.
